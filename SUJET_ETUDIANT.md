# TP1 et TP2/TP3 - Guitar Practice Cloud

Ce TP long viendra s'intégrer plus tard avec une application pour s'entrainer à la guitare. Par exemple: https://mainline.i3s.unice.fr/EndUserAmp2/host/ ou encore celle-ci : https://mainline.i3s.unice.fr/NAM_A2_WAM/. Il pourrait aussi servir de backend à des applications comme https://vocalremover.org/ qui permettent à partir d'un fichier audio ou d'une vidéo YouTube, de séparer les instruments de la piste audio pour la remixer, faire du karaoke, supprimer la piste de guitare, de basse, de piano, pour rejouer par dessus... Pour le moment on va travailler sur un backend et un frontend angular capables de gérer des comptes utilisateurs et l'upload, l'affichage et l'écoute de fichiers audio.

Durée indicative : 5 h 15, éventuellement réparties en deux ou trois séances. Travail en binôme. L'usage d'un agent IA est autorisé, mais chaque binôme doit pouvoir expliquer et défendre le code produit.

## Situation

Le Guitar Amp Host permet de jouer de la guitare dans le navigateur, de configurer un ampli, des effets et un backing track. Le portail Angular réalisé dans ce TP constitue son futur espace cloud : compte utilisateur, profil et bibliothèque audio.

Architecture du TP1 : navigateur Angular -> HTTP/JSON -> API Express/Mongoose fournie -> MongoDB pour les comptes et métadonnées, disque serveur pour les fichiers audio. Angular ne dialogue jamais directement avec MongoDB ou le système de fichiers.

## Objectifs

À la fin du TP, vous saurez : repérer les responsabilités d'une application Angular standalone ; construire des Reactive Forms ; appeler une API avec `HttpClient` ; gérer un utilisateur et une liste avec des Signals ; envoyer un fichier en `multipart/form-data` ; afficher une pagination ; lire un flux audio authentifié ; observer les échanges dans les DevTools.

## Mission préliminaire - Créer votre base MongoDB Atlas (40 min), test avec le backend fourni

Suivre `ATLAS_SETUP.md`. Chaque binôme crée un cluster gratuit, un utilisateur de base et une autorisation réseau temporaire, puis récupère l'URI Node.js.

Si vous suivez pas à pas les instructions de `ATLAS_SETUP.md` vous aurez lancé le backend à la fin, et vérifié que tout est ok.

## Mission préliminaire - test du frontend fourni

Dans un nouveau terminal (conseil : utilisez git bash comme shell dans le terminal), testez le projet front-end angular qui vous est proposé, mais avant, vous devez indiquer l'URI du backend.

Ceci se passe dans le fichier `proxy.conf.json` à la racine du projet frontend. La propriété `target` contient normalement `http://localhost:3000`, vérifiez que votre backend est bien lancé sur ce port. Si ce n'est pas le cas, changez la valeur de la propriété `target` en conséquence.

```bash
cd frontend-starter
npm i
ng serve
```

Compte de démonstration : `demo@example.com` / `Demo1234!`.

Checkpoint : l'API démarre, `.env` reste secret et les collections apparaissent dans Atlas après les premières écritures. Expliquez pourquoi l'URI Atlas appartient au backend et ne doit jamais apparaître dans Angular.

Connectez-vous et uploadez encore quelques fichiers audio (par exemple des `.mp3`). Vous en avez deux de disponibles dans le dossier `frontend-starter/fichiers-audio-de-test`. Vérifiez les requêtes dans les DevTools, onglet Network, filtre XHR/fetch. Où se trouvent les traces du backend et comment les voir ?

## Mission 0 - Cartographier l'application (25 min)

Sans modifier le code, retrouver : le composant racine, la configuration des routes, l'enregistrement de `HttpClient`, les modèles, les services et les pages. Produire un schéma annoté du flux lors d'un clic sur « Se connecter ». Ouvrir `API_CONTRACT.md` et repérer les routes publiques et protégées.

Checkpoint : vous devez pouvoir expliquer pourquoi un composant ne doit pas appeler directement le backend sans passer par un service. Demander à votre assistant IA de vous expliquer le concept de service Angular et son implémentation dans ce projet.

## Mission 1 - Inscription et connexion (65 min)

Cette mission consiste à compléter `AuthService`, `LoginPage` et `RegisterPage` : formulaires réactifs, validations, messages d'erreur, appel de `/auth/register` et `/auth/login`, sauvegarde du JWT, mise à jour du Signal `currentUser`, redirection après succès. Ajouter aussi « déconnexion ». Il faudra certainement également mettre à jour le backend pour que certaines tâches puissent être exécutées.

Avant toute chose : observez les requêtes lors d'une connexion ou d'une mise à jour du nom de l'utilisateur, dans l'onglet Network du debugger de votre navigateur (Ctrl-Shift-I sur Windows, Command-Option-I sur Mac).

Faites-le notamment lorsque vous créez un nouveau compte, vous déconnectez puis vous reconnectez. Vérifiez que tout fonctionne et que l'utilisateur a bien été créé dans MongoDB.

Pour gérer complètement la partie « utilisateur », il manque surtout :

- Déconnexion visible dans l'interface, avec bouton et nettoyage de l'état.
- Restauration automatique du profil au rechargement de l'application lorsque le JWT existe.
- Chargement automatique du profil sur `ProfilePage`, sans devoir cliquer sur « Charger mon profil ».
- États `loading`, succès et erreurs détaillées pour connexion, inscription, chargement et modification.
- Validation complète des formulaires : nom, email, longueur/confirmation du mot de passe, messages sous les champs.
- Redirection cohérente : empêcher l'accès aux pages de connexion si l'utilisateur est déjà connecté.
- Affichage conditionnel de la navigation selon l'état connecté/non connecté.
- Gestion d'un token expiré ou d'une réponse `401`, avec déconnexion automatique et redirection vers `/login`.
- Tests unitaires du service d'authentification, du guard et des composants.

Selon `API_CONTRACT.md`, les fonctionnalités réellement prévues sont : inscription, connexion, consultation du profil et modification du nom. Il n'existe pas d'endpoint prévu pour changer le mot de passe, supprimer un compte ou appeler une déconnexion serveur.

Vous allez, petit à petit, ajouter ces fonctionnalités à l'application. L'idéal, si vous utilisez un assistant IA, est de lui proposer une tâche et de demander un plan d'implémentation ; lisez-le attentivement avant d'implémenter quoi que ce soit. Il est bien de numéroter les tâches et de les ajouter au fur et à mesure dans un fichier `TASKS.md`. Par exemple, demander à votre assistant le texte Markdown correspondant à la tâche, puis lui demander : « implémente la tâche 1 de `TASKS.md` et fais-moi un compte-rendu dans `REPORT.md`, pense à mettre à jour les tests unitaires ».

Après une implémentation, lisez bien le fichier `REPORT.md` avant de passer à la tâche suivante.

À propos, quel modèle utilisez-vous dans votre assistant IA ? Comment savoir combien vous avez consommé de tokens ? Qui peut vous conseiller quel est le meilleur modèle pour une tâche donnée ?

QUESTIONS : quelles sont les différentes routes du backend qui sont utilisées ? Soyez capables de répondre à la question : « où s'effectue la tâche “mise à jour du profil utilisateur”, dans quels fichiers côté back et côté front ? »

## Mission 2 - Bibliothèque paginée (55 min)

Le backend fournit déjà l'endpoint paginé `GET /api/tracks?page=1&limit=5`. Ne modifiez pas le backend pour cette mission : la pagination serveur existe déjà et respecte le contrat `Page<Track>`.

Implémenter ou vérifier `TrackService.list(page, limit)` afin qu'il transmette réellement les paramètres `page` et `limit` à l'API. Le flux attendu est : composant de bibliothèque → `TrackService` → `HttpClient` → `GET /api/tracks?page=...&limit=...`.

Dans le composant de bibliothèque, représenter avec des Signals : `tracks`, `page`, `pages`, `loading` et l'erreur éventuelle rencontrée lors du chargement.

Afficher la bibliothèque avec `@for`, l'état vide avec `@empty` et l'état de chargement avec `@if`. Ajouter les boutons « Précédent » et « Suivant », désactivés lorsque la première ou la dernière page est atteinte.

Après chaque changement de page, effectuer une nouvelle requête HTTP. Il est interdit de récupérer toutes les pistes puis de les découper localement dans Angular. Afficher un message compréhensible en cas d'erreur HTTP et réinitialiser l'état de chargement dans tous les cas.

Checkpoint : vérifier dans l'onglet Network que chaque changement de page déclenche une requête vers `/api/tracks` avec une valeur différente de `page` et la valeur attendue de `limit`. Tester au minimum une liste vide, plusieurs pages, une dernière page incomplète et une erreur d'authentification ou de réseau.

AVANCE : utiliser le composant Paginator de la bibliothèque graphique Angular Material. Allez le voir en action sur https://material.angular.dev/components/paginator/overview

AVANCE : cette option est facultative, mais il existe un plugin Mongoose très puissant, qui s'appelle `aggregate-paginate-v2`. Il est décrit dans les slides Angular dans la partie back-end. Cette tâche consiste à faire en sorte que le backend implémente la pagination à l'aide de ce plugin. Attention, le plugin renvoie au client des données beaucoup plus complètes, il faudra donc également mettre à jour `API_CONTRACT.md` et le frontend.

## Mission 3 - Analyse amélioration de l'upload et de la lecture audio (60 min)

Le backend et le `frontend-starter` fournissent déjà le mécanisme principal d'upload et de lecture sécurisée des fichiers audio. Ne réimplémentez pas ce qui existe déjà et ne modifiez pas le contrat HTTP pour cette mission.

Commencez par identifier dans quels fichiers et quelles méthodes se trouvent : le choix du fichier, la construction du `FormData`, l'appel HTTP d'upload, la récupération du `Blob`, la création de l'`ObjectURL`, l'affectation au lecteur `<audio>` et la révocation de l'ancienne URL. Expliquez le flux complet composant → service → `HttpClient` → API, puis API → `Blob` → `ObjectURL` → lecteur audio.

Vérifiez également dans Network et dans le code comment l'intercepteur ajoute le JWT à la requête audio, et expliquez pourquoi une URL placée directement dans `src` ne reçoit pas automatiquement cet en-tête.

Le backend vérifie déjà que le multipart contient le fichier `audio`, lit le champ `title`, accepte les formats audio prévus et refuse les fichiers de plus de 25 Mo. Identifiez ces contrôles dans le code backend et vérifiez que le frontend construit bien le `FormData` avec exactement `audio` et `title`.

Complétez uniquement ce qui manque côté frontend : effectuer également ces vérifications avant l'appel HTTP, puis afficher une erreur claire si le fichier est invalide. Expliquez pourquoi une validation frontend améliore l'expérience mais ne remplace jamais la validation backend.

Ajoutez ou complétez les états d'interface manquants : chargement, bouton désactivé pendant l'envoi, prévention des doubles soumissions, erreurs du serveur, message de succès, remise à zéro du formulaire et rechargement de la première page.

Présenter les morceaux de manière claire et agréable, par exemple sous forme de cards Angular Material. Chaque card peut afficher le titre, le nom du fichier original, le format, la taille, la date d'ajout et une action de lecture. La présentation doit rester responsive et accessible au clavier.

Vérifiez le mécanisme de lecture déjà présent et complétez seulement ce qui manque : afficher le morceau actuellement en lecture, afficher une erreur audio compréhensible et révoquer l'`ObjectURL` finale lorsque le composant est détruit. Expliquez pourquoi la liste de 100 métadonnées ne charge pas automatiquement 100 fichiers audio et distinguez téléchargement complet en `Blob`, buffering du navigateur et streaming côté serveur.

Questions complémentaires sur la lecture audio :

- Le fichier audio est-il chargé intégralement en mémoire ou réellement streamé pendant la lecture ? Distinguez le comportement du backend et celui de `HttpClient` avec `responseType: "blob"`.
- Le lecteur HTML `<audio>` télécharge-t-il automatiquement les 100 fichiers si 100 lecteurs sont affichés ? Que se passe-t-il dans l'implémentation proposée, où un seul `Blob` est chargé après un clic ?
- Quel est le rôle du buffering du navigateur et en quoi est-il différent d'un `Blob` complet conservé en mémoire ?
- Pourquoi faut-il révoquer les `ObjectURL` lorsque l'on change de piste ou que le composant est détruit ?

En amélioration, ajouter une barre de progression de l'upload, une action de suppression avec confirmation et un rafraîchissement correct de la bibliothèque après suppression. La suppression utilise l'endpoint `DELETE /api/tracks/:id` du contrat, indiqué comme bonus.

Checkpoint : uploader un fichier valide, refuser un fichier invalide, vérifier la requête multipart dans Network, vérifier le type MIME de la réponse audio et écouter une piste après rechargement de la page.

### AVANCÉ

Ajouter une image de couverture pour chaque morceau. Deux approches sont possibles : permettre à l'utilisateur d'uploader une image associée au morceau, ou rechercher une image sur le Web à partir des tags ID3 du fichier audio ou de son nom de fichier.

Cette fonctionnalité avancée doit respecter les règles de sécurité, d'accessibilité et de droits d'utilisation des images. Si elle nécessite de nouvelles données ou de nouveaux endpoints, les proposer et les documenter avant toute implémentation.

## Mission 4 - Fiabilisation et enrichissement du frontend (2 h maximum)

Faire évoluer une application Angular existante sans casser les fonctionnalités des missions précédentes. Ajouter une suppression de piste via `DELETE /api/tracks/:id`, afficher la progression de l'upload avec les événements HTTP Angular et écrire au moins trois tests frontend ciblés.

Le backend fourni reste inchangé pour les missions obligatoires. Identifier d'abord les composants, services, intercepteurs et tests concernés avant de modifier le code.

La suppression doit prévoir confirmation, état d'opération, message de succès ou d'erreur et rechargement de la bibliothèque. La progression doit distinguer absence d'upload, upload en cours, réussite et échec, sans jamais afficher de mot de passe ou de JWT.

Les tests peuvent porter sur `AuthService.login()`, `TrackService.list()`, l'intercepteur JWT, le guard, l'affichage d'une erreur HTTP, la suppression ou la progression d'upload. Ils doivent vérifier URL, méthode, paramètres, headers et résultats simulés sans dépendre de MongoDB.

Lancer les tests frontend et backend disponibles, puis `npm run build`. Dans Network, vérifier une requête `DELETE` après confirmation et une requête d'upload. Dans la console, vérifier qu'aucune erreur inattendue ni donnée sensible ne reste affichée.

## Livrables

- dépôt du frontend complété ;
- capture de deux requêtes Network, login et pagination ou upload ;
- schéma d'architecture annoté ;
- court rapport IA fondé sur `RAPPORT_IA_MODELE.md` ;
- capture Atlas montrant les noms des collections, sans URI, identifiant ni mot de passe ;
- réponses aux questions ci-dessous.

## Questions de compréhension, vous devrez y répondre éventuellement à l'oral pendant un TP noté

1. Pourquoi stocker l'accès HTTP dans un service ?
2. Quelle différence entre le Signal `currentUser` et `localStorage` ?
3. Qui décide du nombre total de pages ?
4. Pourquoi `FormData` plutôt qu'un objet JSON pour l'audio ?
5. Pourquoi l'autorisation doit-elle être vérifiée par Express même si Angular protège une route ?
6. Quelles données sont placées dans MongoDB et lesquelles restent stockées sous forme de fichiers ? Pourquoi ?

## Bonus

Suppression avec confirmation, indicateur de progression d'upload, filtre par titre ou route guard. Le bonus ne compense pas une mission principale non comprise.
