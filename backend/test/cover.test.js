import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { toPostPreview } from "../src/utils/postProjections.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

function makeToken(user) {
  return jwt.sign(
    { sub: user.id || String(user._id), email: user.email },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
  await Post.syncIndexes();

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test.describe("Mission 3 — Gestion de la Couverture (PUT /api/posts/:id/cover)", () => {
  async function setupPostWithAttachments() {
    const author = await User.create({
      name: "Arthur Cover",
      email: `arthur_${Date.now()}_${Math.random()}@test.com`,
      password: "password123",
    });
    const authorToken = makeToken(author);

    const stranger = await User.create({
      name: "Stranger User",
      email: `stranger_${Date.now()}_${Math.random()}@test.com`,
      password: "password123",
    });
    const strangerToken = makeToken(stranger);

    const imgId1 = new mongoose.Types.ObjectId();
    const imgId2 = new mongoose.Types.ObjectId();
    const pdfId = new mongoose.Types.ObjectId();

    const post = await Post.create({
      author: author._id,
      title: "Projet avec multi-images et couverture",
      shortDescription: "Description détaillée pour test de couverture",
      content: "Contenu complet du projet avec images et notices",
      category: "Lego",
      tags: ["lego", "cover-test"],
      visibility: "public",
      status: "published",
      attachments: [
        {
          _id: imgId1,
          originalName: "plan-principal.png",
          storedName: "disk_plan_1.png",
          mimeType: "image/png",
          size: 1024,
          family: "image",
          isCover: false,
        },
        {
          _id: imgId2,
          originalName: "photo-face.jpg",
          storedName: "disk_photo_2.jpg",
          mimeType: "image/jpeg",
          size: 2048,
          family: "image",
          isCover: true,
        },
        {
          _id: pdfId,
          originalName: "notice-technique.pdf",
          storedName: "disk_notice.pdf",
          mimeType: "application/pdf",
          size: 4096,
          family: "pdf",
          isCover: false,
        },
      ],
      publishedAt: new Date(),
    });

    return { author, authorToken, stranger, strangerToken, post, imgId1, imgId2, pdfId };
  }

  test("Sélection réussie d'une image comme couverture", async () => {
    const { authorToken, post, imgId1 } = await setupPostWithAttachments();

    const res = await fetch(`${base}/api/posts/${post._id}/cover`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId: String(imgId1) }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, String(post._id));

    // Vérifier en base que imgId1 est isCover: true et les autres isCover: false
    const fresh = await Post.findById(post._id);
    const att1 = fresh.attachments.id(imgId1);
    const att2 = fresh.attachments.find((a) => a.originalName === "photo-face.jpg");
    assert.equal(att1.isCover, true);
    assert.equal(att2.isCover, false);

    // toPostPreview renvoie l'URL de imgId1
    const preview = toPostPreview(fresh, { likesCount: 0 });
    assert.equal(preview.coverUrl, `/api/posts/${post._id}/attachments/${imgId1}`);
  });

  test("Retrait explicite de la couverture (attachmentId: null)", async () => {
    const { authorToken, post } = await setupPostWithAttachments();

    const res = await fetch(`${base}/api/posts/${post._id}/cover`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId: null }),
    });

    assert.equal(res.status, 200);

    const fresh = await Post.findById(post._id);
    assert.ok(fresh.attachments.every((a) => a.isCover === false));

    // Vérification cruciale : aucun fallback automatique sur la première image !
    const preview = toPostPreview(fresh, { likesCount: 0 });
    assert.equal(preview.coverUrl, null, "La coverUrl doit être null quand l'auteur a retiré la couverture");
  });

  test("Rejet si la pièce jointe n'est pas une image (PDF)", async () => {
    const { authorToken, post, pdfId } = await setupPostWithAttachments();

    const res = await fetch(`${base}/api/posts/${post._id}/cover`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId: String(pdfId) }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /image/i);
  });

  test("Rejet si la pièce jointe n'existe pas sur le post", async () => {
    const { authorToken, post } = await setupPostWithAttachments();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await fetch(`${base}/api/posts/${post._id}/cover`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId: String(fakeId) }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /n'existe pas/i);
  });

  test("Rejet si l'utilisateur n'est pas l'auteur (403 Forbidden)", async () => {
    const { strangerToken, post, imgId1 } = await setupPostWithAttachments();

    const res = await fetch(`${base}/api/posts/${post._id}/cover`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${strangerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId: String(imgId1) }),
    });

    assert.equal(res.status, 403);
  });

  test("Rejet si le post est archivé (400 Bad Request)", async () => {
    const { authorToken, post, imgId1 } = await setupPostWithAttachments();
    post.status = "archived";
    post.archivedAt = new Date();
    await post.save();

    const res = await fetch(`${base}/api/posts/${post._id}/cover`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId: String(imgId1) }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /archivé/i);
  });

  test("Garantie atomique de l'unicité de la couverture sous concurrence", async () => {
    const { authorToken, post, imgId1, imgId2 } = await setupPostWithAttachments();

    // Deux requêtes simultanées tentant de définir deux couvertures différentes
    const [res1, res2] = await Promise.all([
      fetch(`${base}/api/posts/${post._id}/cover`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${authorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attachmentId: String(imgId1) }),
      }),
      fetch(`${base}/api/posts/${post._id}/cover`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${authorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attachmentId: String(imgId2) }),
      }),
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    const fresh = await Post.findById(post._id);
    const coverCount = fresh.attachments.filter((a) => a.isCover === true).length;
    assert.equal(coverCount, 1, "Une et une seule image doit être définie comme couverture");
  });
});
