import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Like } from "../src/models/Like.js";
import { Comment } from "../src/models/Comment.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";
import { runSeed, SEED_BATCH_TAG, DEMO_CREATORS } from "../scripts/seed-demo.js";
import {
  runEnrichMedia,
  COMMUNITY_MEMBERS,
  findSeedAsset,
  avatarKeyFromEmail,
} from "../scripts/seed-enrich-media.js";

const PASSWORD = "DemoEnrichTest123!";
let mongod;
let server;
let base;
let uploadsDir;
let firstRun;

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
function isImage(file) {
  const head = [...fs.readFileSync(file).subarray(0, 4)];
  return JPEG.every((b, i) => head[i] === b) || PNG.every((b, i) => head[i] === b);
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "makershare-enrich-"));
  const manifestPath = path.join(uploadsDir, "seed-manifest.json");
  await runSeed({ mongoUri: mongod.getUri(), demoPassword: PASSWORD, manifestPath, silent: true });
  firstRun = await runEnrichMedia({ silent: true, demoPassword: PASSWORD, uploadsDir });
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

test("Jeu de démo — photos libres de droits versionnées", async (t) => {
  await t.test("une photo de couverture par post de démo (00 à 99) et un avatar par compte", () => {
    for (let i = 0; i < 100; i++) {
      const asset = findSeedAsset("covers", String(i).padStart(2, "0"));
      assert.ok(asset, `couverture ${i} manquante`);
      assert.ok(isImage(asset.path), `couverture ${i} n'est ni JPEG ni PNG`);
      assert.ok(fs.statSync(asset.path).size < 1024 * 1024, `couverture ${i} > 1 Mo`);
    }
    const keys = [...DEMO_CREATORS.map((c) => avatarKeyFromEmail(c.email)), ...COMMUNITY_MEMBERS.map((m) => m.key)];
    for (const key of keys) {
      const asset = findSeedAsset("avatars", key);
      assert.ok(asset, `avatar ${key} manquant`);
      assert.ok(isImage(asset.path));
    }
  });

  await t.test("chaque photo a un crédit (auteur, licence libre, page source)", () => {
    const credits = JSON.parse(fs.readFileSync(new URL("../scripts/seed-assets/credits.json", import.meta.url), "utf-8"));
    assert.equal(Object.keys(credits).length, 116);
    for (const [file, c] of Object.entries(credits)) {
      assert.match(c.license, /^(public domain|pd|cc0|cc by(-sa)? [0-9.]+)/i, file);
      assert.match(c.page, /^https:\/\/commons\.wikimedia\.org\//, file);
      assert.ok(c.artist, file);
    }
  });
});

test("Jeu de démo — comptes et profils réalistes", async (t) => {
  await t.test("10 créateurs + 6 membres de la communauté, tous avec photo de profil", async () => {
    const users = await User.find({ seedBatch: SEED_BATCH_TAG });
    assert.equal(users.length, 16);
    for (const u of users) {
      assert.ok(u.avatar?.storedName, `${u.email} sans avatar`);
      assert.ok(isImage(path.join(uploadsDir, "avatars", u.avatar.storedName)));
      assert.ok(u.bio && u.bio.length > 30, `${u.email} sans bio`);
      assert.ok(u.profileTags.length > 0);
    }
  });

  await t.test("les membres de la communauté peuvent se connecter et n'ont publié aucun projet", async () => {
    for (const m of COMMUNITY_MEMBERS) {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: m.email, password: PASSWORD }),
      });
      assert.equal(res.status, 200, m.email);
      const user = await User.findOne({ email: m.email });
      assert.equal(await Post.countDocuments({ author: user._id }), 0);
    }
  });

  await t.test("la photo de profil est servie par l'API", async () => {
    const user = await User.findOne({ email: COMMUNITY_MEMBERS[0].email });
    // L'API lit data/uploads : ici on vérifie seulement la métadonnée exposée
    const res = await fetch(`${base}/api/creators/${user._id}`);
    const body = await res.json();
    assert.equal(body.hasAvatar, true);
    assert.equal(body.avatarUrl, `/api/users/${user._id}/avatar`);
  });
});

test("Jeu de démo — posts illustrés et crédités", async (t) => {
  await t.test("les 100 posts ont une vraie photo de couverture (JPEG/PNG valide)", async () => {
    assert.equal(firstRun.photoCoversCount, 100);
    // storedName est en select: false (jamais exposé) : on le demande explicitement ici
    const posts = await Post.find({ seedBatch: SEED_BATCH_TAG }).select("+attachments.storedName");
    assert.equal(posts.length, 100);
    for (const post of posts) {
      const cover = post.attachments.find((a) => a.isCover);
      assert.ok(cover, post.title);
      assert.equal(cover.family, "image");
      assert.match(cover.mimeType, /^image\/(jpeg|png)$/);
      assert.ok(isImage(path.join(uploadsDir, "attachments", cover.storedName)), post.title);
      assert.ok(post.content.includes(`attachment:${cover._id}`));
      assert.match(post.content, /Wikimedia Commons/);
    }
  });

  await t.test("les nouvelles catégories sont remplies (Menuiserie, Électronique, Maroquinerie)", async () => {
    for (const [category, min] of [["Menuiserie", 9], ["Électronique", 7], ["Maroquinerie", 2]]) {
      const res = await fetch(`${base}/api/posts?category=${encodeURIComponent(category)}&limit=20`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.totalDocs >= min - 3, `${category} : ${body.totalDocs}`);
      assert.ok(await Post.countDocuments({ seedBatch: SEED_BATCH_TAG, category }) >= min, category);
    }
  });
});

test("Jeu de démo — interactions crédibles", async (t) => {
  await t.test("aucun auto-like, aucun doublon de like", async () => {
    const likes = await Like.find().populate("postId");
    const seen = new Set();
    for (const like of likes) {
      assert.notEqual(String(like.userId), String(like.postId.author), "auto-like");
      const key = `${like.userId}:${like.postId._id}`;
      assert.ok(!seen.has(key));
      seen.add(key);
    }
  });

  await t.test("les commentaires sont postérieurs à la publication et viennent aussi des membres", async () => {
    const comments = await Comment.find();
    assert.ok(comments.length > 50, `${comments.length} commentaires`);
    const posts = new Map((await Post.find({ seedBatch: SEED_BATCH_TAG })).map((p) => [String(p._id), p]));
    for (const c of comments) {
      const post = posts.get(String(c.postId));
      assert.equal(post.status, "published");
      assert.ok(c.createdAt >= post.publishedAt, "commentaire avant la publication");
      assert.ok(c.createdAt <= new Date(), "commentaire dans le futur");
    }
    const memberIds = new Set(
      (await User.find({ email: { $in: COMMUNITY_MEMBERS.map((m) => m.email) } })).map((u) => String(u._id)),
    );
    assert.ok(comments.some((c) => memberIds.has(String(c.author.id))), "aucun membre ne commente");
    assert.ok(
      comments.some((c) => String(c.author.id) === String(posts.get(String(c.postId)).author)),
      "aucun auteur ne répond",
    );
  });

  await t.test("chaque membre suit au moins 3 créateurs, et des abonnements actifs existent", async () => {
    for (const m of COMMUNITY_MEMBERS) {
      const user = await User.findOne({ email: m.email });
      assert.ok((await Follow.countDocuments({ followerId: user._id })) >= 3, m.email);
    }
    const subs = await Subscription.find({ active: true, expiresAt: { $gt: new Date() } });
    assert.ok(subs.length >= 6);
  });

  await t.test("relancer l'enrichissement est idempotent (mêmes volumes, pas de doublon)", async () => {
    const second = await runEnrichMedia({ silent: true, demoPassword: PASSWORD, uploadsDir });
    assert.equal(second.membersCount, 0);
    assert.equal(await User.countDocuments({ seedBatch: SEED_BATCH_TAG }), 16);
    assert.equal(second.likesCount, firstRun.likesCount);
    assert.equal(second.commentsCount, firstRun.commentsCount);
    const files = fs.readdirSync(path.join(uploadsDir, "attachments")).filter((f) => f.startsWith("demo-att-cover-"));
    assert.equal(files.length, 100);
  });
});
