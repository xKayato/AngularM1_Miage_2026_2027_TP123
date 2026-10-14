# Contrat HTTP MakerShare (TP4)

Base de l'API : `/api`.

---

## 1. Principes Généraux et Sécurité

* **Authentification (`auth`) :** En-tête `Authorization: Bearer <token>`. Le backend valide la signature JWT et vérifie impérativement en base de données (`User.findById(req.auth.sub)`) que le compte existe et n'est pas suspendu (`status: "active"`).
* **Authentification optionnelle (`optionalAuth`) :**
  * Si l'en-tête `Authorization` est absent : la requête est traitée en mode anonyme (`req.auth = null`).
  * Si un en-tête `Authorization` est fourni mais ne commence pas par `Bearer ` ou que le token est expiré / invalide / falsifié : **rejet immédiat `401 Unauthorized`** `{ "message": "Jeton invalide ou expiré" }` (aucun basculement silencieux vers l'anonymat).
  * Si le token est valide mais que le compte est suspendu en base : **rejet immédiat `403 Forbidden`** `{ "message": "Compte suspendu" }`.
* **Distinction stricte 401 vs 403 côté frontend :**
  * `401 Unauthorized` (sans token) : invitation à se connecter sans altération d'état.
  * `401 Unauthorized` (token invalide/expiré) : déconnexion automatique propre via l'intercepteur Angular (nettoyage session et redirection `/login`).
  * `403 Forbidden` (token valide mais privilèges insuffisants ou compte suspendu) : **l'intercepteur NE déconnecte PAS l'utilisateur** ; il propage l'erreur pour afficher un retour visuel clair.
* **Comptes suspendus (`status: "suspended"`) :**
  * **Connexion (`POST /api/auth/login`) :** Si les identifiants sont corrects mais que le compte est suspendu, l'accès est rejeté par `403 Forbidden` `{ "message": "Compte suspendu" }` ; **aucun jeton JWT n'est délivré**.
  * **Utilisation d'un JWT déjà émis :** Rejet immédiat par `403 Forbidden` `{ "message": "Compte suspendu" }` lors de la vérification de l'utilisateur en base.
  * **Catalogue & Posts :** Tous les posts créés par un auteur suspendu sont **masqués** pour tous les tiers (`404 Not Found`).
* **Comptes historiques (rétrocompatibilité TP1, TP2, TP3) :**
  * Tout compte créé sans champ `role` ou `status` est traité avec `role: "user"` et `status: "active"`.
  * Supporté au niveau du schéma Mongoose (valeurs par défaut), dans les requêtes directes `.lean()` (valeurs de repli `role || 'user'`, `status || 'active'`) et dans les pipelines d'agrégation MongoDB (`$ifNull: ["$status", "active"]`, `$ifNull: ["$role", "user"]`).
* **Partage par lien secret et circuit des fichiers :**
  * **URL initiale de partage :** Le secret (token aléatoire de 32 octets hexadécimaux) **figure dans l'URL initiale de navigation** (`http://localhost:4200/share/:token`) et est transmis à la route `GET /api/posts/shared/:token`.
  * **Téléchargement sécurisé des pièces jointes :** Pour éviter d'exposer le secret dans les URLs des fichiers, les historiques de requêtes statiques ou les en-têtes `Referer`, les URLs de pièces jointes restent `/api/posts/:id/attachments/:attachmentId` et l'authentification s'effectue via l'en-tête HTTP spécifique : `X-Share-Token: <token>`.
  * **Lecture audio dans le navigateur :** La lecture via `Blob` et `URL.createObjectURL(blob)` (avec révocation systématique) constitue un téléchargement complet mis en mémoire tampon dans un objet Blob, et **non un streaming de bout en bout** (absence de flux fragmenté HLS / HTTP Range chunking continu).

---

## 2. DTOs et Formats de Données

### A. `PostPreview` (Aperçu catalogue & recherche)
> ⚠️ **Sécurité :** Le texte intégral (`content`), les noms internes de stockage (`storedName`) et les liens directs de fichiers sont **strictement omis** du pipeline d'agrégation.
```typescript
interface PostPreview {
  id: string;
  author: {
    id: string;
    name: string;
  };
  title: string;
  shortDescription: string;
  category: string;
  tags: string[];
  visibility: 'public' | 'followers' | 'subscribers';
  likesCount: number;
  attachmentsCount: number;
  hasAudio: boolean;
  coverUrl: string | null; // URL si public ET cover présente ; null (placeholder neutre) si post verrouillé
  publishedAt: string;
  isLocked: boolean;       // true si l'utilisateur courant ne dispose pas de l'accès au détail complet
}
```

### B. `PostDetail` (Lecture complète autorisée)
```typescript
interface PostDetail {
  id: string;
  author: {
    id: string;
    name: string;
  };
  title: string;
  shortDescription: string;
  content: string;         // Texte intégral du tutoriel
  category: string;
  tags: string[];
  visibility: 'public' | 'link' | 'followers' | 'subscribers';
  status: 'published' | 'draft' | 'archived';
  likesCount: number;
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    family: 'image' | 'audio' | 'pdf';
    downloadUrl: string;   // /api/posts/:id/attachments/:attachmentId
  }>;
  userInteractions: {
    isLiked: boolean;
    isFollowingAuthor: boolean;
    isSubscribedToAuthor: boolean;
    subscriptionExpiresAt: string | null;
  };
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### C. `PostAuthorManagement` (Espace de gestion auteur)
```typescript
interface PostAuthorManagement extends PostDetail {
  shareLinkInfo?: {
    hasLink: boolean;
    status: 'none' | 'active' | 'expired' | 'revoked';
    expiresAt: string | null;
    createdAt: string | null;
    // Le secret brut n'est JAMAIS renvoyé ici (seul le hash SHA-256 est conservé en base)
  };
}
```

### D. `FollowItem` & `SubscriptionItem` (Espace Personnel & Dashboard)
```typescript
interface FollowItem {
  id: string;
  creator: {
    id: string;
    name: string;
  };
  createdAt: string;
}

interface SubscriptionItem {
  id: string;
  creator: {
    id: string;
    name: string;
  };
  active: boolean;
  expiresAt: string;
  createdAt: string;
}
```

---

## 3. Matrice d'Accès par Route et par Opération

| Route | Méthode | Visiteur anonyme | Connecté standard | Follower auteur | Abonné auteur (30j) | Auteur du post | Administrateur |
|---|---|---|---|---|---|---|---|
| `/api/posts` | `GET` | 200 (Aperçus publics et verrouillés `isLocked: true`) | 200 (Aperçus avec statut d'accès) | 200 (Aperçus déverrouillés si follower) | 200 (Aperçus déverrouillés si abonné) | 200 (Ses aperçus publics) | 200 (Mêmes aperçus que public) |
| `/api/posts/my` | `GET` | 401 Unauthorized | 200 (Ses propres posts) | 200 (Ses propres posts) | 200 (Ses propres posts) | 200 (Ses propres posts) | 200 (Ses propres posts) |
| `/api/posts/:id` (`public`) | `GET` | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail |
| `/api/posts/:id` (`draft`) | `GET` | 404 Not Found | 404 Not Found | 404 Not Found | 404 Not Found | 200 PostDetail | 404 Not Found |
| `/api/posts/:id` (`followers`) | `GET` | 401 Unauthorized | 403 Forbidden | 200 PostDetail | 403 Forbidden | 200 PostDetail | 403 Forbidden (sans passe-droit) |
| `/api/posts/:id` (`subscribers`) | `GET` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 200 PostDetail | 200 PostDetail | 403 Forbidden (sans passe-droit) |
| `/api/posts/:id` (`link`) | `GET` | 404 Not Found | 404 Not Found | 404 Not Found | 404 Not Found | 200 PostDetail | 404 Not Found |
| `/api/posts/:id` (`archived`) | `GET` | 410 Gone | 410 Gone | 410 Gone | 410 Gone | 410 Gone (vue archive) | 200 PostDetail (vue modération) |
| `/api/posts/:id/preview` | `GET` | 200 PostPreview | 200 PostPreview | 200 PostPreview | 200 PostPreview | 200 PostPreview | 200 PostPreview |
| `/api/posts/shared/:token` | `GET` | 200 PostDetail (si token valide) ou 410 | 200 PostDetail ou 410 | 200 PostDetail ou 410 | 200 PostDetail ou 410 | 200 PostDetail | 200 PostDetail (si token valide) |
| `/api/posts/:id/attachments/:attId` (`public`) | `GET` | 200 Flux binaire | 200 Flux binaire | 200 Flux binaire | 200 Flux binaire | 200 Flux binaire | 200 Flux binaire |
| `/api/posts/:id/attachments/:attId` (`followers`) | `GET` | 401 Unauthorized | 403 Forbidden | 200 Flux binaire | 403 Forbidden | 200 Flux binaire | **403 Forbidden** (pas d'accès implicite) |
| `/api/posts/:id/attachments/:attId` (`subscribers`) | `GET` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 200 Flux binaire | 200 Flux binaire | **403 Forbidden** (pas d'accès implicite) |
| `/api/posts/:id/attachments/:attId` (`link`) | `GET` | 200 (si header `X-Share-Token` valide) sinon 403 | 200 (si header valide) sinon 403 | 200 (si header valide) sinon 403 | 200 (si header valide) sinon 403 | 200 Flux binaire | **403 Forbidden** (sans token secret) |
| `/api/posts` | `POST` | 401 Unauthorized | 201 PostAuthorManagement | 201 | 201 | 201 | 201 |
| `/api/posts/:id` | `PUT` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 PostAuthorManagement | 403 Forbidden |
| `/api/posts/:id/publish` | `POST` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 PostAuthorManagement | 403 Forbidden |
| `/api/posts/:id/unpublish` | `POST` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 PostAuthorManagement | 403 Forbidden |
| `/api/posts/:id/attachments` | `POST` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 201 AttachmentInfo[] | 403 Forbidden |
| `/api/posts/:id/attachments/:attId` | `DELETE` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 204 No Content | 403 Forbidden |
| `/api/posts/:id/share-link` | `POST` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 201 (secret 7j) | 403 Forbidden |
| `/api/posts/:id/share-link` | `GET` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 (état sans secret) | 403 Forbidden |
| `/api/posts/:id/share-link` | `DELETE` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 204 No Content | 403 Forbidden |
| `/api/creators/my/follows` | `GET` | 401 Unauthorized | 200 Page<FollowItem> | 200 Page<FollowItem> | 200 Page<FollowItem> | 200 Page<FollowItem> | 200 Page<FollowItem> |
| `/api/creators/my/subscriptions` | `GET` | 401 Unauthorized | 200 Page<SubscriptionItem> | 200 Page<SubscriptionItem> | 200 Page<SubscriptionItem> | 200 Page<SubscriptionItem> | 200 Page<SubscriptionItem> |
| `/api/creators/:id/follow` | `POST`/`DELETE` | 401 Unauthorized | 200 (si non-auteur) | 200 (toggle/unfollow) | 200 | 400 (auto-follow interdit) | 200 (si non-auteur) |
| `/api/creators/:id/subscribe` | `POST` | 401 Unauthorized | 201 (30j) ou 409 si actif | 201 (30j) ou 409 si actif | 409 Conflict (déjà actif) | 400 (auto-sub interdit) | 201 ou 409 |
| `/api/creators/:id/status` | `GET` | 401 Unauthorized | 200 Status | 200 Status | 200 Status | 200 Status | 200 Status |
| `/api/posts/:id/like` | `POST`/`DELETE` | 401 Unauthorized | 200 (si accès acquis) | 200 | 200 | 400 (auto-like interdit) | 200 (si accès acquis) |
| `/api/admin/posts/:id/archive` | `PATCH` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 403 Forbidden | **200 PostAuthorManagement** (modération) |
| `/api/admin/users/:id/suspend` | `PATCH` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 403 Forbidden | **200 User** (modération) |

### Précision sur les Droits de l'Administrateur
1. **Modération administrative :** L'administrateur peut archiver un post signalé (`PATCH /api/admin/posts/:id/archive`) et suspendre un compte enfreignant les règles (`PATCH /api/admin/users/:id/suspend`). Il peut lire le texte et les métadonnées d'un post archivé pour instruire une modération.
2. **Pas d'accès implicite aux pièces jointes privées :** L'administrateur **n'a pas** de privilège magique pour télécharger ou écouter les pièces jointes privées (`followers`, `subscribers`, `link`) des créateurs. Ses requêtes d'accès aux fichiers privés sont soumises aux mêmes règles de vérification de relation que tout autre utilisateur (`403 Forbidden` s'il n'est ni follower, ni abonné actif, ni détenteur du token de partage).

---

## 4. Stratégie Atomique d'Abonnement et Prévention de Concurrence

* **Contrainte d'unicité en base :**
  La collection `subscriptions` comporte un **index composé unique** obligatoire :
  `{ subscriberId: 1, creatorId: 1 }` avec `{ unique: true }`.
* **Stratégie atomique contre les activations concurrentes :**
  Un simple contrôle préalable (`Subscription.findOne()`) suivi d'une création (`Subscription.create()`) est vulnérable aux race conditions (requêtes simultanées déclenchées par un double clic ou des requêtes réseau concurrentes).
  * L'activation utilise soit une création protégée par capture de l'erreur MongoDB `11000 DuplicateKey` :
    ```javascript
    try {
      const sub = await Subscription.create({ subscriberId, creatorId, expiresAt });
      return res.status(201).json({ subscribed: true, expiresAt: sub.expiresAt });
    } catch (err) {
      if (err.code === 11000) {
        const existing = await Subscription.findOne({ subscriberId, creatorId });
        if (existing && existing.expiresAt > new Date()) {
          return res.status(409).json({
            message: `Abonnement déjà actif jusqu'au ${existing.expiresAt.toLocaleDateString("fr-FR")}`
          });
        }
      }
      throw err;
    }
    ```
  * Soit un `findOneAndUpdate` atomique avec condition sur expiration dépassée (`expiresAt: { $lt: new Date() }`).
  * En cas de présence d'un abonnement actif, le backend garantit un retour **`409 Conflict`** sans duplication en base.

---

## 5. Pipeline d'Agrégation pour le Catalogue et la Recherche

### Paramètres de Requête (`GET /api/posts`) :
* `page` (optionnel) : Entier $\ge 1$, défaut : `1`. Rejet `400 Bad Request` si non entier ou $< 1$.
* `limit` (optionnel) : Entier compris entre `1` et `20`, défaut : `10`. Rejet `400 Bad Request` si non entier, $< 1$ ou $> 20$ (`{ "message": "Le paramètre limit doit être un entier compris entre 1 et 20." }`).
* `category` (optionnel) : Catégorie valide parmi la liste autorisée (`Lego`, `Papercraft`, `Origami`, `Musique`, `Modèles 3D`, `Autre`) ou `Toutes`. Rejet `400 Bad Request` si inconnue.
* `tags` (optionnel) : Tag unique ou liste de tags séparés par des virgules. Règle `$all` (tous les tags demandés). Rejet `400 Bad Request` si non conformes au format `^[a-z0-9-]+$`.
* `query` (optionnel) : Texte libre de recherche, maximum 150 caractères. Rejet `400 Bad Request` si $> 150$ caractères.

### Ordre Séquentiel du Pipeline :
1. **Étape 1 — Recherche textuelle éventuelle :**
   * Si `query` fournie : étape `$search` (sur l'index `posts_search_index`).
   * Si catalogue sans recherche textuelle : étape ignorée.
2. **Étape 2 — Jointure avec les utilisateurs (`$lookup`) :**
   Jointure immédiate avec la collection `users` pour accéder à l'état de l'auteur :
   ```json
   {
     "$lookup": {
       "from": "users",
       "localField": "author",
       "foreignField": "_id",
       "as": "authorDoc"
     }
   },
   { "$unwind": "$authorDoc" }
   ```
3. **Étape 3 — Filtrage strict (`$match`) AVANT comptage et pagination :**
   * Statut du post : `status: "published"`.
   * Visibilité découvrable : `visibility: { "$in": ["public", "followers", "subscribers"] }` (exclusion des brouillons et des liens secrets non répertoriés).
   * **Auteur non suspendu :** `authorDoc.status: { "$ne": "suspended" }` (avec gestion des anciens comptes sans statut via valeur par défaut active).
   * **Filtre catégorie exact :** si paramètre fourni, `{ category: categoryFilter }`.
   * **Filtre tags exact :** si paramètre fourni, `{ tags: { "$all": tagsArray } }` (intersection stricte de tous les tags requis).
4. **Étape 4 — Facette de pagination (`$facet`) :**
   Calcul en une seule opération du total et des éléments paginés :
   ```json
   {
     "$facet": {
       "totalDocs": [{ "$count": "count" }],
       "docs": [
         { "$sort": { "publishedAt": -1, "_id": -1 } },
         { "$skip": (page - 1) * limit },
         { "$limit": limit },
         {
           "$project": {
             "_id": 0,
             "id": { "$toString": "$_id" },
             "author": {
               "id": { "$toString": "$authorDoc._id" },
               "name": "$authorDoc.name"
             },
             "title": 1,
             "shortDescription": 1,
             "category": 1,
             "tags": 1,
             "visibility": 1,
             "publishedAt": 1,
             "attachmentsCount": { "$size": { "$ifNull": ["$attachments", []] } },
             "hasAudio": {
               "$gt": [
                 {
                   "$size": {
                     "$filter": {
                       "input": { "$ifNull": ["$attachments", []] },
                       "as": "att",
                       "cond": { "$eq": ["$$att.family", "audio"] }
                     }
                   }
                 },
                 0
               ]
             }
           }
         }
       ]
     }
   }
   ```

### Mappings validés pour Atlas Search (`posts_search_index`) :
* **Définition dans le projet :**
  * `category` : indexé en type `token` pour l'égalité exacte avec l'opérateur `equals` (le type `string` avec analyzer `lucene.keyword` n'est pas compatible avec `equals`).
  * `tags` : indexé en type `token` pour le filtrage exact des éléments du tableau avec l'opérateur `equals`.
  * `title` & `shortDescription` : indexés en `type: "string", analyzer: "lucene.french"` avec tolérance aux fautes (`fuzzy: { maxEdits: 1, prefixLength: 1 }`).
* **État de vérification et environnements :**
  * **Sur le cluster réel MongoDB Atlas :** L'index `posts_search_index` a été créé et vérifié lors de la Mission 7, validant le pipeline `$search` complet.
  * **En environnement de test local (`npm test`) :** Les tests s'exécutent sur `mongodb-memory-server` (dépourvu du démon Lucene Atlas Search) ; le backend intègre un repli synchrone automatique par expressions régulières (`$regex`) garantissant l'exécution 100% isolée et déterministe des tests sans altération ni dépendance du cluster Atlas.

---

## 6. Exigences Concurrence — Pièces Jointes (Exigence Mission 3)

* **Contrôle atomique des quotas de pièces jointes :**
  L'ajout de pièces jointes ne peut pas reposer uniquement sur la validation Mongoose en mémoire d'une instance de document (`attachments.length <= 10`). Si deux requêtes d'upload concurrentes s'exécutent simultanément pour un même post, un simple contrôle de tableau en mémoire provoquerait un dépassement silencieux des quotas (par exemple 2 x 6 fichiers ajoutés en parallèle $\rightarrow$ 12 fichiers).
  * **Exigence Mission 3 :** L'enregistrement des pièces jointes en base devra s'effectuer via une opération conditionnelle atomique (ex. `findOneAndUpdate` avec vérification de la taille restante admissible `$expr: { $lte: [{ $size: "$attachments" }, 10 - newCount] }` et contrôle du cumul d'octets) ou via verrouillage optimiste avec gestion de version (`__v`), rejetant avec `400 Bad Request` toute requête franchissant la limite.

---

## 7. Rétrocompatibilité — Routes Historiques Guitar Practice Cloud (TP1, TP2, TP3)

Ces routes sont préservées intactes pour la non-régression et les tests existants :

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/api/health` | - | `{ "status": "ok" }` |
| POST | `/api/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/api/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/api/users/me` | JWT | `200 User` |
| PUT | `/api/users/me` | `{name}` + JWT | `200 User` |
| GET | `/api/tracks` | JWT | `Page<Track>` (filtres `page`, `limit`, `title`) |
| POST | `/api/tracks` | multipart : `audio`, `title`, `cover` (optionnel) | `201 Track` |
| GET | `/api/tracks/:id/audio` | JWT | flux audio |
| GET | `/api/tracks/:id/cover` | JWT | flux binaire cover |
| PUT | `/api/tracks/:id/cover` | multipart : `cover` + JWT | `200 Track` |
| DELETE | `/api/tracks/:id/cover` | JWT | `204 No Content` |
| DELETE | `/api/tracks/:id` | JWT | `204 No Content` (sans orphelin) |
