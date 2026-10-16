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
import { Comment } from "../models/Comment.js";
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
  VALID_CATEGORIES,
  TAG_REGEX,
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
 * Recherche serveur avec tolérance aux fautes (Atlas Search) ou repli regex,
 * filtres exacts par catégorie et par tags (règle 'tous les tags demandés' $all),
 * exclusion absolue des drafts, posts link, posts archivés et auteurs suspendus,
 * pagination et total via pipeline d'agrégation $facet, et projection stricte PostPreview.
 */
postsRouter.get("/", optionalAuthMakerShare, async (req, res, next) => {
  try {
    // 0. Validation du mode de recherche (catalog ou suggest)
    const mode = req.query.mode ? String(req.query.mode).trim() : "catalog";
    if (mode !== "catalog" && mode !== "suggest") {
      return res.status(400).json({
        message: "Le paramètre mode doit valoir 'suggest' ou être omis.",
      });
    }

    if (mode === "suggest") {
      if (!req.query.query || typeof req.query.query !== "string" || !req.query.query.trim()) {
        return res.status(400).json({
          message: "Le paramètre query est obligatoire en mode suggestion.",
        });
      }
    }

    // 1. Validation de la pagination
    if (req.query.page !== undefined) {
      const p = Number(req.query.page);
      if (!Number.isInteger(p) || p < 1) {
        return res.status(400).json({
          message: "Le paramètre page doit être un entier supérieur ou égal à 1.",
        });
      }
    }
    if (req.query.limit !== undefined) {
      const l = Number(req.query.limit);
      const maxLimit = mode === "suggest" ? 5 : 20;
      if (!Number.isInteger(l) || l < 1 || l > maxLimit) {
        return res.status(400).json({
          message:
            mode === "suggest"
              ? "En mode suggestion, le paramètre limit doit être un entier compris entre 1 et 5."
              : "Le paramètre limit doit être un entier compris entre 1 et 20.",
        });
      }
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const defaultLimit = mode === "suggest" ? 5 : 10;
    const maxLimit = mode === "suggest" ? 5 : 20;
    const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
    const offset = (page - 1) * limit;

    // 2. Validation de la catégorie si fournie
    let category = null;
    if (typeof req.query.category === "string") {
      const trimmedCat = req.query.category.trim();
      if (trimmedCat && trimmedCat !== "Toutes") {
        if (!VALID_CATEGORIES.has(trimmedCat)) {
          return res.status(400).json({
            message: `Catégorie inconnue ou invalide: '${trimmedCat}'.`,
          });
        }
        category = trimmedCat;
      }
    }

    // 3. Validation et normalisation des tags si fournis (tous les tags demandés)
    let tagList = [];
    if (req.query.tags !== undefined) {
      const rawTags = Array.isArray(req.query.tags)
        ? req.query.tags
        : String(req.query.tags).split(",");
      const normalized = rawTags
        .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
        .filter(Boolean);

      for (const tag of normalized) {
        if (!TAG_REGEX.test(tag)) {
          return res.status(400).json({
            message: `Format de tag invalide: '${tag}' (minuscules, chiffres et tirets uniquement).`,
          });
        }
      }
      tagList = Array.from(new Set(normalized));
    }

    // 4. Validation du texte de recherche et extraction de la syntaxe #tag
    let textQuery = "";
    if (typeof req.query.query === "string") {
      const rawQuery = req.query.query.trim();
      if (rawQuery.length > 150) {
        return res.status(400).json({
          message: "La requête de recherche ne doit pas dépasser 150 caractères.",
        });
      }

      // Extraction de la syntaxe #tag (ex. 'château #lego #star-wars' ou '#origami')
      const inlineTagRegex = /#([a-zA-Z0-9-]+)/g;
      let match;
      const inlineTags = [];
      while ((match = inlineTagRegex.exec(rawQuery)) !== null) {
        const extracted = match[1].toLowerCase();
        if (TAG_REGEX.test(extracted)) {
          inlineTags.push(extracted);
        }
      }

      if (inlineTags.length > 0) {
        tagList = Array.from(new Set([...tagList, ...inlineTags]));
      }

      // Nettoyage des occurrences #tag de la chaîne textuelle
      const cleanedQuery = rawQuery
        .replace(/#([a-zA-Z0-9-]+)/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      textQuery = cleanedQuery;
    }

    if (mode === "suggest" && !textQuery && tagList.length > 0) {
      textQuery = tagList[0];
    }

    // 4b. Validation et normalisation du paramètre de tri déterministe
    const VALID_SORTS = new Set([
      "date_desc",
      "date-desc",
      "date_asc",
      "date-asc",
      "likes_desc",
      "likes-desc",
      "relevance",
    ]);

    let sortCriteria = "date_desc";
    if (req.query.sort !== undefined) {
      const rawSort = String(req.query.sort).trim().toLowerCase();
      if (!VALID_SORTS.has(rawSort)) {
        return res.status(400).json({
          message: `Critère de tri invalide: '${rawSort}'. Valeurs autorisées: date-desc, date-asc, likes-desc, relevance.`,
        });
      }
      if (rawSort === "date-desc" || rawSort === "date_desc") {
        sortCriteria = "date_desc";
      } else if (rawSort === "date-asc" || rawSort === "date_asc") {
        sortCriteria = "date_asc";
      } else if (rawSort === "likes-desc" || rawSort === "likes_desc") {
        sortCriteria = "likes_desc";
      } else if (rawSort === "relevance") {
        sortCriteria = "relevance";
      }
    } else if (mode === "suggest") {
      sortCriteria = "relevance";
    } else if (textQuery) {
      sortCriteria = "relevance";
    }

    // 5. Construction du pipeline d'agrégation MakerShare
    const buildPipeline = (useAtlasSearch) => {
      const pipeline = [];

      // Étape 1 : $search si recherche textuelle et Atlas Search activé
      if (useAtlasSearch && textQuery) {
        let compoundClauses;

        if (mode === "suggest") {
          // Mode suggestion : autocomplétion sur title avec priorité au préfixe exact
          const shouldClauses = [
            {
              autocomplete: {
                query: textQuery,
                path: "title",
                score: { boost: { value: 3 } },
              },
            },
          ];

          // Tolérance aux fautes (fuzzy) activée uniquement à partir de 3 caractères
          if (textQuery.length >= 3) {
            shouldClauses.push({
              autocomplete: {
                query: textQuery,
                path: "title",
                fuzzy: {
                  maxEdits: 1,
                  prefixLength: 2,
                  maxExpansions: 50,
                },
                score: { boost: { value: 1 } },
              },
            });
          }

          compoundClauses = {
            should: shouldClauses,
            minimumShouldMatch: 1,
          };
        } else {
          // Mode catalogue : recherche plein texte standard avec analyseur français
          compoundClauses = {
            must: [
              {
                text: {
                  query: textQuery,
                  path: ["title", "shortDescription"],
                  fuzzy: { maxEdits: 1, prefixLength: 1 },
                },
              },
            ],
          };
        }

        const filterClauses = [];
        if (category) {
          filterClauses.push({ equals: { path: "category", value: category } });
        }
        if (tagList.length > 0) {
          for (const t of tagList) {
            filterClauses.push({ equals: { path: "tags", value: t } });
          }
        }
        if (filterClauses.length > 0) {
          compoundClauses.filter = filterClauses;
        }

        pipeline.push({
          $search: {
            index: "posts_search_index",
            compound: compoundClauses,
          },
        });
      }

      // Étape 2 : $lookup users pour récupérer profil et statut de l'auteur
      pipeline.push(
        {
          $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "authorDoc",
          },
        },
        { $unwind: "$authorDoc" }
      );

      // Étape 3 : $match de sécurité et de filtrage exact combiné
      const matchStage = {
        status: "published",
        visibility: { $in: ["public", "followers", "subscribers"] },
        "authorDoc.status": { $ne: "suspended" },
      };

      // Si Atlas Search n'a pas été utilisé mais qu'une recherche textuelle est demandée (repli regex)
      if (!useAtlasSearch && textQuery) {
        const escaped = textQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (mode === "suggest") {
          // En mode suggestion : préfixe de mot insensible à la casse sur title
          matchStage.title = { $regex: `\\b${escaped}`, $options: "i" };
        } else {
          matchStage.$or = [
            { title: { $regex: escaped, $options: "i" } },
            { shortDescription: { $regex: escaped, $options: "i" } },
          ];
        }
      }

      if (category) {
        matchStage.category = category;
      }

      // Règle « tous les tags demandés » : intersection stricte $all
      if (tagList.length > 0) {
        matchStage.tags = { $all: tagList };
      }

      pipeline.push({ $match: matchStage });

      // Étape 4 : Calcul des likes si tri likes_desc (après le match de sécurité)
      if (sortCriteria === "likes_desc") {
        pipeline.push(
          {
            $lookup: {
              from: "likes",
              localField: "_id",
              foreignField: "postId",
              as: "postLikes",
            },
          },
          {
            $addFields: {
              likesCount: { $size: "$postLikes" },
            },
          },
          {
            $project: {
              postLikes: 0,
            },
          }
        );
      }

      // Étape 5 : Détermination du tri déterministe dans $facet.docs
      let sortStage;
      if (sortCriteria === "likes_desc") {
        sortStage = { $sort: { likesCount: -1, publishedAt: -1, _id: -1 } };
      } else if (sortCriteria === "date_asc") {
        sortStage = { $sort: { publishedAt: 1, createdAt: 1, _id: 1 } };
      } else if (sortCriteria === "relevance" && useAtlasSearch && textQuery) {
        sortStage = { $sort: { score: { $meta: "searchScore" }, publishedAt: -1, _id: -1 } };
      } else {
        // date_desc par défaut (et repli pertinence regex)
        sortStage = { $sort: { publishedAt: -1, createdAt: -1, _id: -1 } };
      }

      // Étape 6 : $facet pour total exact et pagination simultanée après tri
      pipeline.push({
        $facet: {
          totalDocs: [{ $count: "count" }],
          docs: [
            sortStage,
            { $skip: offset },
            { $limit: limit },
          ],
        },
      });

      return pipeline;
    };

    // 6. Exécution avec tolérance d'environnement (Atlas Search si disponible, repli si test unitaire local)
    let facetResult;
    if (textQuery) {
      try {
        facetResult = await Post.aggregate(buildPipeline(true));
      } catch (searchErr) {
        // En environnement MongoMemoryServer ou si Atlas Search n'est pas configuré localement
        facetResult = await Post.aggregate(buildPipeline(false));
      }
    } else {
      // Aucune recherche textuelle : étape $search omise, pipeline B-tree direct
      facetResult = await Post.aggregate(buildPipeline(false));
    }

    const totalDocs = facetResult[0]?.totalDocs[0]?.count || 0;
    const posts = facetResult[0]?.docs || [];
    const totalPages = Math.ceil(totalDocs / limit) || 1;

    // 7. Calcul dynamique et parallèle des likes et commentaires via collections dédiées
    const postIds = posts.map((p) => p._id);
    const [likeCounts, commentCounts] = await Promise.all([
      Like.aggregate([
        { $match: { postId: { $in: postIds } } },
        { $group: { _id: "$postId", count: { $sum: 1 } } },
      ]),
      Comment.aggregate([
        { $match: { postId: { $in: postIds } } },
        { $group: { _id: "$postId", count: { $sum: 1 } } },
      ]),
    ]);
    const likesMap = new Map(likeCounts.map((l) => [String(l._id), l.count]));
    const commentsMap = new Map(commentCounts.map((c) => [String(c._id), c.count]));

    // 8. Résolution parallèle des relations de l'utilisateur connecté (follows et abonnements actifs)
    let followingSet = new Set();
    let subSet = new Set();
    if (req.user) {
      const creatorIds = posts.map((p) => p.authorDoc?._id || p.author?._id || p.author);
      const [userFollows, userSubs] = await Promise.all([
        Follow.find({
          followerId: req.user._id,
          creatorId: { $in: creatorIds },
        }).select("creatorId"),
        Subscription.find({
          subscriberId: req.user._id,
          creatorId: { $in: creatorIds },
          active: true,
          expiresAt: { $gt: new Date() },
        }).select("creatorId"),
      ]);
      followingSet = new Set(userFollows.map((f) => String(f.creatorId)));
      subSet = new Set(userSubs.map((s) => String(s.creatorId)));
    }

    // 9. Projection stricte PostPreview (aucune fuite de content, storedName ou secrets)
    const docs = posts.map((post) => {
      const authorIdStr = String(post.authorDoc?._id || post.author?._id || post.author);
      const isAuthor = Boolean(req.user && String(req.user._id) === authorIdStr);

      let isLocked = true;
      if (post.visibility === "public" || isAuthor) {
        isLocked = false;
      } else if (post.visibility === "followers") {
        isLocked = !followingSet.has(authorIdStr);
      } else if (post.visibility === "subscribers") {
        isLocked = !subSet.has(authorIdStr);
      }

      // Attribuer l'auteur pour toPostPreview avec son avatar sécurisé
      post.author = {
        _id: post.authorDoc?._id || post.author?._id || post.author,
        name: post.authorDoc?.name || post.author?.name || "Auteur inconnu",
        avatar: post.authorDoc?.avatar || post.author?.avatar,
      };

      return toPostPreview(post, {
        isLocked,
        likesCount: likesMap.get(String(post._id)) || 0,
        commentsCount: commentsMap.get(String(post._id)) || 0,
        authorName: post.author.name,
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

    const commentCounts = await Comment.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]);
    const commentsMap = new Map(commentCounts.map((c) => [String(c._id), c.count]));

    const docs = posts.map((p) =>
      toPostAuthorManagement(p, {
        likesCount: likesMap.get(String(p._id)) || 0,
        commentsCount: commentsMap.get(String(p._id)) || 0,
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
        commentsCount: 0,
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

    const commentsCount = await Comment.countDocuments({ postId: post._id });

    res.json(
      toPostDetail(post, {
        likesCount,
        commentsCount,
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
    const post = await Post.findById(req.params.id).populate("author", "name status avatar");
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

    const [likesCount, commentsCount] = await Promise.all([
      Like.countDocuments({ postId: post._id }),
      Comment.countDocuments({ postId: post._id }),
    ]);

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
        commentsCount,
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
    const post = await Post.findById(req.params.id).populate("author", "name status avatar");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const shareToken = req.headers["x-share-token"];
    const access = await canAccessPost(post, req.user, { shareToken });
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message });
    }

    const [likesCount, commentsCount] = await Promise.all([
      Like.countDocuments({ postId: post._id }),
      Comment.countDocuments({ postId: post._id }),
    ]);

    let userInteractions = {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    };

    if (req.user) {
      const authorId = post.author?._id || post.author;
      const [isLiked, isFollowing, sub] = await Promise.all([
        Like.exists({ postId: post._id, userId: req.user._id }),
        Follow.exists({
          followerId: req.user._id,
          creatorId: authorId,
        }),
        Subscription.findOne({
          subscriberId: req.user._id,
          creatorId: authorId,
          active: true,
          expiresAt: { $gt: new Date() },
        }),
      ]);

      userInteractions = {
        isLiked: Boolean(isLiked),
        isFollowingAuthor: Boolean(isFollowing),
        isSubscribedToAuthor: Boolean(sub),
        subscriptionExpiresAt: sub?.expiresAt ? new Date(sub.expiresAt).toISOString() : null,
      };
    }

    res.json(
      toPostDetail(post, {
        likesCount,
        commentsCount,
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
 * GET /api/posts/:id/comments
 * Consultation des commentaires d'un post.
 * - Utilise optionalAuthMakerShare.
 * - Respecte la matrice d'accès du post via canAccessPost (visiteur avec X-Share-Token autorisé sur post link).
 * - Renvoie la liste chronologique des commentaires au format DTO.
 */
postsRouter.get("/:id/comments", optionalAuthMakerShare, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const post = await Post.findById(req.params.id).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const shareToken = req.headers["x-share-token"] || req.query.token || null;
    const access = await canAccessPost(post, req.user, { shareToken });
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || "Accès non autorisé" });
    }

    const comments = await Comment.find({ postId: post._id })
      .populate("author.id", "name avatar")
      .sort({ createdAt: 1 });
    const commentsDto = comments.map((c) => {
      const authorDoc = c.author.id && typeof c.author.id === "object" ? c.author.id : null;
      const authorIdStr = authorDoc ? String(authorDoc._id || authorDoc.id) : String(c.author.id);
      const hasAvatar = Boolean(authorDoc?.avatar?.storedName);
      return {
        id: c._id.toString(),
        postId: c.postId.toString(),
        author: {
          id: authorIdStr,
          name: c.author.name,
          hasAvatar,
          avatarUrl: hasAvatar ? `/api/users/${authorIdStr}/avatar` : null,
        },
        text: c.text,
        createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
      };
    });

    return res.status(200).json(commentsDto);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts/:id/comments
 * Ajout d'un commentaire sur un post.
 * - Authentification obligatoire (authMakerShare).
 * - Refuse les comptes suspendus (403, géré par authMakerShare).
 * - Refuse l'écriture sur les posts archivés (400 Bad Request).
 * - Vérifie l'accès au post (un utilisateur connecté avec X-Share-Token peut commenter un post link).
 * - Valide le texte (1 à 1000 caractères, non vide).
 */
postsRouter.post("/:id/comments", authMakerShare, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    const post = await Post.findById(req.params.id).populate("author", "name status");
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    // Interdiction stricte de commenter un post archivé
    if (post.status === "archived") {
      return res.status(400).json({ message: "Impossible de commenter un post archivé" });
    }

    const shareToken = req.headers["x-share-token"] || req.query.token || null;
    const access = await canAccessPost(post, req.user, { shareToken });
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message || "Accès non autorisé" });
    }

    const rawText = req.body?.text;
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({ message: "Le texte du commentaire est requis" });
    }

    const trimmedText = rawText.trim();
    if (trimmedText.length > 1000) {
      return res.status(400).json({ message: "Le commentaire ne peut pas dépasser 1000 caractères" });
    }

    const newComment = await Comment.create({
      postId: post._id,
      author: {
        id: req.user._id,
        name: req.user.name,
      },
      text: trimmedText,
    });

    const hasAvatar = Boolean(req.user.avatar?.storedName);
    const authorIdStr = newComment.author.id.toString();

    return res.status(201).json({
      id: newComment._id.toString(),
      postId: newComment.postId.toString(),
      author: {
        id: authorIdStr,
        name: newComment.author.name,
        hasAvatar,
        avatarUrl: hasAvatar ? `/api/users/${authorIdStr}/avatar` : null,
      },
      text: newComment.text,
      createdAt: newComment.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/posts/:id/comments/:cid
 * Suppression d'un commentaire.
 * - Authentification obligatoire (authMakerShare).
 * - Autorisé pour l'auteur du commentaire ou un administrateur (role === 'admin').
 * - Ne donne à l'administrateur aucun accès implicite au contenu ou aux fichiers privés du post.
 */
postsRouter.delete("/:id/comments/:cid", authMakerShare, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.cid)) {
      return res.status(404).json({ message: "Commentaire introuvable" });
    }

    const comment = await Comment.findOne({
      _id: req.params.cid,
      postId: req.params.id,
    });

    if (!comment) {
      return res.status(404).json({ message: "Commentaire introuvable" });
    }

    const isCommentAuthor = String(comment.author.id) === String(req.user._id);
    const isAdmin = req.user.role === "admin";

    if (!isCommentAuthor && !isAdmin) {
      return res.status(403).json({ message: "Suppression non autorisée" });
    }

    await Comment.deleteOne({ _id: comment._id });

    return res.status(200).json({ success: true, message: "Commentaire supprimé" });
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
    const commentsCount = await Comment.countDocuments({ postId: post._id });

    res.json(
      toPostAuthorManagement(post, {
        likesCount,
        commentsCount,
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
    const commentsCount = await Comment.countDocuments({ postId: post._id });

    res.json(
      toPostAuthorManagement(post, {
        likesCount,
        commentsCount,
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
    const commentsCount = await Comment.countDocuments({ postId: post._id });

    res.json(
      toPostAuthorManagement(post, {
        likesCount,
        commentsCount,
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
 * PUT /api/posts/:id/cover
 * Choix et retrait explicites de la pièce jointe servant de couverture.
 * Réservé à l'auteur du post actif (refus strict 400 si archivé, 403 si tiers).
 * Garantie atomique de l'unicité de la couverture sous requêtes concurrentes.
 */
postsRouter.put("/:id/cover", authMakerShare, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Identifiant de post invalide" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post introuvable" });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de ce post" });
    }

    if (post.status === "archived") {
      return res.status(400).json({
        message: "Impossible de modifier la couverture d'un post archivé",
      });
    }

    const { attachmentId } = req.body || {};

    let updatedPost;

    if (attachmentId) {
      if (!mongoose.Types.ObjectId.isValid(attachmentId)) {
        return res.status(400).json({ message: "Identifiant de pièce jointe invalide" });
      }

      const targetObjId = new mongoose.Types.ObjectId(attachmentId);
      const targetAtt = (post.attachments || []).find(
        (a) => String(a._id) === String(targetObjId)
      );

      if (!targetAtt) {
        return res.status(400).json({
          message: "La pièce jointe spécifiée n'existe pas sur ce post",
        });
      }

      if (targetAtt.family !== "image") {
        return res.status(400).json({
          message: "Seule une pièce jointe de type image peut être choisie comme couverture",
        });
      }

      // Mise à jour conditionnelle atomique garantissant l'unicité stricte de isCover: true
      // Utilisation de filtres disjoints (other vs target) pour éviter l'erreur ConflictingUpdateOperators
      updatedPost = await Post.findOneAndUpdate(
        {
          _id: post._id,
          author: req.user._id,
          status: { $ne: "archived" },
          "attachments._id": targetObjId,
          "attachments.family": "image",
        },
        {
          $set: {
            "attachments.$[other].isCover": false,
            "attachments.$[target].isCover": true,
          },
        },
        {
          arrayFilters: [
            { "other._id": { $ne: targetObjId } },
            { "target._id": targetObjId },
          ],
          returnDocument: "after",
          runValidators: true,
        }
      );
    } else {
      // Retrait explicite de la couverture : toutes les pièces jointes passent à isCover: false
      updatedPost = await Post.findOneAndUpdate(
        {
          _id: post._id,
          author: req.user._id,
          status: { $ne: "archived" },
        },
        {
          $set: {
            "attachments.$[all].isCover": false,
          },
        },
        {
          arrayFilters: [{ "all._id": { $exists: true } }],
          returnDocument: "after",
          runValidators: true,
        }
      );
    }

    if (!updatedPost) {
      return res.status(400).json({
        message: "Impossible de mettre à jour la couverture du post",
      });
    }

    const likesCount = await Like.countDocuments({ postId: updatedPost._id });
    const commentsCount = await Comment.countDocuments({ postId: updatedPost._id });
    return res.status(200).json(toPostAuthorManagement(updatedPost, { likesCount, commentsCount }));
  } catch (err) {
    next(err);
  }
});

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
