import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/*
 * Un schéma Mongoose décrit la forme des documents MongoDB et leurs règles de
 * validation. `timestamps` ajoute automatiquement createdAt et updatedAt.
 */
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select:false empêche de renvoyer le hash par défaut dans les requêtes.
    passwordHash: { type: String, required: true, select: false },
    // Rôle applicatif (rétrocompatible avec les anciens comptes via default: "user")
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
    // Statut de modération (rétrocompatible avec les anciens comptes via default: "active")
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
    // Marqueur technique optionnel pour les jeux de données de test/démonstration
    seedBatch: {
      type: String,
      default: null,
      index: true,
    },
    // Biographie de profil (max 500 caractères)
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    // Centres d'intérêt et compétences du créateur
    profileTags: {
      type: [
        {
          type: String,
          trim: true,
          lowercase: true,
          match: [
            /^[a-z0-9-]+$/,
            "Format de tag invalide (minuscules, chiffres et tirets uniquement)",
          ],
        },
      ],
      default: [],
    },
    // Photo d'avatar de profil
    avatar: {
      storedName: { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType: { type: String, default: null },
      size: { type: Number, default: 0 },
    },
    // Horodatage du dernier changement de mot de passe (pour invalidation des JWT antérieurs)
    passwordChangedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

/**
 * Virtual property : `password` n'est pas stocké dans MongoDB.
 * Le setter conserve temporairement le mot de passe en mémoire pour que le
 * hook pre('validate') puisse le hacher avant la sauvegarde.
 */
schema.virtual("password").set(function (value) {
  this._plainPassword = value;
});

/**
 * Hook exécuté avant la validation d'un nouvel utilisateur.
 * bcrypt transforme le mot de passe en hash irréversible ; le mot de passe
 * original ne doit jamais être écrit dans la base ni dans les logs.
 */
schema.pre("validate", async function () {
  if (this.isNew && this._plainPassword) {
    console.debug(`[user-model] Hachage du mot de passe pour ${this.email}`);
    this.passwordHash = await bcrypt.hash(this._plainPassword, 10);
  }
});

/** Compare un mot de passe reçu avec le hash stocké. */
schema.methods.verifyPassword = function (value) {
  console.debug(`[user-model] Vérification du mot de passe pour ${this.email}`);
  return bcrypt.compare(value, this.passwordHash);
};

/** Retourne uniquement les champs qu'une réponse HTTP peut exposer. */
schema.methods.toPublic = function () {
  const hasAvatar = Boolean(this.avatar?.storedName);
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    role: this.role || "user",
    status: this.status || "active",
    bio: this.bio || "",
    profileTags: Array.isArray(this.profileTags) ? this.profileTags : [],
    hasAvatar,
    avatarUrl: hasAvatar ? `/api/users/${this.id}/avatar` : null,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model("User", schema);
