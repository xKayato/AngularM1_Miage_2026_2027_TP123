import { Router } from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Post } from "../models/Post.js";
import { Like } from "../models/Like.js";
import { Comment } from "../models/Comment.js";
import { authMakerShare } from "../middlewares/authMakerShare.js";
import { toPostAuthorManagement } from "../utils/postProjections.js";

export const adminRouter = Router();

/**
 * Middleware de contrôle strict du rôle administrateur en base de données.
 * Vérifie toujours le rôle actuel dans la collection users, jamais seulement le JWT.
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentification requise" });
    }

    const freshUser = await User.findById(req.user._id).select("role status");
    if (!freshUser || freshUser.status === "suspended") {
      return res.status(403).json({ message: "Compte suspendu ou introuvable" });
    }

    if (freshUser.role !== "admin") {
      return res.status(403).json({ message: "Accès réservé aux administrateurs" });
    }

    req.user.role = "admin";
    next();
  } catch (err) {
    next(err);
  }
}

// Toutes les routes d'administration exigent l'authentification et le rôle admin vérifié en base
adminRouter.use(authMakerShare, requireAdmin);

/**
 * PATCH /api/admin/posts/:id/archive
 * Archivage d'un post par un administrateur pour motif de modération.
 */
adminRouter.patch("/posts/:id/archive", async (req, res, next) => {
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Identifiant de post invalide" });
    }

    const post = await Post.findById(postId).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    post.status = "archived";
    post.archivedAt = post.archivedAt || new Date();
    post.archiveReason = req.body?.reason?.trim() || post.archiveReason || "Modération administrative";
    await post.save();

    const likesCount = await Like.countDocuments({ postId: post._id });
    const commentsCount = await Comment.countDocuments({ postId: post._id });

    res.status(200).json(
      toPostAuthorManagement(post, {
        likesCount,
        commentsCount,
        authorName: post.author?.name,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/posts/:id/restore
 * Restauration d'un post archivé par un administrateur (redevient publié).
 */
adminRouter.patch("/posts/:id/restore", async (req, res, next) => {
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Identifiant de post invalide" });
    }

    const post = await Post.findById(postId).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    post.status = "published";
    post.archivedAt = null;
    post.archiveReason = null;
    await post.save();

    const likesCount = await Like.countDocuments({ postId: post._id });
    const commentsCount = await Comment.countDocuments({ postId: post._id });

    res.status(200).json(
      toPostAuthorManagement(post, {
        likesCount,
        commentsCount,
        authorName: post.author?.name,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id/suspend
 * Suspension d'un compte utilisateur par un administrateur.
 * Interdit formellement l'auto-suspension d'un administrateur.
 */
adminRouter.patch("/users/:id/suspend", async (req, res, next) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Identifiant utilisateur invalide" });
    }

    if (String(req.user._id) === String(userId)) {
      return res.status(400).json({
        message: "Un administrateur ne peut pas suspendre son propre compte",
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    targetUser.status = "suspended";
    await targetUser.save();

    res.status(200).json(targetUser.toPublic());
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id/reactivate
 * Réactivation d'un compte utilisateur suspendu par un administrateur.
 */
adminRouter.patch("/users/:id/reactivate", async (req, res, next) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Identifiant utilisateur invalide" });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    targetUser.status = "active";
    await targetUser.save();

    res.status(200).json(targetUser.toPublic());
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users/:id
 * Consultation du profil d'un utilisateur par un administrateur (par identifiant ObjectId ou par email).
 */
adminRouter.get("/users/:id", async (req, res, next) => {
  try {
    const param = req.params.id?.trim();
    let targetUser = null;

    if (mongoose.Types.ObjectId.isValid(param)) {
      targetUser = await User.findById(param);
    } else if (param.includes("@")) {
      targetUser = await User.findOne({ email: param.toLowerCase() });
    } else {
      return res.status(400).json({ message: "Identifiant ou email utilisateur invalide" });
    }

    if (!targetUser) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    res.status(200).json(targetUser.toPublic());
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/posts/:id
 * Consultation d'un post par un administrateur pour instruction de modération (y compris post archivé).
 */
adminRouter.get("/posts/:id", async (req, res, next) => {
  try {
    const postId = req.params.id?.trim();
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Identifiant de post invalide" });
    }

    const post = await Post.findById(postId).populate("author", "name status email");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const likesCount = await Like.countDocuments({ postId: post._id });
    const commentsCount = await Comment.countDocuments({ postId: post._id });

    res.status(200).json(
      toPostAuthorManagement(post, {
        likesCount,
        commentsCount,
        authorName: post.author?.name,
      })
    );
  } catch (err) {
    next(err);
  }
});
