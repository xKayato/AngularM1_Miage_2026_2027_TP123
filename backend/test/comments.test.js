import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Comment } from "../src/models/Comment.js";
import { ShareLink } from "../src/models/ShareLink.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

function makeToken(user) {
  return jwt.sign(
    { sub: user.id || String(user._id), email: user.email, role: user.role || "user" },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
  await Post.syncIndexes();
  await Comment.syncIndexes();
  await ShareLink.syncIndexes();

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test.describe("Mission 4 — Commentaires Sécurisés (/api/posts/:id/comments)", () => {
  async function createUsersAndPost(postOverrides = {}) {
    const author = await User.create({
      name: "Author Comment",
      email: `author_${Date.now()}_${Math.random()}@test.com`,
      password: "password123",
      role: "user",
      status: "active",
    });
    const authorToken = makeToken(author);

    const commenter = await User.create({
      name: "Jean Commentateur",
      email: `commenter_${Date.now()}_${Math.random()}@test.com`,
      password: "password123",
      role: "user",
      status: "active",
    });
    const commenterToken = makeToken(commenter);

    const stranger = await User.create({
      name: "Stranger User",
      email: `stranger_${Date.now()}_${Math.random()}@test.com`,
      password: "password123",
      role: "user",
      status: "active",
    });
    const strangerToken = makeToken(stranger);

    const admin = await User.create({
      name: "Admin Modérateur",
      email: `admin_${Date.now()}_${Math.random()}@test.com`,
      password: "password123",
      role: "admin",
      status: "active",
    });
    const adminToken = makeToken(admin);

    const suspendedUser = await User.create({
      name: "Suspended BadUser",
      email: `suspended_${Date.now()}_${Math.random()}@test.com`,
      password: "password123",
      role: "user",
      status: "suspended",
    });
    const suspendedToken = makeToken(suspendedUser);

    const post = await Post.create({
      title: "Projet pour Commentaires",
      shortDescription: "Description courte du tutoriel pour commentaires",
      content: "Contenu complet du tutoriel de test pour commentaires sécurisés.",
      category: "Lego",
      tags: ["lego", "commentaires"],
      author: author._id,
      status: "published",
      visibility: "public",
      publishedAt: new Date(),
      attachments: [
        {
          originalName: "guide-secret.pdf",
          storedName: "secret-stored.pdf",
          mimeType: "application/pdf",
          size: 1024,
          family: "pdf",
        },
      ],
      ...postOverrides,
    });

    return {
      author,
      authorToken,
      commenter,
      commenterToken,
      stranger,
      strangerToken,
      admin,
      adminToken,
      suspendedUser,
      suspendedToken,
      post,
    };
  }

  test("Lecture des commentaires sur un post public : anonyme autorisé (200)", async () => {
    const { post, commenter, author } = await createUsersAndPost();

    await Comment.create({
      postId: post._id,
      author: { id: commenter._id, name: commenter.name },
      text: "Super projet, bravo !",
    });
    await Comment.create({
      postId: post._id,
      author: { id: author._id, name: author.name },
      text: "Merci pour ton retour !",
    });

    const res = await fetch(`${base}/api/posts/${post._id}/comments`);
    assert.strictEqual(res.status, 200);

    const comments = await res.json();
    assert.strictEqual(Array.isArray(comments), true);
    assert.strictEqual(comments.length, 2);
    assert.strictEqual(comments[0].text, "Super projet, bravo !");
    assert.strictEqual(comments[0].author.name, "Jean Commentateur");
    assert.strictEqual(comments[1].text, "Merci pour ton retour !");
  });

  test("Post partagé par lien secret : lecture autorisée avec X-Share-Token, refus sans token (403)", async () => {
    const { post, commenter } = await createUsersAndPost({ visibility: "link" });

    // Ajout d'un commentaire direct en base
    await Comment.create({
      postId: post._id,
      author: { id: commenter._id, name: commenter.name },
      text: "Commentaire sur post link",
    });

    // 1. Sans token -> 404 (pour visibilité link non authentifié)
    const resNoToken = await fetch(`${base}/api/posts/${post._id}/comments`);
    assert.strictEqual(resNoToken.status, 404);

    // 2. Création d'un ShareLink valide
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
    await ShareLink.create({
      postId: post._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 86400000), // 24h
      revoked: false,
    });

    // 3. Avec X-Share-Token valide -> 200 OK
    const resWithToken = await fetch(`${base}/api/posts/${post._id}/comments`, {
      headers: { "x-share-token": rawSecret },
    });
    assert.strictEqual(resWithToken.status, 200);
    const comments = await resWithToken.json();
    assert.strictEqual(comments.length, 1);
    assert.strictEqual(comments[0].text, "Commentaire sur post link");
  });

  test("Post partagé par lien secret : un visiteur muni du token DOIT être connecté pour commenter (401 si non connecté)", async () => {
    const { post, commenterToken } = await createUsersAndPost({ visibility: "link" });

    const rawSecret = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
    await ShareLink.create({
      postId: post._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 86400000),
      revoked: false,
    });

    // Visiteur avec token mais sans Authorization Bearer -> 401 Unauthorized
    const resAnon = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-share-token": rawSecret,
      },
      body: JSON.stringify({ text: "Tentative de commentaire anonyme" }),
    });
    assert.strictEqual(resAnon.status, 401);

    // Visiteur avec token ET compte connecté -> 201 Created
    const resAuth = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${commenterToken}`,
        "x-share-token": rawSecret,
      },
      body: JSON.stringify({ text: "Commentaire authentifié réussi via lien secret" }),
    });
    assert.strictEqual(resAuth.status, 201);
    const data = await resAuth.json();
    assert.strictEqual(data.text, "Commentaire authentifié réussi via lien secret");
    assert.strictEqual(data.author.name, "Jean Commentateur");
  });

  test("Interdiction formelle de commenter un post archivé (400 Bad Request)", async () => {
    const { post, commenterToken } = await createUsersAndPost({ status: "archived" });

    const res = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${commenterToken}`,
      },
      body: JSON.stringify({ text: "Commentaire sur un post archivé" }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.message, /archivé/i);
  });

  test("Interdiction d'écrire par un compte suspendu (403 Forbidden)", async () => {
    const { post, suspendedToken } = await createUsersAndPost();

    const res = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${suspendedToken}`,
      },
      body: JSON.stringify({ text: "Spam d'un utilisateur banni" }),
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.message, /suspendu/i);
  });

  test("Validation stricte du texte : vide, espaces seuls ou > 1000 caractères rejetés (400)", async () => {
    const { post, commenterToken } = await createUsersAndPost();

    // 1. Texte vide
    const resEmpty = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${commenterToken}`,
      },
      body: JSON.stringify({ text: "" }),
    });
    assert.strictEqual(resEmpty.status, 400);

    // 2. Espaces uniquement
    const resSpaces = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${commenterToken}`,
      },
      body: JSON.stringify({ text: "     " }),
    });
    assert.strictEqual(resSpaces.status, 400);

    // 3. Texte > 1000 caractères
    const longText = "A".repeat(1001);
    const resLong = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${commenterToken}`,
      },
      body: JSON.stringify({ text: longText }),
    });
    assert.strictEqual(resLong.status, 400);
  });

  test("Suppression de commentaire : auteur autorisé (200), tiers refusé (403), admin autorisé (200)", async () => {
    const { post, commenter, commenterToken, strangerToken, adminToken } = await createUsersAndPost();

    // Créer un commentaire par commenter
    const comment = await Comment.create({
      postId: post._id,
      author: { id: commenter._id, name: commenter.name },
      text: "Commentaire à tester pour la suppression",
    });

    // 1. Tiers quelconque tente de supprimer -> 403 Forbidden
    const resStranger = await fetch(`${base}/api/posts/${post._id}/comments/${comment._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.strictEqual(resStranger.status, 403);

    // 2. Admin supprime le commentaire -> 200 OK
    const resAdmin = await fetch(`${base}/api/posts/${post._id}/comments/${comment._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resAdmin.status, 200);

    const deleted = await Comment.findById(comment._id);
    assert.strictEqual(deleted, null);

    // 3. Créer un second commentaire et le faire supprimer par son auteur
    const comment2 = await Comment.create({
      postId: post._id,
      author: { id: commenter._id, name: commenter.name },
      text: "Deuxième commentaire",
    });

    const resAuthor = await fetch(`${base}/api/posts/${post._id}/comments/${comment2._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${commenterToken}` },
    });
    assert.strictEqual(resAuthor.status, 200);

    const deleted2 = await Comment.findById(comment2._id);
    assert.strictEqual(deleted2, null);
  });

  test("L'administrateur n'a PAS d'accès implicite aux pièces jointes privées d'un post restreint", async () => {
    const { post, adminToken } = await createUsersAndPost({ visibility: "subscribers" });

    const attId = post.attachments[0]._id;

    // L'administrateur tente de télécharger la pièce jointe d'un post réservé aux abonnés sans être abonné
    const res = await fetch(`${base}/api/posts/${post._id}/attachments/${attId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // L'accès aux pièces jointes privées doit être strictement refusé (403)
    assert.strictEqual(res.status, 403);
  });

  test("Post restreint (subscribers) : un tiers non abonné ne peut ni lire ni commenter (403)", async () => {
    const { post, strangerToken } = await createUsersAndPost({ visibility: "subscribers" });

    // Lecture des commentaires refusée
    const resGet = await fetch(`${base}/api/posts/${post._id}/comments`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.strictEqual(resGet.status, 403);

    // Écriture d'un commentaire refusée
    const resPost = await fetch(`${base}/api/posts/${post._id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${strangerToken}`,
      },
      body: JSON.stringify({ text: "Tentative sur post abonné" }),
    });
    assert.strictEqual(resPost.status, 403);
  });
});
