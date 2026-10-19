# Sauvegardes et mots-clés de retour

Quand Mohamed écrit un de ces mots-clés, remettre l'application exactement dans l'état de la branche indiquée
(nouvelle PR qui restaure les fichiers de cette branche, tests verts, puis « Je la mets en ligne ? »).

| Mot-clé | Branche | État sauvegardé |
|---|---|---|
| **RETOUR AVANT FENÊTRE DIRECTE** | `sauvegarde/avant-fenetre-directe` (6509e78) | Le 19/10/2026 vers 16 h 50, avec le verre, la grande flèche retour et les champs sombres, mais avant l'ouverture directe des fenêtres : toucher une fonction ouvrait d'abord son résumé (compteurs, 3 lignes, « Voir tout »), l'Assistant IA restait au-dessus. |
| **RETOUR AVANT VERRE** | `sauvegarde/avant-verre` (68eadbe) | Le 19/10/2026, juste avant le design verre dépoli et les fonds d'écran : fond sombre uni, cartes et fenêtres opaques, fenêtres pleine largeur, rangée d'applications en plein écran. |
| — | `sauvegarde/2026-10-19-14h35` (ce3ccbf) | Avant les fenêtres pleine largeur et la rangée en plein écran. |
| — | `sauvegarde/2026-10-19-13h` (17b8f87) | État du 19/10/2026 à 13 h. |

Restaurer sans perdre l'historique : `git checkout <branche> -- static app.py` sur une nouvelle branche, puis PR.
Les comptes gardent leur colonne `wallpaper` en base ; elle est simplement ignorée par l'ancienne version.
