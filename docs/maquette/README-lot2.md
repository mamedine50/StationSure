# Maquette — lot 2 (écrans 21 à 26)

À copier dans docs/maquette/. Même design tokens.

## App mobile : vraie structure d'app
- Barre d'onglets en bas (expo-router Tabs) : Accueil, Carburant, Caisse, Boutique, Moi (+ Lavage / Vidange pour les laveurs et mécaniciens). **Un onglet n'apparaît que si l'employé a le module correspondant** (écran 25 : un laveur n'a que 3 onglets).
- Badges sur les onglets (ex. photos en attente sur « Moi »). Statut réseau en haut de l'accueil (« En ligne »), préparation du bandeau hors ligne.
- 21 **Accueil** = tableau de bord du shift : prochaine action (gros bouton contextuel : Ouvrir le shift / Encaisser / Passation / Fermer), tâches du shift cochées (relevés, jaugeage, bordereau, passation), mes dernières opérations. **Jamais de total attendu.**
- 22 **Carburant** : état de chaque pistolet, puis actions (jaugeage, passation, livraison, fermer le shift) avec leur statut.
- 23 **Caisse** : gros bouton Encaisser, puis Crédit, Annulation, Versement, Clôture (désactivée avant la fermeture du shift, avec la raison). Paiements mobiles du shift avec statut de rapprochement. Rappel : l'attendu n'apparaît qu'après le billetage.
- 24 **Moi** : profil, mes modules (lecture seule), photos en attente d'envoi + renvoyer, changer d'employé, langue, aide, appareil et version.

## Web : 26 fiche employé et modules (owner seulement)
- Type d'employé (8 types système : Gérant, Chef de piste, Pompiste, Caissier boutique, Mécanicien (vidange), Laveur, Gardien de nuit, Adjoint de station) + types personnalisés créés par le propriétaire.
- Modules à cocher par groupe (Carburant, Caisse ; Boutique et Services grisés « bientôt »). Badge « Personnalisé » si différent du type, lien « Revenir au modèle ».
- Encadré « Toujours réservé au propriétaire » : prix, approbations, écarts de caisse, comptes crédit, configuration — jamais attribuable.
- Historique des changements de droits. Les droits sont vérifiés par le serveur.
