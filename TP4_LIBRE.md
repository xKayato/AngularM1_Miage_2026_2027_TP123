# TP4 libre — MakerShare

## 1. Objectif

Transformer progressivement l'application Guitar Practice Cloud en
MakerShare, une plateforme de partage de créations et tutoriels DIY :
Lego, papercraft, origami, musique, modèles 3D, etc.

Le projet conserve la stack existante :
- Angular 22 (Standalone, Signals, Control Flow, inject()) dans le frontend ;
- Node.js 24 / Express 5 dans le backend ;
- Mongoose 9 et MongoDB Atlas ;
- Stockage des fichiers sur disque (`data/uploads/attachments/`), avec métadonnées dans MongoDB.

Le code existant est réutilisé lorsque cela est pertinent, mais les
anciennes pistes audio ne sont **pas converties automatiquement** en posts.
Créer une nouvelle collection MongoDB `posts`. Ne supprimer ni anciennes
collections ni anciens fichiers sans décision explicite. Les routes historiques
`/api/tracks*` restent intactes pour garantir une stricte non-régression.

---

## 2. Méthode de Travail et Découpage par Missions

Avant toute implémentation :
1. Auditer le dépôt réel et ses versions effectives.
2. Établir et valider le contrat d'API définitif (`API_CONTRACT.md`).
3. Identifier le code réutilisable : authentification, profils, pagination,
   upload, lecture audio, tests et administration.
4. Valider les choix d'architecture avec les encadrants.
5. Implémenter une mission à la fois avec tests et démonstration.

* **Mission 0 — Finalisation du Contrat MakerShare et Matrices d'Accès**
* **Mission 1A — Modèles de Données, Index Ordinaires et Projections DTO (sans routes MakerShare ni pages Angular)**
* **Mission 1B — Services Frontend MakerShare et Typage Strict**
* **Mission 2 — Brouillons, Catégories, Tags et Cycle de Publication**
* **Mission 3 — Gestion des Pièces Jointes, Validation MIME/Magic Bytes et Nettoyage**
* **Mission 4 — Contrôles d'Accès, Visibilités et Partage par Lien Secret**
* **Mission 5 — Follows et Abonnements Simulés (30j, Unicité et Concurrence Atomique)**
* **Mission 6 — Likes Uniques et Compteur Cohérent**
* **Mission 7 — Recherche Serveur Atlas Search, Tolérance aux Fautes et Tags**
* **Mission 8 — Administration et Modération (Archivage et Suspension)**
* **Mission 9 — Tests Automatisés, Build, Documentation et Démonstration**

---

## 3. Périmètre V1 et Quotas Fixés

### Inclus et Décisions Validées
- **Limites de fichiers :**
  - Audio : **25 Mo** maximum (MP3, WAV, OGG, M4A).
  - Images : **5 Mo** maximum (JPEG, PNG, WebP) validées par signature binaire (*magic bytes*).
  - Documents PDF : **10 Mo** maximum validés par entête binaire `%PDF`.
  - Quotas par post : **10 pièces jointes maximum** et **50 Mo cumulés** au total par post.
- **Profils de créateurs :** Affichage public des informations du créateur et de ses créations.
- **Posts DIY :** Titre, description courte publique, texte complet du tutoriel (`content`),
  catégorie, tags (normalisés) et pièces jointes.
- **Création en brouillon (`draft`) ; publication explicite (`published`).**
- **Quatre visibilités :**
  - `public` : Tout le monde (visiteurs et connectés).
  - `link` : Non répertorié, accessible initialement via une URL secrète de partage (`/share/:token`).
  - `followers` : Aperçu découvrable ; contenu complet réservé aux followers connectés.
  - `subscribers` : Aperçu découvrable ; contenu complet réservé aux abonnés actifs (30 jours).
- **Aperçu des posts verrouillés :** L'image de couverture est **masquée** (placeholder neutre / cadenas) dans l'aperçu public pour les visibilités `followers` et `subscribers` si l'utilisateur n'a pas accès.
- **Follow unilatéral :** Gratuit, unique par paire follower-créateur (`followerId !== creatorId`).
- **Abonnement simulé :** 30 jours par créateur, sans carte bancaire. **Pas de prolongation** si un abonnement est déjà actif (`409 Conflict`). Unicité en base et stratégie atomique.
- **Likes :** Collection dédiée avec index unique (1 like max par utilisateur et par post accessible). Interdiction d'auto-like. Compteur dynamique sans dénormalisation initiale.
- **Lien de partage :** Valable **7 jours**, secret de 32 octets généré à la volée, hash SHA-256 en base, révocable et régénérable par l'auteur. Le secret figure dans l'URL initiale de navigation mais **jamais dans l'URL des fichiers**.
- **Recherche serveur :** Atlas Search Lucene avec tolérance aux fautes simples (`fuzzy: { maxEdits: 1 }`), tags normalisés (règle intersection `tags=all`), et pagination serveur.
- **Modération / Administration :**
  - Archivage / restauration des posts par un administrateur.
  - Suspension / réactivation des utilisateurs. Les posts d'un utilisateur suspendu sont **inaccessibles et masqués** du catalogue pour tous les tiers jusqu'à sa réactivation.
  - Les administrateurs **n'ont pas d'accès implicite** aux fichiers privés des créateurs.
- **Résilience des uploads :** Nettoyage synchrone immédiat sur erreur (Multer, BDD, I/O) et réconciliation asynchrone des orphelins.
- **Tests frontend et backend** des règles métier et de la matrice d'accès.

### Hors périmètre V1
- Paiement réel ou saisie de carte bancaire.
- Commentaires et messagerie privée.
- Espaces collaboratifs multi-auteurs.
- Prévisualisation 3D WebGL in-browser.
- Migration automatique des anciennes pistes audio du TP2.

---

## 4. Vocabulaire et Règles Métier Détaillées

### Post
Un post appartient à un seul auteur. Il possède :
- `title` : Titre du projet.
- `shortDescription` : Description courte publique (utilisée dans l'aperçu et indexée pour la recherche).
- `content` : Texte libre complet du tutoriel (réservé aux lecteurs autorisés).
- `category` : Catégorie principale (Lego, Papercraft, Origami, Musique, Modèles 3D, Autre).
- `tags` : 1 à 10 tags normalisés (minuscules, sans accents, sans espaces, regex `^[a-z0-9\-]+$`).
- `attachments` : Tableau de 0 à 10 pièces jointes (cumul $\le 50$ Mo).
- `status` : `'draft' | 'published' | 'archived'`.
- `visibility` : `'public' | 'link' | 'followers' | 'subscribers'`.

### Règles d'Aperçu vs Détail
- **`PostPreview` (Aperçu) :**
  - Exposé dans le catalogue public et la recherche.
  - Comprend : titre, description courte, catégorie, tags, auteur, nombre de likes, nombre de pièces jointes, indicateur audio, date de publication, et `isLocked: boolean`.
  - **Exclut strictement :** le champ `content`, les noms de fichiers internes (`storedName`) et les liens directs de téléchargement.
  - **Cover :** `null` (placeholder neutre) si le post est sous visibilité `followers` ou `subscribers` et que le visiteur n'a pas accès au détail.
- **`PostDetail` (Détail) :**
  - Délivré uniquement après validation de l'autorisation d'accès.
  - Contient le `content` intégral et la liste des pièces jointes avec leurs endpoints sécurisés de téléchargement.
  - **Pas d'aperçu dans une erreur 401 ou 403 :** Les réponses d'erreur HTTP restent homogènes (`{ "message": "..." }`). Pour afficher l'aperçu d'un post verrouillé accédé par URL directe, le frontend utilise l'endpoint dédié `GET /api/posts/:id/preview`.

### Follow
- Unilatéral et gratuit.
- Un utilisateur ne peut pas se suivre lui-même.
- Donne accès au contenu complet des posts publiés avec visibilité `followers`. Ne donne pas accès au niveau `subscribers`.

### Abonnement Simulé (30 jours) et Concurrence Atomique
- Active un droit d'accès aux posts `subscribers` de ce créateur précis pendant 30 jours à compter de l'activation (`expiresAt = Date.now() + 30j`).
- L'interface affiche obligatoirement la mention « Simulation ».
- **Contrainte d'unicité en base :** Index composé unique `{ subscriberId: 1, creatorId: 1 }` sur la collection `subscriptions`.
- **Prévention atomique du double abonnement :** Au-delà d'un simple contrôle préalable `findOne`, la création capture l'erreur MongoDB `11000 DuplicateKey` ou s'exécute via une opération conditionnelle atomique. Si un abonnement actif existe déjà (`expiresAt > Date.now()`), toute nouvelle tentative d'abonnement est rejetée par une erreur **`409 Conflict`** (`"Abonnement déjà actif jusqu'au DD/MM/AAAA"`).

### Likes
- Table/Collection dédiée `likes` avec index unique `{ userId: 1, postId: 1 }`.
- Interdiction de liker son propre post (`400 Bad Request`).
- Pour liker un post, l'utilisateur doit avoir un droit d'accès complet au post.
- Le compteur `likesCount` affiché est calculé dynamiquement pour garantir une parfaite cohérence sans dénormalisation fragile.

### Lien de Lecture (`link`)
- Post non répertorié (absent du catalogue public et de la recherche).
- Permet la lecture complète par quiconque détient le secret, sans compte ni JWT requis.
- Durée de validité : **7 jours**.
- Le secret brut (32 octets hexadécimaux) figure dans l'URL initiale de partage (`/share/:token`) reçue par le visiteur.
- La base ne stocke que le hash cryptographique SHA-256 (`tokenHash`).
- L'auteur peut révoquer le lien à tout moment (`DELETE /api/posts/:id/share-link`), ce qui le rend immédiatement caduc (`410 Gone`).

---

## 5. Matrice d'Accès par Route et Opération

| Route | Méthode | Visiteur anonyme | Connecté standard | Follower auteur | Abonné auteur (30j) | Auteur du post | Administrateur |
|---|---|---|---|---|---|---|---|
| `/api/posts` | `GET` | 200 (Aperçus publics et verrouillés `isLocked: true`) | 200 (Aperçus avec statut d'accès) | 200 (Aperçus déverrouillés si follower) | 200 (Aperçus déverrouillés si abonné) | 200 (Ses aperçus publics) | 200 (Mêmes aperçus que public) |
| `/api/posts/my` | `GET` | 401 Unauthorized | 200 (Ses propres posts) | 200 (Ses propres posts) | 200 (Ses propres posts) | 200 (Ses propres posts) | 200 (Ses propres posts) |
| `/api/posts/:id` (`public`) | `GET` | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail |
| `/api/posts/:id` (`draft`) | `GET` | 404 Not Found | 404 Not Found | 404 Not Found | 404 Not Found | 200 PostDetail | 404 Not Found |
| `/api/posts/:id` (`followers`) | `GET` | 401 Unauthorized | 403 Forbidden | 200 PostDetail | 403 Forbidden | 200 PostDetail | 403 Forbidden |
| `/api/posts/:id` (`subscribers`) | `GET` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 200 PostDetail | 200 PostDetail | 403 Forbidden |
| `/api/posts/:id` (`link`) | `GET` | 404 Not Found | 404 Not Found | 404 Not Found | 404 Not Found | 200 PostDetail | 404 Not Found |
| `/api/posts/:id` (`archived`) | `GET` | 410 Gone | 410 Gone | 410 Gone | 410 Gone | 410 Gone | 200 PostDetail (modération) |
| `/api/posts/:id/preview` | `GET` | 200 PostPreview | 200 PostPreview | 200 PostPreview | 200 PostPreview | 200 PostPreview | 200 PostPreview |
| `/api/posts/shared/:token` | `GET` | 200 PostDetail (si token valide) | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail | 200 PostDetail (si token valide) |
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
| `/api/creators/:id/follow` | `POST`/`DELETE` | 401 Unauthorized | 200 (si non-auteur) | 200 | 200 | 400 (auto-follow interdit) | 200 |
| `/api/creators/:id/subscribe` | `POST` | 401 Unauthorized | 201 (30j) ou 409 si actif | 201 (30j) ou 409 si actif | 409 Conflict (déjà actif) | 400 (auto-sub interdit) | 201 ou 409 |
| `/api/creators/:id/status` | `GET` | 401 Unauthorized | 200 Status | 200 Status | 200 Status | 200 Status | 200 Status |
| `/api/posts/:id/like` | `POST`/`DELETE` | 401 Unauthorized | 200 (si accès acquis) | 200 | 200 | 400 (auto-like interdit) | 200 (si accès acquis) |
| `/api/admin/posts/:id/archive` | `PATCH` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 403 Forbidden | **200 PostAuthorManagement** (modération) |
| `/api/admin/users/:id/suspend` | `PATCH` | 401 Unauthorized | 403 Forbidden | 403 Forbidden | 403 Forbidden | 403 Forbidden | **200 User** (modération) |

### Clarification sur les Privilèges Administrateur
- **Modération légitime :** L'administrateur peut archiver un post ou suspendre un utilisateur. Il peut consulter le contenu textuel et les métadonnées d'un post archivé pour instruire une modération.
- **Absence d'accès implicite aux fichiers privés :** L'administrateur **ne bénéficie d'aucun passe-droit** pour télécharger ou lire les pièces jointes privées (`followers`, `subscribers`, `link`). S'il tente d'y accéder sans être follower, abonné ou détenteur du lien secret, le serveur répond **`403 Forbidden`**.

---

## 6. Circuit Sécurisé des Pièces Jointes et Partage par Lien

### A. Parcours `/share/:token` et Absence de Secret dans les URLs de Fichiers
1. L'auteur génère le lien via `POST /api/posts/:id/share-link` $\rightarrow$ reçoit l'URL complète avec le secret brut.
2. Le visiteur ouvre l'URL `http://localhost:4200/share/<secret>`.
3. Le composant Angular appelle `GET /api/posts/shared/<secret>` :
   - Le backend calcule le SHA-256 de `<secret>`, vérifie l'absence de révocation et la date d'expiration.
   - S'il est valide, renvoie `200 OK` avec le `PostDetail`.
   - Dans ce `PostDetail`, les pièces jointes reçoivent des URLs propres : `/api/posts/:postId/attachments/:attachmentId` **sans aucun secret dans l'URL**.
4. **Conservation en mémoire et rafraîchissement (F5) :**
   - Le frontend conserve le `<secret>` en mémoire (Signal).
   - En cas de rafraîchissement (F5), Angular le réextrait directement depuis le paramètre de route `/share/:token`.
5. **Téléchargement et Lecture :**
   - L'appel `HttpClient` vers `/api/posts/:id/attachments/:attachmentId` envoie le secret via l'en-tête HTTP :
     `X-Share-Token: <secret>`.
   - Le contrôleur Express valide l'en-tête contre le hash du lien.
   - Le secret n'apparaît **dans aucun log d'accès de fichier ni historique du navigateur**.
   - La lecture audio dans le navigateur utilise `URL.createObjectURL(blob)` avec révocation obligatoire. Il s'agit d'un téléchargement tamponné en mémoire sous forme de Blob et non d'un streaming de bout en bout.

### B. Gestion des Pannes, Nettoyage et Concurrence des Pièces Jointes
- **Contrôle atomique des quotas en concurrence (Exigence Mission 3) :**
  L'ajout de pièces jointes ne peut pas se reposer uniquement sur la validation d'un tableau Mongoose en mémoire. Face à des requêtes concurrentes d'upload, le contrôleur devra utiliser une mise à jour atomique conditionnelle (ex. `findOneAndUpdate` avec vérification de `$size` et cumul d'octets) ou un verrouillage optimiste avec `__v` pour interdire tout dépassement des 10 fichiers ou 50 Mo cumulés.
- **Erreurs de validation (MIME, Magic Bytes, limites) :**
  Nettoyage immédiat sur disque de l'ensemble des fichiers du lot via `fsPromises.unlink()`, aucun enregistrement en base, et retour `400 Bad Request`.
- **Erreurs base de données lors de la sauvegarde :**
  Le bloc `catch` du contrôleur supprime immédiatement les fichiers qui venaient d'être écrits sur le disque avant d'émettre l'erreur `500`.
- **Réconciliation asynchrone (Non implémentée à ce stade) :**
  Aucun script de cron ou tâche d'arrière-plan n'est actuellement opérationnel. Il s'agit d'une recommandation d'exploitation pour purger d'éventuels fichiers orphelins dans `backend/data/uploads/attachments/` qui ne correspondraient plus à aucun `attachments.storedName` en base.

---

## 7. Recherche Serveur et Pipeline d'Agrégation

> ⚠️ **Note :** Aucun index Atlas Search n'est encore installé ni créé à ce stade (réservé à la Mission 7).

### A. Pipeline d'Agrégation
1. **Étape 1 (`$search` si recherche textuelle) :**
   - Index Atlas Search `posts_search_index`.
   - Recherche sur `title` et `shortDescription` avec tolérance aux fautes `fuzzy: { maxEdits: 1, prefixLength: 1 }`.
2. **Étape 2 (`$lookup` avec `users`) :**
   - Jointure avec la collection `users` pour récupérer le profil et le statut de l'auteur :
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
3. **Étape 3 (`$match` de sécurité et de filtrage) :**
   - `status: "published"`.
   - `visibility: { $in: ["public", "followers", "subscribers"] }`.
   - **Filtrage des auteurs suspendus :** `authorDoc.status: { $ne: "suspended" }`.
   - Filtrage exact catégorie : si spécifiée, `{ category: requestedCategory }`.
   - Filtrage exact tags : si spécifiés, `{ tags: { $all: requestedTags } }` (intersection stricte).
4. **Étape 4 (`$facet` pour total exact et pagination) :**
   - `totalDocs`: `[{ $count: "count" }]`.
   - `docs`: tri, `$skip`, `$limit`, et projection stricte `PostPreview`.

### B. Mappings Validés pour Atlas Search (`posts_search_index`)
* Les mappings pour les filtres d'égalité exacte (`category`, `tags`) ont été validés en Mission 7 : ils utilisent le type `token` supporté par MongoDB Atlas pour l'opérateur `equals` (le type `string` avec analyzer `lucene.keyword` n'est pas compatible avec l'opérateur `equals` sur les chaînes de caractères dans Atlas Search) :
```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "title": {
        "type": "string",
        "analyzer": "lucene.french"
      },
      "shortDescription": {
        "type": "string",
        "analyzer": "lucene.french"
      },
      "category": {
        "type": "token"
      },
      "tags": {
        "type": "token"
      }
    }
  }
}
```

---

## 8. Authentification, Rôles et Comptes Suspendus

### Distinction Stricte 401 vs 403
* **`401 Unauthorized` sans JWT :** Route protégée appelée sans en-tête `Authorization`. Pas de déconnexion dans l'intercepteur Angular.
* **`401 Unauthorized` avec JWT expiré ou invalide :** Bearer token corrompu ou expiré. **Déconnexion automatique légitime** (nettoyage session et redirection vers `/login`).
* **`403 Forbidden` avec JWT valide :** Token valide, mais droits insuffisants (non-follower, non-abonné, non-admin, ou compte suspendu). **L'intercepteur NE DÉCONNECTE PAS l'utilisateur** ; il propage l'erreur pour affichage d'un message adapté dans l'interface.

### Vérification en Base et Gestion des Comptes Suspendus
- **À la connexion (`POST /api/auth/login`) :** Si `status === "suspended"`, rejet immédiat `403 Forbidden` `{ "message": "Compte suspendu" }` sans délivrance de token JWT.
- **Avec un JWT déjà émis :** Les middlewares `auth` et `optionalAuth` interrogent la base de données. Si `status === "suspended"`, rejet immédiat `403 Forbidden` `{ "message": "Compte suspendu" }`.
- **Rétrocompatibilité des anciens comptes :** Les comptes existants sans champs `role` ou `status` sont systématiquement interprétés avec `role: "user"` et `status: "active"`, que ce soit via Mongoose, les requêtes `.lean()` ou les pipelines d'agrégation (`$ifNull`).
