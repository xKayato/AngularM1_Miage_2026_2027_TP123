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

// -------------------------------------------------------------
// TESTS COUVERTURE D'IMAGE (APPROCHE A)
// -------------------------------------------------------------

import { detectRealImageMime } from "../src/utils/imageValidator.js";

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x60,
]);

const DUMMY_AUDIO_BYTES = Buffer.from([0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00]);

test("detectRealImageMime valide les magic bytes réels et rejette les faux fichiers", async () => {
  const fsPromises = (await import("node:fs/promises")).default;
  const path = (await import("node:path")).default;
  const os = (await import("node:os")).default;

  const tempPng = path.join(os.tmpdir(), `test_valid_${Date.now()}.png`);
  const tempFake = path.join(os.tmpdir(), `test_fake_${Date.now()}.png`);
  const tempJpeg = path.join(os.tmpdir(), `test_valid_${Date.now()}.jpg`);

  try {
    await fsPromises.writeFile(tempPng, VALID_PNG_BYTES);
    await fsPromises.writeFile(tempJpeg, VALID_JPEG_BYTES);
    await fsPromises.writeFile(tempFake, Buffer.from("<html><script>alert(1)</script></html>"));

    assert.equal(await detectRealImageMime(tempPng), "image/png");
    assert.equal(await detectRealImageMime(tempJpeg), "image/jpeg");
    assert.equal(await detectRealImageMime(tempFake), null, "Un faux PNG doit être rejeté");
  } finally {
    try { await fsPromises.unlink(tempPng); } catch {}
    try { await fsPromises.unlink(tempJpeg); } catch {}
    try { await fsPromises.unlink(tempFake); } catch {}
  }
});

test("POST /api/tracks avec cover valide enregistre la couverture et expose hasCover/coverUrl", async () => {
  const originalCreate = Track.create;
  let createdData = null;

  try {
    Track.create = async (doc) => {
      createdData = doc;
      return {
        id: "64b0f9f8e4b0a1a2b3c49999",
        ownerId: doc.ownerId,
        title: doc.title,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        cover: doc.cover,
        toPublic() {
          return {
            id: this.id,
            ownerId: String(this.ownerId),
            title: this.title,
            originalName: this.originalName,
            mimeType: this.mimeType,
            size: this.size,
            hasCover: Boolean(this.cover?.storedName),
            coverUrl: this.cover?.storedName ? `/api/tracks/${this.id}/cover` : null,
            createdAt: new Date().toISOString(),
          };
        },
      };
    };

    const form = new FormData();
    form.append("audio", new Blob([DUMMY_AUDIO_BYTES], { type: "audio/mpeg" }), "song.mp3");
    form.append("cover", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "artwork.png");
    form.append("title", "Song with Artwork");

    const r = await fetch(base + "/api/tracks", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenUserA}` },
      body: form,
    });

    assert.equal(r.status, 201);
    const data = await r.json();
    assert.equal(data.title, "Song with Artwork");
    assert.equal(data.hasCover, true);
    assert.equal(data.coverUrl, "/api/tracks/64b0f9f8e4b0a1a2b3c49999/cover");

    assert.ok(createdData.cover);
    assert.equal(createdData.cover.mimeType, "image/png");
    assert.equal(createdData.cover.originalName, "artwork.png");
  } finally {
    Track.create = originalCreate;
  }
});

test("POST /api/tracks refuse une cover avec contenu invalide (mauvais magic bytes) -> 400", async () => {
  const form = new FormData();
  form.append("audio", new Blob([DUMMY_AUDIO_BYTES], { type: "audio/mpeg" }), "song.mp3");
  // Faux PNG : contenu textuel au lieu d'un binaire PNG
  form.append("cover", new Blob([Buffer.from("ceci n'est pas une image")], { type: "image/png" }), "fake.png");
  form.append("title", "Fake image test");

  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenUserA}` },
    body: form,
  });

  assert.equal(r.status, 400);
  const data = await r.json();
  assert.match(data.message, /Contenu de l'image invalide/i);
});

test("GET /api/tracks/:id/cover renvoie 404 si la piste n'a pas de couverture", async () => {
  const originalFindOne = Track.findOne;

  try {
    Track.findOne = () => ({
      select: () => Promise.resolve({
        _id: "64b0f9f8e4b0a1a2b3c49999",
        ownerId: userA_id,
        cover: null,
      }),
    });

    const r = await fetch(base + "/api/tracks/64b0f9f8e4b0a1a2b3c49999/cover", {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });

    assert.equal(r.status, 404);
    const data = await r.json();
    assert.match(data.message, /Aucune couverture/i);
  } finally {
    Track.findOne = originalFindOne;
  }
});

test("GET /api/tracks/:id/cover renvoie 404 pour un utilisateur non propriétaire (isolation)", async () => {
  const originalFindOne = Track.findOne;

  try {
    // Si User B demande la cover de User A, findOne filtre sur ownerId et ne trouve rien
    Track.findOne = (filter) => {
      if (filter.ownerId.toString() === userB_id.toString()) {
        return { select: () => Promise.resolve(null) };
      }
      return {
        select: () => Promise.resolve({
          _id: "64b0f9f8e4b0a1a2b3c40001",
          ownerId: userA_id,
          cover: { storedName: "cover_a.png", mimeType: "image/png" },
        }),
      };
    };

    const r = await fetch(base + "/api/tracks/64b0f9f8e4b0a1a2b3c40001/cover", {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });

    assert.equal(r.status, 404);
    const data = await r.json();
    assert.equal(data.message, "Piste inconnue");
  } finally {
    Track.findOne = originalFindOne;
  }
});

test("PUT /api/tracks/:id/cover remplace la couverture et supprime l'ancien fichier sans orphelin", async () => {
  const fsPromises = (await import("node:fs/promises")).default;
  const path = (await import("node:path")).default;
  const originalFindOne = Track.findOne;

  // Création d'un faux ancien fichier de couverture
  const oldCoverFile = `old_cover_${Date.now()}.png`;
  const oldCoverPath = path.resolve("data/uploads/covers", oldCoverFile);
  await fsPromises.writeFile(oldCoverPath, VALID_PNG_BYTES);

  let updatedCover = null;

  try {
    Track.findOne = () => ({
      select: () => Promise.resolve({
        _id: "64b0f9f8e4b0a1a2b3c40001",
        ownerId: userA_id,
        cover: { storedName: oldCoverFile, originalName: "old.png", mimeType: "image/png" },
        save: async function () {
          updatedCover = this.cover;
        },
        toPublic: () => ({
          id: "64b0f9f8e4b0a1a2b3c40001",
          hasCover: true,
          coverUrl: "/api/tracks/64b0f9f8e4b0a1a2b3c40001/cover",
        }),
      }),
    });

    const form = new FormData();
    form.append("cover", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "new_cover.png");

    const r = await fetch(base + "/api/tracks/64b0f9f8e4b0a1a2b3c40001/cover", {
      method: "PUT",
      headers: { Authorization: `Bearer ${tokenUserA}` },
      body: form,
    });

    assert.equal(r.status, 200);
    assert.ok(updatedCover);
    assert.notEqual(updatedCover.storedName, oldCoverFile, "Le nom stocké doit être renouvelé");

    // Vérifier que l'ancien fichier a bien été supprimé du disque (aucun fichier orphelin)
    await assert.rejects(async () => {
      await fsPromises.stat(oldCoverPath);
    }, "L'ancien fichier de couverture doit avoir été supprimé");
  } finally {
    Track.findOne = originalFindOne;
    try { await fsPromises.unlink(oldCoverPath); } catch {}
  }
});

test("DELETE /api/tracks/:id/cover supprime la couverture et son fichier physique (204)", async () => {
  const fsPromises = (await import("node:fs/promises")).default;
  const path = (await import("node:path")).default;
  const originalFindOne = Track.findOne;

  const coverFile = `temp_delete_cover_${Date.now()}.png`;
  const coverPath = path.resolve("data/uploads/covers", coverFile);
  await fsPromises.writeFile(coverPath, VALID_PNG_BYTES);

  let coverUnset = false;

  try {
    Track.findOne = () => ({
      select: () => Promise.resolve({
        _id: "64b0f9f8e4b0a1a2b3c40001",
        ownerId: userA_id,
        cover: { storedName: coverFile, originalName: "artwork.png" },
        save: async function () {
          if (this.cover === undefined) coverUnset = true;
        },
      }),
    });

    const r = await fetch(base + "/api/tracks/64b0f9f8e4b0a1a2b3c40001/cover", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });

    assert.equal(r.status, 204);
    assert.equal(coverUnset, true, "track.cover doit être réinitialisé");

    // Vérifier suppression physique sur disque
    await assert.rejects(async () => {
      await fsPromises.stat(coverPath);
    }, "Le fichier de couverture doit avoir été supprimé sur disque");
  } finally {
    Track.findOne = originalFindOne;
    try { await fsPromises.unlink(coverPath); } catch {}
  }
});

test("DELETE /api/tracks/:id nettoie à la fois le fichier audio ET la couverture sur disque (zéro orphelin)", async () => {
  const fsPromises = (await import("node:fs/promises")).default;
  const path = (await import("node:path")).default;
  const originalFindOneAndDelete = Track.findOneAndDelete;

  const audioFile = `temp_del_audio_${Date.now()}.mp3`;
  const coverFile = `temp_del_cover_${Date.now()}.png`;
  const audioPath = path.resolve("data/uploads", audioFile);
  const coverPath = path.resolve("data/uploads/covers", coverFile);

  await fsPromises.writeFile(audioPath, DUMMY_AUDIO_BYTES);
  await fsPromises.writeFile(coverPath, VALID_PNG_BYTES);

  try {
    Track.findOneAndDelete = () => ({
      select: () => Promise.resolve({
        _id: "64b0f9f8e4b0a1a2b3c40001",
        ownerId: userA_id,
        storedName: audioFile,
        cover: { storedName: coverFile },
      }),
    });

    const r = await fetch(base + "/api/tracks/64b0f9f8e4b0a1a2b3c40001", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });

    assert.equal(r.status, 204);

    // Les deux fichiers doivent être supprimés sur disque
    await assert.rejects(async () => await fsPromises.stat(audioPath));
    await assert.rejects(async () => await fsPromises.stat(coverPath));
  } finally {
    Track.findOneAndDelete = originalFindOneAndDelete;
    try { await fsPromises.unlink(audioPath); } catch {}
    try { await fsPromises.unlink(coverPath); } catch {}
  }
});

