"""Exhaustive, honest acceptance map for the executive specification.

An available button or an environment variable is not proof of an end-to-end
integration. Blocked/missing rows intentionally prevent a 100% result.
"""
REQUIREMENTS = [
 ('UI-01','Carte prioritaire dynamique et action en un clic','partial','Priorités réelles et traitement des tâches ; les marchés et la paie ne sont pas intégrés.','test_zero_dashboard_and_ledger'),
 ('UI-02','Modules existants conservés et pastilles dynamiques','implemented','Selon la correction validée : accès directs conservés, Trésorerie, Matériel et Prévention ajoutés ; données filtrées par entreprise et utilisateur.','test_zero_dashboard_and_ledger'),
 ('UI-03','Une seule navigation sans sous-titres verbeux','implemented','Grille de cartes conservée ; aucun menu latéral ou inférieur en double, y compris en paysage et sur tablette.','tests/ui_navigation.cjs'),
 ('UI-04','Micro flottant et ajout vocal','partial','Micro central et commandes structurées ; compréhension libre IA non configurée.','tests/ui_navigation.cjs'),
 ('ONB-01','Inscription avec identifiant et mot de passe uniquement','missing','Les comptes sont encore créés par la direction ; une inscription publique nécessite une isolation renforcée des propriétaires.','tests/test_app.py'),
 ('OCR-01','Photographier Kbis et remplir SIRET et profil','missing','Capture, extraction et vérification du profil non implémentées.',''),
 ('OCR-02','Photographier RIB et remplir IBAN','missing','Extraction bancaire et contrôle humain avant enregistrement non implémentés.',''),
 ('OCR-03','Importer les tarifs depuis les anciens devis','missing','Les devis internes existent ; extraction de documents historiques absente.',''),
 ('SIG-01','Signature au doigt et apposition au devis après validation','missing','Capture du consentement, empreinte du document et signature au doigt non implémentées.',''),
 ('SIG-02','Signature certifiée pour marchés publics','blocked','Prestataire, certificat et parcours de consentement à choisir ; aucun certificat configuré.',''),
 ('HIS-01','Numériser l’historique et enrichir les propositions','partial','Historique interne et brouillons commerciaux présents ; ingestion documentaire et exploitation IA absentes.','tests/test_app.py'),
 ('MAIL-01','Centraliser et détecter les e-mails prioritaires','blocked','Connecteur Gmail par utilisateur testé avec un service simulé ; identifiants OAuth et autorisation réelle manquants.','test_mail_oauth_private_import_review_send_and_deduplication'),
 ('MAIL-02','Résumer et lire les messages à haute voix','partial','Lecture à voix haute présente ; résumé IA des messages non implémenté.','tests/ui_navigation.cjs'),
 ('MAIL-03','Réponse sur mesure fondée sur l’historique','partial','Trame locale modifiable et historique CRM ; réponse IA fondée sur les archives de la boîte absente.','test_mail_oauth_private_import_review_send_and_deduplication'),
 ('MAIL-04','Corriger à la voix et envoyer après validation','blocked','Dictée et envoi explicite avec révision enregistrée ; connexion Gmail réelle manquante.','test_mail_unconfirmed_send_not_retried_and_user_scope'),
 ('SOC-01','Détecter les chantiers terminés de la semaine','missing','Détection dédiée et préparation de campagnes non implémentées.',''),
 ('SOC-02','Générer textes et visuels LinkedIn, Facebook, TikTok','missing','Génération et prévisualisation par réseau non implémentées.',''),
 ('SOC-03','Faire remonter le post dans les priorités','missing','Circuit éditorial et validation de post absents.',''),
 ('SOC-04','Publier en un clic sur les comptes autorisés','blocked','Comptes, autorisations et intégrations de publication à connecter ; aucun envoi social n’est activé.',''),
 ('LOG-01','Inventaire et état du matériel','implemented','Inventaire par entreprise : quantité, état et prochaine révision.','test_logistics_crosscheck_and_risks'),
 ('LOG-02','Croiser exigences du chantier et matériel','partial','Comparaison des besoins enregistrés et de l’inventaire ; détection des manques et pannes. Lecture IA des contrats absente.','test_logistics_crosscheck_and_risks'),
 ('LOG-03','Proposer achat et location géolocalisés','missing','Aucune offre locale vérifiée ni fournisseur de recherche d’offres connecté.',''),
 ('RISK-01','Révisions des véhicules et du matériel','implemented','Dates configurées et alertes avant échéance ; aucun intervalle de révision inventé.','test_logistics_crosscheck_and_risks'),
 ('RISK-02','Échéances des EPI et consommables','implemented','Registre des échéances et priorités ; renouvellement à confirmer humainement.','test_logistics_crosscheck_and_risks'),
 ('RISK-03','Expiration décennale et RC Pro','implemented','Dates saisies par l’entreprise et alertes ; aucun renouvellement de contrat automatique.','test_logistics_crosscheck_and_risks'),
 ('RISK-04','Habilitations et échéances des salariés','implemented','Échéances nominatives et rappels ; vérification documentaire non automatisée.','test_logistics_crosscheck_and_risks'),
 ('TENDER-01','Détecter et préparer un marché public','missing','Veille BOAMP, qualification et dossier de candidature non implémentés.',''),
 ('PAY-01','Paie des salariés et validation','missing','Pas de calcul de paie, de génération de bulletin ni de transmission ; les tâches de calendrier ne constituent pas un module paie.',''),
 ('FIN-01','Trésorerie','partial','Livre des mouvements internes avec soldes par devise ; pas de synchronisation bancaire ni de comptabilité certifiée.','test_zero_dashboard_and_ledger'),
 ('QUOTE-01','Créer, retrouver, modifier et télécharger les devis','implemented','Devis internes, calculs serveur, historique et PDF ; signature encore absente.','test_quotation_money_pdf_and_tenant_isolation'),
 ('SEC-01','Validation humaine, cloisonnement et absence d’envoi caché','implemented','Sessions, CSRF, droits par entreprise et utilisateur, protection contre le double envoi.','tests/test_office.py'),
]


def matrix():
    rows=[dict(id=i,requirement=label,status=status,detail=detail,evidence=test) for i,label,status,detail,test in REQUIREMENTS]
    return {'complete':False,'requirements':rows,'counts':{state:sum(r['status']==state for r in rows) for state in ('implemented','partial','blocked','missing')}}
