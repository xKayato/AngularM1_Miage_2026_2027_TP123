export const VALID_CATEGORIES = new Set([
  "Lego",
  "Papercraft",
  "Origami",
  "Musique",
  "Modèles 3D",
  "Autre",
]);

export const VALID_VISIBILITIES = new Set(["public", "link", "followers", "subscribers"]);

export const TAG_REGEX = /^[a-z0-9-]+$/;

const FORBIDDEN_CLIENT_FIELDS = [
  "author",
  "status",
  "publishedAt",
  "archivedAt",
  "archiveReason",
  "attachments",
  "role",
  "user",
  "seedBatch",
  "_id",
  "__v",
  "createdAt",
  "updatedAt",
];

/**
 * Valide et normalise déterministement les données d'un post (création ou mise à jour).
 *
 * @param {Object} body - Données reçues du client
 * @param {boolean} isUpdate - true si mise à jour partielle (PUT)
 * @returns {{ isValid: boolean, errors: string[], data: Object }}
 */
export function validateAndNormalizePostInput(body, isUpdate = false) {
  const errors = [];
  const result = {};

  if (!body || typeof body !== "object") {
    return {
      isValid: false,
      errors: ["Le corps de requête doit être un objet JSON valide."],
      data: {},
    };
  }

  // 1. Détection stricte des tentatives d'injection de champs système ou internes
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (body[field] !== undefined) {
      errors.push(`Modification interdite du champ système '${field}'`);
    }
  }

  // 2. Validation du titre (3 à 120 caractères)
  if (!isUpdate || body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.trim().length > 120) {
      errors.push("Le titre doit comporter entre 3 et 120 caractères.");
    } else {
      result.title = body.title.trim();
    }
  }

  // 3. Validation de la description courte (10 à 300 caractères)
  if (!isUpdate || body.shortDescription !== undefined) {
    if (
      typeof body.shortDescription !== "string" ||
      body.shortDescription.trim().length < 10 ||
      body.shortDescription.trim().length > 300
    ) {
      errors.push("La description courte doit comporter entre 10 et 300 caractères.");
    } else {
      result.shortDescription = body.shortDescription.trim();
    }
  }

  // 4. Validation du contenu intégral
  if (!isUpdate || body.content !== undefined) {
    if (typeof body.content !== "string" || body.content.trim().length < 10) {
      errors.push("Le contenu est obligatoire et doit comporter au moins 10 caractères.");
    } else {
      result.content = body.content.trim();
    }
  }

  // 5. Validation de la catégorie
  if (!isUpdate || body.category !== undefined) {
    if (typeof body.category !== "string" || !VALID_CATEGORIES.has(body.category)) {
      errors.push(
        `Catégorie invalide. Choix autorisés : ${Array.from(VALID_CATEGORIES).join(", ")}.`
      );
    } else {
      result.category = body.category;
    }
  }

  // 6. Normalisation déterministe et validation stricte des tags
  if (!isUpdate || body.tags !== undefined) {
    let rawTags = body.tags;
    if (typeof rawTags === "string") {
      rawTags = rawTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    if (!Array.isArray(rawTags)) {
      errors.push("Les tags doivent être fournis sous forme de tableau ou de chaîne séparée par des virgules.");
    } else {
      const normalizedTags = [];
      const seen = new Set();
      let hasInvalidFormat = false;
      let hasDuplicate = false;

      for (const t of rawTags) {
        if (typeof t !== "string") {
          hasInvalidFormat = true;
          errors.push("Chaque tag doit être une chaîne de caractères.");
          break;
        }

        const norm = t.trim().toLowerCase();
        if (!norm || !TAG_REGEX.test(norm)) {
          hasInvalidFormat = true;
          errors.push(
            `Tag invalide '${t}'. Seuls les caractères alphanumériques minuscules et tirets sont autorisés (ex: 'lego-technic').`
          );
        } else if (seen.has(norm)) {
          hasDuplicate = true;
        } else {
          seen.add(norm);
          normalizedTags.push(norm);
        }
      }

      if (hasDuplicate) {
        errors.push("Doublon de tags détecté après normalisation.");
      }

      if (!hasInvalidFormat && !hasDuplicate) {
        if (normalizedTags.length < 1 || normalizedTags.length > 10) {
          errors.push("Le post doit comporter entre 1 et 10 tags.");
        } else {
          result.tags = normalizedTags;
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: result,
  };
}

/**
 * Valide les paramètres de publication d'un post.
 *
 * @param {Object} body
 * @returns {{ isValid: boolean, error?: string, visibility?: string }}
 */
export function validatePublishInput(body) {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Corps de requête invalide" };
  }

  const visibility = body.visibility;
  if (!visibility || !VALID_VISIBILITIES.has(visibility)) {
    return {
      isValid: false,
      error: "Visibilité invalide. Choix autorisés : public, link, followers, subscribers.",
    };
  }

  return { isValid: true, visibility };
}
