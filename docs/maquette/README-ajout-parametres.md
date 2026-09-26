# Ajout maquette — Paramètres (écran 18)

À copier dans docs/maquette/. Web, owner seulement (supervisor en lecture). Phase 5.

## Règles
- **Seuils d'alerte** modifiables (défauts) : écart de cuve 0,5 % ; écart de livraison 0,3 % ; écart de caisse toléré en espèces 1 000 FCFA (proposition, peut être 0) ; bordereau manquant après 24 h. Personnalisables par station (surcharge).
- **Verrouillé (non modifiable)** : tolérance 0 sur paiements électroniques, passation, index qui recule.
- **Plafonds d'annulation par rôle** : gérant 50 000 ; boutique 25 000 ; pompiste 10 000 ; mécanicien / laveur 10 000.
- **Accès web** : invitation de superviseurs par courriel (lecture seule), statut de l'invitation, révocation.
- **Destinataires WhatsApp** : nom + numéro (format international), cases « rapport du soir » et « alertes graves ».
- **Quand prévenir** : rapport après chaque clôture OU à heure fixe (fuseau Africa/Dakar) ; chaque type d'alerte est routé « immédiatement » ou « dans le rapport du soir » ; SMS de secours si WhatsApp non délivré en 10 min.
- **Bandeau mode test** tant que le compte WhatsApp Business n'est pas connecté : les messages s'affichent dans une page de test.
- Chaque modification est tracée dans audit_log.
