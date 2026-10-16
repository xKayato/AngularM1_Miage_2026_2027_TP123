# MakerShare — Plateforme Collaborative pour Makers & Créateurs DIY

> **Projet de Programmation Web — Master 1 MIAGE (2026–2027)**  
> **Université Côte d'Azur**  
> **Étudiant :** Thomas DELOUP  
> **Base de départ :** Guitar Practice Cloud (TP1 à TP3) $\rightarrow$ **Évolution majeure :** MakerShare (TP4 Libre)

---

## 📌 Présentation du Projet

**MakerShare** est une plateforme web moderne et réactive dédiée au partage, à la découverte et à l'apprentissage de projets et tutoriels *Do-It-Yourself* (DIY), d'artisanat et d'ingénierie créative (impression 3D, électronique, origami, menuiserie, couture, modélisme, etc.).

Construite sur une architecture découplée **Angular 22** (Frontend) et **Node.js / Express 5 / MongoDB Atlas** (Backend), l'application garantit une **rétrocompatibilité totale à 100%** avec le module initial **Guitar Practice Cloud** (TP1-3) tout en intégrant l'ensemble des exigences avancées du cahier des charges MakerShare (TP4 Libre) :

- 🔍 **Découverte avancée** : Catalogue paginé avec pipeline `$facet`, recherche textuelle, syntaxe `#tag`, filtres par catégories et tris déterministes (date, popularité/likes, pertinence).
- 📝 **Éditeur Markdown in-text enrichi** : Glisser-déposer de médias directement dans le texte avec calcul géométrique précis du curseur (W3C `caretPositionFromPoint`), jetons temporaires de prévisualisation, gestion de quotas et magic bytes.
- 👥 **Écosystème Créateurs & Communauté** : Annuaire de makers, profils publics détaillés, suivi (*Follow*), abonnement VIP simulé de 30 jours avec protection atomique contre les conditions de concurrence (*race conditions*).
- 💬 **Interactions sociales & Sécurité** : Commentaires avec avatars, système de likes, lecteur PDF in-browser, lecteur audio multi-pistes, partages secrets déterministes SHA-256.
- 🛡️ **Gouvernance & RGPD** : Matrice de droits RBAC granulaire (`user`, `admin`, `active`, `suspended`), minimisation des données (aucune fuite d'email ni d'identifiant privé sur les aperçus), invalidation de session JWT lors des changements de mot de passe.

---

## 🚀 Fonctionnalités Principales

### 1. Catalogue & Découverte de Projets (`/posts`)
- **Aperçus dynamiques** : Cartes illustrées avec couverture adaptative, date de publication réelle, compteur de likes et avatar réel de l'auteur (avec repli instantané sur les initiales en cas d'absence ou d'erreur de chargement).
- **Tris déterministes calculés en base** : Date décroissante (`date-desc`), date croissante (`date-asc`), popularité globale (`likes-desc` via agrégation `$lookup`), et pertinence de recherche (`relevance`).
- **Filtres combinatoires** : Filtrage par catégorie exclusive et filtrage multi-tags avec opérateur `$all`.
- **Recherche hybride & syntaxe `#tag`** : Saisie libre mixant mots-clés textuels et tags préfixés par un dièse (ex. `chateau #medieval #origami`).
- **Mode suggestion instantané** : Autocomplétion dès 1 caractère sur `/api/posts?mode=suggest`.

### 2. Consultation & Tutoriels Détaillés (`/posts/:id`)
- **Rendu Markdown enrichi et assaini** : Neutralisation systématique des attaques XSS (`<script>`, balises `onerror`, liens `javascript:`).
- **Intégration native des pièces jointes** :
  - 🖼️ **Images** : Balises figures responsives avec zoom et bordure dorée.
  - 📄 **Documents PDF** : Bloc stylisé de téléchargement et intégration d'un lecteur PDF dédié.
  - 🎵 **Fichiers Audio** : Lecteur HTML5 natif `<audio controls>` pour les tutoriels sonores et podcasts.
- **Espace Commentaires & Likes** : Ajout et modération de commentaires en temps réel, bascule de like instantanée et réactive.
- **Partage via lien secret (`/share/:token`)** : Accès déterministe protégé par hachage SHA-256 sans divulgation de métadonnées privées.

### 3. Gestion & Édition Avancée des Tutoriels (`/my-posts`)
- **Cycle de vie des créations** : Brouillon (`draft`), Publié (`published`), Dépublié, Archivé (`archived`).
- **Glisser-Déposer in-text dans le `<textarea>`** :
  - Détection précise de l'offset de caractères sous le curseur grâce au standard W3C `document.caretPositionFromPoint`.
  - Repli déterministe sur le curseur actif de saisie pour contourner les limitations des moteurs de rendu sans altérer le texte rédigé.
  - Prévention de la perte de focus (`blur`) sur les clics de la barre d'outils via `(mousedown)="$event.preventDefault()"`.
- **Jetons temporaires éphémères (`attachment:temp:...`)** : Possibilité d'intégrer des pièces jointes dans le texte dès la rédaction d'un nouveau projet, avec conversion atomique en vrais identifiants GridFS/disque lors de la sauvegarde.
- **Quotas stricts appliqués côté serveur** : Maximum 10 pièces jointes et 50 Mo cumulés par projet, validation binaire des *magic bytes* (JPEG, PNG, WebP, PDF, MP3, WAV, OGG, M4A).

### 4. Réseau Créateurs & Abonnements (`/creators`, `/creators/:id`)
- **Annuaire des créateurs** : Recherche par nom ou compétences, badges d'expertise.
- **Profil public du créateur** : Biographie, réalisations publiques, compteurs réels de followers et créations.
- **Système de suivi (*Follow*)** : Abonnement en 1 clic pour suivre l'activité d'un créateur.
- **Abonnement VIP simulé (30 jours)** : Déblocage des créations exclusives avec protection atomique par index composé unique `{ subscriberId: 1, creatorId: 1 }` contre les activations concurrentes.

### 5. Profil Utilisateur & Sécurité (`/profile`)
- **Personnalisation** : Modification du nom, de la bio et des tags de compétences.
- **Photo de profil (Avatar)** : Téléversement avec aperçu instantané, validation magic bytes et route publique dédiée `/api/users/:id/avatar`.
- **Changement de mot de passe sécurisé** : Invalidation immédiate de tous les tokens JWT antérieurs grâce au champ de versioning `tokenVersion`.

### 6. Module Historique Guitar Practice Cloud (`/tracks`)
- Préservation intégrale du lecteur multi-pistes issu des TP1 à TP3 :
  - Visualisation de la forme d'onde, contrôle du volume, lecture en boucle (points A-B).
  - Contrôle précis de la vitesse de lecture (pitch préservé).
  - Gestion des morceaux de travail personnels.

---

## 🛠️ Stack Technique

### Frontend
- **Framework** : Angular 22 (Composants 100% Standalone, architecture réactive basée sur les **Signals**).
- **Patterns modernes** : `inject()`, nouveau Control Flow natif (`@if`, `@for`, `@empty`), formulaires réactifs (`ReactiveFormsModule`), typage strict TypeScript sans aucun `any`.
- **Style & Expérience Utilisateur** : Design responsive moderne avec variables CSS HSL, thème sombre travaillé, micro-animations, glassmorphism, compatible mobile (validé sous résolution iPhone SE 375px).
- **Tests** : 290 tests automatisés avec Karma / Jasmine / Vitest (19 suites, 100% de réussite).

### Backend
- **Serveur** : Node.js 22 & Express 5 (ES Modules natifs).
- **Base de données** : MongoDB Atlas avec Mongoose.
- **Performances** : Parallélisation systématique des requêtes indépendantes par `Promise.all` (gain de 10 à 16% sur la latence réseau TLS Atlas), pagination `$facet`.
- **Stockage & Fichiers** : Multer avec inspection binaire des magic bytes, stockage disque organisé (`data/uploads/attachments`, `covers`, `avatars`).
- **Tests** : 248 tests automatisés avec le test runner natif Node.js (`node --test`, 5 suites, 100% de réussite).

---

## 📋 Prérequis

- **Node.js** : version 22.x ou supérieure recommandée.
- **npm** : version 10.x ou supérieure.
- **Cluster MongoDB Atlas** (ou une instance MongoDB locale).
- Un navigateur moderne (Chrome, Edge, Firefox, Safari).

---

## ⚙️ Installation & Démarrage

### 1. Cloner le projet

```bash
git clone <url-du-depot>
cd AngularM1_Miage_2026_2027_TP123
```

---

### 2. Démarrer le Backend

1. Se placer dans le répertoire backend :
   ```bash
   cd backend
   ```

2. Configurer les variables d'environnement :
   ```bash
   cp .env.example .env
   ```
   Renseigner dans `.env` :
   ```env
   PORT=3000
   MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/makershare?retryWrites=true&w=majority
   JWT_SECRET=votre_secret_jwt_robuste_et_long
   DEMO_PASSWORD=DemoPassword123!
   ```

3. Installer les dépendances :
   ```bash
   npm install
   ```

4. *(Optionnel)* Initialiser le jeu de données de démonstration (10 créateurs, 100 posts variés) :
   ```bash
   npm run seed:demo
   ```

5. Lancer le serveur backend :
   ```bash
   npm start
   ```
   *Le serveur démarre sur `http://localhost:3000`.*

---

### 3. Démarrer le Frontend

1. Ouvrir un second terminal et naviguer dans `frontend-starter` :
   ```bash
   cd frontend-starter
   ```

2. Installer les dépendances :
   ```bash
   npm install
   ```

3. Lancer le serveur de développement Angular :
   ```bash
   npm start
   ```
   *L'application est accessible sur `http://localhost:4200` avec redirection transparente des requêtes `/api/*` vers le backend via `proxy.conf.json`.*

---

## 🧪 Tests & Assurance Qualité

L'ensemble des composants, services et endpoints dispose d'une couverture de tests rigoureuse :

```bash
# Lancer la suite de tests unitaires et d'intégration Backend (248 tests)
cd backend
npm test

# Lancer la suite de tests unitaires Frontend (290 tests)
cd ../frontend-starter
npm test

# Valider la compilation de production Angular
npm run build
```

### Validation en Navigateur Réel (Microsoft Edge via CDP)
Un script de contrôle automatisé ([`verify-mission7-browser.mjs`](file:///C:/Users/Thomas/.gemini/antigravity-ide/brain/b7e0d2f7-f858-40e3-b7e5-0235070ec4e5/scratch/verify-mission7-browser.mjs)) valide l'intégralité des parcours de bout en bout :
- Authentification, profil, modification d'avatar et changement de mot de passe.
- Recherche par tags `#origami`, tris déterministes et repli automatique d'avatar en cas d'erreur `(error)`.
- Rechargement F5 direct sur `/posts/:id` et `/creators/:id` sans écran blanc grâce à `<base href="/" />`.
- Neutralisation des injections XSS dans le parseur Markdown.
- Glisser-déposer de médias à l'offset exact du curseur dans l'éditeur.
- Rendu responsive mobile vérifié (iPhone SE 375px sans débordement horizontal).

---

## 📂 Structure du Répertoire

```text
├── backend/                         # API REST Express 5 & Mongoose
│   ├── data/uploads/                # Fichiers téléversés (attachments, covers, avatars)
│   ├── scripts/
│   │   └── seed-demo.js             # Script idempotent d'initialisation des 100 créations
│   ├── src/
│   │   ├── middleware/              # auth, upload, validation magic bytes
│   │   ├── models/                  # Post, User, Like, Follow, Subscription, ShareLink
│   │   ├── routes/                  # posts, creators, users, auth, tracks
│   │   └── utils/                   # Projections DTO, calculs d'accès
│   └── test/                        # 5 suites de tests automatisés (248 tests passants)
│
├── frontend-starter/                # Application Client Angular 22 Standalone
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/          # Pages : posts, post-detail, creators, profile, my-posts...
│   │   │   ├── shared/              # Services, modèles TypeScript stricts, guards, pipes
│   │   │   └── routes.ts            # Définition des routes et protections par Guards
│   │   ├── styles.css               # Design system global, responsive, dark theme
│   │   └── index.html               # Balise <base href="/" /> et polices système
│   └── proxy.conf.json              # Proxy de développement vers http://localhost:3000
│
├── API_CONTRACT.md                  # Spécification détaillée des endpoints et DTOs
├── TP4_LIBRE.md                     # Cahier des charges et matrice d'accès MakerShare
├── RAPPORT_IA_TP1_A_3.md            # Rapport IA pour les TP1 à TP3 (Guitar Practice Cloud)
├── RAPPORT_IA_LIBRE.md              # Rapport IA pour le TP4 Libre : MakerShare (Missions 0 à 7)
└── ATLAS_SETUP.md                   # Guide de configuration du cluster MongoDB Atlas
```

---

## 📚 Documents de Référence

- [API_CONTRACT.md](API_CONTRACT.md) : Contrat d'interface exhaustif, DTOs, matrices d'accès et codes HTTP.
- [TP4_LIBRE.md](TP4_LIBRE.md) : Spécifications et choix d'architecture pour MakerShare.
- [RAPPORT_IA_TP1_A_3.md](RAPPORT_IA_TP1_A_3.md) : Rapport d'usage IA officiel pour les TP1 à TP3 (Guitar Practice Cloud).
- [RAPPORT_IA_LIBRE.md](RAPPORT_IA_LIBRE.md) : Rapport technique approfondi du projet MakerShare (TP4 Libre).
- [ATLAS_SETUP.md](ATLAS_SETUP.md) : Procédure de configuration de la base MongoDB Atlas.
- [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md) : Guide méthodologique de prompt engineering et supervision d'agents IA.

---

## 👤 Auteur & Remerciements

- **Thomas DELOUP** — Étudiant en Master 1 MIAGE, Université Côte d'Azur.
- Encadrement pédagogique : Équipe pédagogique Programmation Web — M1 MIAGE.
