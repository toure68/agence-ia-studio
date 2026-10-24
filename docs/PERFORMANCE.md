# Performance — contrôle du 24 octobre 2026

## Cause et correction

Le chargement de la file créait un bouton complet par message, avec plusieurs SVG et éléments internes. Chaque geste et recalcul mesurait ensuite les cartes hors écran. Un observateur relançait aussi le calcul de la pile au repos, notamment après réécriture de l’attribut `hidden` de l’invitation finale.

La version v151 conserve tous les messages et le classement, mais monte au maximum douze cartes pour les grandes files. Les positions absolues conservent le pas, le défilement total et la fin de liste. Les indices et compteurs sont globaux, indépendants des seuls éléments montés. Les petites files gardent leur présentation existante. Les cartes et le corps déjà chargé sont réutilisés ; une actualisation sans changement ne remplace plus le lecteur ni ne recharge le message.

Les calculs de pile sont regroupés par image et ne se relancent plus sur leurs propres mutations. Le redimensionnement reste local et ne redemande plus toute la file au serveur. Le cockpit, ses préférences et ses notifications sont chargés en parallèle.

Les listes détaillées de messages et d’actions affichent cinquante lignes par page, avec recherche sur toutes les métadonnées déjà chargées. Les lectures conditionnelles des priorités utilisent ETag : authentification et autorisation restent vérifiées à chaque requête ; aucune liste privée n’est placée dans un cache public ou persistant. Le cache en mémoire est séparé par utilisateur/entreprise et vidé à la déconnexion. Les fichiers statiques versionnés disposent d’un cache immutable ; les pages HTML restent revalidées et les API restent `no-store`.

## Mesures comparatives

Navigateur Chromium, fenêtre 390 × 844, processeur ralenti par quatre, serveur et données fictives locaux. Mille notifications avec le même contenu avant/après. Chronométrage de l’apparition depuis le clic de connexion ; temps synchrone de passage au message suivant ; aucune limitation réseau 4G simulée. Ce ne sont pas des mesures sur l’iPhone réel de Mohamed ni sur sa boîte privée.

| Mesure | v150 | v151 |
|---|---:|---:|
| Apparition des notifications après connexion | 2 893 ms | 714 ms |
| Blocage synchrone au passage suivant | 1 301 ms | 125 ms |
| Actualisation inchangée de l’accueil | 1 691 ms | 76 ms |
| Éléments montés dans la page | 12 499 | 621 |
| Cartes de notifications montées | 1 000 | 10 |

Le volume initial des métadonnées de la file reste proportionnel au nombre de notifications. Ces corrections ne promettent pas un temps de réseau constant ni la prise en charge illimitée des volumes. Le contenu complet d’un e-mail n’est demandé qu’à sa sélection, sans appel au fournisseur pendant le chargement de l’accueil.

## Vérifications

- 96 tests Python réussis, dont invalidation des lectures conditionnelles, authentification/isolement des entreprises et politique de cache.
- `tests/performance.cjs` : 1 000 messages à 375/390/430 px, processeur ralenti par quatre, nombre de cartes borné, absence de boucle de pile au repos, aucun corps chargé à l’ouverture, lecteur conservé après 304, saut jusqu’aux derniers messages, parcours dans les deux sens, geste magnétique et retour de fin de liste, recherche du millième message, pagination des e-mails et des actions, nouvelle arrivée après actualisation. Aucun envoi réel.
- Parcours ciblés réussis : `reader_layout`, `reader_pile`, `reader_footer`, `mail_notifications`, `mail_client`, `mail_providers`, `compact_reader`, `reader_scroll`, `reader_action_widths`. Le mode compact inclut aussi la tablette 768 px. Captures inspectées.
- Un ancien contrôle de l’affichage classique (`reader.cjs`, grille immobile, ligne 45) échoue aussi sur v150 dans un checkout séparé avec la même base de test ; ce défaut n’est pas introduit par v151. Les contrôles de géométrie du mode iPhone passent.

Retour : **RETOUR AVANT OPTIMISATION PERFORMANCE**, branche `sauvegarde/avant-optimisation-performance-v151`.
