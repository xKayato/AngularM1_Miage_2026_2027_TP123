import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

/**
 * Middleware d'authentification strict pour MakerShare.
 * Vérifie :
 * 1. La présence du header Authorization: Bearer <token>
 * 2. La validité cryptographique et l'expiration du JWT
 * 3. L'existence réelle de l'utilisateur en base de données
 * 4. L'état non suspendu du compte (status: 'active' ou repli rétrocompatible)
 */
export async function authMakerShare(req, res, next) {
  const raw = req.headers.authorization;

  if (!raw?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentification requise" });
  }

  const tokenStr = raw.slice(7).trim();
  let payload;
  try {
    payload = jwt.verify(tokenStr, SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }

  try {
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "Utilisateur introuvable" });
    }

    const currentStatus = user.status || "active";
    if (currentStatus === "suspended") {
      return res.status(403).json({ message: "Compte suspendu" });
    }

    // Invalidation des JWT émis avant le dernier changement de mot de passe
    if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
      return res.status(401).json({ message: "Jeton révoqué suite à une modification du mot de passe" });
    }

    req.auth = payload;
    req.user = user;
    next();
  } catch (dbError) {
    next(dbError);
  }
}
