# Trésorerie par banque — première version

La trésorerie reste un livre interne. Aucune connexion bancaire, aucun virement ou prélèvement bancaire automatique.

- Chaque banque a un nom, une devise, un solde initial et un montant réservé/bloqué.
- Solde de la banque = solde initial + entrées − sorties. Le solde initial précède les mouvements enregistrés : ne pas compter les anciennes opérations deux fois.
- Non disponible = réserves/bloquages + prélèvements encore prévus sous sept jours (retards compris).
- Disponible = solde de la banque − non disponible. Un montant négatif est affiché avec « − » en rouge, un montant positif avec « + » en vert.
- Le solde général regroupe toutes les banques et les opérations encore « Sans banque », séparément par devise. Aucune conversion ou addition de devises différentes.
- La roue défile verticalement à la main, au clavier ou avec ses flèches. Toucher une carte la fixe ; « Défiler les banques » la libère. La sélection et le verrouillage survivent aux panneaux contextuels.
- Un signal « banque(s) à approvisionner » reste visible même si la banque concernée n’est pas la carte actuellement affichée. Il amène à la banque en déficit.
- Toucher « + » prépare une entrée sur cette banque. Toucher le disponible négatif ou « Approvisionner » propose une source de même devise et le montant manquant, dans la limite de son disponible.
- Le transfert nécessite une confirmation après réalisation du virement auprès de la banque. Deux écritures internes opposées sont enregistrées atomiquement ; le solde général et les totaux d’entrées/sorties externes ne sont pas gonflés.
- Les saisies, transferts et prélèvements confirmés sont protégés contre le double enregistrement d’une même opération. Un prélèvement effectué crée une seule sortie. Une prévision annulée libère son montant sans mouvement d’argent.
- Les opérations historiques restent conservées, non affectées, jusqu’au choix explicite d’une banque compatible avec leur devise.
- Sans banques configurées, les banques A/B/C et leurs chiffres sont une démonstration affichée uniquement, signalée par le badge existant. Ajouter une vraie banque active les chiffres internes réels.

Migration additive : nouvelles tables et colonnes nullable, sans suppression ou réaffectation automatique des données existantes. Comptes, mouvements, réserves, échéances et transferts sont toujours isolés par entreprise. Vérification des calculs, devises, autorisations, confirmations, idempotence, navigation et interaction mobile par tests serveur et navigateur.
