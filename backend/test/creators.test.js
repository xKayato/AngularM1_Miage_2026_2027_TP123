import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Ensure indexes are built
  await User.syncIndexes();
  await Follow.syncIndexes();
  await Subscription.syncIndexes();
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

let userSeq = 0;
async function createUser(role = "user", status = "active") {
  userSeq++;
  const user = await User.create({
    name: `Creator User ${userSeq}`,
    email: `creator_${userSeq}_${Date.now()}@test.com`,
    passwordHash: "hash123",
    role,
    status,
  });
  const token = jwt.sign({ sub: String(user._id), email: user.email }, JWT_SECRET);
  return { user, token };
}

test("Mission 5 — Follows & Subscriptions — validations préalables", async (t) => {
  await t.test("Rejette le follow si non authentifié (401)", async () => {
    const { user: creator } = await createUser();
    const res = await fetch(`${base}/api/creators/${creator._id}/follow`, {
      method: "POST",
    });
    assert.equal(res.status, 401);
  });

  await t.test("Rejette l'auto-follow (400)", async () => {
    const { user, token } = await createUser();
    const res = await fetch(`${base}/api/creators/${user._id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /lui-même/i);
  });

  await t.test("Rejette l'auto-abonnement (400)", async () => {
    const { user, token } = await createUser();
    const res = await fetch(`${base}/api/creators/${user._id}/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /lui-même/i);
  });

  await t.test("Rejette le follow si créateur introuvable (404)", async () => {
    const { token } = await createUser();
    const ghostId = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/creators/${ghostId}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
  });

  await t.test("Rejette le follow si créateur suspendu (404)", async () => {
    const { token } = await createUser();
    const { user: suspendedCreator } = await createUser("user", "suspended");
    const res = await fetch(`${base}/api/creators/${suspendedCreator._id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
  });

  await t.test("Rejette la souscription si utilisateur appelant est suspendu (403)", async () => {
    const { token: suspendedToken } = await createUser("user", "suspended");
    const { user: creator } = await createUser();
    const resSuspended = await fetch(`${base}/api/creators/${creator._id}/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    assert.equal(resSuspended.status, 403);
  });
});

test("Mission 5 — Follow / Unfollow cycle et transitions de droits", async (t) => {
  const { user: creator } = await createUser();
  const { user: follower, token: followerToken } = await createUser();

  // Créer un post restreint aux followers
  const post = await Post.create({
    author: creator._id,
    title: "Post exclusif followers",
    shortDescription: "Description courte pour followers",
    content: "Contenu followers secret",
    category: "Lego",
    tags: ["exclusif"],
    visibility: "followers",
    status: "published",
    publishedAt: new Date(),
  });

  await t.test("Avant follow : statut non abonné/non follow et accès refusé (403)", async () => {
    const statusRes = await fetch(`${base}/api/creators/${creator._id}/status`, {
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(status.isFollowing, false);
    assert.equal(status.isSubscribed, false);

    const postRes = await fetch(`${base}/api/posts/${post._id}`, {
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(postRes.status, 403);
  });

  await t.test("Action POST /follow : active le follow (200) et idempotence", async () => {
    const res1 = await fetch(`${base}/api/creators/${creator._id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.following, true);

    // Clic répété (idempotence)
    const res2 = await fetch(`${base}/api/creators/${creator._id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.following, true);

    // Vérifier en base : 1 seul document Follow
    const count = await Follow.countDocuments({
      followerId: follower._id,
      creatorId: creator._id,
    });
    assert.equal(count, 1);
  });

  await t.test("Après follow : accès au post followers débloqué (200)", async () => {
    const postRes = await fetch(`${base}/api/posts/${post._id}`, {
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.title, "Post exclusif followers");
  });

  await t.test("Action DELETE /follow : retire le follow (200)", async () => {
    const delRes = await fetch(`${base}/api/creators/${creator._id}/follow`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.following, false);

    const count = await Follow.countDocuments({
      followerId: follower._id,
      creatorId: creator._id,
    });
    assert.equal(count, 0);
  });

  await t.test("Après unfollow : accès au post followers à nouveau refusé (403)", async () => {
    const postRes = await fetch(`${base}/api/posts/${post._id}`, {
      headers: { Authorization: `Bearer ${followerToken}` },
    });
    assert.equal(postRes.status, 403);
  });
});

test("Mission 5 — Abonnements simulés de 30 jours, non prolongation et renouvellement", async (t) => {
  const { user: creator } = await createUser();
  const { user: subscriber, token: subToken } = await createUser();

  const subPost = await Post.create({
    author: creator._id,
    title: "Post VIP abonnés",
    shortDescription: "Description courte pour abonnés VIP",
    content: "Contenu VIP secret",
    category: "Origami",
    tags: ["vip"],
    visibility: "subscribers",
    status: "published",
    publishedAt: new Date(),
  });

  let originalExpiresAt;

  await t.test("Avant abonnement : accès refusé au post abonnés (403)", async () => {
    const res = await fetch(`${base}/api/posts/${subPost._id}`, {
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test("Souscription initiale : retourne 201 avec expiration à J+30", async () => {
    const res = await fetch(`${base}/api/creators/${creator._id}/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.subscribed, true);
    assert.ok(body.expiresAt);
    originalExpiresAt = body.expiresAt;

    const expDate = new Date(body.expiresAt);
    const diffDays = Math.round((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    assert.ok(diffDays >= 29 && diffDays <= 30);
  });

  await t.test("Abonnement actif ne donne PAS automatiquement le droit follow", async () => {
    // Vérifier que le statut n'indique pas isFollowing
    const statusRes = await fetch(`${base}/api/creators/${creator._id}/status`, {
      headers: { Authorization: `Bearer ${subToken}` },
    });
    const status = await statusRes.json();
    assert.equal(status.isSubscribed, true);
    assert.equal(status.isFollowing, false);

    // Vérifier qu'un document Follow n'a pas été créé
    const followExists = await Follow.exists({
      followerId: subscriber._id,
      creatorId: creator._id,
    });
    assert.equal(Boolean(followExists), false);
  });

  await t.test("Abonnement actif débloque le post 'subscribers' (200)", async () => {
    const res = await fetch(`${base}/api/posts/${subPost._id}`, {
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.title, "Post VIP abonnés");
  });

  await t.test("Double souscription alors qu'actif : renvoie 409 Conflict sans prolonger la date", async () => {
    const res = await fetch(`${base}/api/creators/${creator._id}/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.match(body.message, /déjà actif/i);
    assert.equal(body.expiresAt, originalExpiresAt);

    // Vérifier en base que la date d'expiration n'a pas bougé
    const doc = await Subscription.findOne({
      subscriberId: subscriber._id,
      creatorId: creator._id,
    });
    assert.equal(doc.expiresAt.toISOString(), originalExpiresAt);
  });

  await t.test("Expiration de l'abonnement : bloque à nouveau l'accès aux posts (403)", async () => {
    // Simuler l'expiration en base
    const pastDate = new Date(Date.now() - 3600 * 1000);
    await Subscription.updateOne(
      { subscriberId: subscriber._id, creatorId: creator._id },
      { $set: { expiresAt: pastDate } }
    );

    const res = await fetch(`${base}/api/posts/${subPost._id}`, {
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(res.status, 403);

    // Statut créateur doit indiquer non abonné
    const statusRes = await fetch(`${base}/api/creators/${creator._id}/status`, {
      headers: { Authorization: `Bearer ${subToken}` },
    });
    const status = await statusRes.json();
    assert.equal(status.isSubscribed, false);
  });

  await t.test("Renouvellement après expiration : accordé (201) et réactive l'accès", async () => {
    const res = await fetch(`${base}/api/creators/${creator._id}/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.subscribed, true);
    assert.ok(body.expiresAt);
    assert.notEqual(body.expiresAt, originalExpiresAt);

    // Accès à nouveau autorisé
    const postRes = await fetch(`${base}/api/posts/${subPost._id}`, {
      headers: { Authorization: `Bearer ${subToken}` },
    });
    assert.equal(postRes.status, 200);

    // Vérifier qu'il n'y a toujours qu'un SEUL document d'abonnement en base
    const count = await Subscription.countDocuments({
      subscriberId: subscriber._id,
      creatorId: creator._id,
    });
    assert.equal(count, 1);
  });
});

test("Mission 5 — Deux souscriptions concurrentes simultanées sur base MongoDB isolée", async () => {
  const { user: creator } = await createUser();
  const { user: subscriber, token: subToken } = await createUser();

  // Déclencher deux appels simultanés via Promise.all
  const [res1, res2] = await Promise.all([
    fetch(`${base}/api/creators/${creator._id}/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${subToken}` },
    }),
    fetch(`${base}/api/creators/${creator._id}/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${subToken}` },
    }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  // Exactement une souscription réussie (201) et une rejetée en conflit (409)
  assert.deepEqual(statuses, [201, 409], "L'une des requêtes doit obtenir 201 et l'autre 409");

  // Vérifier qu'un SEUL document Subscription existe en base de données MongoDB
  const totalDocs = await Subscription.countDocuments({
    subscriberId: subscriber._id,
    creatorId: creator._id,
  });
  assert.equal(totalDocs, 1, "Il doit exister exactement 1 document dans la collection Subscription");
});

test("Mission III — GET /api/creators/my/follows (authentification, pagination et exclusion suspendus)", async (t) => {
  await t.test("Rejette si non authentifié (401)", async () => {
    const res = await fetch(`${base}/api/creators/my/follows`);
    assert.equal(res.status, 401);
  });

  await t.test("Rejette si utilisateur suspendu (403)", async () => {
    const { token } = await createUser("user", "suspended");
    const res = await fetch(`${base}/api/creators/my/follows`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test("Retourne la liste paginée et exclut les créateurs suspendus de totalDocs", async () => {
    const { user: me, token } = await createUser();
    const { user: c1 } = await createUser("user", "active");
    const { user: c2 } = await createUser("user", "active");
    const { user: suspendedCreator } = await createUser("user", "suspended");

    // Création de 3 follows
    await Follow.create({ followerId: me._id, creatorId: c1._id });
    await Follow.create({ followerId: me._id, creatorId: c2._id });
    await Follow.create({ followerId: me._id, creatorId: suspendedCreator._id });

    const res = await fetch(`${base}/api/creators/my/follows?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();

    // totalDocs doit être 2 (le créateur suspendu est exclu AVANT pagination)
    assert.equal(body.totalDocs, 2);
    assert.equal(body.docs.length, 2);
    assert.equal(body.page, 1);
    assert.equal(body.limit, 10);
    assert.ok(body.docs[0].creator.id);
    assert.ok(body.docs[0].creator.name);

    // Vérifier pagination limit=1
    const resPaged = await fetch(`${base}/api/creators/my/follows?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bodyPaged = await resPaged.json();
    assert.equal(bodyPaged.totalDocs, 2);
    assert.equal(bodyPaged.totalPages, 2);
    assert.equal(bodyPaged.docs.length, 1);
    assert.equal(bodyPaged.hasNextPage, true);
  });
});

test("Mission III — GET /api/creators/my/subscriptions (abonnements actifs uniquement et exclusion suspendus)", async (t) => {
  await t.test("Rejette si non authentifié (401)", async () => {
    const res = await fetch(`${base}/api/creators/my/subscriptions`);
    assert.equal(res.status, 401);
  });

  await t.test("Retourne uniquement les abonnements actifs et non expirés", async () => {
    const { user: me, token } = await createUser();
    const { user: activeCreator } = await createUser("user", "active");
    const { user: expiredCreator } = await createUser("user", "active");
    const { user: inactiveCreator } = await createUser("user", "active");
    const { user: suspendedCreator } = await createUser("user", "suspended");

    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const past = new Date(Date.now() - 1000);

    // 1. Abonnement actif valide
    await Subscription.create({
      subscriberId: me._id,
      creatorId: activeCreator._id,
      active: true,
      expiresAt: future,
    });

    // 2. Abonnement expiré
    await Subscription.create({
      subscriberId: me._id,
      creatorId: expiredCreator._id,
      active: true,
      expiresAt: past,
    });

    // 3. Abonnement désactivé
    await Subscription.create({
      subscriberId: me._id,
      creatorId: inactiveCreator._id,
      active: false,
      expiresAt: future,
    });

    // 4. Abonnement actif mais créateur suspendu
    await Subscription.create({
      subscriberId: me._id,
      creatorId: suspendedCreator._id,
      active: true,
      expiresAt: future,
    });

    const res = await fetch(`${base}/api/creators/my/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();

    // Seul le premier abonnement doit être retourné
    assert.equal(body.totalDocs, 1);
    assert.equal(body.docs.length, 1);
    assert.equal(body.docs[0].creator.id, String(activeCreator._id));
    assert.equal(body.docs[0].active, true);
    assert.ok(body.docs[0].expiresAt);
  });
});
