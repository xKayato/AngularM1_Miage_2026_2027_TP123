/**
 * Recherche tolérante utilisée quand Atlas Search n'est pas disponible (tests, Docker,
 * MongoDB local) ou ne renvoie rien (autocomplétion, nom d'auteur…).
 *
 * Pour chaque mot de la requête, on construit une expression régulière MongoDB qui :
 *  - ignore la casse et les accents (« chateau » trouve « Château ») ;
 *  - ramène les pluriels simples au singulier (« dragons » → « dragon », « chateaux » → « chateau ») ;
 *  - accepte une faute de frappe pour les mots de 5 lettres ou plus (lettre en trop, en moins,
 *    remplacée ou deux lettres inversées), la première lettre devant être juste, comme le
 *    `prefixLength: 1` d'Atlas, pour limiter le bruit.
 *
 * La recherche porte sur le titre, la description, le nom de l'auteur et les tags. Un score de
 * pertinence classe d'abord les documents qui contiennent tous les mots, sans faute, dans le titre.
 */

const MAX_TERMS = 8;
const MIN_FUZZY_LENGTH = 5;
const MAX_TERM_LENGTH = 30;
/** Début de mot : rien ou un caractère qui n'est ni une lettre (accents compris) ni un chiffre avant. */
const WORD_START = "(?<![\\p{L}\\p{N}])";

const STOP_WORDS = new Set([
  "a", "au", "aux", "avec", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les",
  "pour", "sur", "un", "une", "the", "of", "and",
]);

const ACCENT_CLASSES = {
  a: "aàâäáãåAÀÂÄÁÃÅ",
  c: "cçCÇ",
  e: "eéèêëEÉÈÊË",
  i: "iîïíìIÎÏÍÌ",
  n: "nñNÑ",
  o: "oôöóòõOÔÖÓÒÕ",
  u: "uùûüúUÙÛÜÚ",
  y: "yÿýYŸÝ",
};

/** Minuscules, sans accents, ligatures dépliées. */
export function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Découpe la requête en mots utiles (normalisés, pluriels simples retirés). */
export function extractSearchTerms(query) {
  const words = normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.slice(0, MAX_TERM_LENGTH));

  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  const kept = meaningful.length > 0 ? meaningful : words;

  const terms = kept.map((w) => (w.length > 4 && /[sx]$/.test(w) ? w.slice(0, -1) : w));
  return Array.from(new Set(terms)).slice(0, MAX_TERMS);
}

function letterPattern(ch) {
  if (ch === ".") return "\\S";
  const cls = ACCENT_CLASSES[ch];
  if (cls) return `[${cls}]`;
  return /[a-z0-9]/.test(ch) ? ch : `\\${ch}`;
}

function toPattern(word) {
  // « oe » / « ae » doivent aussi trouver les ligatures « œ » / « æ » (coeur → cœur)
  return word
    .split(/(oe|ae)/)
    .filter(Boolean)
    .map((part) => {
      if (part === "oe") return `(?:${letterPattern("o")}${letterPattern("e")}|[œŒ])`;
      if (part === "ae") return `(?:${letterPattern("a")}${letterPattern("e")}|[æÆ])`;
      return Array.from(part).map(letterPattern).join("");
    })
    .join("");
}

/** Variantes à une faute (première lettre conservée). */
export function oneEditVariants(term) {
  const variants = new Set();
  for (let i = 1; i <= term.length; i++) {
    if (i < term.length) {
      variants.add(term.slice(0, i) + term.slice(i + 1)); // lettre en trop dans la requête
      variants.add(term.slice(0, i) + "." + term.slice(i + 1)); // lettre remplacée
    }
    variants.add(term.slice(0, i) + "." + term.slice(i)); // lettre oubliée dans la requête
    if (i < term.length - 1) {
      variants.add(term.slice(0, i) + term[i + 1] + term[i] + term.slice(i + 2)); // inversion
    }
  }
  variants.delete(term);
  // Une variante trop courte (ex. « dra ») ferait remonter n'importe quoi
  return Array.from(variants).filter((v) => v.replace(/\./g, "").length >= MIN_FUZZY_LENGTH - 1);
}

/** Expressions régulières (exacte et tolérante) d'un mot normalisé. */
export function buildTermRegexes(term) {
  if (term.length < MIN_FUZZY_LENGTH || /^\d+$/.test(term)) {
    // Mot court : il doit commencer un mot (« ali » trouve « Alice » mais pas « Kalimba »)
    const startOfWord = `${WORD_START}${toPattern(term)}`;
    return { exact: startOfWord, fuzzy: startOfWord };
  }
  const exact = toPattern(term);
  const fuzzy = [exact, ...oneEditVariants(term).map(toPattern)].join("|");
  return { exact, fuzzy };
}

const SEARCH_FIELDS = ["title", "shortDescription", "authorDoc.name", "tags"];

/**
 * Prépare la recherche tolérante pour une requête.
 *
 * Les niveaux sont essayés dans l'ordre jusqu'au premier qui renvoie des résultats :
 *  1. `exact-all` : tous les mots, sans faute (accents et pluriels ignorés) ;
 *  2. `fuzzy-all` : tous les mots, une faute tolérée par mot ;
 *  3. `fuzzy-any` : au moins un des mots (seulement s'il y en a plusieurs).
 * On garde ainsi des résultats précis quand c'est possible, et on élargit sinon.
 *
 * @returns {null | { terms: string[], levels: string[], matchFor: (level: string) => object, scoreStages: object[] }}
 */
export function buildFuzzySearch(query) {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return null;

  const regexes = terms.map(buildTermRegexes);

  // Les tags sont un tableau : $regex s'applique à chacun de ses éléments
  const anyField = (regex) => ({
    $or: SEARCH_FIELDS.map((field) => ({ [field]: { $regex: regex, $options: "i" } })),
  });

  const matchFor = (level) => {
    if (level === "exact-all") return { $and: regexes.map(({ exact }) => anyField(exact)) };
    if (level === "fuzzy-all") return { $and: regexes.map(({ fuzzy }) => anyField(fuzzy)) };
    return { $or: regexes.flatMap(({ fuzzy }) => anyField(fuzzy).$or) };
  };

  const levels = ["exact-all", "fuzzy-all"];
  if (terms.length > 1) levels.push("fuzzy-any");

  const tagsText = {
    $reduce: { input: { $ifNull: ["$tags", []] }, initialValue: "", in: { $concat: ["$$value", " ", "$$this"] } },
  };
  const has = (input, regex) => ({ $regexMatch: { input: { $ifNull: [input, ""] }, regex, options: "i" } });
  const points = (cond, value) => ({ $cond: [cond, value, 0] });

  // Pour chaque mot, le meilleur endroit où il apparaît : un mot exact compte toujours plus
  // qu'un mot approché, et le titre plus que l'auteur ou les tags, puis la description.
  const perTerm = regexes.map(({ exact, fuzzy }) => ({
    $max: [
      points(has("$title", exact), 10),
      points(has("$authorDoc.name", exact), 8),
      points(has(tagsText, exact), 8),
      points(has("$shortDescription", exact), 6),
      points(has("$title", fuzzy), 4),
      points(has("$authorDoc.name", fuzzy), 2),
      points(has(tagsText, fuzzy), 2),
      points(has("$shortDescription", fuzzy), 1),
    ],
  }));

  // Bonus si la requête entière (plusieurs mots) apparaît telle quelle dans le titre
  const phrase = terms.length > 1 ? terms.map((t) => buildTermRegexes(t).exact).join("[^a-zA-Z0-9]+") : null;

  const scoreStages = [
    { $addFields: { _fuzzyTermScores: perTerm } },
    {
      $addFields: {
        searchScore: {
          $add: [
            { $sum: "$_fuzzyTermScores" },
            // Tous les mots présents : « faucon lego » classe d'abord le Faucon en Lego
            points({ $allElementsTrue: [{ $map: { input: "$_fuzzyTermScores", in: { $gt: ["$$this", 0] } } }] }, 8),
            phrase ? points(has("$title", phrase), 6) : 0,
          ],
        },
      },
    },
    { $project: { _fuzzyTermScores: 0 } },
  ];

  return { terms, levels, matchFor, scoreStages };
}
