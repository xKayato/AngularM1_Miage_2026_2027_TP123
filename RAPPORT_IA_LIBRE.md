# Rapport d'usage de l'IA — TP4 Libre : MakerShare (M1 MIAGE)

**Étudiant :** Thomas DELOUP (travail individuel)  
**Assistant IA principal :** Antigravity (Gemini) intégré à l'IDE  
**Supervision méthodologique :** ChatGPT (revue du contrat d'API, de la matrice d'accès et des cas de concurrence)  
**Périmètre :** TP4 Libre — Transformation de *Guitar Practice Cloud* en plateforme communautaire de tutoriels créatifs **MakerShare** (Lego, Papercraft, Origami, Musique, Modèles 3D, Menuiserie).  
*(Le suivi des TP1 à TP3 est dans [`RAPPORT_IA_TP1_A_3.md`](RAPPORT_IA_TP1_A_3.md)).*

---

## Vue d'ensemble du projet MakerShare

MakerShare prolonge le socle de *Guitar Practice Cloud* tout en conservant 100 % des routes historiques `/api/tracks*` fonctionnelles. Le projet a été découpé en **8 missions de socle** (cadrage, modèles, brouillons, upload multipart sécurisé, matrice d'accès et liens secrets, follows/abonnements 30 jours, likes uniques, recherche Atlas Search, modération admin) suivies d'**évolutions fonctionnelles et d'optimisations** (annuaire des créateurs, profil étendu avec avatar et révocation JWT multi-sessions, éditeur Markdown avec insertion drag-and-drop et choix de couverture, commentaires et lecteur PDF intégré, dataset multimédia complet et optimisation des performances).

---

# Partie 1 — Socle fonctionnel et sécurité (Missions 0 à 8)

## Mission 0 — Cadrage, matrice d'accès et contrat d'API

- **Objectif :** Figer par écrit toutes les règles métier, les quotas de fichiers et la matrice des droits par route dans `API_CONTRACT.md` et `TP4_LIBRE.md` avant d'écrire la moindre ligne de code.
- **Prompt principal :**
  > « Finalise le contrat MakerShare sans coder : audio 25 Mo, image JPEG/PNG/WebP 5 Mo, PDF 10 Mo ; max 10 pièces jointes et 50 Mo cumulés par post ; lien secret valable 7 jours ; abonnement simulé de 30 jours sans prolongation s'il est déjà actif ; posts d'un auteur suspendu masqués aux tiers. Clarifie les droits des admins (modération oui, accès aux fichiers privés non), l'ordre du pipeline de recherche et la gestion de la concurrence. »
- **Décisions d'architecture retenues :**
  - **Quotas fichiers :** 10 fichiers max et 50 Mo cumulés par post (Image $\le$ 5 Mo, PDF $\le$ 10 Mo, Audio $\le$ 25 Mo).
  - **Matrice d'accès :** Un administrateur peut archiver un post ou suspendre un compte, mais n'a aucun passe-droit pour télécharger les pièces jointes privées d'un créateur (`followers`, `subscribers`, `link`).
  - **Comptes suspendus :** Rejet `403 Forbidden` dès le login ET sur les requêtes utilisant un JWT déjà émis avant la suspension.
- **Fichiers modifiés :** `API_CONTRACT.md`, `TP4_LIBRE.md`.
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi un simple `findOne` avant `create` ne suffit pas contre la concurrence :** Si deux requêtes arrivent en même temps, elles lisent toutes les deux l'état initial avant que la première n'ait écrit en base. Il faut un index unique MongoDB (`11000 DuplicateKey`) ou une écriture atomique conditionnelle (`findOneAndUpdate`).
  - **Pourquoi l'admin n'a pas accès aux fichiers privés :** Le rôle d'admin sert à modérer la plateforme, pas à contourner l'accès payant ou restreint défini par les créateurs sur leurs fichiers.

---

## Mission 1 (1A & 1B) — Modèles Mongoose, projections DTO et services Angular

- **Objectif :** Créer les modèles de données backend (`Post`, `Follow`, `Subscription`, `Like`, `ShareLink`), les fonctions de projection DTO (`toPostPreview`, `toPostDetail`, `toPostAuthorManagement`) et les services Angular typés (`PostService`, `CreatorService`).
- **Prompt principal :**
  > « Réalise d'abord les modèles Mongoose, index composés uniques et fonctions de projection DTO (1A), puis les interfaces TypeScript strictes sans `any` et les services Angular `PostService` et `CreatorService` avec leurs tests `HttpTestingController` (1B). Pour les pièces jointes partagées, passe `X-Share-Token` uniquement en header HTTP, jamais dans l'URL de téléchargement. »
- **Supervision et corrections effectuées :**
  - **Analyse des tests d'unicité :** Au départ, les tests unitaires vérifiaient uniquement la déclaration des index dans le schéma Mongoose (`schema.indexes()`). Pour tester le vrai rejet `E11000` par le moteur MongoDB sans toucher au cluster Atlas de dev, j'ai fait installer `mongodb-memory-server`.
  - **Diagnostic sur `auth.interceptor.ts` :** J'ai repéré que l'intercepteur du TP1 déconnectait l'utilisateur sur n'importe quelle erreur 401. Sur MakerShare, si un visiteur non connecté ouvre un post réservé aux abonnés, l'API renvoie 401 pour afficher l'aperçu verrouillé : il ne faut donc déclencher le logout que si la requête envoyait réellement un header `Authorization`.
- **Fichiers créés / modifiés :**
  - Backend : `models/User.js`, `models/Post.js`, `models/Follow.js`, `models/Subscription.js`, `models/Like.js`, `models/ShareLink.js`, `utils/postProjections.js`, `test/models.test.js`.
  - Frontend : `shared/models/post.model.ts`, `shared/models/creator.model.ts`, `shared/services/post.service.ts`, `shared/services/creator.service.ts` et leurs `.spec.ts`.
- **Preuves de fonctionnement :** 54 tests backend et 123 tests frontend passants, build OK.

---

## Mission 2 — Brouillons, catégories, tags et cycle de vie de publication

- **Objectif :** Permettre à un créateur de créer un post en brouillon (`draft`), le modifier, consulter ses posts paginés (`GET /api/posts/my`), le publier avec choix de visibilité (`public`, `followers`, `subscribers`, `link`) ou le repasser en brouillon (`unpublish`).
- **Prompt principal :**
  > « Implémente la gestion des brouillons et du cycle de vie côté backend et frontend (`PostsManagementPageComponent`). Normalise les tags en minuscules, refuse les doublons après normalisation et bloque toute injection de champs système (`author`, `status`, `role`). Interdis à l'auteur de modifier ou dépublier un post archivé par un admin. »
- **Supervision et choix techniques :**
  - **Validation stricte (`postValidator.js`) :** Tout tag est normalisé (`trim().toLowerCase()`) et validé par `/^[a-z0-9-]+$/`. Si l'utilisateur envoie `["Lego", "lego"]`, l'API renvoie `400 Bad Request` pour doublon après normalisation.
  - **Refus du faux fallback à 0 sur `likesCount` :** Pour éviter d'afficher `0 like` par oubli de calcul, `toPostPreview` et `toPostDetail` lèvent une erreur si `likesCount` n'est pas fourni par le contrôleur.
- **Fichiers créés / modifiés :**
  - Backend : `middlewares/authMakerShare.js`, `utils/postValidator.js`, `routes/posts.js`, `test/posts.test.js`.
  - Frontend : `components/posts-management-page/` (`.ts`, `.html`, `.css`, `.spec.ts`), `routes.ts`.
- **Preuves de fonctionnement :** 76 tests backend et 136 tests frontend passants.
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi filtrer les champs du body (`FORBIDDEN_CLIENT_FIELDS`) :** Si on passait directement `req.body` au modèle Mongoose, un client malveillant pourrait envoyer `"status": "published"` ou `"author": "<autre_id>"` pour usurper un compte ou contourner le workflow de publication.
  - **Pourquoi bloquer l'édition et le `unpublish` d'un post `archived` :** L'archivage est une sanction de modération. Si l'auteur pouvait repasser le post en brouillon puis le republier, il contournerait l'action de l'administrateur.

---

## Mission 3 — Pièces jointes, quotas et upload sécurisé sous concurrence

- **Objectif :** Gérer l'upload multipart (`POST /api/posts/:id/attachments`) jusqu'à 10 fichiers par post et 50 Mo cumulés, avec vérification des signatures binaires (*magic bytes*) et respect strict des quotas même en cas de requêtes concurrentes.
- **Prompt principal :**
  > « Ajoute l'upload multipart sur le champ `files`. Vérifie les magic bytes réels des fichiers (JPEG, PNG, WebP, PDF, MP3, WAV, OGG, M4A) et les tailles par famille. Garantis les quotas lors de deux uploads simultanés avec une mise à jour conditionnelle atomique MongoDB. Nettoie immédiatement les fichiers du lot courant en cas d'erreur sans toucher aux fichiers déjà présents sur le post. »
- **Implémentation et supervision :**
  - **Inspection des magic bytes (`attachmentValidator.js`) :** Lecture des 32 premiers octets sur disque (`FF D8 FF` pour JPEG, `89 50 4E 47` pour PNG, `RIFF....WEBP` pour WebP, `%PDF-` pour PDF, `ID3` ou frame sync `0xFFE0` pour MP3, `RIFF....WAVE` pour WAV, `OggS` pour OGG, `ftyp` pour M4A). Un exécutable renommé en `.jpg` est immédiatement rejeté et supprimé du disque.
  - **Atomicité du quota sous concurrence :** Au lieu de faire « lire le post $\rightarrow$ vérifier la taille en JS $\rightarrow$ `post.save()` » (qui échoue si deux requêtes arrivent en même temps), j'ai utilisé `Post.findOneAndUpdate` avec une condition `$expr` qui vérifie directement dans MongoDB que `$size(attachments) + lot <= 10` et `$reduce(size) + octetsLot <= 50 Mo`.
- **Fichiers créés / modifiés :**
  - Backend : `middlewares/attachmentUpload.js`, `utils/attachmentValidator.js`, `routes/posts.js`, `test/attachments.test.js`.
  - Frontend : modale et prévalidation des fichiers dans `posts-management-page.ts` et `.html`.
- **Preuves de fonctionnement :** 90 tests backend (dont un test `Promise.all` de deux uploads simultanés sur un post ayant déjà 8 fichiers : l'un passe en `201`, l'autre est rejeté en `400`, et le post finit avec exactement 10 fichiers) et 149 tests frontend passants.
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi ne jamais se fier à l'extension ni au `Content-Type` du client :** Ces deux valeurs sont envoyées par le navigateur ou l'outil HTTP (curl/Postman) et sont librement modifiables par l'utilisateur. Seuls les premiers octets binaires du fichier permettent d'identifier son vrai format.
  - **Pourquoi un middleware enveloppant Multer est nécessaire :** Multer écrit les fichiers sur disque au fil du flux réseau. Si le 3e fichier dépasse la taille limite, les 2 premiers sont déjà sur le disque : le callback d'erreur doit les supprimer (`fsPromises.unlink`) avant de répondre `400`.

---

## Mission 4 — Matrice d'accès aux lectures, visibilités et partage par lien secret

- **Objectif :** Contrôler la lecture des posts et le téléchargement des pièces jointes selon la visibilité (`public`, `followers`, `subscribers`, `link`), et permettre la génération/révocation de liens secrets valables 7 jours (`/share/:token`).
- **Prompt principal :**
  > « Centralise le contrôle d'accès dans `postAccessControl.js` pour le détail du post et ses pièces jointes. Implémente les liens de partage (`ShareLink` avec hash SHA-256 en base, transmission du secret via header `X-Share-Token` pour les fichiers, jamais dans l'URL des pièces jointes ni dans les logs). Côté Angular, crée les pages catalogue (`/posts`), détail (`/posts/:id`) avec bascule sur l'aperçu verrouillé en cas de 401/403, et partage (`/share/:token`). »
- **Points techniques clés :**
  - **Hashage SHA-256 des tokens de partage :** Le token brut (64 caractères hex) n'est renvoyé qu'une seule fois à l'auteur lors du `POST /api/posts/:id/share-link`. En base, seul `tokenHash` (SHA-256) est stocké.
  - **Masquage dans les logs et Referrer-Policy :** Dans `app.js`, le logger HTTP remplace `/api/posts/shared/<token>` par `[REDACTED_SHARE_TOKEN]`, et `index.html` inclut `<meta name="referrer" content="no-referrer">` pour éviter toute fuite du lien secret dans l'en-tête `Referer`.
  - **En-têtes de téléchargement (`Content-Disposition` RFC 5987) :** Gestion propre des noms de fichiers contenant des accents ou des caractères spéciaux, avec `X-Content-Type-Options: nosniff` et `Cache-Control: private, no-cache, no-store, must-revalidate`.
- **Fichiers créés / modifiés :**
  - Backend : `middlewares/optionalAuthMakerShare.js`, `utils/postAccessControl.js`, `routes/posts.js`, `test/access_control.test.js`.
  - Frontend : `components/posts-page/`, `components/post-detail-page/`, `components/shared-post-page/`, `interceptors/auth.interceptor.ts`.
- **Preuves de fonctionnement :** 114 tests backend et 167 tests frontend passants.
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi passer `X-Share-Token` en header plutôt qu'en query param `?token=...` sur les fichiers :** Les URLs (et leurs query params) sont enregistrées dans l'historique du navigateur, les logs de proxy et parfois les outils d'analyse. Passer le secret dans l'en-tête HTTP `X-Share-Token` via `HttpClient` évite d'exposer le jeton dans les URLs de téléchargement.

---

## Mission 5 — Follows et abonnements simulés (30 jours)

- **Objectif :** Permettre de suivre gratuitement un créateur (`follow` / `unfollow`) et de souscrire un abonnement simulé de 30 jours (`subscribe`), déverrouillant immédiatement les posts `followers` et `subscribers`.
- **Prompt principal :**
  > « Implémente les routes `/api/creators/:id/follow`, `/subscribe` et `/status` ainsi que les boutons dans `PostDetailPageComponent`. Interdis l'auto-follow et l'auto-abonnement (400). Un abonnement ne déclenche pas automatiquement un follow. Si l'abonnement est déjà actif, renvoie `409 Conflict` avec sa date d'expiration sans le prolonger. »
- **Points techniques clés :**
  - **Gestion atomique de l'abonnement :** Index unique `{ subscriberId: 1, creatorId: 1 }`. Lors d'une première souscription concurrente (`Promise.all`), la seconde requête attrape l'erreur MongoDB `11000` et renvoie `409 Conflict`. Lors d'un renouvellement après expiration, `findOneAndUpdate` filtre sur `expiresAt <= now` pour empêcher deux renouvellements simultanés.
  - **Clarté UX :** Affichage explicite du badge *« Simulation — aucun paiement »* et déverrouillage réactif du post dès la réponse du serveur sans recharger toute la page.
- **Fichiers créés / modifiés :** `backend/src/routes/creators.js`, `backend/test/creators.test.js`, `frontend-starter/src/app/components/post-detail-page/`.
- **Preuves de fonctionnement :** 136 tests backend et 172 tests frontend passants.
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi un abonnement n'implique pas un follow :** Suivre un créateur (gratuit) et s'abonner à son contenu premium (payant/VIP) sont deux intentions distinctes. Un utilisateur peut vouloir débloquer un tutoriel précis pendant 30 jours sans forcément suivre le créateur à long terme, et inversement.

---

## Mission 6 — Likes uniques et compteur dynamique cohérent

- **Objectif :** Permettre de liker/unliker un post (`POST` et `DELETE /api/posts/:id/like`) avec unicité en base `{ userId, postId }` et calcul dynamique de `likesCount`.
- **Prompt principal :**
  > « Ajoute le like et l'unlike sur les posts. Refuse l'auto-like (400) et exige que l'utilisateur ait le droit de lire le post (`canAccessPost`) avant de pouvoir le liker. Calcule `likesCount` depuis la collection `likes` sans compteur dénormalisé dans `Post`. »
- **Points techniques clés :**
  - **Idempotence sur double clic :** Si deux requêtes `POST /like` arrivent en même temps, l'erreur `11000` sur l'index unique `{ userId: 1, postId: 1 }` est interceptée et l'API renvoie `200 OK` avec `{ liked: true, likesCount }` recalculé via `Like.countDocuments`.
- **Fichiers créés / modifiés :** `backend/src/routes/posts.js`, `backend/test/likes.test.js`, `frontend-starter/src/app/components/post-detail-page/`.
- **Preuves de fonctionnement :** 154 tests backend et 176 tests frontend passants.
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi ne pas stocker `likesCount` comme un champ dans `Post` :** Un compteur stocké dans le document `Post` (`$inc: { likesCount: 1 }`) risque de se désynchroniser si un like est supprimé ou en cas d'erreur partielle. Compter les documents dans la collection `Like` (par `countDocuments` sur un post ou `$group` sur une page) garantit que le chiffre affiché est toujours exact.

---

## Mission 7 — Recherche serveur Atlas Search, filtres combinés et autocomplétion

- **Objectif :** Implémenter la recherche plein texte avec tolérance aux fautes (`fuzzy`), le filtrage par catégorie et par tags (`$all`), le tri déterministe (`date-desc`, `date-asc`, `likes-desc`, `relevance`) et une barre de suggestions prédictives (`mode=suggest`) décorrélée du catalogue.
- **Prompts principaux :**
  > « Implémente la recherche serveur sur `GET /api/posts` avec Atlas Search (`$search` en première étape, analyseur `lucene.french` sur `title` et `shortDescription`, type `token` sur `category` et `tags`). Exclus les brouillons, posts link, posts archivés et auteurs suspendus avant `$facet`. »
  > « Ajoute ensuite une barre de suggestions YouTube-style (debounce 300 ms, `mode=suggest`, `limit=5`, navigation clavier WAI-ARIA Combobox) qui n'altère pas la grille du catalogue tant que l'utilisateur n'a pas appuyé sur Entrée. »
- **Découvertes et ajustements clés :**
  - **Mapping Atlas Search `token` vs `string` :** Pour filtrer avec l'opérateur `equals` dans Atlas Search sur `category` et `tags`, le mapping `lucene.keyword` de type `string` ne fonctionne pas : il faut indexer ces champs avec `"type": "token"`. J'ai déployé et testé l'index `posts_search_index` directement sur le cluster MongoDB Atlas (`Cluster0`) avec des requêtes réelles (`guitare`, faute de frappe `origamy` $\rightarrow$ *Origami grue*, et filtre combiné `avion` + tag `papercraft`).
  - **Repli local automatique :** Comme `mongodb-memory-server` n'inclut pas le binaire Lucene `mongot` d'Atlas, `GET /api/posts` intercepte l'absence de `$search` en test local et bascule automatiquement sur un `$match` regex.
  - **Seuil de fuzzy en mode suggestion :** Pas de tolérance aux fautes sur 1 ou 2 lettres (sinon taper `"t"` matcherait n'importe quelle lettre à distance 1) ; le fuzzy (`maxEdits: 1, prefixLength: 2`) ne s'active qu'à partir de 3 caractères, avec un boost $\times 3$ pour le préfixe exact.
  - **Syntaxe `#tag` dans la barre de recherche :** Saisir `château #lego #star-wars` extrait automatiquement les tags dans le filtre `$all` et nettoie la requête textuelle.
- **Fichiers modifiés :** `backend/src/routes/posts.js`, `backend/test/search.test.js`, `frontend-starter/src/app/components/posts-page/` (`.ts`, `.html`, `.css`, `.spec.ts`).
- **Preuves de fonctionnement :** Tests réels validés sur Atlas + 186 tests backend et 200 tests frontend passants.
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi `$search` doit obligatoirement être la 1re étape du pipeline :** Le moteur Lucene (`mongot`) fournit la liste initiale des documents pertinents et leur score au moteur `mongod`. Aucun `$match` ou `$lookup` ne peut précéder `$search`.
  - **Pourquoi faire le `$lookup` avec `users` avant `$facet` :** Si on paginait d'abord et qu'on retirait les auteurs suspendus ensuite, une page de 10 résultats pourrait n'en afficher que 7 et `totalDocs` serait faux.
  - **Différence entre `$in` et `$all` sur les tags :** `$in` renvoie les posts ayant *au moins un* des tags ; `$all` exige que le post possède *tous* les tags demandés.

---

## Mission 8 — Administration et modération (archivage et suspension)

- **Objectif :** Permettre à un administrateur d'archiver/restaurer un post et de suspendre/réactiver un utilisateur depuis une page dédiée `/admin`, avec effet immédiat sur les droits d'accès.
- **Prompt principal :**
  > « Implémente les routes `/api/admin/posts/:id/archive`, `/restore`, `/api/admin/users/:id/suspend`, `/reactivate` et la page Angular `/admin`. Vérifie toujours le rôle `admin` en base MongoDB (`requireAdmin`), jamais uniquement dans le JWT. Interdis à un admin de s'auto-suspendre (400). »
- **Points techniques clés :**
  - **Vérification en base (`requireAdmin`) :** À chaque appel admin, le serveur relit `User.findById(req.user._id).select("role status")`. Si l'admin vient d'être rétrogradé ou suspendu en base, son JWT encore valide temporellement est immédiatement rejeté en `403`.
  - **Cas sensibles gérés :** Auto-suspension interdite (`400`), actions répétées idempotentes (`200`), et si on restaure le post d'un auteur toujours suspendu, le post passe en `published` mais reste invisible aux tiers (`404`) tant que le compte auteur n'est pas réactivé.
- **Fichiers créés / modifiés :** `backend/src/routes/admin.js`, `backend/test/admin.test.js`, `frontend-starter/src/app/shared/guards/admin.guard.ts`, `frontend-starter/src/app/shared/services/admin.service.ts`, `frontend-starter/src/app/components/admin-page/`.
- **Preuves de fonctionnement :** 193 tests frontend et 177 tests backend passants.

---

# Partie 2 — Fonctionnalités communautaires, Éditeur enrichi et Optimisations

## 1. Annuaire des créateurs, profil étendu, avatar et révocation JWT multi-sessions

- **Objectif :**
  1. Créer l'annuaire public des créateurs (`/creators`) et la page de profil public (`/creators/:id`) affichant les compteurs réels (abonnés actifs non expirés uniquement) et les créations découvrables.
  2. Transformer `/profile` en dashboard personnel complet : métriques d'atelier (Total, Publiés, Brouillons, Archivés via requêtes légères `limit: 1`), liste paginée de mes follows et abonnements actifs, édition de la bio et des tags de profil, upload/suppression d'avatar (PNG/JPEG/WebP $\le$ 2 Mo validé par magic bytes) avec affichage dans le header, et changement de mot de passe sécurisé.
- **Point de sécurité critique (changement de mot de passe) :**
  - Si l'utilisateur se trompe dans son mot de passe actuel sur `PUT /api/users/me/password`, le serveur renvoie **`400 Bad Request`** et non `401`, afin que l'intercepteur Angular ne déconnecte pas sa session en cours.
  - Dès que le mot de passe est modifié, le serveur met à jour `user.passwordChangedAt = new Date()` et renvoie un nouveau JWT. Dans les middlewares `auth`, `authMakerShare` et `optionalAuthMakerShare`, tout ancien JWT dont le claim `iat` est antérieur à `passwordChangedAt` est rejeté en `401 Unauthorized`, ce qui déconnecte immédiatement toutes les autres sessions ouvertes sur d'autres appareils.
- **Fichiers principaux :** `backend/src/routes/creators.js`, `backend/src/app.js`, `backend/test/profile.test.js`, `frontend-starter/src/app/components/profile-page/`, `creators-search-page/`, `creator-profile-page/`, `app/`.

---

## 2. Éditeur Markdown contextuel, Drag-and-Drop, choix de couverture et partage rapide

- **Objectif :** Rendre la création et la lecture de tutoriels fluides et complètes :
  - **Rendu Markdown 100 % sécurisé (`MarkdownService`) :** Échappement préalable du HTML brut (`<script>`, `onerror`), interdiction absolue de `bypassSecurityTrustHtml`, filtrage des protocoles de liens (`http:`, `https:`, `mailto:`) et résolution des médias intégrés exclusivement via des jetons internes `attachment:<id>` (images `<figure><img>`, notices PDF téléchargeables et lecteur `<audio controls>`).
  - **Barre d'outils Markdown contextuelle (`applyFormat`) :** Entoure proprement le texte sélectionné (`**gras**`, `*italique*`, `<u>souligné</u>`, `` `code` ``) sans casser les paragraphes, et insère les pièces jointes exactement à la position du curseur ou du glisser-déposer (`caretPositionFromPoint` W3C avec replis). En mode création initiale, les fichiers déposés utilisent des jetons temporaires `attachment:temp:<id>` prévisualisés en direct via `URL.createObjectURL(file)`, puis remplacés automatiquement par leurs identifiants MongoDB définitifs dès l'upload.
  - **Choix explicite de la photo de couverture (`PUT /api/posts/:id/cover`) :** Sélection en un clic (`⭐`) dans l'éditeur ou la modale, garantie d'unicité atomique via `arrayFilters` disjoints dans MongoDB, et affichage des bannières de couverture dans « Mes créations ».
  - **Boutons de partage et liens secrets *link-only* :** Copie en un clic du lien d'un post ou d'un profil créateur avec notification toast, et accès direct au lien secret `/share/<token>` pour les publications en visibilité `link`.
  - **Commentaires sécurisés et lecteur PDF intégré :** Ajout/suppression de commentaires (`GET/POST/DELETE /api/posts/:id/comments`), compteur 💬 sur toutes les cartes, et visualiseur PDF intégré (`<object type="application/pdf">`) alimenté par `Blob URL` avec bouton de téléchargement et bloc de repli.
- **Correction du bug d'affichage des images de couverture sur les brouillons :**
  - *Problème rencontré :* En créant un nouveau post (créé par défaut en statut `draft`), l'image choisie en couverture ne s'affichait parfois pas dans « Mes créations ».
  - *Cause identifiée :* Une balise `<img [src]="coverImg.downloadUrl">` déclenche une requête `GET` native du navigateur **sans** passer par `HttpClient` ni `authInterceptor` (donc sans l'en-tête `Authorization: Bearer <token>`). Or, l'API refuse légitimement en `404` l'accès anonyme aux pièces jointes d'un brouillon et en `401/403` celles d'un post non public (`followers`, `subscribers`, `link`).
  - *Correctif appliqué :* Préchargement authentifié des couvertures et images via `postService.getAttachmentBlob(postId, attId)` (`HttpClient` avec JWT), conversion en `URL.createObjectURL(blob)` stockée dans un signal réactif `attachmentBlobUrls`, et mise en cache immédiate de l'objet `File` local dès l'upload pour un affichage en 0 ms.

---

## 3. Dataset de démonstration idempotent et enrichissement multimédia

- **Objectif :** Peupler la base de développement avec une vraie vie communautaire (10 créateurs, 100 tutoriels, avatars, images de couverture, notices PDF, extraits MP3, likes, commentaires, follows et abonnements VIP) sans aucune dépendance binaire externe.
- **Réalisation (`seed-demo.js` & `seed-enrich-media.js`) :**
  - Mot de passe fourni uniquement par variable d'environnement (`DEMO_PASSWORD`), marquage `seedBatch: "makershare-demo-v1"` protégé contre toute injection client, réexécution idempotente sans doublon et commande `--clean` qui purge uniquement les données de démo sans toucher aux vrais comptes ni aux pistes du TP1-3.
  - Générateurs binaires purs Node.js (`zlib.deflateSync` + CRC-32 pour les PNG avec dégradés par catégorie et initiales matricielles 5x7 sur les avatars, flux vectoriel PDF 1.4 pour les notices A4, et trames MPEG Layer 3 + ID3v2 pour les extraits audio MP3). Tous les fichiers générés passent la validation par *magic bytes* du serveur.

---

## 4. Optimisation globale des performances, de l'upload et de la sécurité

- **Objectif :** Rendre le site plus rapide, fluide et réactif tout en durcissant le stockage des fichiers et la sécurité HTTP.
- **Optimisations réalisées :**
  - **Upload & Stockage (`attachmentUpload.js`, `attachmentValidator.js`, `posts.js`) :**
    - Validation parallèle des *magic bytes* sur tout le lot (`await Promise.all(uploadedFiles.map(...))`) au lieu d'une boucle séquentielle `for...await`.
    - Pré-contrôle mémoire du quota (10 fichiers / 50 Mo) et fail-fast sur la taille avant d'ouvrir un descripteur de fichier (`Buffer.allocUnsafe(32)`).
    - Noms de fichiers stockés générés par `crypto.randomUUID()` avec extension assainie (`/^\.[a-z0-9]{1,5}$/`) et fonction `resolveSafeAttachmentPath(storedName)` bloquant toute attaque par *Path Traversal*.
  - **Requêtes MongoDB (`posts.js`, `app.js`) :**
    - Parallélisation systématique via `Promise.all` (`countDocuments` + `find` sur `/my`, agrégations `Like` + `Comment` + relations `Follow`/`Subscription` sur `/posts` avec court-circuit si la page est vide).
    - Suppression du `Like.countDocuments` inutile à la création d'un brouillon (`likesCount: 0`) et remplacement de `fs.existsSync` par `fsPromises.access` non bloquant sur les avatars.
  - **Fluidité Frontend Angular (`post.service.ts`, `main.ts`) :**
    - **Cache LRU en mémoire (`blobCache`, 80 entrées avec `shareReplay(1)`) :** Concilie l'exigence de sécurité `Cache-Control: no-store` (aucune trace sur le disque du navigateur) avec une navigation instantanée en RAM entre Catalogue, Mes Postes et Détail.
    - **Pré-alimentation locale (`seedAttachmentBlob`) :** Dès la fin d'un upload, le `File` local est injecté dans `blobCache`, évitant tout aller-retour réseau pour afficher l'image qui vient d'être envoyée.
    - **Préchargement des routes (`withPreloading(PreloadAllModules)`) :** Chargement en arrière-plan des chunks lazy-loaded dès le démarrage pour supprimer tout délai de transition entre les pages.
  - **Durcissement HTTP (`app.js`) :** Désactivation de `x-powered-by`, ajout systématique de `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `X-Permitted-Cross-Domain-Policies: none`, et limite `express.json({ limit: "1mb" })` contre les payloads DoS.

---

## Bilan final des vérifications

- **Tests d'intégration et unitaires Backend (`cd backend && npm test`) :** **248 / 248 tests passants** (5 suites, 0 échec) sur base isolée `mongodb-memory-server` (non-régression TP1-3, modèles/DTOs, cycle de vie des posts, concurrence sur quotas d'upload et d'abonnements, matrice d'accès, liens secrets, likes, recherche et mode suggest, modération admin, profil/avatar/révocation JWT, commentaires, couvertures et seed).
- **Tests unitaires Frontend (`cd frontend-starter && npm test -- --watch=false`) :** **301 / 301 tests passants** (20 suites Vitest, 0 échec).
- **Build de production Angular (`cd frontend-starter && npm run build`) :** Compilation réussie sans erreur ni warning (`dist/gpc`).
