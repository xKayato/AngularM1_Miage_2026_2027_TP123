import { Router } from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Follow } from "../models/Follow.js";
import { Subscription } from "../models/Subscription.js";
import { Post } from "../models/Post.js";
import { Like } from "../models/Like.js";
import { toPostPreview } from "../utils/postProjections.js";
import { authMakerShare } from "../middlewares/authMakerShare.js";
import { optionalAuthMakerShare } from "../middlewares/optionalAuthMakerShare.js";

export const creatorsRouter = Router();

/**
 * Valide si une chaîne est un ObjectId MongoDB valide.
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * GET /api/creators
 * Recherche publique et liste paginée des créateurs de contenu.
 * Exclut formellement les utilisateurs suspendus.
 * Ne divulgue jamais les emails, hash de mot de passe ni les comptes suivis.
 */
creatorsRouter.get("/", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const matchStage = {
      status: { $ne: "suspended" },
    };

    const rawQuery = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (rawQuery) {
      const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchStage.name = { $regex: escaped, $options: "i" };
    }

    const rawTag = typeof req.query.tag === "string" ? req.query.tag.trim().toLowerCase() : "";
    if (rawTag) {
      matchStage.profileTags = rawTag;
    }

    const pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          totalDocs: [{ $count: "count" }],
          docs: [
            { $skip: offset },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                id: { $toString: "$_id" },
                name: 1,
                bio: { $ifNull: ["$bio", ""] },
                profileTags: { $ifNull: ["$profileTags", []] },
                avatarUrl: { $concat: ["/api/users/", { $toString: "$_id" }, "/avatar"] },
                createdAt: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await User.aggregate(pipeline);
    const totalDocs = result[0]?.totalDocs[0]?.count || 0;
    const rawDocs = result[0]?.docs || [];
    const totalPages = Math.ceil(totalDocs / limit) || 1;

    const creatorIds = rawDocs.map((d) => new mongoose.Types.ObjectId(d.id));

    // Comptage des followers par créateur
    const followCounts = await Follow.aggregate([
      { $match: { creatorId: { $in: creatorIds } } },
      { $group: { _id: "$creatorId", count: { $sum: 1 } } },
    ]);
    const followMap = new Map(followCounts.map((f) => [String(f._id), f.count]));

    // Comptage des créations publiques/découvrables par créateur
    const postCounts = await Post.aggregate([
      {
        $match: {
          author: { $in: creatorIds },
          status: "published",
          visibility: { $in: ["public", "followers", "subscribers"] },
        },
      },
      { $group: { _id: "$author", count: { $sum: 1 } } },
    ]);
    const postMap = new Map(postCounts.map((p) => [String(p._id), p.count]));

    // Relations de l'utilisateur connecté si présent
    let followingSet = new Set();
    if (req.user) {
      const userFollows = await Follow.find({
        followerId: req.user._id,
        creatorId: { $in: creatorIds },
      }).select("creatorId");
      followingSet = new Set(userFollows.map((f) => String(f.creatorId)));
    }

    const docs = rawDocs.map((c) => ({
      ...c,
      bio: c.bio || "Aucune biographie renseignée pour le moment.",
      followersCount: followMap.get(c.id) || 0,
      creationsCount: postMap.get(c.id) || 0,
      isFollowing: followingSet.has(c.id),
    }));

    res.json({
      docs,
      items: docs,
      totalDocs,
      total: totalDocs,
      limit,
      page,
      totalPages,
      pages: totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creators/my/follows
 * Retourne la liste paginée des créateurs suivis par l'utilisateur connecté.
 * Exclut formellement les créateurs suspendus AVANT pagination et AVANT totalDocs.
 */
creatorsRouter.get("/my/follows", authMakerShare, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const pipeline = [
      { $match: { followerId: req.user._id } },
      {
        $lookup: {
          from: "users",
          localField: "creatorId",
          foreignField: "_id",
          as: "creatorDoc",
        },
      },
      { $unwind: "$creatorDoc" },
      { $match: { "creatorDoc.status": { $ne: "suspended" } } },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          totalDocs: [{ $count: "count" }],
          docs: [
            { $skip: offset },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                id: { $toString: "$_id" },
                creator: {
                  id: { $toString: "$creatorDoc._id" },
                  name: "$creatorDoc.name",
                },
                createdAt: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await Follow.aggregate(pipeline);
    const totalDocs = result[0]?.totalDocs[0]?.count || 0;
    const docs = result[0]?.docs || [];
    const totalPages = Math.ceil(totalDocs / limit) || 1;

    res.json({
      docs,
      items: docs,
      totalDocs,
      total: totalDocs,
      limit,
      page,
      totalPages,
      pages: totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creators/my/subscriptions
 * Retourne la liste paginée des abonnements simulés actifs de l'utilisateur connecté.
 * Exclut formellement les abonnements expirés, inactifs ou dont le créateur est suspendu AVANT pagination.
 */
creatorsRouter.get("/my/subscriptions", authMakerShare, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const now = new Date();

    const pipeline = [
      {
        $match: {
          subscriberId: req.user._id,
          active: true,
          expiresAt: { $gt: now },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "creatorId",
          foreignField: "_id",
          as: "creatorDoc",
        },
      },
      { $unwind: "$creatorDoc" },
      { $match: { "creatorDoc.status": { $ne: "suspended" } } },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          totalDocs: [{ $count: "count" }],
          docs: [
            { $skip: offset },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                id: { $toString: "$_id" },
                creator: {
                  id: { $toString: "$creatorDoc._id" },
                  name: "$creatorDoc.name",
                },
                active: 1,
                expiresAt: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await Subscription.aggregate(pipeline);
    const totalDocs = result[0]?.totalDocs[0]?.count || 0;
    const docs = result[0]?.docs || [];
    const totalPages = Math.ceil(totalDocs / limit) || 1;

    res.json({
      docs,
      items: docs,
      totalDocs,
      total: totalDocs,
      limit,
      page,
      totalPages,
      pages: totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creators/:id
 * Retourne le profil public d'un créateur avec ses compteurs réels et ses créations découvrables.
 * Exclut formellement les créateurs suspendus (404).
 * Ne divulgue jamais les emails, hash de mot de passe, ni la liste des comptes suivis.
 */
creatorsRouter.get("/:id", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const creatorId = req.params.id;
    if (!isValidObjectId(creatorId)) {
      return res.status(400).json({ message: "Identifiant créateur invalide" });
    }

    const creator = await User.findById(creatorId);
    if (!creator || creator.status === "suspended") {
      return res.status(404).json({ message: "Créateur introuvable ou inactif" });
    }

    const isSelf = Boolean(req.user && String(req.user._id) === String(creator._id));

    // Relations de l'utilisateur connecté vis-à-vis de ce créateur
    let isFollowing = false;
    let isSubscribed = false;
    let subscriptionExpiresAt = null;

    if (req.user && !isSelf) {
      isFollowing = Boolean(
        await Follow.exists({
          followerId: req.user._id,
          creatorId: creator._id,
        })
      );

      const sub = await Subscription.findOne({
        subscriberId: req.user._id,
        creatorId: creator._id,
        active: true,
        expiresAt: { $gt: new Date() },
      });
      if (sub) {
        isSubscribed = true;
        subscriptionExpiresAt = sub.expiresAt ? new Date(sub.expiresAt).toISOString() : null;
      }
    }

    // Compteurs réels du créateur
    const followersCount = await Follow.countDocuments({ creatorId: creator._id });
    // Compteur d'abonnés : compteurs UNIQUEMENT actifs non expirés
    const subscribersCount = await Subscription.countDocuments({
      creatorId: creator._id,
      active: true,
      expiresAt: { $gt: new Date() },
    });

    // Créations découvrables du créateur :
    // - Strictement exclure les drafts (sauf si auteur connecté)
    // - Strictement exclure les posts link (non répertoriés)
    // - Posts followers/subscribers : inclus avec isLocked: true si pas les droits
    const postFilter = {
      author: creator._id,
      status: "published",
      visibility: { $in: ["public", "followers", "subscribers"] },
    };

    const creatorPosts = await Post.find(postFilter)
      .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
      .limit(30)
      .lean();

    const postIds = creatorPosts.map((p) => p._id);
    const likeCounts = await Like.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]);
    const likesMap = new Map(likeCounts.map((l) => [String(l._id), l.count]));

    const creations = creatorPosts.map((post) => {
      let isLocked = true;
      if (post.visibility === "public" || isSelf) {
        isLocked = false;
      } else if (post.visibility === "followers") {
        isLocked = !isFollowing;
      } else if (post.visibility === "subscribers") {
        isLocked = !isSubscribed;
      }

      return toPostPreview(post, {
        isLocked,
        likesCount: likesMap.get(String(post._id)) || 0,
        authorName: creator.name,
      });
    });

    const creationsCount = creations.length;

    res.json({
      id: String(creator._id),
      name: creator.name,
      bio: creator.bio || "Aucune biographie renseignée pour le moment.",
      profileTags: Array.isArray(creator.profileTags) ? creator.profileTags : [],
      avatarUrl: `/api/users/${creator._id}/avatar`,
      createdAt: creator.createdAt,
      followersCount,
      subscribersCount,
      creationsCount,
      isSelf,
      userInteractions: {
        isFollowing,
        isSubscribed,
        subscriptionExpiresAt,
      },
      creations,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/creators/:id/follow
 * Permet à un utilisateur actif de suivre un créateur actif de manière unilatérale.
 * Interdit formellement l'auto-follow (400).
 */
creatorsRouter.post("/:id/follow", authMakerShare, async (req, res, next) => {
  try {
    const creatorId = req.params.id;
    if (!isValidObjectId(creatorId)) {
      return res.status(400).json({ message: "Identifiant créateur invalide" });
    }

    // Interdiction de s'auto-suivre
    if (String(req.user._id) === String(creatorId)) {
      return res.status(400).json({ message: "Un utilisateur ne peut pas se suivre lui-même" });
    }

    // Vérifier l'existence et l'état du créateur
    const creator = await User.findById(creatorId);
    if (!creator || creator.status === "suspended") {
      return res.status(404).json({ message: "Créateur introuvable ou inactif" });
    }

    try {
      await Follow.create({
        followerId: req.user._id,
        creatorId: creator._id,
      });
      return res.status(200).json({ following: true });
    } catch (err) {
      if (err.code === 11000) {
        // Déjà suivi (idempotence)
        return res.status(200).json({ following: true });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/creators/:id/follow
 * Cesse de suivre un créateur.
 */
creatorsRouter.delete("/:id/follow", authMakerShare, async (req, res, next) => {
  try {
    const creatorId = req.params.id;
    if (!isValidObjectId(creatorId)) {
      return res.status(400).json({ message: "Identifiant créateur invalide" });
    }

    await Follow.deleteOne({
      followerId: req.user._id,
      creatorId,
    });

    return res.status(200).json({ following: false });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/creators/:id/subscribe
 * Active un abonnement simulé de 30 jours pour ce créateur.
 * - Vérifie que le compte est actif et que le créateur existe et est actif.
 * - Interdit formellement l'auto-abonnement (400).
 * - Un abonnement déjà actif renvoie 409 Conflict avec son expiration sans prolongation.
 * - Après expiration, permet une nouvelle activation en respectant l'index unique { subscriberId, creatorId }.
 * - Protège contre deux activations concurrentes simultanées via opérations atomiques MongoDB.
 */
creatorsRouter.post("/:id/subscribe", authMakerShare, async (req, res, next) => {
  try {
    const creatorId = req.params.id;
    if (!isValidObjectId(creatorId)) {
      return res.status(400).json({ message: "Identifiant créateur invalide" });
    }

    // Interdiction formelle de s'auto-abonner
    if (String(req.user._id) === String(creatorId)) {
      return res.status(400).json({ message: "Un utilisateur ne peut pas s'abonner à lui-même" });
    }

    // Vérifier l'existence et l'état du créateur
    const creator = await User.findById(creatorId);
    if (!creator || creator.status === "suspended") {
      return res.status(404).json({ message: "Créateur introuvable ou inactif" });
    }

    const now = new Date();
    const durationDays = 30;
    const newExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // 1. Vérifier si un abonnement existe déjà pour cette paire (subscriberId, creatorId)
    const existing = await Subscription.findOne({
      subscriberId: req.user._id,
      creatorId: creator._id,
    });

    if (existing) {
      // S'il est encore actif, interdiction formelle de prolonger -> 409 Conflict
      if (existing.active && existing.expiresAt && new Date(existing.expiresAt) > now) {
        return res.status(409).json({
          message: `Abonnement déjà actif jusqu'au ${new Date(existing.expiresAt).toLocaleDateString("fr-FR")}`,
          expiresAt: new Date(existing.expiresAt).toISOString(),
        });
      }

      // S'il est expiré ou inactif, mise à jour atomique conditionnelle pour éviter la concurrence
      const renewed = await Subscription.findOneAndUpdate(
        {
          _id: existing._id,
          $or: [
            { expiresAt: { $lte: now } },
            { active: false },
          ],
        },
        {
          $set: {
            active: true,
            expiresAt: newExpiresAt,
          },
        },
        { returnDocument: "after" }
      );

      if (!renewed) {
        // Une requête concurrente a déjà renouvelé l'abonnement
        const currentActive = await Subscription.findById(existing._id);
        return res.status(409).json({
          message: `Abonnement déjà actif jusqu'au ${new Date(currentActive.expiresAt).toLocaleDateString("fr-FR")}`,
          expiresAt: new Date(currentActive.expiresAt).toISOString(),
        });
      }

      return res.status(201).json({
        subscribed: true,
        expiresAt: renewed.expiresAt.toISOString(),
      });
    }

    // 2. Aucun document existant : création atomique
    try {
      const created = await Subscription.create({
        subscriberId: req.user._id,
        creatorId: creator._id,
        active: true,
        expiresAt: newExpiresAt,
      });

      return res.status(201).json({
        subscribed: true,
        expiresAt: created.expiresAt.toISOString(),
      });
    } catch (err) {
      // En cas de collision concurrente immédiate captée par l'index unique MongoDB { subscriberId: 1, creatorId: 1 }
      if (err.code === 11000) {
        const raceWinner = await Subscription.findOne({
          subscriberId: req.user._id,
          creatorId: creator._id,
        });
        const expStr = raceWinner?.expiresAt
          ? new Date(raceWinner.expiresAt).toISOString()
          : newExpiresAt.toISOString();
        return res.status(409).json({
          message: `Abonnement déjà actif jusqu'au ${new Date(expStr).toLocaleDateString("fr-FR")}`,
          expiresAt: expStr,
        });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creators/:id/status
 * Retourne le statut d'interaction entre l'utilisateur connecté et ce créateur.
 */
creatorsRouter.get("/:id/status", optionalAuthMakerShare, async (req, res, next) => {
  try {
    const creatorId = req.params.id;
    if (!isValidObjectId(creatorId)) {
      return res.status(400).json({ message: "Identifiant créateur invalide" });
    }

    if (!req.user) {
      return res.json({
        isFollowing: false,
        isSubscribed: false,
        expiresAt: null,
      });
    }

    const isFollowing = Boolean(
      await Follow.exists({
        followerId: req.user._id,
        creatorId,
      })
    );

    const sub = await Subscription.findOne({
      subscriberId: req.user._id,
      creatorId,
      active: true,
      expiresAt: { $gt: new Date() },
    });

    return res.json({
      isFollowing,
      isSubscribed: Boolean(sub),
      expiresAt: sub?.expiresAt ? new Date(sub.expiresAt).toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});
