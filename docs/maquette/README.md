# StationSûre — Maquette validée

Référence visuelle pour le développement. À placer dans `docs/maquette/` du repo.
Chaque écran existe en deux formats :
- `.html` : styles exacts (couleurs, tailles, espacements). À ouvrir dans un navigateur ou à lire comme référence de code.
- `.png` : capture de l'écran (les polices peuvent différer légèrement ; les vraies polices sont dans les tokens ci-dessous).

Les données affichées (noms, montants, litres) sont des exemples. Elles sont cohérentes entre les écrans et servent aussi de cas de test.

## Écrans

| # | Fichier | App | Rôle | Phase |
|---|---|---|---|---|
| 1 | 01-connexion-pin | Mobile station | Tous les employés | 2 |
| 2 | 02-releve-index-photo | Mobile station | Pompiste | 3 |
| 3 | 03-passation-shift | Mobile station | Pompistes sortant / entrant | 3 |
| 4 | 04-cloture-caisse | Mobile station | Gérant | 4 |
| 5 | 05-dashboard-proprietaire | Web | Propriétaire | 5 |
| 6 | 06-rapport-whatsapp | WhatsApp | Propriétaire | 5 |
| 7 | 07-boutique-comptage-surprise | Mobile station | Caissier boutique | 7 |
| 8 | 08-garage-ordre-de-travail | Mobile station | Mécanicien | 8 |
| 9 | 09-carwash-ticket | Mobile station | Laveur / caissier | 8 |
| 10 | 10-stock-proprietaire | Web | Propriétaire | 9 |

Mobile : 390 px de large (Android d'abord). Web : 1440 px de large.

## Comment ça marche (règles à respecter dans le code)

1. **Connexion PIN** — chaque employé a son PIN personnel. Aucun compte partagé. Seuls les appareils enregistrés peuvent ouvrir un shift.
2. **Relevé d'index** — photo obligatoire du totaliseur de chaque pistolet (heure + GPS). L'index saisi est comparé à l'index de clôture précédent. Pas de photo, pas d'ouverture.
3. **Passation** — le sortant et l'entrant valident les mêmes index avec leur PIN. Tout écart (tolérance 0) bloque la passation et alerte le propriétaire.
4. **Clôture de caisse** — montant attendu (index × prix + ventes) vs encaissé (espèces, Wave, Orange Money, carte, crédit). Écart ≠ 0 → justification obligatoire. Preuves manquantes → bouton de clôture désactivé.
5. **Dashboard** — chiffres du jour par station, alertes, CA par activité, score d'écart par employé.
6. **Rapport WhatsApp** — alerte immédiate sur écart + résumé automatique à chaque clôture.
7. **Comptage surprise** — le propriétaire (ou le système, au hasard) choisit 5 articles. L'employé compte SANS voir le stock théorique. L'écart est calculé côté serveur et attribué au shift.
8. **Ordre de travail garage** — photo de plaque à l'entrée. Chaque pièce / litre d'huile sort du stock en le scannant sur l'OT. Quantités standard par type de véhicule. Pas d'OT facturé = pas de sortie du véhicule.
9. **Ticket Car Wash** — ticket créé AVANT le lavage, avec photo de plaque. Consommables déduits automatiquement selon la prestation. Compteur d'eau du soir comparé au nombre de lavages déclarés.
10. **Stock** — une seule table de mouvements pour toutes les activités. Écarts attribués à un employé. Ratios de contrôle : huile fût vs OT, véhicules entrés vs OT facturés, eau par lavage, bouteilles de gaz pleines + vides.

Principe global : **pas de preuve, pas de clôture**. Tout est attribué à une personne, un appareil et une heure.

## Design tokens (dark mode uniquement)

| Token | Valeur |
|---|---|
| fond | #0E1311 |
| surface | #161D1A |
| surface-2 | #1E2723 |
| bordure | #2A3530 |
| bordure-forte | #4A5852 |
| texte | #EEF2EF |
| texte-secondaire | #A3B0AA |
| accent (ambre) | #F2A541 — texte dessus #1A1206 |
| accent-fond | #221C10 |
| succès | #4CC38A |
| danger | #FF7A66 — fond #2A1512, bordure #7A2F25 |
| info | #7AA7F5 |

Polices : **Sora** (titres, 600/700), **IBM Plex Sans** (texte, 400/500/600), **IBM Plex Mono** (tous les chiffres : montants, index, litres).
Rayons : 10–16 px. Boutons tactiles ≥ 48 px de haut. Montants en FCFA avec espace comme séparateur de milliers (2 385 000), décimales avec virgule (482 371,25).
