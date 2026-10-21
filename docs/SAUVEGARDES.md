# Sauvegardes et mots-clés de retour

Quand Mohamed écrit un de ces mots-clés, remettre l'application exactement dans l'état de la branche indiquée
(nouvelle PR qui restaure les fichiers de cette branche, tests verts, puis « Je la mets en ligne ? »).

| Mot-clé | Branche | État sauvegardé |
|---|---|---|
| **RETOUR AVANT CARTES 48** | `sauvegarde/avant-cartes-48` (5b7ed19) | Le 21/10/2026 vers 3 h 15 : cartes de 49 points, restées à 4 sur l'iPhone de Mohamed. |
| **RETOUR AVANT CARTE DE PLUS** | `sauvegarde/avant-carte-de-plus` (e1d825b) | Le 21/10/2026 vers 2 h 50 : petites cartes de 52 points, 4 avec la trésorerie et 2 pendant la lecture, grand espace au-dessus des fonctions. |
| **RETOUR AVANT PILE RETOURNÉE** | `sauvegarde/avant-pile-retournee` (63183bf) | Le 21/10/2026 vers 2 h 30 : la pile des cartes en attente posée juste au-dessus des fonctions, bord étroit en haut et bord large en bas. |
| **RETOUR AVANT FIN DE LISTE** | `sauvegarde/avant-fin-de-liste` (a4bb753) | Le 21/10/2026 vers 2 h : au bout des notifications, « ✓ Fin de la liste » et un bouton « ↑ Revenir à la trésorerie » séparé. |
| **RETOUR AVANT VEILLE SÉPARÉE** | `sauvegarde/avant-veille-separee` (4b1a9df) | Le 21/10/2026 vers 1 h 45 : « Préparer demain » et « Veille concurrentielle » en petites lignes sous les notifications, dans la place libre. |
| **RETOUR AVANT PAGES DE FONCTIONS** | `sauvegarde/avant-pages-fonctions` (0a40895) | Le 20/10/2026 vers 14 h 40 : Assistant IA fixe en haut avec le bouton du compte, date sur la trésorerie, montants colorés, grille des fonctions classique avec « Réserve de fonctions », accueil qui défile. |
| **RETOUR AVANT ASSISTANT EN HAUT** | `sauvegarde/avant-assistant-en-haut` (f3b8a03) | Le 20/10/2026 vers 13 h 30, avec le Mode lecteur et les messages d'essai, mais avant le haut épuré : « Bonjour », pastilles date et actions, barre du haut avec l'entreprise, Assistant IA au-dessus de la grille avec le bouton de grille. |
| **RETOUR AVANT LECTEUR** | `sauvegarde/avant-lecteur` (2122bb9) | Le 20/10/2026 vers 10 h 30, avec les gestes téléphone (balayage, tirer pour actualiser, boutons Appeler/Écrire), avant le Mode lecteur : cartes d'action classiques sous la trésorerie. |
| **RETOUR AVANT CARTES ALLÉGÉES** | `sauvegarde/avant-cartes-allegees` (36e379e) | Le 19/10/2026 vers 20 h 30 : fenêtres en plein écran et trésorerie repliable, mais cartes d'action encore grandes (titres sur plusieurs lignes, dates 2026-10-19) et liste « Voir les N actions » en petite fenêtre. |
| **RETOUR AVANT FENÊTRE DIRECTE** | `sauvegarde/avant-fenetre-directe` (6509e78) | Le 19/10/2026 vers 16 h 50, avec le verre, la grande flèche retour et les champs sombres, mais avant l'ouverture directe des fenêtres : toucher une fonction ouvrait d'abord son résumé (compteurs, 3 lignes, « Voir tout »), l'Assistant IA restait au-dessus. |
| **RETOUR AVANT VERRE** | `sauvegarde/avant-verre` (68eadbe) | Le 19/10/2026, juste avant le design verre dépoli et les fonds d'écran : fond sombre uni, cartes et fenêtres opaques, fenêtres pleine largeur, rangée d'applications en plein écran. |
| — | `sauvegarde/2026-10-19-14h35` (ce3ccbf) | Avant les fenêtres pleine largeur et la rangée en plein écran. |
| — | `sauvegarde/2026-10-19-13h` (17b8f87) | État du 19/10/2026 à 13 h. |

Restaurer sans perdre l'historique : `git checkout <branche> -- static app.py` sur une nouvelle branche, puis PR.
Les comptes gardent leur colonne `wallpaper` en base ; elle est simplement ignorée par l'ancienne version.
