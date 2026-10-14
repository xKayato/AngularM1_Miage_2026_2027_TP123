import { Router } from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Follow } from "../models/Follow.js";
import { Subscription } from "../models/Subscription.js";
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
