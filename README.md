# MakerShare

**La plateforme de partage de créations et tutoriels DIY** — menuiserie, électronique, maroquinerie, Lego, papercraft, origami, musique, modèles 3D…

> Projet de Programmation Web — Master 1 MIAGE, Université Côte d'Azur (2026–2027)
> Thomas DELOUP
>
> Angular 22 · Node.js / Express 5 · MongoDB Atlas (Mongoose 9) · 305 tests backend · 396 tests frontend

MakerShare est né d'une application existante, *Guitar Practice Cloud* (TP1 à TP3), qui gérait des pistes audio d'entraînement. Le TP4 libre l'a transformée en réseau social de makers : on y publie des tutoriels en Markdown avec images, PDF et audio, on choisit qui peut les lire, on suit des créateurs, on s'abonne à leurs contenus exclusifs et on commente. Toute l'API historique continue de fonctionner à l'identique.

---

## Ce qui rend le projet original

L'essentiel du travail n'est pas dans les écrans mais dans la façon dont l'application **protège les contenus privés sans casser l'expérience**. Voici les mécanismes dont je suis le plus fier.

### 1. Aucun fichier n'est servi en statique

Les pièces jointes, couvertures et avatars sont stockés sur disque, mais **aucun dossier d'upload n'est exposé**. Chaque téléchargement passe par une route Express qui vérifie les droits du lecteur sur le post (`canAccessPost`) et bloque les chemins piégés (`resolveSafeAttachmentPath`, anti *path traversal*).

Problème : une balise `<img src>` n'envoie ni JWT ni en-tête personnalisé. Le front télécharge donc les images protégées via `HttpClient` en `Blob`, les garde dans un **cache LRU de 80 entrées** (`PostService`) et les affiche avec `URL.createObjectURL()`, révoquées à la destruction du composant.

### 2. Un lien de partage secret qui ne fuit nulle part

Un post en visibilité `link` est invisible du catalogue et lisible par quiconque possède son URL `/share/:token`, sans compte.

- le secret (32 octets aléatoires) n'est **jamais stocké** : la base ne garde que son **hash SHA-256** ;
- il apparaît dans l'URL de la page, mais **jamais dans les URL des fichiers** : pour télécharger une pièce jointe ou lire les commentaires, Angular l'envoie dans l'en-tête `X-Share-Token`. Il n'atterrit donc ni dans l'historique, ni dans les logs d'accès, ni dans un `Referer` ;
- il expire après 7 jours, l'auteur peut le révoquer (réponse `410 Gone`) ou le régénérer ; les logs serveur affichent `[REDACTED_SHARE_TOKEN]`.

### 3. Découvrable sans rien divulguer : aperçu ≠ détail

Un post réservé aux followers ou aux abonnés reste visible dans le catalogue, mais sous forme d'**aperçu verrouillé** (`isLocked: true`). Les projections DTO (`postProjections.js`) garantissent qu'un aperçu ne contient jamais le `content`, ni les noms de fichiers internes, et que la couverture d'un post verrouillé est forcée à `null` côté serveur.

En cas de refus (`401`/`403`), l'API ne renvoie qu'un message : le front appelle alors une route dédiée `/api/posts/:id/preview` pour afficher le cadenas. Les erreurs restent homogènes et ne laissent rien filtrer.

### 4. Des uploads vérifiés octet par octet, et des quotas qui tiennent en concurrence

- Le type MIME annoncé par le navigateur ne suffit pas : le serveur lit les **premiers octets réels** du fichier (*magic bytes*) pour reconnaître JPEG, PNG, WebP, PDF, MP3, WAV, OGG et M4A, avec une limite par famille (5 / 10 / 25 Mo).
- Les quotas par post (10 fichiers, 50 Mo cumulés) sont appliqués par un **`findOneAndUpdate` conditionnel avec `$expr`** : deux uploads simultanés ne peuvent pas dépasser la limite, ce qu'un simple contrôle en mémoire laisserait passer.
- En cas d'échec (validation, base, disque), les fichiers déjà écrits sont supprimés immédiatement.

### 5. Un abonnement simulé sans double activation

L'abonnement « VIP » de 30 jours (sans paiement, clairement affiché comme simulation) s'appuie sur un **index unique `{ subscriberId, creatorId }`** et une mise à jour atomique conditionnelle. Un double-clic ou deux requêtes parallèles produisent un seul abonnement et un `409 Conflict` explicite (« Abonnement déjà actif jusqu'au … »), jamais un doublon ni une prolongation silencieuse.

### 6. Une modération puissante, mais sans passe-droit

L'administrateur peut **archiver un post** (les visiteurs reçoivent `410 Gone`) et **suspendre un compte** : connexion refusée, JWT déjà émis rejeté immédiatement (`403`), posts retirés du catalogue. En revanche, il **n'a aucun accès implicite aux fichiers privés** des créateurs : sans être follower, abonné ou détenteur du lien, il reçoit `403` comme tout le monde.

Côté session, un changement de mot de passe incrémente un `tokenVersion` qui **révoque tous les anciens JWT**. Et l'intercepteur Angular distingue `401` (session expirée → déconnexion) de `403` (droits insuffisants → on reste connecté et on affiche un message).

### 7. Une recherche tolérante aux fautes, testable hors Atlas

- **MongoDB Atlas Search** avec tolérance aux fautes (`fuzzy`), autocomplétion dès la première lettre (`mode=suggest`) et syntaxe mixte texte + tags : `château #lego #star-wars`.
- Les tests tournent sur `mongodb-memory-server`, qui ne connaît pas Atlas Search : le backend bascule alors automatiquement sur un **pipeline de repli** (`$regex` échappé) qui renvoie les mêmes formes de réponse. La suite de tests reste 100 % isolée et déterministe.
- Recherche **par créateur** (nom ou identifiant), pagination numérotée avec choix du nombre de résultats, et filtres **reflétés dans l'URL** : un F5 ou un lien partagé retrouve exactement la même recherche.

### 8. Un éditeur Markdown où l'on dépose les médias là où l'on écrit

Dans l'espace « Mes créations », on glisse une image, un PDF ou un son **à l'endroit précis du texte** où se trouve la souris (`document.caretPositionFromPoint`). Les fichiers d'un post pas encore enregistré reçoivent un jeton temporaire `attachment:temp:…`, converti en vraie référence à la sauvegarde.

Le rendu Markdown est écrit à la main avec **échappement HTML strict** (scripts, attributs `on*`, liens `javascript:` neutralisés), sans jamais recourir à `bypassSecurityTrustHtml`. Les PDF s'ouvrent dans une visionneuse intégrée et les sons dans un lecteur audio.

### 9. Une évolution sans régression

MakerShare ajoute 8 modèles et des dizaines de routes **sans toucher au contrat de l'application d'origine** : `/api/auth*`, `/api/users/me` et `/api/tracks*` (upload audio Multer, couvertures, pagination, streaming authentifié) sont conservées telles quelles et couvertes par leurs tests historiques. Les anciennes pistes ne sont pas converties en posts ; les comptes créés avant l'ajout des rôles sont traités comme `user` / `active` partout, y compris dans les agrégations.

---

## Fonctionnalités

| Page | Ce qu'on y fait |
|---|---|
| `/posts` | Catalogue paginé, recherche avec suggestions, filtres catégorie / tag / créateur, tri par date, popularité ou pertinence |
| `/posts/:id` | Lecture du tutoriel Markdown, pièces jointes (images, visionneuse PDF, lecteur audio), likes, commentaires, aperçu verrouillé si accès refusé |
| `/share/:token` | Lecture d'un post non répertorié via son lien secret, sans compte |
| `/my-posts` | Création et édition (brouillon → publié → dépublié), visibilité, pièces jointes, choix de la couverture, gestion du lien de partage |
| `/creators`, `/creators/:id` | Annuaire des makers, profil public, listes de followers et de comptes suivis, follow et abonnement simulé |
| `/profile` | Nom, bio, tags de compétences, avatar, mot de passe, créateurs suivis, mes followers, abonnements actifs |
| `/admin` | Inspection d'un post ou d'un compte, archivage / restauration, suspension / réactivation |

**Visibilités d'un post :** `public` (tout le monde), `followers`, `subscribers` (abonnés actifs) et `link` (lien secret).
**Catégories :** Menuiserie, Électronique, Maroquinerie, Lego, Papercraft, Origami, Musique, Modèles 3D, Autre.

---

## Stack et architecture

| | |
|---|---|
| **Frontend** | Angular 22 : composants standalone, `inject()`, Signals (`signal`, `computed`), control flow `@if` / `@for`, formulaires réactifs, TypeScript strict sans `any` |
| **Backend** | Node.js / Express 5 en ES Modules, Mongoose 9, Multer, JWT (`jsonwebtoken`), `bcryptjs` |
| **Données** | MongoDB Atlas pour les métadonnées et les relations, disque local (`backend/data/uploads/`) pour les fichiers |
| **Tests** | `node --test` + `mongodb-memory-server` côté API, Vitest côté Angular |

Les 8 collections : `users`, `posts`, `follows`, `subscriptions`, `likes`, `sharelinks`, `comments` et `tracks` (historique). Les relations uniques (follow, like, abonnement) sont garanties par des index composés uniques, et les compteurs (likes, followers) sont calculés à la volée plutôt que dénormalisés.

---

## Démarrer le projet

**Prérequis :** Node.js 24 (20.6 minimum pour `--env-file`), npm, et un cluster MongoDB Atlas ou une instance MongoDB locale. La connexion à Atlas est décrite dans [ATLAS_SETUP.md](ATLAS_SETUP.md) et les mappings de l'index `posts_search_index` dans [TP4_LIBRE.md](TP4_LIBRE.md) (section 7) ; sans cet index, la recherche passe simplement par le repli regex.

### Backend

```bash
cd backend
cp .env.example .env      # puis renseigner MONGODB_URI et JWT_SECRET
npm install
npm start                 # http://localhost:3000
```

Jeu de démonstration optionnel (10 créateurs, 100 posts, médias générés) :

```bash
# ajouter DEMO_PASSWORD=... dans .env, puis :
npm run seed:demo         # comptes demo.*@makershare.local
npm run seed:enrich       # images, PDF et MP3 de démonstration
npm run seed:clean        # retire uniquement les données de démo
```

Le script est idempotent : le relancer ne crée pas de doublons et il ne touche jamais aux comptes réels.

### Frontend

```bash
cd frontend-starter
npm install
npm start                 # http://localhost:4200, /api/* est redirigé vers le backend
```

---

## Tests

```bash
cd backend && npm test                          # 305 tests, 15 fichiers
cd frontend-starter && npm test -- --watch=false  # 396 tests, 25 fichiers
cd frontend-starter && npm run build            # build de production
```

Les tests backend démarrent une vraie base MongoDB en mémoire et appellent l'API en HTTP. Ils couvrent notamment la matrice d'accès complète (visiteur, connecté, follower, abonné, auteur, admin), les liens secrets, la concurrence sur les quotas et les abonnements, la modération, la révocation des JWT et la non-régression des TP1 à TP3.

---

## Organisation du dépôt

```text
backend/
  src/
    app.js            routes historiques (auth, users, tracks) et montage des routeurs
    routes/           posts, creators, admin
    middlewares/      authentification et upload des pièces jointes
    models/           les 8 modèles Mongoose
    utils/            contrôle d'accès, projections DTO, validation binaire
  scripts/            jeux de données de démonstration
  test/               tests d'intégration
frontend-starter/
  src/app/
    components/       une page par dossier (catalogue, détail, gestion, profils, admin…)
    shared/           services, modèles TypeScript, intercepteur, guards
    routes.ts
```

---

## Documentation

- [API_CONTRACT.md](API_CONTRACT.md) — routes, DTOs, codes HTTP et matrice d'accès
- [TP4_LIBRE.md](TP4_LIBRE.md) — cahier des charges et règles métier de MakerShare
- [ATLAS_SETUP.md](ATLAS_SETUP.md) — configuration du cluster MongoDB Atlas
- [RAPPORT_IA_LIBRE.md](RAPPORT_IA_LIBRE.md) — rapport d'utilisation de l'IA pour le TP4
- [RAPPORT_IA_TP1_A_3.md](RAPPORT_IA_TP1_A_3.md) — rapport d'utilisation de l'IA pour les TP1 à TP3
