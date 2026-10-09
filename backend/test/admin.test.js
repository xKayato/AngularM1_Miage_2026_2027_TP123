import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Like } from "../src/models/Like.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";
import { UPLOADS_ATTACHMENTS } from "../src/middlewares/attachmentUpload.js";

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

  await fsPromises.mkdir(UPLOADS_ATTACHMENTS, { recursive: true });

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
    name: `Admin Test User ${userSeq}`,
    email: `admin_${userSeq}_${Date.now()}@test.com`,
    password: "Password123!",
    role,
    status,
  });
  const token = jwt.sign({ sub: String(user._id), email: user.email }, JWT_SECRET);
  return { user, token };
}

async function createPostWithAttachment(authorId, visibility = "public", status = "published") {
  const fileId = new mongoose.Types.ObjectId();
  const storedName = `test_file_${fileId}.pdf`;
  const filePath = path.join(UPLOADS_ATTACHMENTS, storedName);
  await fsPromises.writeFile(filePath, "%PDF-1.4 test binary dummy");

  const post = await Post.create({
    author: authorId,
    title: `Post Test Modération ${Date.now()}`,
    shortDescription: "Description de test pour la modération et l'administration",
    content: "Contenu complet du tutoriel soumis à modération administrative.",
    category: "Lego",
    tags: ["moderation", "admin-test"],
    visibility,
    status,
    publishedAt: status === "published" ? new Date() : null,
    attachments: [
      {
        _id: fileId,
        originalName: "notice-guide.pdf",
        storedName,
        mimeType: "application/pdf",
        size: 1024,
        family: "pdf",
      },
    ],
  });

  return { post, attachmentId: String(fileId), filePath };
}

test("Admin Security — Refus d'accès pour requêtes anonymes ou non-admins", async () => {
  const { user: regularUser, token: regularToken } = await createUser("user", "active");
  const { post } = await createPostWithAttachment(regularUser._id);

  // 1. Sans token -> 401
  const resNoAuth = await fetch(`${base}/api/admin/posts/${post._id}/archive`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Contenu inapproprié" }),
  });
  assert.equal(resNoAuth.status, 401);

  // 2. Utilisateur standard -> 403
  const resUserAuth = await fetch(`${base}/api/admin/posts/${post._id}/archive`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${regularToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Contenu inapproprié" }),
  });
  assert.equal(resUserAuth.status, 403);
});

test("Admin Security — Contrôle strict du rôle en base (rejet si rétrogradé ou falsifié dans JWT)", async () => {
  const { user: adminUser, token: fakeAdminToken } = await createUser("user", "active");
  const { post } = await createPostWithAttachment(adminUser._id);

  // Jeton signé avec prétendue prétention 'admin' mais en base role: 'user'
  const forgedToken = jwt.sign(
    { sub: String(adminUser._id), email: adminUser.email, role: "admin" },
    JWT_SECRET
  );

  const resForged = await fetch(`${base}/api/admin/posts/${post._id}/archive`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${forgedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Tentative d'usurpation" }),
  });
  assert.equal(resForged.status, 403);
  const data = await resForged.json();
  assert.match(data.message, /réservé aux administrateurs/i);
});

test("Admin Security — Rejet 403 si le compte administrateur a été suspendu", async () => {
  const { user: suspendedAdmin, token: adminToken } = await createUser("admin", "suspended");
  const { user: regularUser } = await createUser("user", "active");
  const { post } = await createPostWithAttachment(regularUser._id);

  const res = await fetch(`${base}/api/admin/posts/${post._id}/archive`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Action" }),
  });
  assert.equal(res.status, 403);
});

test("Admin Posts — Archivage d'un post et effets immédiats (catalogue, détail ordinaire, fichiers)", async () => {
  const { user: admin, token: adminToken } = await createUser("admin", "active");
  const { user: author, token: authorToken } = await createUser("user", "active");
  const { post, attachmentId, filePath } = await createPostWithAttachment(author._id, "public", "published");

  // 1. Avant archivage : visible au catalogue, détail et téléchargement fichier
  const resCatBefore = await fetch(`${base}/api/posts?tags=admin-test`);
  assert.equal(resCatBefore.status, 200);
  const catDataBefore = await resCatBefore.json();
  assert.ok(catDataBefore.docs.some((p) => p.id === String(post._id)));

  const resDetailBefore = await fetch(`${base}/api/posts/${post._id}`);
  assert.equal(resDetailBefore.status, 200);

  const resFileBefore = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`);
  assert.equal(resFileBefore.status, 200);

  // 2. Action d'archivage par l'administrateur
  const archiveRes = await fetch(`${base}/api/admin/posts/${post._id}/archive`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Non-respect des règles communautaires" }),
  });
  assert.equal(archiveRes.status, 200);
  const archivedDoc = await archiveRes.json();
  assert.equal(archivedDoc.status, "archived");
  assert.equal(archivedDoc.archiveReason, "Non-respect des règles communautaires");
  assert.ok(archivedDoc.archivedAt);

  // 3. Effets immédiats :
  // - Retiré immédiatement du catalogue public
  const resCatAfter = await fetch(`${base}/api/posts?tags=admin-test`);
  const catDataAfter = await resCatAfter.json();
  assert.ok(!catDataAfter.docs.some((p) => p.id === String(post._id)));

  // - Retiré immédiatement du détail ordinaire -> 410 Gone
  const resDetailAfter = await fetch(`${base}/api/posts/${post._id}`);
  assert.equal(resDetailAfter.status, 410);

  // - Retiré immédiatement de l'accès aux fichiers -> 410 Gone
  const resFileAfter = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`);
  assert.equal(resFileAfter.status, 410);

  // - Consultation d'inspection modératrice par l'administrateur -> 200
  const resAdminInspect = await fetch(`${base}/api/admin/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resAdminInspect.status, 200);
  const inspectData = await resAdminInspect.json();
  assert.equal(inspectData.status, "archived");
  assert.equal(inspectData.archiveReason, "Non-respect des règles communautaires");

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Admin Posts — Restauration d'un post archivé et absence d'accès implicite aux pièces jointes privées", async () => {
  const { user: admin, token: adminToken } = await createUser("admin", "active");
  const { user: author } = await createUser("user", "active");
  // Post initialement followers avec pièce jointe
  const { post, attachmentId, filePath } = await createPostWithAttachment(author._id, "followers", "archived");
  post.archivedAt = new Date();
  post.archiveReason = "Signalement résolu";
  await post.save();

  // 1. Restauration par l'administrateur
  const restoreRes = await fetch(`${base}/api/admin/posts/${post._id}/restore`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(restoreRes.status, 200);
  const restoredDoc = await restoreRes.json();
  assert.equal(restoredDoc.status, "published");
  assert.equal(restoredDoc.archivedAt, null);
  assert.equal(restoredDoc.archiveReason, null);

  // 2. Le post redevient visible dans le catalogue (avec isLocked pour les non-followers)
  const resCat = await fetch(`${base}/api/posts?tags=admin-test`);
  const catData = await resCat.json();
  assert.ok(catData.docs.some((p) => p.id === String(post._id)));

  // 3. SÉCURITÉ ABSOLUE : La restauration NE confère PAS à l'administrateur un accès implicite aux pièces jointes privées !
  // L'administrateur n'est pas follower de l'auteur -> 403 Forbidden sur la pièce jointe
  const resAdminFileAccess = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resAdminFileAccess.status, 403);

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Admin Users — Suspension d'un utilisateur et effets immédiats (masquage posts, blocage écriture, refus login)", async () => {
  const { user: admin, token: adminToken } = await createUser("admin", "active");
  const { user: targetAuthor, token: authorToken } = await createUser("user", "active");
  const { post, attachmentId, filePath } = await createPostWithAttachment(targetAuthor._id, "public", "published");

  // 1. Suspension par l'administrateur
  const suspendRes = await fetch(`${base}/api/admin/users/${targetAuthor._id}/suspend`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(suspendRes.status, 200);
  const suspendedUser = await suspendRes.json();
  assert.equal(suspendedUser.status, "suspended");

  // 2. Effet immédiat sur les posts : masqués immédiatement aux tiers (404 au détail et absent du catalogue)
  const resCat = await fetch(`${base}/api/posts?tags=admin-test`);
  const catData = await resCat.json();
  assert.ok(!catData.docs.some((p) => p.id === String(post._id)));

  const resDetail = await fetch(`${base}/api/posts/${post._id}`);
  assert.equal(resDetail.status, 404);

  // 3. Effet immédiat sur les actions d'écriture de l'auteur : bloquées par 403
  const resCreatePost = await fetch(`${base}/api/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Nouveau post interdit",
      shortDescription: "Tentative d'écriture après suspension de compte",
      content: "Contenu qui doit être bloqué",
      category: "Lego",
      tags: ["interdit"],
    }),
  });
  assert.equal(resCreatePost.status, 403);

  // 4. Effet immédiat sur la connexion login : rejet 403 direct sans JWT délivré
  const resLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: targetAuthor.email,
      password: "Password123!",
    }),
  });
  assert.equal(resLogin.status, 403);
  const loginData = await resLogin.json();
  assert.match(loginData.message, /compte suspendu/i);

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Admin Users — Réactivation d'un utilisateur et déblocage immédiat", async () => {
  const { user: admin, token: adminToken } = await createUser("admin", "active");
  const { user: targetAuthor, token: authorToken } = await createUser("user", "suspended");
  const { post, filePath } = await createPostWithAttachment(targetAuthor._id, "public", "published");

  // 1. Réactivation par l'administrateur
  const reactivateRes = await fetch(`${base}/api/admin/users/${targetAuthor._id}/reactivate`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(reactivateRes.status, 200);
  const reactivatedUser = await reactivateRes.json();
  assert.equal(reactivatedUser.status, "active");

  // 2. Les posts redeviennent visibles
  const resDetail = await fetch(`${base}/api/posts/${post._id}`);
  assert.equal(resDetail.status, 200);

  // 3. L'auteur peut à nouveau se connecter
  const resLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: targetAuthor.email,
      password: "Password123!",
    }),
  });
  assert.equal(resLogin.status, 200);

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Cas sensibles — Interdiction formelle de l'auto-suspension d'un administrateur (400)", async () => {
  const { user: admin, token: adminToken } = await createUser("admin", "active");

  const res = await fetch(`${base}/api/admin/users/${admin._id}/suspend`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /ne peut pas suspendre son propre compte/i);

  // Vérifie en base que l'admin est resté actif
  const freshAdmin = await User.findById(admin._id);
  assert.equal(freshAdmin.status, "active");
});

test("Cas sensibles — Cibles introuvables (404 et 400)", async () => {
  const { token: adminToken } = await createUser("admin", "active");
  const fakeId = new mongoose.Types.ObjectId();

  // Post introuvable -> 404
  const resPost404 = await fetch(`${base}/api/admin/posts/${fakeId}/archive`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resPost404.status, 404);

  // User introuvable -> 404
  const resUser404 = await fetch(`${base}/api/admin/users/${fakeId}/suspend`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resUser404.status, 404);

  // Identifiant invalide -> 400
  const resInvalid = await fetch(`${base}/api/admin/users/not-an-id/suspend`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resInvalid.status, 400);
});

test("Cas sensibles — Idempotence des actions répétées", async () => {
  const { token: adminToken } = await createUser("admin", "active");
  const { user: author } = await createUser("user", "active");
  const { post, filePath } = await createPostWithAttachment(author._id, "public", "published");

  // 1. Double archivage : deuxième appel renvoie 200 avec statut archivé
  await fetch(`${base}/api/admin/posts/${post._id}/archive`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: "Motif initial" }),
  });
  const resRepeatArchive = await fetch(`${base}/api/admin/posts/${post._id}/archive`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: "Nouveau motif" }),
  });
  assert.equal(resRepeatArchive.status, 200);

  // 2. Double restauration : deuxième appel renvoie 200 avec statut published
  await fetch(`${base}/api/admin/posts/${post._id}/restore`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const resRepeatRestore = await fetch(`${base}/api/admin/posts/${post._id}/restore`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resRepeatRestore.status, 200);

  // 3. Double suspension / double réactivation
  await fetch(`${base}/api/admin/users/${author._id}/suspend`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const resRepeatSuspend = await fetch(`${base}/api/admin/users/${author._id}/suspend`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resRepeatSuspend.status, 200);

  await fetch(`${base}/api/admin/users/${author._id}/reactivate`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const resRepeatReactivate = await fetch(`${base}/api/admin/users/${author._id}/reactivate`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resRepeatReactivate.status, 200);

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Cas sensibles — Auteur suspendu et restauration d'un post précédemment archivé", async () => {
  const { token: adminToken } = await createUser("admin", "active");
  const { user: author } = await createUser("user", "suspended");
  const { post, filePath } = await createPostWithAttachment(author._id, "public", "archived");

  // L'administrateur restaure le post du créateur suspendu
  const restoreRes = await fetch(`${base}/api/admin/posts/${post._id}/restore`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(restoreRes.status, 200);
  const data = await restoreRes.json();
  assert.equal(data.status, "published");

  // Bien que le post soit techniquement 'published', son auteur est 'suspended' :
  // Le post DOIT rester masqué aux tiers (404 au détail et absent du catalogue)
  const resCat = await fetch(`${base}/api/posts?tags=admin-test`);
  const catData = await resCat.json();
  assert.ok(!catData.docs.some((p) => p.id === String(post._id)));

  const resDetail = await fetch(`${base}/api/posts/${post._id}`);
  assert.equal(resDetail.status, 404);

  await fsPromises.unlink(filePath).catch(() => {});
});
