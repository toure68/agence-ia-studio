# Trésorerie par banque

La trésorerie reste un livre interne. Aucune connexion bancaire, aucun virement ou prélèvement bancaire automatique.

- Chaque banque a un nom, une devise, un solde initial et un montant réservé/bloqué.
- Solde de la banque = solde initial + entrées − sorties. Le solde initial précède les mouvements enregistrés : ne pas compter les anciennes opérations deux fois.
- Non disponible = réserves/bloquages + prélèvements encore prévus sous sept jours (retards compris).
- Disponible = solde de la banque − non disponible. Un montant négatif est affiché avec « − » en rouge, un montant positif avec « + » en vert.
- Le solde général regroupe toutes les banques et les opérations encore « Sans banque », séparément par devise. Aucune conversion ou addition de devises différentes.
- Accueil : une rangée de pastilles carrées de 44 px (« Tous », une pastille par banque avec ses initiales et sa couleur, « ＋ » pour ajouter une banque). La vue « Tous » est toujours la vue par défaut : solde général, entrées et sorties du mois.
- Toucher une banque affiche son solde, ses entrées et sorties du mois. Si elle est en alerte, le détail de l’alerte se déploie automatiquement avec « Approvisionner depuis … » ; sinon ses 5 dernières transactions et « Voir tout ». Toucher à nouveau la même banque, « Tous », la flèche ⌃ ou Échap ramène au résumé.
- Une alerte n’est jamais cachée : point rouge sur la pastille de la banque concernée et ligne rouge dans la vue « Tous », qui ouvre directement cette banque.
- Toucher « + » prépare une entrée sur cette banque. Toucher le disponible négatif ou « Approvisionner » propose une source de même devise et le montant manquant, dans la limite de son disponible.
- Le transfert nécessite une confirmation après réalisation du virement auprès de la banque. Deux écritures internes opposées sont enregistrées atomiquement ; le solde général et les totaux d’entrées/sorties externes ne sont pas gonflés.
- Les saisies, transferts et prélèvements confirmés sont protégés contre le double enregistrement d’une même opération. Un prélèvement effectué crée une seule sortie. Une prévision annulée libère son montant sans mouvement d’argent.
- Les opérations historiques restent conservées, non affectées, jusqu’au choix explicite d’une banque compatible avec leur devise.
- Sans banques configurées, les banques A/B/C et leurs chiffres sont une démonstration affichée uniquement, signalée par le badge existant. Ajouter une vraie banque active les chiffres internes réels.

Migration additive : nouvelles tables et colonnes nullable, sans suppression ou réaffectation automatique des données existantes. Comptes, mouvements, réserves, échéances et transferts sont toujours isolés par entreprise. Vérification des calculs, devises, autorisations, confirmations, idempotence, navigation et interaction mobile par tests serveur et navigateur.
