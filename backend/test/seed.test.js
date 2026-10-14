import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";
import { MongoMemoryServer } from "mongodb-memory-server";
import { runSeed, SEED_BATCH_TAG, DEMO_CREATORS } from "../scripts/seed-demo.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Like } from "../src/models/Like.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";
import { ShareLink } from "../src/models/ShareLink.js";
import { Track } from "../src/models/Track.js";

let mongod;
let testManifestPath;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
  await Post.syncIndexes();
  await Like.syncIndexes();
  await Follow.syncIndexes();
  await Subscription.syncIndexes();
  await ShareLink.syncIndexes();
  await Track.syncIndexes();

  testManifestPath = path.join(os.tmpdir(), `test-seed-manifest-${Date.now()}.json`);
});

test.after(async () => {
  if (fs.existsSync(testManifestPath)) {
    try {
      await fsPromises.unlink(testManifestPath);
    } catch {}
  }
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test("Seed Dataset — Validation de sécurité du mot de passe", async (t) => {
  await t.test("Refuse formellement d'exécuter le seed si DEMO_PASSWORD est manquant", async () => {
    await assert.rejects(
      async () => {
        await runSeed({
          demoPassword: "",
          manifestPath: testManifestPath,
          silent: true,
        });
      },
      {
        message: /DEMO_PASSWORD est obligatoire/,
      }
    );
  });
});

test("Seed Dataset — Insertion initiale complète (10 comptes et 100 posts)", async () => {
  // Création préalable d'un vrai utilisateur et d'une vraie piste pour prouver l'isolation
  const realUser = await User.create({
    name: "Vrai Utilisateur Existant",
    email: "real.user@example.com",
    passwordHash: "hash-preexistant",
    role: "user",
    status: "active",
  });

  const realPost = await Post.create({
    author: realUser._id,
    title: "Vraie Création Antérieure",
    shortDescription: "Description d'une création réelle préexistante",
    content: "Contenu intouchable d'un vrai utilisateur",
    category: "Lego",
    tags: ["real-post"],
    status: "published",
    visibility: "public",
  });

  const realTrack = await Track.create({
    title: "Piste Audio Historique TP",
    originalName: "audio.mp3",
    storedName: "audio-uuid.mp3",
    mimeType: "audio/mpeg",
    size: 1024,
    ownerId: realUser._id,
  });

  const demoPass = "SuperSecretDemoPass2026!";
  const result = await runSeed({
    demoPassword: demoPass,
    manifestPath: testManifestPath,
    silent: true,
  });

  assert.equal(result.status, "created");
  assert.equal(result.accountCount, 10);
  assert.equal(result.postCount, 100);

  // Vérification des comptes en base
  const demoUsers = await User.find({ seedBatch: SEED_BATCH_TAG });
  assert.equal(demoUsers.length, 10);

  // Vérification de l'authentification avec le mot de passe (hachage bcrypt vérifié)
  const firstUser = await User.findOne({ email: "demo.alice.lego@makershare.local" }).select("+passwordHash");
  assert.ok(firstUser);
  const passOk = await firstUser.verifyPassword(demoPass);
  assert.equal(passOk, true, "L'utilisateur de démo doit pouvoir s'authentifier avec DEMO_PASSWORD");

  // Vérification des posts en base
  const demoPosts = await Post.find({ seedBatch: SEED_BATCH_TAG });
  assert.equal(demoPosts.length, 100);

  // Vérification de la présence des cas d'acceptation dans les titres
  const origamiPost = await Post.findOne({ title: "Test origami et bases fondamentales" });
  assert.ok(origamiPost, "Le post 'Test origami et bases fondamentales' doit être présent");

  const michaelPost = await Post.findOne({ title: "Figurine Articulée Michael Jackson" });
  assert.ok(michaelPost, "Le post 'Figurine Articulée Michael Jackson' doit être présent");

  // Vérification du manifeste
  assert.ok(fs.existsSync(testManifestPath));
  const manifestRaw = await fsPromises.readFile(testManifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.accountIds.length, 10);
  assert.equal(manifest.postIds.length, 100);

  // Vérification de la non-altération des données réelles
  const checkRealUser = await User.findById(realUser._id);
  assert.ok(checkRealUser);
  const checkRealPost = await Post.findById(realPost._id);
  assert.ok(checkRealPost);
  const checkRealTrack = await Track.findById(realTrack._id);
  assert.ok(checkRealTrack);
});

test("Seed Dataset — Idempotence stricte lors d'une seconde exécution", async () => {
  const demoPass = "SuperSecretDemoPass2026!";
  const result2 = await runSeed({
    demoPassword: demoPass,
    manifestPath: testManifestPath,
    silent: true,
  });

  assert.equal(result2.status, "already_seeded");
  assert.equal(result2.accountCount, 10);
  assert.equal(result2.postCount, 100);

  // Aucun doublon en base
  const demoUsers = await User.find({ seedBatch: SEED_BATCH_TAG });
  assert.equal(demoUsers.length, 10);
  const demoPosts = await Post.find({ seedBatch: SEED_BATCH_TAG });
  assert.equal(demoPosts.length, 100);
});

test("Seed Dataset — Réexécution sur un jeu partiellement modifié (réparation sans doublon)", async () => {
  const demoPass = "SuperSecretDemoPass2026!";

  // Simulation : suppression de 2 posts et modification du contenu d'un 3e
  const postsToDelete = await Post.find({ seedBatch: SEED_BATCH_TAG }).limit(2);
  await Post.deleteMany({ _id: { $in: postsToDelete.map((p) => p._id) } });

  const postToModify = await Post.findOne({ seedBatch: SEED_BATCH_TAG });
  postToModify.content = "Contenu modifié manuellement par un utilisateur de test";
  await postToModify.save();

  const countBefore = await Post.countDocuments({ seedBatch: SEED_BATCH_TAG });
  assert.equal(countBefore, 98);

  // Réexécution du seed sur le jeu partiel
  const resultPartial = await runSeed({
    demoPassword: demoPass,
    manifestPath: testManifestPath,
    silent: true,
  });

  assert.equal(resultPartial.status, "repaired");
  assert.equal(resultPartial.createdAccountsCount, 0);
  assert.equal(resultPartial.insertedPostsCount, 2);
  assert.equal(resultPartial.postCount, 100);

  // Le post modifié conserve ses modifications sans duplication
  const reloadedModified = await Post.findById(postToModify._id);
  assert.ok(reloadedModified);
  assert.equal(reloadedModified.content, "Contenu modifié manuellement par un utilisateur de test");

  // Total final strictement conforme : 100 posts et 10 comptes, 0 doublon
  const totalPosts = await Post.countDocuments({ seedBatch: SEED_BATCH_TAG });
  assert.equal(totalPosts, 100);
  const totalUsers = await User.countDocuments({ seedBatch: SEED_BATCH_TAG });
  assert.equal(totalUsers, 10);
});

test("Seed Dataset — Protection anti-collision avec un compte préexistant non démo", async () => {
  // Simulation d'un compte utilisateur légitime ayant un email similaire
  const collisionManifest = path.join(os.tmpdir(), `collision-manifest-${Date.now()}.json`);
  const collisionUser = await User.create({
    name: "Collision Legitime",
    email: "demo.collision.test@makershare.local",
    passwordHash: "hash-legitime",
    role: "user",
    status: "active",
    seedBatch: null, // N'a PAS le tag de démo !
  });

  // Temporairement, on ajoute cet email dans DEMO_CREATORS pour tester la détection
  const originalCreator = DEMO_CREATORS[0];
  DEMO_CREATORS[0] = { email: "demo.collision.test@makershare.local", name: "Tentative Collision" };

  try {
    await assert.rejects(
      async () => {
        await runSeed({
          demoPassword: "Password123!",
          manifestPath: collisionManifest,
          silent: true,
        });
      },
      {
        message: /COLLISION DÉTECTÉE/,
      }
    );

    // Le compte légitime n'a PAS été écrasé ni modifié
    const intactUser = await User.findById(collisionUser._id);
    assert.ok(intactUser);
    assert.equal(intactUser.name, "Collision Legitime");
    assert.equal(intactUser.seedBatch, null);
  } finally {
    DEMO_CREATORS[0] = originalCreator;
    await User.findByIdAndDelete(collisionUser._id);
  }
});

test("Seed Dataset — Nettoyage ciblé (--clean) et intégrité des données réelles", async () => {
  const realUser = await User.findOne({ email: "real.user@example.com" });
  assert.ok(realUser);

  const demoUser = await User.findOne({ email: "demo.alice.lego@makershare.local" });
  assert.ok(demoUser);

  const demoPost = await Post.findOne({ seedBatch: SEED_BATCH_TAG });
  assert.ok(demoPost);

  // Simulation de relations complètes associées aux données de démo :
  // 1. Un like d'un vrai utilisateur sur un post de démo
  await Like.create({ userId: realUser._id, postId: demoPost._id });
  // 2. Un follow du vrai utilisateur vers un créateur de démo
  await Follow.create({ followerId: realUser._id, creatorId: demoUser._id });
  // 3. Un abonnement du vrai utilisateur vers un créateur de démo
  await Subscription.create({
    subscriberId: realUser._id,
    creatorId: demoUser._id,
    expiresAt: new Date(Date.now() + 86400000),
  });
  // 4. Un lien de partage sur un post de démo
  await ShareLink.create({
    postId: demoPost._id,
    tokenHash: "tokenhash1234567890abcdef1234567890abcdef1234567890abcdef12345678",
    expiresAt: new Date(Date.now() + 86400000),
  });

  // Exécution du nettoyage ciblé
  const cleanRes = await runSeed({
    clean: true,
    manifestPath: testManifestPath,
    silent: true,
  });

  assert.equal(cleanRes.cleanedUsers, 10);
  assert.equal(cleanRes.cleanedPosts, 100);
  assert.ok(cleanRes.cleanedLikes >= 1, "Les likes sur les posts de démo doivent être nettoyés");
  assert.ok(cleanRes.cleanedFollows >= 1, "Les follows vers les créateurs de démo doivent être nettoyés");
  assert.ok(cleanRes.cleanedSubs >= 1, "Les abonnements vers les créateurs de démo doivent être nettoyés");
  assert.ok(cleanRes.cleanedLinks >= 1, "Les liens de partage sur les posts de démo doivent être nettoyés");

  // Les comptes et posts de démo sont tous supprimés
  const remainingDemoUsers = await User.find({ seedBatch: SEED_BATCH_TAG });
  assert.equal(remainingDemoUsers.length, 0);

  const remainingDemoPosts = await Post.find({ seedBatch: SEED_BATCH_TAG });
  assert.equal(remainingDemoPosts.length, 0);

  // Le manifeste a été nettoyé
  assert.equal(fs.existsSync(testManifestPath), false);

  // Données réelles TOUJOURS intactes
  const checkRealUser = await User.findById(realUser._id);
  assert.ok(checkRealUser, "Le véritable utilisateur ne doit JAMAIS être supprimé");

  const checkRealPost = await Post.findOne({ title: "Vraie Création Antérieure" });
  assert.ok(checkRealPost, "La vraie création ne doit JAMAIS être supprimée");

  const checkRealTrack = await Track.findOne({ title: "Piste Audio Historique TP" });
  assert.ok(checkRealTrack, "La piste audio historique ne doit JAMAIS être supprimée");
});
