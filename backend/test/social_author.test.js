import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Follow } from "../src/models/Follow.js";

let mongod;
let server, base;
const JWT_SECRET = "tp1-development-secret";

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
  await Follow.syncIndexes();
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

let seq = 0;
async function createUser(name, status = "active") {
  seq++;
  const user = await User.create({
    name: name ?? `Social User ${seq}`,
    email: `social_${seq}_${Date.now()}@test.com`,
    passwordHash: "hash123",
    status,
  });
  const token = jwt.sign({ sub: String(user._id), email: user.email }, JWT_SECRET);
  return { user, token };
}

async function createPost(author, overrides = {}) {
  seq++;
  return Post.create({
    author: author._id,
    title: `Projet ${seq}`,
    shortDescription: `Description ${seq}`,
    content: "Contenu complet",
    category: "Lego",
    tags: ["test"],
    visibility: "public",
    status: "published",
    publishedAt: new Date(Date.now() - seq * 1000),
    ...overrides,
  });
}

async function follow(follower, creator, createdAt) {
  return Follow.create({
    followerId: follower._id,
    creatorId: creator._id,
    ...(createdAt ? { createdAt } : {}),
  });
}

async function getJson(path, token) {
  const res = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// GET /api/creators/:id/followers & /following
// ---------------------------------------------------------------------------

for (const route of ["followers", "following"]) {
  test(`Social — GET /api/creators/:id/${route} — validations`, async (t) => {
    await t.test("400 si identifiant invalide", async () => {
      const { status, body } = await getJson(`/api/creators/not-an-id/${route}`);
      assert.equal(status, 400);
      assert.match(body.message, /invalide/i);
    });

    await t.test("404 si créateur inexistant", async () => {
      const ghost = new mongoose.Types.ObjectId();
      const { status } = await getJson(`/api/creators/${ghost}/${route}`);
      assert.equal(status, 404);
    });

    await t.test("404 si créateur suspendu", async () => {
      const { user } = await createUser(undefined, "suspended");
      const { status } = await getJson(`/api/creators/${user._id}/${route}`);
      assert.equal(status, 404);
    });

    await t.test("200 et page vide pour un créateur sans relation", async () => {
      const { user } = await createUser();
      const { status, body } = await getJson(`/api/creators/${user._id}/${route}`);
      assert.equal(status, 200);
      assert.deepEqual(body.docs, []);
      assert.equal(body.totalDocs, 0);
      assert.equal(body.totalPages, 1);
      assert.equal(body.hasNextPage, false);
    });

    await t.test("Accessible en anonyme et en connecté (200)", async () => {
      const { user } = await createUser();
      const { token } = await createUser();
      const anon = await getJson(`/api/creators/${user._id}/${route}`);
      const logged = await getJson(`/api/creators/${user._id}/${route}`, token);
      assert.equal(anon.status, 200);
      assert.equal(logged.status, 200);
    });

    await t.test("401 si le jeton fourni est invalide", async () => {
      const { user } = await createUser();
      const { status } = await getJson(`/api/creators/${user._id}/${route}`, "jeton-bidon");
      assert.equal(status, 401);
    });
  });
}

test("Social — GET /api/creators/:id/followers — contenu et pagination", async (t) => {
  const { user: creator } = await createUser("Créatrice Followers");
  const { user: f1 } = await createUser("Follower Un");
  const { user: f2 } = await createUser("Follower Deux");
  const { user: f3 } = await createUser("Follower Trois");
  const { user: suspended } = await createUser("Follower Suspendu", "suspended");

  await follow(f1, creator, new Date(Date.now() - 30000));
  await follow(f2, creator, new Date(Date.now() - 20000));
  await follow(f3, creator, new Date(Date.now() - 10000));
  await follow(suspended, creator, new Date());

  await t.test("Liste les followers actifs, du plus récent au plus ancien", async () => {
    const { status, body } = await getJson(`/api/creators/${creator._id}/followers`);
    assert.equal(status, 200);
    assert.equal(body.totalDocs, 3);
    assert.deepEqual(
      body.docs.map((d) => d.creator.name),
      ["Follower Trois", "Follower Deux", "Follower Un"],
    );
  });

  await t.test("Exclut les followers suspendus du total et de la liste", async () => {
    const { body } = await getJson(`/api/creators/${creator._id}/followers`);
    assert.ok(!body.docs.some((d) => d.creator.id === String(suspended._id)));
  });

  await t.test("Ne divulgue ni email ni hash de mot de passe", async () => {
    const { body } = await getJson(`/api/creators/${creator._id}/followers`);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("@test.com"));
    assert.ok(!raw.includes("passwordHash"));
    assert.ok(!raw.includes("hash123"));
    const item = body.docs[0];
    assert.deepEqual(Object.keys(item.creator).sort(), ["avatarUrl", "bio", "hasAvatar", "id", "name"]);
    assert.equal(item.creator.hasAvatar, false);
    assert.equal(item.creator.avatarUrl, null);
  });

  await t.test("Respecte page et limit", async () => {
    const { body } = await getJson(`/api/creators/${creator._id}/followers?page=2&limit=2`);
    assert.equal(body.page, 2);
    assert.equal(body.limit, 2);
    assert.equal(body.totalPages, 2);
    assert.equal(body.docs.length, 1);
    assert.equal(body.docs[0].creator.name, "Follower Un");
    assert.equal(body.hasPrevPage, true);
    assert.equal(body.hasNextPage, false);
  });

  await t.test("Plafonne limit à 50 et corrige les valeurs invalides", async () => {
    const big = await getJson(`/api/creators/${creator._id}/followers?limit=999`);
    assert.equal(big.body.limit, 50);
    const bad = await getJson(`/api/creators/${creator._id}/followers?limit=abc&page=-3`);
    assert.equal(bad.body.limit, 20);
    assert.equal(bad.body.page, 1);
  });

  await t.test("Expose l'alias items/total pour compatibilité Page<T>", async () => {
    const { body } = await getJson(`/api/creators/${creator._id}/followers`);
    assert.deepEqual(body.items, body.docs);
    assert.equal(body.total, body.totalDocs);
  });
});

test("Social — GET /api/creators/:id/following — contenu", async (t) => {
  const { user: fan } = await createUser("Grand Fan");
  const { user: c1 } = await createUser("Créateur Suivi A");
  const { user: c2 } = await createUser("Créateur Suivi B");
  const { user: cSusp } = await createUser("Créateur Suivi Suspendu", "suspended");
  const { user: other } = await createUser("Autre Personne");

  await follow(fan, c1, new Date(Date.now() - 20000));
  await follow(fan, c2, new Date(Date.now() - 10000));
  await follow(fan, cSusp, new Date());
  // Relation inverse : ne doit pas apparaître dans "following" de fan
  await follow(other, fan);

  await t.test("Liste les créateurs suivis non suspendus", async () => {
    const { status, body } = await getJson(`/api/creators/${fan._id}/following`);
    assert.equal(status, 200);
    assert.equal(body.totalDocs, 2);
    assert.deepEqual(
      body.docs.map((d) => d.creator.name),
      ["Créateur Suivi B", "Créateur Suivi A"],
    );
  });

  await t.test("N'inclut pas les personnes qui le suivent", async () => {
    const { body } = await getJson(`/api/creators/${fan._id}/following`);
    assert.ok(!body.docs.some((d) => d.creator.id === String(other._id)));
  });

  await t.test("followers et following sont cohérents entre eux", async () => {
    const { body } = await getJson(`/api/creators/${c1._id}/followers`);
    assert.equal(body.totalDocs, 1);
    assert.equal(body.docs[0].creator.id, String(fan._id));
  });
});

test("Social — GET /api/creators/:id expose followingCount", async (t) => {
  const { user: fan } = await createUser("Compteur Fan");
  const { user: a } = await createUser();
  const { user: b } = await createUser();
  const { user: s } = await createUser(undefined, "suspended");
  await follow(fan, a);
  await follow(fan, b);
  await follow(fan, s);
  await follow(a, fan);

  await t.test("followingCount ignore les créateurs suspendus", async () => {
    const { status, body } = await getJson(`/api/creators/${fan._id}`);
    assert.equal(status, 200);
    assert.equal(body.followingCount, 2);
    assert.equal(body.followersCount, 1);
  });

  await t.test("followingCount vaut 0 pour un nouveau compte", async () => {
    const { user } = await createUser();
    const { body } = await getJson(`/api/creators/${user._id}`);
    assert.equal(body.followingCount, 0);
  });

  await t.test("followingCount égale le totalDocs de /following", async () => {
    const profile = await getJson(`/api/creators/${fan._id}`);
    const list = await getJson(`/api/creators/${fan._id}/following`);
    assert.equal(profile.body.followingCount, list.body.totalDocs);
  });
});

// ---------------------------------------------------------------------------
// GET /api/posts — filtres author / authorName
// ---------------------------------------------------------------------------

test("Catalogue — filtre author (ObjectId)", async (t) => {
  const { user: alice } = await createUser("Alice Filtrage");
  const { user: bob } = await createUser("Bob Filtrage");
  const { user: susp } = await createUser("Zoé Suspendue", "suspended");

  const a1 = await createPost(alice, { title: "Alice château" });
  const a2 = await createPost(alice, { title: "Alice fusée", visibility: "followers", category: "Origami" });
  await createPost(alice, { title: "Alice brouillon", status: "draft", publishedAt: null });
  await createPost(alice, { title: "Alice secret", visibility: "link" });
  await createPost(alice, { title: "Alice archivé", status: "archived" });
  await createPost(bob, { title: "Bob château" });
  await createPost(susp, { title: "Post suspendu" });

  await t.test("400 si author n'est pas un ObjectId", async () => {
    const { status, body } = await getJson(`/api/posts?author=abc`);
    assert.equal(status, 400);
    assert.match(body.message, /auteur invalide/i);
  });

  await t.test("Ignore un author vide", async () => {
    const { status } = await getJson(`/api/posts?author=%20%20`);
    assert.equal(status, 200);
  });

  await t.test("Ne renvoie que les posts publiés et découvrables de l'auteur", async () => {
    const { status, body } = await getJson(`/api/posts?author=${alice._id}`);
    assert.equal(status, 200);
    assert.equal(body.totalDocs, 2);
    const ids = body.docs.map((d) => d.id).sort();
    assert.deepEqual(ids, [String(a1._id), String(a2._id)].sort());
    assert.ok(body.docs.every((d) => d.author.id === String(alice._id)));
  });

  await t.test("Post followers renvoyé verrouillé sans contenu ni cover", async () => {
    const { body } = await getJson(`/api/posts?author=${alice._id}`);
    const locked = body.docs.find((d) => d.id === String(a2._id));
    assert.equal(locked.isLocked, true);
    assert.equal(locked.coverUrl, null);
    assert.equal(locked.content, undefined);
  });

  await t.test("Auteur suspendu : aucun résultat", async () => {
    const { status, body } = await getJson(`/api/posts?author=${susp._id}`);
    assert.equal(status, 200);
    assert.equal(body.totalDocs, 0);
  });

  await t.test("Auteur inexistant : aucun résultat", async () => {
    const ghost = new mongoose.Types.ObjectId();
    const { body } = await getJson(`/api/posts?author=${ghost}`);
    assert.equal(body.totalDocs, 0);
  });

  await t.test("Se combine avec category", async () => {
    const { body } = await getJson(`/api/posts?author=${alice._id}&category=Origami`);
    assert.equal(body.totalDocs, 1);
    assert.equal(body.docs[0].id, String(a2._id));
  });

  await t.test("Se combine avec query (repli regex)", async () => {
    const { body } = await getJson(`/api/posts?author=${alice._id}&query=château`);
    assert.equal(body.totalDocs, 1);
    assert.equal(body.docs[0].id, String(a1._id));
  });

  await t.test("Se combine avec la pagination", async () => {
    const { body } = await getJson(`/api/posts?author=${alice._id}&limit=1&page=2`);
    assert.equal(body.totalDocs, 2);
    assert.equal(body.docs.length, 1);
    assert.equal(body.totalPages, 2);
  });

  await t.test("Les bornes de limit restent appliquées (21 → 400)", async () => {
    const { status } = await getJson(`/api/posts?author=${alice._id}&limit=21`);
    assert.equal(status, 400);
  });
});

test("Catalogue — filtre authorName et recherche par nom d'auteur", async (t) => {
  const { user: marc } = await createUser("Marcel Origamiste");
  const { user: dot } = await createUser("Dot.Star");
  const { user: susp } = await createUser("Marcel Suspendu", "suspended");

  const m1 = await createPost(marc, { title: "Grue en papier", shortDescription: "Pliage traditionnel" });
  const d1 = await createPost(dot, { title: "Robot LED", shortDescription: "Électronique simple" });
  await createPost(susp, { title: "Grue suspendue" });

  await t.test("Recherche partielle insensible à la casse", async () => {
    const { status, body } = await getJson(`/api/posts?authorName=marcel%20ORIGA`);
    assert.equal(status, 200);
    assert.equal(body.totalDocs, 1);
    assert.equal(body.docs[0].id, String(m1._id));
    assert.equal(body.docs[0].author.name, "Marcel Origamiste");
  });

  await t.test("Exclut les auteurs suspendus même si le nom correspond", async () => {
    const { body } = await getJson(`/api/posts?authorName=Marcel`);
    assert.equal(body.totalDocs, 1);
    assert.equal(body.docs[0].id, String(m1._id));
  });

  await t.test("400 si authorName dépasse 100 caractères", async () => {
    const { status, body } = await getJson(`/api/posts?authorName=${"a".repeat(101)}`);
    assert.equal(status, 400);
    assert.match(body.message, /100 caractères/);
  });

  await t.test("Accepte exactement 100 caractères", async () => {
    const { status } = await getJson(`/api/posts?authorName=${"a".repeat(100)}`);
    assert.equal(status, 200);
  });

  await t.test("Les métacaractères regex sont échappés", async () => {
    const wildcard = await getJson(`/api/posts?authorName=${encodeURIComponent(".*")}`);
    assert.equal(wildcard.status, 200);
    assert.equal(wildcard.body.totalDocs, 0);

    const dotted = await getJson(`/api/posts?authorName=${encodeURIComponent("Dot.Star")}`);
    assert.equal(dotted.body.totalDocs, 1);
    assert.equal(dotted.body.docs[0].id, String(d1._id));
  });

  await t.test("query trouve aussi un post par le nom de son auteur", async () => {
    const { body } = await getJson(`/api/posts?query=Origamiste`);
    assert.ok(body.docs.some((d) => d.id === String(m1._id)));
  });

  await t.test("mode=suggest trouve un auteur par préfixe de mot", async () => {
    const { status, body } = await getJson(`/api/posts?mode=suggest&query=Origam`);
    assert.equal(status, 200);
    assert.ok(body.docs.some((d) => d.id === String(m1._id)));
  });

  await t.test("author + authorName incohérents → aucun résultat", async () => {
    const { body } = await getJson(`/api/posts?author=${marc._id}&authorName=Dot`);
    assert.equal(body.totalDocs, 0);
  });

  await t.test("author + authorName cohérents → résultats de l'auteur", async () => {
    const { body } = await getJson(`/api/posts?author=${marc._id}&authorName=Marcel`);
    assert.equal(body.totalDocs, 1);
  });
});
