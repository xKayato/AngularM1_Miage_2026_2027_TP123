# Spécifications & Proposition d'Implémentation — Mission 1 : Auth & Profil

Ce document détaille les exigences fonctionnelles et techniques de la **Mission 1 (Inscription, Connexion et Profil)** ainsi que la proposition d'implémentation soumise à la supervision technique.

---

## 1. Cahier des Charges de la Mission 1 (Extrait du Sujet TP1)

1. Formulaires réactifs pour l’inscription et la connexion.
2. Validations et messages d’erreur compréhensibles côté utilisateur.
3. Appels des routes `/api/auth/register` et `/api/auth/login`.
4. Sauvegarde du JWT côté navigateur (`localStorage`), sans jamais l’afficher dans les logs (`console.log(token)` proscrit).
5. Mise à jour du Signal `currentUser` dans `AuthService`.
6. Redirection automatique après une connexion ou une inscription réussie.
7. Bouton de déconnexion avec nettoyage complet de l’état local (`localStorage` + Signals).
8. Chargement de `/api/users/me` lorsque le profil est demandé.
9. Modification du nom avec `PUT /api/users/me`.
10. Gestion d’un `401 Unauthorized`, avec retour immédiat vers `/login` si le token est invalide ou expiré.
11. Règle d'architecture : Le composant ne doit pas appeler directement `HttpClient` : il passe impérativement par `AuthService` avec `inject()`.

---

## 2. Réponses aux Questions Pédagogiques de la Séance

### Question 1 : Modèle IA et Métriques
- **Modèle employé** : Gemini 3.8 Flash (High Reasoning).
- **Consommation de tokens** : Suivie via les compteurs d'IDE et les fichiers de log `transcript.jsonl` consignant les tokens d'entrée et de sortie.
- **Sélection du modèle** : Choix basé sur les benchmarks publics (LMSYS Chatbot Arena) et la typologie des tâches (modèles rapides pour l'assistance courante, modèles à fort raisonnement pour l'architecture et les tests).

### Question 2 : Routes Backend Utilisées
- `POST /api/auth/register` : Création de compte (public).
- `POST /api/auth/login` : Authentification et obtention du token JWT (public).
- `GET /api/users/me` : Récupération du profil utilisateur (protégé).
- `PUT /api/users/me` : Modification du nom utilisateur (protégé).

### Question 3 : Localisation de la tâche « Mise à jour du profil utilisateur »
- **Côté Front** :
  - `src/app/components/profile-page/profile-page.ts` : méthode `save()` lisant la valeur du formulaire réactif et appelant `this.auth.update(...)`.
  - `src/app/shared/services/auth.service.ts` : méthode `update(name)` déclenchant l'appel HTTP `PUT /api/users/me` et assignant `this.currentUser.set(user)`.
  - `src/app/shared/interceptors/auth.interceptor.ts` : greffe du header `Authorization: Bearer <token>`.
- **Côté Back** :
  - `backend/src/app.js` (lignes 249-268) : Route `app.put("/api/users/me", auth, ...)` validant le JWT, ciblant l'utilisateur via `req.auth.sub` et modifiant le document dans MongoDB via `User.findByIdAndUpdate`.
  - `backend/src/models/User.js` : Schéma Mongoose validant la longueur et le format du champ `name`.

---

## 3. Proposition d'Implémentation Détaillée

```
┌─────────────────────────────────────────────────────────────┐
│                       INTERFACE UTILISATEUR                 │
│  - App (Navbar réactive : Profil/Déconnexion vs Connexion)  │
│  - LoginPage (Formulaire + validations + messages d'erreur) │
│  - RegisterPage (Formulaire + mdp >= 8 car. + messages)     │
│  - ProfilePage (Auto-chargement + modification nom + alert) │
└───────────────┬─────────────────────────────┬───────────────┘
                │ inject(AuthService)         │ inject(Router)
                ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    AuthService (Singleton)                  │
│  - Signals réactifs : currentUser() & token()               │
│  - localStorage : sauvegarde / nettoyage 'gpc_token'        │
│  - Méthodes : login(), register(), profile(), update(),      │
│               logout()                                      │
└──────────────────────────────┬──────────────────────────────┘
                               │ inject(HttpClient)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Intercepteur HTTP (authInterceptor)           │
│  - Injecte Authorization: Bearer <token>                    │
│  - Intercepte les erreurs 401 -> logout() + redirect /login │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / Proxy
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API REST Express                 │
└─────────────────────────────────────────────────────────────┘
```

### Module 1 : `AuthService` (`src/app/shared/services/auth.service.ts`)
- **Signals réactifs** :
  - `token = signal<string | null>(localStorage.getItem('gpc_token'))`
  - `currentUser = signal<User | null>(null)`
- **Auto-hydratation** : Si `token()` est non nul au démarrage, exécution automatique de `profile()` pour restaurer `currentUser` sans réclamer une nouvelle connexion lors d'un rechargement de page (F5).
- **Sécurité** : Suppression absolue de tout `console.log(token)`.
- **Déconnexion (`logout`)** :
  - `localStorage.removeItem('gpc_token')`
  - `this.token.set(null)`
  - `this.currentUser.set(null)`
  - Redirection vers `/login`.

### Module 2 : `authInterceptor` (`src/app/shared/interceptors/auth.interceptor.ts`)
- **Injection du jeton** : Si `authService.token()` existe, clonage de la requête avec l'en-tête `Authorization: Bearer <token>`.
- **Gestion des erreurs 401** :
  - Utilisation de l'opérateur RxJS `catchError`.
  - Si `error.status === 401` : appel immédiat de `authService.logout()`.

### Module 3 : `LoginPageComponent` (`src/app/components/login-page/`)
- **Formulaire réactif** :
  - `email` : requis + format email valide.
  - `password` : requis.
- **UX & Retours** :
  - Messages d'erreur contextuels sous chaque input si `touched && invalid`.
  - Affichage clair de l'erreur serveur (ex: 401 "Identifiants incorrects").
  - Désactivation du bouton de soumission si le formulaire est invalide.
- **Redirection** : Vers `/tracks` dès succès.

### Module 4 : `RegisterPageComponent` (`src/app/components/register-page/`)
- **Formulaire réactif** :
  - `name` : requis (au moins 2 caractères).
  - `email` : requis + format email.
  - `password` : requis + **au moins 8 caractères** (`Validators.minLength(8)` pour alignement strict avec la règle du backend).
- **UX & Retours** :
  - Messages d'erreur explicites sous les champs.
  - Prise en compte de l'erreur 409 (Email déjà existant).
- **Redirection** : Vers `/tracks` après inscription réussie.

### Module 5 : `ProfilePageComponent` (`src/app/components/profile-page/`)
- **Cycle de vie** : Chargement automatique du profil à l'initialisation (`ngOnInit`) si `currentUser()` n'est pas encore présent.
- **Formulaire réactif** : Initialisé avec `user.name`.
- **Modification** :
  - Appel de `auth.update(name)`.
  - Feedback visuel de succès ou d'échec.
  - Bouton désactivé si le nom est identique à la valeur actuelle.

### Module 6 : Navigation globale (`AppComponent` & `app.html`)
- Utilisation des Signals avec le contrôle `@if` natif :
  - **Connecté** : Liens `Backing tracks`, `Mon profil (Nom)`, et bouton d'action `Déconnexion`.
  - **Déconnecté** : Liens `Connexion` et `Créer un compte`.

---

## 4. Stratégie de Tests Unitaires (Vitest & Angular TestBed)

Pour chaque brique, des tests automatisés seront écrits :

1. **`auth.service.spec.ts`** :
   - Persistance du token dans `localStorage` après `login()`.
   - Nettoyage du `localStorage` et remise à zéro des signals lors du `logout()`.
   - Mise à jour du Signal `currentUser` lors d'un appel réussi à `update()`.

2. **`auth.interceptor.spec.ts`** :
   - Vérification de la présence de l'en-tête `Authorization: Bearer <token>` sur une requête protégée.
   - Vérification de l'absence de l'en-tête lorsque le token est nul.
   - Interception d'un statut HTTP 401 déclenchant la déconnexion et la redirection vers `/login`.

3. **`login-page.spec.ts`** :
   - Contrôle de la validité du formulaire réactif.
   - Déclenchement de `auth.login()` et redirection vers `/tracks`.
   - Affichage du message d'erreur en cas d'échec HTTP 401.

4. **`register-page.spec.ts`** :
   - Rejet d'un mot de passe inférieur à 8 caractères.
   - Soumission valide appelant `auth.register()`.

5. **`profile-page.spec.ts`** :
   - Pré-remplissage du formulaire avec le profil actif.
   - Soumission de la mise à jour via `auth.update()`.
