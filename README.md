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
