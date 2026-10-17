"""Exhaustive, honest acceptance map for the executive specification.

An available button or an environment variable is not proof of an end-to-end
integration. Blocked/missing rows intentionally prevent a 100% result.
"""
REQUIREMENTS = [
 ('UI-01','Carte prioritaire dynamique et action en un clic','partial','Priorités réelles et traitement des tâches ; les marchés et la paie ne sont pas intégrés.','test_zero_dashboard_and_ledger'),
 ('UI-02','Modules existants conservés et pastilles dynamiques','implemented','Selon la correction validée : accès directs conservés, Trésorerie, Matériel et Prévention ajoutés ; données filtrées par entreprise et utilisateur.','test_zero_dashboard_and_ledger'),
 ('UI-03','Une seule navigation sans sous-titres verbeux','implemented','Grille de cartes conservée ; aucun menu latéral ou inférieur en double, y compris en paysage et sur tablette.','tests/ui_navigation.cjs'),
 ('UI-04','Ajout et saisie au clavier','partial','Saisie au clavier et dialogue IA avec fichiers ; micro limité au dialogue sur demande. Connexion API à activer par la direction ; aucune modification de données par la conversation.','tests/ui_navigation.cjs'),
 ('UI-05','Réserve de fonctions et accueil personnel','implemented','Plus de fonctions reste accessible même si tous les boutons sont masqués ; choix enregistré par compte et entreprise sans effacer les données.','test_personal_modules_empty_home_domains_and_scope'),
 ('ONB-02','Choix du domaine et fonctions adaptées','implemented','Domaine à la création d’une entreprise et dans Mes fonctions ; recommandations modifiables avec accès aux autres domaines. Inscription publique toujours fermée.','test_personal_modules_empty_home_domains_and_scope'),
 ('ONB-01','Inscription avec identifiant et mot de passe uniquement','missing','Les comptes sont encore créés par la direction ; une inscription publique nécessite une isolation renforcée des propriétaires.','tests/test_app.py'),
 ('OCR-01','Photographier Kbis et remplir SIRET et profil','partial','Kbis en colonnes ; identité avec libellés français/anglais et lignes codées TD1, TD2, TD3 contrôlées ; domicile, RIB et assurance préremplis selon leur type. Vérification avant enregistrement ; formats inconnus ou champs ambigus à compléter.','test_two_column_kbis_ocr_saved_fields_and_legacy_document / test_identity_photo_to_form_to_saved_profile'),
 ('OCR-02','Photographier RIB et remplir IBAN','implemented','Lecture locale, contrôle de cohérence IBAN, sélection et validation explicite ; données chiffrées et accès réservé à la direction.','test_real_photo_ocr_and_iban_review'),
 ('OCR-03','Importer les tarifs depuis les anciens devis','partial','Tarifs unitaires clairement libellés proposés puis validés, réutilisables dans les devis. Les tableaux complexes ne sont pas interprétés automatiquement.','test_document_review_no_automatic_changes_and_tariffs'),
 ('SIG-01','Signature au doigt et apposition au devis après validation','implemented','Tracé manuscrit, consentement explicite, empreinte du devis, conservation chiffrée et PDF signé ; version signée figée.','test_signature_explicit_acceptance_pdf_encryption_and_immutable_version'),
 ('SIG-02','Signature certifiée pour marchés publics','blocked','Prestataire, certificat et parcours de consentement à choisir ; aucun certificat configuré.',''),
 ('HIS-01','Numériser l’historique et enrichir les propositions','partial','Archives chiffrées des documents et tarifs validés réutilisables dans les devis ; apprentissage IA sur l’historique non implémenté.','test_document_review_no_automatic_changes_and_tariffs'),
 ('MAIL-01','Centraliser et détecter les e-mails prioritaires','blocked','Connecteur Gmail par utilisateur testé avec un service simulé ; identifiants OAuth et autorisation réelle manquants.','test_mail_oauth_private_import_review_send_and_deduplication'),
 ('MAIL-02','Résumer et lire les messages à haute voix','partial','Résumé IA à la demande, mis en cache et lisible à voix haute ; connexion IA et Gmail réelles nécessaires pour validation de bout en bout. Services simulés en tests.','tests/test_mail_ai.py / tests/ui_navigation.cjs'),
 ('MAIL-03','Réponse sur mesure fondée sur l’historique','partial','Proposition IA fondée sur le message, six échanges antérieurs et vingt tarifs de vente validés de l’entreprise ; catalogue inclus dans la clé de cache. Pas de coûts de revient, remise autorisée ni recherche exhaustive. Reprise, correction et validation avant envoi. Connexion Gmail réelle manquante.','tests/test_mail_ai.py / tests/ui_navigation.cjs'),
 ('MAIL-04','Corriger à la voix et envoyer après validation','blocked','Correction au clavier et envoi explicite avec révision enregistrée ; connexion Gmail réelle manquante.','test_mail_unconfirmed_send_not_retried_and_user_scope'),
 ('SOC-01','Détecter les chantiers terminés de la semaine','implemented','Liste des activités terminées sur sept jours, date de fin conservée lors des corrections ; dates anciennes explicitement estimées.','tests/test_social.py'),
 ('SOC-02','Générer textes et visuels LinkedIn, Facebook, TikTok','partial','Trames locales modifiables et visuels texte PNG carrés ou verticaux, sans coût IA. Pas de photographie générée, de vidéo TikTok ni de génération IA spécialisée.','tests/test_social.py / tests/ui_navigation.cjs'),
 ('SOC-03','Faire remonter le post dans les priorités','implemented','Brouillons à valider en priorité pour la direction ; validation de version, retour à vérifier après modification de la source ou du texte ; classement sans publier.','tests/test_social.py / tests/ui_navigation.cjs'),
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
 ('QUOTE-01','Créer, retrouver, modifier et télécharger les devis','implemented','Devis internes, calculs serveur, historique, PDF et signature manuscrite après validation.','test_quotation_money_pdf_and_tenant_isolation'),
 ('SEC-01','Validation humaine, cloisonnement et absence d’envoi caché','implemented','Sessions, CSRF, droits par entreprise et utilisateur, protection contre le double envoi.','tests/test_office.py'),
 ('AUT-01','L’application prépare, l’entrepreneur vérifie et valide','partial','Priorités calculées par règles et import Gmail périodique après activation ; analyses IA, réponses commerciales, publications et devis encore déclenchés manuellement. Orchestration autonome globale à développer.','tests/test_mail_ai.py / tests/test_social.py'),
 ('COST-01','Suivi des consommations et plafond IA par entreprise','partial','Journal des appels, tokens fournisseur, estimation USD, réservations atomiques, quota mensuel strict et plafond prévisionnel configurables ; incertitudes conservées et régularisation tracée. Ni facture fournisseur ni plafond monétaire absolu ; tarifs connus limités, aucun rétrocalcul historique. Orchestration massive encore à développer.','tests/test_ai_budget.py / tests/ui_navigation.cjs'),
]


def matrix():
    rows=[dict(id=i,requirement=label,status=status,detail=detail,evidence=test) for i,label,status,detail,test in REQUIREMENTS]
    return {'complete':False,'requirements':rows,'counts':{state:sum(r['status']==state for r in rows) for state in ('implemented','partial','blocked','missing')}}
