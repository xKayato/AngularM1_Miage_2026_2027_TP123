/**
 * Projections et DTOs stricts pour MakerShare.
 * Garantit qu'aucun champ sensible (storedName, hash, contenu complet pour les aperçus)
 * ne fuite vers les réponses HTTP.
 */

/**
 * Projette un document Post en aperçu `PostPreview` pour le catalogue et la recherche.
 * ⚠️ Sécurité : Omet strictement `content`, `storedName` et les liens directs de fichiers.
 * ⚠️ Règle coverUrl : Uniquement fournie si le post est déverrouillé ET qu'une pièce jointe image/cover existe.
 * ⚠️ Règle likesCount : Le modèle Post ne persiste pas likesCount (collection Like dédiée).
 *                      Il doit être précalculé par pipeline d'agrégation ou injecté via options.likesCount.
 *
 * @param {Object} post - Document Mongoose ou objet POJO (lean)
 * @param {Object} [options]
 * @param {boolean} [options.isLocked] - Verrouillage d'accès (par défaut : true si visibilité privée/followers/subscribers sans hasAccess)
 * @param {boolean} [options.hasAccess] - true si l'utilisateur courant a les droits d'accès
 * @param {boolean} [options.isAuthor] - true si l'utilisateur courant est l'auteur
 * @param {number} [options.likesCount] - Nombre dynamique de likes précalculé
 * @param {string} [options.authorName] - Nom d'auteur de repli si author est un ObjectId non peuplé
 * @returns {Object} PostPreview conforme au contrat
 */
export function toPostPreview(post, options = {}) {
  if (!post) return null;

  const raw = typeof post.toObject === "function" ? post.toObject() : post;
  const postId = String(raw._id || raw.id);
  const visibility = raw.visibility || "public";

  // Détermination robuste et sécurisée du verrouillage :
  // Si non spécifié explicitement, un post non public est verrouillé par défaut sauf si hasAccess ou isAuthor.
  let isLocked = true;
  if (typeof options.isLocked === "boolean") {
    isLocked = options.isLocked;
  } else if (visibility === "public") {
    isLocked = false;
  } else if (options.hasAccess === true || options.isAuthor === true) {
    isLocked = false;
  }

  // Normalisation de l'auteur (avec avatar sécurisé, sans données privées)
  const authorId = String(raw.author?._id || raw.author?.id || raw.author || "");
  const authorName = raw.author?.name || options.authorName || "Auteur inconnu";
  const hasAvatar = Boolean(raw.author?.avatar?.storedName || raw.author?.hasAvatar || options.hasAvatar);
  const authorObj = {
    id: authorId,
    name: authorName,
    hasAvatar,
    avatarUrl: hasAvatar && authorId ? `/api/users/${authorId}/avatar` : null,
  };

  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  const attachmentsCount = attachments.length;
  const hasAudio = attachments.some((att) => att.family === "audio");

  // Règle stricte de coverUrl :
  // Si verrouillé -> null (placeholder neutre / cadenas)
  // Si déverrouillé -> URL uniquement si une image de couverture explicite (isCover: true) existe.
  // La réapparition automatique de la première image par fallback silencieux est formellement supprimée.
  let coverUrl = null;
  if (!isLocked) {
    const coverAttachment = attachments.find((att) => att.isCover);
    if (coverAttachment) {
      const attId = String(coverAttachment._id || coverAttachment.id);
      coverUrl = `/api/posts/${postId}/attachments/${attId}`;
    }
  }

  // Règle likesCount :
  // Doit impérativement être un nombre calculé (options.likesCount ou agrégation raw.likesCount).
  // Tout fallback silencieux à zéro est proscrit pour éviter de présenter une valeur inconnue comme exacte.
  let likesCount;
  if (typeof options.likesCount === "number") {
    likesCount = Math.max(0, options.likesCount);
  } else if (typeof raw.likesCount === "number") {
    likesCount = Math.max(0, raw.likesCount);
  } else {
    throw new TypeError(
      "likesCount must be explicitly provided as a calculated number (or from aggregation pipeline). Fake fallback to 0 is not permitted."
    );
  }

  let commentsCount = 0;
  if (typeof options.commentsCount === "number") {
    commentsCount = Math.max(0, options.commentsCount);
  } else if (typeof raw.commentsCount === "number") {
    commentsCount = Math.max(0, raw.commentsCount);
  }

  return {
    id: postId,
    author: authorObj,
    title: raw.title,
    shortDescription: raw.shortDescription,
    category: raw.category,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    visibility,
    likesCount,
    commentsCount,
    attachmentsCount,
    hasAudio,
    coverUrl,
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt).toISOString() : null,
    isLocked,
  };
}

/**
 * Projette un document Post en `PostDetail` pour les lecteurs autorisés.
 * Fournit le contenu intégral et les endpoints sécurisés de téléchargement.
 *
 * @param {Object} post - Document Mongoose ou objet POJO
 * @param {Object} [options]
 * @param {Object} [options.userInteractions] - Interactions de l'utilisateur courant
 * @param {number} [options.likesCount] - Nombre de likes précalculé
 * @param {number} [options.commentsCount] - Nombre de commentaires précalculé
 * @param {string} [options.authorName] - Nom d'auteur de repli si author non peuplé
 * @returns {Object} PostDetail conforme au contrat
 */
export function toPostDetail(post, options = {}) {
  if (!post) return null;

  const raw = typeof post.toObject === "function" ? post.toObject() : post;
  const postId = String(raw._id || raw.id);

  const authorId = String(raw.author?._id || raw.author?.id || raw.author || "");
  const authorName = raw.author?.name || options.authorName || "Auteur inconnu";
  const hasAvatar = Boolean(raw.author?.avatar?.storedName || raw.author?.hasAvatar || options.hasAvatar);
  const authorObj = {
    id: authorId,
    name: authorName,
    hasAvatar,
    avatarUrl: hasAvatar && authorId ? `/api/users/${authorId}/avatar` : null,
  };

  const attachments = (Array.isArray(raw.attachments) ? raw.attachments : []).map((att) => {
    const attId = String(att._id || att.id);
    return {
      id: attId,
      originalName: att.originalName,
      mimeType: att.mimeType,
      size: att.size,
      family: att.family,
      downloadUrl: `/api/posts/${postId}/attachments/${attId}`,
      isCover: Boolean(att.isCover),
    };
  });

  const defaultInteractions = {
    isLiked: false,
    isFollowingAuthor: false,
    isSubscribedToAuthor: false,
    subscriptionExpiresAt: null,
  };

  let likesCount;
  if (typeof options.likesCount === "number") {
    likesCount = Math.max(0, options.likesCount);
  } else if (typeof raw.likesCount === "number") {
    likesCount = Math.max(0, raw.likesCount);
  } else {
    throw new TypeError(
      "likesCount must be explicitly provided as a calculated number (or from aggregation pipeline). Fake fallback to 0 is not permitted."
    );
  }

  let commentsCount = 0;
  if (typeof options.commentsCount === "number") {
    commentsCount = Math.max(0, options.commentsCount);
  } else if (typeof raw.commentsCount === "number") {
    commentsCount = Math.max(0, raw.commentsCount);
  }

  return {
    id: postId,
    author: authorObj,
    title: raw.title,
    shortDescription: raw.shortDescription,
    content: raw.content,
    category: raw.category,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    visibility: raw.visibility,
    status: raw.status,
    likesCount,
    commentsCount,
    attachments,
    coverUrl: attachments.find((att) => att.isCover)?.downloadUrl || null,
    userInteractions: {
      ...defaultInteractions,
      ...(options.userInteractions || {}),
    },
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt).toISOString() : null,
    archivedAt: raw.archivedAt ? new Date(raw.archivedAt).toISOString() : null,
    archiveReason: raw.archiveReason || null,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
  };
}

/**
 * Projette un document Post en `PostAuthorManagement` pour l'espace auteur.
 * Adjoint les métadonnées de gestion de lien de partage sans jamais exposer le secret.
 *
 * @param {Object} post - Document Mongoose ou objet POJO
 * @param {Object} [options]
 * @param {Object} [options.shareLinkInfo]
 * @returns {Object} PostAuthorManagement conforme au contrat
 */
export function toPostAuthorManagement(post, options = {}) {
  const detail = toPostDetail(post, options);
  if (!detail) return null;

  const defaultShareLinkInfo = {
    hasLink: false,
    status: "none",
    expiresAt: null,
    createdAt: null,
  };

  return {
    ...detail,
    shareLinkInfo: {
      ...defaultShareLinkInfo,
      ...(options.shareLinkInfo || {}),
    },
  };
}
