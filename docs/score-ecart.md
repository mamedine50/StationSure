# Score d'écart par employé (phase 5)

Indicateur simple, calculé **côté serveur** (`public.employee_variance_scores(p_days, p_station_id)`),
sans IA, affiché sur le tableau de bord (écran 05, « Score d'écart · 30 jours »). Plus le score est
haut, plus l'employé a été impliqué dans des écarts sans preuve automatique. Ce n'est pas une preuve
de fraude : c'est un ordre de priorité pour les contrôles du propriétaire.

## Incidents comptés (fenêtre glissante de N jours, 30 par défaut)

| Incident                        | Source                                                                                            | Poids |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ----- |
| Écart de caisse                 | dernière `cash_closings` du shift **au-delà de la tolérance espèces effective** de la station, imputée à l'employé qui a clôturé | 1     |
| Écart de passation attribué     | `shift_handovers.attributed_shift_id` renseigné (le sortant reste responsable de l'écart d'index) | 1     |
| Annulation refusée              | `voids` de l'employé avec `void_approvals.decision = 'rejected'`                                    | 0,5   |
| Index qui recule                | `meter_readings.flagged_regression` de l'employé                                                  | 0,5   |

Les écarts **sous** la tolérance (par exemple −500 FCFA avec une tolérance de 1 000) ne comptent pas.
Les tolérances verrouillées (paiements électroniques, passation, index qui recule) sont à 0 : tout
écart de ces natures compte.

## Formule

```
pondéré = 1 × écarts_caisse + 1 × passations_attribuées + 0,5 × annulations_refusées + 0,5 × index_reculés
shifts  = nombre de shifts distincts ouverts ou clôturés par l'employé sur la fenêtre (minimum 1)
score   = min(100, arrondi(400 × pondéré / shifts))
```

Autrement dit : **un incident pondéré tous les quatre shifts donne 100**. Le facteur 400 rend le
score lisible sur 0–100 avec les volumes d'une station (20 à 30 shifts par mois et par employé) :

| Exemple                                        | pondéré | shifts | score |
| ---------------------------------------------- | ------- | ------ | ----- |
| Fatou Faye : aucun incident                    | 0       | 26     | 0     |
| Awa Diop : 1 écart de caisse                   | 1       | 24     | 17    |
| Cheikh Mbaye : 2 écarts de caisse              | 2       | 21     | 38    |
| Ibrahima Sarr : 4 écarts + 1 passation         | 5       | 22     | 91    |
| Employé sans shift mais avec 1 annulation refusée | 0,5  | 1      | 100 (plafond) |

Un employé sans aucun shift ni incident a un score de 0.

## Lecture

- Trier par score décroissant ; comparer des employés d'un même rôle (un gérant clôture plus
  souvent qu'un pompiste, donc a plus d'occasions d'écart, mais aussi plus de shifts au dénominateur).
- Le détail (`cash_variances`, `handover_variances`, `rejected_voids`, `meter_regressions`, `shifts`)
  est renvoyé avec le score pour expliquer chaque valeur : « 4 écarts / 22 shifts ».
- Un score n'est jamais modifié à la main : il se recalcule à chaque affichage à partir des tables
  append-only.

## Tests

`supabase/tests/_src/120_proprietaire.sql.src` vérifie les cas de la seed (Ibrahima Sarr 4 écarts +
1 passation, Khady Fall 1 annulation refusée, Moussa Ndiaye 1 index qui recule, Fatou Faye sous
tolérance → 0), le plafond à 100, l'ordre et le filtre par station.
