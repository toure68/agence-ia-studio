# Récupérer l'accès propriétaire (mot de passe perdu)

L'application n'envoie pas d'e-mail de réinitialisation. Le propriétaire récupère son accès depuis les variables Railway :

1. Railway → projet → service de l'application → **Variables**.
2. Vérifier `ADMIN_EMAIL` = l'e-mail du compte propriétaire.
3. Mettre un nouveau mot de passe dans `ADMIN_PASSWORD` (12 caractères minimum).
4. Ajouter `ADMIN_PASSWORD_RESET` = `1`. Railway redéploie l'application.
5. Se connecter avec ce nouveau mot de passe (toutes les anciennes sessions sont déconnectées).
6. **Supprimer** `ADMIN_PASSWORD_RESET` ensuite (sinon chaque redéploiement remet ce mot de passe).

Seul le compte propriétaire portant cet e-mail est concerné.
