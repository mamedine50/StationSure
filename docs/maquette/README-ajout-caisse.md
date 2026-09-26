# Ajout maquette — Caisse (écrans 14 à 17)

À copier dans docs/maquette/. Même design tokens que le README principal. Complète l'écran 04 (clôture de caisse).

| # | Fichier | App | Rôle | Phase |
|---|---|---|---|---|
| 14 | 14-billetage-aveugle | Mobile station | Gérant / caissier | 4 |
| 15 | 15-paiement-wave-om | Mobile station | Pompiste / caissier | 4 |
| 16 | 16-vente-credit | Mobile station | Gérant | 4 |
| 17 | 17-web-approbations-versements | Web | Propriétaire | 4 |

## Règles
14. **Billetage à l'aveugle** — comptage par coupure (billets 10 000, 5 000, 2 000, 1 000, 500 ; pièces 200, 100, 50). Le montant attendu n'est JAMAIS affiché ni renvoyé à l'appareil avant validation. Une fois validé, le comptage est figé (append-only). Le serveur calcule ensuite l'écart.
15. **Paiement Wave / Orange Money** — le client paie sur le QR marchand du PROPRIÉTAIRE. L'employé saisit la référence de transaction. Rapprochement automatique (import du relevé marchand, puis API si disponible). Statuts : en attente → rapproché / introuvable. L'argent ne passe jamais par l'employé.
16. **Vente à crédit** — uniquement pour un compte existant, dans la limite du plafond (vérifié en base), avec photo du bon signé. Le gérant peut DEMANDER un nouveau compte : plafond 0 tant que le propriétaire n'a pas validé.
17. **À valider (web, owner seulement ; supervisor en lecture)** — écarts de caisse (accepter la perte / retenue sur salaire / demander un recomptage), annulations demandées (approuver / refuser), comptes crédit demandés (fixer le plafond), versements bancaires (espèces comptées vs versé, photo du bordereau, bordereau manquant, relance WhatsApp, export comptable). Chaque décision est tracée.

Les montants (1 120 000 ; −35 000 ; Transports Ndiaye 500 000 / 320 000) se recoupent avec les écrans 04 et 05.
