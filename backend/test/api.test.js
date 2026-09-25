import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

let server, base;
const JWT_SECRET = "tp1-development-secret";

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

// Données de test multi-utilisateurs
const userA_id = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c4d5e6");
const userB_id = new mongoose.Types.ObjectId("64b0f9f8e4b0a1a2b3c4d5e7");

const tokenUserA = jwt.sign({ sub: userA_id.toString(), email: "usera@example.com" }, JWT_SECRET);
const tokenUserB = jwt.sign({ sub: userB_id.toString(), email: "userb@example.com" }, JWT_SECRET);

function generateTestDataset() {
  const dataset = [];

  // Utilisateur A : 7 morceaux
  for (let i = 1; i <= 7; i++) {
    dataset.push({
      _id: new mongoose.Types.ObjectId(`64b0f9f8e4b0a1a2b3c4000${i}`),
      ownerId: userA_id,
      title: i === 7 ? "Blues Rock A7" : `Piste A${i}`,
      originalName: `pisteA${i}.mp3`,
      storedName: `stored_a_${i}.mp3`,
      mimeType: "audio/mpeg",
      size: 1000 * i,
      createdAt: new Date(`2026-01-0${i}T10:00:00.000Z`),
      __v: 0,
    });
  }

  // Utilisateur B : 5 morceaux (dont un avec Blues pour tester l'isolation de recherche)
  for (let i = 1; i <= 5; i++) {
    dataset.push({
      _id: new mongoose.Types.ObjectId(`64b0f9f8e4b0a1a2b3c4100${i}`),
      ownerId: userB_id,
      title: i === 5 ? "Blues Jazz B5" : `Piste B${i}`,
      originalName: `pisteB${i}.mp3`,
      storedName: `stored_b_${i}.mp3`,
      mimeType: "audio/mpeg",
      size: 2000 * i,
      createdAt: new Date(`2026-01-0${i}T12:00:00.000Z`),
      __v: 0,
    });
  }

  return dataset;
}

/**
 * Simule le comportement réel de mongoose-aggregate-paginate-v2 sur un dataset en mémoire.
 */
function createAggregatePaginateMock(dataset, capturedMeta = null) {
  return async function (aggregate, options) {
    const pipeline = typeof aggregate.pipeline === "function" ? aggregate.pipeline() : [];
    if (capturedMeta) {
      capturedMeta.pipeline = pipeline;
      capturedMeta.options = options;
      capturedMeta.aggregate = aggregate;
    }

    const matchStage = pipeline.find((stage) => stage.$match)?.$match || {};

    // 1. Étape $match : filtre strict sur ownerId et title éventuel
    let matched = dataset.filter((doc) => {
      if (matchStage.ownerId) {
        const expectedOwner = matchStage.ownerId.toString();
        const actualOwner = (doc.ownerId?._id || doc.ownerId).toString();
        if (expectedOwner !== actualOwner) return false;
      }
      if (matchStage.title && matchStage.title.$regex) {
        const regex = new RegExp(matchStage.title.$regex, matchStage.title.$options || "");
        if (!regex.test(doc.title)) return false;
      }
      return true;
    });

    // 2. Tri déterministe selon options.sort
    if (options.sort) {
      matched.sort((a, b) => {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return String(b._id).localeCompare(String(a._id));
      });
    }

    const total = matched.length;
    const page = options.page || 1;
    const limit = options.limit || 5;
    const pages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;

    // 3. Projection ($addFields id, masquage _id, storedName, __v)
    const docs = matched.slice(offset, offset + limit).map((doc) => {
      const copy = { ...doc };
      copy.id = String(copy._id);
      copy.ownerId = String(copy.ownerId);
      delete copy._id;
      delete copy.storedName;
      delete copy.__v;
      return copy;
    });

    const hasPrevPage = page > 1 && page <= pages + 1;
    const hasNextPage = page < pages;
    const prevPage = hasPrevPage ? page - 1 : null;
    const nextPage = hasNextPage ? page + 1 : null;
    const pagingCounter = (page - 1) * limit + 1;

    const labels = options.customLabels || {};
    const docsLabel = labels.docs || "docs";
    const totalDocsLabel = labels.totalDocs || "totalDocs";
    const totalPagesLabel = labels.totalPages || "totalPages";

    return {
      [docsLabel]: docs,
      [totalDocsLabel]: total,
      limit,
      page,
      [totalPagesLabel]: pages,
      hasPrevPage,
      hasNextPage,
      prevPage,
      nextPage,
      pagingCounter,
    };
  };
}

// -------------------------------------------------------------
// TESTS
// -------------------------------------------------------------

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });

  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
});

test("Track model intègre le plugin mongoose-aggregate-paginate-v2", () => {
  assert.equal(typeof Track.aggregatePaginate, "function", "Track.aggregatePaginate doit être disponible");
});

test("GET /api/tracks refuse sans token", async () => {
  const r = await fetch(base + "/api/tracks?title=blues");
  assert.equal(r.status, 401);
});

test("GET /api/tracks isole strictement les utilisateurs (multi-user isolation) : aucun morceau ni total d'un autre utilisateur", async () => {
  const dataset = generateTestDataset(); // 12 morceaux au total dans la base (7 pour A, 5 pour B)
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset);

    // 1. Requête par l'utilisateur A
    const resA = await fetch(base + "/api/tracks?page=1&limit=5", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(resA.status, 200);
    const dataA = await resA.json();

    // Vérification du total et des items pour A
    assert.equal(dataA.total, 7, "Le total doit être strictement de 7 (uniquement les pistes de A, jamais les 12)");
    assert.equal(dataA.items.length, 5, "5 pistes sur la page 1");
    dataA.items.forEach((item) => {
      assert.equal(item.ownerId, userA_id.toString(), "Aucune piste d'un autre utilisateur ne doit être renvoyée");
      assert.ok(!item.title.startsWith("Piste B"), "Ne doit contenir aucune piste de B");
    });

    // 2. Requête par l'utilisateur B
    const resB = await fetch(base + "/api/tracks?page=1&limit=5", {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    assert.equal(resB.status, 200);
    const dataB = await resB.json();

    // Vérification du total et des items pour B
    assert.equal(dataB.total, 5, "Le total doit être strictement de 5 (uniquement les pistes de B)");
    assert.equal(dataB.items.length, 5);
    dataB.items.forEach((item) => {
      assert.equal(item.ownerId, userB_id.toString(), "Doit appartenir à B");
      assert.ok(!item.title.startsWith("Piste A"), "Ne doit contenir aucune piste de A");
    });
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});

test("GET /api/tracks gère la pagination multi-pages avec métadonnées conformes (Variante A)", async () => {
  const dataset = generateTestDataset();
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset);

    // Page 1 pour User A (7 pistes au total, limit=5 -> 2 pages)
    const resP1 = await fetch(base + "/api/tracks?page=1&limit=5", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(resP1.status, 200);
    const p1 = await resP1.json();

    assert.equal(p1.page, 1);
    assert.equal(p1.limit, 5);
    assert.equal(p1.total, 7);
    assert.equal(p1.pages, 2);
    assert.equal(p1.items.length, 5);
    assert.equal(p1.hasPrevPage, false);
    assert.equal(p1.hasNextPage, true);
    assert.equal(p1.prevPage, null);
    assert.equal(p1.nextPage, 2);
    assert.equal(p1.pagingCounter, 1);

    // Page 2 pour User A
    const resP2 = await fetch(base + "/api/tracks?page=2&limit=5", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(resP2.status, 200);
    const p2 = await resP2.json();

    assert.equal(p2.page, 2);
    assert.equal(p2.limit, 5);
    assert.equal(p2.total, 7);
    assert.equal(p2.pages, 2);
    assert.equal(p2.items.length, 2);
    assert.equal(p2.hasPrevPage, true);
    assert.equal(p2.hasNextPage, false);
    assert.equal(p2.prevPage, 1);
    assert.equal(p2.nextPage, null);
    assert.equal(p2.pagingCounter, 6);

    // Vérifier la continuité des pistes entre page 1 et page 2
    const allFetchedIds = [...p1.items.map((t) => t.id), ...p2.items.map((t) => t.id)];
    assert.equal(new Set(allFetchedIds).size, 7, "Les 7 pistes doivent être distinctes sans doublon");
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});

test("GET /api/tracks borne les paramètres page et limit invalides ou extrêmes", async () => {
  const dataset = generateTestDataset();
  const capturedMeta = {};
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset, capturedMeta);

    // Cas 1 : page négative et limit excessive (> 20)
    const r1 = await fetch(base + "/api/tracks?page=-3&limit=999", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(r1.status, 200);
    assert.equal(capturedMeta.options.page, 1, "Page doit être ramenée à au moins 1");
    assert.equal(capturedMeta.options.limit, 20, "Limit doit être plafonnée à 20");

    // Cas 2 : paramètres non numériques / invalides
    const r2 = await fetch(base + "/api/tracks?page=abc&limit=xyz", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(r2.status, 200);
    assert.equal(capturedMeta.options.page, 1, "Page invalide doit être 1");
    assert.equal(capturedMeta.options.limit, 5, "Limit invalide doit être par défaut 5");
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});

test("GET /api/tracks gère proprement une page vide ou hors bornes", async () => {
  const dataset = generateTestDataset();
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset);

    // Page 99 alors qu'il n'y a que 2 pages
    const r = await fetch(base + "/api/tracks?page=99&limit=5", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(r.status, 200);
    const data = await r.json();

    assert.deepEqual(data.items, []);
    assert.equal(data.total, 7);
    assert.equal(data.pages, 2);
    assert.equal(data.hasNextPage, false);
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});

test("GET /api/tracks applique un tri déterministe (createdAt: -1, _id: -1)", async () => {
  const dataset = generateTestDataset();
  const capturedMeta = {};
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset, capturedMeta);

    const r = await fetch(base + "/api/tracks?page=1&limit=5", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(r.status, 200);
    const data = await r.json();

    // Vérifier les options passées à aggregatePaginate
    assert.deepEqual(capturedMeta.options.sort, { createdAt: -1, _id: -1 });

    // Vérifier l'ordre des éléments renvoyés (plus récent en premier)
    assert.equal(data.items[0].title, "Blues Rock A7");
    assert.equal(data.items[1].title, "Piste A6");
    assert.equal(data.items[2].title, "Piste A5");
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});

test("GET /api/tracks applique le filtre title avec insensibilité à la casse et isolation utilisateur", async () => {
  const dataset = generateTestDataset();
  const capturedMeta = {};
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset, capturedMeta);

    // User A cherche "blues"
    // Dans le dataset, User A a "Blues Rock A7" et User B a "Blues Jazz B5"
    const r = await fetch(base + "/api/tracks?title=blues", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(r.status, 200);
    const data = await r.json();

    // Seule la piste de User A doit être renvoyée !
    assert.equal(data.total, 1, "Le total filtré doit être 1 pour User A, la piste de B doit être exclue");
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].title, "Blues Rock A7");
    assert.equal(data.items[0].ownerId, userA_id.toString());

    // Vérifier la structure du pipeline $match
    const matchStage = capturedMeta.pipeline.find((s) => s.$match)?.$match;
    assert.ok(matchStage);
    assert.equal(matchStage.ownerId.toString(), userA_id.toString());
    assert.equal(matchStage.title.$regex, "blues");
    assert.equal(matchStage.title.$options, "i");
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});

test("GET /api/tracks échappe les caractères spéciaux Regex dans title", async () => {
  const dataset = generateTestDataset();
  const capturedMeta = {};
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset, capturedMeta);

    const r = await fetch(base + "/api/tracks?title=rock%2Broll*(test)", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(r.status, 200);

    const matchStage = capturedMeta.pipeline.find((s) => s.$match)?.$match;
    assert.equal(matchStage.title.$regex, "rock\\+roll\\*\\(test\\)");
    assert.equal(matchStage.title.$options, "i");
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});

test("GET /api/tracks garantit la compatibilité du format frontend (id, sans _id ni storedName)", async () => {
  const dataset = generateTestDataset();
  const capturedMeta = {};
  const originalAggregatePaginate = Track.aggregatePaginate;

  try {
    Track.aggregatePaginate = createAggregatePaginateMock(dataset, capturedMeta);

    const r = await fetch(base + "/api/tracks?page=1&limit=5", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(r.status, 200);
    const data = await r.json();

    // Contrat public conservé pour le frontend Angular
    assert.ok(Array.isArray(data.items));
    assert.equal(typeof data.total, "number");
    assert.equal(typeof data.page, "number");
    assert.equal(typeof data.limit, "number");
    assert.equal(typeof data.pages, "number");

    // Champs Variante A enrichis
    assert.equal(typeof data.hasPrevPage, "boolean");
    assert.equal(typeof data.hasNextPage, "boolean");

    // Propriétés de l'item : id exposé, secrets/techniques masqués
    const item = data.items[0];
    assert.ok(item.id, "Doit avoir la propriété id");
    assert.equal(typeof item.id, "string");
    assert.equal(item._id, undefined, "_id ne doit pas être exposé");
    assert.equal(item.storedName, undefined, "storedName ne doit pas être exposé");
    assert.equal(item.__v, undefined, "__v ne doit pas être exposé");

    // Vérifier les étapes du pipeline $addFields et $project
    const addFieldsStage = capturedMeta.pipeline.find((s) => s.$addFields);
    assert.ok(addFieldsStage, "Le pipeline doit contenir $addFields pour id");
    const projectStage = capturedMeta.pipeline.find((s) => s.$project);
    assert.ok(projectStage, "Le pipeline doit masquer _id, storedName et __v via $project");
    assert.equal(projectStage.$project._id, 0);
    assert.equal(projectStage.$project.storedName, 0);
  } finally {
    Track.aggregatePaginate = originalAggregatePaginate;
  }
});
