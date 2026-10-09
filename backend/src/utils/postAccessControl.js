import crypto from "node:crypto";
import { User } from "../models/User.js";
import { Follow } from "../models/Follow.js";
import { Subscription } from "../models/Subscription.js";
import { ShareLink } from "../models/ShareLink.js";

/**
 * Décision d'accès centralisée pour MakerShare.
 * Réutilisée pour le détail d'un post et pour chaque téléchargement/streaming de pièce jointe.
 *
 * Règles :
 * - Refus par défaut.
 * - Vérifie en base les rôles, statuts, relations et expirations.
 * - Les posts d'un auteur suspendu sont inaccessibles aux tiers (404 Not Found).
 * - Les posts archivés renvoient 410 Gone (sauf vue modération admin sans pièces jointes privées).
 * - Les brouillons sont strictement réservés à leur auteur (404 pour les tiers).
 * - Les administrateurs n'ont PAS de passe-droit magique sur les pièces jointes privées.
 * - Le token secret X-Share-Token permet l'accès à un visiteur anonyme ou connecté actif.
 *
 * @param {Object} post - Document Post
 * @param {Object|null} user - Utilisateur connecté (ou null si anonyme)
 * @param {Object} [options]
 * @param {string} [options.shareToken] - Jeton secret brut (issu de X-Share-Token ou URL)
 * @param {boolean} [options.isAttachmentDownload] - true si requête de fichier binaire
 * @param {boolean} [options.isAdminModAction] - true si action explicite de modération admin
 * @returns {Promise<{ allowed: boolean, status?: number, message?: string, isAuthor?: boolean, isFollower?: boolean, isSubscriber?: boolean, viaShareLink?: boolean }>}
 */
export async function canAccessPost(post, user, options = {}) {
  if (!post) {
    return { allowed: false, status: 404, message: "Post introuvable" };
  }

  const authorIdStr = String(post.author?._id || post.author);
  const currentUserIdStr = user ? String(user._id) : null;
  const isAuthor = Boolean(currentUserIdStr && currentUserIdStr === authorIdStr);

  // 1. VÉRIFICATION DU STATUT DE L'AUTEUR EN BASE DE DONNÉES
  let authorStatus = post.author?.status;
  if (!authorStatus) {
    const authorDoc = await User.findById(authorIdStr).select("status");
    authorStatus = authorDoc?.status || "active";
  }

  if (authorStatus === "suspended") {
    if (isAuthor) {
      return { allowed: false, status: 403, message: "Votre compte est suspendu" };
    }
    // Pour tout tiers, un créateur suspendu rend ses posts introuvables (404)
    return { allowed: false, status: 404, message: "Post introuvable" };
  }

  // 2. STATUT ARCHIVÉ (410 Gone pour tous les utilisateurs en Mission 4)
  // ⚠️ La route spécifique de modération admin sans pièces jointes privées est reportée à la Mission 8.
  if (post.status === "archived") {
    return { allowed: false, status: 410, message: "Ce post a été archivé" };
  }

  // 3. STATUT BROUILLON (Draft)
  if (post.status === "draft") {
    if (isAuthor) {
      return { allowed: true, isAuthor: true };
    }
    return { allowed: false, status: 404, message: "Post introuvable" };
  }

  // 4. STATUT PUBLIÉ (Published)
  if (post.status !== "published") {
    return { allowed: false, status: 404, message: "Post introuvable" };
  }

  // L'auteur a un accès direct total à ses propres publications
  if (isAuthor) {
    return { allowed: true, isAuthor: true };
  }

  // 5. TEST DU JETON SECRET DE PARTAGE SI FOURNI
  const rawShareToken = options.shareToken?.trim();
  let hasValidShareLink = false;
  let isShareTokenExpiredOrRevoked = false;

  if (rawShareToken) {
    const tokenHash = crypto.createHash("sha256").update(rawShareToken).digest("hex");
    const link = await ShareLink.findOne({
      postId: post._id,
      tokenHash,
    });

    if (link && !link.revoked && link.expiresAt && new Date(link.expiresAt) > new Date()) {
      hasValidShareLink = true;
    } else if (link) {
      isShareTokenExpiredOrRevoked = true;
    }
  }

  if (hasValidShareLink) {
    return { allowed: true, viaShareLink: true };
  }

  // 6. RÈGLES SELON LA VISIBILITÉ DU POST
  const visibility = post.visibility || "public";

  // Visibilité PUBLIC
  if (visibility === "public") {
    return { allowed: true };
  }

  // Visibilité LIEN SECRET (Link)
  if (visibility === "link") {
    if (isShareTokenExpiredOrRevoked) {
      return {
        allowed: false,
        status: 410,
        message: "Ce lien de partage est invalide, révoqué ou a expiré",
      };
    }
    // Sans jeton valide, le post est inaccessible
    if (options.isAttachmentDownload) {
      return {
        allowed: false,
        status: 403,
        message: "Jeton de partage secret requis (en-tête X-Share-Token)",
      };
    }
    // Pour GET /api/posts/:id, non découvrable -> 404 Not Found
    return { allowed: false, status: 404, message: "Post introuvable" };
  }

  // Visibilité FOLLOWERS
  if (visibility === "followers") {
    if (!user) {
      return {
        allowed: false,
        status: 401,
        message: "Authentification requise pour accéder à ce contenu réservé aux followers",
      };
    }

    const isFollowing = await Follow.exists({
      followerId: user._id,
      creatorId: authorIdStr,
    });

    if (isFollowing) {
      return { allowed: true, isFollower: true };
    }

    return {
      allowed: false,
      status: 403,
      message: "Ce contenu est réservé aux followers de l'auteur",
    };
  }

  // Visibilité SUBSCRIBERS
  if (visibility === "subscribers") {
    if (!user) {
      return {
        allowed: false,
        status: 401,
        message: "Authentification requise pour accéder à ce contenu réservé aux abonnés",
      };
    }

    const activeSub = await Subscription.findOne({
      subscriberId: user._id,
      creatorId: authorIdStr,
      active: true,
      expiresAt: { $gt: new Date() },
    });

    if (activeSub) {
      return { allowed: true, isSubscriber: true };
    }

    return {
      allowed: false,
      status: 403,
      message: "Ce contenu est réservé aux abonnés actifs de l'auteur",
    };
  }

  // 7. REFUS PAR DÉFAUT
  return { allowed: false, status: 403, message: "Accès refusé" };
}
