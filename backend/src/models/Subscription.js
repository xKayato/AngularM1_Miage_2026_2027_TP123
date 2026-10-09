import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    subscriberId: {
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
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Contrainte d'unicité absolue : empêche deux abonnements concurrents ou multiples pour la même paire
subscriptionSchema.index({ subscriberId: 1, creatorId: 1 }, { unique: true });

// Validation d'interdiction d'auto-abonnement
subscriptionSchema.path("creatorId").validate({
  validator: function (value) {
    if (!this.subscriberId || !value) return true;
    return this.subscriberId.toString() !== value.toString();
  },
  message: "Un utilisateur ne peut pas s'abonner à lui-même",
});

subscriptionSchema.methods.isValid = function () {
  return this.active && this.expiresAt && new Date(this.expiresAt) > new Date();
};

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
