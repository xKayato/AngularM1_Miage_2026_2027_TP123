# Rapport d'Usage de l'IA — TP1 (Guitar Practice Cloud)

**Binôme :** Thomas DELOUP & Co-équipier  
**Formation :** Master 1 MIAGE — Programmation Web (2026-2027)  
**Assistant IA utilisé :** Antigravity (Google Gemini 3.8 Flash, High Reasoning)  
**Superviseur IA externe :** OpenAI ChatGPT-5.6-sol

---

## 1. Mission 0 — Cartographie de l’Application

### Objectif
Identifier et documenter sans modification de code les composants fondamentaux du starter Angular 22 :
- Composant racine (`AppComponent`) ;
- Configuration des routes (`routes.ts`) et gardes (`authGuard`) ;
- Enregistrement de `HttpClient` avec intercepteurs (`main.ts`) ;
- Modèles (`shared/models`), services (`shared/services`) et pages (`components/`) ;
- Mécanisme d'injection du token JWT (`auth.interceptor.ts`) ;
- Schéma annoté du flux de connexion et distinction des routes publiques vs protégées selon `API_CONTRACT.md`.

### Prompt principal
> *"Mission 0 — Cartographier l’application. Sans modifier le code au début, retrouver : le composant racine, la configuration des routes, l’enregistrement de HttpClient, les modèles, services et pages, le mécanisme qui ajoute le JWT aux requêtes protégées. Produire un schéma annoté du flux lors d’un clic sur « Se connecter ». Ouvrir API_CONTRACT.md et distinguer les routes publiques des routes protégées."*

### Réponses aux questions de la Mission 0

#### 1. Le composant racine
- **Fichier** : `frontend-starter/src/app/components/app/app.ts` (`AppComponent`, sélecteur `<app-root>`).
- **Rôle** : Point d'entrée de l'interface qui contient la barre de navigation et le `<router-outlet />`. Il est instancié au bootstrap dans `src/main.ts`.

#### 2. La configuration des routes
- **Fichier** : `frontend-starter/src/app/routes.ts` :
  - `''` : Redirige vers `/tracks`
  - `'login'` : `LoginPageComponent` (public)
  - `'register'` : `RegisterPageComponent` (public)
  - `'profile'` : `ProfilePageComponent` (protégé par `authGuard`)
  - `'tracks'` : `TracksPageComponent` (protégé par `authGuard`)
  - `'**'` : Redirige vers `/tracks`

#### 3. L'enregistrement de `HttpClient`
- **Fichier** : `frontend-starter/src/main.ts` :
  ```typescript
  provideHttpClient(withInterceptors([authInterceptor]))
  ```
  Enregistré au bootstrap de l'application avec l'intercepteur fonctionnel `authInterceptor`.

#### 4. Les modèles, services et pages
- **Modèles** (`src/app/shared/models/`) : `User` (`user.model.ts`), `AuthResponse` (`auth-response.model.ts`), `Track` (`track.model.ts`), `Page<T>` (`page.model.ts`), et les types d'auth (`auth.models.ts`).
- **Services** (`src/app/shared/services/`) :
  - `AuthService` : gestion de l'état d'authentification (Signals `token`, `currentUser`, `authStatus`) et des appels auth/profil.
  - `TrackService` : gestion de la liste paginée des morceaux et de l'upload audio (`FormData`).
- **Pages / Composants** (`src/app/components/`) : `AppComponent`, `LoginPageComponent`, `RegisterPageComponent`, `ProfilePageComponent`, `TracksPageComponent`.

#### 5. Le mécanisme qui ajoute le JWT aux requêtes protégées
- **Fichier** : `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`.
- **Fonctionnement** : Intercepteur fonctionnel qui injecte le token stocké dans l'en-tête HTTP `Authorization: Bearer <token>` sur les requêtes protégées via `request.clone(...)`.

#### 6. Schéma annoté du flux lors d'un clic sur « Se connecter »
```text
Utilisateur
   │
   │ (1) Clic "Se connecter"
   ▼
LoginPageComponent ──(2) authService.login(email, pwd)──► AuthService
                                                              │
                                                              │ (3) POST /api/auth/login
                                                              ▼
                                                        Backend Express (:3000)
                                                              │
                                                              │ (4) Recherche & vérif bcrypt
                                                              ▼
                                                         MongoDB Atlas
                                                              │
                                                              │ (5) 200 OK { token, user }
                                                              ▼
                                                         AuthService
                                                              │ (6) Stocke token dans localStorage
                                                              │     Met à jour Signals token & currentUser
                                                              ▼
LoginPageComponent ◄──────────────────────────────────────────┘
   │
   │ (7) Succès -> router.navigateByUrl('/tracks')
   ▼
TracksPageComponent (authGuard valide la présence du token)
```

#### 7. Distinction des routes publiques vs protégées (`API_CONTRACT.md`)
- **Routes publiques** (sans token) :
  - `GET /api/health` : Contrôle de disponibilité du backend.
  - `POST /api/auth/register` : Inscription d'un nouvel utilisateur.
  - `POST /api/auth/login` : Connexion et récupération du JWT initial.
- **Routes protégées** (en-tête `Authorization: Bearer <token>` obligatoire) :
  - `GET /api/users/me` : Lecture du profil utilisateur connecté.
  - `PUT /api/users/me` : Modification du nom de l'utilisateur connecté.
  - `GET /api/tracks?page=1&limit=5` : Liste paginée des pistes appartenant à l'utilisateur.
  - `POST /api/tracks` : Téléversement d'un morceau audio (`multipart/form-data`).
  - `GET /api/tracks/:id/audio` : Streaming du fichier audio physique.
  - `DELETE /api/tracks/:id` : Suppression d'une piste.

---

## 2. Mission 1 — Inscription, Connexion et Profil

### Objectif
Développer et fiabiliser la couche d'authentification et de gestion de profil du frontend :
- Formulaires réactifs avec validation stricte (nom $\ge$ 2 car., email valide, mot de passe $\ge$ 8 car.) et messages d'erreurs accessibles.
- Gestion d'état réactive via **Signals** Angular 22 dans `AuthService` (`currentUser`, `token`, `authStatus`).
- Sauvegarde sécurisée du token dans `localStorage` sans aucune fuite dans la console (`console.log(token)` proscrit).
- Intercepteur HTTP gérant l'injection du header `Authorization: Bearer <token>` et le traitement idempotent des erreurs 401.
- Page de profil avec auto-chargement, modification réactive du nom et désactivation intelligente du bouton si inchangé.
- Couverture complète par tests unitaires automatisés (Vitest).

### Réponses aux Questions de la Mission 1 posées dans le sujet

#### Q1 : Quel modèle utilisez-vous dans votre assistant IA ?
> **Réponse :** Nous utilisons **Gemini 3.8 Flash** de Google (avec un niveau de raisonnement élevé / *High Reasoning*) via l'environnement Antigravity. Pour la phase de supervision technique, nous avons également sollicité **OpenAI ChatGPT-5.6-sol** pour relire et valider l'architecture avant implémentation.

#### Q2 : Comment savoir combien vous avez consommé de tokens ?
> **Réponse :** 
> 1. Dans l'interface de l'assistant (barre d'état ou panneau de chat) où un compteur indique le contexte actuel et l'utilisation globale.
> 2. Dans les fichiers journaux locaux de session (`transcript.jsonl` sous `.gemini/.../logs/`) qui enregistrent le décompte exact des tokens d'entrée (*prompt tokens*) et de sortie (*completion tokens*) de chaque requête.

#### Q3 : Qui peut vous conseiller quel est le meilleur modèle pour une tâche donnée ?
> **Réponse :**
> - Les plateformes de benchmark indépendantes comme **LMSYS Chatbot Arena** ou **SWE-bench** (spécifique aux tâches de génie logiciel).
> - La documentation technique officielle des fournisseurs (Google DeepMind, Anthropic, OpenAI).
> - La règle d'architecture logicielle : privilégier les modèles compacts et rapides (Flash, Haiku) pour les tâches courantes, explicatives ou de génération de boilerplate, et réserver les modèles à très fort raisonnement (Gemini Pro, Claude Sonnet/Opus, GPT-5.6-sol) pour la conception d'architecture, le refactoring complexe et le débogage critique.

#### Q4 : Quelles sont les différentes routes du backend qui sont utilisées pour la Mission 1 ?
> **Réponse :**
> 1. `POST /api/auth/register` : Création de compte utilisateur (corps `{ name, email, password }`, mot de passe $\ge$ 8 caractères requis).
> 2. `POST /api/auth/login` : Connexion (corps `{ email, password }`, renvoie `{ token, user }`).
> 3. `GET /api/users/me` : Récupération du profil de l'utilisateur connecté via son jeton Bearer JWT.
> 4. `PUT /api/users/me` : Mise à jour du nom de l'utilisateur (corps `{ name }`, protégé par Bearer JWT).

#### Q5 : Où s'effectue la tâche « mise à jour du profil utilisateur », dans quels fichiers côté back et côté front ?
> **Réponse :**
> - **Côté Front :**
>   - `frontend-starter/src/app/components/profile-page/profile-page.ts` : La méthode `save()` lit la valeur du champ `name` du formulaire réactif et déclenche l'appel `this.auth.update(newName)`.
>   - `frontend-starter/src/app/shared/services/auth.service.ts` : La méthode `update(name)` effectue l'appel HTTP `this.http.put<User>('/api/users/me', { name: name.trim() })` et met à jour le Signal réactif `this.currentUser.set(user)`.
>   - `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` : Injecte automatiquement l'en-tête `Authorization: Bearer <token>` sur la requête PUT sortante.
> - **Côté Back :**
>   - `backend/src/app.js` (lignes 249-268) : La route `app.put("/api/users/me", auth, ...)` vérifie le token via le middleware `auth`, extrait l'identifiant utilisateur `req.auth.sub` et met à jour la base avec `User.findByIdAndUpdate(req.auth.sub, { $set: { name: req.body?.name } }, { new: true, runValidators: true })`.
>   - `backend/src/models/User.js` : Le schéma Mongoose valide les contraintes sur le champ `name` (longueur, non-vide) et la méthode `toPublic()` assainit l'objet retourné.

---

### Plan proposé par l'agent & Validation par le Superviseur
1. **Conception initiale** : proposition architecturale rédigée dans `docs/supervision/`.
2. **Revue critique par ChatGPT (Superviseur)** : ChatGPT a émis un **GO technique conditionnel** en exigeant :
   - Un état explicite `AuthStatus = 'loading' | 'authenticated' | 'anonymous'` pour éviter les états furtifs ou faux déconnectés.
   - Le découplage strict de `clearSession()` (nettoyage pur) et `logout()` (nettoyage + redirection).
   - L'interdiction d'ajouter le token sur les endpoints publics (`/api/auth/login`, `/api/auth/register`, `/api/health`).
   - L'interdiction de rediriger vers `/login` si l'erreur 401 provient du formulaire de connexion lui-même.
   - L'ajout d'un signal `submitting` et la méthode `markAllAsTouched()` sur tous les formulaires.
   - Des tests unitaires exhaustifs (cas nominaux, erreurs 400, 401, 409, pannes réseau).

### Erreurs corrigées et propositions rejetées
- **Rejet de l'auto-hydratation dans le constructeur de service** : rejeté par ChatGPT car cela provoquait des appels HTTP incontrôlés lors de l'instanciation du service dans les tests unitaires isolés. Remplacé par une méthode d'initialisation contrôlée `initializeSession()` invoquée explicitement au démarrage dans `AppComponent.ngOnInit()`.
- **Rejet de la redirection brute dans l'intercepteur** : remplacé par `authService.handleUnauthorized()` qui vérifie l'URL courante et n'intervient jamais sur les routes d'authentification publiques.
- **Correction du `isUnchanged` sur `ProfilePageComponent`** : initialement pensé comme un `computed()` lisant `form.controls.name.value`, cela ne se recalculait pas car les `FormControl` Angular ne sont pas des Signals par défaut. Corrigé en méthode dynamique `isUnchanged(): boolean` évaluée précisément par Angular.
- **Correction des tests de formulaires** : ajout de `provideRouter([])` dans les `TestBed` des composants utilisant la directive `RouterLink` pour satisfaire la dépendance interne à `ActivatedRoute`.

### Fichiers effectivement modifiés ou créés
- `frontend-starter/src/app/shared/models/auth.models.ts` *(Créé)* : Interfaces `AuthStatus`, `LoginRequest`, `RegisterRequest`, `UpdateProfileRequest`.
- `frontend-starter/src/app/shared/services/auth.service.ts` *(Modifié)* : Gestion des Signals, persistance `localStorage`, normalisation des emails, méthodes `clearSession()`, `logout()`, `handleUnauthorized()`, `initializeSession()`.
- `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` *(Modifié)* : Filtrage des routes publiques, injection `Bearer`, capture 401 avec `throwError`.
- `frontend-starter/src/app/components/login-page/login-page.ts` & `.html` *(Modifiés)* : Signal `submitting`, gestion fine des erreurs 401 et réseau, accessibilité ARIA.
- `frontend-starter/src/app/components/register-page/register-page.ts` & `.html` *(Modifiés)* : Validation mot de passe $\ge$ 8 caractères, gestion du statut HTTP 409.
- `frontend-starter/src/app/components/profile-page/profile-page.ts` & `.html` *(Modifiés)* : Auto-chargement `ngOnInit`, détection dynamique des modifications, feedback visuel.
- `frontend-starter/src/app/components/app/app.ts` & `.html` *(Modifiés)* : Navigation adaptative conditionnée par `auth.isAuthenticated()`, bouton de déconnexion.
- **Suites de tests unitaires Vitest créées** :
  - `src/app/shared/services/auth.service.spec.ts` (9 tests)
  - `src/app/shared/interceptors/auth.interceptor.spec.ts` (5 tests)
  - `src/app/components/login-page/login-page.spec.ts` (6 tests)
  - `src/app/components/register-page/register-page.spec.ts` (6 tests)
  - `src/app/components/profile-page/profile-page.spec.ts` (7 tests)
- `docs/supervision/` *(Créé)* : Dossier d'architecture et de cadrage pour la supervision externe.

---

## 3. Preuves de Fonctionnement

### A. Exécution des Tests Unitaires Automatisés (Vitest)
Exécution de `npm test` dans `frontend-starter` :
```text
 RUN  v4.1.11 C:/Users/.../frontend-starter

 ✓  gpc  src/app/shared/interceptors/auth.interceptor.spec.ts (5 tests) 64ms
 ✓  gpc  src/app/shared/services/auth.service.spec.ts (9 tests) 87ms
 ✓  gpc  src/app/components/login-page/login-page.spec.ts (6 tests) 171ms
 ✓  gpc  src/app/components/profile-page/profile-page.spec.ts (7 tests) 164ms
 ✓  gpc  src/app/components/register-page/register-page.spec.ts (6 tests) 180ms

 Test Files  5 passed (5)
      Tests  33 passed (33)
   Duration  3.39s
```
**Résultat : 33/33 tests réussis avec succès.**

### B. Validation du Build de Production
Exécution de `npm run build` :
```text
Application bundle generation complete. [3.479 seconds]
Output location: frontend-starter/dist/gpc
```
**Résultat : Compilation sans avertissement ni erreur.**

### C. Preuves Réseau (Onglet Network du Navigateur)

Les captures d'écran suivantes ont été réalisées dans les outils de développement (F12, onglet Réseau) et sont enregistrées dans `docs/screenshots/` :

1. **Connexion réussie (`POST /api/auth/login`)** :
   - Requête : `POST http://localhost:4200/api/auth/login`
   - Corps envoyé : `{"email":"demo@example.com","password":"Demo1234!"}`
   - Statut HTTP : `200 OK`
   - Réponse reçue : `{"token":"...","user":{"id":"...","name":"Demo","email":"demo@example.com",...}}`
   - *Captures associées :*
     - [docs/screenshots/Capture d'écran 2026-09-17 185749.png](docs/screenshots/Capture%20d'%C3%A9cran%202026-09-17%20185749.png)
     - [docs/screenshots/Capture d'écran 2026-09-17 185818.png](docs/screenshots/Capture%20d'%C3%A9cran%202026-09-17%20185818.png)

2. **Connexion refusée (`POST /api/auth/login`)** :
   - Requête : `POST http://localhost:4200/api/auth/login`
   - Corps envoyé : `{"email":"demo@example.com","password":"WrongPassword"}`
   - Statut HTTP : `401 Unauthorized`
   - Réponse : `{"message":"Identifiants incorrects"}`
   - Comportement UI : Affichage du message d'erreur sans redirection intempestive.
   - *Captures associées :*
     - [docs/screenshots/Capture d'écran 2026-09-17 185918.png](docs/screenshots/Capture%20d'%C3%A9cran%202026-09-17%20185918.png)
     - [docs/screenshots/Capture d'écran 2026-09-17 185942.png](docs/screenshots/Capture%20d'%C3%A9cran%202026-09-17%20185942.png)

3. **Consultation et modification du profil (`GET` et `PUT /api/users/me`)** :
   - Requête de lecture : `GET /api/users/me` avec en-tête `Authorization: Bearer <token>` $\rightarrow$ Statut `200 OK`.
   - Requête d'écriture : `PUT /api/users/me` avec corps `{"name":"Nouveau Nom"}` et `Authorization: Bearer <token>` $\rightarrow$ Statut `200 OK`.
   - *Captures associées :*
     - [docs/screenshots/Capture d'écran 2026-09-17 185957.png](docs/screenshots/Capture%20d'%C3%A9cran%202026-09-17%20185957.png)
     - [docs/screenshots/Capture d'écran 2026-09-17 190001.png](docs/screenshots/Capture%20d'%C3%A9cran%202026-09-17%20190001.png)

---

## 4. Bilan Conceptuel : Signal vs `localStorage`

| Critère | Signal Angular | `localStorage` |
|---|---|---|
| **Nature** | Primitif réactif en mémoire JavaScript (RAM). | Mécanisme de stockage persistant sur le disque du navigateur. |
| **Durée de vie** | Éphémère : réinitialisé à chaque rechargement de page ou fermeture d'onglet. | Persistant : survit au rechargement de la page (F5) et à la fermeture du navigateur. |
| **Réactivité** | **Oui** : déclenche automatiquement la mise à jour fine des templates et des `computed()` lors d'un changement de valeur. | **Non** : passif, ne notifie pas l'interface graphique en cas de modification. |
| **Accès & Performance** | Synchrone, ultra-rapide en mémoire vive. | Synchrone avec I/O disque (bloquant si abusif), limité aux chaînes de caractères (`string`). |
| **Cas d'usage dans le TP** | Stocker l'utilisateur actif (`currentUser()`) et le statut d'authentification (`authStatus()`) pour animer dynamiquement la barre de navigation et les vues. | Mémoriser la chaîne brute du jeton JWT (`gpc_token`) pour permettre la restauration automatique de session au rechargement. |

---

## 5. Ce que chaque membre sait expliquer sans l'agent

1. **Le fonctionnement de l'intercepteur HTTP** :
   - Comment `authInterceptor` intercepte les requêtes sortantes pour leur injecter l'en-tête `Authorization: Bearer <token>` sans modifier la requête d'origine (via `request.clone()`).
   - Comment il capture les erreurs HTTP 401 via l'opérateur RxJS `catchError` pour déconnecter automatiquement l'utilisateur si son token a expiré.
2. **L'architecture de sécurité JWT** :
   - Pourquoi le token est stocké dans `localStorage` plutôt que dans le code source ou un `state` volatile.
   - Pourquoi il ne faut jamais journaliser (`console.log`) le JWT (risque d'exfiltration en cas de log partagé).
   - Comment le backend vérifie la signature avec `jwt.verify(token, SECRET)` avant de laisser accéder aux routes protégées.
3. **La séparation des responsabilités (SoC)** :
   - Le composant gère la vue et les interactions de formulaire.
   - Le service `AuthService` encapsule les règles métier, les signaux d'état et les requêtes HTTP.
   - Le backend reste la seule autorité pour la sécurité, le hachage des mots de passe (bcrypt) et la validation des données persistées.
