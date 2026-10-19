# Trésorerie par banque

La trésorerie reste un livre interne. Aucune connexion bancaire, aucun virement ou prélèvement bancaire automatique.

- Chaque banque a un nom, une devise, un solde initial et un montant réservé/bloqué.
- Solde de la banque = solde initial + entrées − sorties. Le solde initial précède les mouvements enregistrés : ne pas compter les anciennes opérations deux fois.
- Non disponible = réserves/bloquages + prélèvements encore prévus sous sept jours (retards compris).
- Disponible = solde de la banque − non disponible. Un montant négatif est affiché avec « − » en rouge, un montant positif avec « + » en vert.
- Le solde général regroupe toutes les banques et les opérations encore « Sans banque », séparément par devise. Aucune conversion ou addition de devises différentes.
- Accueil : carte « cadran » en lecture seule, de taille fixe. En-tête : TRÉSORERIE, « Toutes » ou le nom de la banque, pastille d’état (« À jour » en vert, ou alerte en rouge). Au centre : anneau des entrées (vert) et sorties (rouge) du mois, solde et flux. Puis trois boutons identiques sur une ligne : « Derniers », « À venir » (3 lignes : nom, date, montant ; un prélèvement non couvert est marqué « à couvrir ») et « Voir tout → » ; en bas, toute la ligne est réservée aux pastilles rondes de 36 px (« Tous », une par banque avec initiales, couleur ou logo, « ＋ »). La vue « Tous » est toujours la vue par défaut.
- Toucher une banque affiche son solde, ses entrées et sorties du mois. Si elle est en alerte, l’alerte (montant manquant, échéance, « Approvisionner depuis … ») s’affiche d’office sous les trois boutons ; « Derniers » ou « À venir » restent accessibles ; sinon « Derniers » / « À venir » pour cette banque. La carte garde exactement la même taille. Toucher à nouveau la même banque, « Tous », la flèche ‹ ou Échap ramène au résumé.
- Animations : remplissage des anneaux, montants qui défilent jusqu’à leur valeur, lignes qui apparaissent l’une après l’autre, point d’alerte qui pulse. Avec « Réduire les animations » (iPhone), tout s’affiche directement avec un simple fondu.
- Une alerte n’est jamais cachée : point rouge sur la pastille de la banque concernée et pastille d’alerte rouge dans l’en-tête de la vue « Tous », qui ouvre directement cette banque.
- Toucher « + » prépare une entrée sur cette banque. Toucher le disponible négatif ou « Approvisionner » propose une source de même devise et le montant manquant, dans la limite de son disponible.
- Le transfert nécessite une confirmation après réalisation du virement auprès de la banque. Deux écritures internes opposées sont enregistrées atomiquement ; le solde général et les totaux d’entrées/sorties externes ne sont pas gonflés.
- Les saisies, transferts et prélèvements confirmés sont protégés contre le double enregistrement d’une même opération. Un prélèvement effectué crée une seule sortie. Une prévision annulée libère son montant sans mouvement d’argent.
- Les opérations historiques restent conservées, non affectées, jusqu’au choix explicite d’une banque compatible avec leur devise.
- Sans banques configurées, les banques A/B/C et leurs chiffres sont une démonstration affichée uniquement, signalée par le badge existant. Ajouter une vraie banque active les chiffres internes réels.

Migration additive : nouvelles tables et colonnes nullable, sans suppression ou réaffectation automatique des données existantes. Comptes, mouvements, réserves, échéances et transferts sont toujours isolés par entreprise. Vérification des calculs, devises, autorisations, confirmations, idempotence, navigation et interaction mobile par tests serveur et navigateur.
- Logo de banque : depuis la page Trésorerie, bouton « Logo » sur chaque banque. L’utilisateur choisit une image PNG, JPEG ou WebP depuis son appareil ; elle est recadrée en carré 128 px et réencodée en PNG côté serveur (aucun SVG ni script stocké), enregistrée avec la banque de son entreprise uniquement, et affichée dans la pastille à la place des initiales. Aucun logo de marque n’est livré dans le code ni dans la démo.
