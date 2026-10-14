import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

// 1x1 valid transparent PNG buffer
const VALID_PNG_BUFFER = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

function makeToken(user, iatOffsetSeconds = 0) {
  const payload = {
    sub: user.id || String(user._id),
    email: user.email,
  };
  if (iatOffsetSeconds !== 0) {
    payload.iat = Math.floor(Date.now() / 1000) + iatOffsetSeconds;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test.describe("Mission 2 — Profil Personnel (PUT & GET /api/users/me)", () => {
  test("Lecture du profil étendu avec bio, profileTags et avatarUrl", async () => {
    const user = await User.create({
      name: "Alice Maker",
      email: `alice_${Date.now()}@test.com`,
      password: "password123",
      bio: "Créatrice passionnée de modélisme et papercraft.",
      profileTags: ["lego", "papercraft"],
    });

    const token = makeToken(user);
    const res = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, "Alice Maker");
    assert.equal(body.bio, "Créatrice passionnée de modélisme et papercraft.");
    assert.deepEqual(body.profileTags, ["lego", "papercraft"]);
    assert.equal(body.hasAvatar, false);
    assert.equal(body.avatarUrl, null);
    assert.ok(body.createdAt);
  });

  test("Mise à jour réussie du nom, de la bio et des tags de profil", async () => {
    const user = await User.create({
      name: "Bob Builder",
      email: `bob_${Date.now()}@test.com`,
      password: "password123",
    });

    const token = makeToken(user);
    const updateRes = await fetch(`${base}/api/users/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Bob The Maker",
        bio: "Spécialiste de la découpe laser.",
        profileTags: ["Laser", "Bois", "diy"],
      }),
    });

    assert.equal(updateRes.status, 200);
    const body = await updateRes.json();
    assert.equal(body.name, "Bob The Maker");
    assert.equal(body.bio, "Spécialiste de la découpe laser.");
    // Tags normalisés en minuscules et sans doublons
    assert.deepEqual(body.profileTags, ["laser", "bois", "diy"]);

    // Vérification en base
    const dbUser = await User.findById(user._id);
    assert.equal(dbUser.name, "Bob The Maker");
    assert.equal(dbUser.bio, "Spécialiste de la découpe laser.");
    assert.deepEqual(dbUser.profileTags, ["laser", "bois", "diy"]);
  });

  test("Validation stricte des tags de profil (rejet des caractères interdits)", async () => {
    const user = await User.create({
      name: "Charlie Tag",
      email: `charlie_${Date.now()}@test.com`,
      password: "password123",
    });

    const token = makeToken(user);
    const res = await fetch(`${base}/api/users/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profileTags: ["valid-tag", "invalid tag!"],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.message.includes("Tag invalide"));
  });

  test("Mise à jour de l'email : rejet si déjà utilisé (409) et réémission JWT si valide", async () => {
    const emailA = `user_a_${Date.now()}@test.com`;
    const emailB = `user_b_${Date.now()}@test.com`;

    const userA = await User.create({ name: "User A", email: emailA, password: "password123" });
    const userB = await User.create({ name: "User B", email: emailB, password: "password123" });

    const tokenB = makeToken(userB);

    // Tentative de collision avec l'email de A
    const conflictRes = await fetch(`${base}/api/users/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: emailA }),
    });

    assert.equal(conflictRes.status, 409);

    // Mise à jour avec un email disponible
    const newEmail = `user_b_new_${Date.now()}@test.com`;
    const successRes = await fetch(`${base}/api/users/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: newEmail }),
    });

    assert.equal(successRes.status, 200);
    const successBody = await successRes.json();
    assert.equal(successBody.email, newEmail);
    assert.ok(successBody.token, "Un nouveau JWT doit être fourni lors d'un changement d'email");

    // Le nouveau token est immédiatement valide
    const checkRes = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `Bearer ${successBody.token}` },
    });
    assert.equal(checkRes.status, 200);
  });
});

test.describe("Mission 2 — Gestion de l'Avatar (POST, GET, DELETE)", () => {
  test("Upload réussi d'un avatar PNG valide, consultation publique et suppression", async () => {
    const user = await User.create({
      name: "David Avatar",
      email: `david_${Date.now()}@test.com`,
      password: "password123",
    });

    const token = makeToken(user);

    // 1. Upload de l'avatar
    const form = new FormData();
    form.append("avatar", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "profile.png");

    const uploadRes = await fetch(`${base}/api/users/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    assert.equal(uploadRes.status, 200);
    const uploadBody = await uploadRes.json();
    assert.equal(uploadBody.hasAvatar, true);
    assert.equal(uploadBody.avatarUrl, `/api/users/${user._id}/avatar`);

    // 2. Consultation publique de l'avatar
    const getRes = await fetch(`${base}/api/users/${user._id}/avatar`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get("content-type"), "image/png");
    assert.ok(getRes.headers.get("cache-control")?.includes("max-age=86400"));

    const imgBytes = await getRes.arrayBuffer();
    assert.equal(imgBytes.byteLength, VALID_PNG_BUFFER.byteLength);

    // 3. Remplacement de l'avatar (vérifie que l'ancien fichier sur disque est nettoyé)
    const userBeforeSecondUpload = await User.findById(user._id);
    const firstAvatarPath = path.resolve("data/uploads/avatars", userBeforeSecondUpload.avatar.storedName);
    assert.ok(fs.existsSync(firstAvatarPath), "Le premier avatar doit exister sur disque");

    const secondForm = new FormData();
    secondForm.append("avatar", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "profile2.png");

    const secondUploadRes = await fetch(`${base}/api/users/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: secondForm,
    });
    assert.equal(secondUploadRes.status, 200);

    assert.ok(!fs.existsSync(firstAvatarPath), "L'ancien fichier avatar doit avoir été supprimé sur disque");

    // 4. Suppression de l'avatar
    const deleteRes = await fetch(`${base}/api/users/me/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(deleteRes.status, 204);

    // 5. La consultation publique renvoie maintenant 404
    const getAfterDeleteRes = await fetch(`${base}/api/users/${user._id}/avatar`);
    assert.equal(getAfterDeleteRes.status, 404);
  });

  test("Rejet d'un fichier corrompu ou falsifié (magic bytes invalides)", async () => {
    const user = await User.create({
      name: "Eva FakeImage",
      email: `eva_${Date.now()}@test.com`,
      password: "password123",
    });

    const token = makeToken(user);
    const form = new FormData();
    form.append("avatar", new Blob([Buffer.from("FAKE IMAGE CONTENT NOT A PNG")], { type: "image/png" }), "hacked.png");

    const res = await fetch(`${base}/api/users/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.message.includes("Contenu de l'image invalide"));
  });

  test("GET /api/users/:id/avatar renvoie 404 si le créateur est suspendu", async () => {
    const user = await User.create({
      name: "Suspended Creator",
      email: `suspended_${Date.now()}@test.com`,
      password: "password123",
      status: "suspended",
      avatar: {
        storedName: "dummy.png",
        originalName: "dummy.png",
        mimeType: "image/png",
        size: 100,
      },
    });

    const res = await fetch(`${base}/api/users/${user._id}/avatar`);
    assert.equal(res.status, 404);
  });
});

test.describe("Mission 2 — Mot de Passe & Invalidation Réelle des JWT (PUT /api/users/me/password)", () => {
  test("Mot de passe actuel incorrect renvoie STRICTEMENT 400 (et non 401 pour préserver la session Angular)", async () => {
    const user = await User.create({
      name: "Frank Pass",
      email: `frank_${Date.now()}@test.com`,
      password: "currentPassword123",
    });

    const token = makeToken(user);

    const res = await fetch(`${base}/api/users/me/password`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "wrongPassword999",
        newPassword: "brandNewPassword123",
      }),
    });

    // RÈGLE CONTRACTUELLE ESSENTIELLE : 400 Bad Request, JAMAIS 401
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.message, "Mot de passe actuel incorrect");
  });

  test("Changement de mot de passe réussi : nouveau token fourni et invalidation des JWTs antérieurs", async () => {
    const user = await User.create({
      name: "Grace MultiSession",
      email: `grace_${Date.now()}@test.com`,
      password: "oldPassword123",
    });

    // Ancien token émis 10 secondes dans le passé (simulant une autre session sur mobile)
    const oldSessionToken = makeToken(user, -10);

    // Vérification : l'ancien token fonctionne avant le changement de mot de passe
    const beforeRes = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `Bearer ${oldSessionToken}` },
    });
    assert.equal(beforeRes.status, 200);

    // Mise à jour du mot de passe
    const updateRes = await fetch(`${base}/api/users/me/password`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${oldSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "oldPassword123",
        newPassword: "superNewPassword456",
      }),
    });

    assert.equal(updateRes.status, 200);
    const updateBody = await updateRes.json();
    assert.ok(updateBody.token, "Un nouveau token pour la session courante doit être fourni");
    assert.equal(updateBody.message, "Mot de passe mis à jour avec succès");

    // 1. L'ancien token doit maintenant être FORMELLEMENT RÉVOQUÉ (401)
    const afterOldTokenRes = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `Bearer ${oldSessionToken}` },
    });
    assert.equal(afterOldTokenRes.status, 401);
    const afterOldBody = await afterOldTokenRes.json();
    assert.ok(afterOldBody.message.includes("révoqué"));

    // 2. Le nouveau token émis lors du changement fonctionne parfaitement
    const afterNewTokenRes = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `Bearer ${updateBody.token}` },
    });
    assert.equal(afterNewTokenRes.status, 200);

    // 3. La connexion par login avec l'ancien mot de passe échoue (401)
    const failLoginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "oldPassword123" }),
    });
    assert.equal(failLoginRes.status, 401);

    // 4. La connexion par login avec le nouveau mot de passe réussit (200)
    const successLoginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "superNewPassword456" }),
    });
    assert.equal(successLoginRes.status, 200);
  });
});
