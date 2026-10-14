import mongoose from "mongoose";

const MAX_ATTACHMENTS_PER_POST = 10;
const MAX_CUMULATIVE_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo

const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true },
    // storedName n'est jamais sélectionné par défaut pour éviter toute fuite du chemin serveur
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 1 },
    family: {
      type: String,
      required: true,
      enum: ["image", "audio", "pdf"],
    },
    isCover: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false },
);

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    shortDescription: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 300,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["Lego", "Papercraft", "Origami", "Musique", "Modèles 3D", "Autre"],
    },
    tags: {
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
      validate: [
        {
          validator: (val) => Array.isArray(val) && val.length >= 1 && val.length <= 10,
          message: "Un post doit contenir entre 1 et 10 tags",
        },
      ],
      default: undefined,
    },
    attachments: {
      type: [attachmentSchema],
      validate: [
        {
          validator: (arr) => arr.length <= MAX_ATTACHMENTS_PER_POST,
          message: `Un post ne peut pas contenir plus de ${MAX_ATTACHMENTS_PER_POST} pièces jointes`,
        },
        {
          validator: (arr) =>
            arr.reduce((sum, item) => sum + (item.size || 0), 0) <=
            MAX_CUMULATIVE_SIZE_BYTES,
          message: "Le cumul des pièces jointes ne peut pas dépasser 50 Mo",
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["public", "link", "followers", "subscribers"],
      default: "public",
      index: true,
    },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    archiveReason: { type: String, default: null },
    // Marqueur technique optionnel pour les jeux de données de test/démonstration
    seedBatch: { type: String, default: null, index: true },
  },
  { timestamps: true },
);

// Index ordinaires pour le filtrage et le tri sans dépendance à Atlas Search
postSchema.index({ status: 1, visibility: 1, publishedAt: -1 });
postSchema.index({ author: 1, status: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ category: 1 });

export const Post = mongoose.model("Post", postSchema);
