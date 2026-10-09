import mongoose from "mongoose";

const followSchema = new mongoose.Schema(
  {
    followerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Contrainte d'unicité absolue : un utilisateur ne peut suivre un créateur qu'une seule fois
followSchema.index({ followerId: 1, creatorId: 1 }, { unique: true });

// Validation d'interdiction d'auto-follow
followSchema.path("creatorId").validate({
  validator: function (value) {
    if (!this.followerId || !value) return true;
    return this.followerId.toString() !== value.toString();
  },
  message: "Un utilisateur ne peut pas se suivre lui-même",
});

export const Follow = mongoose.model("Follow", followSchema);
