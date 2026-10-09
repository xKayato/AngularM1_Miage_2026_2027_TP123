import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

/**
 * Middleware d'authentification optionnelle pour MakerShare.
 *
 * Règles contractuelles :
 * 1. Absence d'en-tête Authorization -> Appel anonyme légitime (req.user = null, req.auth = null, next()).
 * 2. Présence d'un en-tête Authorization mal formé ou avec un JWT invalide/expiré -> 401 Unauthorized direct.
 *    (Un Bearer invalide n'est JAMAIS rétrogradé silencieusement en appel anonyme).
 * 3. Utilisateur introuvable en base -> 401 Unauthorized.
 * 4. Utilisateur dont le compte est suspendu -> 403 Forbidden immédiat.
 *    (Le token ne permet aucun contournement de la sanction).
 */
export async function optionalAuthMakerShare(req, res, next) {
  const raw = req.headers.authorization;

  if (!raw) {
    req.user = null;
    req.auth = null;
    return next();
  }

  if (!raw.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentification invalide" });
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

    req.auth = payload;
    req.user = user;
    next();
  } catch (dbError) {
    next(dbError);
  }
}
