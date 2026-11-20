import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import {
  normalizeText,
  extractSearchTerms,
  oneEditVariants,
  buildTermRegexes,
  buildFuzzySearch,
} from "../src/utils/fuzzySearch.js";

// ---------------------------------------------------------------------------
// Tests unitaires du module utils/fuzzySearch.js
// ---------------------------------------------------------------------------

test("fuzzySearch — normalisation et découpage de la requête", async (t) => {
  await t.test("minuscules, accents et ligatures", () => {
    assert.equal(normalizeText("Château ÉLÉPHANT Cœur Ex-æquo"), "chateau elephant coeur ex-aequo");
  });

  await t.test("mots vides retirés, pluriels simples ramenés au singulier", () => {
    assert.deepEqual(extractSearchTerms("Les dragons de papier"), ["dragon", "papier"]);
    assert.deepEqual(extractSearchTerms("châteaux"), ["chateau"]);
  });

  await t.test("les mots courts gardent leur s final (bus, gaz…)", () => {
    assert.deepEqual(extractSearchTerms("bus lego"), ["bus", "lego"]);
  });

  await t.test("une requête composée seulement de mots vides est conservée", () => {
    assert.deepEqual(extractSearchTerms("de la"), ["de", "la"]);
  });

  await t.test("doublons supprimés et 8 mots au maximum", () => {
    assert.deepEqual(extractSearchTerms("lego LEGO Lego"), ["lego"]);
    assert.equal(extractSearchTerms("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10").length, 8);
  });

  await t.test("la ponctuation et les métacaractères regex sont ignorés", () => {
    assert.deepEqual(extractSearchTerms("(.*) star-wars ^$"), ["star", "wars"]);
    assert.equal(buildFuzzySearch("(.*) ^$ []"), null);
  });
});

test("fuzzySearch — variantes à une faute", async (t) => {
  await t.test("la première lettre n'est jamais modifiée", () => {
    for (const v of oneEditVariants("dragon")) {
      assert.equal(v[0], "d", `variante ${v}`);
    }
  });

  await t.test("couvre suppression, substitution, insertion et inversion", () => {
    const variants = new Set(oneEditVariants("dragon"));
    assert.ok(variants.has("dagon")); // lettre en trop dans la requête
    assert.ok(variants.has("dr.gon")); // lettre remplacée
    assert.ok(variants.has("dra.gon")); // lettre oubliée
    assert.ok(variants.has("dargon")); // lettres inversées
    assert.ok(!variants.has("dragon"));
  });

  await t.test("les mots de moins de 5 lettres ne sont pas approchés et doivent commencer un mot", () => {
    const { exact, fuzzy } = buildTermRegexes("lego");
    assert.equal(exact, fuzzy);
    assert.ok(exact.startsWith("(?<!"));
  });

  await t.test("les regex produites sont valides en JavaScript", () => {
    for (const term of ["chateau", "coeur", "synthetiseur", "lego", "3d"]) {
      const { exact, fuzzy } = buildTermRegexes(term);
      assert.doesNotThrow(() => new RegExp(exact, "iu"));
      assert.doesNotThrow(() => new RegExp(fuzzy, "iu"));
    }
  });

  await t.test("niveaux : un seul mot → exact puis approché ; plusieurs → + n'importe quel mot", () => {
    assert.deepEqual(buildFuzzySearch("dragon").levels, ["exact-all", "fuzzy-all"]);
    assert.deepEqual(buildFuzzySearch("dragon papier").levels, ["exact-all", "fuzzy-all", "fuzzy-any"]);
  });
});

// ---------------------------------------------------------------------------
// Tests d'intégration : GET /api/posts sans Atlas (repli tolérant)
// ---------------------------------------------------------------------------

let mongod;
let server;
let base;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
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
  return User.create({ name, email: `fuzzy_${seq}_${Date.now()}@test.com`, passwordHash: "hash123", status });
}

async function createPost(author, fields) {
  seq++;
  return Post.create({
    author: author._id,
    content: "Contenu complet",
    category: "Autre",
    tags: ["divers"],
    visibility: "public",
    status: "published",
    publishedAt: new Date(Date.now() - seq * 60000),
    ...fields,
  });
}

async function search(params) {
  const res = await fetch(`${base}/api/posts?${new URLSearchParams(params)}`);
  const body = await res.json();
  return { status: res.status, body, titles: (body.docs || []).map((d) => d.title) };
}

test("Recherche tolérante — catalogue", async (t) => {
  const maker = await createUser("Romane Artisane");
  const other = await createUser("Sacha Bricoleur");
  const suspended = await createUser("Zoé Suspendue", "suspended");

  await createPost(maker, { title: "Château fort en carton", shortDescription: "Maquette médiévale avec tours", tags: ["carton", "moyen-age"] });
  await createPost(maker, { title: "Dragon articulé en origami", shortDescription: "Pliage avancé en papier washi", tags: ["origami"] });
  await createPost(other, { title: "Grue en papier washi", shortDescription: "Pliage traditionnel japonais", tags: ["origami", "japon"] });
  await createPost(other, { title: "Guitare cigar box blues", shortDescription: "Trois cordes et un manche en chêne", tags: ["musique"] });
  await createPost(other, { title: "Support de guitare pliant", shortDescription: "Contreplaqué de bouleau", tags: ["bois"] });
  await createPost(other, { title: "Synthétiseur modulaire", shortDescription: "Oscillateurs analogiques faits maison", tags: ["electronique"] });
  await createPost(other, { title: "Lampe cœur en bois", shortDescription: "Veilleuse découpée au laser", tags: ["bois"] });
  await createPost(other, { title: "Étagère murale", shortDescription: "Rangement pour figurines de dragon", tags: ["bois"] });
  await createPost(other, { title: "Robot traceur", shortDescription: "Dessine sur papier avec un stylo", tags: ["star-wars", "robotique"] });
  await createPost(maker, { title: "Dragon brouillon secret", shortDescription: "Ne doit jamais sortir", status: "draft", publishedAt: null });
  await createPost(maker, { title: "Dragon lien secret", shortDescription: "Visible seulement par lien", visibility: "link" });
  await createPost(suspended, { title: "Dragon d'un compte suspendu", shortDescription: "Auteur suspendu" });

  const cases = [
    ["accents ignorés", "chateau", "Château fort en carton"],
    ["majuscules et accents", "CHÂTEAU", "Château fort en carton"],
    ["ligature œ", "coeur", "Lampe cœur en bois"],
    ["substitution", "dragin", "Dragon articulé en origami"],
    ["lettre oubliée", "dragn", "Dragon articulé en origami"],
    ["lettre en trop", "draggon", "Dragon articulé en origami"],
    ["lettres inversées", "gutiare", "Guitare cigar box blues"],
    ["faute + accent manquant", "synthetisuer", "Synthétiseur modulaire"],
    ["pluriel", "dragons", "Dragon articulé en origami"],
    ["pluriel en x", "chateaux", "Château fort en carton"],
    ["mot d'une description", "oscillateurs", "Synthétiseur modulaire"],
    ["nom d'auteur", "romane", "Château fort en carton"],
    ["tag", "japon", "Grue en papier washi"],
  ];
  for (const [label, query, expected] of cases) {
    await t.test(`${label} : « ${query} » trouve « ${expected} »`, async () => {
      const { status, titles } = await search({ query });
      assert.equal(status, 200);
      assert.ok(titles.includes(expected), `résultats : ${titles.join(" | ")}`);
    });
  }

  await t.test("deux fautes sur un mot court ne trouvent rien", async () => {
    const { body } = await search({ query: "drgaoon" });
    assert.ok(!body.docs.some((d) => d.title.startsWith("Dragon articulé")));
  });

  await t.test("un mot court n'est pas approché : « bios » ne trouve pas « bois »", async () => {
    const { body } = await search({ query: "bios" });
    assert.ok(!body.docs.some((d) => /bois/i.test(d.title)));
  });

  await t.test("un mot court doit commencer un mot : « ois » ne trouve pas « bois »", async () => {
    const { body } = await search({ query: "ois" });
    assert.equal(body.totalDocs, 0);
  });

  await t.test("plusieurs mots : seuls les posts qui les contiennent tous", async () => {
    const { body, titles } = await search({ query: "papier washi grue" });
    assert.equal(body.totalDocs, 1);
    assert.deepEqual(titles, ["Grue en papier washi"]);
  });

  await t.test("plusieurs mots dont un avec une faute", async () => {
    const { titles } = await search({ query: "guitare bluse" });
    assert.deepEqual(titles, ["Guitare cigar box blues"]);
  });

  await t.test("si aucun post ne contient tous les mots, on élargit à n'importe quel mot", async () => {
    const { body, titles } = await search({ query: "guitare zzzzqx" });
    assert.equal(body.totalDocs, 2);
    assert.ok(titles.includes("Guitare cigar box blues"));
    assert.ok(titles.includes("Support de guitare pliant"));
  });

  await t.test("pertinence : le mot dans le titre passe avant le mot dans la description", async () => {
    const { titles } = await search({ query: "dragon" });
    assert.equal(titles[0], "Dragon articulé en origami");
    assert.ok(titles.indexOf("Étagère murale") > 0);
  });

  await t.test("le tri explicite par date reste respecté", async () => {
    const { body } = await search({ query: "dragon", sort: "date-asc" });
    const dates = body.docs.map((d) => new Date(d.publishedAt).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
  });

  await t.test("sécurité : la tolérance n'expose ni brouillon, ni lien secret, ni auteur suspendu", async () => {
    const { titles } = await search({ query: "dragn", limit: "20" });
    assert.ok(!titles.some((title) => /brouillon|lien secret|suspendu/.test(title)), titles.join(" | "));
  });

  await t.test("les métacaractères regex ne cassent rien", async () => {
    for (const query of ["(.*)", "dragon(", "[a-z]+", "\\", "^$|.*"]) {
      const { status } = await search({ query });
      assert.equal(status, 200, query);
    }
    const { body } = await search({ query: ".*" });
    assert.equal(body.totalDocs, 0);
  });

  await t.test("une requête longue (150 caractères) reste rapide", async () => {
    const query = "dragon chateau guitare synthetiseur papier origami carton blues ".repeat(3).slice(0, 150);
    const start = Date.now();
    const { status } = await search({ query });
    assert.equal(status, 200);
    assert.ok(Date.now() - start < 3000, `${Date.now() - start} ms`);
  });

  await t.test("pagination et total restent cohérents", async () => {
    const all = await search({ query: "dragon", limit: "20" });
    const page2 = await search({ query: "dragon", limit: "1", page: "2" });
    assert.equal(page2.body.totalDocs, all.body.totalDocs);
    assert.equal(page2.titles[0], all.titles[1]);
  });

  await t.test("aucun champ interne de score n'est exposé", async () => {
    const { body } = await search({ query: "dragon" });
    for (const doc of body.docs) {
      assert.equal(doc.searchScore, undefined);
      assert.equal(doc._fuzzyTermScores, undefined);
      assert.equal(doc.content, undefined);
    }
  });
});

test("Recherche tolérante — autocomplétion (mode=suggest)", async (t) => {
  const maker = await createUser("Gaspard Plieur");
  await createPost(maker, { title: "Grenouille sauteuse", shortDescription: "Origami qui saute vraiment" });
  await createPost(maker, { title: "Château de cartes", shortDescription: "Équilibre et patience" });

  await t.test("préfixe sans accent : « chat » propose « Château de cartes »", async () => {
    const { titles } = await search({ query: "chat", mode: "suggest" });
    assert.ok(titles.includes("Château de cartes"), titles.join(" | "));
  });

  await t.test("faute de frappe : « grenoulle » propose « Grenouille sauteuse »", async () => {
    const { titles } = await search({ query: "grenoulle", mode: "suggest" });
    assert.deepEqual(titles, ["Grenouille sauteuse"]);
  });

  await t.test("le nom de l'auteur est proposé aussi", async () => {
    const { titles } = await search({ query: "gaspard", mode: "suggest" });
    assert.ok(titles.length >= 1);
  });

  await t.test("la limite de 5 suggestions est conservée", async () => {
    const { status } = await search({ query: "ch", mode: "suggest", limit: "6" });
    assert.equal(status, 400);
  });
});
