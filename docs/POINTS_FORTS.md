# MakerShare — les mécanismes originaux, en détail

[← Retour au README](../README.md)

L'essentiel du travail n'est pas dans les écrans mais dans la façon dont l'application **protège les contenus privés sans casser l'expérience**. Voici les mécanismes dont je suis le plus fier.

## 1. Aucun fichier n'est servi en statique

Les pièces jointes, couvertures et avatars sont stockés sur disque, mais **aucun dossier d'upload n'est exposé**. Chaque téléchargement passe par une route Express qui vérifie les droits du lecteur sur le post (`canAccessPost`) et bloque les chemins piégés (`resolveSafeAttachmentPath`, anti *path traversal*).

Problème : une balise `<img src>` n'envoie ni JWT ni en-tête personnalisé. Le front télécharge donc les images protégées via `HttpClient` en `Blob`, les garde dans un **cache LRU de 80 entrées** (`PostService`) et les affiche avec `URL.createObjectURL()`, révoquées à la destruction du composant.

## 2. Un lien de partage secret qui ne fuit nulle part

Un post en visibilité `link` est invisible du catalogue et lisible par quiconque possède son URL `/share/:token`, sans compte.

- le secret (32 octets aléatoires) n'est **jamais stocké** : la base ne garde que son **hash SHA-256** ;
- il apparaît dans l'URL de la page, mais **jamais dans les URL des fichiers** : pour télécharger une pièce jointe ou lire les commentaires, Angular l'envoie dans l'en-tête `X-Share-Token`. Il n'atterrit donc ni dans l'historique, ni dans les logs d'accès, ni dans un `Referer` ;
- il expire après 7 jours, l'auteur peut le révoquer (réponse `410 Gone`) ou le régénérer ; les logs serveur affichent `[REDACTED_SHARE_TOKEN]`.

## 3. Découvrable sans rien divulguer : aperçu ≠ détail

Un post réservé aux followers ou aux abonnés reste visible dans le catalogue, mais sous forme d'**aperçu verrouillé** (`isLocked: true`). Les projections DTO (`postProjections.js`) garantissent qu'un aperçu ne contient jamais le `content`, ni les noms de fichiers internes, et que la couverture d'un post verrouillé est forcée à `null` côté serveur.

En cas de refus (`401`/`403`), l'API ne renvoie qu'un message : le front appelle alors une route dédiée `/api/posts/:id/preview` pour afficher le cadenas. Les erreurs restent homogènes et ne laissent rien filtrer.

## 4. Des uploads vérifiés octet par octet, et des quotas qui tiennent en concurrence

- Le type MIME annoncé par le navigateur ne suffit pas : le serveur lit les **premiers octets réels** du fichier (*magic bytes*) pour reconnaître JPEG, PNG, WebP, PDF, MP3, WAV, OGG et M4A, avec une limite par famille (5 / 10 / 25 Mo).
- Les quotas par post (10 fichiers, 50 Mo cumulés) sont appliqués par un **`findOneAndUpdate` conditionnel avec `$expr`** : deux uploads simultanés ne peuvent pas dépasser la limite, ce qu'un simple contrôle en mémoire laisserait passer.
- En cas d'échec (validation, base, disque), les fichiers déjà écrits sont supprimés immédiatement.

## 5. Un abonnement simulé sans double activation

L'abonnement « VIP » de 30 jours (sans paiement, clairement affiché comme simulation) s'appuie sur un **index unique `{ subscriberId, creatorId }`** et une mise à jour atomique conditionnelle. Un double-clic ou deux requêtes parallèles produisent un seul abonnement et un `409 Conflict` explicite (« Abonnement déjà actif jusqu'au … »), jamais un doublon ni une prolongation silencieuse.

## 6. Une modération puissante, mais sans passe-droit

L'administrateur peut **archiver un post** (les visiteurs reçoivent `410 Gone`) et **suspendre un compte** : connexion refusée, JWT déjà émis rejeté immédiatement (`403`), posts retirés du catalogue. En revanche, il **n'a aucun accès implicite aux fichiers privés** des créateurs : sans être follower, abonné ou détenteur du lien, il reçoit `403` comme tout le monde.

Côté session, un changement de mot de passe incrémente un `tokenVersion` qui **révoque tous les anciens JWT**. Et l'intercepteur Angular distingue `401` (session expirée → déconnexion) de `403` (droits insuffisants → on reste connecté et on affiche un message).

## 7. Une recherche tolérante aux fautes, testable hors Atlas

- **MongoDB Atlas Search** avec tolérance aux fautes (`fuzzy`), autocomplétion dès la première lettre (`mode=suggest`) et syntaxe mixte texte + tags : `château #lego #star-wars`.
- Sans Atlas (tests, Docker), ou quand Atlas ne trouve rien, un **moteur de repli maison** prend le relais avec la même tolérance : accents et ligatures ignorés, pluriels, une faute par mot (lettre en trop, oubliée, remplacée ou inversée), recherche dans le titre, la description, l'auteur et les tags, et score de pertinence. Il essaie d'abord tous les mots sans faute, puis avec une faute, puis n'importe quel mot. « chateau », « drgaon » ou « guitare bluse » trouvent ce qu'on cherche, y compris dans l'autocomplétion.
- Recherche **par créateur** (nom ou identifiant), pagination numérotée avec choix du nombre de résultats, et filtres **reflétés dans l'URL** : un F5 ou un lien partagé retrouve exactement la même recherche.

## 8. Un éditeur Markdown où l'on dépose les médias là où l'on écrit

Dans l'espace « Mes créations », on glisse une image, un PDF ou un son **à l'endroit précis du texte** où se trouve la souris (`document.caretPositionFromPoint`). Les fichiers d'un post pas encore enregistré reçoivent un jeton temporaire `attachment:temp:…`, converti en vraie référence à la sauvegarde.

Le rendu Markdown est écrit à la main avec **échappement HTML strict** (scripts, attributs `on*`, liens `javascript:` neutralisés), sans jamais recourir à `bypassSecurityTrustHtml`. Les PDF s'ouvrent dans une visionneuse intégrée et les sons dans un lecteur audio.

## 9. Une évolution sans régression

MakerShare ajoute 8 modèles et des dizaines de routes **sans toucher au contrat de l'application d'origine** : `/api/auth*`, `/api/users/me` et `/api/tracks*` (upload audio Multer, couvertures, pagination, streaming authentifié) sont conservées telles quelles et couvertes par leurs tests historiques. Les anciennes pistes ne sont pas converties en posts ; les comptes créés avant l'ajout des rôles sont traités comme `user` / `active` partout, y compris dans les agrégations.
