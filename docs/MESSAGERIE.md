# Messagerie directe

Gmail / Google Workspace utilise directement les API Google. Aucun appel à Nylas, aucun webhook ni worker de cet intermédiaire. Les noms de routes `/mail/unified` restent stables pour le client existant.

Configurer GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et GMAIL_REDIRECT_URI dans les variables privées du serveur. Enregistrer exactement le callback HTTPS `/api/mail/gmail/callback` dans Google Cloud, activer Gmail API et publier/vérifier le consentement selon les exigences Google. Les droits demandés sont lecture, envoi et classement. Une ancienne autorisation sans classement peut nécessiter une nouvelle autorisation Google pour les actions de classement.

Plusieurs comptes Gmail par utilisateur/entreprise sont séparés. La reconnexion doit utiliser la même adresse et conserve les messages et brouillons. Ajouter une autre adresse crée un compte séparé. Le profil renvoyé par Google fait foi, jamais l’adresse indicative du formulaire.

Les anciennes autorisations de l’intermédiaire sont désactivées lors de la migration, leurs jetons effacés et leurs messages conservés comme copies importées. Une autorisation directe est nécessaire pour reprendre l’envoi. Une réponse à une copie importée utilise le compte Google réautorisé à la même adresse, sans transmettre les identifiants opaques de l’ancien intermédiaire. Les anciens fichiers distants doivent être retrouvés via Gmail ; les fichiers déjà enregistrés dans les brouillons chiffrés restent conservés.

Synchronisation manuelle par lots de 20 messages filtrés par mots-clés et secours facultatif toutes les quinze minutes. Pas de notification instantanée garantie. Corps complet chargé à la sélection ; texte inerte. Lecture, fil local, réponse, transfert, pièces jointes Gmail. Pas de CC/BCC. 4 nouveaux fichiers maximum, 8 Mo chacun et 16 Mo au total. Brouillons chiffrés, vérification puis confirmation explicite, verrouillage des révisions et blocage des envois incertains. Aucun envoi pendant une synchronisation.

Outlook, iCloud et les autres fournisseurs restent identifiés dans les icônes, avec connexion directe indisponible. Ne pas annoncer ces services comme fonctionnels. Retirer une intégration de l’application ne résilie pas un éventuel abonnement externe.

Références : https://developers.google.com/identity/protocols/oauth2/web-server et https://developers.google.com/workspace/gmail/api/guides/sending
