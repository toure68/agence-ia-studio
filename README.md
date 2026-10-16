# Agence IA Studio — V2.1 (démo serveur, marque blanche)

**Objectif :** plateforme de démonstration pour petites entreprises : sites de devis personnalisés, suivi des demandes et prospection commerciale assistée. L'interface est en français et responsive. Ce ZIP contient le code source ; l'application Python ne fonctionne pas directement sur un iPhone sans hébergement.

## Fonctionnalités utilisables

- Connexion par email/mot de passe haché, cookie de session HttpOnly et protection CSRF.
- Modification du mot de passe personnel ; anciennes sessions invalidées.
- Plusieurs entreprises avec pages publiques distinctes `/site/<slug>`, tarifs personnalisables et responsables limités à leur entreprise.
- CRM des demandes : création, notes, statuts, export CSV spécifique à l'entreprise.
- CRM agence : prospection, étapes commerciales, historique des interactions, export CSV et brouillons d'emails. Brouillons IA via `OPENAI_API_KEY` facultative, sinon modèles locaux. **Aucun email envoyé automatiquement.**
- En mode production, le formulaire de collecte de données personnelles est **désactivé par défaut**, tant que les obligations d'information, la gestion des demandes RGPD, la protection antispam et les procédures internes ne sont pas finalisées.
- Serveur API avec route de santé `/health` pour contrôle de l'hébergement.

## Démarrage local : ordinateur Python 3.11+

```sh
python -m venv .venv
# Linux/macOS : source .venv/bin/activate ; Windows : .venv\\Scripts\\activate
pip install -r requirements.txt
python start.py
```

Le premier démarrage demande une adresse email et un mot de passe d'administrateur et crée un fichier `.env` local privé. Le navigateur ouvre `http://127.0.0.1:8000` ; le site fictif est `http://127.0.0.1:8000/site/eclat-proprete`.

Pour les tests automatisés :

```sh
python -m pytest -q
```

## Déploiement indépendant sur Railway (à effectuer après connexion d'un dépôt GitHub dédié)

**Ne pas utiliser le projet `Vital Moringa OS Staging` pour cette application.** Il faut un projet Railway **séparé**, avec un dépôt de code distinct et privé.

1. Créer un nouveau dépôt GitHub privé `agence-ia-studio` et y mettre les fichiers du dossier, sans `.env`, bases de données, ni secrets.
2. Créer un nouveau projet Railway `Agence IA Studio`, puis connecter ce dépôt GitHub à un service. Le `Dockerfile` est déjà fourni ; la commande lance Uvicorn sur le `PORT` affecté par Railway.
3. Dans le service Railway, ajouter un volume persistant monté en `/app/data` pour la base SQLite, ou migrer vers PostgreSQL avant croissance multi-instance. La base n'est **pas** sauvegardée automatiquement par ce code. Organiser des sauvegardes testées.
4. Ajouter les variables **secrètes** via Railway, jamais dans GitHub :

| Variable | Valeur attendue |
|---|---|
| `APP_ENV` | `production` |
| `DATABASE_PATH` | `/app/data/app.db` |
| `SESSION_SECRET` | chaîne aléatoire forte de 32 caractères minimum |
| `ADMIN_EMAIL` | votre adresse de connexion, valable et unique |
| `ADMIN_PASSWORD` | mot de passe unique de 12 caractères minimum |
| `PUBLIC_QUOTES_ENABLED` | `0` pendant les essais, `1` uniquement après conformité et protections complémentaires |
| `OPENAI_API_KEY` | facultatif, génération de brouillons, sans envoi automatique |

5. Vérifier `/health` et la connexion propriétaire avec le domaine HTTPS de Railway. Tester deux entreprises et l'étanchéité de leurs données. Mettre à jour vos identifiants depuis le bouton **Mot de passe** dans l'administration.
6. Ne pas publier de liens commerciaux tant que le cadre juridique (mentions légales, politique de confidentialité, information sur les formulaires, sous-traitants, durées de conservation, demandes d'effacement, consentement selon usage, politique antispam) et les sauvegardes ne sont pas finalisés.

**Important :** la première identité est créée au premier lancement si `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont présents et valides. Changer ces variables après création ne change **pas** le mot de passe du compte existant ; utilisez le bouton dédié. En production, utilisez une seule instance/worker avec SQLite ou migrez vers PostgreSQL pour la mise à l'échelle.

## Sécurité et périmètre

La version permet des **essais internes**, pas encore l'exploitation publique avec données personnelles réelles. Les protections contre les bots sont limitées à un piège invisible et un quota en mémoire, insuffisants à plusieurs instances. Elle ne fournit pas de suppression/export individuels RGPD, réinitialisation par email, permissions détaillées, protection avancée du compte, observabilité ni sauvegardes managées. Les agents IA ne contactent aucun prospect, n'effectuent aucun paiement et ne signent aucun contrat.

## Versionnage

V2.1 ajoute le verrouillage de collecte en production, la rotation des mots de passe avec invalidation de session, l'export CSV des demandes par entreprise (avec prévention de formules CSV), les tests associés et un guide de déploiement indépendant. Le modèle de devis et les tarifs sont fictifs.

## Aide à la négociation ajoutée en V2.1

Dans **Prospection IA > Suivi**, la plateforme propose la prochaine action selon l'étape commerciale. Une réponse reçue conduit à une lecture humaine et un brouillon adapté ; un **accord de principe** demande une validation contractuelle ; un **refus** signifie l'arrêt des relances. Ce module est une aide au suivi : aucune réponse n'est analysée automatiquement depuis une boîte email, et aucun envoi n'est déclenché.

## Résultats des vérifications fournies

`python -m pytest -q` : 5 tests réussis. `node --check static/admin.js` et `node --check static/site.js` : syntaxe valide. Les captures d'écran du dossier `screenshots` viennent de la V2 précédente ; elles donnent un aperçu général mais ne représentent pas nécessairement les derniers ajustements de la V2.1.

## Bloc de priorités dynamique

Le tableau de bord affiche toutes les cartes utiles sans nombre fixe. Le carrousel fonctionne au toucher, au clavier et avec les flèches. Chaque carte ouvre directement le dossier ou la tâche concernés.

- Suivi assisté (règles sur les données enregistrées, sans analyse IA externe) : demandes à rappeler, nouvelles demandes sans suivi depuis deux jours, devis envoyés depuis sept jours, réponses reçues, prospects intéressés, accords de principe et contacts sans suivi depuis sept jours. Aucun rappel pour un refus ou un dossier signé.
- Calendrier : échéances ponctuelles ou mensuelles explicitement configurées par entreprise via **Échéances**, visibles à J−7 et conservées en cas de retard. Dates calculées en Europe/Paris. Le jour de départ est conservé pour chaque mois ; un jour absent est remplacé par le dernier jour du mois. Aucune date fiscale ou salariale n’est imposée.
- **Ouvrir** ne supprime pas la carte. **Retirer de mes priorités** masque la version actuelle pour cet utilisateur et conserve le dossier. Une nouvelle interaction ou mise à jour peut faire réapparaître une alerte. Le calendrier complet reste accessible.
- **Marquer cette échéance comme traitée** enregistre la réalisation pour l’entreprise et passe à l’occurrence suivante si mensuelle. Cela ne réalise aucun envoi, paiement, déclaration ou traitement de paie.

Les cartes sont actualisées à l’ouverture du tableau de bord et chaque minute quand il est visible et sans fenêtre ouverte. Les droits entreprise et la protection CSRF s’appliquent aux nouvelles routes. Les formulaires publics et les envois automatiques restent désactivés.


## Devis, lecture vocale et boîte Gmail

Le module Devis crée des devis internes indépendants des formulaires publics : lignes, prix HT, TVA choisie, devise, validité, conditions, historique, modification et PDF. Les mentions applicables à votre entreprise doivent être complétées dans les conditions. Aucun devis n’est envoyé automatiquement.

La page d’accueil propose toujours une action utile, même sans urgence : activité ouverte, devis en brouillon, e-mail à examiner ou organisation du prochain travail. Les simulations ne sont plus affichées par défaut.

Les boutons haut-parleur lisent une priorité, une page ou une notification après un appui. Les boutons Dicter utilisent la reconnaissance vocale disponible dans le navigateur ; si elle manque, utilisez le micro du clavier iPhone. Le microphone n’est jamais activé automatiquement. Le navigateur ou le système peut traiter la reconnaissance vocale sur son service vocal.

### Activer Gmail dans l’application

La connexion Gmail de ChatGPT n’autorise pas cette application Railway. L’intégration nécessite son propre client OAuth Google :

1. Dans Google Cloud, créer ou choisir un projet, activer Gmail API, configurer le consentement OAuth et créer un client OAuth de type Application Web.
2. Ajouter exactement l’URI de redirection `https://agence-ia-studio-production.up.railway.app/api/mail/gmail/callback`. Pour une application en test, ajouter les adresses autorisées comme utilisateurs de test. Les accès Gmail demandés sont `gmail.readonly` et `gmail.send` ; une diffusion à d’autres utilisateurs peut nécessiter la validation Google.
3. Définir sur le service Railway `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` et `GMAIL_REDIRECT_URI`. Garder le secret hors de GitHub et des conversations.
4. Ouvrir E-mails, saisir les mots-clés de l’activité, enregistrer puis Connecter Gmail et autoriser le compte. Le nom de la boîte connectée est affiché.

Le tri applique les mots-clés enregistrés aux messages Gmail, hors spam, corbeille et messages envoyés. Chaque passage parcourt 20 messages et mémorise la pagination ; Actualiser poursuit la lecture. Le classement local regroupe Factures, Clients, Équipe, Fournisseurs et Activité. L’écran affiche les 1 000 dernières copies importées. Le tri est manuel par défaut ; cocher l’option automatique lance un passage toutes les 15 minutes tant que le service Railway fonctionne.

Les jetons de renouvellement sont chiffrés sur le serveur avec une clé dérivée de SESSION_SECRET. Les copies des messages et les brouillons sont réservés à l’utilisateur et à l’entreprise qui ont connecté la boîte. Déconnecter révoque l’accès quand Google répond et retire les copies locales, sans supprimer les originaux Gmail.

Préparer un brouillon fournit une trame locale à compléter ; aucun contenu e-mail n’est transmis à un modèle d’IA. Après modification, il faut enregistrer à nouveau le brouillon. L’envoi nécessite le clic explicite Valider et envoyer et la révision enregistrée. Une réponse envoyée ne peut pas être envoyée une seconde fois ; si Gmail ne confirme pas l’envoi, le renvoi est bloqué et il faut vérifier les messages envoyés dans Gmail. Le tri automatique ne déclenche jamais d’envoi, de prospection ni de formulaire public.


### Dialogue IA de l’accueil

Le dialogue apparaît après Bonjour, au-dessus des priorités et des boutons existants. Chaque compte dispose d’un échange privé par entreprise : messages, réponses et contexte des pièces jointes sont chiffrés sur le serveur. Les 20 derniers échanges sont affichés ; les 4 derniers sont repris dans la demande suivante. Aucune modification de dossier, signature ou communication à un tiers n’est exécutée par le dialogue.

Connexion : la direction ouvre **Connecter l’IA**, saisit sa clé API OpenAI dans le champ protégé et valide le test de connexion. La clé est chiffrée côté serveur, n’est jamais renvoyée au navigateur ni accessible aux gestionnaires. La facturation dépend du compte API utilisé. L’alternative serveur est `OPENAI_API_KEY`, avec `OPENAI_CHAT_MODEL` (défaut `gpt-4.1-mini`) et `OPENAI_TRANSCRIBE_MODEL` (défaut `gpt-4o-mini-transcribe`). Sans connexion configurée, l’interface l’indique et ne simule pas de réponse.

Pièces jointes : 4 fichiers, 8 Mo par fichier, 16 Mo au total. JPEG/PNG/WebP ; PDF jusqu’à 20 pages ; DOCX/XLSX/PPTX, TXT/CSV/TSV/MD ; audio MP3/M4A/WAV/OGG/FLAC/WebM et vidéos MP4/MOV/WebM. `ffmpeg` et `ffprobe` sont installés dans l’image Docker. Les vidéos sont limitées à 90 secondes et analysées via 6 images échantillonnées et leur bande sonore lorsqu’elle existe ; l’audio est limité à 180 secondes, avec 180 secondes de médias au total par message. Le micro n’existe que dans ce dialogue : enregistrement explicite, arrêt des pistes à la sortie, aucun envoi avant la flèche. Les textes et fichiers sont transmis à OpenAI lors de l’envoi. Les réponses utilisent `store:false` ; cela ne remplace pas les conditions de traitement du fournisseur.

Sécurité et limites : session et CSRF, cloisonnement utilisateur/entreprise, clé jamais incluse dans le prompt, révision du fil et identifiant de requête contre les doublons, analyse locale bornée, quota d’historique de 24 Mo par compte/entreprise et 128 Mo pour le service. Les réponses n’ont pas de recherche Internet et peuvent contenir des erreurs. Utiliser les fonctions métier pour valider un changement.
