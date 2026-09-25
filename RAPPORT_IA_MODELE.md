# Rapport d'usage de l'IA - TP1

**Binôme :** Thomas DELOUP  
**Outils IA :** Antigravity (Gemini 3.8 Flash) pour le développement, supervisé par ChatGPT-5.6-sol 

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
  - **Modèle IA et tokens :** Nous avons utilisé Gemini 3.8 Flash (suivi des tokens dans les journaux de session) et ChatGPT-5.6-sol en superviseur. Les benchmarks comme LMSYS Chatbot Arena aident à choisir le bon modèle selon la tâche.
  - **Routes backend utilisées :** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/users/me`, `PUT /api/users/me`.
  - **Tâche de mise à jour du profil :** Côté front dans `profile-page.ts` (`save()`), `auth.service.ts` (`update()`) et `auth.interceptor.ts`. Côté back dans `server/app.js` (`app.put('/api/users/me')`) et `models/User.js`.
  - **Différence entre Signal et `localStorage` :**
    - Le **Signal** est stocké en mémoire vive (RAM) par Angular. Il est réactif (il met à jour automatiquement la vue quand sa valeur change), mais il est perdu dès qu'on recharge la page (F5).
    - Le **`localStorage`** est stocké sur le disque par le navigateur. Il est persistant (il reste après rechargement ou fermeture du navigateur), mais il n'est pas réactif (il ne prévient pas Angular quand une valeur change).

---

## Mission 2 — Bibliothèque paginée

- **Objectif :** Implémenter la pagination serveur avec `TrackService.list(page, limit)`, gérer l'affichage avec des Signals et les blocs `@for`/`@empty`/`@if`, et sécuriser la navigation contre les clics rapides (anti-collision).
- **Prompt principal :** « GO Mission 2 uniquement : bibliothèque paginée. À partir du contrat et des fichiers réellement trouvés : implémente TrackService.list, type la réponse, gère la liste avec Signals, @for, @empty, @if, boutons Précédent/Suivant désactivés aux bornes, nouvelle requête à chaque page sans pagination locale, gère les changements rapides, et ajoute les tests unitaires. »
- **Plan proposé :** Vérification du contrat réel retourné par le backend (`Page<Track>` avec `items`, `page`, `limit`, `total`, `pages`), passage des query params `{ params: { page, limit } }`, stockage de l'état dans des Signals Angular, et ajout d'un contrôle de souscription `unsubscribe()` pour annuler les requêtes en vol.
- **Fichiers modifiés :**
  - `src/app/shared/services/track.service.ts` : méthode `list(page, limit)` typée avec `Observable<Page<Track>>`.
  - `src/app/components/tracks-page/tracks-page.ts` : Signals réactifs (`tracks`, `page`, `pages`, `loading`, `error`), navigation `go()`, et annulation de la souscription précédente (`loadSubscription?.unsubscribe()`).
  - `src/app/components/tracks-page/tracks-page.html` : nouveau Control Flow Angular (`@if (loading())`, `@if (error())`, boucle `@for` avec bloc `@empty`), boutons avec `[disabled]`.
  - Tests unitaires : `track.service.spec.ts` (contrôle des paramètres HTTP) et `tracks-page.spec.ts` (8 tests couvrant navigation, bornes, état vide, erreur et clics rapides).
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 44 tests sur 44 réussis (`npm test`), 0 échec.
  - **Build :** Compilation réussie sans erreur (`npm run build`).
  - **Network :** Requêtes `GET /api/tracks?page=X&limit=5` effectives à chaque changement de page, boutons désactivés aux bornes.
- **Ce qu'on sait expliquer sans l'agent :**
  - **Pagination serveur vs locale :** La pagination serveur évite de charger des centaines de morceaux en mémoire et de saturer la bande passante. Le backend découpe la requête avec `.skip()` et `.limit()`.
  - **Gestion anti-collision :** Si l'utilisateur clique rapidement sur plusieurs pages, `loadSubscription?.unsubscribe()` annule la requête en cours, et la condition `page() !== targetPage` ignore toute réponse tardive pour ne pas écraser la page courante.

---

## Mission 3 — Analyse, Upload et Lecture Audio

- **Objectif :** Analyser le mécanisme d'upload et de lecture audio sécurisée, expliciter l'architecture réseau et mémoire (Blob, ObjectURL, streaming, buffering) et préparer les améliorations du lecteur et des formulaires.
- **Prompt principal :** « Mission 3A : analyse uniquement. Ne modifie aucun fichier. Localise précisément le choix du fichier, FormData, appel upload, requête audio, Blob, createObjectURL, balise audio, révocation et intercepteur JWT. Vérifie les validations multipart backend et le service du fichier. Explique les deux flux et réponds aux questions sur mémoire, buffering et streaming. »
- **Localisation dans le code :**
  - **Choix du fichier :** `src/app/components/tracks-page/tracks-page.ts` (`choose()`) et `<input type="file" (change)="choose($event)">`.
  - **Création du FormData (`audio`, `title`) :** `src/app/shared/services/track.service.ts` (`upload()`).
  - **Appel HTTP d'upload :** `track.service.ts` (`this.http.post<Track>('/api/tracks', body)`).
  - **Requête audio authentifiée :** `track.service.ts` (`audio(id)` avec `responseType: 'blob'`).
  - **Récupération Blob et ObjectURL :** `tracks-page.ts` (`play()`), `this.audioUrl.set(URL.createObjectURL(blob))`.
  - **Affectation au lecteur :** `tracks-page.html` (`<audio [src]="audioUrl()" controls autoplay>`).
  - **Révocation de l'ancienne URL :** `tracks-page.ts` (`play()` avant nouvelle lecture et `ngOnDestroy()`).
  - **Intercepteur JWT :** `src/app/shared/interceptors/auth.interceptor.ts` (ajoute `Authorization: Bearer <token>` sur les routes non publiques).
- **Explication des deux flux :**
  - **Flux Upload :** Composant (`choose` + `upload`) → `TrackService` (construction du `FormData`) → `HttpClient` & `authInterceptor` (injection du header JWT) → Backend Express (`auth`, validation Multer 25 Mo et MIME, écriture sur disque `data/uploads/`, MongoDB `Track.create`) → Réponse HTTP 201 avec la métadonnée.
  - **Flux Lecture :** Composant (`play`) → `TrackService.audio()` → `HttpClient` & `authInterceptor` (injection du header JWT) → Backend Express (`auth`, vérification `ownerId`, `res.sendFile()`) → Réponse HTTP 200 binaire → `HttpClient` assemble le `Blob` complet en RAM → `URL.createObjectURL(blob)` → Signal `audioUrl()` → `<audio [src]>` lit le blob local.
- **Réponses aux questions du sujet (Mémoire, Buffering et Streaming) :**
  - **Pourquoi une URL directe dans `<audio src="...">` ne reçoit pas le JWT ?**  
    Les balises `<audio src="...">` déclenchent des requêtes directes gérées nativement par le navigateur, sans passer par le client HTTP d'Angular. Elles ne traversent donc pas `authInterceptor` et ne possèdent pas le header `Authorization`. Le backend renvoie alors un statut `401 Unauthorized`.
  - **Validation frontend vs backend :**  
    La validation frontend (limite de 25 Mo et format audio vérifiés avant l'envoi) évite d'envoyer inutilement de gros volumes sur le réseau et offre un retour d'erreur instantané à l'utilisateur. En revanche, elle ne remplace jamais la validation backend (Multer) car un client malveillant peut contourner l'interface (curl, Postman). La sécurité absolue incombe toujours au backend.
  - **Le backend envoie-t-il le fichier entier en mémoire ou progressivement depuis le disque ?**  
    Le backend utilise `res.sendFile()`, qui s'appuie sur `fs.createReadStream` de Node.js. Le fichier est lu par flux depuis le disque et transmis par morceaux (chunks), sans charger les 25 Mo d'un coup dans la RAM du serveur Express.
  - **Avec `HttpClient` et `responseType: "blob"`, à quel moment le composant reçoit-il le fichier ?**  
    Le composant reçoit le fichier uniquement lorsque le téléchargement est **entièrement terminé**. `HttpClient` attend la fin du flux binaire pour instancier l'objet `Blob` et notifier le callback `next(blob)`.
  - **Si la bibliothèque contient 100 morceaux, les 100 fichiers audio sont-ils chargés en mémoire dès l'affichage de la liste ?**  
    Non. La route `GET /api/tracks` ne renvoie que les métadonnées JSON paginées (titre, nom, taille, date). Aucun fichier binaire audio n'est transféré à l'affichage de la liste. Le fichier n'est téléchargé qu'à la demande lors d'un clic explicite sur le bouton de lecture d'une piste.
  - **Quelle différence y aurait-il avec 100 éléments `<audio>` utilisant directement une URL HTTP ?**  
    100 éléments `<audio src="...">` déclencheraient chacun des requêtes HTTP d'initialisation et de préchargement (`preload`), surchargeant le réseau et la mémoire du navigateur. L'utilisation d'un lecteur unique et d'un chargement à la demande est bien plus performante et sobre en ressources.
  - **Téléchargement complet d'un Blob, buffering du navigateur et streaming serveur :**  
    - *Téléchargement Blob :* Réception intégrale et synchrone du fichier complet en RAM avant de pouvoir le manipuler.  
    - *Buffering :* Le lecteur audio commence la lecture dès qu'une fraction minimale (quelques secondes) est mise en mémoire tampon.  
    - *Streaming serveur :* Le serveur transmet le fichier par petits fragments (ex: plages d'octets HTTP 206 `Range` ou flux continu HLS) sans exiger le stockage complet sur le client.
  - **Pourquoi l'URL créée par `URL.createObjectURL` doit-elle être révoquée ?**  
    Une URL `blob:` maintient une référence directe vers les données binaires en mémoire RAM. Le ramasse-miettes (Garbage Collector) ne peut pas libérer cette mémoire tant que l'URL est active. Appeler `URL.revokeObjectURL()` libère immédiatement la mémoire et évite les fuites de RAM lors de l'écoute successive de plusieurs pistes.

### Suite Mission 3B — Amélioration de l'upload et validations

- **Objectif :** Valider le fichier côté client (formats autorisés, taille max 25 Mo, titre), désactiver le bouton pendant l'envoi pour éviter la double soumission, afficher les erreurs et le message de succès, vider le formulaire et recharger la première page après succès en préservant les pistes en cas d'échec.
- **Prompt principal :** « GO Mission 3B : amélioration minimale de l’upload existant. Sans réécrire le mécanisme actuel ni changer l’API : ajoute la validation frontend (titre, fichier, formats, 25 Mo), vérifie FormData (audio, title) sans Content-Type manuel, affiche erreurs compréhensibles et succès, état d’envoi avec anti-double clic, reset et rechargement page 1, préserve les pistes en cas d’erreur, et ajoute les tests unitaires. »
- **Fichiers modifiés :**
  - `src/app/components/tracks-page/tracks-page.ts` : constantes `ALLOWED_AUDIO_MIMES` et `MAX_AUDIO_FILE_SIZE` (25 Mo), signaux réactifs `uploading`, `uploadError`, `uploadSuccess`, validations préalables dans `upload()`, réinitialisation propre du formulaire et de l'élément `#fileInput`, et rechargement de la page 1 via `load()`.
  - `src/app/components/tracks-page/tracks-page.html` & `tracks-page.css` : retour visuel d'erreur (`@if (uploadError())`) et de succès (`@if (uploadSuccess())`), bouton d'envoi désactivé et libellé mis à jour pendant `uploading()`.
  - `src/app/shared/services/track.service.spec.ts` : test unitaire validant que le corps envoyé est un `FormData` avec exactement `audio` et `title`, sans `Content-Type` fixé manuellement.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : 7 nouveaux tests unitaires couvrant : fichier absent, type MIME refusé, taille > 25 Mo, titre invalide, anti-double clic pendant l'envoi, succès avec réinitialisation et rechargement, et préservation des pistes déjà affichées en cas d'erreur HTTP.
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 52 tests sur 52 réussis (`npm test`), 0 échec (dont 11 tests dédiés à l'upload et aux validations).
  - **Build :** Compilation réussie sans erreur (`npm run build`).
  - **Règle préservation :** Les pistes existantes en mémoire restent affichées si l'upload échoue.

### Suite Mission 3C — Lecteur audio et présentation (cards responsives)

- **Objectif :** Présenter les morceaux sous forme de cards responsives et accessibles avec métadonnées réelles formatées (taille en Ko/Mo, format audio, date d'ajout), afficher le morceau en cours d'écoute, gérer les erreurs de lecture, révoquer les ObjectURL au bon moment (au changement de morceau et à la destruction) et s'assurer que le téléchargement passe par `HttpClient` avec JWT sans URL directe dans `<audio src>`.
- **Prompt principal :** « GO Mission 3C : lecteur audio et présentation. Conserve la lecture authentifiée existante : cards responsives et accessibles avec métadonnées disponibles, morceau en cours de lecture, erreur audio compréhensible, révocation de l'ancienne ObjectURL au changement et à la destruction, vérification du passage par HttpClient avec JWT sans URL protégée dans src, et tests unitaires complets. »
- **Fichiers modifiés :**
  - `src/app/components/tracks-page/tracks-page.ts` : signaux réactifs `currentTrack`, `audioLoading`, `audioError`, méthodes de formatage des métadonnées réelles (`formatSize`, `formatMime`, `formatDate`), annulation de requête audio précédente (`playSubscription`), révocation de l'ancienne ObjectURL dans `play()` et nettoyage final dans `ngOnDestroy()`.
  - `src/app/components/tracks-page/tracks-page.html` : cards sémantiques et accessibles (`<article class="track-card">`, badge "En écoute", attributs `aria-label`), panneau dédié au lecteur audio avec affichage du titre et du nom de fichier original, et alertes de chargement / erreur audio.
  - `src/app/components/tracks-page/tracks-page.css` : mise en page responsive des cards et du lecteur audio.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : 5 tests unitaires vérifiant le flux complet de lecture, l'erreur 404/500, la révocation de l'URL précédente lors d'un changement de piste, la révocation finale à la destruction du composant, et les fonctions de formatage.
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 57 tests sur 57 réussis (`npm test`), 0 échec.
  - **Build :** Compilation réussie sans erreur (`npm run build`).
  - **Contrôle Network & sécurité :** L'élément `<audio [src]>` consomme une URL mémoire locale `blob:http://localhost:4200/...` obtenue après l'appel `HttpClient` injectant le JWT. L'URL protégée `/api/tracks/:id/audio` n'est jamais exposée directement dans le DOM.

### Option avancée — Angular Material Paginator sur la bibliothèque de pistes

- **Objectif :** Intégrer le composant `MatPaginator` d'Angular Material sur la bibliothèque de pistes en remplacement des boutons précédents/suivants manuels, en conservant strictement la pagination serveur et le contrat d'API réel.
- **Audit du contrat backend et versions :**
  - **Versions :** Angular v22.1.0. Dépendances compatibles installées : `@angular/material@^22.1.0` et `@angular/cdk@^22.1.0`. Thème Azure Blue importé dans `src/styles.css`.
  - **Audit de la réponse `GET /api/tracks` :** Le backend Express (`backend/src/app.js` lignes 285-315) effectue un comptage MongoDB `Track.countDocuments(filter)` et retourne `{ items, page, limit, total, pages }`. Le champ `total` est donc fourni nativement et honnêtement par l'API backend, ce qui permet de renseigner directement la propriété `[length]="total()"` sans aucune fabrication de valeur fictive ni modification du contrat backend.
- **Prompt principal :** « Implémente l’option avancée Angular Material Paginator sur la bibliothèque de pistes. Vérifie les versions Angular/Material, examine la réponse réelle de GET /api/tracks pour length, remplace les boutons par MatPaginator sans casser la pagination serveur, convertis pageIndex (0-indexé) vers page API (1-indexé), reviens à la première page au changement de pageSize, préserve loading/erreur/liste vide, traduis en français, teste les changements et bornes, et termine par la vérification Network. »
- **Fichiers modifiés :**
  - `frontend-starter/package.json` : installation de `@angular/material` et `@angular/cdk` v22.1.0.
  - `frontend-starter/src/styles.css` : inclusion du thème préconstruit Angular Material (`@import '@angular/material/prebuilt-themes/azure-blue.css'`).
  - `src/app/components/tracks-page/tracks-page.ts` : import de `MatPaginator`, `MatPaginatorIntl`, `PageEvent`. Implémentation du service de localisation français `getFrenchPaginatorIntl()` (`Pistes par page :`, `Page suivante`, `getRangeLabel`), et gestionnaire `onPageChange(event)` avec conversion d'indice (`page = event.pageIndex + 1`) et retour à la page 1 lors d'un changement de taille de page (`pageSize`).
  - `src/app/components/tracks-page/tracks-page.html` : remplacement de `<div class="pager">` par `<mat-paginator>` avec `[length]="total()"`, `[pageSize]="limit()"`, `[pageIndex]="page() - 1"`, `[pageSizeOptions]="[5, 10, 20]"`, `[disabled]="loading()"` et `aria-label="Sélectionner la page de la bibliothèque"`.
  - `src/app/components/tracks-page/tracks-page.css` : style personnalisé du conteneur `.tracks-paginator` garantissant une cohérence visuelle avec le thème sombre de l'application.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : mise à jour des tests d'état avec le comportement Material MDC (`aria-disabled`) et ajout d'un bloc de tests dédié (conversion d'index 0 → 1, reset page 1 sur modification de `pageSize`, libellés français, calcul de plage, attribut d'accessibilité).
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 61 tests sur 61 passants avec succès (`npm test`), 0 échec (dont 24 tests dans `tracks-page.spec.ts`).
  - **Build de production :** `npm run build` exécuté avec succès sans avertissement (bundle initial : 571.36 kB).
- **Ce qu'on sait expliquer sans l'agent :**
  - **Conversion d'index :** Material utilise un `pageIndex` basé sur 0 (première page = 0), tandis que l'API REST utilise un paramètre `page` basé sur 1 (première page = 1). La formule de transition est `page = event.pageIndex + 1` et à l'affichage `pageIndex = page() - 1`.
  - **Changement de `pageSize` :** Lorsqu'un utilisateur passe par exemple de 5 à 10 ou 20 éléments par page, l'index de page actuel perd sa cohérence avec la pagination précédente. Le composant réinitialise donc la page à 1 (`this.page.set(1)`) et transmet la nouvelle limite (`this.limit.set(event.pageSize)`) au backend pour recharger un jeu cohérent de données.
  - **Conservation de la pagination serveur :** Chaque événement `(page)` déclenche un appel HTTP `GET /api/tracks?page=X&limit=Y`. Aucune découpe locale de tableau (`items.slice()`) n'est effectuée : le serveur reste la source unique de vérité et ne transfère que les 5, 10 ou 20 éléments demandés.

### Option avancée — Barre de progression d'upload

- **Objectif :** Ajouter une barre de progression en temps réel à l'upload existant sans modifier le contrat multipart (`audio` et `title`), en distinguant rigoureusement les octets transmis sur le réseau du traitement serveur final.
- **Audit préalable de la configuration HTTP :**
  - **Configuration globale (`main.ts`) :** `provideHttpClient` utilise `HttpXhrBackend` (XMLHttpRequest) sans `withFetch()`. Les événements de progression d'envoi (`xhr.upload.onprogress`) sont donc nativement pris en charge par le navigateur. `authInterceptor` transmet l'intégralité du flux sans bloquer les `HttpEvent`.
  - **Méthode `TrackService.upload()` initiale :** L'appel initial `this.http.post()` n'activait ni `reportProgress` (vaut `false` par défaut) ni `observe: 'events'` (vaut `'body'` par défaut), rendant impossible l'obtention d'événements de progression.
  - **Évolution minimale appliquée :** Ajout des options `{ reportProgress: true, observe: 'events' }` et typage de retour `Observable<HttpEvent<Track>>`.
- **Prompt principal :** « Ajoute une barre de progression à l’upload existant, sans réécrire le formulaire ni changer les champs multipart audio et title. Inspecte d’abord HttpClient et TrackService.upload(). Distingue clairement « octets envoyés » et « traitement terminé par le serveur » : ne présente pas 100 % d’envoi comme une réussite tant que la réponse HTTP de succès n’est pas reçue. Si le total n’est pas disponible, affiche un état indéterminé. Préserve validations, anti-double clic, erreurs, succès et retour page 1. »
- **Fichiers modifiés :**
  - `src/app/shared/services/track.service.ts` : activation de `{ reportProgress: true, observe: 'events' }` sur `POST /api/tracks`.
  - `src/app/components/tracks-page/tracks-page.ts` : signaux réactifs `uploadProgress` (`number | null`) et `uploadStatusText`, écoute de `HttpEventType.UploadProgress` (calcul du pourcentage, passage au statut "Traitement par le serveur en cours…" à 100 % d'envoi sans déclarer le succès prématurément, gestion de l'état indéterminé si `event.total` est absent) et de `HttpEventType.Response` (déclaration de succès finale, reset et rechargement page 1).
  - `src/app/components/tracks-page/tracks-page.html` : conteneur de progression accessible (`role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, barre indéterminée animée si taille inconnue).
  - `src/app/components/tracks-page/tracks-page.css` : barre de progression aux couleurs de l'application avec animation `@keyframes indeterminate` pour les transferts sans total.
  - `src/app/shared/services/track.service.spec.ts` : vérification que la requête est émise avec `reportProgress: true` et que le corps final `HttpResponse` est émis.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : 4 tests dédiés (progression avec total connu et distinction 100% / réponse finale, état indéterminé si total inconnu, reset et affichage d'erreur sur échec HTTP, accessibilité et rendu DOM).
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 65 tests sur 65 passants avec succès (`npm test`), 0 échec (dont 28 tests sur `TracksPageComponent` et 4 sur `TrackService`).
  - **Build de production :** `npm run build` réussi sans aucune erreur (bundle initial : 574 kB).
- **Ce qu'on sait expliquer sans l'agent :**
  - **Pourquoi 100 % d'octets envoyés n'est pas un succès :** À 100 %, le navigateur a fini de transférer les octets sur le socket TCP, mais le serveur Express doit encore réceptionner le stream, l'écrire sur le disque (`data/uploads/`), insérer le document dans MongoDB, et renvoyer la réponse HTTP 201. Déclarer la réussite à 100 % d'envoi serait mensonger si le serveur échoue ensuite (ex: erreur 500 disque plein). La réussite n'intervient qu'à la réception de l'événement `HttpEventType.Response`.
  - **Rôle de `reportProgress: true` et `observe: 'events'` :** Par défaut, `HttpClient` se contente d'écouter la fin de la requête pour renvoyer le JSON `Track`. `reportProgress: true` branche un écouteur sur `xhr.upload.onprogress`, et `observe: 'events'` demande à `HttpClient` d'émettre chaque événement intermédiaire dans l'Observable sous forme d'`HttpEvent`.

### Option avancée — Suppression d'une piste avec confirmation (DELETE /api/tracks/:id)

- **Objectif :** Implémenter la suppression d'une piste avec confirmation explicite, stratégie pessimiste (maintien de l'affichage jusqu'à confirmation serveur), blocage anti-double clic, arrêt du lecteur si la piste supprimée est en écoute, et retour automatique à la page précédente si la suppression vide la dernière page.
- **Audit préalable du backend (`backend/src/app.js` lignes 408-439) :**
  - **Route & authentification :** `app.delete("/api/tracks/:id", auth, ...)` vérifie le JWT Bearer token et injecte `req.auth.sub`. Répond `401 Unauthorized` si non authentifié.
  - **Refus d'accès / piste d'un autre utilisateur :** Le backend effectue `Track.findOneAndDelete({ _id: id, ownerId: req.auth.sub })`. Si la piste appartient à un autre utilisateur, la clause échoue et le backend répond `404 Not Found` avec `{ message: "Piste inconnue" }` (ce qui masque l'existence de la ressource d'autrui pour des raisons de sécurité).
  - **Suppression du fichier physique :** Le backend appelle `fsPromises.unlink(audioPath)`. En cas de succès, il répond `204 No Content`. En cas d'erreur disque, il répond `500 Internal Server Error` avec `{ message: "Métadonnée supprimée, mais fichier audio non supprimé" }`.
- **Prompt principal :** « Implémente la suppression d’une piste avec confirmation via DELETE /api/tracks/:id. Vérifie route, protection, comportement pour une piste d’un autre utilisateur et suppression disque. Ajoute l'action « Supprimer » accessible, demande confirmation, bloque les doubles clics, affiche succès ou erreur, rafraîchis depuis le serveur. Si la suppression vide la dernière page, reviens à la page précédente. N'efface jamais avant confirmation serveur. Teste annulation, succès, erreur, double clic, refus d'accès et dernière page vide. »
- **Fichiers modifiés :**
  - `src/app/components/tracks-page/tracks-page.ts` : signaux `deletingTrackId`, `deleteError`, `deleteSuccess`, méthode `deleteTrack(track)` avec confirmation `window.confirm`, blocage anti-double clic, stratégie pessimiste, arrêt et révocation de l'ObjectURL si en cours de lecture, recul de page automatique (`page.set(page() - 1)`) si suppression du seul élément d'une page > 1, et rechargement serveur via `load()`.
  - `src/app/components/tracks-page/tracks-page.html` : bouton accessible « Supprimer » avec `aria-label`, état désactivé « Suppression… » pendant la requête, et alertes visuelles d'erreur et de succès.
  - `src/app/components/tracks-page/tracks-page.css` : style du bouton `.delete-btn` (contour rouge discret, survol contrasté, état disabled) et ajustement de l'espacement dans `.track-actions`.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : 8 tests unitaires couvrant l'annulation de confirmation, le succès avec stratégie pessimiste, l'anti-double clic, le refus d'accès (404), l'échec de suppression disque (500), le recul sur page précédente lors du vidage de la dernière page, l'arrêt du lecteur et nettoyage d'ObjectURL, et l'accessibilité DOM (`aria-label`).
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 73 tests sur 73 passants avec succès (`npm test`), 0 échec (dont 36 tests sur `TracksPageComponent`).
  - **Build de production :** `npm run build` réussi sans aucune erreur (bundle initial : 576.08 kB).
- **Ce qu'on sait expliquer sans l'agent :**
  - **Stratégie pessimiste vs optimiste :** En stratégie optimiste, l'élément est immédiatement retiré du tableau en mémoire avant la réponse du serveur (avec risque d'incohérence ou de devoir restaurer l'élément en cas d'erreur 404/500). En stratégie pessimiste (retenue ici), l'élément reste visible avec un indicateur d'action en cours et n'est retiré qu'après réception de la confirmation HTTP 204 du serveur, garantissant l'intégrité absolue des données affichées.
  - **Comportement sécuritaire du backend face aux pistes d'un tiers :** Le backend renvoie `404 Piste inconnue` au lieu de `403 Forbidden`. Cela empêche un utilisateur malveillant de déterminer si un identifiant d'audio existe dans la base de données d'un autre utilisateur.
  - **Gestion de la dernière page devenue vide :** Si un utilisateur se trouve sur la page 2 contenant 1 piste et la supprime, le total passe à 5 pistes (1 seule page restante). Recharger la page 2 afficherait une page vide. Le composant détecte que `tracks().length === 1 && page() > 1`, décrémente `page` vers 1, puis interroge `GET /api/tracks?page=1&limit=5`, assurant une navigation continue et fluide.

---

### Amélioration — Affichage et accessibilité des métadonnées des cards

- **Objectif :** Améliorer l'affichage des métadonnées sur les cards à partir des champs réellement renvoyés par l'API (`originalName`, `mimeType`, `size`, `createdAt`), formater la taille de façon lisible (Ko / Mo / o), afficher la date d'ajout en français (`DD/MM/YYYY`), gérer proprement les valeurs absentes ou invalides (`Taille inconnue`, `Date inconnue`, `Date invalide`, `AUDIO`), et renforcer l'accessibilité des libellés (`aria-label`, balise sémantique `<time datetime>`) sans toucher ni à l'upload ni à la lecture audio ni au contrat API.
- **Audit du contrat backend (`backend/src/models/Track.js` & `backend/src/app.js`) :**
  - Les champs effectivement persistés et projetés par `GET /api/tracks` sont : `id`, `ownerId`, `title`, `originalName`, `mimeType`, `size`, `createdAt`.
  - Aucune modification de contrat ou de schéma en base de données n'est requise ni effectuée.
- **Prompt principal :** « Améliore uniquement l’affichage des métadonnées sur les cards. À partir des champs réellement renvoyés par l’API, formate la taille du fichier de manière lisible et affiche la date d’ajout en français. Gère proprement les valeurs absentes ou invalides, sans modifier les données stockées ni le contrat API. Vérifie l’accessibilité des libellés et ajoute quelques tests de formatage et de rendu. Ne touche ni à l’upload ni à la lecture. »
- **Fichiers modifiés :**
  - `src/app/components/tracks-page/tracks-page.ts` :
    - Amélioration de `formatSize(bytes)` : gère `null`, `undefined`, les nombres négatifs et `NaN` (renvoie `'Taille inconnue'`), gère `0` (`'0 Ko'`), les octets `< 1024` (`'X o'`), les kilo-octets `< 1 048 576` (`'X Ko'`), et les méga-octets au-delà (`'X.XX Mo'`).
    - Amélioration de `formatDate(dateStr)` : gère `null`, `undefined`, les chaînes vides (renvoie `'Date inconnue'`), les dates invalides (`new Date(dateStr).getTime()` is NaN renvoie `'Date invalide'`), et formate les dates valides en français `fr-FR` au format `DD/MM/YYYY`.
    - Amélioration de `formatMime(mime)` : gère `null`, `undefined`, les chaînes vides (renvoie `'AUDIO'`), et associe les types MIME connus (`audio/mpeg` -> `MP3`, `audio/wav` -> `WAV`, `audio/ogg` -> `OGG`, `audio/mp4` / `m4a` -> `M4A`) ou extrait le sous-type en majuscules.
  - `src/app/components/tracks-page/tracks-page.html` :
    - Ajout de `aria-label="Informations sur la piste"` sur le conteneur `.track-meta`.
    - Ajout d'attributs d'accessibilité descriptifs `[attr.aria-label]` sur chaque élément de métadonnée (`Fichier d'origine : ...`, `Format audio : ...`, `Taille : ...`, `Ajoutée le : ...`).
    - Utilisation de la balise HTML5 sémantique `<time [attr.datetime]="track.createdAt">` pour la date d'ajout.
    - Ajout d'un texte de secours `Nom de fichier inconnu` si `originalName` est absent ou vide.
  - `src/app/components/tracks-page/tracks-page.spec.ts` :
    - Tests de formatage complets :
      - `formatSize` avec null, undefined, négatif, NaN, 0, octets, Ko, Mo.
      - `formatDate` avec null, undefined, vide, date invalide, date ISO valide.
      - `formatMime` avec null, undefined, vide, types audio standards et atypiques.
      - Rendu DOM et accessibilité : présence des attributs `aria-label` descriptifs, balise `<time datetime>`.
      - Rendu du libellé de secours lorsque `originalName` est vide.
- **Preuves de fonctionnement :**
  - **Tests unitaires :** 78 tests sur 78 passants avec succès (`npm test`), 0 échec (dont 41 tests sur `TracksPageComponent`).
  - **Build de production :** `npm run build` réussi sans aucune erreur (bundle initial : 576.69 kB).
- **Ce qu'on sait expliquer sans l'agent :**
  - **Gestion défensive des données (robustesse frontend) :** Les données en base ou transmises par d'anciennes versions de l'API peuvent comporter des champs non renseignés (`null`, `undefined`), des tailles corrompues ou des chaînes de dates invalides. Sans vérification préalable, `new Date("invalide").toLocaleDateString()` afficherait `Invalid Date` dans la vue, ou `(bytes / 1024).toFixed(0)` produirait `NaN Ko`. Le typage strict et les conditions de garde assurent une interface robuste sans planter le composant.
  - **Accessibilité des métadonnées (a11y) :** Les cards affichent des valeurs courtes (ex : « 3.42 Mo », « 18/09/2026 »). Pour les lecteurs d'écran (screen readers), ces valeurs sans contexte sont ambiguës. L'ajout d'`aria-label="Taille : 3.42 Mo"` et de `<time datetime="...">` permet au synthétiseur vocal d'énoncer clairement la signification du champ à l'utilisateur malvoyant, tout en préservant le design visuel compact.

---

### Option avancée — Filtre par titre compatible avec la pagination serveur

- **Objectif :** Étudier puis implémenter un filtre par titre compatible avec la pagination serveur. Vérifier si `GET /api/tracks` accepte déjà une recherche ; le cas échéant, étendre le contrat API et le backend (`title` optionnel, insensible à la casse avec protection ReDoS) au lieu de filtrer localement la page courante de façon trompeuse. Côté frontend, ajouter un champ de recherche accessible avec debounce (300 ms), gestion anti-collision et annulation des requêtes obsolètes, réinitialisation à la page 1 au changement de filtre, préservation du filtre lors des changements de page/taille via `MatPaginator`, et gestion du résultat vide.
- **Audit du contrat API existant :**
  - Route initiale : `GET /api/tracks?page=1&limit=5` sans paramètre de recherche.
  - Extension du contrat validée : `GET /api/tracks?page=1&limit=5&title=blues` (documentée dans `API_CONTRACT.md`).
- **Prompt principal :** « Étudie puis implémente un filtre par titre compatible avec la pagination serveur. Commence par vérifier si GET /api/tracks accepte déjà un paramètre de recherche. Si ce n’est pas le cas, ne filtre pas uniquement les pistes de la page courante en prétendant filtrer toute la bibliothèque. Propose d’abord la plus petite extension du contrat API et du backend, sa documentation et ses tests, puis attends mon GO. Si la recherche serveur existe ou si j’ai validé son ajout : ajoute un champ de recherche accessible, limite les requêtes déclenchées pendant la saisie, annule ou ignore les réponses obsolètes, réinitialise la pagination à la page 1 lors d’un changement de filtre et conserve le filtre quand l’utilisateur change de page. Teste les paramètres HTTP, le résultat vide et les requêtes concurrentes. »
- **Fichiers modifiés :**
  - `API_CONTRACT.md` : documentation de `GET /api/tracks?page=1&limit=5&title=blues` et impact sur `total`/`pages`.
  - `backend/src/app.js` : lecture de `req.query.title` (avec alias `query`), assainissement regex (`replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`) et application de `{ $regex: escaped, $options: "i" }` sur `Track.find` et `Track.countDocuments`.
  - `backend/test/api.test.js` : 4 tests (refus 401 sans token, filtre insensible à la casse avec token, échappement des méta-caractères Regex, non-régression sans filtre).
  - `frontend-starter/src/app/shared/services/track.service.ts` : paramètre optionnel `title` dans `list(page, limit, title?)` sérialisé dans `HttpParams`.
  - `frontend-starter/src/app/shared/services/track.service.spec.ts` : tests unitaires vérifiant la présence du paramètre `title` ou son omission si vide.
  - `frontend-starter/src/app/components/tracks-page/tracks-page.ts` :
    - `searchControl = new FormControl('', { nonNullable: true })` et signal `searchQuery`.
    - Pipeline réactif avec `debounceTime(300)` et `distinctUntilChanged()`.
    - Réinitialisation `page.set(1)` lors d'un nouveau filtre.
    - Conservation de `targetTitle` dans `load()` lors de la pagination (`onPageChange`, `go`).
    - Annulation de la souscription précédente `loadSubscription?.unsubscribe()` et double contrôle anti-collision.
    - Méthode `clearSearch()`.
  - `frontend-starter/src/app/components/tracks-page/tracks-page.html` : barre de recherche accessible (`<input type="search">`, `aria-label`, bouton d'effacement conditionnel) et message contextualisé dans `@empty`.
  - `frontend-starter/src/app/components/tracks-page/tracks-page.css` : styles pour `.search-bar`, `.search-input-wrapper`, `.clear-search-btn`, `.visually-hidden`.
  - `frontend-starter/src/app/components/tracks-page/tracks-page.spec.ts` : 6 tests unitaires complets (debounce de 300 ms, reset à la page 1, rétention du filtre au changement de page Material, message de recherche infructueuse, annulation/ignorance des réponses concurrentes obsolètes, accessibilité et bouton d'effacement).
- **Preuves de fonctionnement :**
  - **Tests unitaires Backend :** 6/6 tests réussis (`node --test` dans `backend/`).
  - **Tests unitaires Frontend :** 86/86 tests réussis (`npm test` dans `frontend-starter/`).
  - **Build de production :** Compilation réussie sans erreur (`npm run build`, bundle : 579.51 kB).
- **Ce qu'on sait expliquer sans l'agent :**
  - **Pourquoi le filtrage local sur la page courante est une faute architecturale :** Si la bibliothèque contient 50 morceaux répartis sur 10 pages et qu'on applique `.filter()` sur le tableau local de la page 1 (5 morceaux), l'utilisateur ne verra jamais les morceaux correspondants situés sur les pages 2 à 10. De plus, les compteurs de pagination (`MatPaginator`) afficheraient des métadonnées fausses. Le filtre doit impérativement interroger le backend pour compter (`countDocuments`) et découper (`skip`/`limit`) l'ensemble de la bibliothèque.
  - **Rôle du Debounce et des requêtes concurrentes :** Sans `debounceTime(300)`, taper un mot de 5 lettres déclenche 5 requêtes HTTP consécutives en quelques millisecondes, surchargeant le réseau et la base de données. L'association de `debounceTime`, de `distinctUntilChanged` et de `loadSubscription?.unsubscribe()` garantit qu'une seule requête utile part à la fin de la frappe, et qu'aucune réponse lente précédente ne peut écraser un résultat plus récent.






