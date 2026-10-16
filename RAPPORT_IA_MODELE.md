# Rapport d'usage de l'IA — TP Angular (M1 MIAGE)

**Étudiant :** Thomas DELOUP (travail individuel)  
**Assistant IA principal :** Antigravity (moteur Gemini 3.8 Flash) en environnement IDE avec accès direct au workspace  
**Supervision méthodologique :** ChatGPT-5.6-sol / ChatGPT-6-sol (validation des choix d'architecture)  

---

# TP1 — Authentification et Profil

## Mission 0 — Cartographie de l'application

- **Objectif :** Cartographier l'architecture frontend/backend du projet fourni, identifier le composant racine, les routes, l'injection de `HttpClient`, le fonctionnement du proxy et distinguer les routes publiques des routes protégées par JWT sans modifier le code.
- **Prompt principal :**
  > « Mission 0 — Cartographier l’application  
  > Sans modifier le code au début, retrouver :  
  > - le composant racine ;  
  > - la configuration des routes ;  
  > - l’enregistrement de HttpClient ;  
  > - les modèles, services et pages ;  
  > - le mécanisme qui ajoute le JWT aux requêtes protégées.  
  > Produire un schéma annoté du flux lors d’un clic sur « Se connecter ». Ouvrir API_CONTRACT.md et distinguer les routes publiques des routes protégées. »
- **Plan proposé par l'agent :**
  1. Inspection de `frontend-starter/src/main.ts` et `app/routes.ts` pour identifier le bootstrap standalone et la garde `authGuard`.
  2. Traçage de `HttpClient` et analyse de l'intercepteur `auth.interceptor.ts`.
  3. Modélisation du flux de connexion `Composant → Service → HttpClient → Proxy (:3000) → Express → MongoDB`.
  4. Analyse comparative des endpoints dans `API_CONTRACT.md`.
- **Vérifications réalisées (étudiant) :**
  - Contrôle du démarrage du backend (`http://localhost:3000/api/health`) et de MongoDB Atlas.
  - Vérification du fichier `proxy.conf.json` redirigeant `/api/*` vers le port 3000.
  - Identification des routes publiques (`/health`, `/auth/login`, `/auth/register`) et protégées (`/users/me`, `/tracks`).
- **Erreurs rencontrées :**
  - Au premier lancement, la base MongoDB Atlas s'est créée avec le nom par défaut `test` car l'URI dans le fichier `.env` du backend ne spécifiait aucun nom de base après le slash (prompt associé : *« pourquoi ma base dans mon cluster mongo s'appelle test »*). J'ai corrigé manuellement l'URI dans `.env` pour cibler la base du projet.
- **Fichiers consultés (analyse pure) :**
  - `frontend-starter/src/main.ts`, `app/routes.ts`, `app/components/app/app.ts`, `app/shared/interceptors/auth.interceptor.ts`, `API_CONTRACT.md`.
- **Preuve de fonctionnement :**
  - Backend démarré, connexion vérifiée et cartographie validée.
- **Ce que je sais expliquer sans l'agent :**
  - **Flux de connexion :** Le clic déclenche `login()` dans le composant, qui appelle `AuthService.login()`, qui utilise `HttpClient.post()`. Le proxy redirige la requête vers Express sur le port 3000, qui vérifie les identifiants en base et renvoie un JWT.
  - **Routes publiques vs protégées :** Les routes d'authentification sont ouvertes ; toutes les autres exigent l'en-tête `Authorization: Bearer <token>` vérifié par le middleware Express `auth`.

---

## Mission 1 — Inscription, Connexion et Profil

- **Objectif :** Implémenter la gestion complète de session utilisateur : formulaires réactifs de connexion et d'inscription avec validation, stockage sécurisé du JWT en mémoire/localStorage, mise à jour réactive du profil via Signals, modification du nom avec `PUT /api/users/me`, et intercepteur HTTP 401.
- **Prompt principal (cadrage) :**
  > « Mission 1 — Inscription Connexion et Profil  
  > Compléter ou réécrire la partie utilisateur du frontend :  
  > - formulaires réactifs pour l’inscription et la connexion ;  
  > - validations et messages d’erreur compréhensibles ;  
  > - appels de /api/auth/register et /api/auth/login ;  
  > - sauvegarde du JWT côté navigateur, sans jamais l’afficher dans les logs ;  
  > - mise à jour du Signal currentUser ;  
  > - redirection après une connexion ou une inscription réussie ;  
  > - bouton de déconnexion avec nettoyage de l’état local ;  
  > - chargement de /api/users/me lorsque le profil est demandé ;  
  > - modification du nom avec PUT /api/users/me ;  
  > - gestion d’un 401, avec retour vers /login si le token est invalide ou expiré.  
  > Le composant ne doit pas appeler directement HttpClient : il passe par AuthService. Utiliser inject() et conserver une séparation claire entre interface, service et API.  
  > J'ai besoin de faire ça. Sans coder, proposes moi une implémentation. Après quand on codera, tu feras des tests pour chaque composants »
- **Prompt d'implémentation (supervisé par ChatGPT) :**
  > « Implémente la Mission 1 avec une gestion explicite des états loading/authenticated/anonymous, un intercepteur 401 idempotent et sans boucle, des méthodes strictement typées, des formulaires protégés contre les doubles soumissions, et des tests couvrant les succès, validations, erreurs 400/401/404/409, erreurs réseau, restauration de session et propagation des erreurs HTTP. Aucun token ne doit apparaître dans les logs, les erreurs ou les snapshots de test. »
- **Plan proposé par l'agent :**
  1. Définition des interfaces TypeScript strictes pour les requêtes et les réponses auth (`auth.models.ts`).
  2. Implémentation du service central `AuthService` piloté par des Signals (`currentUser`, `token`, `isAuthenticated`).
  3. Création de l'intercepteur HTTP fonctionnel pour ajouter le header `Authorization: Bearer <token>` et intercepter les erreurs 401.
  4. Création des pages de formulaires réactifs (`login-page`, `register-page`, `profile-page`) avec blocage anti-double clic et messages d'erreur ciblés.
  5. Rédaction d'une suite exhaustive de tests unitaires avec `provideHttpClientTesting()`.
- **Vérifications réalisées (étudiant) :**
  - Inscription d'un nouvel utilisateur et vérification de la création en base MongoDB Atlas.
  - Connexion avec le compte de démonstration (`demo@example.com` / `Demo1234!`), inspection du `localStorage` et du Signal `currentUser`.
  - Modification du nom dans le profil et vérification de la persistance après rafraîchissement.
  - Simulation d'un mot de passe incorrect et vérification de l'affichage de l'erreur 401 sans boucle de redirection.
- **Erreurs ou propositions rejetées :**
  - L'IA voulait charger automatiquement le profil dans le constructeur de `AuthService`. J'ai refusé car cela déclenchait des requêtes réseau parasites pendant les tests unitaires. J'ai créé à la place une méthode `initializeSession()` appelée explicitement dans `AppComponent.ngOnInit()`.
  - L'IA avait utilisé un `computed()` pour surveiller la valeur d'un `FormControl`. Un champ de formulaire n'étant pas un Signal, cela ne se mettait pas à jour ; j'ai corrigé avec une méthode dédiée `isUnchanged()`.
- **Fichiers modifiés :**
  - `src/app/shared/models/auth.models.ts` : interfaces pour l'utilisateur et les requêtes auth.
  - `src/app/shared/services/auth.service.ts` : gestion de session via Signals (`currentUser`, `token`), persistance `localStorage`, méthodes `login`, `register`, `logout`, `clearSession`.
  - `src/app/shared/interceptors/auth.interceptor.ts` : injection du header `Authorization` et déconnexion propre sur erreur 401 (hors route de login).
  - `src/app/components/login-page/` & `register-page/` : formulaires réactifs, validation mot de passe, messages d'erreurs, état de chargement anti-double clic.
  - `src/app/components/profile-page/` : affichage réactif, modification du nom et désactivation du bouton si le formulaire est inchangé.
  - `src/app/components/app/` : barre de navigation dynamique avec bouton de déconnexion.
  - Tests unitaires Vitest associés.
- **Preuve de fonctionnement :**
  - **Tests unitaires :** `npm test -- --watch=false` dans `frontend-starter/` (33 tests passants).
  - **Build :** `npm run build` réussi sans warning.
  - **Captures Network et visuelles :**
    - Connexion 200 OK : [`tp1_01_login_success_200.png`](docs/screenshots/tp1_01_login_success_200.png)  
      ![Connexion 200 OK](docs/screenshots/tp1_01_login_success_200.png)
    - Connexion refusée 401 : [`tp1_02_login_failure_401.png`](docs/screenshots/tp1_02_login_failure_401.png)  
      ![Connexion refusée 401](docs/screenshots/tp1_02_login_failure_401.png)
    - Récupération profil GET sous JWT : [`tp1_03_profile_get_jwt_200.png`](docs/screenshots/tp1_03_profile_get_jwt_200.png)  
      ![Profil GET sous JWT](docs/screenshots/tp1_03_profile_get_jwt_200.png)
    - Modification profil PUT (en-têtes et token) : [`tp1_04_profile_put_headers_200.png`](docs/screenshots/tp1_04_profile_put_headers_200.png)  
      ![Profil PUT en-têtes](docs/screenshots/tp1_04_profile_put_headers_200.png)
    - Modification profil PUT (payload JSON) : [`tp1_05_profile_put_payload.png`](docs/screenshots/tp1_05_profile_put_payload.png)  
      ![Profil PUT payload](docs/screenshots/tp1_05_profile_put_payload.png)
    - Modification profil PUT (réponse serveur 200) : [`tp1_06_profile_put_response.png`](docs/screenshots/tp1_06_profile_put_response.png)  
      ![Profil PUT réponse](docs/screenshots/tp1_06_profile_put_response.png)
- **Ce que je sais expliquer sans l'agent :**
  - **Signal vs `localStorage` :** Le Signal est en mémoire RAM et réactif (met instantanément la vue à jour dès modification), mais s'efface au rechargement. Le `localStorage` est stocké sur disque par le navigateur pour persister la session, mais n'est pas réactif.
  - **Mise à jour du profil :** Le composant `profile-page.ts` appelle `authService.update()` qui émet `PUT /api/users/me`. Le backend met à jour MongoDB, et au retour 200, le signal `currentUser` est actualisé avec les nouvelles données.
  - **Pourquoi un service ?** Pour isoler la logique réseau et les types de l'affichage, permettant de tester le composant en mockant le service.

---

# TP2 — Bibliothèque Paginée, Upload et Streaming Audio

## Mission 2 — Bibliothèque paginée

- **Objectif :** Afficher les morceaux appartenant à l'utilisateur sous forme de bibliothèque paginée (5 morceaux par page par défaut), avec navigation « Précédent » et « Suivant » aux bornes, gestion des états loading/erreur/vide, et annulation des requêtes concurrentes.
- **Prompt principal :**
  > « GO Mission 2 uniquement : bibliothèque paginée.  
  > À partir du contrat et des fichiers réellement trouvés :  
  > - Implémente ou corrige TrackService.list(page, limit) pour envoyer réellement page et limit à GET /api/tracks.  
  > - Type la réponse d’après le contrat réel du backend ; ne devine pas ses propriétés.  
  > - Dans le composant bibliothèque, gère avec des Signals la liste, page, pages, loading et l’erreur.  
  > - Affiche les pistes avec @for, l’état vide avec @empty et le chargement avec @if.  
  > - Ajoute « Précédent » et « Suivant », désactivés aux bornes, ainsi que pendant une requête si nécessaire.  
  > - À chaque changement de page, déclenche une nouvelle requête serveur. N’implémente aucune pagination locale.  
  > - Gère les changements de page rapides pour éviter qu’une ancienne réponse HTTP n’écrase une page plus récente.  
  > - Ajoute ou complète les tests utiles : paramètres HTTP, navigation entre pages, boutons aux bornes, état vide et erreur.  
  > Ne travaille pas encore sur l’upload, le lecteur, les cards avancées ou Angular Material. Termine par les commandes de test et une liste de vérifications à faire dans Network, puis attends mon GO. »
- **Plan proposé par l'agent :**
  1. Typage de la méthode `TrackService.list(page, limit)` retournant `Observable<Page<Track>>`.
  2. Création des Signals réactifs dans `TracksPageComponent` : `tracks`, `page`, `pages`, `total`, `loading`, `error`.
  3. Implémentation de `load()` avec désinscription préalable (`loadSubscription?.unsubscribe()`) pour éviter les télescopages de requêtes.
  4. Template avec Control Flow natif Angular (`@for`, `@empty`, `@if`) et liaison des boutons aux bornes (`[disabled]`).
  5. Écriture des tests unitaires de navigation et de gestion des erreurs.
- **Vérifications réalisées (étudiant) :**
  - Contrôle dans l'onglet Network de l'émission effective de `GET /api/tracks?page=1&limit=5` et `GET /api/tracks?page=2&limit=5`.
  - Vérification de la désactivation du bouton « Précédent » sur la première page et du bouton « Suivant » sur la dernière page.
  - Clics rapides répétés entre les pages : aucune désynchronisation observée grâce à l'annulation des requêtes précédentes.
- **Fichiers modifiés :**
  - `src/app/shared/services/track.service.ts` : méthode `list(page, limit)` typée avec `Observable<Page<Track>>`.
  - `src/app/components/tracks-page/tracks-page.ts` : signaux réactifs, méthode `go()`, protection anti-collision.
  - `src/app/components/tracks-page/tracks-page.html` : template avec boucles `@for`, bloc `@empty`, alertes `@if`.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : 8 tests unitaires dédiés à la pagination.
- **Preuve de fonctionnement :**
  - 44 tests frontend réussis.
  - **Captures Network et visuelles :**
    - Requête `GET /api/tracks?page=1&limit=5` et réponse JSON paginée : [`tp2_01_pagination_page1_network.png`](docs/screenshots/tp2_01_pagination_page1_network.png)  
      ![Pagination Page 1](docs/screenshots/tp2_01_pagination_page1_network.png)
    - Requête page suivante `GET /api/tracks?page=2&limit=5` : [`tp2_02_pagination_page2_network.png`](docs/screenshots/tp2_02_pagination_page2_network.png)  
      ![Pagination Page 2](docs/screenshots/tp2_02_pagination_page2_network.png)
    - Boutons de navigation (bouton Suivant désactivé à la dernière page) : [`tp2_03_pagination_buttons_ui.png`](docs/screenshots/tp2_03_pagination_buttons_ui.png)  
      ![Boutons Pagination](docs/screenshots/tp2_03_pagination_buttons_ui.png)
- **Ce que je sais expliquer sans l'agent :**
  - **Pagination serveur vs pagination locale :** La pagination locale télécharge l'intégralité des données en mémoire dans le navigateur et les découpe avec `Array.slice()`. La pagination serveur ne transfère que les 5 morceaux de la page demandée (`skip` et `limit` en BDD), ce qui économise la bande passante et la RAM.
  - **Gestion des clics rapides :** En appelant `this.loadSubscription?.unsubscribe()` avant chaque nouveau chargement, on annule la requête en vol précédente et on évite qu'une réponse retardée n'écrase la page la plus récente.

---

## Mission 3 — Upload audio et création d'une piste

- **Objectif :** Permettre l'envoi de fichiers audio valides (MP3, WAV, OGG, M4A jusqu'à 25 Mo) via un formulaire multipart/form-data, avec validation préalable côté client, désactivation du bouton pendant l'envoi pour bloquer les doubles clics, et réinitialisation vers la première page après succès.
- **Prompts principaux :**
  - *Analyse (Mission 3A) :*
    > « Mission 3A : analyse uniquement. Ne modifie aucun fichier.  
    > Localise précisément, avec chemins de fichiers et noms de méthodes : le choix du fichier ; la création du FormData ; l’ajout des champs audio et title ; l’appel HTTP d’upload ; la requête audio authentifiée ; la récupération du Blob ; URL.createObjectURL() ; l’affectation de l’URL au lecteur <audio> ; la révocation de l’ancienne URL et la gestion de la destruction du composant ; l’intercepteur qui ajoute le JWT.  
    > Vérifie dans le backend les validations multipart et la manière dont le fichier audio est servi. Explique les deux flux, composant → service → HttpClient → API et API → Blob → ObjectURL → lecteur. Distingue clairement ce qui existe déjà de ce qui manque. N’affirme pas que la réponse est un streaming de bout en bout sans l’avoir vérifié dans le code. Attends mon GO. »
  - *Upload (Mission 3B) :*
    > « GO Mission 3B : amélioration minimale de l’upload existant. Sans réécrire le mécanisme actuel ni changer l’API :  
    > Ajoute côté frontend la validation du titre, du fichier, des formats réellement acceptés par le backend et de la taille maximale de 25 Mo avant l’appel HTTP. Vérifie que le FormData contient exactement les champs attendus audio et title. Ne fixe pas manuellement l’en-tête Content-Type du multipart. Affiche des erreurs compréhensibles pour les fichiers invalides et pour les erreurs serveur. Ajoute un état d’envoi ; désactive le bouton et empêche les doubles soumissions. Après succès seulement : affiche un message de réussite, vide le formulaire et recharge la première page depuis le serveur. Préserve les éventuelles pistes affichées en cas d’échec. Ajoute ou complète les tests couvrant fichier absent, type refusé, taille supérieure à 25 Mo, FormData, double soumission, succès et erreur HTTP. Présente les fichiers modifiés et les résultats des tests, puis attends mon GO. »
- **Plan proposé par l'agent :**
  1. Constantes de validation MIME et taille maximale (25 Mo) dans le composant.
  2. Construction de `FormData` avec les champs `audio` et `title` sans forcer manuellement le `Content-Type` (laissé au navigateur pour inclure le boundary).
  3. Gestion du signal `uploading` pour bloquer les doubles soumissions et afficher l'état d'envoi.
  4. Réinitialisation complète du formulaire et rechargement de la page 1 après succès 201.
- **Vérifications réalisées (étudiant) :**
  - Tentative de sélection d'un fichier `.txt` ou d'un fichier de plus de 25 Mo : blocage immédiat côté client avec message d'erreur clair sans requête HTTP inutile.
  - Upload d'un fichier audio valide : bouton désactivé pendant l'envoi, affichage du message de succès, formulaire vidé et apparition du nouveau morceau en tête de liste.
  - Vérification de l'enregistrement du fichier dans `backend/data/uploads/` et de la métadonnée dans MongoDB Atlas.
- **Fichiers modifiés :**
  - `src/app/components/tracks-page/tracks-page.ts` : constantes `ALLOWED_AUDIO_MIMES`, `MAX_AUDIO_FILE_SIZE`, validation client, gestion des signaux `uploading`, `uploadError`, `uploadSuccess`.
  - `src/app/components/tracks-page/tracks-page.html` : formulaire accessible avec bouton désactivé en cours d'envoi.
  - Tests unitaires dans `tracks-page.spec.ts`.
- **Preuve de fonctionnement :**
  - **Captures visuelles :**
    - Bouton d'upload désactivé avec état « Envoi en cours... » : [`tp2_04_upload_button_loading_ui.png`](docs/screenshots/tp2_04_upload_button_loading_ui.png)  
      ![Upload Loading](docs/screenshots/tp2_04_upload_button_loading_ui.png)
    - Message visuel de succès lors de l'ajout d'une piste : [`tp2_05_upload_success_message_ui.png`](docs/screenshots/tp2_05_upload_success_message_ui.png)  
      ![Upload Succès](docs/screenshots/tp2_05_upload_success_message_ui.png)
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi `FormData` plutôt que du JSON ?** Le format JSON ne transporte que du texte ou du Base64 (qui gonfle la taille du fichier de 33%). `FormData` permet d'envoyer des octets binaires bruts en `multipart/form-data`.
  - **Validation frontend vs backend :** La validation frontend sert le confort utilisateur (retour instantané). La validation backend est impérative pour la sécurité (évite les contournements via curl ou Postman).

---

## Mission 4 — Liste et lecture audio

- **Objectif :** Présenter les morceaux sous forme de cartes accessibles affichant leurs métadonnées, et permettre la lecture audio sécurisée via un appel `HttpClient` authentifié converti en `Blob URL`, avec arrêt propre, gestion des erreurs et révocation de la mémoire à la destruction.
- **Prompt principal :**
  > « GO Mission 3C : lecteur audio et présentation. Conserve la lecture authentifiée déjà existante et complète uniquement les points manquants :  
  > Présente les morceaux sous forme de cards responsives et accessibles, à partir des seules métadonnées réellement disponibles. Affiche le morceau en cours de lecture et une erreur audio compréhensible en cas d’échec. Vérifie qu’un changement de morceau révoque l’ancienne ObjectURL au bon moment. Révoque également l’ObjectURL finale à la destruction du composant. Vérifie que le téléchargement audio passe bien par HttpClient avec le JWT, sans placer directement l’URL protégée dans le src du lecteur. Ajoute ou complète les tests de lecture, d’erreur, de changement de morceau et de nettoyage final. N’ajoute pas de mécanisme de streaming ni de nouvelle API. Indique ensuite ce que je dois vérifier manuellement dans Network et attends mon GO. »
- **Plan proposé par l'agent :**
  1. Affichage des morceaux sous forme de cards responsives avec métadonnées formatées (titre, taille en Mo, format audio).
  2. Méthode `play(track)` appelant `TrackService.audio(id)` avec `{ responseType: 'blob' }`.
  3. Conversion du blob en URL exploitable par la balise audio via `URL.createObjectURL(blob)`.
  4. Révocation systématique de l'ancienne URL via `URL.revokeObjectURL()` lors d'un changement de piste ou dans `ngOnDestroy()`.
  5. Affichage d'un badge « EN ÉCOUTE » et message d'erreur si la récupération audio échoue.
- **Vérifications réalisées (étudiant) :**
  - Clic sur « Écouter » : observation dans l'onglet Network d'une requête `GET /api/tracks/:id/audio` avec en-tête `Authorization: Bearer <token>` et statut 200 OK.
  - Inspection de l'élément `<audio>` dans les DevTools : l'attribut `src` contient bien une URL locale `blob:http://localhost:4200/...`.
  - Changement de morceau : vérification que l'ancien flux s'arrête et que l'ancienne URL blob est détruite.
- **Fichiers modifiés :**
  - `src/app/components/tracks-page/tracks-page.ts` : signaux `audioUrl`, `currentTrack`, méthode `play()`, cycle de vie `ngOnDestroy()`.
  - `src/app/components/tracks-page/tracks-page.html` & `.css` : cartes de morceaux, badge de lecture réactif, lecteur audio.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : tests unitaires couvrant la lecture, le changement de piste et le nettoyage.
- **Preuve de fonctionnement :**
  - **Captures Network et visuelles :**
    - Liste des cartes de morceaux avec métadonnées : [`tp2_06_tracks_cards_list_ui.png`](docs/screenshots/tp2_06_tracks_cards_list_ui.png)  
      ![Cartes Morceaux](docs/screenshots/tp2_06_tracks_cards_list_ui.png)
    - Requête audio `GET /api/tracks/:id/audio` (200, JWT) : [`tp2_07_audio_stream_jwt_network.png`](docs/screenshots/tp2_07_audio_stream_jwt_network.png)  
      ![Audio Stream JWT](docs/screenshots/tp2_07_audio_stream_jwt_network.png)
    - Balise `<audio src="blob:http://...">` dans le DOM : [`tp2_08_audio_blob_dom.png`](docs/screenshots/tp2_08_audio_blob_dom.png)  
      ![Audio Blob DOM](docs/screenshots/tp2_08_audio_blob_dom.png)
    - Badge « EN ÉCOUTE » et bouton Rejouer : [`tp2_09_audio_playing_badge_ui.png`](docs/screenshots/tp2_09_audio_playing_badge_ui.png)  
      ![Audio Playing Badge](docs/screenshots/tp2_09_audio_playing_badge_ui.png)
    - Message d'erreur en cas d'échec de récupération audio : [`tp2_10_audio_error_message_ui.png`](docs/screenshots/tp2_10_audio_error_message_ui.png)  
      ![Audio Error Message](docs/screenshots/tp2_10_audio_error_message_ui.png)
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi pas `<audio src="/api/tracks/:id/audio">` ?** La balise HTML standard émet une requête HTTP GET native sans pouvoir y adjoindre l'en-tête `Authorization: Bearer <token>`. Le backend renverrait immédiatement un statut `401 Unauthorized`. Il faut donc passer par `HttpClient` pour injecter le token, récupérer les octets binaires (`Blob`), et générer une URL locale en mémoire.
  - **Pourquoi révoquer les ObjectURL ?** Chaque appel à `URL.createObjectURL()` alloue un pointeur mémoire non nettoyable automatiquement. Sans `URL.revokeObjectURL()`, la mémoire RAM du navigateur fuite à chaque écoute.
  - **Données BDD vs disque :** MongoDB conserve les métadonnées légères (titres, durées, propriétaire) idéales pour la recherche. Les fichiers binaires lourds restent sur le disque du serveur (`data/uploads/`).

---

## Options Avancées du TP2

### 1. Angular Material Paginator & Filtre par titre

- **Objectif :** Remplacer les boutons de pagination basiques par le composant professionnel `MatPaginator` (avec sélecteur de taille 5/10/20) et implémenter un filtre de recherche par titre avec `debounceTime` pour éviter les requêtes intempestives.
- **Prompts principaux :**
  - *Material Paginator :*
    > « Implémente l’option avancée Angular Material Paginator sur la bibliothèque de pistes.  
    > Vérifie les versions d’Angular et d’Angular Material effectivement installées. Si Material est absent, propose la dépendance compatible avant installation. Utilise la documentation correspondant à la version retenue.  
    > Examine la réponse réelle de GET /api/tracks. Détermine si elle fournit le nombre total de pistes, nécessaire pour renseigner correctement length. Si elle ne fournit que pages, ne fabrique pas un total trompeur : explique le blocage et propose la plus petite évolution de contrat, puis attends mon GO.  
    > Remplace les boutons « Précédent » et « Suivant » par MatPaginator, sans remplacer la pagination serveur par une pagination locale.  
    > Convertis correctement pageIndex de Material, qui commence à 0, vers page de l’API, qui commence à 1. Quand pageSize change, reviens à la première page et lance une nouvelle requête.  
    > Préserve les états loading, erreur et liste vide. Rends le paginator accessible, avec un libellé compréhensible ; adapte ses libellés en français si c’est cohérent avec le projet.  
    > Teste les changements de page, de taille de page, les bornes et les paramètres HTTP réellement envoyés. Termine par une vérification à effectuer dans Network. »
  - *Filtre par titre :*
    > « Étudie puis implémente un filtre par titre compatible avec la pagination serveur.  
    > Commence par vérifier si GET /api/tracks accepte déjà un paramètre de recherche. Si ce n’est pas le cas, ne filtre pas uniquement les pistes de la page courante en prétendant filtrer toute la bibliothèque. Propose d’abord la plus petite extension du contrat API et du backend, sa documentation et ses tests, puis attends mon GO.  
    > Si la recherche serveur existe ou si j’ai validé son ajout : ajoute un champ de recherche accessible, limite les requêtes déclenchées pendant la saisie, annule ou ignore les réponses obsolètes, réinitialise la pagination à la page 1 lors d’un changement de filtre et conserve le filtre quand l’utilisateur change de page. Teste les paramètres HTTP, le résultat vide et les requêtes concurrentes. »
- **Plan proposé par l'agent :**
  1. Intégration de `MatPaginatorModule` dans `TracksPageComponent`.
  2. Internationalisation française des libellés via `MatPaginatorIntl` (`getFrenchPaginatorIntl()`).
  3. Conversion d'index : `pageIndex` (base 0 dans Material) vers `page` (base 1 dans l'API).
  4. Champ de recherche réactif avec `FormControl`, opérateur `debounceTime(300)` et réinitialisation à la page 1 lors d'une saisie.
- **Vérifications réalisées (étudiant) :**
  - Changement de la taille de page (5 vers 10 pistes) : nouvelle requête émise avec `limit=10` et retour immédiat à la première page.
  - Saisie d'une recherche : aucune requête émise pendant la frappe rapide, puis émission propre de `GET /api/tracks?page=1&limit=5&title=...` après 300 ms.
- **Preuve de fonctionnement :**
  - Composant `MatPaginator` (5 pistes par page) : [`tp2_11_mat_paginator_limit5_ui.png`](docs/screenshots/tp2_11_mat_paginator_limit5_ui.png)  
    ![MatPaginator 5](docs/screenshots/tp2_11_mat_paginator_limit5_ui.png)
  - Sélecteur de taille de page (10 pistes par page) : [`tp2_12_mat_paginator_limit10_ui.png`](docs/screenshots/tp2_12_mat_paginator_limit10_ui.png)  
    ![MatPaginator 10](docs/screenshots/tp2_12_mat_paginator_limit10_ui.png)
  - Requêtes HTTP émises dynamiquement lors du changement : [`tp2_13_mat_paginator_network.png`](docs/screenshots/tp2_13_mat_paginator_network.png)  
    ![MatPaginator Network](docs/screenshots/tp2_13_mat_paginator_network.png)
  - Requête filtrée `GET /api/tracks?title=d` : [`tp2_bonus_filter_title_d_network.png`](docs/screenshots/tp2_bonus_filter_title_d_network.png)  
    ![Filtre Titre D](docs/screenshots/tp2_bonus_filter_title_d_network.png)
  - Requête filtrée `GET /api/tracks?title=song` : [`tp2_bonus_filter_title_song_network.png`](docs/screenshots/tp2_bonus_filter_title_song_network.png)  
    ![Filtre Titre Song](docs/screenshots/tp2_bonus_filter_title_song_network.png)

---

### 2. Mongoose `aggregate-paginate-v2` (Variante A)

- **Objectif :** Remplacer la double requête MongoDB (`find` + `countDocuments`) par un pipeline d'agrégation atomique utilisant `$facet`, garantissant un comptage cohérent, un tri déterministe et une étanchéité multi-utilisateurs stricte.
- **Prompt principal :**
  > « GO pagination Mongoose, variante [A].  
  > Implémente uniquement la variante approuvée. Applique le plugin correctement au schéma et assure une pagination sur les pistes du propriétaire authentifié, avec comptage cohérent, paramètres bornés et tri déterministe. Mets à jour API_CONTRACT.md, le frontend et les tests si le contrat change.  
  > Ajoute des tests backend avec plusieurs utilisateurs et plusieurs pages : aucun morceau ni total d’un autre utilisateur ne doit apparaître. Teste aussi page/limit invalides, page vide, tri et compatibilité du frontend. Exécute les tests pertinents et résume les changements observables dans Network. »
- **Plan proposé par l'agent :**
  1. Branchement du plugin `mongoose-aggregate-paginate-v2` sur `TrackSchema` dans `backend/src/models/Track.js`.
  2. Construction du pipeline d'agrégation dans `backend/src/app.js` avec étape `$match: { ownerId: ownerObjectId }`.
  3. Tri composite déterministe `{ createdAt: -1, _id: -1 }`.
  4. Exposition des métadonnées de pagination complètes (`total`, `pages`, `hasPrevPage`, `hasNextPage`).
- **Vérifications réalisées (étudiant) :**
  - Contrôle backend : 20 tests passants validant l'isolation absolue entre comptes utilisateurs.
  - Inspection de la réponse Network : présence des métadonnées étendues de pagination.
- **Preuve de fonctionnement :**
  - Réponse Mongoose `aggregate-paginate-v2` (`$facet`) : [`tp2_bonus_aggregate_paginate_response.png`](docs/screenshots/tp2_bonus_aggregate_paginate_response.png)  
    ![Aggregate Paginate Response](docs/screenshots/tp2_bonus_aggregate_paginate_response.png)
  - En-têtes HTTP de la route agrégée : [`tp2_bonus_aggregate_paginate_headers.png`](docs/screenshots/tp2_bonus_aggregate_paginate_headers.png)  
    ![Aggregate Paginate Headers](docs/screenshots/tp2_bonus_aggregate_paginate_headers.png)

---

### 3. Image de couverture par piste (Approche A : Upload utilisateur)

- **Objectif :** Permettre l'ajout d'une image de couverture facultative (JPEG, PNG, WebP $\le$ 2 Mo) par piste, avec validation par signature binaire (magic bytes), flux sécurisé sous JWT, remplacement sans orphelin et suppression propre.
- **Prompt principal :**
  > « GO couverture — approche A : image uploadée par l’utilisateur.  
  > Implémente le contrat validé après l’étude 7A. Autorise une image facultative par piste, avec un format et une taille maximale clairement définis côté frontend et backend. Valide le contenu réel du fichier côté serveur plutôt que de te fier uniquement à son extension ou au type MIME déclaré. Stocke l’image selon l’architecture retenue et ne l’expose qu’aux utilisateurs autorisés si les pistes sont privées.  
  > Prévois une image par défaut, le remplacement et la suppression sans fichiers orphelins. Mets à jour API_CONTRACT.md et teste validation, accès propriétaire, absence de couverture et nettoyage des fichiers. Ne change pas le flux audio existant. »
- **Plan proposé par l'agent :**
  1. Validation serveur stricte par magic bytes (`backend/src/utils/imageValidator.js`) pour analyser les premiers octets et bloquer les faux fichiers renommés.
  2. Routes backend dédiées : `GET /api/tracks/:id/cover`, `PUT /api/tracks/:id/cover`, `DELETE /api/tracks/:id/cover`.
  3. Côté frontend, sélection avec prévisualisation immédiate en ObjectURL, affichage d'un vinyle par défaut (`default-cover.svg`), remplacement et suppression de couverture.
  4. Suppression physique systématique de l'ancien fichier sur le disque du serveur lors d'un remplacement ou d'une suppression.
- **Vérifications réalisées (étudiant) :**
  - Upload d'un morceau avec pochette : affichage immédiat de l'illustration sur la carte.
  - Remplacement de pochette : vérification que l'ancien fichier image est bien supprimé de `backend/data/uploads/covers/`.
  - Piste sans image : fallback automatique vers l'icône de vinyle par défaut sans erreur 404 dans la console.
- **Preuve de fonctionnement :**
  - Prévisualisation miniature de la pochette lors de l'upload : [`tp2_bonus_cover_upload_preview_ui.png`](docs/screenshots/tp2_bonus_cover_upload_preview_ui.png)  
    ![Cover Upload Preview](docs/screenshots/tp2_bonus_cover_upload_preview_ui.png)
  - Requête sécurisée `GET /api/tracks/:id/cover` sous JWT : [`tp2_bonus_cover_get_jwt_network.png`](docs/screenshots/tp2_bonus_cover_get_jwt_network.png)  
    ![Cover Get JWT](docs/screenshots/tp2_bonus_cover_get_jwt_network.png)
  - Requête `PUT /api/tracks/:id/cover` pour le remplacement de couverture : [`tp2_bonus_cover_put_update_network.png`](docs/screenshots/tp2_bonus_cover_put_update_network.png)  
    ![Cover Put Update](docs/screenshots/tp2_bonus_cover_put_update_network.png)
  - Vue d'ensemble de l'interface complète du portail : [`tp2_bonus_full_ui_overview.png`](docs/screenshots/tp2_bonus_full_ui_overview.png)  
    ![Overview Portail](docs/screenshots/tp2_bonus_full_ui_overview.png)

---

# TP3 — Fiabilisation et Enrichissement du Frontend

## Étape 0 — Cadrage et Audit initial

- **Objectif :** Examiner l'architecture existante issue des TP1 et TP2, identifier les composants clés (`TracksPageComponent`, `TrackService`, intercepteurs, guards), vérifier les prérequis Angular Material (`MatSnackBar`), analyser le comportement de `DELETE /api/tracks/:id` et recenser l'ensemble des suites de tests avant toute modification.
- **Prompts principaux :**
  - *Cadrage général :*
    > « Nous allons réaliser le TP3 progressivement. Travaille mission par mission et attends mon GO avant de passer à la suivante.  
    > Préserve les fonctionnalités des TP1 et TP2 : connexion, profil, pagination serveur, upload et lecture audio authentifiée. Le backend reste inchangé pour les missions obligatoires.  
    > Avant toute modification, inspecte le dépôt réel, API_CONTRACT.md, les versions installées et les tests existants. N’invente pas de fichiers, de réponses API ou de résultats de tests. Réutilise ce qui fonctionne déjà, notamment si la suppression ou la progression d’upload a été implémentée pendant le TP2.  
    > Respecte les conventions Angular du projet : composants standalone, inject(), Signals, contrôle de flux natif, typage strict sans any. Aucun mot de passe ni JWT dans les logs, l’interface ou les captures.  
    > Pour chaque mission, indique : existant, manques, fichiers modifiés, tests exécutés, résultats observés et vérifications manuelles restantes. Commence uniquement par l’audit, sans coder. »
  - *Audit Étape 0 :*
    > « Étape 0 : audit uniquement. Ne modifie aucun fichier.  
    > Identifie le composant des cards, le composant d’upload, TrackService, l’intercepteur d’authentification et les éventuels guards.  
    > Relis API_CONTRACT.md pour DELETE /api/tracks/:id et POST /api/tracks.  
    > Vérifie si MatSnackBar et Angular Material sont déjà installés et configurés.  
    > Vérifie si la suppression, la confirmation et la progression d’upload existent déjà depuis le TP2. Distingue « présent », « incomplet » et « absent ».  
    > Vérifie la configuration HTTP utilisée pour l’upload : elle doit permettre les événements de progression.  
    > Recense les tests frontend/backend et les commandes réelles pour les lancer.  
    > Remets-moi un tableau des manques par mission, avec les fichiers concernés. Signale les divergences entre le sujet et le code. Attends mon GO. »
- **Plan proposé par l'agent :**
  1. Inspection sans modification de code du frontend et du backend.
  2. Établissement d'un inventaire complet des fonctionnalités existantes et manquantes.
  3. Validation des dépendances Angular Material déjà installées.
  4. Proposition d'un plan d'action validé (Option A : intégration de `MatSnackBar` pour les toasts d'upload et de suppression).
- **Vérifications réalisées (étudiant) :**
  - Vérification de la présence de `@angular/material` dans `package.json`.
  - Contrôle du contrat API pour `DELETE /api/tracks/:id` (suppression sans orphelins : BDD, audio et couverture).

---

## Mission 5 — Suppression d’une piste

- **Objectif :** Permettre la suppression d'une piste via `DELETE /api/tracks/:id` avec confirmation préalable (`window.confirm`), blocage anti-double clic via Signal `deletingTrackId`, stratégie pessimiste, notification toast `MatSnackBar`, recul automatique d'une page si la dernière devient vide, arrêt du lecteur si la piste jouait, et gestion de l'erreur 404 si la piste n'existe plus ou appartient à un tiers.
- **Prompts principaux :**
  - *Implémentation initiale :*
    > « Implémente la suppression d’une piste avec confirmation via DELETE /api/tracks/:id.  
    > Avant de coder, vérifie que cette route existe réellement, qu’elle est protégée et que son comportement pour une piste appartenant à un autre utilisateur est défini. Vérifie aussi comment le backend gère la suppression du fichier audio sur disque. Si ces points sont absents ou ambigus, présente-les et attends mon GO : n’invente pas le contrat.  
    > Si le contrat est confirmé, ajoute une action « Supprimer » accessible sur la card, demande confirmation, bloque les doubles clics pendant l’opération, affiche le succès ou l’erreur et rafraîchis la page courante depuis le serveur. Si la suppression vide la dernière page, reviens à la page précédente valide.  
    > N’efface jamais la piste de l’interface avant confirmation du succès serveur, sauf si tu proposes explicitement une stratégie optimiste et que je l’approuve. Teste annulation, succès, erreur, double clic, refus d’accès et dernière page devenue vide. »
  - *Finalisation TP3 :*
    > « je crois que le TP 3 est déjà fait, peux-tu me le confirmer stp » $\rightarrow$ validation « Option A » (intégration de `MatSnackBar` pour les notifications toasts de suppression et d'upload afin de parfaire la conformité).
- **Plan proposé par l'agent :**
  1. Injection de `MatSnackBar` via `inject(MatSnackBar)`.
  2. Ajout du bouton « Supprimer » sur chaque carte de morceau.
  3. Demande de confirmation préalable via `window.confirm()`.
  4. Signal `deletingTrackId` bloquant tout double clic pendant la requête réseau.
  5. Appel de `TrackService.delete(id)` et gestion pessimiste (la carte reste à l'écran jusqu'à confirmation serveur).
  6. En cas de succès : affichage du toast `MatSnackBar` (4s), arrêt du lecteur audio si la piste jouait, calcul du recul de page si la dernière est devenue vide, et appel de `this.load()`.
  7. En cas d'échec (404) : affichage du toast d'erreur `MatSnackBar` (5s) et déblocage de l'état sans crash.
- **Vérifications réalisées (étudiant) :**
  - Clic sur « Supprimer » puis « Annuler » : aucun appel réseau émis, la piste reste affichée.
  - Clic sur « Supprimer » puis « Confirmer » : notification toast de succès en bas de l'écran, suppression de la carte et rafraîchissement depuis le serveur.
  - Clic rapide répété : impossibilité de déclencher deux requêtes simultanées grâce au signal `deletingTrackId`.
- **Fichiers modifiés :**
  - `src/app/components/tracks-page/tracks-page.ts` : méthode `deleteTrack()`, injection `MatSnackBar`, gestion du recul de page et nettoyage audio.
  - `src/app/components/tracks-page/tracks-page.html` : bouton accessible « Supprimer » sur chaque carte.
  - `src/app/components/tracks-page/tracks-page.spec.ts` : tests unitaires mockant `MatSnackBar` et validant l'ensemble des scénarios.
- **Preuve de fonctionnement :**
  - 9 tests unitaires dédiés à la suppression, tous passants.
  - **Captures visuelles :**
    - Boutons « Supprimer » sur chaque carte de morceau : [`tp3_02_delete_buttons_cards_ui.png`](docs/screenshots/tp3_02_delete_buttons_cards_ui.png)  
      ![Boutons Supprimer](docs/screenshots/tp3_02_delete_buttons_cards_ui.png)
    - Boîte de dialogue de confirmation préalable : [`tp3_03_delete_confirm_dialog_ui.png`](docs/screenshots/tp3_03_delete_confirm_dialog_ui.png)  
      ![Confirmation Suppression](docs/screenshots/tp3_03_delete_confirm_dialog_ui.png)
    - Notification toast `MatSnackBar` de confirmation de suppression : [`tp3_04_delete_snack_bar_toast_ui.png`](docs/screenshots/tp3_04_delete_snack_bar_toast_ui.png)  
      ![Toast MatSnackBar](docs/screenshots/tp3_04_delete_snack_bar_toast_ui.png)
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi la suppression passe par un service ?** Pour découpler l'affichage de la logique HTTP. Le composant gère les interactions et la vue, `TrackService` gère l'appel `DELETE` et le typage, facilitant les tests unitaires.
  - **Pourquoi le guard ne suffit pas à sécuriser la suppression ?** Le guard Angular s'exécute côté client dans le navigateur et peut être contourné avec curl ou Postman. C'est le backend qui assure la sécurité réelle en déchiffrant le JWT et en filtrant MongoDB avec `Track.findOneAndDelete({ _id: id, ownerId: req.auth.sub })`. Si la piste a été supprimée ailleurs ou appartient à un autre compte, le serveur renvoie 404.

---

## Mission 6 — Progression de l’upload

- **Objectif :** Faire évoluer le formulaire d'upload pour écouter les événements réseau en temps réel, calculer et afficher le pourcentage d'avancement (0 à 100%) via une barre de progression accessible, et distinguer nettement le transfert des octets de la validation serveur finale.
- **Prompt principal :**
  > « Ajoute une barre de progression à l’upload existant, sans réécrire le formulaire ni changer les champs multipart audio et title.  
  > Inspecte d’abord la configuration de HttpClient et l’implémentation actuelle de TrackService.upload(). Vérifie si des événements de progression d’upload peuvent effectivement être obtenus avec cette configuration.  
  > Si oui, utilise les événements HTTP adaptés pour afficher la progression quand le total est connu. Distingue clairement « octets envoyés » et « traitement terminé par le serveur » : ne présente pas 100 % d’envoi comme une réussite tant que la réponse HTTP de succès n’est pas reçue. Si le total n’est pas disponible, affiche un état indéterminé.  
  > Préserve la validation du fichier, le blocage des doubles soumissions, les erreurs serveur, le message de succès et le retour à la première page. Ajoute les tests des événements de progression, du succès final et de l’échec. Si la configuration HTTP actuelle ne permet pas la progression, explique la modification minimale nécessaire et attends mon GO avant de changer cette configuration. »
- **Plan proposé par l'agent :**
  1. Configuration de l'appel HTTP dans `TrackService.upload()` avec les options `{ reportProgress: true, observe: 'events' }`.
  2. Écoute des événements `HttpEventType.UploadProgress` dans `tracks-page.ts`.
  3. Calcul dynamique du pourcentage : `Math.round((event.loaded / event.total) * 100)`.
  4. Gestion de 4 états visuels distincts : inactif, envoi en cours avec pourcentage, traitement serveur en cours (à 100% réseau), et succès final à la réception de `HttpEventType.Response`.
  5. Notification de succès ou d'erreur finale via toast `MatSnackBar`.
- **Vérifications réalisées (étudiant) :**
  - Upload d'un fichier audio volumineux : observation de la progression fluide de la barre de 0% à 100%.
  - Observation de l'état intermédiaire « Envoi terminé. Traitement par le serveur en cours… » avant la réponse HTTP 201.
  - Vérification de l'ouverture du toast `MatSnackBar` dès la validation serveur.
- **Fichiers modifiés :**
  - `src/app/shared/services/track.service.ts` : configuration de l'appel d'upload avec `reportProgress` et `observe: 'events'`.
  - `src/app/components/tracks-page/tracks-page.ts` : traitement des événements `HttpEventType`, calcul du pourcentage, signaux `uploadProgress` et `uploadStatusText`.
  - `src/app/components/tracks-page/tracks-page.html` : élément barre de progression stylisé avec attributs d'accessibilité ARIA (`role="progressbar"`, `aria-valuenow`).
  - `src/app/components/tracks-page/tracks-page.spec.ts` : tests unitaires simulant les événements de progression et la réponse finale.
- **Preuve de fonctionnement :**
  - **Capture visuelle :**
    - Barre de progression animée pendant le transfert : [`tp3_01_upload_progress_bar_ui.png`](docs/screenshots/tp3_01_upload_progress_bar_ui.png)  
      ![Progression Upload](docs/screenshots/tp3_01_upload_progress_bar_ui.png)
- **Ce que je sais expliquer sans l'agent :**
  - **Comment Angular calcule le pourcentage ?** Grâce à l'option `reportProgress: true` sous RxJS. Angular émet des événements intermédiaires `HttpEventType.UploadProgress` contenant le nombre d'octets transférés (`loaded`) et la taille totale (`total`). Le pourcentage vaut : `Math.round((event.loaded / event.total) * 100)`.
  - **Distinction transfert réseau vs succès serveur :** Atteindre 100% signifie uniquement que les octets ont quitté le navigateur. Le serveur doit encore vérifier le fichier avec Multer, valider les magic bytes, écrire sur disque et enregistrer le document en BDD. La réussite ne doit être confirmée qu'à la réception de l'événement final `HttpEventType.Response` (statut HTTP 201).

---

## Mission 7 — Tests automatisés et Build

- **Objectif :** Valider l'intégralité de la chaîne de tests frontend et backend et s'assurer que le bundle de production compile sans aucune erreur ni régression.
- **Commandes exécutées et résultats :**
  - Frontend : `npm test -- --watch=false` dans `frontend-starter/` $\rightarrow$ **100 tests passés avec succès sur 100**.
  - Backend : `npm test` dans `backend/` $\rightarrow$ **20 tests passés avec succès sur 20**.
  - Build de production : `npm run build` dans `frontend-starter/` $\rightarrow$ Compilation réussie sans erreur (bundle initial `main.js` : 631 kB).
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi les tests HTTP n’ont pas besoin de MongoDB ?** Parce qu'ils s'appuient sur `provideHttpClientTesting()` et `HttpTestingController`. Ces outils interceptent les requêtes HTTP dans le runtime de test et injectent des réponses factices (`req.flush()`). Ni le serveur Node.js ni la base Atlas ne sont sollicités.
  - **Ce que vérifie un test d'intercepteur ou de guard :**
    - L'intercepteur vérifie que l'en-tête `Authorization: Bearer <token>` est bien greffé sur les requêtes protégées et qu'une erreur 401 purge la session.
    - Le guard vérifie que l'accès à une route est accordé si un token valide existe, ou redirige vers `/login` dans le cas contraire.
  - **Différence entre test unitaire et test d’intégration :**
    - *Test unitaire :* Teste une classe ou un composant isolé en remplaçant toutes ses dépendances par des simulations ou mocks (ex : tester `TracksPageComponent` avec un mock de `TrackService`).
    - *Test d'intégration :* Teste la collaboration réelle de plusieurs briques ensemble (composants, services, DOM) pour s'assurer que le flux global fonctionne sans rupture.

---

# TP4 Libre — MakerShare (Plateforme DIY)

## Mission 0 — Cadrage, Sécurité et Contrat d'API
- **Objectif :** Établir le contrat d'API, la matrice de sécurité et les règles de gestion (quotas, visibilités, abonnements) sans toucher au code des TPs 1-3.
- **Fichiers modifiés :** `API_CONTRACT.md`, `TP4_LIBRE.md`.
- **Preuves :** Matrice d'accès formalisée, pas de passe-droit admin pour les fichiers privés, quotas de fichiers (50 Mo cumulés, 10 fichiers max, audio 25 Mo, image 5 Mo, PDF 10 Mo).
- **Ce que je sais expliquer sans l'agent :**
  - Pourquoi le contrôle d'accès doit être strict par défaut : toute route sans politique explicite doit être refusée (401/403).
  - Pourquoi l'admin n'a pas accès aux fichiers privés : la modération porte sur les contenus signalés et publics, pas sur l'espionnage des contenus privés payants.

---

## Mission 1A & 1B — Modèles MongoDB et Socle Frontend
- **Objectif :** Créer les modèles Mongoose (`Post`, `Follow`, `Subscription`, `Like`, `ShareLink`) avec contraintes d'unicité, et les services Angular (`PostService`, `CreatorService`).
- **Fichiers modifiés :** Modèles backend sous `backend/src/models/`, `postProjections.js`, services frontend `post.service.ts` et `creator.service.ts`.
- **Preuves :** Tests unitaires des modèles (29 tests backend) et tests HTTP frontend (26 tests isolés).
- **Ce que je sais expliquer sans l'agent :**
  - Pourquoi `storedName` a `select: false` : pour empêcher toute fuite accidentelle du nom physique de fichier vers le client.
  - Pourquoi une contrainte d'unicité MongoDB `{ subscriberId: 1, creatorId: 1 }` est nécessaire : seule la base garantit l'anti-collision en cas de requêtes concurrentes.

---

## Mission 2 — Brouillons, Catégories, Tags et Publication
- **Objectif :** Implémenter le cycle de vie des tutoriels (création brouillon, modification par l'auteur, normalisation déterministe des tags, publication avec choix de visibilité, retour en brouillon).
- **Fichiers modifiés :** `backend/src/routes/posts.js`, `frontend-starter/src/app/components/posts-management-page/`.
- **Preuves :** 20 tests d'API backend et 25 tests frontend dans `posts-management-page.spec.ts`.
- **Ce que je sais expliquer sans l'agent :**
  - Pourquoi normaliser les tags côté serveur : pour éviter les incohérences de recherche dues aux majuscules, espaces superflus ou doublons.
  - Pourquoi interdire les modifications d'un post archivé : un contenu archivé par la modération est figé (410 ou 400).

---

## Mission 3 — Pièces Jointes et Upload Sécurisé
- **Objectif :** Permettre l'upload multipart sécurisé de pièces jointes par lot pour l'auteur actif, avec quotas stricts et validation par signature binaire.
- **Revue et clarifications :**
  - Stockage effectif dans `backend/data/uploads/attachments/`.
  - Nettoyage automatique des fichiers partiels par Multer avant contrôleur via `fsPromises.unlink()` (vérifié par test disque).
  - Réconciliation périodique des orphelins : marquée comme **non implémentée** (recommandation future).
  - Limite des signatures magiques : vérifie l'en-tête de fichier, mais pas l'intégrité de la totalité du flux ni les polyglottes.
- **Fichiers modifiés :** `attachmentUpload.js`, `attachmentValidator.js`, `backend/src/routes/posts.js`, `posts-management-page.ts`.
- **Preuves :** 14 tests backend avec test de concurrence `Promise.all` ($8+2+2 \rightarrow$ 10 fichiers finaux, 0 violation de quota).

---

## Mission 4 — Contrôle des Lectures, Visibilités et Partage par Lien
- **Objectif :** Implémenter la décision d'accès centralisée (`postAccessControl.js`), le catalogue public, le détail avec lecteur audio Blob, le partage par lien secret (`ShareLink`) et le streaming/téléchargement sécurisé sans fuite de chemins disque.
- **Prompt principal :**
  > « GO Mission 4 — contrôle des lectures, visibilités et partage par lien. Revue courte Mission 3... Backend décision d'accès centralisée... Routes Express ordonnées (/my et /shared/:token avant /:id)... Secret 32 octets haché SHA-256 avec X-Share-Token... Téléchargement avec res.sendFile et Range... Frontend catalogue, détail et share avec Blob/ObjectURL et révocation... Matrice de tests complète... »
  > « Revue corrective ciblée de la Mission 4 : compare le schéma réel Follow et toutes les requêtes Follow.exists(), vérifie les champs de Subscription (subscriberId, creatorId, expiresAt, active), montre quelle route permet à l'admin de lire un post archivé (reportée à Mission 8), revois Content-Disposition RFC 5987/6266, nosniff, Cache-Control, politique PDF, Referrer-Policy sur /share/:token, logs backend et proxy, inaccessibilité immédiate du fichier... »
- **Plan proposé et points clés :**
  1. `optionalAuthMakerShare.js` : accepte l'anonymat, rejette Bearer corrompu (401) et compte suspendu (403).
  2. `postAccessControl.js` : contrôle centralisé (`public`, `followers` via `followerId`/`creatorId`, `subscribers` via `subscriberId`/`creatorId`/`expiresAt`/`active`, `link`, `draft`, `archived` 410 pour tous en Mission 4, auteur suspendu 404).
  3. `posts.js` : ordonnancement Express strict, `GET /api/posts/shared/:token` avant `GET /:id`, route de téléchargement avec `.select("+attachments.storedName")`, `res.sendFile()`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-cache, no-store`, `Content-Disposition` avec nom original atypique (RFC 5987/6266) et politique PDF (`inline` par défaut, `attachment` avec `?download=1`).
  4. Sécurité et logs : masquage des jetons secrets dans les logs Express (`[REDACTED_SHARE_TOKEN]`), proxy dev en `logLevel: "warn"`, et balise `<meta name="referrer" content="no-referrer">` dans `index.html`.
  5. Frontend : correction de `authInterceptor` (pas de logout sur 401 anonyme), vues `PostsPageComponent` (`/posts`), `PostDetailPageComponent` (`/posts/:id`) et `SharedPostPageComponent` (`/share/:token`), lecteur audio avec Blob et libération mémoire `URL.revokeObjectURL()`.
- **Fichiers modifiés :**
  - Backend : `backend/src/middlewares/optionalAuthMakerShare.js`, `backend/src/utils/postAccessControl.js`, `backend/src/routes/posts.js`, `backend/src/app.js`, `backend/test/access_control.test.js`.
  - Frontend : `auth.interceptor.ts`, `posts-page/`, `post-detail-page/`, `shared-post-page/`, `routes.ts`, `app.html`, `index.html`, `proxy.conf.json`.
- **Preuves de fonctionnement :**
  - Tests Backend : **114 passants sur 114** (`node --test`), incluant 24 tests dédiés dans `access_control.test.js` (cycle complet Follow 403 $\rightarrow$ 200 $\rightarrow$ 403, cycle complet Subscription avec expiration et désactivation, inaccessibilité immédiate du fichier sur post archivé / auteur suspendu / lien révoqué, en-têtes de téléchargement et nom atypique).
  - Tests Frontend : **167 passants sur 167** (`ng test --watch=false`), 100% succès.
  - Build Frontend : **Compilation réussie sans erreur** en 6.90s (`ng build`).
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi vérifier `creatorId` et `followerId` selon le modèle :** Le schéma Mongoose `Follow` déclare `followerId` et `creatorId`. Utiliser des noms divergents invaliderait les requêtes `Follow.exists()`.
  - **Pourquoi le statut administrateur ne permet pas de lire le texte d'un post archivé en Mission 4 :** Aucune route de modération n'existe encore dans l'API. Sur `GET /api/posts/:id`, un post archivé renvoie systématiquement `410 Gone`. La route spécifique d'inspection modératrice est reportée à la Mission 8, et n'accordera jamais d'accès implicite aux pièces jointes privées.
  - **Construction RFC 5987 / 6266 de Content-Disposition :** L'en-tête associe un fallback ASCII assaini (`filename="..."`) et la version complète encodée en UTF-8 (`filename*=UTF-8''...`), préservant accents et caractères spéciaux sans risque d'injection d'en-tête HTTP.
  - **Politique Referrer-Policy et logs de jetons :** La page HTML initiale impose `no-referrer` via `<meta name="referrer" content="no-referrer">` (à doubler d'un en-tête HTTP en production Nginx). Les logs applicatifs masquent les jetons par regex (`[REDACTED_SHARE_TOKEN]`) pour éviter toute fuite de secret dans les traces serveur.

---

## Mission 5 — Follows et Abonnements Simulés

- **Objectif :** Implémenter la gestion des follows gratuits et des abonnements simulés de 30 jours (sans carte bancaire ni paiement réel), avec protection stricte contre les clics répétés, la concurrence simultanée, l'auto-souscription et la prolongation illégitime. Débloquer instantanément les projets restreints dans l'interface Angular 22.
- **Prompt principal :**
  > « GO pour la Mission 5 — Follows et abonnements simulés.
  > Avant de coder : vérifie git status et distingue les modifications de la Mission 4 de celles de la Mission 5. Crée un commit dédié à la Mission 4 si ce n'est pas fait. Vérifie que RAPPORT_IA_LIBRE.md reste dans .gitignore.
  > Implémente uniquement la Mission 5 :
  > - Routes et interface de follow/unfollow et abonnement simulé de 30 jours, sans toucher à /api/tracks*.
  > - Droits côté serveur : compte actif, créateur existant et actif, interdiction de s'auto-suivre ou s'auto-abonner (400). Un abonnement n'implique pas automatiquement un follow.
  > - Clics répétés et requêtes concurrentes : abonnement actif renvoie 409 avec sa date d'expiration sans prolongation. Après expiration, permettre une nouvelle activation en respectant l'index unique { subscriberId, creatorId }.
  > - Afficher clairement « Simulation — aucun paiement », l'échéance et désactiver les boutons pendant le chargement.
  > - Teste les transitions, expiration, renouvellement et deux souscriptions concurrentes sur base MongoDB isolée. Ajoute les tests frontend. Build et commits dédiés. »
- **Plan proposé et points clés :**
  1. Contrôleur `backend/src/routes/creators.js` monté sur `/api/creators` :
     - `POST /:id/follow` & `DELETE /:id/follow` : validation ObjectId, interdiction d'auto-follow (400), créateur actif (404), gestion d'idempotence via code 11000 capté $\rightarrow$ 200.
     - `POST /:id/subscribe` : validation ObjectId, interdiction d'auto-abonnement (400), créateur actif (404), durée 30 jours.
     - Si abonnement actif : renvoi direct `409 Conflict` avec `expiresAt`, interdisant toute prolongation.
     - Si expiré : mise à jour atomique `findOneAndUpdate` avec condition d'antériorité pour sérialiser les appels concurrents.
     - Si nouveau : `Subscription.create` captant l'erreur `11000 DuplicateKey` sur l'index composé `{ subscriberId: 1, creatorId: 1 }` pour renvoyer `409 Conflict`.
     - `GET /:id/status` : retourne `{ isFollowing, isSubscribed, expiresAt }`.
  2. Indépendance formelle : un abonnement n'entraîne pas de follow (modèles et collections distincts).
  3. Frontend Angular 22 (`post-detail-page`) :
     - Utilisation de `CreatorService` (`follow`, `unfollow`, `subscribe`, `getStatus`).
     - Affichage explicite du badge « Simulation — aucun paiement » et de l'échéance `expiresAt`.
     - Désactivation native des boutons pendant les requêtes (`isFollowLoading`, `isSubscribeLoading`) évitant les doubles clics.
     - Masquage des actions pour l'auteur lui-même (`isSelfAuthor`).
     - Déverrouillage réactif instantané : dès qu'un follow ou abonnement réussit sur un projet verrouillé, rechargement automatique du détail sans rafraîchissement manuel de la page.
- **Fichiers modifiés :**
  - Backend : `backend/src/routes/creators.js`, `backend/src/app.js`, `backend/test/creators.test.js`.
  - Frontend : `post-detail-page.ts`, `post-detail-page.html`, `post-detail-page.css`, `post-detail-page.spec.ts`.
- **Preuves de fonctionnement :**
  - Tests Backend : **136 passants sur 136 (100% de succès)** (`node --test`), incluant 22 tests dédiés dans `creators.test.js` :
    - Rejet auto-follow et auto-abonnement (`400`).
    - Rejet créateur introuvable ou suspendu (`404`).
    - Transitions de droits Follow (403 $\rightarrow$ 200 $\rightarrow$ 403) et idempotence vérifiée.
    - Souscription 30 jours (201), non-implication de follow (`isFollowing: false`), déblocage du post réservé (200).
    - Clic répété alors qu'actif $\rightarrow$ `409 Conflict` sans prolongation de la date d'échéance.
    - Expiration de l'abonnement $\rightarrow$ reblocage immédiat (403).
    - Renouvellement post-expiration $\rightarrow$ accordé (201) avec nouvelle échéance à J+30 et 1 seul document conservé en base.
    - **Test de concurrence simultanée (`Promise.all`) sur base isolée :** deux souscriptions concurrentes exécutées simultanément $\rightarrow$ exactement un statut `201` et un statut `409`, et exactement 1 document dans la collection `subscriptions`.
  - Tests Frontend : **172 passants sur 172 (13 suites)** (`ng test --watch=false`), dont 11 tests sur `post-detail-page.spec.ts`.
  - Build Frontend : **Compilation réussie sans erreur** en 8.34s (`ng build`).
- **Ce que je sais expliquer sans l'agent :**
  - **Gestion de la concurrence MongoDB :** Un simple contrôle `findOne` en mémoire n'est pas atomique et ne protège pas contre deux requêtes simultanées. Seule la contrainte d'index composé `{ subscriberId: 1, creatorId: 1 }` au niveau du moteur de stockage MongoDB garantit l'atomicité et lève une erreur `11000 DuplicateKey` qu'Express traduit en `409 Conflict`.
  - **Principe de non-prolongation :** Un abonnement actif ne peut pas être réactivé avant son terme. Le serveur renvoie `409 Conflict` en rappelant l'échéance actuelle. Après expiration, une nouvelle période de 30 jours peut être activée via une mise à jour atomique conditionnelle.
  - **Indépendance Follow / Abonnement :** Suivre un créateur relève d'un flux d'actualité consenti gratuit, alors que s'abonner donne accès aux projets payants/privés. Les deux droits sont découplés techniquement et fonctionnellement.

---

## Mission 6 — Likes Uniques et Compteur Cohérent

- **Objectif :** Implémenter le système d'appréciation sociale (Like / Unlike) avec unicité stricte `{ userId, postId }` en base, calcul dynamique de `likesCount` sans dénormalisation dans le modèle `Post`, respect de la matrice de visibilité avant autorisation de liker, et bouton interactif dans Angular 22 avec protection anti-double clic.
- **Prompt principal :**
  > « GO pour la Mission 6 — Likes uniques et compteur cohérent.
  > Avant de coder, audite le modèle Like, les routes et DTO existants, le calcul de likesCount, ainsi que les méthodes PostService.likePost() et unlikePost(). Vérifie git status et confirme que RAPPORT_IA_LIBRE.md reste dans .gitignore, local et non versionné.
  > Implémente uniquement la Mission 6 :
  > - POST /api/posts/:id/like et DELETE /api/posts/:id/like, via authMakerShare ;
  > - refus de l’auto-like (400), d’un compte suspendu (403) et de toute interaction sans droit de lecture complète du post ;
  > - unicité réelle { userId, postId } en base, avec traitement explicite des appels répétés et concurrents ; précise et teste la réponse attendue pour chaque cas ;
  > - compteur likesCount calculé à partir de la collection likes, sans ajouter de compteur dénormalisé au modèle Post ;
  > - bouton Like/Unlike et compteur dans le détail du post, uniquement lorsque l’action est autorisée, avec état de chargement, prévention du double clic et mise à jour après réponse du serveur. Ne te fie pas au seul masquage du bouton pour sécuriser l’action.
  > Ajoute des tests backend sur MongoDB isolé pour l’unicité, deux likes simultanés, unlike répété, auto-like et matrice d’accès, puis des tests frontend pour les requêtes, états et erreurs. Vérifie également que catalogue, aperçu et détail affichent le même comptage calculé. »
- **Plan proposé et points clés :**
  1. Backend `backend/src/routes/posts.js` :
     - `POST /api/posts/:id/like` : authentification et compte actif (`authMakerShare`), validation ObjectId, rejet de l'auto-like (`400 Bad Request`), contrôle d'accès de lecture complète via `canAccessPost(post, req.user)` (refus 403 followers/subscribers non débloqués, 404 brouillon ou créateur suspendu, 410 post archivé).
     - Insertion `Like.create({ userId, postId })` avec interception de l'erreur `11000 DuplicateKey` pour garantir l'idempotence sous double-clic ou concurrence simultanée.
     - Calcul dynamique : `likesCount = await Like.countDocuments({ postId: post._id })`. Réponse `200 { liked: true, likesCount }`.
     - `DELETE /api/posts/:id/like` : suppression via `Like.deleteOne`, recalcul dynamique du compteur, réponse `200 { liked: false, likesCount }`.
  2. Frontend Angular 22 (`post-detail-page`) :
     - Bouton interactif `btn-like` conditionné aux utilisateurs connectés non-auteurs autorisés.
     - Signal `isLikeLoading` désactivant le bouton et protégeant contre les doubles soumissions.
     - Mise à jour réactive des propriétés `likesCount` et `userInteractions.isLiked` après confirmation serveur.
     - Affichage du compteur calculé dans le catalogue, l'aperçu verrouillé et la vue détaillée.
- **Fichiers modifiés :**
  - Backend : `backend/src/routes/posts.js`, `backend/test/likes.test.js`.
  - Frontend : `post-detail-page.ts`, `post-detail-page.html`, `post-detail-page.css`, `post-detail-page.spec.ts`.
- **Preuves de fonctionnement :**
  - Tests Backend : **154 passants sur 154 (100% de succès)** (`node --test`), incluant 18 tests dédiés dans `likes.test.js` :
    - Rejet auto-like (400) et auto-unlike (400).
    - Rejet compte suspendu (403), brouillon d'autrui (404), post archivé (410), créateur suspendu (404).
    - Déblocage dynamique du like sur post followers après follow (403 $\rightarrow$ 200).
    - Déblocage dynamique du like sur post subscribers après souscription (403 $\rightarrow$ 200).
    - Premier like (200), clic répété (200 idempotent sans double incrémentation).
    - **Deux likes simultanés (`Promise.all`) sur base isolée :** les deux requêtes reçoivent 200, exactement 1 document dans la collection `Like`.
    - Unlike et unlike répété (200, likesCount décrémenté).
    - **Cohérence vérifiée :** catalogue, aperçu et détail retournent le même `likesCount: 3`, aucun champ dénormalisé présent sur `Post`.
  - Tests Frontend : **176 passants sur 176 (13 suites)** (`ng test --watch=false`), dont 15 tests sur `post-detail-page.spec.ts`.
  - Build Frontend : **Compilation réussie sans erreur** en 7.53s (`ng build`).
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi ne pas dénormaliser `likesCount` dans le schéma Post :** Stocker un compteur dans le document Post entraîne des risques majeurs de dérive en cas d'écritures concurrentes ou d'échecs partiels. Calculer le total à partir de la collection `Like` garantit une source unique de vérité et une intégrité parfaite.
  - **Nécessité de vérifier l'accès complet au post avant de liker :** Pour empêcher un utilisateur d'aimer un contenu privé, réservé ou payant qu'il ne peut pas consulter, `canAccessPost()` est exécuté côté serveur avant toute insertion de like.
  - **Idempotence et capture de l'erreur 11000 :** Le code 11000 levé par l'index unique `{ userId: 1, postId: 1 }` lors d'un clic répété est intercepté par Express pour renvoyer un statut 200 avec le comptage réel plutôt qu'un crash 500, offrant une expérience robuste et fluide.

---

# Refonte Visuelle & Intégration du Kit UI Figma MakerShare v2

## Mission UI — Intégration Maquette MakerShare v2 (Mode Sombre, Éditeur Riche, Tri & Dates)

- **Objectif :** Refondre intégralement l'interface utilisateur de l'application selon la maquette prototype HTML/CSS Figma v2. Mettre en place la double palette variable (Mode Clair « Papier d'atelier » et Mode Sombre « Atelier Nocturne »), le switch de thème persistant, la barre de navigation MakerShare, le tri interactif du catalogue (récents, likes, anciens), l'affichage direct des dates sur les cartes, la vue détaillée enrichie à 2 colonnes avec pièces jointes au fil du texte, et l'éditeur riche de tutoriels avec barre d'outils de formatage et insertion de pièces jointes au curseur.
- **Prompt principal :**
  > « Tu vas totalement modifier l'UI de ce site web pour qu'il soit comme la maquette HTML que je t'ai donné. Pour les éléments qui n'existent pas encore dans l'application mais qui sont dans la maquette, tu prépares le code html / css pour que ce soit déjà bien implémenté quand je rajouterai les fonctionnalités. »
- **Plan proposé et points clés :**
  1. **Fondations Visuelles & Thème (`styles.css`, `index.html`) :**
     - Définition des variables CSS : `--bg-canvas`, `--bg-surface`, `--bg-subtle`, `--border-color`, `--text-primary`, `--text-secondary`, `--text-muted`, `--brand-primary`, `--brand-hover`, `--pine-primary`, `--pine-hover`.
     - Intégration Google Fonts `Plus Jakarta Sans` (titres et identité) et `Inter` (corps de texte).
     - Règle d'accessibilité WCAG : `*:focus-visible { outline: 2px solid #3B82F6 !important; }`.
     - Création d'un `ThemeService` réactif (`isDark = signal<boolean>`) appliquant la classe `.dark` sur `<html>` et persistant le choix dans `localStorage`.
  2. **Navigation Principale (`app.component`) :**
     - Logo MakerShare carré « M », liens de navigation épurés, bouton switch Clair/Sombre (`🌓 Mode Clair / Sombre`), badge utilisateur avec initiales d'avatar rondes et menu mobile déroulant (adapté aux écrans 390px).
  3. **Catalogue des créations (`posts-page` — Frame 3B) :**
     - Barre de tri interactif avec 3 options (`📅 Plus récents (Date)`, `♥ Plus aimés (Likes)`, `🕰️ Plus anciens`) pilotée par un signal de tri et un signal calculé `sortedPosts`.
     - Date d'ajout affichée directement sur la carte avant le clic (`📅 12 oct. 2026`).
     - Badges de visibilité WCAG (`🌐 Public`, `🔒👥 Followers`, `🔒⭐ Abonnés`), suggestions avec badges.
  4. **Détail d'un projet (`post-detail-page` — Frame 3C) :**
     - Grille à deux colonnes (2fr / 1fr) : zone de tutoriel principale avec instructions, astuces d'atelier, blocs de pièces jointes intégrées et colonne latérale récapitulant les tags et toutes les pièces jointes avec boutons de téléchargement direct.
  5. **Atelier et Création de poste (`posts-management-page` — Frame 3D) :**
     - Barre d'outils de mise en page riche : Boutons B, I, U, Titre H2, H3, Listes, Citations, Code.
     - Bouton d'insertion au curseur : `📎 + Insérer une PJ dans le texte`.
     - Double onglet en temps réel : `Édition` (textarea) / `Aperçu mis en page` (rendu Markdown avec cartes visuelles de pièces jointes).
     - Liste des pièces jointes du poste avec indicateur « ✓ Inséré dans le texte » et bouton « ↵ Insérer dans le texte ».
  6. **Espaces Profil & Annuaire (`profile-page`, `creators-search-page`, `creator-profile-page` — Frames 3E, 3F, 3G) :**
     - Alignement complet sur les chartes graphiques de la maquette (initiales rondes, compteurs d'atelier, bannières explicites « Simulation — aucun paiement réel », cartes d'abonnements et de suivi).
  7. **Pages d'authentification (`login-page`, `register-page` — Frame 3A) :**
     - Cartes centrées épurées aux couleurs MakerShare.
- **Fichiers modifiés :**
  - Fondations & Thème : `src/index.html`, `src/styles.css`, `src/app/shared/services/theme.service.ts`, `src/app/shared/services/theme.service.spec.ts`.
  - Navigation : `src/app/components/app/app.ts`, `app.html`, `app.css`.
  - Catalogue : `src/app/components/posts-page/posts-page.ts`, `posts-page.html`, `posts-page.css`.
  - Détail : `src/app/components/post-detail-page/post-detail-page.ts`, `post-detail-page.html`, `post-detail-page.css`.
  - Atelier / Édition : `src/app/components/posts-management-page/posts-management-page.ts`, `posts-management-page.html`, `posts-management-page.css`.
  - Profil personnel : `src/app/components/profile-page/profile-page.ts`, `profile-page.html`, `profile-page.css`.
  - Créateurs : `src/app/components/creators-search-page/creators-search-page.html`, `creators-search-page.css`, `src/app/components/creator-profile-page/creator-profile-page.html`, `creator-profile-page.css`.
  - Authentification : `src/app/components/login-page/login-page.html`, `login-page.css`, `src/app/components/register-page/register-page.html`, `register-page.css`.
  - Partage secret : `src/app/components/shared-post-page/shared-post-page.html`, `shared-post-page.css`.
- **Preuves de fonctionnement :**
  - **Tests unitaires :** **221 passants sur 221 (18 suites de tests)** (`ng test --watch=false`), 100% de réussite.
  - **Compilation de production :** Build réussi en 10.74s (`ng build`) sans erreur ni warning TypeScript.
- **Ce que je sais expliquer sans l'agent :**
  - **Architecture de la double palette CSS (Variables & Mode Sombre) :** Définir les jetons de design via des propriétés personnalisées CSS (`:root` et `html.dark`) permet une bascule instantanée sans recalcul de bundle JS ni scintillement d'affichage (FOUC).
  - **Découplage Tri Client vs Pagination Serveur :** Le tri interactif par date ou likes sur la page courante est géré par un signal réactif calculé (`computed()`) pour offrir une réponse utilisateur instantanée tout en respectant scrupuleusement le contrat d'API paginée côté serveur.
  - **Approche modulaire de l'éditeur riche avec pièces jointes in-text :** Les pièces jointes sont représentées dans le texte par des jetons sémantiques normalisés (`[📎 PIÈCE JOINTE DANS LE TEXTE : filename (meta)]`), ce qui permet une persistance simple au format texte dans MongoDB tout en offrant un rendu visuel riche (téléchargement, aperçu) lors de la prévisualisation et de la consultation du projet.
---

# Mission 3 — Éditeur Markdown, Images Intégrées et Couverture Choisie

- **Objectif :**
  - Permettre l'édition et la prévisualisation sécurisée du Markdown pour les tutoriels : aucun HTML brut utilisateur, aucun usage de `bypassSecurityTrustHtml` sur le contenu, liens restreints aux protocoles sécurisés (`http:`, `https:`, `mailto:`), et résolution contrôlée des images locales via les pièces jointes accessibles du post (rejet des images externes pour empêcher le pistage et les failles SSRF).
  - Implémenter le choix et le retrait explicite de l'image de couverture via `PUT /api/posts/:id/cover` avec vérification de l'auteur, rejet des posts archivés (`400 Bad Request`), vérification de la famille `image`, et garantie d'unicité atomique sous concurrence via `Post.findOneAndUpdate` avec `arrayFilters` disjoints.
  - Supprimer le fallback silencieux dans `toPostPreview` (si la couverture est retirée, `coverUrl` est strictement `null`).
- **Prompt principal :**
  > « Mission 3 — Éditeur Markdown, images intégrées et couverture : Ajouter l’édition et la prévisualisation du Markdown avec un rendu sécurisé : pas de HTML brut utilisateur, pas de bypassSecurityTrustHtml sur le contenu du post, liens limités aux protocoles autorisés et images intégrées résolues uniquement depuis des pièces jointes accessibles. Implémenter le choix et le retrait explicites de la couverture via PUT /api/posts/:id/cover. Respecter les droits de l’auteur, rejeter la modification d’un post archivé et garantir l’unicité de la couverture en cas de requêtes concurrentes. Supprimer le fallback qui réaffiche automatiquement la première image lorsqu’une couverture a été retirée. Tester les cas normaux, les refus d’accès et les entrées Markdown dangereuses. »
- **Fichiers modifiés :**
  - `backend/src/utils/postProjections.js` : suppression du fallback silencieux à la première image dans `toPostPreview`, ajout de `isCover` dans `toPostDetail`.
  - `backend/src/routes/posts.js` : route `PUT /api/posts/:id/cover` avec atomicité par filtres disjoints `arrayFilters`.
  - `backend/test/cover.test.js` : 7 tests d'intégration backend (sélection, retrait, rejet PDF, rejet non-auteur, rejet archivé, unicité sous concurrence).
  - `API_CONTRACT.md` : documentation de `PUT /api/posts/:id/cover`.
  - `frontend-starter/src/app/shared/models/post.model.ts` : ajout de `isCover?: boolean`.
  - `frontend-starter/src/app/shared/services/post.service.ts` & `spec.ts` : méthode `setCover(postId, attachmentId)`.
  - `frontend-starter/src/app/shared/services/markdown.service.ts` & `spec.ts` : service de rendu Markdown sécurisé (échappement HTML brut préalable, whitelist de protocoles, neutralisation de balises et scripts dangereux, résolution d'images locales).
  - `frontend-starter/src/app/components/posts-management-page/` : boutons de couverture et prévisualisation Markdown en direct.
  - `frontend-starter/src/app/components/post-detail-page/` : rendu du tutoriel via `MarkdownService` avec liaison `[innerHTML]="renderedContent()"`.
- **Preuves de fonctionnement :**
  - Tests Backend : **225 passants sur 225 (4 suites, 100% succès)** (`npm test` dans `backend/`).
  - Tests Frontend : **249 passants sur 249 (19 suites, 100% succès)** (`npm test -- --watch=false` dans `frontend-starter/`).
  - Compilation Frontend de production : **Build réussi sans erreur en 10.4s** (`npm run build` dans `frontend-starter/`).
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi refuser `bypassSecurityTrustHtml` sur le contenu :** Cette méthode neutralise la protection XSS native d'Angular. Si un auteur injectait du code JavaScript malveillant (ex: balise `<script>` ou attribut inline `onerror`), celui-ci s'exécuterait directement dans le navigateur du lecteur. Échapper le HTML brut avant de parser les balises Markdown garantit que seule une structure sémantique saine est générée.
  - **Pourquoi bloquer les images externes :** Les images externes (`![alt](https://...)`) permettent de traquer les utilisateurs via leur adresse IP lors de l'affichage du post et posent des risques de contenu mixte ou d'indisponibilité. En limitant les images aux pièces jointes autorisées (`attachment:<id>`), on garantit le respect de la vie privée et l'intégrité du contenu.
  - **Comment garantir l'unicité de la couverture sous concurrence :** En utilisant `findOneAndUpdate` avec des `arrayFilters` disjoints (`other._id: { $ne: targetId }` et `target._id: targetId`), MongoDB effectue la mise à zéro des anciennes couvertures et l'activation de la nouvelle en une transaction atomique au niveau du document, empêchant tout état incohérent avec plusieurs couvertures.

---

# Mission 4 — Commentaires Sécurisés et Lecteur PDF Natif avec Repli

- **Objectif :**
  - Ajouter la gestion des commentaires selon la matrice d'accès du post : lecture autorisée aux visiteurs disposant d'un `X-Share-Token` valide sur un post link, mais authentification active obligatoire pour commenter (`401 Unauthorized` pour un anonyme).
  - Interdire l'écriture sur les posts archivés (`400 Bad Request`) et par les comptes suspendus (`403 Forbidden`).
  - Permettre la suppression d'un commentaire par son auteur ou par un administrateur, sans donner à l'administrateur d'accès implicite aux fichiers privés du projet.
  - Ajouter un lecteur PDF intégré conditionnel (`<object [data]="safePdfBlobUrl" type="application/pdf">`) utilisant exclusivement des Blob URLs créées depuis des fichiers autorisés (`getAttachmentBlob()`), avec bouton de téléchargement permanent, état de repli accessible (fallback si le navigateur ou la CSP restreint l'objet), et libération systématique des ObjectURLs en mémoire via `URL.revokeObjectURL()`.
- **Prompt principal :**
  > « Mission 4 — Commentaires sécurisés et lecteur PDF : Ajouter les commentaires en respectant les droits de lecture du post. Un visiteur disposant d’un X-Share-Token valide peut lire les commentaires d’un post link, mais doit être connecté pour commenter. Interdire l’écriture sur les posts archivés et par les comptes suspendus. Permettre la suppression par l’auteur du commentaire ou par un administrateur, sans donner à l’administrateur un accès implicite au contenu et aux fichiers privés. Ajouter un lecteur PDF intégré uniquement si la politique CSP et le navigateur le permettent, avec un bouton de téléchargement sécurisé toujours visible et un état de repli. N’utiliser pour le lecteur que des Blob URLs créées par l’application à partir de fichiers obtenus via les contrôles d’accès existants ; libérer ces URLs lorsqu’elles ne sont plus utilisées. Tester les variantes d’accès, notamment les posts link, les posts verrouillés, les archives et les comptes suspendus. »
- **Fichiers modifiés :**
  - `backend/src/models/Comment.js` : modèle Mongoose pour les commentaires avec validation de longueur (1-1000 caractères) et indexation chronologique.
  - `backend/src/routes/posts.js` : routes `GET /api/posts/:id/comments`, `POST /api/posts/:id/comments` et `DELETE /api/posts/:id/comments/:cid`.
  - `backend/test/comments.test.js` : 9 tests d'intégration backend (lecture anonyme post public, lecture post link avec token et refus sans token, obligation d'authentification pour commenter sur post link, rejet post archivé, rejet compte suspendu, validation texte, suppression auteur/admin, isolation stricte admin sur fichiers privés).
  - `API_CONTRACT.md` : documentation de `PostComment` et des routes de commentaires dans la matrice d'accès.
  - `frontend-starter/src/app/shared/models/post.model.ts` : interface `PostComment`.
  - `frontend-starter/src/app/shared/services/post.service.ts` & `spec.ts` : méthodes `getComments()`, `addComment()`, et `deleteComment()`.
  - `frontend-starter/src/app/components/post-detail-page/` : intégration des commentaires, du visualiseur PDF `<object>`, du bouton de téléchargement et de la révocation mémoire.
  - `frontend-starter/src/app/components/post-detail-page/post-detail-page.spec.ts` : tests unitaires des fonctionnalités de commentaires et visualiseur PDF.
  - `frontend-starter/src/app/components/shared-post-page/` & `spec.ts` : extension de la consultation partagée avec commentaires et visualiseur PDF.
- **Preuves de fonctionnement :**
  - Tests Backend : **234 passants sur 234 (5 suites, 100% succès)** (`npm test` dans `backend/`).
  - Tests Frontend : **259 passants sur 259 (19 suites, 100% succès)** (`npm test -- --watch=false` dans `frontend-starter/`).
  - Compilation Frontend de production : **Build réussi sans erreur en 9.19s** (`npm run build` dans `frontend-starter/`).
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi un visiteur avec `X-Share-Token` doit être connecté pour commenter :** Le secret de partage confère un droit de consultation du contenu partagé, mais publier un commentaire engage l'identité d'un utilisateur et crée une entrée liée à un compte actif. Autoriser l'écriture anonyme sans session ouvrirait une faille majeure de spam et de harcèlement non attribuable.
  - **Pourquoi l'archivage interdit l'écriture :** L'archivage est une mesure de retrait ou de gel suite à une modération. Permettre des ajouts de commentaires sur un contenu archivé contournerait le verrouillage de la modération.
  - **Gestion de la mémoire avec les Blob URLs :** `URL.createObjectURL(blob)` crée une référence directe vers les données binaires en mémoire dans le navigateur. Ces références ne sont pas automatiquement nettoyées par le ramasse-miettes tant que le document est actif. L'invocation systématique de `URL.revokeObjectURL(url)` dans `ngOnDestroy()` et lors de la fermeture du visualiseur garantit l'absence de fuite mémoire lors d'une utilisation prolongée de l'application.

---

# Mission Corrective — Parcours de Création et Consultation des Posts

- **Objectif :** Corriger de manière exhaustive cinq anomalies fonctionnelles, ergonomiques et d'accessibilité avant d'entamer la Mission 5 :
  1. *Téléversement direct des pièces jointes dès la création :* Sélection des fichiers directement dans le formulaire initial (`PostsManagementPageComponent`), enchaînement transparent `createPost` puis `uploadAttachments`, retour d'état pas-à-pas, gestion granulaire des erreurs et interdiction de déclarer un succès complet si l'envoi de fichiers échoue après la création du brouillon.
  2. *Suppression du doublon du contrôle d'avatar sur `/profile` :* Remplacement des deux contrôles (bouton natif « Browse / Parcourir » et bouton personnalisé) par un unique contrôle accessible (`.sr-only` sur l'input natif, label bouton stylé avec `tabindex="0"`, focus visible et gestion des touches Clavier Entrée/Espace).
  3. *Cartes de posts intégralement cliquables :* Dans le catalogue (`PostsPageComponent`) et les profils créateurs (`CreatorProfilePageComponent`), application du pattern accessible `.card-stretched-link`, suppression du bouton redondant « Voir le post / Consulter », et préservation des interactions indépendantes (profil créateur, tags) avec `.card-interactive-element`.
  4. *Compteur de commentaires avant ouverture du post :* Fourniture par le backend du champ `commentsCount: number` calculé par agrégation sur toutes les listes de posts (`GET /api/posts`, `/api/posts/my`, `/api/creators/:id/posts`, `/posts/:id`, etc.) sans fuite sur les posts verrouillés, affichage d'un badge 💬 sur les cartes et actualisation réactive dynamique lors de l'ajout ou de la suppression d'un commentaire sur la page de détail.
  5. *Correction de l'ouverture directe de `/posts/:id` :* Résolution du problème d'écran blanc en accès direct (nouvel onglet, session vierge, F5) via la souscription réactive à `route.paramMap`, l'ajout d'une route canonique de redirection (`post/:id` vers `posts/:id`), l'ajout d'un bloc de repli explicite `@else` en cas d'erreur ou d'état inattendu, et la configuration du middleware Express SPA fallback pour les routes Angular.
- **Prompt principal :**
  > « Mission corrective — parcours de création et consultation des posts  
  > Avant de commencer la Mission 5, corrige les cinq problèmes ci-dessous. Ne lance pas la Mission 5 dans cette intervention.  
  > 1. Téléverser les pièces jointes dès la création (transparent, étapes, gestion erreurs sans faux succès).  
  > 2. Supprimer le doublon du contrôle d’avatar (/profile, un seul contrôle visible et accessible).  
  > 3. Rendre toute la carte de post cliquable (stretched link, supprimer bouton redondant, préserver liens auteur/tags).  
  > 4. Afficher le nombre de commentaires avant l’ouverture du post (backend count sans fuite, badge UI, refresh direct).  
  > 5. Corriger l’ouverture directe de /posts/:id (aucun écran blanc, route canonique, repli d'erreur, SPA fallback).  
  > Validation attendue : tests de régression pertinents, tests backend/frontend passants et build. »
- **Fichiers modifiés :**
  - `backend/src/utils/postProjections.js` : enrichissement des projections `toPostPreview`, `toPostDetail` et `toPostAuthorManagement` avec `commentsCount`.
  - `backend/src/routes/posts.js` : calcul des compteurs de commentaires via pipeline d'agrégation `Comment.aggregate` et `Comment.countDocuments` sur l'ensemble des routes catalogue, posts personnels, détail, aperçu verrouillé, création, mise à jour, publication et couverture.
  - `backend/src/routes/creators.js` : agrégation des compteurs de commentaires sur `GET /api/creators/:id/posts`.
  - `backend/src/routes/admin.js` : comptage documentaire des commentaires sur la modération.
  - `backend/src/app.js` : middleware Express 5 compatible pour le repli SPA vers `index.html` pour tout accès direct en GET non-API.
  - `backend/package.json` : fiabilisation de l'exécution séquentielle des tests sous Windows (`node --test --test-concurrency=1`).
  - `backend/test/posts.test.js` & `backend/test/comments.test.js` : mocks Mongoose pour isoler les tests unitaires purs et tests de régression d'intégration sur `commentsCount`.
  - `frontend-starter/src/app/shared/models/post.model.ts` : ajout de `commentsCount: number` aux modèles `PostPreview` et `PostDetail`.
  - `frontend-starter/src/app/routes.ts` : redirection canonique `post/:id` vers `posts/:id`.
  - `frontend-starter/src/styles.css` : classes utilitaires `.sr-only`, `.card-stretched-link::after`, et `.card-interactive-element`.
  - `frontend-starter/src/app/components/profile-page/` : suppression du doublon d'avatar, input `.sr-only` lié par `id`/`for`, navigation clavier.
  - `frontend-starter/src/app/components/posts-page/` : titre en `.card-stretched-link`, badge `💬 {{ post.commentsCount }}`, suppression du bouton redondant `btn-view`.
  - `frontend-starter/src/app/components/creator-profile-page/` : titre en `.card-stretched-link`, badge `💬 {{ post.commentsCount }}`, suppression de `btn-consult`.
  - `frontend-starter/src/app/components/post-detail-page/` : souscription réactive à `this.route.paramMap`, mise à jour réactive de `commentsCount` lors de l'ajout/suppression de commentaire, bloc de repli explicite `@else` garantissant l'absence de page blanche.
  - `frontend-starter/src/app/components/posts-management-page/` : sélection de pièces jointes dès la création, suivi par signaux (`creationUploadProgress`, `creationSelectedFiles`), enchaînement `createPost` puis `uploadAttachments`, avertissement clair sans faux succès si l'upload échoue, réinitialisation à l'annulation.
  - `frontend-starter/src/app/components/**/*.spec.ts` : mise à jour des mocks stricts et ajout de tests de régression dédiés pour chacun des 5 points.
- **Preuves de fonctionnement :**
  - Tests Backend : **235 passants sur 235 (5 suites, 100% succès)** (`cmd /c npm test` dans `backend/`).
  - Tests Frontend : **269 passants sur 269 (19 suites, 100% succès)** (`cmd /c npm test -- --watch=false` dans `frontend-starter/`).
  - Compilation Frontend de production : **Build réussi sans erreur en 16.5s** (`cmd /c npm run build` dans `frontend-starter/`).
- **Ce que je sais expliquer sans l'agent :**
  - **Pattern `.card-stretched-link` vs gestionnaire de clic sur `<div>` :** Un simple `(click)` sur un conteneur `<div>` casse l'accessibilité : l'élément n'est pas focalisable au clavier par défaut, n'a pas de sémantique de lien pour les lecteurs d'écran et empêche l'action native du navigateur « Clic droit → Ouvrir dans un nouvel onglet ». Le pseudo-élément CSS `::after` positionné en `absolute` sur le lien du titre recouvre toute la carte (`position: relative`), rendant la carte cliquable tout en conservant une sémantique HTML `<a>` irréprochable. Les éléments interactifs secondaires (profil de l'auteur, boutons de tags) sont isolés grâce à `.card-interactive-element` (`position: relative; z-index: 2`).
  - **Gestion de l'accès direct `/posts/:id` sans écran blanc :** Un écran blanc provient généralement soit d'un serveur de fichiers qui renvoie 404 sur les URLs de deep-linking SPA (résolu par le repli Express vers `index.html`), soit d'un composant Angular qui utilise un snapshot figé non réactif ou une condition `@if/@else if` dont aucune branche n'est satisfaite quand les données sont nulles ou en erreur. La souscription à `route.paramMap`, combinée à un état explicite de chargement, d'erreur et un bloc `@else` d'ultime recours, garantit un rendu visuel utile en toute circonstance.
  - **Comptage des commentaires et posts verrouillés :** Le décompte est réalisé par agrégation MongoDB `$lookup`/`$group` au niveau du document post sans exposer les documents de la collection `comments`. Ainsi, un visiteur peut savoir qu'un post restreint fait l'objet de 12 commentaires sans qu'aucune fuite de métadonnée (texte, auteur du commentaire) ne soit possible.

---

# Corrections Vérifiées en Navigateur — Accès Direct aux Routes & Cliquabilité des Cartes

- **Objectif :** Résoudre deux défauts identifiés après le commit initial :
  1. *Écran blanc à l'ouverture directe d'un post ou d'un créateur :* Sur `localhost:4200`, ouvrir `/posts/:id` ou `/creators/:id` dans un nouvel onglet provoquait des requêtes relatives `GET /posts/main.js` et `GET /posts/styles.css` retournant `index.html` (MIME `text/html`), rejetées par le navigateur avant même le démarrage d'Angular.
  2. *Première ligne de cartes partiellement cliquable :* Le survol mettait toute la carte en évidence, mais seule la partie basse ouvrait le post. Inspecter et corriger la cause sous-jacente (absence de `position: relative` sur `.post-card`, couverture `.cover-wrapper` interceptant les clics au-dessus du pseudo-élément, z-index des éléments interactifs).
- **Prompt principal :**
  > « Correction vérifiée en navigateur, puis Mission 5  
  > Je constate encore deux défauts après le commit 0c9037a. Corrige-les avant de commencer la Mission 5.  
  > 1. Écran blanc à l’ouverture directe d’un post ou d’un créateur (base href, main.js et styles.css servis depuis la racine).  
  > 2. Première ligne de cartes partiellement cliquable (cause sous-jacente de superposition/z-index, haut, centre et bas ouvrent le post, clics auteur/tags préservés).  
  > Preuve demandée en navigateur réel avec F5 et contrôle Réseau. »
- **Diagnostic et solution technique :**
  - **Cause de l'écran blanc :** La balise `<base href="/" />` était absente du `<head>` de `src/index.html`, et les options `"index"` et `"baseHref"` n'étaient pas explicitées dans `angular.json`. Dès lors qu'une URL comportait un sous-niveau de chemin (`/posts/...` ou `/creators/...`), le navigateur résolvait les balises `<script src="main.js">` relativement à `/posts/` au lieu de la racine `/`. Vite dev-server renvoyait alors `index.html` (type MIME `text/html`), provoquant un blocage strict des modules ES par le navigateur. L'ajout de `<base href="/" />` dans `src/index.html` et de `"baseHref": "/"` dans `angular.json` force la résolution absolue de tous les assets depuis `/`.
  - **Cause du clic partiel sur les cartes :** `.post-card` était en `position: static` (par défaut). Le pseudo-élément `.card-stretched-link::after` (`position: absolute; inset: 0`) s'ancrait donc sur le premier ancêtre positionné global au lieu de la carte elle-même. De surcroît, `.cover-wrapper` (la moitié haute de 180px) possédait `position: relative` avec un `z-index: 2`, passant au-dessus du lien étendu qui avait un `z-index: 1`. Seule la moitié basse (`.card-content`) laissait passer le clic. La solution a consisté à appliquer `position: relative;` sur `.post-card`, `pointer-events: none;` sur `.cover-wrapper` (qui ne contient aucun contrôle cliquable), élever `.card-stretched-link::after` à `z-index: 5` et positionner les éléments interactifs (`.author-link`, `.tag`, `.card-actions`) à `z-index: 10`.
- **Fichiers modifiés :**
  - `frontend-starter/src/index.html` : ajout de `<base href="/" />` dans `<head>`.
  - `frontend-starter/angular.json` : déclaration explicite de `"baseHref": "/"` et `"index": "src/index.html"`.
  - `frontend-starter/src/styles.css` : ajustement du `z-index: 5` pour `.card-stretched-link::after` et `z-index: 10` pour `.card-interactive-element`.
  - `frontend-starter/src/app/components/posts-page/posts-page.css` : ajout de `position: relative` sur `.post-card` et `pointer-events: none` sur `.cover-wrapper`.
- **Preuves de fonctionnement :**
  - **Vérification réelle en navigateur (Microsoft Edge via protocole CDP) :**
    - Navigation directe vers `http://localhost:4200/posts/6acf3e9794a51b6c83bb4e6f` : `main.js` servi en `text/javascript` (304), `styles.css` servi en `text/css` (304).
    - Rechargement F5 (`Page.reload`) : confirmation que les deux fichiers sont servis depuis la racine `/` avec leur type MIME valide.
    - Navigation directe vers `http://localhost:4200/creators/6acfb2fcd53e781c55ab4803` et rechargement F5 : 100% succès avec bon type MIME.
    - Hit-testing de la première ligne de cartes du catalogue (`document.elementFromPoint`) :
      - *Haut de carte (zone couverture / badges) :* cible résolue sur `<a class="card-stretched-link">` pointant vers `/posts/:id`.
      - *Centre de carte (titre / description) :* cible résolue sur `<a class="card-stretched-link">` pointant vers `/posts/:id`.
      - *Bas de carte (espaces du pied de carte) :* cible résolue sur `<a class="card-stretched-link">` pointant vers `/posts/:id`.
      - *Avatar et nom auteur :* cible résolue sur `.author-link` pointant vers `/creators/:id`.
      - *Tag cliquable :* cible résolue sur `<button class="tag card-interactive-element">`.
  - **Tests Backend :** 235 passants sur 235 (`cmd /c npm test`).
  - **Tests Frontend :** 269 passants sur 269 (`cmd /c npm test -- --watch=false`).
  - **Compilation Frontend de production :** Build réussi en 11.8s.
  - **Commit local dédié :** `36ce0df` (`fix(navigation): base href pour chargement direct d'url et cliquabilite totale des cartes`).
- **Ce que je sais expliquer sans l'agent :**
  - **Rôle de `<base href>` dans une SPA :** Dans une SPA gérée par Angular Router, les routes HTML sont virtuelles (gérées côté client par l'History API). Lorsque l'utilisateur rafraîchit la page ou entre directement sur `/posts/123`, le serveur renvoie le fichier physique `index.html`. Si la balise `<base href="/">` est absente, le navigateur prend comme URL de base `/posts/` et tente de charger `<script src="main.js">` sur `/posts/main.js`. Avec `<base href="/">`, toutes les URLs relatives de ressources sont obligatoirement préfixées par la racine de l'application.
  - **Contexte d'empilement (Stacking Context) et Stretched Link :** Un élément en `position: absolute` avec `inset: 0` cherche le premier parent dont la position n'est pas `static`. Si la carte parent n'a pas `position: relative`, le lien étendu s'étend sur le body ou le conteneur principal. De plus, les éléments positionnés enfants avec un `z-index` plus élevé intercepteraient les clics à la place du lien étendu, d'où la nécessité de neutraliser les clics sur les éléments purement décoratifs (`pointer-events: none`) et de hiérarchiser rigoureusement les z-index entre le lien étendu (z-index 5) et les contrôles interactifs internes (z-index 10).

---

# Mission 5 — Recherche Avancée, Tris Déterministes & Syntaxe #tag

- **Objectif :** Finaliser le catalogue et la recherche de tutoriels/créations :
  1. *Affichage de la date de publication :* Rendre la date de publication (`publishedAt`) visible et formatée directement sur les cartes du catalogue avant tout clic, sans date factice en dur.
  2. *Tris déterministes sur l'ensemble de la base :* Implémenter les tris par date décroissante (`date-desc`, par défaut), date croissante (`date-asc`), popularité (`likes-desc`) et pertinence (`relevance`). Le tri par likes doit agréger la collection `likes` directement dans le pipeline MongoDB avant la pagination `$facet` pour que les pages de pagination reflètent le tri global.
  3. *Syntaxe `#tag` dans la recherche :* Permettre à l'utilisateur de saisir des hashtags dans la barre de recherche (ex. `#origami` ou `table #bois #atelier`). Extraire automatiquement ces tags, les fusionner avec les filtres existants (règle `$all` stricte et dédoublonnage), et n'appliquer la recherche textuelle que sur les mots résiduels non-tags (si la recherche ne contient que des tags, aucun terme texte n'est recherché).
  4. *Préservation de la matrice d'accès et pagination :* Garantir l'exclusion totale des brouillons, posts archivés et auteurs suspendus lors de tous les tris, et actualiser la pagination à la page 1 lors de chaque changement de tri.
- **Prompt principal :**
  > « Mission 5  
  > Après validation de ces deux points, réalise la Mission 5 du plan révisé : date de publication sur les cartes, tris déterministes (date, likes et pertinence selon le contexte), et recherche avec syntaxe #tag. Respecte la matrice de visibilité et vérifie le résultat de la pagination après tri.  
  > Fais un second commit local distinct pour la Mission 5. Exécute les tests backend et frontend ainsi que le build après chaque étape. Mets à jour les rapports du projet avec les résultats exacts et indique précisément ce qui a été vérifié dans un navigateur, par opposition à ce qui a seulement été vérifié par les tests. »
- **Plan proposé et réalisation :**
  1. *Backend (`backend/src/routes/posts.js`) :*
     - Validation stricte du paramètre `sort` : accepte `date-desc`, `date_desc`, `date-asc`, `date_asc`, `likes-desc`, `likes_desc`, `relevance` ; renvoie `400 Bad Request` en cas de critère inconnu.
     - Extraction regex `/#([a-zA-Z0-9-]+)/g` sur `req.query.query` : normalisation en minuscules, dédoublonnage et injection dans `tagList` avec les éventuels tags passés via `req.query.tags`. Nettoyage de la chaîne textuelle `textQuery`.
     - Intégration de l'étape `$lookup` sur la collection `likes` après le filtrage `$match` lorsque `sortCriteria === 'likes_desc'` avec `$addFields: { likesCount: { $size: "$postLikes" } }`.
     - Tri déterministe dans `$facet.docs` :
       - `likes_desc` : `{ $sort: { likesCount: -1, publishedAt: -1, _id: -1 } }`
       - `date_asc` : `{ $sort: { publishedAt: 1, createdAt: 1, _id: 1 } }`
       - `relevance` : `{ $sort: { score: { $meta: "searchScore" }, publishedAt: -1, _id: -1 } }` (ou repli par date en B-tree)
       - `date_desc` : `{ $sort: { publishedAt: -1, createdAt: -1, _id: -1 } }`
     - `$skip` et `$limit` appliqués après le tri dans `$facet.docs`.
  2. *Frontend Models & Services :*
     - Ajout de `sort?: 'date-desc' | 'likes-desc' | 'date-asc' | 'relevance'` dans `PostFilterParams` (`post.model.ts`).
     - Prise en charge du paramètre `sort` dans `PostService.getPosts()` (`post.service.ts`).
  3. *Frontend UI & Composant (`PostsPageComponent`) :*
     - Typage `SortCriteria` étendu avec `'relevance'`.
     - `setSortCriteria(criteria)` : met à jour le Signal et déclenche `this.loadPosts(1)` pour un tri global serveur.
     - Affichage d'un bouton de tri interactif « 🎯 Pertinence » dès qu'une recherche textuelle est active (`appliedQuery()`), activé par défaut lors d'une nouvelle recherche.
     - Réinitialisation du tri vers `date-desc` lorsque la recherche est effacée (`clearSearch()`).
     - Nettoyage des fallbacks de date en dur dans le template : affichage de `(post.publishedAt | date:'dd MMM yyyy') || 'Date inconnue'` à la fois sur le badge de couverture et dans les métadonnées de la carte.
- **Fichiers modifiés :**
  - `backend/src/routes/posts.js` : extraction `#tag` dans `query`, validation et pipeline de tri déterministe avec calcul dynamique des likes.
  - `backend/test/search.test.js` : 7 nouveaux tests d'intégration backend (rejet de tri invalide 400, tri `date-desc`, tri `date-asc`, tri `likes-desc` calculé en base avec pagination, recherche pure `#tag`, recherche mixte texte + `#tag`, fusion et dédoublonnage de tags inline).
  - `frontend-starter/src/app/shared/models/post.model.ts` : champ `sort` dans `PostFilterParams`.
  - `frontend-starter/src/app/shared/services/post.service.ts` : transmission du paramètre `sort` dans la requête HTTP.
  - `frontend-starter/src/app/components/posts-page/posts-page.ts` : tri serveur avec remise à la page 1, sélection automatique de la pertinence lors de la recherche et réinitialisation à l'effacement.
  - `frontend-starter/src/app/components/posts-page/posts-page.html` : bouton « 🎯 Pertinence », dates réelles formatées sur la couverture et dans les métadonnées.
  - `frontend-starter/src/app/components/posts-page/posts-page.spec.ts` : 3 nouveaux tests unitaires pour le tri serveur, le bouton pertinence, et le formatage de la date de publication.
- **Preuves de fonctionnement :**
  - **Tests Backend :** **244 passants sur 244 (5 suites, 100% succès)** (`cmd /c npm test` dans `backend/`).
  - **Tests Frontend :** **272 passants sur 272 (19 suites, 100% succès)** (`cmd /c npm test -- --watch=false` dans `frontend-starter/`).
  - **Compilation Frontend de production :** **Build réussi sans erreur en 9.8s** (`cmd /c npm run build` dans `frontend-starter/`).
  - **Vérification réelle en navigateur (Microsoft Edge via CDP) :**
    - *Dates de publication visibles :* Cartes affichant fidèlement leur date (`📅 13 Oct 2026`, `📅 12 Oct 2026`, etc.).
    - *Tri interactif par likes :* Clic sur le bouton « ♥ Plus aimés (Likes) » recharge instantanément le catalogue en plaçant les créations les plus aimées en tête de liste.
    - *Recherche avec syntaxe `#tag` :* Saisie de `#origami` dans l'input de recherche $\rightarrow$ extraction transparente du tag, requête backend ciblée, 3 créations avec le tag `#origami` retournées sans erreur textuelle.
  - **Commit local dédié :** `8297c2b` (`feat(catalog): mission 5 — deterministic sorting, publication date, and #tag search syntax`).
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi le tri par likes doit s'exécuter dans le pipeline MongoDB et non en JavaScript :** Si le tri par likes est fait côté client sur les éléments reçus, il ne trie que les 9 éléments de la page en cours. Un post situé en page 5 avec 100 likes ne remontera jamais en page 1. En intégrant `$lookup` et `$addFields: { likesCount: { $size: "$postLikes" } }` dans le pipeline d'agrégation juste avant le `$sort` et le `$facet`, MongoDB trie l'ensemble des créations de la base, garantissant que la page 1 contient les projets les plus populaires de toute la plateforme.
  - **Pourquoi le calcul des likes doit se situer après le `$match` de filtrage :** Si la jointure `$lookup` avec la collection des likes était faite avant le filtre de sécurité, MongoDB calculerait les likes de tous les posts de la base (y compris les brouillons, les posts privés ou ceux d'utilisateurs suspendus), gaspillant de la mémoire et des cycles processeur pour des documents qui seront de toute façon éliminés par la suite.
  - **Traitement d'une recherche purement composée de hashtags (`#tag1 #tag2`) :** Une recherche textuelle MongoDB ou Atlas Search sur une chaîne vide ou composée de ponctuations peut échouer ou renvoyer des résultats inattendus. En extrayant les tags et en nettoyant la chaîne textuelle, si celle-ci devient vide, le système omet purement et simplement l'étape de recherche textuelle `$search` et applique directement le filtre d'ensemble `$all: ['tag1', 'tag2']` sur le champ indexé `tags`.

---

# Amélioration — Insertion Précise des Pièces Jointes dans les Posts (Glisser-Déposer, Curseur & Jetons Temporaires)

- **Objectif :** Rendre l'insertion des pièces jointes intuitive et précise dans le tutoriel des créations :
  1. *Glisser-déposer direct dans la zone de texte :* Permettre de glisser un ou plusieurs fichiers depuis l'explorateur directement sur le `textarea`, en calculant l'offset d'insertion sous le pointeur de la souris (`caretPositionFromPoint` / `caretRangeFromPoint`).
  2. *Insertion au curseur et remplacement de sélection :* Insérer la référence d'une pièce jointe déjà téléversée ou sélectionnée à la position exacte du curseur, en remplaçant la sélection éventuelle, sans concaténer systématiquement à la fin du texte. Après insertion, rendre le focus à l'éditeur et placer le curseur immédiatement après l'élément inséré.
  3. *Mémorisation anti-perte de focus :* Sauvegarder en continu `selectionStart` et `selectionEnd` (sur `select`, `keyup`, `mouseup`, `focus`, `blur`) et neutraliser la perte de focus lors du clic sur les boutons d'action ou de la barre d'outils grâce à `(mousedown)="$event.preventDefault()"`.
  4. *Jetons temporaires lors de la création initiale :* Comme aucun identifiant de post ni de pièce jointe n'existe avant l'enregistrement, générer des jetons temporaires `attachment:temp:<tempId>` insérés immédiatement dans le texte. Lors de la soumission, créer techniquement le brouillon, téléverser les fichiers, substituer automatiquement les jetons temporaires par leurs références définitives `attachment:<id>` et mettre à jour le post final. En cas d'échec de téléversement, afficher l'erreur par fichier sans laisser de référence rompue.
  5. *Différenciation stricte des types de fichiers :* Rendu adapté selon la nature du média :
     - Image : `![nom](attachment:<id>)` $\rightarrow$ affichée inline avec légende et cadre de prévisualisation.
     - PDF : `[📄 Télécharger nom (PDF)](attachment:<id>)` $\rightarrow$ bloc de téléchargement avec icône et taille.
     - Audio : `[🎵 Écouter nom (Audio)](attachment:<id>)` $\rightarrow$ lecteur audio natif `<audio controls>`.
     - Autre/Archive : `[📎 nom](attachment:<id>)` $\rightarrow$ lien de téléchargement générique.
  6. *Accessibilité & Mobile :* Bouton explicite « ↵ Insérer au curseur » avec `tabindex="0"` et retour visuel (chip de notification d'insertion).
- **Prompt principal :**
  > « Suite du projet — améliorer l’insertion des pièces jointes dans les posts  
  > La Mission 5 est terminée. Avant d’ajouter d’autres fonctionnalités, je veux améliorer le parcours de création et d’édition des posts. Aujourd’hui, la gestion des pièces jointes dans le texte n’est pas assez intuitive.  
  > Résultat attendu : glisser-déposer un fichier directement dans la zone de texte à l'endroit souhaité, cliquer sur une pièce jointe déjà téléversée pour l'insérer au curseur, voir clairement dans l'éditeur et l'aperçu où la pièce jointe sera placée, jetons temporaires locaux lors de la création, distinction image/pdf/audio, bouton au clavier/mobile, tests de régression exhaustifs, vérification navigateur réel et commit dédié. »
- **Plan proposé et réalisation :**
  1. *`MarkdownService` (`markdown.service.ts`) :*
     - Enrichissement du parseur Markdown pour intercepter les liens au format `attachment:<id>` et `attachment:temp:<tempId>`.
     - Rendu des images temporaires avec état d'attente stylisé (`.temp-pending` avec mention « Image en attente d'enregistrement »).
     - Rendu des liens et audios avec badges interactifs et lecteurs natifs.
     - Maintien strict de la rétrocompatibilité avec la syntaxe de repli `[📎 PIÈCE JOINTE DANS LE TEXTE : ...]`.
  2. *`PostsManagementPageComponent` (`posts-management-page.ts` & template) :*
     - Intégration de `@ViewChild('editorTextarea')` et mémorisation systématique de `lastSelectionStart` et `lastSelectionEnd`.
     - Méthode `insertSnippetAtCursor(snippet)` : découpe la valeur courante, remplace la sélection active, restitue le focus et positionne le curseur à `start + snippet.length`.
     - Écouteurs de drag & drop natifs (`dragover`, `dragleave`, `drop`) avec indicateur visuel de survol `.drag-over` et overlay dédié.
     - Calcul du point de dépôt via `calculateDropPosition(event)` avec repli sécurisé sur la dernière position du curseur mémorisée.
     - Système de jetons temporaires avec `WeakMap<File, string>` associant de manière déterministe chaque fichier local à un identifiant unique `temp_<timestamp>_<counter>_<filename>`.
     - Workflow de création étendu dans `onSubmit()` : création du brouillon $\rightarrow$ upload des pièces jointes $\rightarrow$ remplacement regex des jetons `attachment:temp:<tempId>` par `attachment:<matchedId>` $\rightarrow$ finalisation du contenu via `postService.updatePost()`.
     - Ajout des boutons « ↵ Insérer au curseur » avec prévention de l'événement mousedown pour éviter toute perte de sélection.
  3. *Feuille de styles (`styles.css`) :*
     - Classes de feedback pour le drag & drop (`.editor-textarea.drag-over`, `.drop-overlay-indicator`, `.insertion-notice-chip`).
     - Styles typés pour les figures inline, blocs PDF téléchargeables et lecteurs audio intégrés.
- **Fichiers modifiés :**
  - `frontend-starter/src/app/shared/services/markdown.service.ts` : parseur étendu pour tokens d'attachement, images temporaires, audios et PDFs.
  - `frontend-starter/src/app/shared/services/markdown.service.spec.ts` : 6 nouveaux tests pour images/liens inline, jetons temporaires et lecteurs audio.
  - `frontend-starter/src/app/components/posts-management-page/posts-management-page.ts` : gestion du curseur, drag & drop, jetons temporaires, upload et remplacement avant sauvegarde.
  - `frontend-starter/src/app/components/posts-management-page/posts-management-page.html` : template avec écouteurs d'événements, boutons d'insertion, overlay de dépôt et badges.
  - `frontend-starter/src/app/components/posts-management-page/posts-management-page.spec.ts` : 10 nouveaux tests de régression complets (début, milieu, fin, sélection, perte de focus, types de fichiers, multi-fichiers, jetons temporaires).
  - `frontend-starter/src/styles.css` : styles pour le glisser-déposer, les badges temporaires, les liens PDF et lecteurs audio.
- **Preuves de fonctionnement :**
  - **Tests Backend :** **244 passants sur 244 (5 suites, 100% succès)** (`cmd /c npm test` dans `backend/`).
  - **Tests Frontend :** **287 passants sur 287 (19 suites, 100% succès)** (`cmd /c npm test -- --watch=false` dans `frontend-starter/`).
  - **Compilation Frontend de production :** **Build réussi sans erreur en 11.98s** (`cmd /c npm run build` dans `frontend-starter/`).
  - **Commit local dédié :** `4b1bbee` (`feat(editor): in-text attachment insertion with drag-and-drop, cursor positioning, and temporary tokens`).
- **Ce que je sais expliquer sans l'agent :**
  - **Pourquoi le textarea perd sa sélection lors du clic sur un bouton et comment l'empêcher :**
    Dans le modèle d'événements du DOM, un clic de souris déclenche la séquence `mousedown` $\rightarrow$ `focusout` / `blur` $\rightarrow$ `mouseup` $\rightarrow$ `click`. Par défaut, le navigateur transfère immédiatement le focus au bouton cliqué dès l'étape `mousedown`, ce qui fait perdre la sélection active au `textarea`. Pour contrer cela de manière infaillible, on applique deux mécanismes complémentaires :
    1. Sur tous les boutons de la barre d'outils et d'insertion, l'écouteur `(mousedown)="$event.preventDefault()"` neutralise le transfert de focus natif du navigateur : le `textarea` ne déclenche jamais d'événement `blur` et conserve sa sélection active.
    2. Côté composant, les propriétés `lastSelectionStart` et `lastSelectionEnd` sont mises à jour en continu sur les événements `select`, `keyup`, `mouseup` et `focus`. Même si le focus était perdu (par exemple sur mobile ou navigation au clavier), le composant réinjecte le texte à ces coordonnées exactes puis restaure le focus via `textarea.focus()` et `textarea.setSelectionRange()`.
  - **Gestion des jetons temporaires sans ID serveur lors de la création :**
    Lors de la création initiale d'un post, la pièce jointe n'existe pas encore sur le serveur MongoDB/GridFS et ne possède donc aucun `_id`. Si on attendait l'upload final pour insérer la référence, l'utilisateur ne pourrait pas structurer visuellement son tutoriel pendant la rédaction. On génère donc un jeton local éphémère `attachment:temp:<tempId>` associé de manière stable au fichier `File` en mémoire via une `WeakMap`. Lors de la soumission du formulaire, le brouillon est d'abord créé techniquement, puis les fichiers sont téléversés, renvoyant leurs vrais IDs `AttachmentInfo`. Une substitution par expression régulière remplace alors tous les `attachment:temp:<tempId>` par `attachment:<realId>` dans le texte avant d'envoyer le `PUT /api/posts/:id` final. Si un upload échoue, l'enregistrement final est bloqué, une alerte est affichée avec la possibilité de réessayer ou de retirer le fichier concerné, évitant toute référence orpheline en base.
  - **Limites techniques du positionnement lors d'un glisser-déposer sur un `<textarea>` natif :**
    Contrairement à un éditeur WYSIWYG basé sur `contenteditable` (comme ProseMirror, Lexical ou Quill) qui dispose d'arbres de nœuds DOM navigables, un élément HTML `<textarea>` natif est une boîte noire rendue par le moteur de rendu du navigateur. Les API standard de calcul de coordonnées vers caractère (`document.caretPositionFromPoint` en standard W3C et `document.caretRangeFromPoint` sous Blink/WebKit) sont conçues pour les nœuds textuels du DOM et peuvent renvoyer des approximations ou `null` lorsqu'elles sont interrogées sur un `HTMLTextAreaElement`, particulièrement en présence de polices proportionnelles (non-monospace), de marges internes (`padding`), de barres de défilement (`scrollTop`) ou de retours à la ligne Windows (`\r\n`). C'est pourquoi le code implémente une stratégie robuste : tentative d'évaluation précise via l'API du navigateur si disponible, avec repli immédiat et déterministe sur la dernière position connue du curseur (`lastSelectionStart`), garantissant qu'aucun fichier n'est jamais rejeté ni ajouté silencieusement à la fin du texte sans contrôle de l'utilisateur.




