# Passation — reprendre le travail sur Agence IA Studio

Document à lire **en entier** par tout assistant (Claude, ChatGPT/Codex…) avant de toucher au code.
Les règles produit détaillées sont dans `AGENTS.md` (lu automatiquement par Codex) ; ce fichier dit **comment travailler**.

## 1. Où sont les choses

| Quoi | Où |
|---|---|
| Code | GitHub `toure68/agence-ia-studio`, branche `main` |
| App en ligne (principale) | **Render** : https://agence-ia-studio.onrender.com — se met à jour toute seule à chaque fusion dans `main` (`render.yaml`, Francfort, disque `/app/data`) |
| Ancienne app | Railway (`agence-ia-studio-production.up.railway.app`) — bloquée depuis la panne Railway du 21/10, reste en v91. Ne plus s'en servir pour les nouveautés. |
| Base de données | SQLite `/app/data/app.db` sur le disque Render. **Pas de sauvegarde automatique pour l'instant** (voir §6). |
| Sauvegardes de code | branches `sauvegarde/avant-…` + table des mots-clés dans `docs/SAUVEGARDES.md` |
| Tests | `.github/workflows/tests.yml` (pytest + tests d'interface Playwright à la taille iPhone, captures dans `captures/<sha>`) |
| Contrôle en ligne | `.github/workflows/live-check.yml` + `tests/live_check.cjs` : vérifie que le site sert **exactement** la version du dépôt (version + fichiers identiques) |
| Vérifier Render à la demande | pousser `main` fusionnée dans la branche `verif/render` (workflow `verif-render.yml`) |
| Aperçu temporaire | pousser une branche `apercu/...` (workflow `apercu.yml`, base vide, lien public quelques heures) |

## 2. Qui est Mohamed et comment lui parler

- **Uniquement en français.** Il ne lit pas l'anglais.
- Réponses **courtes** : ce qui a été fait et le résultat. Pas de détails techniques sauf s'il les demande.
- Il utilise l'app sur **iPhone** ; il dicte souvent ses messages (fautes de dictée fréquentes : reformuler ce qu'on a compris avant de coder si c'est ambigu).
- Il ne peut pas tester lui-même en permanence : **c'est à l'assistant de vérifier** (tests, captures, contrôle en ligne).
- Limiter les captures d'écran qu'on lui demande.

## 3. Règles de travail (obligatoires)

1. **Avant de coder** : vérifier que la demande est compatible avec les fonctions existantes (`AGENTS.md`). Si elle en remplace ou en casse une, **le dire avant** et le laisser choisir. Ne jamais remplacer une décision validée sans son accord explicite.
2. **Mot-clé de retour avant chaque modification** : pousser l'état actuel de `main` sur `sauvegarde/avant-<nom>` et ajouter une ligne en tête de la table de `docs/SAUVEGARDES.md` (« RETOUR AVANT … »). S'il écrit ce mot-clé, restaurer cet état par une nouvelle PR.
3. **Une branche + une PR par changement**, jamais de commit direct sur `main`.
4. **Changer la version des fichiers** à chaque modification de `static/` : remplacer partout dans `static/admin.html` `?v=prio-vNN-AAAAMMJJ` par le numéro suivant (sinon l'iPhone garde l'ancien code en cache).
5. Ajouter ou adapter un test pour chaque nouveau comportement (lancé lors du test global).
6. **Ne plus demander « Oui » / « Non »** (décision du 22/10) : le travail fini, fusionner et publier directement, puis passer au sujet suivant ; Mohamed demande un retour (mot-clé) si le résultat ne lui va pas. Ne pas lancer de tests GitHub payants à chaque fois (un test global à la fin, quand il le décide).
7. **Après la fusion**, ne dire « c'est en ligne » **qu'après** que le contrôle de version a réussi sur Render (et regarder la capture concernée dans `captures/<sha>`). Ne jamais annoncer une mise en ligne sans preuve.
8. Quand une fonction est retirée : supprimer **tout** (code, styles, tests, notes) — pas de code mort.
9. Noter chaque décision produit dans `AGENTS.md` (une ligne datée).

## 4. Un seul assistant à la fois

- Mohamed indique **qui travaille**. L'autre ne touche à rien pendant ce temps.
- En commençant : `git pull` de `main`, regarder les PR ouvertes ; ne jamais reprendre la branche d'un autre sans le lui dire.
- En s'arrêtant : ne laisser **aucune PR en cours** non signalée ; dire à Mohamed ce qui est fusionné, ce qui ne l'est pas.
- PR anciennes encore ouvertes au 22/10 : #1 et #55 (anciennes, ne pas fusionner sans lui demander).

## 5. État au 22/10/2026 (version v94)

- Accueil iPhone : trésorerie/lecteur en haut, cartes de notifications, pages de fonctions, bonhomme (réglages) à gauche de l'Assistant IA, cadre flottant.
- Lecteur : les actions du message ouvert remplacent la 1re rangée des fonctions (boutons du lecteur, pleine largeur) ; les fonctions passent sur les pages suivantes pendant la lecture.
- Trésorerie dépliée : par-dessus les notifications.
- Réglages lecteur / essais / grille enregistrés dans le compte (`users.prefs`), fond d'écran aussi.

## 6. Reste à faire (proposé, pas encore commencé)

1. **Étape 2 des actions du lecteur** : pages horizontales quand il y a plus d'actions que de place, avec points cliquables (validée en principe, à faire puis lui montrer).
2. **Sauvegarde des données** : bouton « Sauvegarder / Restaurer mes données » (propriétaire) + sauvegarde automatique chaque nuit vers un stockage externe (Backblaze B2 gratuit). Prioritaire avant de vraies données clients.
3. Brancher le domaine **eboncode.com** (acheté chez IONOS) sur Render, si Mohamed le veut.
4. Supprimer le service Railway quand la panne est finie (éviter de payer deux hébergeurs).
