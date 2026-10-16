# Agence IA Studio — import de la V2.1

Ce dépôt privé hébergera l'application **Agence IA Studio**, indépendamment de Vital Moringa OS.

## Import initial

1. Depuis la conversation ChatGPT, téléchargez le fichier **Agence_IA_Studio_V2_1.zip** préparé pour GitHub.
2. Dans ce dépôt GitHub, ouvrez **Add file → Upload files**.
3. Ajoutez le fichier ZIP, **à la racine** du dépôt, sans le renommer, puis validez avec **Commit changes**.
4. L'action GitHub **Import Agence IA Studio V2.1** décompressera automatiquement le ZIP et créera les fichiers du projet dans le dépôt (sans conserver l'archive).
5. Vérifiez que l'onglet **Actions** indique une exécution réussie avant le branchement Railway.

Le ZIP contient les sources FastAPI, les pages HTML/CSS/JS, Dockerfile, les tests et la documentation. Aucune clé API, aucun mot de passe et aucune base client ne doivent être ajoutés au dépôt.

## État du déploiement

Un projet Railway distinct « Agence IA Studio » est préparé avec un volume persistant. La connexion GitHub et le démarrage de l'application seront effectués après l'import du code et la configuration privée de l'identité administrateur.

**Ne mettez pas le formulaire public en service avant vérification des exigences RGPD et de la protection anti-spam.**
