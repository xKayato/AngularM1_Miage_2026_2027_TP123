import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Like } from "../src/models/Like.js";
import { Comment } from "../src/models/Comment.js";

let server, base;
const JWT_SECRET = "tp1-development-secret";

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

// Données d'utilisateurs de test
const authorId = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c40001");
const otherUserId = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c40002");
const suspendedUserId = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c40003");

const tokenAuthor = jwt.sign({ sub: authorId.toString(), email: "author@example.com" }, JWT_SECRET);
const tokenOther = jwt.sign({ sub: otherUserId.toString(), email: "other@example.com" }, JWT_SECRET);
const tokenSuspended = jwt.sign({ sub: suspendedUserId.toString(), email: "suspended@example.com" }, JWT_SECRET);
const tokenGhost = jwt.sign({ sub: new mongoose.Types.ObjectId().toString(), email: "ghost@example.com" }, JWT_SECRET);

// Registre mémoire isolé pour les tests sans toucher à MongoDB Atlas
let userStore = new Map();
let postStore = new Map();
let likeStore = [];

function resetMemoryStore() {
  userStore.clear();
  postStore.clear();
  likeStore = [];

  userStore.set(authorId.toString(), {
    _id: authorId,
    name: "Auteur Test",
    email: "author@example.com",
    role: "user",
    status: "active",
  });

  userStore.set(otherUserId.toString(), {
    _id: otherUserId,
    name: "Autre Utilisateur",
    email: "other@example.com",
    role: "user",
    status: "active",
  });

  userStore.set(suspendedUserId.toString(), {
    _id: suspendedUserId,
    name: "Compte Suspendu",
    email: "suspended@example.com",
    role: "user",
    status: "suspended",
  });
}

// Installation de mocks légers sur Mongoose pour isoler strictement les tests
const originalUserFindById = User.findById;
const originalPostFindById = Post.findById;
const originalPostFind = Post.find;
const originalPostCountDocuments = Post.countDocuments;
const originalPostPrototypeSave = Post.prototype.save;
const originalLikeCountDocuments = Like.countDocuments;
const originalLikeAggregate = Like.aggregate;
const originalCommentCountDocuments = Comment.countDocuments;
const originalCommentAggregate = Comment.aggregate;

test.beforeEach(() => {
  resetMemoryStore();

  User.findById = (id) => {
    const u = userStore.get(String(id));
    return Promise.resolve(u || null);
  };

  Like.countDocuments = (query) => {
    const count = likeStore.filter(
      (l) => String(l.postId) === String(query.postId)
    ).length;
    return Promise.resolve(count);
  };

  Like.aggregate = (pipeline) => {
    // Calcul groupé pour la liste paginée
    const postIds = pipeline[0]?.$match?.postId?.$in || [];
    const grouped = new Map();
    for (const l of likeStore) {
      if (postIds.map(String).includes(String(l.postId))) {
        grouped.set(String(l.postId), (grouped.get(String(l.postId)) || 0) + 1);
      }
    }
    const result = Array.from(grouped.entries()).map(([k, v]) => ({ _id: k, count: v }));
    return Promise.resolve(result);
  };

  Comment.countDocuments = () => Promise.resolve(0);
  Comment.aggregate = () => Promise.resolve([]);

  Post.prototype.save = function () {
    const raw = this.toObject();
    raw._id = raw._id || new mongoose.Types.ObjectId();
    raw.createdAt = raw.createdAt || new Date();
    raw.updatedAt = new Date();
    postStore.set(String(raw._id), raw);
    this._id = raw._id;
    this.createdAt = raw.createdAt;
    this.updatedAt = raw.updatedAt;
    return Promise.resolve(this);
  };

  Post.findById = (id) => {
    const p = postStore.get(String(id));
    if (!p) {
      return {
        populate: () => Promise.resolve(null),
        then: (resolve) => resolve(null),
      };
    }
    const doc = new Post(p);
    doc._id = p._id;
    doc.createdAt = p.createdAt;
    doc.updatedAt = p.updatedAt;
    return {
      populate: () => {
        const author = userStore.get(String(doc.author));
        doc.author = author ? { _id: author._id, name: author.name } : doc.author;
        return Promise.resolve(doc);
      },
      then: (resolve) => resolve(doc),
    };
  };

  Post.countDocuments = (filter) => {
    let count = 0;
    for (const p of postStore.values()) {
      if (filter.author && String(p.author) !== String(filter.author)) continue;
      if (filter.status && p.status !== filter.status) continue;
      count++;
    }
    return Promise.resolve(count);
  };

  Post.find = (filter) => {
    let list = [];
    for (const p of postStore.values()) {
      if (filter.author && String(p.author) !== String(filter.author)) continue;
      if (filter.status && p.status !== filter.status) continue;
      list.push(p);
    }

    return {
      sort: () => ({
        skip: (offset) => ({
          limit: (lim) => ({
            populate: () => {
              const sliced = list.slice(offset, offset + lim).map((raw) => {
                const doc = new Post(raw);
                doc._id = raw._id;
                doc.createdAt = raw.createdAt;
                doc.updatedAt = raw.updatedAt;
                const author = userStore.get(String(doc.author));
                doc.author = author ? { _id: author._id, name: author.name } : doc.author;
                return doc;
              });
              return Promise.resolve(sliced);
            },
          }),
        }),
      }),
    };
  };
});

test.after(() => {
  User.findById = originalUserFindById;
  Post.findById = originalPostFindById;
  Post.find = originalPostFind;
  Post.countDocuments = originalPostCountDocuments;
  Post.prototype.save = originalPostPrototypeSave;
  Like.countDocuments = originalLikeCountDocuments;
  Like.aggregate = originalLikeAggregate;
  Comment.countDocuments = originalCommentCountDocuments;
  Comment.aggregate = originalCommentAggregate;
});

test("Mission 2 — Authentification et contrôle des comptes", async (t) => {
  await t.test("Rejet 401 si aucun en-tête d'authentification", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });
    assert.equal(res.status, 401);
  });

  await t.test("Rejet 401 si utilisateur introuvable en base de données", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenGhost}`,
      },
      body: JSON.stringify({ title: "Test" }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.message, /introuvable/i);
  });

  await t.test("Rejet 403 si le compte utilisateur est suspendu", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSuspended}`,
      },
      body: JSON.stringify({
        title: "Titre valide",
        shortDescription: "Description courte suffisante",
        content: "Contenu complet",
        category: "Lego",
        tags: ["lego"],
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /suspendu/i);
  });
});

test("Mission 2 — Validation et normalisation des posts (POST & PUT)", async (t) => {
  await t.test("Refuse la création avec titre trop court (< 3 caractères)", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        title: "Ab",
        shortDescription: "Description courte suffisante",
        content: "Contenu suffisant",
        category: "Lego",
        tags: ["lego"],
      }),
    });
    assert.equal(res.status, 400);
  });

  await t.test("Refuse la création avec description courte trop courte (< 10 caractères)", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        title: "Titre valide",
        shortDescription: "Court",
        content: "Contenu suffisant",
        category: "Lego",
        tags: ["lego"],
      }),
    });
    assert.equal(res.status, 400);
  });

  await t.test("Refuse une catégorie invalide", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        title: "Titre valide",
        shortDescription: "Description courte suffisante",
        content: "Contenu suffisant",
        category: "Cuisine",
        tags: ["lego"],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Catégorie invalide/i);
  });

  await t.test("Refuse des tags au format invalide (majuscules, espaces)", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        title: "Titre valide",
        shortDescription: "Description courte suffisante",
        content: "Contenu suffisant",
        category: "Lego",
        tags: ["Tag Invalide!"],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Tag invalide/i);
  });

  await t.test("Refuse les doublons de tags après normalisation", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        title: "Titre valide",
        shortDescription: "Description courte suffisante",
        content: "Contenu suffisant",
        category: "Lego",
        tags: ["  Lego  ", "LEGO"],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Doublon de tags détecté/i);
  });

  await t.test("Interdit formellement l'injection de champs système (status, author, role, etc.)", async () => {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        title: "Titre valide",
        shortDescription: "Description courte suffisante",
        content: "Contenu suffisant",
        category: "Lego",
        tags: ["lego"],
        status: "published",
        role: "admin",
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /champ système/i);
  });
});

test("Mission 2 — Cycle de vie des posts, transitions et isolation auteur", async (t) => {
  async function createSampleDraft(token = tokenAuthor, overrides = {}) {
    const res = await fetch(`${base}/api/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Bras robotique en Lego",
        shortDescription: "Un bras mécanique piloté par servomoteurs.",
        content: "## Notice de montage détaillée...",
        category: "Lego",
        tags: ["lego-technic", "robotique"],
        ...overrides,
      }),
    });
    return { status: res.status, body: await res.json() };
  }

  await t.test("Création réussie d'un post en draft avec normalisation déterministe des tags", async () => {
    const { status, body: post } = await createSampleDraft(tokenAuthor, {
      tags: ["  LEGO-technic  ", "Robotique "],
    });

    assert.equal(status, 201);
    assert.ok(post.id);
    assert.equal(post.status, "draft");
    assert.equal(post.visibility, "public");
    assert.equal(post.publishedAt, null);
    assert.equal(post.likesCount, 0); // Calculé réel garanti
    assert.deepEqual(post.tags, ["lego-technic", "robotique"]);
    assert.equal(post.author.name, "Auteur Test");

    // Vérification de sécurité : aucune fuite de champs internes
    assert.equal(post.storedName, undefined);
    assert.equal(post.__v, undefined);
  });

  await t.test("Un tiers ne peut pas modifier le post d'autrui (403)", async () => {
    const { body: created } = await createSampleDraft(tokenAuthor);
    const res = await fetch(`${base}/api/posts/${created.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOther}`,
      },
      body: JSON.stringify({
        title: "Tentative d'altération par un tiers",
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /pas l'auteur/i);
  });

  await t.test("L'auteur peut modifier son propre draft", async () => {
    const { body: created } = await createSampleDraft(tokenAuthor);
    const res = await fetch(`${base}/api/posts/${created.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        title: "Bras robotique en Lego v2",
      }),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.title, "Bras robotique en Lego v2");
  });

  await t.test("Publication explicite par l'auteur avec choix de visibilité", async () => {
    const { body: created } = await createSampleDraft(tokenAuthor);
    const res = await fetch(`${base}/api/posts/${created.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({
        visibility: "followers",
      }),
    });
    assert.equal(res.status, 200);
    const pub = await res.json();
    assert.equal(pub.status, "published");
    assert.equal(pub.visibility, "followers");
    assert.ok(pub.publishedAt);
  });

  await t.test("Un tiers ne peut pas dépublier le post d'autrui (403)", async () => {
    const { body: created } = await createSampleDraft(tokenAuthor);
    // On publie d'abord
    await fetch(`${base}/api/posts/${created.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({ visibility: "public" }),
    });

    const res = await fetch(`${base}/api/posts/${created.id}/unpublish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenOther}`,
      },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /pas l'auteur/i);
  });

  await t.test("L'auteur peut repasser son post publié en brouillon (unpublish)", async () => {
    const { body: created } = await createSampleDraft(tokenAuthor);
    await fetch(`${base}/api/posts/${created.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({ visibility: "public" }),
    });

    const res = await fetch(`${base}/api/posts/${created.id}/unpublish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAuthor}`,
      },
    });
    assert.equal(res.status, 200);
    const unpub = await res.json();
    assert.equal(unpub.status, "draft");
  });

  await t.test("Interdiction formelle de modifier, publier ou dépublier un post archivé", async () => {
    const { body: created } = await createSampleDraft(tokenAuthor);
    // On simule l'archivage du post par modération
    const rawPost = postStore.get(String(created.id));
    rawPost.status = "archived";
    rawPost.archivedAt = new Date();

    // 1. Tentative de modification -> 400
    const editRes = await fetch(`${base}/api/posts/${created.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({ title: "Contournement modération" }),
    });
    assert.equal(editRes.status, 400);
    const editBody = await editRes.json();
    assert.match(editBody.message, /archivé/i);

    // 2. Tentative de publication -> 400
    const pubRes = await fetch(`${base}/api/posts/${created.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAuthor}`,
      },
      body: JSON.stringify({ visibility: "public" }),
    });
    assert.equal(pubRes.status, 400);
    const pubBody = await pubRes.json();
    assert.match(pubBody.message, /archivé/i);

    // 3. Tentative de dépublication -> 400
    const unpubRes = await fetch(`${base}/api/posts/${created.id}/unpublish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAuthor}`,
      },
    });
    assert.equal(unpubRes.status, 400);
    const unpubBody = await unpubRes.json();
    assert.match(unpubBody.message, /archivé/i);
  });
});

test("Mission 2 — Consultation des brouillons (GET /api/posts/my)", async (t) => {
  await t.test("Retourne la liste paginée de ses propres posts avec calcul exact des likes", async () => {
    // Création de 2 posts pour l'auteur
    const post1 = {
      _id: new mongoose.Types.ObjectId(),
      author: authorId,
      title: "Projet Brouillon 1",
      shortDescription: "Description courte du projet 1",
      content: "Contenu du projet 1",
      category: "Papercraft",
      tags: ["paper"],
      status: "draft",
      visibility: "public",
      attachments: [],
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    };
    const post2 = {
      _id: new mongoose.Types.ObjectId(),
      author: authorId,
      title: "Projet Publié 2",
      shortDescription: "Description courte du projet 2",
      content: "Contenu du projet 2",
      category: "Origami",
      tags: ["origami"],
      status: "published",
      visibility: "public",
      attachments: [],
      createdAt: new Date("2026-03-02T10:00:00.000Z"),
    };
    // Post d'un autre auteur qui ne doit PAS apparaître
    const postOther = {
      _id: new mongoose.Types.ObjectId(),
      author: otherUserId,
      title: "Projet de l'autre",
      shortDescription: "Description autre",
      content: "Contenu autre",
      category: "Musique",
      tags: ["musique"],
      status: "draft",
      visibility: "public",
      attachments: [],
      createdAt: new Date("2026-03-03T10:00:00.000Z"),
    };

    postStore.set(String(post1._id), post1);
    postStore.set(String(post2._id), post2);
    postStore.set(String(postOther._id), postOther);

    // Ajout de 3 likes réels sur post2
    likeStore.push({ postId: post2._id, userId: otherUserId });
    likeStore.push({ postId: post2._id, userId: new mongoose.Types.ObjectId() });
    likeStore.push({ postId: post2._id, userId: new mongoose.Types.ObjectId() });

    const res = await fetch(`${base}/api/posts/my?status=all`, {
      headers: {
        Authorization: `Bearer ${tokenAuthor}`,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.totalDocs, 2);
    assert.equal(data.docs.length, 2);
    assert.equal(data.docs.some((p) => p.title === "Projet de l'autre"), false);

    const doc2 = data.docs.find((p) => p.id === String(post2._id));
    assert.equal(doc2.likesCount, 3); // Likes réellement comptés !

    const doc1 = data.docs.find((p) => p.id === String(post1._id));
    assert.equal(doc1.likesCount, 0);
  });

  await t.test("Filtre proprement par statut status=draft", async () => {
    const res = await fetch(`${base}/api/posts/my?status=draft`, {
      headers: {
        Authorization: `Bearer ${tokenAuthor}`,
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.docs.every((p) => p.status === "draft"));
  });
});
