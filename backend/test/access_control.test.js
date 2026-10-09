import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";
import { ShareLink } from "../src/models/ShareLink.js";
import { Like } from "../src/models/Like.js";
import { UPLOADS_ATTACHMENTS } from "../src/middlewares/attachmentUpload.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

const SAMPLE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const SAMPLE_MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(20, 0x55)]);

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

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
    name: `User ${userSeq}`,
    email: `user_${userSeq}_${Date.now()}@test.com`,
    passwordHash: "hash123",
    role,
    status,
  });
  const token = jwt.sign({ sub: String(user._id), email: user.email }, JWT_SECRET);
  return { user, token };
}

async function createPostWithFile(authorId, visibility = "public", status = "published") {
  const storedName = `test_att_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
  const filePath = path.join(UPLOADS_ATTACHMENTS, storedName);
  await fsPromises.writeFile(filePath, SAMPLE_PNG);

  const post = await Post.create({
    author: authorId,
    title: `Projet ${visibility} ${status}`,
    shortDescription: "Description du projet pour test d'accès",
    content: "Contenu secret intégral du projet",
    category: "Lego",
    tags: ["lego", visibility],
    visibility,
    status,
    publishedAt: status === "published" ? new Date() : null,
    attachments: [
      {
        originalName: "schema.png",
        storedName,
        mimeType: "image/png",
        size: SAMPLE_PNG.length,
        family: "image",
        isCover: true,
      },
    ],
  });

  return { post, storedName, filePath, attachmentId: String(post.attachments[0]._id) };
}

test("Mission 4 — Catalogue et Aperçus (GET /api/posts et GET /api/posts/:id/preview)", async (t) => {
  const { user: author } = await createUser();
  const { user: follower, token: followerToken } = await createUser();
  const { user: subscriber, token: subToken } = await createUser();
  const { user: stranger, token: strangerToken } = await createUser();
  const { user: suspendedAuthor } = await createUser("user", "suspended");

  // Création des relations
  await Follow.create({ followerId: follower._id, creatorId: author._id });
  await Subscription.create({
    subscriberId: subscriber._id,
    creatorId: author._id,
    active: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });

  // Création de différents posts
  const { post: publicPost } = await createPostWithFile(author._id, "public", "published");
  const { post: followerPost } = await createPostWithFile(author._id, "followers", "published");
  const { post: subscriberPost } = await createPostWithFile(author._id, "subscribers", "published");
  const { post: linkPost } = await createPostWithFile(author._id, "link", "published");
  const { post: draftPost } = await createPostWithFile(author._id, "public", "draft");
  const { post: archivedPost } = await createPostWithFile(author._id, "public", "archived");
  const { post: suspendedPost } = await createPostWithFile(suspendedAuthor._id, "public", "published");

  await t.test("Catalogue public : anonyme voit les posts découvrables, avec statut isLocked adéquat", async () => {
    const res = await fetch(`${base}/api/posts`);
    assert.equal(res.status, 200);
    const data = await res.json();

    // Doit contenir public, followers, subscribers
    const ids = data.docs.map((p) => p.id);
    assert.ok(ids.includes(String(publicPost._id)));
    assert.ok(ids.includes(String(followerPost._id)));
    assert.ok(ids.includes(String(subscriberPost._id)));

    // Exclusions formelles
    assert.equal(ids.includes(String(linkPost._id)), false, "Link-only ne doit pas être dans le catalogue");
    assert.equal(ids.includes(String(draftPost._id)), false, "Draft ne doit pas être dans le catalogue");
    assert.equal(ids.includes(String(archivedPost._id)), false, "Archived ne doit pas être dans le catalogue");
    assert.equal(ids.includes(String(suspendedPost._id)), false, "Auteur suspendu ne doit pas être dans le catalogue");

    // Vérification verrouillage pour anonyme
    const pPub = data.docs.find((p) => p.id === String(publicPost._id));
    assert.equal(pPub.isLocked, false);
    assert.ok(pPub.coverUrl); // Cover visible si non verrouillé

    const pFoll = data.docs.find((p) => p.id === String(followerPost._id));
    assert.equal(pFoll.isLocked, true);
    assert.equal(pFoll.coverUrl, null, "Cover masquée si verrouillé");

    const pSub = data.docs.find((p) => p.id === String(subscriberPost._id));
    assert.equal(pSub.isLocked, true);
    assert.equal(pSub.coverUrl, null);

    // Vérification de sécurité : aucun content ni storedName dans l'aperçu
    for (const p of data.docs) {
      assert.equal(p.content, undefined);
      assert.equal(p.storedName, undefined);
    }
  });

  await t.test("Catalogue : un follower connecté voit le post followers déverrouillé", async () => {
    const res = await fetch(`${base}/api/posts`, {
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    const pFoll = data.docs.find((p) => p.id === String(followerPost._id));
    assert.equal(pFoll.isLocked, false);
    assert.ok(pFoll.coverUrl);

    const pSub = data.docs.find((p) => p.id === String(subscriberPost._id));
    assert.equal(pSub.isLocked, true);
  });

  await t.test("GET /api/posts/:id/preview : aperçu direct conforme au contrat", async () => {
    const res = await fetch(`${base}/api/posts/${subscriberPost._id}/preview`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, String(subscriberPost._id));
    assert.equal(data.isLocked, true);
    assert.equal(data.coverUrl, null);
    assert.equal(data.content, undefined);
  });
});

test("Mission 4 — Matrice d'accès au détail (GET /api/posts/:id)", async (t) => {
  const { user: author, token: authorToken } = await createUser();
  const { user: stranger, token: strangerToken } = await createUser();
  const { user: follower, token: followerToken } = await createUser();
  const { user: activeSub, token: activeSubToken } = await createUser();
  const { user: expiredSub, token: expiredSubToken } = await createUser();
  const { user: admin, token: adminToken } = await createUser("admin", "active");
  const { user: suspended, token: suspendedToken } = await createUser("user", "suspended");

  // Relations
  await Follow.create({ followerId: follower._id, creatorId: author._id });
  await Subscription.create({
    subscriberId: activeSub._id,
    creatorId: author._id,
    active: true,
    expiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000), // +10j
  });
  await Subscription.create({
    subscriberId: expiredSub._id,
    creatorId: author._id,
    active: true,
    expiresAt: new Date(Date.now() - 2 * 24 * 3600 * 1000), // expiré il y a 2j
  });

  const { post: pubPost } = await createPostWithFile(author._id, "public", "published");
  const { post: follPost } = await createPostWithFile(author._id, "followers", "published");
  const { post: subPost } = await createPostWithFile(author._id, "subscribers", "published");
  const { post: linkPost } = await createPostWithFile(author._id, "link", "published");
  const { post: draftPost } = await createPostWithFile(author._id, "public", "draft");
  const { post: archPost } = await createPostWithFile(author._id, "public", "archived");

  await t.test("Post public : 200 pour tout le monde", async () => {
    const resAnon = await fetch(`${base}/api/posts/${pubPost._id}`);
    assert.equal(resAnon.status, 200);

    const resStranger = await fetch(`${base}/api/posts/${pubPost._id}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(resStranger.status, 200);
  });

  await t.test("Post draft : 200 pour l'auteur, 404 pour les tiers", async () => {
    const resAuthor = await fetch(`${base}/api/posts/${draftPost._id}`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    });
    assert.equal(resAuthor.status, 200);

    const resStranger = await fetch(`${base}/api/posts/${draftPost._id}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(resStranger.status, 404);
  });

  await t.test("Post archivé : 410 pour tiers/auteur, 410/200 modération", async () => {
    const resStranger = await fetch(`${base}/api/posts/${archPost._id}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(resStranger.status, 410);

    const resAuthor = await fetch(`${base}/api/posts/${archPost._id}`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    });
    assert.equal(resAuthor.status, 410);
  });

  await t.test("Post followers : 401 anonyme, 403 non-follower, 200 follower, 200 auteur, 403 admin sans passe-droit", async () => {
    const resAnon = await fetch(`${base}/api/posts/${follPost._id}`);
    assert.equal(resAnon.status, 401);

    const resStranger = await fetch(`${base}/api/posts/${follPost._id}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(resStranger.status, 403);

    const resFollower = await fetch(`${base}/api/posts/${follPost._id}`, {
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(resFollower.status, 200);

    const resAuthor = await fetch(`${base}/api/posts/${follPost._id}`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    });
    assert.equal(resAuthor.status, 200);

    // L'administrateur n'a pas de passe-droit magique sur le contenu privé des créateurs
    const resAdmin = await fetch(`${base}/api/posts/${follPost._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resAdmin.status, 403);
  });

  await t.test("Post subscribers : 401 anonyme, 403 non-abonné, 403 abonné expiré, 200 abonné actif", async () => {
    const resAnon = await fetch(`${base}/api/posts/${subPost._id}`);
    assert.equal(resAnon.status, 401);

    const resStranger = await fetch(`${base}/api/posts/${subPost._id}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(resStranger.status, 403);

    const resExpired = await fetch(`${base}/api/posts/${subPost._id}`, {
      headers: { Authorization: `Bearer ${expiredSubToken}` },
    });
    assert.equal(resExpired.status, 403);

    const resActive = await fetch(`${base}/api/posts/${subPost._id}`, {
      headers: { Authorization: `Bearer ${activeSubToken}` },
    });
    assert.equal(resActive.status, 200);
  });

  await t.test("Post link : 404 pour tiers via GET /:id direct, 200 pour auteur", async () => {
    const resStranger = await fetch(`${base}/api/posts/${linkPost._id}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(resStranger.status, 404);

    const resAuthor = await fetch(`${base}/api/posts/${linkPost._id}`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    });
    assert.equal(resAuthor.status, 200);
  });

  await t.test("Compte suspendu : 403 immédiat sur requête avec JWT", async () => {
    const resSuspended = await fetch(`${base}/api/posts/${pubPost._id}`, {
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    assert.equal(resSuspended.status, 403);
  });
});

test("Mission 4 — Liens secrets de partage (création, consultation, révocation, expiration et GET /shared/:token)", async (t) => {
  const { user: author, token: authorToken } = await createUser();
  const { user: stranger, token: strangerToken } = await createUser();
  const { user: suspended, token: suspendedToken } = await createUser("user", "suspended");

  const { post, attachmentId } = await createPostWithFile(author._id, "link", "published");

  // 1. Création d'un lien secret par l'auteur
  const createRes = await fetch(`${base}/api/posts/${post._id}/share-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
  });
  assert.equal(createRes.status, 201);
  const linkData = await createRes.json();
  assert.ok(linkData.token);
  assert.equal(linkData.token.length, 64); // 32 octets hex
  assert.ok(linkData.shareUrl.includes(linkData.token));
  assert.equal(linkData.revoked, false);

  const rawSecret = linkData.token;

  // 2. Consultation de l'état du lien par l'auteur (sans secret brut)
  const infoRes = await fetch(`${base}/api/posts/${post._id}/share-link`, {
    headers: { Authorization: `Bearer ${authorToken}` },
  });
  assert.equal(infoRes.status, 200);
  const infoData = await infoRes.json();
  assert.equal(infoData.active, true);
  assert.equal(infoData.token, undefined, "Le secret brut ne doit pas être renvoyé par GET");

  // 3. Consultation réussie via GET /api/posts/shared/:token pour un visiteur anonyme
  const sharedAnonRes = await fetch(`${base}/api/posts/shared/${rawSecret}`);
  assert.equal(sharedAnonRes.status, 200);
  const sharedPostData = await sharedAnonRes.json();
  assert.equal(sharedPostData.id, String(post._id));
  assert.ok(sharedPostData.content);

  // 4. Consultation réussie via GET /api/posts/shared/:token pour un utilisateur connecté
  const sharedUserRes = await fetch(`${base}/api/posts/shared/${rawSecret}`, {
    headers: { Authorization: `Bearer ${strangerToken}` },
  });
  assert.equal(sharedUserRes.status, 200);

  // 5. JWT invalide combiné avec le token secret -> 401 Unauthorized (le lien ne pardonne pas un faux JWT)
  const badJwtRes = await fetch(`${base}/api/posts/shared/${rawSecret}`, {
    headers: { Authorization: "Bearer faux-jwt-invalide" },
  });
  assert.equal(badJwtRes.status, 401);

  // 6. Utilisateur suspendu combiné avec le token secret -> 403 Forbidden (la suspension prime)
  const suspendedUserRes = await fetch(`${base}/api/posts/shared/${rawSecret}`, {
    headers: { Authorization: `Bearer ${suspendedToken}` },
  });
  assert.equal(suspendedUserRes.status, 403);

  // 7. Révocation du lien secret par l'auteur
  const revokeRes = await fetch(`${base}/api/posts/${post._id}/share-link`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authorToken}` },
  });
  assert.equal(revokeRes.status, 204);

  // 8. Après révocation : GET /api/posts/shared/:token renvoie 410 Gone
  const revokedRes = await fetch(`${base}/api/posts/shared/${rawSecret}`);
  assert.equal(revokedRes.status, 410);
});

test("Mission 4 — Téléchargement et streaming sécurisé des pièces jointes (GET /api/posts/:id/attachments/:attachmentId)", async (t) => {
  const { user: author, token: authorToken } = await createUser();
  const { user: stranger, token: strangerToken } = await createUser();
  const { user: follower, token: followerToken } = await createUser();

  await Follow.create({ followerId: follower._id, creatorId: author._id });

  // Post A (link) et Post B (followers)
  const { post: postA, attachmentId: attA, filePath: fileA } = await createPostWithFile(author._id, "link", "published");
  const { post: postB, attachmentId: attB, filePath: fileB } = await createPostWithFile(author._id, "followers", "published");

  // Création du lien secret pour Post A
  const shareRes = await fetch(`${base}/api/posts/${postA._id}/share-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
  });
  const { token: shareTokenA } = await shareRes.json();

  await t.test("Téléchargement protégé avec en-tête X-Share-Token valide pour post 'link' (200)", async () => {
    const res = await fetch(`${base}/api/posts/${postA._id}/attachments/${attA}`, {
      headers: { "X-Share-Token": shareTokenA },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    const buf = await res.arrayBuffer();
    assert.equal(buf.byteLength, SAMPLE_PNG.length);
  });

  await t.test("Rejet sans X-Share-Token pour post 'link' (403)", async () => {
    const res = await fetch(`${base}/api/posts/${postA._id}/attachments/${attA}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test("Rejet de cross-reading : impossible d'utiliser le X-Share-Token du post A sur le post B (403)", async () => {
    const res = await fetch(`${base}/api/posts/${postB._id}/attachments/${attB}`, {
      headers: { "X-Share-Token": shareTokenA },
    });
    assert.equal(res.status, 401); // Visiteur anonyme non follower et token invalide pour post B
  });

  await t.test("Téléchargement autorisé pour un follower sur post followers (200)", async () => {
    const res = await fetch(`${base}/api/posts/${postB._id}/attachments/${attB}`, {
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(res.status, 200);
  });

  await t.test("Répond proprement 404 si le fichier physique est manquant sur disque", async () => {
    // Suppression physique du fichier sur disque
    await fsPromises.unlink(fileA).catch(() => {});

    const res = await fetch(`${base}/api/posts/${postA._id}/attachments/${attA}`, {
      headers: { "X-Share-Token": shareTokenA },
    });
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.match(data.message, /fichier physique introuvable/i);
  });

  // Nettoyage disque
  await fsPromises.unlink(fileB).catch(() => {});
});

test("Mission 4 — Cycle complet Follow (avant follow: 403, après Follow.create: 200, après Follow.deleteOne: 403)", async () => {
  const { user: author } = await createUser();
  const { user: reader, token: readerToken } = await createUser();
  const { post, attachmentId, filePath } = await createPostWithFile(author._id, "followers", "published");

  // 1. Avant follow : détail et fichier protégés sont refusés (403)
  const resDetailBefore = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resDetailBefore.status, 403);

  const resFileBefore = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resFileBefore.status, 403);

  // 2. Création du Follow en base avec le schéma exact { followerId, creatorId }
  const followDoc = await Follow.create({
    followerId: reader._id,
    creatorId: author._id,
  });
  assert.ok(followDoc._id);

  // Après création : détail et fichier protégés sont accessibles (200)
  const resDetailAfter = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resDetailAfter.status, 200);

  const resFileAfter = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resFileAfter.status, 200);

  // 3. Retrait du Follow en base
  await Follow.deleteOne({ _id: followDoc._id });

  // Après retrait : détail et fichier protégés sont à nouveau refusés (403)
  const resDetailRemoved = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resDetailRemoved.status, 403);

  const resFileRemoved = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resFileRemoved.status, 403);

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Mission 4 — Cycle complet Subscription (abonné actif: 200, abonné expiré: 403, abonné inactif: 403)", async () => {
  const { user: author } = await createUser();
  const { user: subscriber, token: subToken } = await createUser();
  const { post, attachmentId, filePath } = await createPostWithFile(author._id, "subscribers", "published");

  // 1. Avant abonnement : refus 403
  const resBefore = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${subToken}` },
  });
  assert.equal(resBefore.status, 403);

  // 2. Abonnement actif (expiresAt dans 30 jours, active: true)
  const subDoc = await Subscription.create({
    subscriberId: subscriber._id,
    creatorId: author._id,
    active: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });

  const resDetailActive = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${subToken}` },
  });
  assert.equal(resDetailActive.status, 200);
  const resFileActive = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${subToken}` },
  });
  assert.equal(resFileActive.status, 200);

  // 3. Expiration de l'abonnement en base
  subDoc.expiresAt = new Date(Date.now() - 10000);
  await subDoc.save();

  const resDetailExpired = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${subToken}` },
  });
  assert.equal(resDetailExpired.status, 403);
  const resFileExpired = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${subToken}` },
  });
  assert.equal(resFileExpired.status, 403);

  // 4. Réactivation mais désactivé explicitement (active: false)
  subDoc.expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  subDoc.active = false;
  await subDoc.save();

  const resDetailInactive = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${subToken}` },
  });
  assert.equal(resDetailInactive.status, 403);
  const resFileInactive = await fetch(`${base}/api/posts/${post._id}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${subToken}` },
  });
  assert.equal(resFileInactive.status, 403);

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Mission 4 — En-têtes HTTP de téléchargement (Content-Type, nosniff, Cache-Control, nom atypique RFC 5987, politique PDF inline vs ?download=1)", async () => {
  const { user: author } = await createUser();

  const atypicalName = 'Plan & "Schéma" étape #1 [Édition 2026].pdf';
  const storedName = `test_pdf_${Date.now()}.pdf`;
  const filePath = path.join(UPLOADS_ATTACHMENTS, storedName);
  const SAMPLE_PDF = Buffer.from("%PDF-1.4 dummy content");
  await fsPromises.writeFile(filePath, SAMPLE_PDF);

  const post = await Post.create({
    author: author._id,
    title: "Projet avec PDF",
    shortDescription: "Tutoriel avec document PDF",
    content: "Contenu complet",
    category: "Autre",
    tags: ["pdf", "test"],
    visibility: "public",
    status: "published",
    publishedAt: new Date(),
    attachments: [
      {
        originalName: atypicalName,
        storedName,
        mimeType: "application/pdf",
        size: SAMPLE_PDF.length,
        family: "pdf",
        isCover: false,
      },
    ],
  });

  const attId = post.attachments[0]._id;

  // 1. Requête standard (consultation / affichage en ligne du PDF)
  const resInline = await fetch(`${base}/api/posts/${post._id}/attachments/${attId}`);
  assert.equal(resInline.status, 200);
  assert.equal(resInline.headers.get("content-type"), "application/pdf");
  assert.equal(resInline.headers.get("x-content-type-options"), "nosniff");
  assert.ok(resInline.headers.get("cache-control").includes("no-store"));
  assert.ok(resInline.headers.get("cache-control").includes("no-cache"));

  const dispInline = resInline.headers.get("content-disposition");
  assert.ok(dispInline.startsWith("inline;"), "Par défaut, PDF servi en inline");
  assert.ok(dispInline.includes('filename="Plan & _Sch_ma_ _tape #1 [_dition 2026].pdf"'), "Repli ASCII sécurisé");
  assert.ok(dispInline.includes("filename*=UTF-8''Plan%20%26%20%22Sch%C3%A9ma%22%20%C3%A9tape%20%231%20%5B%C3%89dition%202026%5D.pdf"), "Nom UTF-8 encodé RFC 5987");

  // 2. Requête avec ?download=1 (téléchargement forcé)
  const resDownload = await fetch(`${base}/api/posts/${post._id}/attachments/${attId}?download=1`);
  assert.equal(resDownload.status, 200);
  const dispDownload = resDownload.headers.get("content-disposition");
  assert.ok(dispDownload.startsWith("attachment;"), "Avec ?download=1, PDF servi en attachment");

  await fsPromises.unlink(filePath).catch(() => {});
});

test("Mission 4 — Inaccessibilité immédiate du fichier (post archivé -> 410, auteur suspendu -> 404, lien révoqué -> 410)", async () => {
  const { user: author, token: authorToken } = await createUser();
  const { user: reader, token: readerToken } = await createUser();

  // Cas A : Post archivé -> 410 immédiat sur le fichier
  const { post: postArch, attachmentId: attArch, filePath: fileArch } = await createPostWithFile(author._id, "public", "archived");
  const resArch = await fetch(`${base}/api/posts/${postArch._id}/attachments/${attArch}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resArch.status, 410);

  // Cas B : Auteur suspendu -> 404 immédiat sur le fichier pour un tiers
  const { post: postSusp, attachmentId: attSusp, filePath: fileSusp } = await createPostWithFile(author._id, "public", "published");
  author.status = "suspended";
  await author.save();

  const resSusp = await fetch(`${base}/api/posts/${postSusp._id}/attachments/${attSusp}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(resSusp.status, 404);

  // Rétablissement auteur
  author.status = "active";
  await author.save();

  // Cas C : Lien révoqué sur post 'link' -> 410 immédiat sur le fichier
  const { post: postLink, attachmentId: attLink, filePath: fileLink } = await createPostWithFile(author._id, "link", "published");
  const shareRes = await fetch(`${base}/api/posts/${postLink._id}/share-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
  });
  const { token: shareToken } = await shareRes.json();

  // Fichier accessible avant révocation
  const resFileBeforeRevoke = await fetch(`${base}/api/posts/${postLink._id}/attachments/${attLink}`, {
    headers: { "X-Share-Token": shareToken },
  });
  assert.equal(resFileBeforeRevoke.status, 200);

  // Révocation du lien
  await fetch(`${base}/api/posts/${postLink._id}/share-link`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authorToken}` },
  });

  // Fichier immédiatement inaccessible (410)
  const resFileAfterRevoke = await fetch(`${base}/api/posts/${postLink._id}/attachments/${attLink}`, {
    headers: { "X-Share-Token": shareToken },
  });
  assert.equal(resFileAfterRevoke.status, 410);

  await fsPromises.unlink(fileArch).catch(() => {});
  await fsPromises.unlink(fileSusp).catch(() => {});
  await fsPromises.unlink(fileLink).catch(() => {});
});

test("Mission 4 — Post archivé et absence de passe-droit admin (410 sur détail, 410 sur fichier, route admin modération reportée à Mission 8)", async () => {
  const { user: author } = await createUser();
  const { user: admin, token: adminToken } = await createUser("admin", "active");
  const { post: archPost, attachmentId: archAtt, filePath } = await createPostWithFile(author._id, "public", "archived");

  // En Mission 4, aucune route modération n'existe encore -> 410 pour tous (y compris admin)
  const resAdminDetail = await fetch(`${base}/api/posts/${archPost._id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resAdminDetail.status, 410);

  // Et sur le fichier, 410 également (aucun passe-droit admin)
  const resAdminFile = await fetch(`${base}/api/posts/${archPost._id}/attachments/${archAtt}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resAdminFile.status, 410);

  await fsPromises.unlink(filePath).catch(() => {});
});

