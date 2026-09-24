# Rapport d'usage de l'IA - TP1

**Binôme :** Thomas DELOUP  
**Outils IA :** Antigravity (Gemini 3.8 Flash) pour le développement, supervisé par ChatGPT-4o  

---

## Mission 0 — Cartographie de l'application

- **Objectif :** Analyser le code starter sans le modifier pour comprendre l'architecture Angular 22 (composant racine, routes, HttpClient, intercepteur JWT) et vérifier le contrat d'API.
- **Prompt principal :** « Mission 0 — Cartographier l’application. Sans modifier le code au début, retrouver : le composant racine, la configuration des routes, l’enregistrement de HttpClient, les modèles, services et pages, le mécanisme qui ajoute le JWT aux requêtes protégées. Expliquer le flux de connexion et les routes de API_CONTRACT.md. »
- **Plan proposé :** L'agent a listé les fichiers clés du projet et détaillé le fonctionnement du flux de connexion et les routes publiques vs protégées.
- **Vérifications :** Nous avons contrôlé chaque fichier dans `frontend-starter/src/` et vérifié la redirection du proxy local vers le backend Express sur le port 3000.
- **Fichiers repérés :**
  - Composant racine : `src/app/components/app/app.ts` (`AppComponent`).
  - Configuration des routes : `src/app/routes.ts` (avec le guard `authGuard`).
  - Enregistrement HttpClient : `src/main.ts` avec `withInterceptors([authInterceptor])`.
  - Modèles et services : `src/app/shared/models/` et `src/app/shared/services/auth.service.ts`.
  - Intercepteur : `src/app/shared/interceptors/auth.interceptor.ts`.
- **Flux de connexion (étapes lors du clic sur « Se connecter ») :**
  1. L'utilisateur clique sur « Se connecter » sur `LoginPageComponent`.
  2. Le composant lit le formulaire réactif et appelle `authService.login(email, password)`.
  3. `HttpClient` envoie `POST /api/auth/login` au backend (port 3000).
  4. Le backend vérifie l'utilisateur en base MongoDB Atlas (comparaison du hash bcrypt) et renvoie `{ token, user }`.
  5. `AuthService` reçoit la réponse, enregistre le token dans le `localStorage` et met à jour ses Signals (`token`, `currentUser`).
  6. `LoginPageComponent` redirige vers `/tracks`, route autorisée par `authGuard`.
- **Ce qu'on sait expliquer sans l'agent :**
  - Pourquoi la base MongoDB s'appelait `test` au premier lancement : aucun nom de base n'était écrit après `.mongodb.net/` dans le fichier `.env`. MongoDB prend alors `test` par défaut.
  - La différence entre routes publiques (`/api/health`, `/api/auth/login`, `/api/auth/register`) accessibles sans token, et routes protégées (`/api/users/me`, `/api/tracks`) qui exigent le header `Authorization: Bearer <token>`.

---

## Mission 1 — Inscription, Connexion et Profil

- **Objectif :** Coder l'authentification (login, register, logout), la gestion du profil utilisateur (lecture et mise à jour du nom), la gestion de l'erreur 401, l'utilisation des Signals Angular 22 et les tests unitaires.
- **Prompt principal :** « Sans coder, propose-moi une implémentation. Après quand on codera, tu feras des tests pour chaque composant. Génère-moi un dossier de supervision pour que je le fasse valider par ChatGPT. »
- **Plan proposé et supervision :** L'agent a préparé une proposition d'architecture. Nous l'avons soumise à ChatGPT qui a donné un accord sous réserve de respecter de bonnes pratiques : état d'authentification explicite (`loading`, `authenticated`, `anonymous`), séparation nette entre `clearSession()` et `logout()`, protection contre les doubles soumissions, et absence de boucle sur les 401.
- **Erreurs et propositions rejetées :**
  - L'agent voulait lancer automatiquement `profile()` dans le constructeur de `AuthService`. Nous l'avons refusé car cela déclenchait des requêtes HTTP non désirées pendant les tests unitaires. Nous avons créé une méthode `initializeSession()` appelée proprement dans `AppComponent.ngOnInit()`.
  - L'intercepteur ne doit pas rediriger sur un 401 s'il s'agit de la route `/api/auth/login` (où un 401 signifie simplement "mauvais mot de passe").
  - L'agent avait utilisé un `computed()` pour surveiller `form.controls.name.value`, mais un `FormControl` n'est pas un Signal et ne notifiait pas le calcul. Nous l'avons remplacé par une méthode `isUnchanged()` pour activer/désactiver le bouton de sauvegarde.
- **Fichiers effectivement modifiés :**
  - `src/app/shared/models/auth.models.ts` (créé pour les types d'auth et requêtes).
  - `src/app/shared/services/auth.service.ts` (Signals réactifs, persistance localStorage, clearSession, logout).
  - `src/app/shared/interceptors/auth.interceptor.ts` (ajout du header Bearer et capture 401).
  - `src/app/components/login-page/` (formulaire réactif, messages d'erreurs, anti-double clic).
  - `src/app/components/register-page/` (validation mot de passe $\ge$ 8 caractères, gestion 409 email pris).
  - `src/app/components/profile-page/` (auto-chargement du profil, modification du nom, bouton désactivé si inchangé).
  - `src/app/components/app/` (barre de navigation dynamique et bouton de déconnexion).
  - Tests unitaires Vitest : `auth.service.spec.ts`, `auth.interceptor.spec.ts`, `login-page.spec.ts`, `register-page.spec.ts`, `profile-page.spec.ts`.
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 33 tests sur 33 réussis (`npm test`).
  - **Build :** Compilation réussie sans erreur (`npm run build`).
  - **Captures Network (disponibles dans `docs/screenshots/`) :**
    - Connexion réussie 200 OK : `Capture d'écran 2026-09-17 185749.png` et `185818.png`
    - Connexion refusée 401 : `Capture d'écran 2026-09-17 185918.png` et `185942.png`
    - Lecture et modif profil GET/PUT 200 OK : `Capture d'écran 2026-09-17 185957.png` et `190001.png`
- **Ce qu'on sait expliquer sans l'agent :**
  - **Modèle IA et tokens :** Nous avons utilisé Gemini 3.8 Flash (suivi des tokens dans les journaux de session) et ChatGPT-4o en superviseur. Les benchmarks comme LMSYS Chatbot Arena aident à choisir le bon modèle selon la tâche.
  - **Routes backend utilisées :** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/users/me`, `PUT /api/users/me`.
  - **Tâche de mise à jour du profil :** Côté front dans `profile-page.ts` (`save()`), `auth.service.ts` (`update()`) et `auth.interceptor.ts`. Côté back dans `server/app.js` (`app.put('/api/users/me')`) et `models/User.js`.
  - **Différence entre Signal et `localStorage` :**
    - Le **Signal** est stocké en mémoire vive (RAM) par Angular. Il est réactif (il met à jour automatiquement la vue quand sa valeur change), mais il est perdu dès qu'on recharge la page (F5).
    - Le **`localStorage`** est stocké sur le disque par le navigateur. Il est persistant (il reste après rechargement ou fermeture du navigateur), mais il n'est pas réactif (il ne prévient pas Angular quand une valeur change).
