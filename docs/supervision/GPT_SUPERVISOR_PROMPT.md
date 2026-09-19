# Prompt de Supervision pour ChatGPT (Complet & Autonome)

> **Mode d'emploi** : Copiez-collez l'intégralité du texte ci-dessous dans ChatGPT. Il contient toutes les informations sur l'architecture globale, les contraintes techniques, la proposition d'implémentation et la grille d'évaluation. ChatGPT disposera de 100% du contexte pour vous superviser efficacement.

---

```text
Tu es mon superviseur technique senior en développement web fullstack et architecture logicielle Angular.
Je suis étudiant en Master 1 MIAGE. Dans le cadre de mon TP noté "Guitar Practice Cloud", mon assistant de code (Antigravity) a rédigé une proposition d'implémentation pour la "Mission 1 : Inscription, Connexion et Profil".

Avant que l'assistant ne commence à coder et à écrire les tests unitaires, je te demande d'examiner attentivement l'architecture, la sécurité, la cohérence front/back et le plan de tests ci-dessous, puis de me donner tes retours critiques et ton GO technique.

================================================================================
1. VUE D'ENSEMBLE DU PROJET & ARCHITECTURE
================================================================================
- Domaine : Application de gestion et écoute de morceaux d'accompagnement (backing tracks) pour musiciens.
- Backend : API REST Node.js / Express 5 avec Mongoose 9 et MongoDB Atlas.
  * Stockage hybride : Métadonnées utilisateurs et pistes dans MongoDB Atlas ; fichiers binaires audio réels sur disque local (backend/data/uploads/).
  * Ports : Backend sur localhost:3000.
- Frontend : Single Page Application sous Angular 22.
  * Dev server sur localhost:4200.
  * Proxy dev : proxy.conf.json redirige toutes les requêtes /api vers http://localhost:3000.
  * Framework de tests : Vitest avec Angular TestBed.
- Règles d'or Angular 22 :
  * Standalone components par défaut (pas de 'standalone: true' explicite).
  * Usage exclusif de inject() (pas de constructeurs verbeux).
  * Gestion d'état via Signals (signal(), computed()).
  * Contrôle de flux natif (@if, @for, @switch - aucun *ngIf / *ngFor).
  * Pas de type 'any' (typage strict TypeScript 6).
  * Formulaires réactifs (ReactiveFormsModule).
- Règles de sécurité :
  * Hash des mots de passe avec bcryptjs côté serveur.
  * Jetons JWT (durée 2h, signé avec secret serveur).
  * Le token JWT est stocké dans le localStorage sous 'gpc_token'.
  * RÈGLE ABSOLUE : Jamais de console.log sur le token côté client ou serveur.
  * Gestion automatique des erreurs 401 : déconnexion immédiate + redirection /login.

================================================================================
2. CONTRAT D'API REST CONCERNÉ PAR LA MISSION 1
================================================================================
1. POST /api/auth/register (public)
   - Corps : { name, email, password }
   - Règle backend : mot de passe obligatoirement >= 8 caractères (sinon 400).
   - Réponse : 201 { token, user: { id, name, email, createdAt } }
   - Erreurs : 400 (validation), 409 (email déjà existant).

2. POST /api/auth/login (public)
   - Corps : { email, password }
   - Réponse : 200 { token, user: { id, name, email, createdAt } }
   - Erreurs : 401 (identifiants incorrects).

3. GET /api/users/me (protégé - Authorization: Bearer <token>)
   - Réponse : 200 User { id, name, email, createdAt }
   - Erreurs : 401 (non authentifié / token expiré), 404 (utilisateur inconnu).

4. PUT /api/users/me (protégé - Authorization: Bearer <token>)
   - Corps : { name }
   - Réponse : 200 User { id, name, email, createdAt }
   - Erreurs : 400, 401, 404.

================================================================================
3. PROPOSITION D'IMPLÉMENTATION DE L'ASSISTANT (MISSION 1)
================================================================================

A. Architecture en couches (Séparation stricte) :
   Composant -> inject(AuthService) -> inject(HttpClient) -> authInterceptor -> API REST

B. AuthService (src/app/shared/services/auth.service.ts) :
   - État réactif :
     * token = signal<string | null>(localStorage.getItem('gpc_token'))
     * currentUser = signal<User | null>(null)
   - Méthodes :
     * login(email, password) : POST /api/auth/login, tap() stocke dans localStorage et met à jour les 2 signals.
     * register(name, email, password) : POST /api/auth/register, tap() stocke et met à jour.
     * profile() : GET /api/users/me, tap() met à jour currentUser().
     * update(name) : PUT /api/users/me, tap() met à jour currentUser().
     * logout() : supprime 'gpc_token' du localStorage, remet token et currentUser à null, redirige vers /login.
   - Auto-restauration de session : au démarrage du service, si un token existe en localStorage, appel automatique de profile() pour hydrater currentUser().

C. authInterceptor (src/app/shared/interceptors/auth.interceptor.ts) :
   - HttpInterceptorFn enregistrée dans provideHttpClient(withInterceptors([authInterceptor])).
   - Cloner la requête et injecter 'Authorization: Bearer <token>' si token() est présent.
   - Utiliser catchError de RxJS : si l'erreur HTTP a le statut 401 (token expiré/falsifié), appeler authService.logout() pour nettoyer l'état et renvoyer vers /login.

D. Composants de formulaires :
   - LoginPageComponent :
     * Formulaire réactif (email valide, password requis).
     * Affichage d'erreurs ciblées sous chaque champ si touched & invalid.
     * Affichage de l'erreur API en cas d'échec 401.
     * Redirection vers /tracks après connexion réussie.
   - RegisterPageComponent :
     * Formulaire réactif (name, email valide, password avec minLength(8) strict).
     * Messages d'erreur temps réel sous chaque champ.
     * Prise en compte du 409 ("Email déjà utilisé").
     * Redirection post-inscription vers /tracks.
   - ProfilePageComponent :
     * Chargement automatique (ngOnInit) du profil si currentUser() est vide.
     * Formulaire réactif avec le champ 'name'.
     * Notification visuelle de succès ou d'échec.
     * Bouton désactivé si le nom saisi est identique à l'actuel.
   - Navigation globale (AppComponent) :
     * Barre de navigation utilisant les Signals avec @if.
     * Si connecté : Backing tracks, Mon profil (Nom), bouton Déconnexion.
     * Si déconnecté : Connexion, Créer un compte.

================================================================================
4. STRATÉGIE DE TESTS UNITAIRES (Vitest & TestBed)
================================================================================
1. auth.service.spec.ts :
   - Vérifier le stockage et le nettoyage du token dans localStorage.
   - Vérifier la mise à jour des Signals token() et currentUser().
   - Vérifier la restauration de session et le logout().
2. auth.interceptor.spec.ts :
   - Vérifier l'ajout de l'en-tête Authorization sur les requêtes protégées.
   - Vérifier l'absence d'en-tête quand token() est null.
   - Vérifier que la réception d'une erreur 401 déclenche le logout et la navigation vers /login.
3. login-page.spec.ts :
   - Validation du formulaire réactif (champs vides, format email).
   - Simulation soumission réussie -> appel de auth.login() et navigation /tracks.
   - Simulation erreur 401 -> affichage du message d'erreur.
4. register-page.spec.ts :
   - Validation du mot de passe (rejet si < 8 caractères).
   - Soumission valide -> appel de auth.register().
5. profile-page.spec.ts :
   - Hydratation initiale du formulaire avec les données de l'utilisateur.
   - Soumission valide -> appel de auth.update().

================================================================================
5. TES CONSIGNES DE SUPERVISION (EN TANT QUE SENIOR ARCHITECT)
================================================================================
1. Valides-tu cette architecture, le découpage et les choix techniques pour Angular 22 ?
2. Identifies-tu des pièges, des oublis (edge cases), des failles de sécurité ou des anti-patterns ?
3. As-tu des exigences ou des recommandations spécifiques à transmettre à l'assistant avant qu'il n'attaque le code et les tests ?
Donne-moi ton GO ou tes ajustements demandés.
```
