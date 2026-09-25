import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";
import { detectRealImageMime } from "./utils/imageValidator.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");
const UPLOADS_COVERS = path.resolve("data/uploads/covers");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ces
  // dossiers avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(UPLOADS_COVERS, { recursive: true });
  console.log(`[startup] Dossiers des uploads prêts : ${UPLOADS} et ${UPLOADS_COVERS}`);
} catch (error) {
  console.error("[startup] Impossible de créer les dossiers des uploads", error);
  throw error;
}

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// La taille maximale d'une couverture est de 2 Mo.
const MAX_COVER_SIZE = 2 * 1024 * 1024;

// Les formats d'image autorisés pour les couvertures
const ALLOWED_COVER_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
const allowed = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
    // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
    // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, file, callback) => {
    if (file.fieldname === "cover") {
      console.debug(`[multer] Destination sélectionnée pour cover : ${UPLOADS_COVERS}`);
      callback(null, UPLOADS_COVERS);
    } else {
      console.debug(`[multer] Destination sélectionnée pour audio : ${UPLOADS}`);
      callback(null, UPLOADS);
    }
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname === "audio") {
      if (allowed.has(file.mimetype)) {
        console.log(`[multer] Type audio accepté : ${file.mimetype}`);
        return callback(null, true);
      }
      const error = new Error("Format audio non accepté");
      console.error(`[multer] Type audio refusé : ${file.mimetype}`, error);
      return callback(error);
    }
    if (file.fieldname === "cover") {
      if (ALLOWED_COVER_MIMES.has(file.mimetype)) {
        console.log(`[multer] Type cover accepté : ${file.mimetype}`);
        return callback(null, true);
      }
      const error = new Error("Format image non accepté");
      console.error(`[multer] Type cover refusé : ${file.mimetype}`, error);
      return callback(error);
    }
    callback(null, true);
  },
});

const uploadCover = multer({
  storage,
  limits: { fileSize: MAX_COVER_SIZE },
  fileFilter: (_request, file, callback) => {
    if (ALLOWED_COVER_MIMES.has(file.mimetype)) {
      console.log(`[multer] Type cover accepté : ${file.mimetype}`);
      return callback(null, true);
    }
    const error = new Error("Format image non accepté");
    console.error(`[multer] Type cover refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { new: true, runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /** Retourne une page des pistes appartenant exclusivement à l'utilisateur via mongoose-aggregate-paginate-v2. */
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));

      const ownerObjectId = mongoose.Types.ObjectId.isValid(req.auth.sub)
        ? new mongoose.Types.ObjectId(req.auth.sub)
        : req.auth.sub;

      const matchStage = { ownerId: ownerObjectId };

      const rawTitle = req.query.title ?? req.query.query;
      const titleQuery = typeof rawTitle === "string" ? rawTitle.trim() : "";
      if (titleQuery) {
        const escaped = titleQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        matchStage.title = { $regex: escaped, $options: "i" };
      }

      console.log(`[tracks] Lecture aggregate page=${page}, limit=${limit}, user=${req.auth.sub}${titleQuery ? `, title="${titleQuery}"` : ""}`);

      const aggregate = Track.aggregate([
        { $match: matchStage },
        {
          $addFields: {
            id: { $toString: "$_id" },
            ownerId: { $toString: "$ownerId" },
            hasCover: {
              $cond: [{ $ifNull: ["$cover.storedName", false] }, true, false],
            },
            coverUrl: {
              $cond: [
                { $ifNull: ["$cover.storedName", false] },
                { $concat: ["/api/tracks/", { $toString: "$_id" }, "/cover"] },
                null,
              ],
            },
          },
        },
        { $project: { _id: 0, storedName: 0, "cover.storedName": 0, __v: 0 } },
      ]);

      const options = {
        page,
        limit,
        sort: { createdAt: -1, _id: -1 },
        customLabels: {
          docs: "items",
          totalDocs: "total",
          totalPages: "pages",
        },
      };

      const result = await Track.aggregatePaginate(aggregate, options);

      console.log(`[tracks] ${result.items.length} piste(s) envoyée(s) sur ${result.total}`);

      res.json(result);
    } catch (error) {
      console.error("[tracks] Erreur de pagination", error);
      next(error);
    }
  });

  /**
   * Reçoit le champ multipart audio, le champ texte title et le champ optionnel cover.
   * Valide le type MIME réel (magic numbers) de la couverture et sa taille maximale (2 Mo).
   */
  app.post(
    "/api/tracks",
    auth,
    upload.fields([
      { name: "audio", maxCount: 1 },
      { name: "cover", maxCount: 1 },
    ]),
    async (req, res, next) => {
      const audioFile = req.files?.["audio"]?.[0] || (req.file?.fieldname === "audio" ? req.file : null);
      const coverFile = req.files?.["cover"]?.[0];

      try {
        if (!audioFile) {
          if (coverFile) {
            try { await fsPromises.unlink(coverFile.path); } catch {}
          }
          console.warn(`[tracks] Upload sans fichier audio par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        let coverData = undefined;
        if (coverFile) {
          if (coverFile.size > MAX_COVER_SIZE) {
            try { await fsPromises.unlink(audioFile.path); } catch {}
            try { await fsPromises.unlink(coverFile.path); } catch {}
            return res.status(400).json({ message: "L'image de couverture ne doit pas dépasser 2 Mo" });
          }

          const realMime = await detectRealImageMime(coverFile.path);
          if (!realMime) {
            try { await fsPromises.unlink(audioFile.path); } catch {}
            try { await fsPromises.unlink(coverFile.path); } catch {}
            return res.status(400).json({ message: "Contenu de l'image invalide (JPEG, PNG, WebP uniquement)" });
          }

          coverData = {
            storedName: coverFile.filename,
            originalName: coverFile.originalname,
            mimeType: realMime,
            size: coverFile.size,
          };
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: req.body.title || audioFile.originalname,
          originalName: audioFile.originalname,
          storedName: audioFile.filename,
          mimeType: audioFile.mimetype,
          size: audioFile.size,
          cover: coverData,
        });

        console.log(`[tracks] Upload enregistré : ${track.id}${coverData ? " (avec cover)" : ""}`);
        res.status(201).json(track.toPublic());
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);

        if (audioFile) {
          try {
            await fsPromises.unlink(path.join(UPLOADS, audioFile.filename));
          } catch (cleanupError) {
            console.error(`[tracks] Impossible de supprimer le fichier audio temporaire`, cleanupError);
          }
        }
        if (coverFile) {
          try {
            await fsPromises.unlink(path.join(UPLOADS_COVERS, coverFile.filename));
          } catch (cleanupError) {
            console.error(`[tracks] Impossible de supprimer l'image temporaire`, cleanupError);
          }
        }
        next(error);
      }
    },
  );

  /** Envoie le flux binaire de l'image de couverture si la piste appartient à l'utilisateur. */
  app.get("/api/tracks/:id/cover", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+cover.storedName");

      if (!track) {
        return res.status(404).json({ message: "Piste inconnue" });
      }

      if (!track.cover?.storedName) {
        return res.status(404).json({ message: "Aucune couverture pour cette piste" });
      }

      const coverPath = path.join(UPLOADS_COVERS, track.cover.storedName);
      res.type(track.cover.mimeType);
      res.sendFile(coverPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur envoi cover ${track.id}`, error);
          if (!res.headersSent) next(error);
        }
      });
    } catch (error) {
      console.error("[tracks] Erreur de lecture cover", error);
      next(error);
    }
  });

  /** Ajoute ou remplace la couverture d'une piste existante en supprimant l'ancien fichier sur disque. */
  app.put(
    "/api/tracks/:id/cover",
    auth,
    uploadCover.single("cover"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Fichier image requis" });
        }

        if (req.file.size > MAX_COVER_SIZE) {
          try { await fsPromises.unlink(req.file.path); } catch {}
          return res.status(400).json({ message: "L'image de couverture ne doit pas dépasser 2 Mo" });
        }

        const realMime = await detectRealImageMime(req.file.path);
        if (!realMime) {
          try { await fsPromises.unlink(req.file.path); } catch {}
          return res.status(400).json({ message: "Contenu de l'image invalide (JPEG, PNG, WebP uniquement)" });
        }

        const track = await Track.findOne({
          _id: req.params.id,
          ownerId: req.auth.sub,
        }).select("+cover.storedName");

        if (!track) {
          try { await fsPromises.unlink(req.file.path); } catch {}
          return res.status(404).json({ message: "Piste inconnue" });
        }

        const previousCover = track.cover?.storedName;

        track.cover = {
          storedName: req.file.filename,
          originalName: req.file.originalname,
          mimeType: realMime,
          size: req.file.size,
        };

        await track.save();

        if (previousCover) {
          try {
            await fsPromises.unlink(path.join(UPLOADS_COVERS, previousCover));
            console.log(`[cover] Ancienne couverture supprimée : ${previousCover}`);
          } catch (cleanupError) {
            console.error(`[cover] Impossible de supprimer l'ancienne couverture : ${previousCover}`, cleanupError);
          }
        }

        res.json(track.toPublic());
      } catch (error) {
        if (req.file) {
          try { await fsPromises.unlink(req.file.path); } catch {}
        }
        next(error);
      }
    },
  );

  /** Supprime la couverture d'une piste et son fichier physique sans laisser d'orphelin. */
  app.delete("/api/tracks/:id/cover", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+cover.storedName");

      if (!track) {
        return res.status(404).json({ message: "Piste inconnue" });
      }

      if (!track.cover?.storedName) {
        return res.status(404).json({ message: "Aucune couverture pour cette piste" });
      }

      const coverFileName = track.cover.storedName;
      track.cover = undefined;
      await track.save();

      try {
        await fsPromises.unlink(path.join(UPLOADS_COVERS, coverFileName));
        console.log(`[cover] Couverture supprimée sur disque : ${coverFileName}`);
      } catch (cleanupError) {
        console.error(`[cover] Erreur suppression couverture disque : ${coverFileName}`, cleanupError);
      }

      res.status(204).end();
    } catch (error) {
      console.error("[cover] Erreur suppression cover", error);
      next(error);
    }
  });

  /** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /** Supprime la métadonnée, le fichier audio ET le fichier de couverture associé (aucun orphelin). */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName +cover.storedName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
        console.log(`[tracks] Fichier supprimé : ${audioPath}`);
      } catch (error) {
        // L'exception n'est volontairement pas ignorée : l'administrateur doit
        // voir ce fichier orphelin si sa suppression échoue.
        console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
        return res.status(500).json({
          message: "Métadonnée supprimée, mais fichier audio non supprimé",
        });
      }

      // Nettoyage de la couverture sur disque si existante
      if (track.cover?.storedName) {
        const coverPath = path.join(UPLOADS_COVERS, track.cover.storedName);
        try {
          await fsPromises.unlink(coverPath);
          console.log(`[tracks] Fichier cover supprimé : ${coverPath}`);
        } catch (coverError) {
          console.error(`[tracks] Fichier cover non supprimé : ${coverPath}`, coverError);
        }
      }

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === "Format audio non accepté" ||
      error?.message === "Format image non accepté"
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
