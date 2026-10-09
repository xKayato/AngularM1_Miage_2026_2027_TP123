import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";

export const UPLOADS_ATTACHMENTS = path.resolve("data/uploads/attachments");

try {
  fs.mkdirSync(UPLOADS_ATTACHMENTS, { recursive: true });
} catch (err) {
  console.error("[startup] Impossible de créer le dossier des attachments", err);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_ATTACHMENTS);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = crypto.randomBytes(16).toString("hex") + ext;
    cb(null, randomName);
  },
});

// Limite Multer globale : 25 Mo max par fichier individuel, 10 fichiers max par lot
const multerInstance = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 Mo (limite maximale pour les fichiers audio)
    files: 10,
  },
});

/**
 * Middleware Multer enveloppé pour intercepter proprement les erreurs de transfert
 * (dépassement de quota Multer, champ invalide, etc.) et nettoyer immédiatement
 * les fichiers partiels écrits sur disque avant l'entrée dans le contrôleur.
 */
export function attachmentUploadMiddleware(req, res, next) {
  multerInstance.array("files", 10)(req, res, async (err) => {
    if (err) {
      // Nettoyage immédiat des éventuels fichiers déjà reçus lors de ce lot défaillant
      if (req.files && Array.isArray(req.files)) {
        await Promise.all(
          req.files.map((f) => fsPromises.unlink(f.path).catch(() => {}))
        );
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Un fichier dépasse la taille maximale autorisée (25 Mo).",
          });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            message: "Le nombre maximal de fichiers par envoi est de 10.",
          });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            message: "Champ de fichier inattendu. Le champ attendu est 'files'.",
          });
        }
        return res.status(400).json({
          message: `Erreur d'envoi multipart : ${err.message}`,
        });
      }

      return res.status(400).json({
        message: err.message || "Erreur lors de la réception des fichiers.",
      });
    }

    next();
  });
}
