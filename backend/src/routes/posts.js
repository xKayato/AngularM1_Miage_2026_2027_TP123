import { Router } from "express";
import mongoose from "mongoose";
import path from "node:path";
import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import { Post } from "../models/Post.js";
import { Like } from "../models/Like.js";
import { User } from "../models/User.js";
import { Follow } from "../models/Follow.js";
import { Subscription } from "../models/Subscription.js";
import { ShareLink } from "../models/ShareLink.js";
import { authMakerShare } from "../middlewares/authMakerShare.js";
import { optionalAuthMakerShare } from "../middlewares/optionalAuthMakerShare.js";
import {
  attachmentUploadMiddleware,
  UPLOADS_ATTACHMENTS,
} from "../middlewares/attachmentUpload.js";
import { detectAndValidateAttachment } from "../utils/attachmentValidator.js";
import {
  validateAndNormalizePostInput,
  validatePublishInput,
} from "../utils/postValidator.js";
import {
  toPostAuthorManagement,
  toPostDetail,
  toPostPreview,
} from "../utils/postProjections.js";
import { canAccessPost } from "../utils/postAccessControl.js";

export const postsRouter = Router();

/**
 * GET /api/posts
 * Catalogue public et recherche de créations.
 * Exclut formellement les drafts, les posts archivés, les posts 'link',
 * et les créations des auteurs dont le compte est suspendu.
 */
postsRouter.get("/", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    // Récupération des identifiants des utilisateurs suspendus pour filtrage strict
    const suspendedUsers = await User.find({ status: "suspended" }).select("_id");
    const suspendedIds = suspendedUsers.map((u) => u._id);

    const filter = {
      status: "published",
      visibility: { $in: ["public", "followers", "subscribers"] },
      author: { $nin: suspendedIds },
    };

    if (req.query.category?.trim()) {
      filter.category = req.query.category.trim();
    }

    if (req.query.tags) {
      const tagList = Array.isArray(req.query.tags)
        ? req.query.tags
        : req.query.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (tagList.length > 0) {
        filter.tags = { $in: tagList };
      }
    }

    if (req.query.query?.trim()) {
      const q = req.query.query.trim();
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { shortDescription: { $regex: q, $options: "i" } },
      ];
    }

    const totalDocs = await Post.countDocuments(filter);
    const totalPages = Math.ceil(totalDocs / limit) || 1;

    const posts = await Post.find(filter)
      .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .populate("author", "name status");

    // Calcul groupé garanti des likes via agrégation
    const postIds = posts.map((p) => p._id);
    const likeCounts = await Like.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]);
    const likesMap = new Map(likeCounts.map((l) => [String(l._id), l.count]));

    // Détermination de l'état d'accès / verrouillage pour l'utilisateur
    let followingSet = new Set();
    let subSet = new Set();
    if (req.user) {
      const creatorIds = posts.map((p) => p.author?._id || p.author);
      const userFollows = await Follow.find({
        followerId: req.user._id,
        creatorId: { $in: creatorIds },
      }).select("creatorId");
      followingSet = new Set(userFollows.map((f) => String(f.creatorId)));

      const userSubs = await Subscription.find({
        subscriberId: req.user._id,
        creatorId: { $in: creatorIds },
        active: true,
        expiresAt: { $gt: new Date() },
      }).select("creatorId");
      subSet = new Set(userSubs.map((s) => String(s.creatorId)));
    }

    const docs = posts.map((post) => {
      const authorIdStr = String(post.author?._id || post.author);
      const isAuthor = Boolean(req.user && String(req.user._id) === authorIdStr);

      let isLocked = true;
      if (post.visibility === "public" || isAuthor) {
        isLocked = false;
      } else if (post.visibility === "followers") {
        isLocked = !followingSet.has(authorIdStr);
      } else if (post.visibility === "subscribers") {
        isLocked = !subSet.has(authorIdStr);
      }

      return toPostPreview(post, {
        isLocked,
        likesCount: likesMap.get(String(post._id)) || 0,
        authorName: post.author?.name,
      });
    });

    res.json({
      docs,
      totalDocs,
      limit,
      page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
      pagingCounter: offset + 1,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/posts/my
 * Liste paginée des posts et brouillons appartenant à l'auteur connecté.
 */
postsRouter.get("/my", authMakerShare, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const statusParam = req.query.status;

    const filter = { author: req.user._id };
    if (
      statusParam &&
      statusParam !== "all" &&
      ["draft", "published", "archived"].includes(statusParam)
    ) {
      filter.status = statusParam;
    }

    const totalDocs = await Post.countDocuments(filter);
    const totalPages = Math.ceil(totalDocs / limit) || 1;
    const offset = (page - 1) * limit;

    const posts = await Post.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .populate("author", "name");

    const postIds = posts.map((p) => p._id);
    const likeCounts = await Like.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]);
    const likesMap = new Map(likeCounts.map((l) => [String(l._id), l.count]));

    const docs = posts.map((p) =>
      toPostAuthorManagement(p, {
        likesCount: likesMap.get(String(p._id)) || 0,
        authorName: p.author?.name || req.user.name,
      })
    );

    res.json({
      docs,
      totalDocs,
      limit,
      page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
      pagingCounter: offset + 1,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts
 * Création d'un nouveau post en statut 'draft'.
 */
postsRouter.post("/", authMakerShare, async (req, res, next) => {
  try {
    const { isValid, errors, data } = validateAndNormalizePostInput(req.body, false);
    if (!isValid) {
      return res.status(400).json({ message: errors.join(" ; ") });
    }

    const newPost = new Post({
      author: req.user._id,
      title: data.title,
      shortDescription: data.shortDescription,
      content: data.content,
      category: data.category,
      tags: data.tags,
      status: "draft",
      visibility: "public",
      publishedAt: null,
      attachments: [],
    });

    await newPost.save();

    const likesCount = await Like.countDocuments({ postId: newPost._id });

    res.status(201).json(
      toPostAuthorManagement(newPost, {
        likesCount,
        authorName: req.user.name,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/posts/shared/:token
 * Consultation complète d'un post via un lien secret de partage.
 * ⚠️ Enregistré AVANT /:id pour éviter d'être capturé par Express.
 */
postsRouter.get("/shared/:token", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const rawToken = req.params.token;
    if (!rawToken || typeof rawToken !== "string") {
      return res.status(404).json({ message: "Jeton de partage manquant" });
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
    const link = await ShareLink.findOne({ tokenHash });

    if (!link || link.revoked || !link.expiresAt || new Date(link.expiresAt) <= new Date()) {
      return res.status(410).json({
        message: "Ce lien de partage est invalide, révoqué ou a expiré",
      });
    }

    const post = await Post.findById(link.postId).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (post.status === "archived") {
      return res.status(410).json({ message: "Ce post a été archivé" });
    }

    const isAuthor = Boolean(req.user && String(req.user._id) === String(post.author?._id || post.author));
    if (post.author?.status === "suspended" && !isAuthor) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const likesCount = await Like.countDocuments({ postId: post._id });

    let userInteractions = {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    };

    if (req.user) {
      const isLiked = Boolean(
        await Like.exists({ postId: post._id, userId: req.user._id })
      );
      const isFollowing = Boolean(
        await Follow.exists({
          followerId: req.user._id,
          creatorId: post.author._id || post.author,
        })
      );
      const sub = await Subscription.findOne({
        subscriberId: req.user._id,
        creatorId: post.author._id || post.author,
        active: true,
        expiresAt: { $gt: new Date() },
      });

      userInteractions = {
        isLiked,
        isFollowingAuthor: isFollowing,
        isSubscribedToAuthor: Boolean(sub),
        subscriptionExpiresAt: sub?.expiresAt ? new Date(sub.expiresAt).toISOString() : null,
      };
    }

    res.json(
      toPostDetail(post, {
        likesCount,
        userInteractions,
        authorName: post.author?.name,
        isAuthor,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/posts/:id/preview
 * Aperçu direct d'un post (permet d'afficher le placeholder ou l'état verrouillé).
 */
postsRouter.get("/:id/preview", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const authorIdStr = String(post.author?._id || post.author);
    const isAuthor = Boolean(req.user && String(req.user._id) === authorIdStr);

    if (post.author?.status === "suspended" && !isAuthor) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (post.status === "draft" && !isAuthor) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (post.status === "archived") {
      return res.status(410).json({ message: "Ce post a été archivé" });
    }

    if (post.visibility === "link" && !isAuthor) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const likesCount = await Like.countDocuments({ postId: post._id });

    let isLocked = true;
    if (post.visibility === "public" || isAuthor) {
      isLocked = false;
    } else if (post.visibility === "followers" && req.user) {
      const isFollowing = await Follow.exists({
        followerId: req.user._id,
        creatorId: authorIdStr,
      });
      isLocked = !isFollowing;
    } else if (post.visibility === "subscribers" && req.user) {
      const activeSub = await Subscription.exists({
        subscriberId: req.user._id,
        creatorId: authorIdStr,
        active: true,
        expiresAt: { $gt: new Date() },
      });
      isLocked = !activeSub;
    }

    res.json(
      toPostPreview(post, {
        isLocked,
        likesCount,
        authorName: post.author?.name,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/posts/:id
 * Consultation détaillée d'un post avec contrôle d'accès centralisé.
 */
postsRouter.get("/:id", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const shareToken = req.headers["x-share-token"];
    const access = await canAccessPost(post, req.user, { shareToken });
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message });
    }

    const likesCount = await Like.countDocuments({ postId: post._id });

    let userInteractions = {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    };

    if (req.user) {
      const isLiked = Boolean(
        await Like.exists({ postId: post._id, userId: req.user._id })
      );
      const isFollowing = Boolean(
        await Follow.exists({
          followerId: req.user._id,
          creatorId: post.author._id || post.author,
        })
      );
      const sub = await Subscription.findOne({
        subscriberId: req.user._id,
        creatorId: post.author._id || post.author,
        active: true,
        expiresAt: { $gt: new Date() },
      });

      userInteractions = {
        isLiked,
        isFollowingAuthor: isFollowing,
        isSubscribedToAuthor: Boolean(sub),
        subscriptionExpiresAt: sub?.expiresAt ? new Date(sub.expiresAt).toISOString() : null,
      };
    }

    res.json(
      toPostDetail(post, {
        likesCount,
        userInteractions,
        authorName: post.author?.name,
        isAuthor: access.isAuthor,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts/:id/like
 * Ajoute un like sur un post si l'utilisateur y a accès.
 * - Vérifie l'authentification et le compte actif (authMakerShare).
 * - Interdit formellement l'auto-like (400).
 * - Vérifie l'accès complet de lecture au post via canAccessPost (refus 403/404/410).
 * - Garantit l'unicité { userId, postId } en base (idempotent sur appels répétés / concurrents).
 * - Calcule likesCount à partir de la collection Like.
 */
postsRouter.post("/:id/like", authMakerShare, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Identifiant de post invalide" });
    }

    const post = await Post.findById(req.params.id).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const authorIdStr = String(post.author?._id || post.author);
    if (String(req.user._id) === authorIdStr) {
      return res.status(400).json({ message: "Un auteur ne peut pas liker son propre post" });
    }

    const access = await canAccessPost(post, req.user);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || "Accès non autorisé" });
    }

    try {
      await Like.create({
        userId: req.user._id,
        postId: post._id,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Déjà liké : idempotence sous clics répétés ou concurrence simultanée
      } else {
        throw err;
      }
    }

    const likesCount = await Like.countDocuments({ postId: post._id });
    return res.status(200).json({
      liked: true,
      likesCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/posts/:id/like
 * Retire un like sur un post.
 * - Vérifie l'authentification et le compte actif (authMakerShare).
 * - Interdit l'auto-interaction pour l'auteur (400).
 * - Vérifie l'accès complet au post (403/404/410).
 * - Idempotent : supprime le document si existant.
 * - Calcule likesCount à partir de la collection Like.
 */
postsRouter.delete("/:id/like", authMakerShare, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Identifiant de post invalide" });
    }

    const post = await Post.findById(req.params.id).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const authorIdStr = String(post.author?._id || post.author);
    if (String(req.user._id) === authorIdStr) {
      return res.status(400).json({ message: "Un auteur ne peut pas interagir sur ses propres likes" });
    }

    const access = await canAccessPost(post, req.user);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || "Accès non autorisé" });
    }

    await Like.deleteOne({
      userId: req.user._id,
      postId: post._id,
    });

    const likesCount = await Like.countDocuments({ postId: post._id });
    return res.status(200).json({
      liked: false,
      likesCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/posts/:id
 * Modification d'un post par son auteur.
 */
postsRouter.put("/:id", authMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    if (post.status === "archived") {
      return res.status(400).json({ message: "Impossible de modifier un post archivé" });
    }

    const { isValid, errors, data } = validateAndNormalizePostInput(req.body, true);
    if (!isValid) {
      return res.status(400).json({ message: errors.join(" ; ") });
    }

    if (data.title !== undefined) post.title = data.title;
    if (data.shortDescription !== undefined) post.shortDescription = data.shortDescription;
    if (data.content !== undefined) post.content = data.content;
    if (data.category !== undefined) post.category = data.category;
    if (data.tags !== undefined) post.tags = data.tags;

    await post.save();

    const likesCount = await Like.countDocuments({ postId: post._id });

    res.json(
      toPostAuthorManagement(post, {
        likesCount,
        authorName: req.user.name,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts/:id/publish
 * Publication explicite d'un post avec choix de la visibilité.
 */
postsRouter.post("/:id/publish", authMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    if (post.status === "archived") {
      return res.status(400).json({ message: "Impossible de publier un post archivé" });
    }

    const { isValid, error, visibility } = validatePublishInput(req.body);
    if (!isValid) {
      return res.status(400).json({ message: error });
    }

    post.status = "published";
    post.visibility = visibility;
    if (!post.publishedAt) {
      post.publishedAt = new Date();
    }

    await post.save();

    const likesCount = await Like.countDocuments({ postId: post._id });

    res.json(
      toPostAuthorManagement(post, {
        likesCount,
        authorName: req.user.name,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts/:id/unpublish
 * Repasse un post publié en statut brouillon ('draft').
 */
postsRouter.post("/:id/unpublish", authMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    if (post.status === "archived") {
      return res.status(400).json({ message: "Impossible de dépublier un post archivé" });
    }

    post.status = "draft";
    await post.save();

    const likesCount = await Like.countDocuments({ postId: post._id });

    res.json(
      toPostAuthorManagement(post, {
        likesCount,
        authorName: req.user.name,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts/:id/share-link
 * Génère ou régénère un lien secret de partage (validité 7 jours).
 * Ne persiste que le hash SHA-256 en base et retourne le secret brut au client.
 */
postsRouter.post("/:id/share-link", authMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    if (post.status === "archived") {
      return res.status(400).json({ message: "Impossible de générer un lien pour un post archivé" });
    }

    // Révoque tout ancien lien actif pour ce post
    await ShareLink.updateMany(
      { postId: post._id, revoked: false },
      { revoked: true, revokedAt: new Date() }
    );

    const rawToken = ShareLink.generateRawToken();
    const tokenHash = ShareLink.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const created = await ShareLink.create({
      postId: post._id,
      tokenHash,
      expiresAt,
    });

    res.status(201).json({
      shareUrl: `/share/${rawToken}`,
      token: rawToken,
      expiresAt: created.expiresAt.toISOString(),
      revoked: false,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/posts/:id/share-link
 * Consulte l'état du lien secret actif de partage (sans exposer de secret brut).
 */
postsRouter.get("/:id/share-link", authMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    const activeLink = await ShareLink.findOne({
      postId: post._id,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });

    res.json({
      active: Boolean(activeLink),
      expiresAt: activeLink?.expiresAt ? activeLink.expiresAt.toISOString() : null,
      revoked: false,
      createdAt: activeLink?.createdAt ? activeLink.createdAt.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/posts/:id/share-link
 * Révoque immédiatement le lien secret actif de partage.
 */
postsRouter.delete("/:id/share-link", authMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    await ShareLink.updateMany(
      { postId: post._id, revoked: false },
      { revoked: true, revokedAt: new Date() }
    );

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts/:id/attachments
 * Upload sécurisé de pièces jointes (fichiers multiples jusqu'à 10 par lot).
 * Contrôle atomique sous concurrence sur le document MongoDB.
 */
postsRouter.post(
  "/:id/attachments",
  authMakerShare,
  attachmentUploadMiddleware,
  async (req, res, next) => {
    const uploadedFiles = req.files || [];

    const cleanupCurrentBatch = async () => {
      await Promise.all(
        uploadedFiles.map((f) => fsPromises.unlink(f.path).catch(() => {}))
      );
    };

    try {
      if (uploadedFiles.length === 0) {
        return res.status(400).json({
          message: "Aucun fichier fourni dans le champ 'files'.",
        });
      }

      const post = await Post.findById(req.params.id);
      if (!post) {
        await cleanupCurrentBatch();
        return res.status(404).json({ message: "Post introuvable" });
      }

      if (String(post.author) !== String(req.user._id)) {
        await cleanupCurrentBatch();
        return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
      }

      if (post.status === "archived") {
        await cleanupCurrentBatch();
        return res.status(400).json({
          message: "Impossible d'ajouter des pièces jointes à un post archivé",
        });
      }

      const newAttachments = [];
      for (const file of uploadedFiles) {
        const validation = await detectAndValidateAttachment(
          file.path,
          file.size,
          file.originalname
        );
        if (!validation.isValid) {
          await cleanupCurrentBatch();
          return res.status(400).json({ message: validation.error });
        }

        newAttachments.push({
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: validation.mimeType,
          size: file.size,
          family: validation.family,
          isCover: false,
        });
      }

      const totalNewBytes = newAttachments.reduce((acc, a) => acc + a.size, 0);

      // MISE À JOUR CONDITIONNELLE ATOMIQUE SUR LE DOCUMENT MONGODB
      const updatedPost = await Post.findOneAndUpdate(
        {
          _id: post._id,
          author: req.user._id,
          status: { $ne: "archived" },
          $expr: {
            $and: [
              {
                $lte: [
                  {
                    $add: [
                      { $size: { $ifNull: ["$attachments", []] } },
                      newAttachments.length,
                    ],
                  },
                  10,
                ],
              },
              {
                $lte: [
                  {
                    $add: [
                      {
                        $reduce: {
                          input: { $ifNull: ["$attachments", []] },
                          initialValue: 0,
                          in: { $add: ["$$value", "$$this.size"] },
                        },
                      },
                      totalNewBytes,
                    ],
                  },
                  52428800,
                ],
              },
            ],
          },
        },
        {
          $push: {
            attachments: { $each: newAttachments },
          },
        },
        { returnDocument: "after", runValidators: true }
      );

      if (!updatedPost) {
        await cleanupCurrentBatch();
        return res.status(400).json({
          message: "Dépassement de quota : un post ne peut pas contenir plus de 10 pièces jointes et 50 Mo cumulés.",
        });
      }

      // Marquer la première image comme cover si aucune couverture n'existe
      const hasCover = updatedPost.attachments.some((a) => a.isCover);
      if (!hasCover) {
        const firstImg = updatedPost.attachments.find((a) => a.family === "image");
        if (firstImg) {
          firstImg.isCover = true;
          await updatedPost.save();
        }
      }

      const addedSlice = updatedPost.attachments.slice(
        updatedPost.attachments.length - newAttachments.length
      );

      const responseDto = addedSlice.map((att) => ({
        id: String(att._id || att.id),
        originalName: att.originalName,
        mimeType: att.mimeType,
        size: att.size,
        family: att.family,
        downloadUrl: `/api/posts/${post._id}/attachments/${att._id || att.id}`,
        isCover: att.isCover,
      }));

      return res.status(201).json(responseDto);
    } catch (err) {
      await cleanupCurrentBatch();
      next(err);
    }
  }
);

/**
 * GET /api/posts/:id/attachments/:attachmentId
 * Téléchargement et lecture sécurisés de pièces jointes (fichiers audio, images, PDF).
 * Supporte le streaming HTTP Range, l'en-tête X-Share-Token et la protection des fichiers.
 */
postsRouter.get("/:id/attachments/:attachmentId", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .select("+attachments.storedName")
      .populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const shareToken = req.headers["x-share-token"] || req.query.shareToken;
    const access = await canAccessPost(post, req.user, {
      shareToken,
      isAttachmentDownload: true,
    });

    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message });
    }

    const attachment =
      post.attachments.id(req.params.attachmentId) ||
      post.attachments.find(
        (a) => String(a._id || a.id) === String(req.params.attachmentId)
      );

    if (!attachment) {
      return res.status(404).json({ message: "Pièce jointe introuvable dans ce post" });
    }

    const filePath = path.join(UPLOADS_ATTACHMENTS, attachment.storedName);
    try {
      await fsPromises.access(filePath);
    } catch {
      return res.status(404).json({ message: "Fichier physique introuvable sur le serveur" });
    }

    const isExplicitDownload = req.query.download === "1" || req.query.download === "true";
    const dispositionType = isExplicitDownload ? "attachment" : "inline";

    // Repli ASCII sécurisé (remplace caractères non-ASCII, guillemets et barres obliques inverses)
    const asciiFallback = attachment.originalName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_");
    const encodedUtf8 = encodeURIComponent(attachment.originalName);

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader(
      "Content-Disposition",
      `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`
    );

    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/posts/:id/attachments/:attachmentId
 * Suppression d'une pièce jointe par l'auteur du post.
 */
postsRouter.delete("/:id/attachments/:attachmentId", authMakerShare, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).select("+attachments.storedName");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    if (post.status === "archived") {
      return res.status(400).json({ message: "Impossible de modifier un post archivé" });
    }

    const attachment =
      post.attachments.id(req.params.attachmentId) ||
      post.attachments.find(
        (a) => String(a._id || a.id) === String(req.params.attachmentId)
      );

    if (!attachment) {
      return res.status(404).json({ message: "Pièce jointe introuvable dans ce post" });
    }

    const filePath = path.join(UPLOADS_ATTACHMENTS, attachment.storedName);
    await fsPromises.unlink(filePath).catch(() => {});

    post.attachments.pull(attachment._id || attachment.id);

    // Si on a supprimé la cover, réassigner la première image restante
    if (attachment.isCover) {
      const nextImg = post.attachments.find((a) => a.family === "image");
      if (nextImg) nextImg.isCover = true;
    }

    await post.save();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
