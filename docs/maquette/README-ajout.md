# Ajout maquette — Carburant (écrans 11 à 13)

À copier dans docs/maquette/ à côté des écrans 01 à 10. Même design tokens que le README principal.

| # | Fichier | App | Rôle | Phase |
|---|---|---|---|---|
| 11 | 11-jaugeage-cuves | Mobile station | Pompiste / gérant | 3 |
| 12 | 12-reception-livraison | Mobile station | Gérant | 3 |
| 13 | 13-config-carburant-web | Web | Propriétaire | 3 |

## Règles
11. **Jaugeage** — l'employé saisit la hauteur (mm) et photographie la réglette (heure + GPS). Le volume est calculé par le serveur via le barémage de la cuve (volume_from_calibration) ; jamais saisi. Écart vs stock théorique affiché ; au-delà de ±0,5 % → alerte.
12. **Livraison** — 4 étapes : jauge avant → dépotage → jauge après → photo du bon + signature. Livré mesuré = volume après − volume avant. Écart vs facturé > 0,3 % → signature « avec réserve » + alerte propriétaire. Les pistolets reliés à la cuve sont en pause pendant le dépotage (ventes impossibles sur ces pistolets).
13. **Configuration (web, owner seulement)** — cuves (capacité, produit), barémage (saisie, import CSV, certificat PDF, courbe strictement croissante), pompes et pistolets reliés à une cuve, publication des prix + historique. Toute modification est tracée dans audit_log.

Les valeurs (750 mm → 9 500 L, 900 mm → 12 200 L, 1 205 mm → 16 460 L) sont celles des tests de barémage. Les prix sont volontairement en [PRIX].
