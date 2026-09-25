# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5&title=blues` | JWT | `Page<Track>` (paramètre `title` optionnel, filtre insensible à la casse) |
| POST | `/tracks` | multipart : `audio`, `title`, `cover` (optionnel) | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT | flux binaire de l'image de couverture ou 404 |
| PUT | `/tracks/:id/cover` | multipart : `cover` + JWT | `200 Track` (remplacement et nettoyage de l'ancien fichier) |
| DELETE | `/tracks/:id/cover` | JWT | `204` (suppression de la couverture et du fichier physique) |
| DELETE | `/tracks/:id` | JWT | `204` (supprime piste, fichier audio ET couverture sans orphelin) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`, ainsi que les métadonnées de navigation issues de `mongoose-aggregate-paginate-v2` (`hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`, `pagingCounter`). Chaque élément `Track` expose `id`, `ownerId`, `title`, `originalName`, `mimeType`, `size`, `hasCover` (booléen), `coverUrl` (`/api/tracks/:id/cover` ou `null`) et `createdAt`.

Formats audio acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.
Couvertures acceptées : JPEG, PNG, WebP, 2 Mo maximum, validées par signature binaire (magic bytes) côté serveur.

Erreurs courantes : `400` validation (format refusé, taille dépassée, contenu invalide), `401` authentification, `404` ressource (ou ressource d'un autre utilisateur), `409` email déjà utilisé.
