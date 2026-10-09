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
    name: `Like User ${userSeq}`,
    email: `like_${userSeq}_${Date.now()}@test.com`,
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
    title: options.title || "Tutoriel DIY pour Likes",
    shortDescription: options.shortDescription || "Description courte pour tester les likes",
    content: options.content || "Contenu complet du tutoriel DIY",
    category: options.category || "Lego",
    tags: options.tags || ["test", "likes"],
    visibility: options.visibility || "public",
    status: options.status || "published",
    publishedAt: options.publishedAt || new Date(),
  });
}

test("Mission 6 — Validations préalables, refus d'auto-like et comptes suspendus", async (t) => {
  const { user: author, token: authorToken } = await createUser();
  const { user: reader, token: readerToken } = await createUser();
  const { user: suspendedUser, token: suspendedToken } = await createUser("user", "suspended");
  const post = await createPost(author._id);

  await t.test("Rejette le like non authentifié (401)", async () => {
    const res = await fetch(`${base}/api/posts/${post._id}/like`, { method: "POST" });
    assert.equal(res.status, 401);
  });

  await t.test("Rejette le like si compte suspendu (403)", async () => {
    const res = await fetch(`${base}/api/posts/${post._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /suspendu/i);
  });

  await t.test("Rejette l'auto-like : auteur tentant de liker son propre post (400)", async () => {
    const res = await fetch(`${base}/api/posts/${post._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authorToken}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /propre post/i);
  });

  await t.test("Rejette l'auto-unlike pour l'auteur (400)", async () => {
    const res = await fetch(`${base}/api/posts/${post._id}/like`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authorToken}` },
    });
    assert.equal(res.status, 400);
  });

  await t.test("Rejette sur identifiant invalide (400) ou post introuvable (404)", async () => {
    const resInvalid = await fetch(`${base}/api/posts/not-an-id/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    assert.equal(resInvalid.status, 400);

    const ghostId = new mongoose.Types.ObjectId();
    const resNotFound = await fetch(`${base}/api/posts/${ghostId}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    assert.equal(resNotFound.status, 404);
  });
});

test("Mission 6 — Matrice d'accès et interdiction de liker sans droit de lecture", async (t) => {
  const { user: author } = await createUser();
  const { user: reader, token: readerToken } = await createUser();

  await t.test("Rejette le like sur un brouillon draft d'autrui (404)", async () => {
    const draft = await createPost(author._id, { status: "draft" });
    const res = await fetch(`${base}/api/posts/${draft._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    assert.equal(res.status, 404);
  });

  await t.test("Rejette le like sur un post archivé (410)", async () => {
    const archived = await createPost(author._id, { status: "archived" });
    const res = await fetch(`${base}/api/posts/${archived._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    assert.equal(res.status, 410);
  });

  await t.test("Rejette le like si l'auteur du post est suspendu (404)", async () => {
    const { user: suspendedAuthor } = await createUser("user", "suspended");
    const postSuspended = await createPost(suspendedAuthor._id);
    const res = await fetch(`${base}/api/posts/${postSuspended._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    assert.equal(res.status, 404);
  });

  await t.test("Post followers : refus 403 avant follow, accord 200 après follow", async () => {
    const postFollowers = await createPost(author._id, { visibility: "followers" });

    // 1. Refus avant follow
    const resBefore = await fetch(`${base}/api/posts/${postFollowers._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    assert.equal(resBefore.status, 403);

    // 2. L'utilisateur suit l'auteur
    await Follow.create({ followerId: reader._id, creatorId: author._id });

    // 3. Like désormais autorisé
    const resAfter = await fetch(`${base}/api/posts/${postFollowers._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${readerToken}` },
    });
    assert.equal(resAfter.status, 200);
    const body = await resAfter.json();
    assert.equal(body.liked, true);
    assert.equal(body.likesCount, 1);
  });

  await t.test("Post subscribers : refus 403 avant abonnement, accord 200 après abonnement", async () => {
    const { user: subscriber, token: subToken } = await createUser();
    const postSub = await createPost(author._id, { visibility: "subscribers" });

    // 1. Refus avant souscription
    const resBefore = await fetch(`${base}/api/posts/${postSub._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(resBefore.status, 403);

    // 2. Activation abonnement
    await Subscription.create({
      subscriberId: subscriber._id,
      creatorId: author._id,
      active: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });

    // 3. Like autorisé
    const resAfter = await fetch(`${base}/api/posts/${postSub._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(resAfter.status, 200);
    const body = await resAfter.json();
    assert.equal(body.liked, true);
    assert.equal(body.likesCount, 1);
  });
});

test("Mission 6 — Unicité réelle { userId, postId }, clics répétés et deux likes simultanés", async (t) => {
  const { user: author } = await createUser();
  const { user: userA, token: tokenA } = await createUser();
  const post = await createPost(author._id);

  await t.test("Premier like : renvoie 200 avec liked=true et likesCount=1", async () => {
    const res = await fetch(`${base}/api/posts/${post._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.liked, true);
    assert.equal(body.likesCount, 1);

    const docCount = await Like.countDocuments({ postId: post._id, userId: userA._id });
    assert.equal(docCount, 1);
  });

  await t.test("Clic répété / double clic : idempotent, renvoie 200 sans incrémenter à nouveau", async () => {
    const res = await fetch(`${base}/api/posts/${post._id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.liked, true);
    assert.equal(body.likesCount, 1);

    const docCount = await Like.countDocuments({ postId: post._id, userId: userA._id });
    assert.equal(docCount, 1);
  });

  await t.test("Deux likes simultanés concurrents (Promise.all) sur MongoDB isolé", async () => {
    const { user: userB, token: tokenB } = await createUser();

    const [res1, res2] = await Promise.all([
      fetch(`${base}/api/posts/${post._id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenB}` },
      }),
      fetch(`${base}/api/posts/${post._id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenB}` },
      }),
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    const b1 = await res1.json();
    const b2 = await res2.json();
    assert.equal(b1.liked, true);
    assert.equal(b2.liked, true);

    // Exactement 1 seul document pour userB en BDD
    const docCountB = await Like.countDocuments({ postId: post._id, userId: userB._id });
    assert.equal(docCountB, 1);

    // Total de likes sur le post = 2 (userA + userB)
    const totalLikes = await Like.countDocuments({ postId: post._id });
    assert.equal(totalLikes, 2);
  });
});

test("Mission 6 — Unlike et unlike répété (idempotence)", async (t) => {
  const { user: author } = await createUser();
  const { user: userA, token: tokenA } = await createUser();
  const post = await createPost(author._id);

  // Like initial
  await fetch(`${base}/api/posts/${post._id}/like`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(await Like.countDocuments({ postId: post._id }), 1);

  // Premier unlike
  const delRes1 = await fetch(`${base}/api/posts/${post._id}/like`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(delRes1.status, 200);
  const delBody1 = await delRes1.json();
  assert.equal(delBody1.liked, false);
  assert.equal(delBody1.likesCount, 0);

  // Unlike répété (idempotence)
  const delRes2 = await fetch(`${base}/api/posts/${post._id}/like`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(delRes2.status, 200);
  const delBody2 = await delRes2.json();
  assert.equal(delBody2.liked, false);
  assert.equal(delBody2.likesCount, 0);
});

test("Mission 6 — Cohérence du comptage : catalogue, aperçu et détail affichent le même nombre calculé", async () => {
  const { user: author } = await createUser();
  const { user: user1, token: token1 } = await createUser();
  const { user: user2, token: token2 } = await createUser();
  const { user: user3, token: token3 } = await createUser();
  const post = await createPost(author._id, { title: "Post pour audit cohérence" });

  // 3 utilisateurs distincts likent le post
  await fetch(`${base}/api/posts/${post._id}/like`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token1}` },
  });
  await fetch(`${base}/api/posts/${post._id}/like`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token2}` },
  });
  await fetch(`${base}/api/posts/${post._id}/like`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token3}` },
  });

  // 1. Vérification dans GET /api/posts (catalogue)
  const catalogRes = await fetch(`${base}/api/posts?query=audit`);
  assert.equal(catalogRes.status, 200);
  const catalogData = await catalogRes.json();
  const postInCatalog = catalogData.docs.find((p) => p.id === String(post._id));
  assert.ok(postInCatalog);
  assert.equal(postInCatalog.likesCount, 3);

  // 2. Vérification dans GET /api/posts/:id/preview (aperçu)
  const previewRes = await fetch(`${base}/api/posts/${post._id}/preview`);
  assert.equal(previewRes.status, 200);
  const previewData = await previewRes.json();
  assert.equal(previewData.likesCount, 3);

  // 3. Vérification dans GET /api/posts/:id (détail complet avec statut isLiked)
  const detailUser1Res = await fetch(`${base}/api/posts/${post._id}`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  assert.equal(detailUser1Res.status, 200);
  const detail1 = await detailUser1Res.json();
  assert.equal(detail1.likesCount, 3);
  assert.equal(detail1.userInteractions.isLiked, true);

  // 4. Utilisateur anonyme sur détail : likesCount = 3, isLiked = false
  const anonDetailRes = await fetch(`${base}/api/posts/${post._id}`);
  assert.equal(anonDetailRes.status, 200);
  const anonDetail = await anonDetailRes.json();
  assert.equal(anonDetail.likesCount, 3);
  assert.equal(anonDetail.userInteractions.isLiked, false);

  // 5. Vérification qu'aucun champ likesCount n'est persisté sur le modèle Post
  const rawPostDoc = await Post.findById(post._id).lean();
  assert.equal(rawPostDoc.likesCount, undefined, "Le document Post ne doit pas stocker de likesCount dénormalisé");
});
