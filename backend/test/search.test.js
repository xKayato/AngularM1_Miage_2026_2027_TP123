import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Like } from "../src/models/Like.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
  await Post.syncIndexes();
  await Like.syncIndexes();
  await Follow.syncIndexes();
  await Subscription.syncIndexes();

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

let userSeq = 0;
async function createUser(role = "user", status = "active") {
  userSeq++;
  const user = await User.create({
    name: `Search User ${userSeq}`,
    email: `search_${userSeq}_${Date.now()}@test.com`,
    passwordHash: "hash123",
    role,
    status,
  });
  const token = jwt.sign({ sub: String(user._id), email: user.email }, JWT_SECRET);
  return { user, token };
}

async function createPost(authorId, options = {}) {
  return await Post.create({
    author: authorId,
    title: options.title || "Titre de test pour recherche",
    shortDescription: options.shortDescription || "Description courte de test pour recherche",
    content: options.content || "Contenu confidentiel du post qui ne doit jamais fuiter",
    category: options.category || "Lego",
    tags: options.tags || ["test"],
    visibility: options.visibility || "public",
    status: options.status || "published",
    publishedAt: options.publishedAt || new Date(),
    attachments: options.attachments || [],
  });
}

test("Mission 7 — Validation stricte des paramètres invalides (400 Bad Request)", async (t) => {
  await t.test("Rejette page < 1 (400)", async () => {
    const res = await fetch(`${base}/api/posts?page=0`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /page/i);
  });

  await t.test("Rejette page non numérique (400)", async () => {
    const res = await fetch(`${base}/api/posts?page=invalid`);
    assert.equal(res.status, 400);
  });

  await t.test("Rejette limit < 1 ou limit > 20 (400)", async () => {
    const resLow = await fetch(`${base}/api/posts?limit=0`);
    assert.equal(resLow.status, 400);
    const bodyLow = await resLow.json();
    assert.match(bodyLow.message, /compris entre 1 et 20/i);

    const resHigh = await fetch(`${base}/api/posts?limit=21`);
    assert.equal(resHigh.status, 400);
    const bodyHigh = await resHigh.json();
    assert.match(bodyHigh.message, /compris entre 1 et 20/i);

    // limit=20 est accepté aux bornes
    const resExact = await fetch(`${base}/api/posts?limit=20`);
    assert.equal(resExact.status, 200);
    const dataExact = await resExact.json();
    assert.equal(dataExact.limit, 20);

    // Omission de limit utilise le défaut 10
    const resDefault = await fetch(`${base}/api/posts`);
    assert.equal(resDefault.status, 200);
    const dataDefault = await resDefault.json();
    assert.equal(dataDefault.limit, 10);
  });

  await t.test("Rejette une catégorie invalide (400)", async () => {
    const res = await fetch(`${base}/api/posts?category=Cuisine`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /catégorie/i);
  });

  await t.test("Rejette des tags contenant des caractères interdits (400)", async () => {
    const res = await fetch(`${base}/api/posts?tags=Tag%20Invalide!`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /tag/i);
  });

  await t.test("Rejette une requête textuelle supérieure à 150 caractères (400)", async () => {
    const longQuery = "a".repeat(151);
    const res = await fetch(`${base}/api/posts?query=${longQuery}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /150/i);
  });
});

test("Mission 7 — Pagination et calcul totalDocs via pipeline $facet", async () => {
  const { user: author } = await createUser();

  // Création de 5 posts publiés
  for (let i = 1; i <= 5; i++) {
    await createPost(author._id, {
      title: `Projet Pagination Maker ${i}`,
      category: "Lego",
      tags: ["pagination-test"],
    });
  }

  // Page 1 avec limit=2
  const res1 = await fetch(`${base}/api/posts?tags=pagination-test&page=1&limit=2`);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.docs.length, 2);
  assert.equal(data1.totalDocs, 5);
  assert.equal(data1.totalPages, 3);
  assert.equal(data1.page, 1);
  assert.equal(data1.hasPrevPage, false);
  assert.equal(data1.hasNextPage, true);
  assert.equal(data1.prevPage, null);
  assert.equal(data1.nextPage, 2);

  // Page 2 avec limit=2
  const res2 = await fetch(`${base}/api/posts?tags=pagination-test&page=2&limit=2`);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.docs.length, 2);
  assert.equal(data2.page, 2);
  assert.equal(data2.hasPrevPage, true);
  assert.equal(data2.hasNextPage, true);
  assert.equal(data2.prevPage, 1);
  assert.equal(data2.nextPage, 3);

  // Page 3 avec limit=2 (dernière page)
  const res3 = await fetch(`${base}/api/posts?tags=pagination-test&page=3&limit=2`);
  assert.equal(res3.status, 200);
  const data3 = await res3.json();
  assert.equal(data3.docs.length, 1);
  assert.equal(data3.page, 3);
  assert.equal(data3.hasPrevPage, true);
  assert.equal(data3.hasNextPage, false);
  assert.equal(data3.nextPage, null);
});

test("Mission 7 — Règle « tous les tags demandés » ($all) et normalisation", async () => {
  const { user: author } = await createUser();

  await createPost(author._id, {
    title: "Avion en papier pliable",
    category: "Papercraft",
    tags: ["avion", "papercraft", "volant"],
  });

  await createPost(author._id, {
    title: "Grue traditionnelle japonaise",
    category: "Origami",
    tags: ["origami", "japon", "volant"],
  });

  await createPost(author._id, {
    title: "Bateau en papier",
    category: "Papercraft",
    tags: ["papercraft", "marin"],
  });

  // 1. Tag unique
  const resSingle = await fetch(`${base}/api/posts?tags=avion`);
  const dataSingle = await resSingle.json();
  assert.equal(dataSingle.totalDocs, 1);
  assert.equal(dataSingle.docs[0].title, "Avion en papier pliable");

  // 2. Deux tags demandés avec virgule : ["avion", "papercraft"]
  const resAllComma = await fetch(`${base}/api/posts?tags=avion,papercraft`);
  const dataAllComma = await resAllComma.json();
  assert.equal(dataAllComma.totalDocs, 1);
  assert.equal(dataAllComma.docs[0].title, "Avion en papier pliable");

  // 3. Deux tags demandés avec paramètres multiples : ?tags=avion&tags=papercraft
  const resAllMulti = await fetch(`${base}/api/posts?tags=avion&tags=papercraft`);
  const dataAllMulti = await resAllMulti.json();
  assert.equal(dataAllMulti.totalDocs, 1);
  assert.equal(dataAllMulti.docs[0].title, "Avion en papier pliable");

  // 4. Deux tags sans correspondance commune : avion ET marin -> 0 résultat
  const resNoMatch = await fetch(`${base}/api/posts?tags=avion,marin`);
  const dataNoMatch = await resNoMatch.json();
  assert.equal(dataNoMatch.totalDocs, 0);
  assert.equal(dataNoMatch.docs.length, 0);

  // 5. Tag avec majuscules et espaces (normalisation)
  const resNorm = await fetch(`${base}/api/posts?tags=+AVION+`);
  const dataNorm = await resNorm.json();
  assert.equal(dataNorm.totalDocs, 1);
});

test("Mission 7 — Combinaisons texte, catégorie et tags", async () => {
  const { user: author } = await createUser();

  await createPost(author._id, {
    title: "Faucon Millenium Lego Star Wars",
    shortDescription: "Vaisseau spatial avec tourelles laser",
    category: "Lego",
    tags: ["star-wars", "vaisseau", "spatial"],
  });

  await createPost(author._id, {
    title: "X-Wing Lego Star Wars",
    shortDescription: "Chasseur stellaire avec ailes déployables",
    category: "Lego",
    tags: ["star-wars", "chasseur"],
  });

  await createPost(author._id, {
    title: "Vaisseau Papercraft Star Wars",
    shortDescription: "Maquette en papier du chasseur spatial",
    category: "Papercraft",
    tags: ["star-wars", "vaisseau"],
  });

  // Filtre combiné : query="faucon" + category="Lego" + tags="star-wars,vaisseau"
  const res = await fetch(
    `${base}/api/posts?query=faucon&category=Lego&tags=star-wars,vaisseau`
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.totalDocs, 1);
  assert.equal(data.docs[0].title, "Faucon Millenium Lego Star Wars");
  assert.equal(data.docs[0].category, "Lego");
});

test("Mission 7 — Sécurité : Exclusion absolue des drafts, link, archivés et auteurs suspendus", async () => {
  const { user: activeAuthor } = await createUser("user", "active");
  const { user: suspendedAuthor } = await createUser("user", "suspended");

  const filterTag = `sec-${Date.now()}`;

  // 1. Post publié normal (doit être visible)
  await createPost(activeAuthor._id, {
    title: "Post Publié Valide",
    category: "Lego",
    tags: [filterTag],
    status: "published",
    visibility: "public",
  });

  // 2. Post brouillon (doit être exclu)
  await createPost(activeAuthor._id, {
    title: "Post Brouillon Secret",
    category: "Lego",
    tags: [filterTag],
    status: "draft",
    visibility: "public",
  });

  // 3. Post avec visibilité 'link' (doit être exclu du catalogue)
  await createPost(activeAuthor._id, {
    title: "Post Visibilité Link Non Répertorié",
    category: "Lego",
    tags: [filterTag],
    status: "published",
    visibility: "link",
  });

  // 4. Post archivé (doit être exclu du catalogue)
  await createPost(activeAuthor._id, {
    title: "Post Archivé Retiré",
    category: "Lego",
    tags: [filterTag],
    status: "archived",
    visibility: "public",
  });

  // 5. Post d'un auteur suspendu (doit être exclu du catalogue)
  await createPost(suspendedAuthor._id, {
    title: "Post d'un Auteur Suspendu",
    category: "Lego",
    tags: [filterTag],
    status: "published",
    visibility: "public",
  });

  const res = await fetch(`${base}/api/posts?tags=${filterTag}`);
  assert.equal(res.status, 200);
  const data = await res.json();

  // Seul le post 1 doit être retourné
  assert.equal(data.totalDocs, 1);
  assert.equal(data.docs.length, 1);
  assert.equal(data.docs[0].title, "Post Publié Valide");
});

test("Mission 7 — Projection stricte PostPreview sans fuite de contenu ou secret", async () => {
  const { user: author } = await createUser();

  const secretContent = "Contenu ultra confidentiel, code source secret";
  const post = await createPost(author._id, {
    title: "Post pour Contrôle de Projection",
    shortDescription: "Description publique",
    content: secretContent,
    category: "Musique",
    tags: ["projection-test"],
    attachments: [
      {
        originalName: "cover.jpg",
        storedName: "secret_file_on_disk.jpg",
        mimeType: "image/jpeg",
        size: 1024,
        family: "image",
        isCover: true,
      },
    ],
  });

  // Like du post pour tester le compteur dynamique
  const { user: liker } = await createUser();
  await Like.create({ userId: liker._id, postId: post._id });

  const res = await fetch(`${base}/api/posts?tags=projection-test`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.docs.length, 1);

  const preview = data.docs[0];
  // 1. Champs sensibles absents
  assert.equal(preview.content, undefined);
  assert.equal(preview.storedName, undefined);
  assert.equal(preview.attachments, undefined);

  // 2. Champs conformes PostPreview
  assert.equal(preview.id, String(post._id));
  assert.equal(preview.title, "Post pour Contrôle de Projection");
  assert.equal(preview.shortDescription, "Description publique");
  assert.equal(preview.category, "Musique");
  assert.deepEqual(preview.tags, ["projection-test"]);
  assert.equal(preview.visibility, "public");
  assert.equal(preview.isLocked, false);
  assert.equal(preview.likesCount, 1);
  assert.equal(preview.attachmentsCount, 1);
  assert.equal(preview.author.name, author.name);
  assert.match(preview.coverUrl, new RegExp(`/api/posts/${post._id}/attachments/`));
});

test("Mode Suggestion (mode=suggest) — Validation stricte des paramètres", async (t) => {
  await t.test("Rejette un mode inconnu (400)", async () => {
    const res = await fetch(`${base}/api/posts?mode=inconnu&query=test`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /mode doit valoir 'suggest'/i);
  });

  await t.test("Rejette mode=suggest sans paramètre query (400)", async () => {
    const res = await fetch(`${base}/api/posts?mode=suggest`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /paramètre query est obligatoire/i);
  });

  await t.test("Rejette mode=suggest avec query vide après trim (400)", async () => {
    const res = await fetch(`${base}/api/posts?mode=suggest&query=%20%20`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /paramètre query est obligatoire/i);
  });

  await t.test("Rejette mode=suggest avec limit > 5 (400)", async () => {
    const res = await fetch(`${base}/api/posts?mode=suggest&query=test&limit=6`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /limit doit être un entier compris entre 1 et 5/i);
  });

  await t.test("Accepte mode=suggest avec limit=5 (200)", async () => {
    const res = await fetch(`${base}/api/posts?mode=suggest&query=test&limit=5`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.limit, 5);
  });

  await t.test("Applique le défaut limit=5 si limit est omis en mode suggest", async () => {
    const res = await fetch(`${base}/api/posts?mode=suggest&query=test`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.limit, 5);
  });
});

test("Mode Suggestion — Autocomplétion par préfixe insensible à la casse dès 1 caractère", async () => {
  const { user: author } = await createUser();
  const uniqueTag = `suggest-${Date.now()}`;

  await createPost(author._id, {
    title: "Test origami",
    shortDescription: "Description tutoriel origami facile",
    category: "Origami",
    tags: [uniqueTag],
    status: "published",
    visibility: "public",
  });

  // 1. Frappe d'une seule lettre majuscule "T"
  const res1 = await fetch(`${base}/api/posts?mode=suggest&query=T&tags=${uniqueTag}`);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.docs.length, 1);
  assert.equal(data1.docs[0].title, "Test origami");

  // 2. Frappe de 2 lettres minuscules "te"
  const res2 = await fetch(`${base}/api/posts?mode=suggest&query=te&tags=${uniqueTag}`);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.docs.length, 1);
  assert.equal(data2.docs[0].title, "Test origami");

  // 3. Frappe de 3 lettres "tes"
  const res3 = await fetch(`${base}/api/posts?mode=suggest&query=tes&tags=${uniqueTag}`);
  assert.equal(res3.status, 200);
  const data3 = await res3.json();
  assert.equal(data3.docs.length, 1);
  assert.equal(data3.docs[0].title, "Test origami");

  // 4. Frappe complète "test"
  const res4 = await fetch(`${base}/api/posts?mode=suggest&query=test&tags=${uniqueTag}`);
  assert.equal(res4.status, 200);
  const data4 = await res4.json();
  assert.equal(data4.docs.length, 1);
  assert.equal(data4.docs[0].title, "Test origami");

  // 5. Frappe du mot secondaire "origami"
  const res5 = await fetch(`${base}/api/posts?mode=suggest&query=origami&tags=${uniqueTag}`);
  assert.equal(res5.status, 200);
  const data5 = await res5.json();
  assert.equal(data5.docs.length, 1);
  assert.equal(data5.docs[0].title, "Test origami");
});

test("Mode Suggestion — Sécurité stricte : exclusion des drafts, visibilité link et comptes suspendus", async () => {
  const { user: activeAuthor } = await createUser("user", "active");
  const { user: suspendedAuthor } = await createUser("user", "suspended");
  const secTag = `suggest-sec-${Date.now()}`;

  // Public actif -> visible
  await createPost(activeAuthor._id, {
    title: "Test création publique",
    category: "Lego",
    tags: [secTag],
    status: "published",
    visibility: "public",
  });

  // Draft actif -> exclu
  await createPost(activeAuthor._id, {
    title: "Test brouillon privé",
    category: "Lego",
    tags: [secTag],
    status: "draft",
    visibility: "public",
  });

  // Link actif -> exclu
  await createPost(activeAuthor._id, {
    title: "Test partage par lien",
    category: "Lego",
    tags: [secTag],
    status: "published",
    visibility: "link",
  });

  // Suspendu -> exclu
  await createPost(suspendedAuthor._id, {
    title: "Test auteur suspendu",
    category: "Lego",
    tags: [secTag],
    status: "published",
    visibility: "public",
  });

  const res = await fetch(`${base}/api/posts?mode=suggest&query=Test&tags=${secTag}`);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.totalDocs, 1);
  assert.equal(data.docs.length, 1);
  assert.equal(data.docs[0].title, "Test création publique");
});

test("Mission 5 — Validation et tris déterministes (date, likes, pertinence)", async (t) => {
  const { user: author } = await createUser();
  const sortTag = `sort-test-${Date.now()}`;

  const postOld = await createPost(author._id, {
    title: "Ancien Projet",
    category: "Lego",
    tags: [sortTag],
    publishedAt: new Date("2026-01-01T10:00:00Z"),
  });

  const postMid = await createPost(author._id, {
    title: "Moyen Projet",
    category: "Lego",
    tags: [sortTag],
    publishedAt: new Date("2026-06-01T10:00:00Z"),
  });

  const postNew = await createPost(author._id, {
    title: "Nouveau Projet",
    category: "Lego",
    tags: [sortTag],
    publishedAt: new Date("2026-10-01T10:00:00Z"),
  });

  // Ajout de likes : postOld -> 5 likes, postMid -> 1 like, postNew -> 0 like
  const { user: user1 } = await createUser();
  const { user: user2 } = await createUser();
  const { user: user3 } = await createUser();
  const { user: user4 } = await createUser();
  const { user: user5 } = await createUser();

  await Like.create({ userId: user1._id, postId: postOld._id });
  await Like.create({ userId: user2._id, postId: postOld._id });
  await Like.create({ userId: user3._id, postId: postOld._id });
  await Like.create({ userId: user4._id, postId: postOld._id });
  await Like.create({ userId: user5._id, postId: postOld._id });

  await Like.create({ userId: user1._id, postId: postMid._id });

  await t.test("Rejette un critère de tri invalide (400)", async () => {
    const res = await fetch(`${base}/api/posts?sort=invalide`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /critère de tri invalide/i);
  });

  await t.test("Tri par date décroissante (date-desc) par défaut", async () => {
    const res = await fetch(`${base}/api/posts?tags=${sortTag}&sort=date-desc`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.docs.length, 3);
    assert.equal(data.docs[0].title, "Nouveau Projet");
    assert.equal(data.docs[1].title, "Moyen Projet");
    assert.equal(data.docs[2].title, "Ancien Projet");
    // Vérification de la présence de la date ISO
    assert.equal(data.docs[0].publishedAt, "2026-10-01T10:00:00.000Z");
  });

  await t.test("Tri par date croissante (date-asc)", async () => {
    const res = await fetch(`${base}/api/posts?tags=${sortTag}&sort=date-asc`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.docs.length, 3);
    assert.equal(data.docs[0].title, "Ancien Projet");
    assert.equal(data.docs[1].title, "Moyen Projet");
    assert.equal(data.docs[2].title, "Nouveau Projet");
  });

  await t.test("Tri par likes décroissants (likes-desc) calculé en base avec pagination", async () => {
    // Page 1 avec limit=2 : postOld (5 likes) puis postMid (1 like)
    const resPage1 = await fetch(`${base}/api/posts?tags=${sortTag}&sort=likes-desc&page=1&limit=2`);
    assert.equal(resPage1.status, 200);
    const data1 = await resPage1.json();
    assert.equal(data1.totalDocs, 3);
    assert.equal(data1.totalPages, 2);
    assert.equal(data1.docs.length, 2);
    assert.equal(data1.docs[0].title, "Ancien Projet");
    assert.equal(data1.docs[0].likesCount, 5);
    assert.equal(data1.docs[1].title, "Moyen Projet");
    assert.equal(data1.docs[1].likesCount, 1);

    // Page 2 avec limit=2 : postNew (0 like)
    const resPage2 = await fetch(`${base}/api/posts?tags=${sortTag}&sort=likes-desc&page=2&limit=2`);
    assert.equal(resPage2.status, 200);
    const data2 = await resPage2.json();
    assert.equal(data2.docs.length, 1);
    assert.equal(data2.docs[0].title, "Nouveau Projet");
    assert.equal(data2.docs[0].likesCount, 0);
  });
});

test("Mission 5 — Recherche avec syntaxe #tag dans le champ query", async (t) => {
  const { user: author } = await createUser();
  const baseTag = `ms5-${Date.now()}`;

  await createPost(author._id, {
    title: "Château médiéval fortifié",
    shortDescription: "Tours de garde et pont-levis fonctionnel",
    category: "Lego",
    tags: [baseTag, "medieval", "chateau"],
  });

  await createPost(author._id, {
    title: "Vaisseau spatial furtif",
    shortDescription: "Chasseur stellaire rapide",
    category: "Lego",
    tags: [baseTag, "spatial", "chateau"],
  });

  await createPost(author._id, {
    title: "Château spatial en origami",
    shortDescription: "Pliage géant",
    category: "Origami",
    tags: [baseTag, "chateau", "origami"],
  });

  await t.test("Recherche composée uniquement de #tags : extrait et applique le filtre $all", async () => {
    const res = await fetch(`${base}/api/posts?query=%23${baseTag}%20%23medieval`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalDocs, 1);
    assert.equal(data.docs[0].title, "Château médiéval fortifié");
  });

  await t.test("Recherche mixte texte + #tag : extrait le tag et recherche le texte nettoyé", async () => {
    // Texte "spatial" + tag #chateau + tag #baseTag
    const res = await fetch(`${base}/api/posts?query=spatial%20%23${baseTag}%20%23chateau`);
    assert.equal(res.status, 200);
    const data = await res.json();
    // Doit matcher "Vaisseau spatial furtif" et "Château spatial en origami"
    assert.equal(data.totalDocs, 2);
    const titles = data.docs.map((d) => d.title);
    assert.ok(titles.includes("Vaisseau spatial furtif"));
    assert.ok(titles.includes("Château spatial en origami"));
  });

  await t.test("Fusion et dédoublonnage de #tag inline avec le paramètre tags existant", async () => {
    const res = await fetch(`${base}/api/posts?query=%23medieval&tags=${baseTag},medieval`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalDocs, 1);
    assert.equal(data.docs[0].title, "Château médiéval fortifié");
  });
});

test("Mission 7 — Affichage des avatars auteurs sur les cartes et étanchéité des données", async (t) => {
  const { user: authorWithAvatar } = await createUser();
  authorWithAvatar.avatar = {
    storedName: "author_photo.jpg",
    mimeType: "image/jpeg",
    size: 2048,
  };
  await authorWithAvatar.save();

  const { user: authorWithoutAvatar } = await createUser();

  const postWithAvatar = await createPost(authorWithAvatar._id, {
    title: "Projet avec avatar réel",
    tags: ["avatar-real-test"],
  });

  const postNoAvatar = await createPost(authorWithoutAvatar._id, {
    title: "Projet sans avatar",
    tags: ["avatar-none-test"],
  });

  await t.test("GET /api/posts projette hasAvatar et avatarUrl sur chaque carte sans fuite privée", async () => {
    const res = await fetch(`${base}/api/posts?tags=avatar-real-test`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalDocs, 1);

    const card = data.docs[0];
    assert.equal(card.author.id, String(authorWithAvatar._id));
    assert.equal(card.author.name, authorWithAvatar.name);
    assert.equal(card.author.hasAvatar, true);
    assert.equal(card.author.avatarUrl, `/api/users/${authorWithAvatar._id}/avatar`);

    // Sécurité stricte : aucune fuite d'email, rôle ou secret
    assert.equal(card.author.email, undefined);
    assert.equal(card.author.role, undefined);
    assert.equal(card.author.password, undefined);
    assert.equal(card.author.passwordHash, undefined);
  });

  await t.test("GET /api/posts gère proprement l'absence d'avatar (hasAvatar: false, avatarUrl: null)", async () => {
    const res = await fetch(`${base}/api/posts?tags=avatar-none-test`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalDocs, 1);

    const card = data.docs[0];
    assert.equal(card.author.hasAvatar, false);
    assert.equal(card.author.avatarUrl, null);
    assert.equal(card.author.email, undefined);
  });

  await t.test("GET /api/posts/:id projette également l'avatar sans fuite de champs privés", async () => {
    const res = await fetch(`${base}/api/posts/${postWithAvatar._id}`);
    assert.equal(res.status, 200);
    const detail = await res.json();

    assert.equal(detail.author.hasAvatar, true);
    assert.equal(detail.author.avatarUrl, `/api/users/${authorWithAvatar._id}/avatar`);
    assert.equal(detail.author.email, undefined);
    assert.equal(detail.author.role, undefined);
  });
});



