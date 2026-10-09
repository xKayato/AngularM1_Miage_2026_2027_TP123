import mongoose from "mongoose";
import crypto from "node:crypto";

const shareLinkSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    // Le secret brut n'est JAMAIS stocké en base : seul le condensat SHA-256 est persisté
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

/** Génère un secret cryptographiquement sûr de 32 octets (64 caractères hexadécimaux). */
shareLinkSchema.statics.generateRawToken = function () {
  return crypto.randomBytes(32).toString("hex");
};

/** Calcule le hash SHA-256 standard d'un token secret brut. */
shareLinkSchema.statics.hashToken = function (rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    throw new Error("Token brut invalide pour le hachage");
  }
  return crypto.createHash("sha256").update(rawToken).digest("hex");
};

/** Vérifie si le lien est actif (non révoqué et non expiré). */
shareLinkSchema.methods.isValid = function () {
  return (
    !this.revoked &&
    this.expiresAt &&
    new Date(this.expiresAt).getTime() > Date.now()
  );
};

export const ShareLink = mongoose.model("ShareLink", shareLinkSchema);
