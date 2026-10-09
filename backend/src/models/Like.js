import mongoose from "mongoose";

const likeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Contrainte d'unicité absolue : un utilisateur ne peut liker un post qu'une seule fois
likeSchema.index({ userId: 1, postId: 1 }, { unique: true });

export const Like = mongoose.model("Like", likeSchema);
