import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";
import { Like } from "../src/models/Like.js";
import { ShareLink } from "../src/models/ShareLink.js";
import {
  toPostPreview,
  toPostDetail,
  toPostAuthorManagement,
} from "../src/utils/postProjections.js";

test("User Model — Évolution rétrocompatible (role et status)", async (t) => {
  await t.test("Définit les valeurs par défaut 'user' et 'active'", () => {
    const user = new User({
      name: "Alice Maker",
      email: "alice@example.com",
      password: "password123",
    });

    assert.equal(user.role, "user");
    assert.equal(user.status, "active");
  });

  await t.test("Accepte les rôles 'admin' et les statuts 'suspended'", () => {
    const admin = new User({
      name: "Admin User",
      email: "admin@example.com",
      password: "password123",
      role: "admin",
      status: "suspended",
    });

    assert.equal(admin.role, "admin");
    assert.equal(admin.status, "suspended");
  });

  await t.test("Rejette les valeurs de rôle et de statut non autorisées", async () => {
    const invalidUser = new User({
      name: "Hacker",
      email: "hacker@example.com",
      password: "password123",
      role: "superroot",
      status: "banned",
    });

    await assert.rejects(async () => invalidUser.validate(), (err) => {
      assert.ok(err.errors.role);
      assert.ok(err.errors.status);
      return true;
    });
  });

  await t.test("toPublic() expose role et status", () => {
    const user = new User({
      name: "Bob Maker",
      email: "bob@example.com",
      password: "password123",
      role: "admin",
      status: "active",
    });

    const pub = user.toPublic();
    assert.equal(pub.name, "Bob Maker");
    assert.equal(pub.email, "bob@example.com");
    assert.equal(pub.role, "admin");
    assert.equal(pub.status, "active");
    assert.equal(pub.passwordHash, undefined);
  });

  await t.test("Rétrocompatibilité des anciens comptes (y compris simulation lean())", () => {
    // Simule un document existant issu de MongoDB sans champs role ni status
    const legacyDoc = {
      _id: new mongoose.Types.ObjectId(),
      name: "Old User",
      email: "old@example.com",
      createdAt: new Date(),
    };

    // 1. Instanciation via Mongoose
    const hydrated = new User(legacyDoc);
    assert.equal(hydrated.role, "user");
    assert.equal(hydrated.status, "active");
    const publicData = hydrated.toPublic();
    assert.equal(publicData.role, "user");
    assert.equal(publicData.status, "active");

    // 2. Traitement d'un objet brut POJO lean()
    const roleWithFallback = legacyDoc.role || "user";
    const statusWithFallback = legacyDoc.status || "active";
    assert.equal(roleWithFallback, "user");
    assert.equal(statusWithFallback, "active");
  });
});

test("Post Model — Validation, quotas et index", async (t) => {
  const authorId = new mongoose.Types.ObjectId();

  await t.test("Valide un post conforme", async () => {
    const post = new Post({
      author: authorId,
      title: "Robot Lego Mindstorms autonome",
      shortDescription: "Tutoriel pas à pas pour assembler et programmer un robot suiveur de ligne.",
      content: "## Matériel\n- Briques Lego\n- Capteur optique\n## Assemblage...",
      category: "Lego",
      tags: ["lego", "robotique", "diy"],
      visibility: "public",
    });

    await post.validate();
    assert.equal(post.status, "draft");
    assert.equal(post.visibility, "public");
  });

  await t.test("Rejette les titres ou descriptions trop courts ou trop longs", async () => {
    const postTooShort = new Post({
      author: authorId,
      title: "ab", // < 3
      shortDescription: "Court", // < 10 (longueur 5)
      content: "Contenu",
      category: "Lego",
      tags: ["lego"],
    });

    await assert.rejects(async () => postTooShort.validate(), (err) => {
      assert.ok(err.errors.title);
      assert.ok(err.errors.shortDescription);
      return true;
    });
  });

  await t.test("Valide les catégories autorisées", async () => {
    const validCat = new Post({
      author: authorId,
      title: "Origami Grue",
      shortDescription: "Pliage d'une grue en papier japonais.",
      content: "Instructions de pliage",
      category: "Origami",
      tags: ["origami"],
    });
    await validCat.validate();

    const invalidCat = new Post({
      author: authorId,
      title: "Origami Grue",
      shortDescription: "Pliage d'une grue en papier japonais.",
      content: "Instructions de pliage",
      category: "Cuisine", // Invalide
      tags: ["origami"],
    });
    await assert.rejects(async () => invalidCat.validate(), (err) => {
      assert.ok(err.errors.category);
      return true;
    });
  });

  await t.test("Valide la contrainte de 1 à 10 tags et le format des tags", async () => {
    // 0 tags
    const zeroTags = new Post({
      author: authorId,
      title: "Projet sans tags",
      shortDescription: "Description suffisante du projet sans tags",
      content: "Contenu",
      category: "Papercraft",
      tags: [],
    });
    await assert.rejects(async () => zeroTags.validate());

    // > 10 tags
    const elevenTags = new Post({
      author: authorId,
      title: "Projet avec trop de tags",
      shortDescription: "Description suffisante du projet avec trop de tags",
      content: "Contenu",
      category: "Papercraft",
      tags: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11"],
    });
    await assert.rejects(async () => elevenTags.validate());

    // Format tag invalide (majuscules, espaces)
    const badFormat = new Post({
      author: authorId,
      title: "Projet tag mal formé",
      shortDescription: "Description suffisante du projet tag",
      content: "Contenu",
      category: "Papercraft",
      tags: ["Tag Majuscule!"],
    });
    await assert.rejects(async () => badFormat.validate());
  });

  await t.test("Valide les limites de pièces jointes (max 10 fichiers, max 50 Mo cumulés)", async () => {
    // 11 fichiers -> rejet
    const tooManyFiles = new Post({
      author: authorId,
      title: "Projet 11 fichiers",
      shortDescription: "Description suffisante pour le test de quota fichiers",
      content: "Contenu",
      category: "Modèles 3D",
      tags: ["3d"],
      attachments: Array.from({ length: 11 }, (_, i) => ({
        originalName: `file${i}.png`,
        storedName: `stored_${i}.png`,
        mimeType: "image/png",
        size: 1000,
        family: "image",
      })),
    });
    await assert.rejects(async () => tooManyFiles.validate());

    // Fichier dépassant le cumul de 50 Mo (52 Mo) -> rejet
    const tooHeavy = new Post({
      author: authorId,
      title: "Projet trop lourd",
      shortDescription: "Description suffisante pour le test de quota poids",
      content: "Contenu",
      category: "Musique",
      tags: ["musique"],
      attachments: [
        {
          originalName: "heavy.wav",
          storedName: "stored_heavy.wav",
          mimeType: "audio/wav",
          size: 52 * 1024 * 1024,
          family: "audio",
        },
      ],
    });
    await assert.rejects(async () => tooHeavy.validate());

    // 10 fichiers de 2 Mo chacun (20 Mo <= 50 Mo) -> valide
    const validAttachments = new Post({
      author: authorId,
      title: "Projet pièces jointes conformes",
      shortDescription: "Description suffisante pour le test valide de pièces jointes",
      content: "Contenu",
      category: "Lego",
      tags: ["lego"],
      attachments: Array.from({ length: 10 }, (_, i) => ({
        originalName: `file${i}.png`,
        storedName: `stored_${i}.png`,
        mimeType: "image/png",
        size: 2 * 1024 * 1024,
        family: "image",
      })),
    });
    await validAttachments.validate();
  });

  await t.test("Vérifie la définition des index ordinaires", () => {
    const indexes = Post.schema.indexes();
    const hasFeedIndex = indexes.some(
      ([idx]) => idx.status === 1 && idx.visibility === 1 && idx.publishedAt === -1,
    );
    const hasAuthorIndex = indexes.some(
      ([idx]) => idx.author === 1 && idx.status === 1 && idx.createdAt === -1,
    );
    const hasTagsIndex = indexes.some(([idx]) => idx.tags === 1);
    const hasCategoryIndex = indexes.some(([idx]) => idx.category === 1);

    assert.ok(hasFeedIndex, "Index composé flux catalogue présent");
    assert.ok(hasAuthorIndex, "Index composé espace auteur présent");
    assert.ok(hasTagsIndex, "Index tags présent");
    assert.ok(hasCategoryIndex, "Index category présent");
  });
});

test("Follow Model — Unicité et interdiction d'auto-follow", async (t) => {
  const user1 = new mongoose.Types.ObjectId();
  const user2 = new mongoose.Types.ObjectId();

  await t.test("Valide un follow entre deux utilisateurs distincts", async () => {
    const follow = new Follow({ followerId: user1, creatorId: user2 });
    await follow.validate();
  });

  await t.test("Interdit formellement l'auto-follow", async () => {
    const selfFollow = new Follow({ followerId: user1, creatorId: user1 });
    await assert.rejects(
      async () => selfFollow.validate(),
      /Un utilisateur ne peut pas se suivre lui-même/,
    );
  });

  await t.test("Vérifie la présence de l'index composé unique", () => {
    const indexes = Follow.schema.indexes();
    const uniqueIndex = indexes.find(
      ([idx, opts]) => idx.followerId === 1 && idx.creatorId === 1 && opts?.unique === true,
    );
    assert.ok(uniqueIndex, "Index unique (followerId, creatorId) présent");
  });
});

test("Subscription Model — Unicité, expiration et interdiction d'auto-abonnement", async (t) => {
  const subUser = new mongoose.Types.ObjectId();
  const creatorUser = new mongoose.Types.ObjectId();
  const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const past = new Date(Date.now() - 1000);

  await t.test("Valide un abonnement régulier", async () => {
    const sub = new Subscription({
      subscriberId: subUser,
      creatorId: creatorUser,
      expiresAt: future,
    });
    await sub.validate();
    assert.equal(sub.isValid(), true);
  });

  await t.test("Détecte un abonnement expiré via isValid()", () => {
    const sub = new Subscription({
      subscriberId: subUser,
      creatorId: creatorUser,
      expiresAt: past,
    });
    assert.equal(sub.isValid(), false);
  });

  await t.test("Interdit l'auto-abonnement", async () => {
    const selfSub = new Subscription({
      subscriberId: subUser,
      creatorId: subUser,
      expiresAt: future,
    });
    await assert.rejects(
      async () => selfSub.validate(),
      /Un utilisateur ne peut pas s'abonner à lui-même/,
    );
  });

  await t.test("Vérifie la contrainte d'unicité (subscriberId, creatorId)", () => {
    const indexes = Subscription.schema.indexes();
    const uniqueIndex = indexes.find(
      ([idx, opts]) => idx.subscriberId === 1 && idx.creatorId === 1 && opts?.unique === true,
    );
    assert.ok(uniqueIndex, "Index composé unique (subscriberId, creatorId) présent");
  });
});

test("Like Model — Unicité", () => {
  const indexes = Like.schema.indexes();
  const uniqueIndex = indexes.find(
    ([idx, opts]) => idx.userId === 1 && idx.postId === 1 && opts?.unique === true,
  );
  assert.ok(uniqueIndex, "Index unique (userId, postId) présent");
});

test("ShareLink Model — Secret brut, hachage SHA-256 et validité", async (t) => {
  const postId = new mongoose.Types.ObjectId();

  await t.test("Génération d'un secret brut de 64 caractères hex (32 octets)", () => {
    const token = ShareLink.generateRawToken();
    assert.equal(typeof token, "string");
    assert.equal(token.length, 64);
    assert.match(token, /^[0-9a-f]{64}$/);
  });

  await t.test("Hachage SHA-256 déterministe", () => {
    const raw = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const hash1 = ShareLink.hashToken(raw);
    const hash2 = ShareLink.hashToken(raw);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  await t.test("Validation et statut isValid()", () => {
    const raw = ShareLink.generateRawToken();
    const hash = ShareLink.hashToken(raw);

    const activeLink = new ShareLink({
      postId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    assert.equal(activeLink.isValid(), true);

    // Révoqué
    const revokedLink = new ShareLink({
      postId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      revoked: true,
      revokedAt: new Date(),
    });
    assert.equal(revokedLink.isValid(), false);

    // Expiré
    const expiredLink = new ShareLink({
      postId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() - 1000),
    });
    assert.equal(expiredLink.isValid(), false);
  });
});

test("Projections et DTOs MakerShare (postProjections.js)", async (t) => {
  const postId = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c4d501");
  const authorId = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c4d502");
  const attImageId = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c4d503");
  const attAudioId = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c4d504");

  const mockPost = {
    _id: postId,
    author: {
      _id: authorId,
      name: "Claire DIY",
    },
    title: "Support de Guitare en Lego",
    shortDescription: "Construction solide d'un support mural pour guitare électrique.",
    content: "## Étape 1 : Choisir les briques Technic...",
    category: "Lego",
    tags: ["lego", "guitare", "diy"],
    visibility: "followers",
    status: "published",
    attachments: [
      {
        _id: attImageId,
        originalName: "cover.jpg",
        storedName: "secret_disk_name_123.jpg",
        mimeType: "image/jpeg",
        size: 1048576,
        family: "image",
        isCover: true,
      },
      {
        _id: attAudioId,
        originalName: "audio_guide.mp3",
        storedName: "secret_disk_audio_456.mp3",
        mimeType: "audio/mpeg",
        size: 5242880,
        family: "audio",
      },
    ],
    publishedAt: new Date("2026-03-01T10:00:00.000Z"),
    createdAt: new Date("2026-02-28T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z"),
  };

  await t.test("toPostPreview — Exclut formellement content et storedName", () => {
    const preview = toPostPreview(mockPost, { isLocked: false, likesCount: 42 });

    assert.equal(preview.id, postId.toString());
    assert.equal(preview.author.id, authorId.toString());
    assert.equal(preview.author.name, "Claire DIY");
    assert.equal(preview.title, "Support de Guitare en Lego");
    assert.equal(preview.shortDescription, "Construction solide d'un support mural pour guitare électrique.");
    assert.equal(preview.likesCount, 42);
    assert.equal(preview.attachmentsCount, 2);
    assert.equal(preview.hasAudio, true);
    assert.equal(preview.coverUrl, `/api/posts/${postId}/attachments/${attImageId}`);
    assert.equal(preview.isLocked, false);

    // Vérification de sécurité absolue : fuites proscrites
    assert.equal(preview.content, undefined);
    assert.equal(preview.attachments, undefined);
    assert.equal(preview.storedName, undefined);
  });

  await t.test("toPostPreview — Masque la couverture (null) si isLocked: true", () => {
    const lockedPreview = toPostPreview(mockPost, { isLocked: true, likesCount: 42 });

    assert.equal(lockedPreview.isLocked, true);
    assert.equal(lockedPreview.coverUrl, null, "La coverUrl doit être null quand isLocked: true");
    assert.equal(lockedPreview.content, undefined);
  });

  await t.test("toPostDetail — Fournit content intégral et downloadUrls sécurisés sans storedName", () => {
    const detail = toPostDetail(mockPost, {
      likesCount: 42,
      userInteractions: {
        isLiked: true,
        isFollowingAuthor: true,
        isSubscribedToAuthor: false,
        subscriptionExpiresAt: null,
      },
    });

    assert.equal(detail.id, postId.toString());
    assert.equal(detail.content, "## Étape 1 : Choisir les briques Technic...");
    assert.equal(detail.likesCount, 42);
    assert.equal(detail.userInteractions.isLiked, true);
    assert.equal(detail.userInteractions.isFollowingAuthor, true);
    assert.equal(detail.attachments.length, 2);

    const firstAtt = detail.attachments[0];
    assert.equal(firstAtt.id, attImageId.toString());
    assert.equal(firstAtt.originalName, "cover.jpg");
    assert.equal(firstAtt.downloadUrl, `/api/posts/${postId}/attachments/${attImageId}`);
    assert.equal(firstAtt.storedName, undefined, "storedName interne ne doit jamais être exposé");
  });

  await t.test("toPostAuthorManagement — Ajoute shareLinkInfo sans exposer de secret brut", () => {
    const management = toPostAuthorManagement(mockPost, {
      likesCount: 42,
      shareLinkInfo: {
        hasLink: true,
        status: "active",
        expiresAt: "2026-03-08T10:00:00.000Z",
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    });

    assert.equal(management.id, postId.toString());
    assert.equal(management.shareLinkInfo.hasLink, true);
    assert.equal(management.shareLinkInfo.status, "active");
    assert.equal(management.shareLinkInfo.token, undefined);
    assert.equal(management.shareLinkInfo.tokenHash, undefined);
  });

  await t.test("toPostPreview — Règle stricte coverUrl (masquage si non public sans accès ou sans cover)", () => {
    // 1. Post followers sans option isLocked explicite -> auto-lock par sécurité et coverUrl null
    const lockedByDefault = toPostPreview(
      {
        ...mockPost,
        visibility: "followers",
      },
      { likesCount: 0 },
    );
    assert.equal(lockedByDefault.isLocked, true);
    assert.equal(lockedByDefault.coverUrl, null);

    // 2. Post public mais sans aucune pièce jointe cover/image -> coverUrl null
    const noCoverPost = toPostPreview(
      {
        ...mockPost,
        visibility: "public",
        attachments: [
          {
            _id: attAudioId,
            originalName: "audio.mp3",
            storedName: "audio.mp3",
            mimeType: "audio/mpeg",
            size: 1000,
            family: "audio",
          },
        ],
      },
      { likesCount: 0 },
    );
    assert.equal(noCoverPost.isLocked, false);
    assert.equal(noCoverPost.coverUrl, null);
  });

  await t.test("toPostPreview & toPostDetail — Règle likesCount (calcul obligatoire, rejet de tout fallback silencieux à 0)", () => {
    // Appel sans likesCount -> TypeError immédiat, pas de faux fallback
    assert.throws(() => toPostPreview(mockPost), /likesCount/);
    assert.throws(() => toPostDetail(mockPost), /likesCount/);

    // Post avec likesCount précalculé via agrégation MongoDB (raw.likesCount)
    const aggregatedPost = toPostPreview({ ...mockPost, likesCount: 15 });
    assert.equal(aggregatedPost.likesCount, 15);

    // Priorité à l'option explicite du contrôleur
    const overridePost = toPostPreview({ ...mockPost, likesCount: 15 }, { likesCount: 20 });
    assert.equal(overridePost.likesCount, 20);

    // Un post fraîchement créé avec 0 likes calculés est accepté explicitement
    const zeroLikesPost = toPostPreview(mockPost, { likesCount: 0 });
    assert.equal(zeroLikesPost.likesCount, 0);
  });
});

