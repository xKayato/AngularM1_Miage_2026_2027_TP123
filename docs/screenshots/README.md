# Index des Captures d'Écran — TP Angular M1 MIAGE

Ce dossier regroupe les preuves d'exécution (DevTools Network et interface utilisateur) référencées dans le rapport `RAPPORT_IA_MODELE.md`.

---

## TP1 — Authentification et Profil
- `tp1_01_login_success_200.png` : Requête `POST /api/auth/login` (200 OK) avec en-têtes.
- `tp1_02_login_failure_401.png` : Requête `POST /api/auth/login` (401 Unauthorized) en cas d'identifiants invalides.
- `tp1_03_profile_get_jwt_200.png` : Requête `GET /api/users/me` avec injection du header `Authorization: Bearer <jwt>`.
- `tp1_04_profile_put_headers_200.png` : Requête `PUT /api/users/me` (200 OK) avec en-têtes.
- `tp1_05_profile_put_payload.png` : Corps JSON envoyé lors de la mise à jour du profil (`{ name: "Demo1" }`).
- `tp1_06_profile_put_response.png` : Réponse JSON retournée par le serveur avec le profil actualisé.

---

## TP2 — Pagination et Streaming Audio
- `tp2_01_pagination_page1_network.png` : Requête `GET /api/tracks?page=1&limit=5` et réponse JSON paginée.
- `tp2_02_pagination_page2_network.png` : Requête `GET /api/tracks?page=2&limit=5` (page 2).
- `tp2_03_pagination_buttons_ui.png` : Boutons de navigation (bouton Suivant désactivé à la dernière page).
- `tp2_04_upload_button_loading_ui.png` : Bouton d'upload désactivé avec état « Envoi en cours... ».
- `tp2_05_upload_success_message_ui.png` : Message visuel de succès lors de l'ajout d'une piste.
- `tp2_06_tracks_cards_list_ui.png` : Liste des cartes de morceaux lisibles (titre, MP3, taille, date d'ajout).
- `tp2_07_audio_stream_jwt_network.png` : Requête `GET /api/tracks/:id/audio` (200 OK, binaire) avec token JWT.
- `tp2_08_audio_blob_dom.png` : Balise `<audio src="blob:http://...">` dans le DOM.
- `tp2_09_audio_playing_badge_ui.png` : Badge « EN ÉCOUTE » et bouton « Rejouer ».
- `tp2_10_audio_error_message_ui.png` : Message d'erreur en cas d'échec de récupération audio.
- `tp2_11_mat_paginator_limit5_ui.png` : Composant Angular Material Paginator (5 pistes par page).
- `tp2_12_mat_paginator_limit10_ui.png` : Changement de taille de page (10 pistes par page).
- `tp2_13_mat_paginator_network.png` : Requêtes HTTP émises dynamiquement lors des changements de page.

---

## TP2 — Options Avancées
- `tp2_bonus_filter_title_d_network.png` : Requête filtrée `GET /api/tracks?title=d`.
- `tp2_bonus_filter_title_song_network.png` : Requête filtrée `GET /api/tracks?title=song`.
- `tp2_bonus_aggregate_paginate_response.png` : Réponse atomique via Mongoose `aggregate-paginate-v2` ($facet).
- `tp2_bonus_aggregate_paginate_headers.png` : En-têtes HTTP de la route paginée agrégée.
- `tp2_bonus_full_ui_overview.png` : Vue d'ensemble de l'interface complète du portail.
- `tp2_bonus_cover_get_jwt_network.png` : Requête sécurisée `GET /api/tracks/:id/cover` sous JWT.
- `tp2_bonus_cover_upload_preview_ui.png` : Prévisualisation miniature de la pochette dans le formulaire d'upload.
- `tp2_bonus_cover_put_update_network.png` : Requête `PUT /api/tracks/:id/cover` pour le remplacement de couverture.

---

## TP3 — Fiabilisation et Enrichissement Frontend
- `tp3_01_upload_progress_bar_ui.png` : Barre de progression animée pendant l'envoi du fichier.
- `tp3_02_delete_buttons_cards_ui.png` : Boutons « Supprimer » sur chaque carte de piste.
- `tp3_03_delete_confirm_dialog_ui.png` : Boîte de dialogue de confirmation préalable à la suppression.
- `tp3_04_delete_snack_bar_toast_ui.png` : Notification toast Angular Material SnackBar de suppression réussie.
