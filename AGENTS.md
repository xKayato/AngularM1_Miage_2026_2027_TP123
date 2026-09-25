# Instructions Générales — Assistant IA (TP Angular M1 MIAGE)

## Règle Absolue : Tenue à jour systématique du Rapport IA (`RAPPORT_IA_MODELE.md`)

À **chaque** étape, mission ou modification significative du code (backend ou frontend) :

1. **Mise à jour immédiate de `RAPPORT_IA_MODELE.md` :**
   - Synchroniser le fichier `RAPPORT_IA_MODELE.md` à la fin de chaque mission ou modification de code.
   - Adopter le style d'un document étudiant : concis, clair, synthétique, sans schémas superflus ni verbiage inutile.
   - Renseigner systématiquement pour la mission concernée :
     - **Objectif** de la mission.
     - **Prompt principal** utilisé.
     - **Plan proposé** et points clés de supervision.
     - **Fichiers modifiés** avec résumé de leur rôle et justification technique.
     - **Preuves de fonctionnement** (tests unitaires, build, captures / contrôles Network).
     - **Ce qu'on sait expliquer sans l'agent** (réponses explicites aux questions posées dans le sujet étudiant `SUJET_ETUDIANT_TP*.md`).

2. **Maintien de l'artifact de suivi :**
   - Mettre également à jour l'artifact technique de suivi (`rapport_ia_suivi.md`) dans le dossier des artifacts pour conserver les explications approfondies et architecturales.

3. **Conventions techniques :**
   - Angular 22 : composants standalone, `inject()`, Signals, Control Flow (`@if`, `@for`, `@empty`), formulaires réactifs, typage strict sans `any`.
   - Ne jamais modifier le contrat API sans accord explicite.
   - Ne jamais journaliser de secret JWT ou mot de passe.
   - Exécuter les tests (`cmd /c npm test`) et vérifier le build (`cmd /c npm run build`) après chaque modification.
