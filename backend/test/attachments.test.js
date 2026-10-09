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
import { UPLOADS_ATTACHMENTS } from "../src/middlewares/attachmentUpload.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

// Échantillons de buffers valides avec magic bytes réels
const SAMPLE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);
const SAMPLE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const SAMPLE_PDF = Buffer.from("%PDF-1.4\n%ÉÔÑÒ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
const SAMPLE_MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(20, 0x55)]);
const SAMPLE_WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4, 0x00), Buffer.from("WAVE"), Buffer.alloc(20, 0x55)]);
const SAMPLE_OGG = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(24, 0x01)]);
const SAMPLE_M4A = Buffer.concat([Buffer.alloc(4, 0x00), Buffer.from("ftyp"), Buffer.alloc(20, 0x02)]);
const FAKE_CORRUPTED = Buffer.from("Ceci est un fichier texte normal qui pretend etre une image");

test.before(async () => {
  // Démarrage d'une instance MongoDB isolée en mémoire
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

let counter = 0;
async function setupUser(role = "user", status = "active") {
  counter++;
  const user = await User.create({
    name: `User ${counter}`,
    email: `user_${counter}_${Date.now()}@test.com`,
    passwordHash: "hash123",
    role,
    status,
  });
  const token = jwt.sign({ sub: String(user._id), email: user.email }, JWT_SECRET);
  return { user, token };
}

test("Mission 3 — Rejette la requête sans JWT (401)", async () => {
  const { user } = await setupUser();
  const post = await Post.create({
    author: user._id,
    title: "Projet 1",
    shortDescription: "Description 1",
    content: "Contenu 1",
    category: "Lego",
    tags: ["lego"],
    status: "draft",
  });

  const form = new FormData();
  form.append("files", new Blob([SAMPLE_JPEG], { type: "image/jpeg" }), "photo.jpg");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    body: form,
  });
  assert.equal(res.status, 401);
});

test("Mission 3 — Rejette la tentative d'upload par un non-auteur (403)", async () => {
  const { user: author } = await setupUser();
  const { token: otherToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Projet 1",
    shortDescription: "Description 1",
    content: "Contenu 1",
    category: "Lego",
    tags: ["lego"],
    status: "draft",
  });

  const form = new FormData();
  form.append("files", new Blob([SAMPLE_JPEG], { type: "image/jpeg" }), "photo.jpg");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${otherToken}` },
    body: form,
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.message, /pas l'auteur/i);
});

test("Mission 3 — Rejette la tentative d'upload par un compte suspendu (403)", async () => {
  const { user: suspendedUser, token: suspendedToken } = await setupUser("user", "suspended");
  const post = await Post.create({
    author: suspendedUser._id,
    title: "Projet Suspendu",
    shortDescription: "Description suspendue",
    content: "Contenu",
    category: "Lego",
    tags: ["lego"],
    status: "draft",
  });

  const form = new FormData();
  form.append("files", new Blob([SAMPLE_JPEG], { type: "image/jpeg" }), "photo.jpg");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${suspendedToken}` },
    body: form,
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.message, /suspendu/i);
});

test("Mission 3 — Rejette l'upload sur un post archivé (400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Projet Archivé",
    shortDescription: "Description archivée",
    content: "Contenu",
    category: "Lego",
    tags: ["lego"],
    status: "archived",
  });

  const form = new FormData();
  form.append("files", new Blob([SAMPLE_JPEG], { type: "image/jpeg" }), "photo.jpg");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /archivé/i);
});

test("Mission 3 — Rejette une requête sans fichier (400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Post Vide",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
  });

  const form = new FormData();
  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /aucun fichier/i);
});

test("Mission 3 — Rejette un champ de fichier non attendu par Multer (LIMIT_UNEXPECTED_FILE -> 400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Post Multer",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
  });

  const form = new FormData();
  form.append("wrong_field", new Blob([SAMPLE_JPEG], { type: "image/jpeg" }), "test.jpg");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /files/i);
});

test("Mission 3 — Rejette un fichier corrompu malgré une extension .jpg valide (magic bytes) (400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Post Faux Format",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
  });

  const form = new FormData();
  form.append("files", new Blob([FAKE_CORRUPTED], { type: "image/jpeg" }), "fake.jpg");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /format de fichier non accepté/i);
});

test("Mission 3 — Rejette une image dépassant 5 Mo (400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Post Grosse Image",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
  });

  const bigImageBuf = Buffer.concat([
    SAMPLE_JPEG,
    Buffer.alloc(5.5 * 1024 * 1024, 0x00),
  ]);

  const form = new FormData();
  form.append("files", new Blob([bigImageBuf], { type: "image/jpeg" }), "huge.jpg");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /dépasse la taille maximale autorisée/i);
});

test("Mission 3 — Rejette un PDF dépassant 10 Mo (400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Post Gros PDF",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
  });

  const bigPdfBuf = Buffer.concat([
    SAMPLE_PDF,
    Buffer.alloc(11 * 1024 * 1024, 0x20),
  ]);

  const form = new FormData();
  form.append("files", new Blob([bigPdfBuf], { type: "application/pdf" }), "huge.pdf");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /dépasse la taille maximale autorisée/i);
});

test("Mission 3 — Upload réussi d'un lot multiple (JPEG, PDF, MP3) sans exposer storedName (201)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const post = await Post.create({
    author: author._id,
    title: "Projet Multi-Fichiers",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
  });

  const form = new FormData();
  form.append("files", new Blob([SAMPLE_JPEG], { type: "image/jpeg" }), "planche.jpg");
  form.append("files", new Blob([SAMPLE_PDF], { type: "application/pdf" }), "notice.pdf");
  form.append("files", new Blob([SAMPLE_MP3], { type: "audio/mpeg" }), "musique.mp3");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });

  assert.equal(res.status, 201);
  const attachments = await res.json();
  assert.equal(attachments.length, 3);

  // Contrôle strict du contrat d'exposition : storedName et chemin physique sont absents
  for (const att of attachments) {
    assert.ok(att.id);
    assert.ok(att.originalName);
    assert.ok(att.mimeType);
    assert.ok(att.size);
    assert.ok(att.family);
    assert.ok(att.downloadUrl);
    assert.equal(att.storedName, undefined, "storedName ne doit JAMAIS être exposé !");
    assert.equal(att.path, undefined, "path ne doit JAMAIS être exposé !");
  }

  // Vérification de la première image comme cover
  const coverAtt = attachments.find((a) => a.originalName === "planche.jpg");
  assert.equal(coverAtt.isCover, true);

  // Vérification en base de données
  const postInDb = await Post.findById(post._id);
  assert.equal(postInDb.attachments.length, 3);
});

test("Mission 3 — Un lot mixte (valide + invalide) échoue (400), nettoie les fichiers du lot et préserve les pièces jointes existantes", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const existingFileStoredName = "pre_existing_file.pdf";
  const existingFilePath = path.join(UPLOADS_ATTACHMENTS, existingFileStoredName);
  await fsPromises.writeFile(existingFilePath, SAMPLE_PDF);

  const post = await Post.create({
    author: author._id,
    title: "Projet Avec Existant",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
    attachments: [
      {
        originalName: "existant.pdf",
        storedName: existingFileStoredName,
        mimeType: "application/pdf",
        size: SAMPLE_PDF.length,
        family: "pdf",
        isCover: false,
      },
    ],
  });

  const form = new FormData();
  form.append("files", new Blob([SAMPLE_PNG], { type: "image/png" }), "nouveau_valide.png");
  form.append("files", new Blob([FAKE_CORRUPTED], { type: "image/png" }), "nouveau_corrompu.png");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });

  assert.equal(res.status, 400);

  // Vérifier que le document MongoDB n'a PAS été altéré
  const postInDb = await Post.findById(post._id);
  assert.equal(postInDb.attachments.length, 1);
  assert.equal(postInDb.attachments[0].originalName, "existant.pdf");

  // Vérifier que le fichier préexistant sur disque est toujours présent
  assert.equal(fs.existsSync(existingFilePath), true);

  await fsPromises.unlink(existingFilePath).catch(() => {});
});

test("Mission 3 — Refuse un lot amenant le total au-delà de 10 pièces jointes (400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const initialAttachments = Array.from({ length: 9 }, (_, i) => ({
    originalName: `f${i}.pdf`,
    storedName: `stored_${i}.pdf`,
    mimeType: "application/pdf",
    size: 1000,
    family: "pdf",
    isCover: false,
  }));

  const post = await Post.create({
    author: author._id,
    title: "Post 9 Fichiers",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
    attachments: initialAttachments,
  });

  const form = new FormData();
  form.append("files", new Blob([SAMPLE_PNG], { type: "image/png" }), "p1.png");
  form.append("files", new Blob([SAMPLE_PNG], { type: "image/png" }), "p2.png");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /quota/i);

  const postInDb = await Post.findById(post._id);
  assert.equal(postInDb.attachments.length, 9);
});

test("Mission 3 — Refuse un lot amenant le total au-delà de 50 Mo cumulés (400)", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const initialAttachments = [
    {
      originalName: "gros1.mp3",
      storedName: "stored_gros1.mp3",
      mimeType: "audio/mpeg",
      size: 20 * 1024 * 1024,
      family: "audio",
      isCover: false,
    },
    {
      originalName: "gros2.mp3",
      storedName: "stored_gros2.mp3",
      mimeType: "audio/mpeg",
      size: 20 * 1024 * 1024,
      family: "audio",
      isCover: false,
    },
  ];

  const post = await Post.create({
    author: author._id,
    title: "Post 40 Mo",
    shortDescription: "Description",
    content: "Contenu",
    category: "Papercraft",
    tags: ["paper"],
    status: "draft",
    attachments: initialAttachments,
  });

  const audio15Mo = Buffer.concat([SAMPLE_MP3, Buffer.alloc(15 * 1024 * 1024, 0x33)]);
  const form = new FormData();
  form.append("files", new Blob([audio15Mo], { type: "audio/mpeg" }), "ajout15.mp3");

  const res = await fetch(`${base}/api/posts/${post._id}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorToken}` },
    body: form,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /quota/i);

  const postInDb = await Post.findById(post._id);
  assert.equal(postInDb.attachments.length, 2);
});

test("Mission 3 — VRAI TEST DE CONCURRENCE SUR BASE ISOLÉE : 2 uploads simultanés ne peuvent jamais dépasser le quota de 10", async () => {
  const { user: author, token: authorToken } = await setupUser();
  const initialAttachments = Array.from({ length: 8 }, (_, i) => ({
    originalName: `existing_${i}.pdf`,
    storedName: `stored_conc_${i}.pdf`,
    mimeType: "application/pdf",
    size: 1000,
    family: "pdf",
    isCover: false,
  }));

  const post = await Post.create({
    author: author._id,
    title: "Post Test Concurrence",
    shortDescription: "Description concurrence",
    content: "Contenu",
    category: "Origami",
    tags: ["origami"],
    status: "draft",
    attachments: initialAttachments,
  });

  const form1 = new FormData();
  form1.append("files", new Blob([SAMPLE_PNG], { type: "image/png" }), "conc1_a.png");
  form1.append("files", new Blob([SAMPLE_PNG], { type: "image/png" }), "conc1_b.png");

  const form2 = new FormData();
  form2.append("files", new Blob([SAMPLE_PNG], { type: "image/png" }), "conc2_a.png");
  form2.append("files", new Blob([SAMPLE_PNG], { type: "image/png" }), "conc2_b.png");

  const [res1, res2] = await Promise.all([
    fetch(`${base}/api/posts/${post._id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authorToken}` },
      body: form1,
    }),
    fetch(`${base}/api/posts/${post._id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authorToken}` },
      body: form2,
    }),
  ]);

  const statuses = [res1.status, res2.status].sort();

  // GARANTIE ATOMIQUE DÉMONTRÉE :
  assert.deepEqual(
    statuses,
    [201, 400],
    `L'un des uploads simultanés doit réussir (201) et l'autre échouer (400). Statuts reçus : ${statuses.join(", ")}`
  );

  const postInDb = await Post.findById(post._id);
  assert.equal(
    postInDb.attachments.length,
    10,
    `Le document MongoDB doit contenir exactement 10 pièces jointes, ni plus ni moins ! Actuel : ${postInDb.attachments.length}`
  );
});
