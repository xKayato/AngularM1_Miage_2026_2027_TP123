# Architecture Globale du Projet — Guitar Practice Cloud

Ce document offre une vision à 360° de l'application afin de permettre une supervision technique autonome et exhaustive (notamment par une IA comme ChatGPT).

---

## 1. Présentation & Objectifs du Projet

**Guitar Practice Cloud (GPC)** est une application web fullstack destinée aux musiciens pour stocker, gérer et écouter des pistes d'accompagnement (*backing tracks*).

- **Backend** : API REST sous Node.js / Express 5 connectée à MongoDB Atlas via Mongoose 9.
- **Frontend** : Single Page Application sous Angular 22 (Signals, Standalone par défaut, Formulaires réactifs, Vite / Vitest).
- **Stockage hybride** :
  - Métadonnées (utilisateurs, informations sur les morceaux) stockées dans **MongoDB Atlas**.
  - Fichiers binaires audio (MP3, WAV, OGG, M4A) stockés sur le **disque local du serveur** (`backend/data/uploads/`).

---

## 2. Arborescence du Projet

```text
AngularM1_Miage_2026_2027_TP123/
├── API_CONTRACT.md                  # Contrat formel des routes HTTP REST
├── ATLAS_SETUP.md                   # Procédure de configuration MongoDB Atlas
├── SUJET_ETUDIANT_TP1.md            # Spécifications de la séance 1 (Auth & Profil)
├── SUJET_ETUDIANT_TP2.md            # Spécifications de la séance 2 (Audio & Tracks)
├── SUJET_ETUDIANT_TP3.md            # Spécifications de la séance 3 (Optimisations)
├── docs/
│   └── supervision/                 # Dossier dédié à la supervision IA
│       ├── PROJECT_ARCHITECTURE.md  # Le présent document
│       ├── MISSION_1_SPECIFICATION.md # Spécification & plan Mission 1
│       └── GPT_SUPERVISOR_PROMPT.md # Prompt clé en main pour ChatGPT
│
├── backend/                         # Serveur API REST (Express 5 + Mongoose 9)
│   ├── .env.example                 # Modèle des variables d'environnement
│   ├── .env                         # Variables locales (MONGODB_URI, JWT_SECRET, PORT)
│   ├── best-practices.md            # Guide des règles de développement backend
│   ├── package.json
│   ├── data/
│   │   └── uploads/                 # Dossier local de stockage des fichiers audio
│   └── src/
│       ├── server.js                # Point d'entrée : connexion DB, init admin, écoute HTTP
│       ├── app.js                   # Application Express, middlewares, routes REST
│       └── models/
│           ├── User.js              # Modèle Mongoose utilisateur (hash bcrypt, toPublic)
│           └── Track.js             # Modèle Mongoose morceau (storedName privé, index)
│
└── frontend-starter/                # Client Angular 22
    ├── angular.json
    ├── package.json                 # Scripts: start, build, test (Vitest)
    ├── proxy.conf.json              # Redirection /api -> http://localhost:3000
    ├── best-practices.md            # Règles Angular 22 (Signals, inject, pas d'any)
    ├── fichiers-audio-de-test/      # Fixtures MP3/WAV pour les essais
    └── src/
        ├── index.html
        ├── main.ts                  # Bootstrap : provideRouter, provideHttpClient(withInterceptors)
        ├── styles.css               # Styles globaux
        └── app/
            ├── routes.ts            # Définition des routes Angular et authGuard
            ├── components/
            │   ├── app/             # Composant racine AppComponent (header, nav, router-outlet)
            │   ├── login-page/      # Page de connexion
            │   ├── register-page/   # Page d'inscription
            │   ├── profile-page/    # Page de consultation / modification du profil
            │   └── tracks-page/     # Page principale de gestion et lecture des morceaux
            └── shared/
                ├── guards/
                │   └── auth.guard.ts           # Protection des routes privées
                ├── interceptors/
                │   └── auth.interceptor.ts     # Ajout Bearer Token JWT & gestion 401
                ├── models/
                │   ├── auth-response.model.ts  # Interface { token, user }
                │   ├── page.model.ts           # Interface générique de pagination Page<T>
                │   ├── track.model.ts          # Interface Track
                │   └── user.model.ts           # Interface User { id, name, email, createdAt }
                └── services/
                    ├── auth.service.ts         # Service singleton d'authentification & état
                    └── track.service.ts        # Service de gestion des pistes et uploads
```

---

## 3. Flux Réseau & Communication Frontend <-> Backend

```
┌──────────────────────────────────────────────┐
│       Navigateur Web (Frontend Angular)      │
│            http://localhost:4200             │
└──────────────────────┬───────────────────────┘
                       │ Requêtes relatives `/api/...`
                       ▼
┌──────────────────────────────────────────────┐
│         Dev Server Proxy Angular CLI         │
│               (proxy.conf.json)              │
└──────────────────────┬───────────────────────┘
                       │ Redirection transparente
                       ▼
┌──────────────────────────────────────────────┐
│           Backend Node.js / Express          │
│            http://localhost:3000             │
│  - Middlewares : CORS, express.json, auth    │
└──────────────┬───────────────────────────────┘
               ├───────────────────────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│     Base MongoDB Atlas       │ │  Disque local (data/uploads) │
│ - Collection 'users'         │ │ - Morceaux audio réels       │
│ - Collection 'tracks'        │ │   nommés par UUID            │
└──────────────────────────────┘ └──────────────────────────────┘
```

---

## 4. Contrat d'API REST (`API_CONTRACT.md`)

| Méthode | Route | Authentification | Format Requête | Format Réponse |
|---|---|---|---|---|
| `GET` | `/api/health` | Non | - | `200 { status: "ok" }` |
| `POST` | `/api/auth/register` | Non | JSON `{ name, email, password }` | `201 { token, user }` |
| `POST` | `/api/auth/login` | Non | JSON `{ email, password }` | `200 { token, user }` |
| `GET` | `/api/users/me` | **Bearer JWT** | - | `200 User` |
| `PUT` | `/api/users/me` | **Bearer JWT** | JSON `{ name }` | `200 User` |
| `GET` | `/api/tracks?page=1&limit=5`| **Bearer JWT** | Query params | `200 Page<Track>` |
| `POST` | `/api/tracks` | **Bearer JWT** | Multipart `audio`, `title` | `201 Track` |
| `GET` | `/api/tracks/:id/audio` | **Bearer JWT** | - | `200` Flux audio binaire |
| `DELETE`| `/api/tracks/:id` | **Bearer JWT** | - | `204 No Content` |

**Codes d'erreur standardisés** :
- `400` : Requête invalide (validation champs manquants, mot de passe trop court < 8 caractères).
- `401` : Non authentifié (absence de token, signature invalide ou token expiré).
- `404` : Ressource introuvable.
- `409` : Conflit (adresse email déjà enregistrée).

---

## 5. Principes de Développement & Bonnes Pratiques

### A. Règles Frontend (Angular 22)
1. **Composants Standalone** : Pas de `standalone: true` explicite (c'est le standard par défaut en Angular 22).
2. **Gestion d'état réactive** : Usage exclusif des **Signals** (`signal()`, `computed()`) pour l'état local et partagé.
3. **Injection de dépendances** : Utilisation de la fonction `inject()` au lieu de constructeurs verbeux.
4. **Templates modernes** : Contrôle de flux natif (`@if`, `@for`, `@switch`), aucun directive structurelle obsolète (`*ngIf`, `*ngFor`).
5. **Typage strict** : Aucun `any` ; `unknown` si nécessaire, types et interfaces stricts issus de `src/app/shared/models/`.
6. **Sécurité JWT** :
   - Le token JWT est stocké dans le `localStorage` sous la clé `gpc_token`.
   - **Interdiction formelle de logger le JWT** (`console.log(token)` proscrit pour éviter l'usurpation).
   - L'intercepteur HTTP injecte automatiquement `Authorization: Bearer <token>`.
   - En cas d'erreur `401`, déconnexion immédiate et redirection `/login`.

### B. Règles Backend (Express / Mongoose)
1. Les mots de passe sont toujours hachés via `bcryptjs` avec sel avant écriture.
2. Le hash du mot de passe (`passwordHash`) a `select: false` dans Mongoose pour ne jamais être exposé.
3. Les fichiers physiques reçoivent un UUID unique lors du stockage pour éviter les collisions et les injections de chemin.
