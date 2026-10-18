# Accueil — aperçu de validation, 18 octobre 2026

Préparé pour validation, sans publication sur l’application de production.

- Cartes d’action : haut-parleur aligné au bouton, sans ligne supplémentaire. Mesures à 390 × 844 : 170, 170 et 211 px ; au moins 2,5 cartes tiennent dans la zone défilée des actions.
- Trésorerie : un badge de démonstration ; la carte n’est plus un lien, seul « Voir mes chiffres réels » ouvre le livre interne. Aucun chiffre fictif enregistré dans le livre.
- Choisir mon métier : véritable sélecteur de secteur, enregistrement avec contrôle de version et conservation des modules/colonnes.
- Compteurs : même file d’actions que les priorités, sans limitation aux trois cartes visibles. Zéros masqués. Trésorerie : mouvements non vérifiés.
- Couleurs : rouge alerte/remplacement ; or vérification/important ; vert prêt à valider ; bleu neutre. Contour et pictogramme partagent leur accent.
- Montants : espaces, virgule et symbole €, sans conversion de devise.
- Noms : normalisation côté serveur des clients, destinataires de devis et champs personnels validés ; pas de migration des données existantes.
- Entreprise : nom seul, troncature explicite si nécessaire. Grille : icône accessible sans texte visible.
- Icône PWA/iPhone v7 : un S vert sur noir, lueur verte, vérifié à 60 px. **Nom court en attente du choix de Mohamed**, métadonnées du nom inchangées pour l’instant.

Captures issues de l’application exécutée localement avec une base temporaire isolée : quatre actions de test (matériel, document importé, devis de 5 208,00 €, client Omar Touré). Aucun accès ni changement aux données de production. `accueil-corrige.png` montre la page entière ; `actions-corrigees.png` montre la zone d’actions à 390 × 844.

Validation : suite Python complète et test navigateur `tests/home_corrections.cjs`, neuf combinaisons de largeur (320/390/430) et colonnes (2/3/4), navigation contextuelle et brouillon assistant conservés.

Illustration de l’icône : outil intégré de génération d’images. Consigne : un unique S majuscule large en verre émeraude brillant, centré sur fond noir avec halo vert discret, reconnaissable à 60 px, sans texte SUPER APP ni autre symbole. Déclinaisons PNG : 32, 180, 192, 512 px dans `static/icons/`, aperçu 60 px ici.
