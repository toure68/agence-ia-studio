# Messagerie unifiée — activation et vérification

La version v144 ajoute l’adaptateur Nylas, la réponse dans le fil, la rédaction superposée, le transfert, les pièces jointes et le menu « … ». La boîte Gmail déjà connectée reste utilisable tant qu’une nouvelle connexion n’est pas validée. Une seule boîte par utilisateur et entreprise est active. Aucun fournisseur payant n’est activé par le code.

## Activation côté serveur

1. Créer ou utiliser un compte Nylas et vérifier son offre et son coût avant abonnement. La facturation Nylas est distincte de ChatGPT et des appels IA.
2. Configurer les connecteurs Google/Microsoft et leurs autorisations de lecture, envoi et classement selon la documentation Nylas. L’API unifie les opérations ; les consentements des fournisseurs restent nécessaires.
3. Choisir la région EU ou US et définir `NYLAS_REGION`, `NYLAS_API_KEY`, `NYLAS_CLIENT_ID` dans les variables privées de l’hébergement. Ne jamais envoyer une clé dans le chat ou la committer.
4. Enregistrer le callback HTTPS `/api/mail/unified/callback`, puis définir sa même URL exacte dans `NYLAS_REDIRECT_URI`.
5. Enregistrer une notification vers `/api/mail/unified/webhook` : `message.created`, `message.updated`, `message.deleted`, `grant.expired`, `grant.deleted`. Récupérer le secret propre à cette notification et le placer dans `NYLAS_WEBHOOK_SECRET`. Les variantes `.truncated` sont acceptées ; le serveur recharge le message complet.
6. Depuis E-mails, choisir « Connecter Gmail ou Outlook ». La connexion se fait dans une fenêtre de consentement ; l’accueil d’origine reste monté. Si le navigateur coupe le lien avec la fenêtre d’origine, le callback propose un lien de retour.
7. Autoriser une boîte d’essai et vérifier lecture, synchronisation, réception d’un nouveau message, archivage, changement de dossier, téléchargement et envoi explicitement confirmé. Ces vérifications avec un vrai compte restent nécessaires : les tests automatiques utilisent un fournisseur simulé.

## Comportement et limites

- La réponse courte vit sous le fil. Une réponse longue, un transfert ou un nouveau message utilise le panneau superposé. Fermer la rédaction révèle le fil existant.
- Les brouillons enregistrés et leurs fichiers sont chiffrés dans SQLite. Le texte non enregistré reste en mémoire pendant la session. Il faut enregistrer pour le retrouver après un rechargement.
- Destinataire unique ; pas encore de CC/BCC. 4 nouveaux fichiers au maximum, 8 Mo chacun, 16 Mo au total avec les fichiers transférés. Les gros fichiers au-delà de ces limites ne sont pas pris en charge, même si le fournisseur accepte plus.
- La consultation affiche du texte inerte, sans exécuter les scripts ni charger les images distantes du message. Les images jointes PNG/JPEG/GIF/WebP et PDF ont un aperçu isolé ; les autres fichiers passent par Enregistrer/Partager. Le téléchargement est borné à 16 Mo.
- Les notifications sont vérifiées par signature HMAC et placées dans une file persistante, traitée toutes les cinq secondes avec reprises bornées. La réception dépend aussi du fournisseur et du réseau ; elle n’est pas instantanée garantie. L’interface vérifie les nouveautés toutes les vingt secondes lorsqu’elle est visible, sans remplacer une saisie en cours. Le fil propose Actualiser.
- La synchronisation complète charge cinquante messages par passage avec pagination. Un secours toutes les quinze minutes reste disponible. Le fil peut actualiser cinquante messages supplémentaires de la conversation ; les longues conversations peuvent nécessiter la synchronisation générale.
- Les dossiers sont listés dans la limite des deux cents premiers ; une boîte avec davantage de dossiers nécessite un complément avant généralisation.
- Aucun envoi depuis la synchronisation ou les notifications. L’utilisateur enregistre, relit puis clique « Confirmer et envoyer ». Une révision verrouille l’envoi ; la clé d’idempotence est stable. Un envoi incertain est bloqué et ne se relance jamais automatiquement : vérifier le dossier Envoyés.
- Remplacer la connexion par une autre boîte demande une confirmation. Les anciennes copies locales et brouillons sont retirés, les originaux restent chez le fournisseur. Déconnexion : révocation du grant puis suppression locale ; en cas d’échec de révocation, l’application garde les références pour permettre une nouvelle tentative.

## Sources techniques

- https://developer.nylas.com/docs/v3/auth/hosted-oauth-apikey/
- https://developer.nylas.com/docs/v3/email/attachments/
- https://developer.nylas.com/docs/reference/api/messages/send-message/
- https://developer.nylas.com/docs/cookbook/email/organize-folders/
- https://developer.nylas.com/docs/cookbook/use-cases/build/verify-webhook-signatures/

Mot-clé de retour : **RETOUR AVANT MESSAGERIE UNIFIÉE**. Restaurer la sauvegarde de code ne restaure pas une ancienne autorisation OAuth remplacée par l’utilisateur : reconnecter la boîte si nécessaire.
