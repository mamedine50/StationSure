# StationSûre — Schéma de base et sécurité (phase 1)

Base Postgres 17 sur Supabase. Toutes les tables sont dans le schéma `public` ; les fonctions
internes (triggers, fabriques de policies) sont dans `private`, jamais exposé par l'API.

Conventions :

- PK `uuid` (`gen_random_uuid()`), fournissable par le client (offline-first).
- Montants en FCFA entiers : `*_fcfa bigint`. Volumes en centilitres entiers : `*_cl bigint`.
  Hauteurs de jauge en millimètres : `height_mm integer`. Jamais de flottant.
- Toute table opérationnelle porte `organization_id`, `station_id`, `device_id`, `employee_id`,
  `device_created_at` (heure appareil) et `created_at` (heure serveur).
- Les clés étrangères composites `(x_id, station_id)` garantissent qu'un shift, un pistolet, une
  preuve ou un employé référencé appartient bien à la même station que la ligne.
- Enums Postgres pour tous les statuts et types. Commentaires SQL en français.

## Migrations

| # | Fichier | Contenu |
| --- | --- | --- |
| 0001 | `20260926090001_fondations.sql` | pgcrypto, schéma `private`, retrait des privilèges `anon`, `audit_log`, triggers génériques append-only / audit / updated_at, fabriques de policies |
| 0002 | `20260926090002_tenant.sql` | `plans`, `organizations`, `org_members`, `stations`, `devices`, `employees`, `employee_pins`, helpers RLS, `set_employee_pin()`, limite de stations |
| 0003 | `20260926090003_carburant.sql` | `fuel_products`, `tanks`, `tank_calibrations`, `pumps`, `nozzles`, `price_changes`, vue `current_fuel_prices`, `volume_from_calibration()`, prix verrouillés |
| 0004 | `20260926090004_preuves.sql` | `evidence_files`, bucket Storage privé `evidence` et ses policies |
| 0005 | `20260926090005_operations.sql` | `shifts`, `meter_readings`, `shift_handovers`, `tank_readings`, `fuel_deliveries` |
| 0006 | `20260926090006_caisse.sql` | `transactions`, `transaction_items`, `payments`, `voids`, `credit_accounts`, `credit_entries`, `bank_deposits` |
| 0007 | `20260926090007_stock.sql` | `products`, `inventory_movements`, `blind_counts`, `blind_count_lines` |
| 0008 | `20260926090008_transversal.sql` | `alerts`, `reconciliations` |
| 0009 | `20260926090009_identite_enums.sql` | valeurs d'enum `pin_lockout`, `device_paired`, `device_revoked` ; enum `session_end_reason` |
| 0011 | `20260926090011_carburant_enums.sql` | `shift_status.opening`, `session_end_reason.handover`, alertes `meter_regression`, `delivery_shortfall`, `shift_opened` ; enums `tank_reading_kind`, `handover_side`, `delivery_status` |
| 0012 | `20260926090012_carburant_cycle.sql` | `tank_calibration_versions` (+ `version_id` sur `tank_calibrations`), `create_calibration_version()`, `volume_from_calibration(tank, mm, at)`, `evidence_uploads` + `confirm_evidence_upload()`, colonnes de passation / régression sur `meter_readings`, `shift_id` / `kind` / `expected_cl` sur `tank_readings`, `theoretical_stock_cl()`, rapprochement cuve, `open_shift()`, `close_shift_fuel()`, `shift_fuel_summary()`, passation (`start_handover`, `sign_handover_outgoing`, `sign_handover_incoming`, `compare_handover`, `report_handover_discrepancy`), `fuel_delivery_sessions` + `start_delivery`, `advance_delivery`, `sign_delivery`, `reverse_delivery`, `nozzle_is_paused()` |
| 0010 | `20260926090010_identite.sql` | `create_organization()`, `device_pairing_codes`, `pairing_rate_limits`, `create_pairing_code()`, `consume_pairing_code()`, `register_paired_device()`, `revoke_device()`, `employee_sessions`, `pin_attempts`, `verify_employee_pin()`, `end_employee_session()`, `current_employee_id()`, `current_employee_session()`, `employees_with_pin()`, PIN non trivial, durcissement des policies d'insertion |

## Tables et relations

### Tenant et référentiel

| Table | Rôle | Relations clés |
| --- | --- | --- |
| `plans` | offres : `solo` (1 station), `groupe` (5), `reseau` (illimité) | PK `code` (enum) |
| `organizations` | racine de l'isolation | → `plans` |
| `org_members` | comptes auth web : `owner` ou `supervisor` | → `organizations`, `auth.users` |
| `stations` | stations d'une organisation | → `organizations` ; `unique (id, organization_id)` |
| `devices` | appareil = compte auth dédié lié à UNE station | → `stations`, `auth.users` (unique) |
| `employees` | employés sans compte auth, rôle enum | → `stations` |
| `employee_pins` | hash bcrypt du PIN, **aucune policy, aucun privilège API** | → `employees` |

### Carburant

| Table | Rôle | Relations clés |
| --- | --- | --- |
| `fuel_products` | `super`, `gasoil` (référentiel global) | PK `code` |
| `tanks` | cuves, `capacity_cl` | → `stations`, `fuel_products` |
| `tank_calibrations` | barémage `height_mm → volume_cl`, `unique (tank_id, height_mm)` | → `tanks` |
| `pumps` / `nozzles` | pompes et pistolets (« P3-A »), un pistolet relie une pompe à une cuve | → `stations`, `tanks` |
| `price_changes` | prix publiés par l'owner, append-only | → `stations`, `auth.users` (`created_by`) |
| vue `current_fuel_prices` | dernier prix en vigueur par station et produit (`security_invoker`) | |

### Opérations (append-only sauf `shifts`, `shift_handovers`)

`shifts` (statut `open → closing → closed`, figé une fois clos), `meter_readings` (index par
pistolet, photo obligatoire), `shift_handovers` (passation contradictoire), `tank_readings`
(jaugeage, `volume_cl` recalculé par le serveur), `fuel_deliveries` (facturé vs reçu).

### Caisse (append-only sauf `credit_accounts`)

`transactions` (moteur unique, `reverses_id` pour la contre-écriture, une seule par transaction,
montant négatif), `transaction_items`, `payments` (espèces, carte, Wave, Orange Money, crédit),
`voids` (motif obligatoire), `credit_accounts` (plafond fixé par l'owner), `credit_entries`
(plafond vérifié en base), `bank_deposits` (bordereau obligatoire).

### Stock (append-only sauf `products`, `blind_counts`)

`products` (catalogue de l'organisation, sans colonne de stock), `inventory_movements` (une seule
table pour toutes les activités, quantité signée), `blind_counts` et `blind_count_lines` (comptage
à l'aveugle : aucune quantité théorique n'est stockée, et l'appareil n'a **aucune lecture** sur
`inventory_movements`).

### Identité (phase 2)

| Table | Rôle | Accès |
| --- | --- | --- |
| `device_pairing_codes` | code de jumelage à 6 chiffres, **hash bcrypt**, valable 10 min, usage unique, 5 essais | lecture owner/supervisor ; écriture par RPC uniquement |
| `pairing_rate_limits` | tentatives de jumelage par IP (10 / 15 min) | aucun accès API (service_role) |
| `employee_sessions` | session ouverte par PIN sur un appareil (12 h max, une seule active par appareil) | lecture owner/supervisor + appareil (sa station) ; écriture par RPC |
| `pin_attempts` | succès et échecs de PIN ; 5 échecs / 15 min = blocage 15 min + alerte `pin_lockout` | lecture owner/supervisor |

Fonctions :

| Fonction | Qui | Effet |
| --- | --- | --- |
| `create_organization(name, plan_code)` | utilisateur authentifié sans organisation | organisation + membre owner, atomique |
| `create_pairing_code(station_id)` | owner | renvoie `{code, expires_at, qr, pairing_id}` — le code en clair n'est jamais stocké |
| `consume_pairing_code(code, ip, pairing_id?)` | service_role (Edge Function `pair-device`) | valide et marque utilisé ; **renvoie** `{ok:false}` (pas d'exception, pour garder les compteurs) |
| `register_paired_device(pairing_id, auth_user_id, label)` | service_role | crée la ligne `devices` + alerte `device_paired` |
| `revoke_device(device_id)` | owner | `devices.active = false`, sessions employé fermées, `auth.users.banned_until = infinity`, jetons supprimés, alerte |
| `verify_employee_pin(employee_id, pin)` | appareil actif | `{ok:true, session…}` ou `{ok:false, error: PIN_INVALID | PIN_LOCKED, retry_after_seconds}` ; lève `DEVICE_NOT_PAIRED` |
| `end_employee_session(session_id, reason)` | appareil | ferme sa session (`logout` ou `inactivity`) |
| `current_employee_id()` / `current_employee_session()` | policies / appareil | employé de la session active non expirée de l'appareil courant |
| `set_employee_pin(employee_id, pin)` | owner | exactement 4 chiffres, non trivial (`private.is_trivial_pin`, miroir de `packages/core/src/pin.ts`) |
| `employees_with_pin()` | owner/supervisor | ids des employés ayant un PIN (jamais le hash) |

**Durcissement** : toute policy `<table>_insert_device` exige désormais `employee_id = current_employee_id()`
(`opened_by` pour `shifts`, `outgoing_employee_id` pour `shift_handovers`). Un appareil ne peut
attribuer une opération qu'à l'employé connecté par PIN sur lui.

### Cycle carburant (phase 3)

| Objet | Rôle |
| --- | --- |
| `tank_calibration_versions` / `tank_calibrations` | barémage versionné : on publie une nouvelle version (`create_calibration_version`, owner, validée : ≥ 2 points, hauteurs uniques, volumes strictement croissants, certificat PDF dans `{org}/{station}/calibration/`) ; `volume_from_calibration(tank, mm, at)` utilise la version en vigueur à la date `at`, donc les jaugeages passés ne changent jamais |
| `evidence_uploads` | confirmation serveur qu'une preuve est dans le bucket (`confirm_evidence_upload` vérifie `storage.objects`). Une opération est « en attente de preuve » tant que sa photo n'est pas confirmée ; `open_shift`, la passation et la livraison l'exigent |
| `meter_readings` | + `handover_id` / `handover_side` (passation), `justification`, `previous_index_cl` et `flagged_regression` (posés par trigger : un index qui recule est accepté mais signalé par une alerte `meter_regression`), GPS. Refusé si le pistolet est en pause (`NOZZLE_PAUSED`) |
| `tank_readings` | + `shift_id`, `kind` (open, close, delivery_before, delivery_after, spot), `expected_cl` / `variance_cl`. `volume_cl` est **toujours** recalculé par le serveur ; chaque jaugeage (hors delivery_after) crée un `reconciliations` de type `tank` et une alerte `tank_variance` si l'écart dépasse 0,5 % des litres vendus |
| `shifts` | naît en `opening` ; `open_shift()` vérifie relevés + photos de tous les pistolets et cuves actifs ; `close_shift_fuel()` passe en `closing` (clôture de caisse en phase 4). Les changements de statut ne passent que par les RPC (`SHIFT_RPC_ONLY`) |
| `shift_handovers` | passation à l'aveugle : les relevés du sortant ne sont lisibles par l'appareil qu'une fois la passation terminée (policy `meter_readings_select_device`). `compare_handover` = `comparerPassation` (tolérance 0). Écart → `disputed` + alerte ; `report_handover_discrepancy` accepte la passation et attribue l'écart au shift sortant (`attributed_shift_id`) |
| `fuel_delivery_sessions` | réception en 4 étapes (gérant) ; pendant `unloading`, `nozzle_is_paused()` bloque tout relevé sur les pistolets de la cuve |
| `fuel_deliveries` | résultat figé : `received_cl` = après − avant (serveur), `variance_pct`, `signed_with_reserve` obligatoire si \|écart\| > 0,3 % + alerte `delivery_shortfall` ; correction par `reverse_delivery` (ligne négative, `reverses_id`) |

Équivalences core ↔ SQL testées : `volumeDepuisBaremageMm` ↔ `volume_from_calibration`, `comparerPassation` ↔ `compare_handover`, `litresVendus` ↔ `shift_fuel_summary`, `ecartLivraisonPourcent` ↔ `sign_delivery`, `validerBaremage` ↔ `private.validate_calibration_points`.

### Transversal

`evidence_files` (append-only, chemin forcé `{organization_id}/{station_id}/…`, sha256, GPS),
`alerts` (créées par le serveur, accusé de réception owner), `reconciliations` (append-only,
serveur uniquement), `audit_log` (append-only).

## Modèle d'accès et helpers

| Fonction | Renvoie |
| --- | --- |
| `current_org_ids()` | organisations où l'utilisateur est owner ou supervisor |
| `is_org_owner(org_id)` | vrai si owner de cette organisation |
| `current_device_id()` / `current_device_station_id()` / `current_device_organization_id()` | l'appareil actif lié au compte auth courant, sa station, son organisation |
| `current_station_ids()` | stations visibles (organisations de l'utilisateur ∪ station de l'appareil) |

Toutes sont `SECURITY DEFINER`, `STABLE`, `search_path = ''`, exécutables par `authenticated` et
`service_role` uniquement.

## Matrice RLS

| Rôle | Lecture | Écriture |
| --- | --- | --- |
| **owner** | tout ce qui porte son `organization_id` (config, opérations, audit, alertes, rapprochements) | configuration : stations, appareils, employés (+ PIN via `set_employee_pin`), cuves, barémage, pompes, pistolets, prix (`price_changes`, insert seulement), produits, comptes crédit, membres ; demande et annule les comptages surprise ; accuse réception des alertes ; renomme l'organisation ; insère une annulation approuvée (`voids`) |
| **supervisor** | idem owner | rien |
| **appareil** (compte auth créé au jumelage, une station) | configuration de SA station (station, appareils, employés, cuves, barémage, pompes, pistolets, prix, catalogue produits) et opérations de SA station (shifts, relevés, passations, jaugeages, livraisons, transactions, lignes, paiements, annulations, crédit, versements, preuves, comptages). **Jamais** `inventory_movements`, `audit_log`, `alerts`, `reconciliations`, `employee_pins`, ni une autre station | insère les opérations de SA station avec `device_id = current_device_id()` et `employee_id = current_employee_id()` (session PIN active) ; met à jour le statut de ses shifts, passations et comptages |
| **service_role** | tout (bypass RLS) | tout, mais reste soumis aux triggers (append-only, prix verrouillés, limite de stations) |
| **anon** | rien (aucun privilège sur `public`) | rien |

Règles : RLS activée sur 100 % des tables ; aucune policy `using (true)` ; les référentiels globaux
(`plans`, `fuel_products`) sont lisibles par tout utilisateur authentifié ; `employee_pins` n'a
aucune policy.

Vocabulaire des policies (créées par les fabriques de `private`) :

| Fabrique | Policy créée | Sens |
| --- | --- | --- |
| `policy_select_org(t)` | `<t>_select_org` | lecture si `organization_id ∈ current_org_ids()` |
| `policy_select_device(t)` | `<t>_select_device` | lecture si `station_id = current_device_station_id()` |
| `policy_write_owner(t)` | `<t>_insert_owner`, `_update_owner`, `_delete_owner` | écriture si `is_org_owner(organization_id)` |
| `policy_insert_device(t, col)` | `<t>_insert_device` | insertion si station, appareil et organisation = ceux de l'appareil **et** `col = current_employee_id()` (`employee_id` par défaut) |
| `policy_update_device(t)` | `<t>_update_device` | mise à jour des lignes de la station de l'appareil |

## Garde-fous en base (non contournables par l'app)

1. **Append-only** (`private.enable_append_only`) : UPDATE, DELETE et TRUNCATE lèvent
   `APPEND_ONLY` pour tous les rôles, `postgres` et `service_role` compris, sur
   `meter_readings`, `tank_readings`, `fuel_deliveries`, `transactions`, `transaction_items`,
   `payments`, `voids`, `credit_entries`, `bank_deposits`, `inventory_movements`, `price_changes`,
   `evidence_files`, `audit_log`, ainsi que `blind_count_lines` et `reconciliations`. Correction =
   contre-écriture (`transactions.reverses_id`, montant négatif, une seule fois, même station).
2. **Limite de stations** (`private.enforce_station_limit`) : refus au-delà de `plans.max_stations`,
   avec verrou sur l'organisation.
3. **Prix verrouillés** : RLS (`price_changes_insert_owner`, `created_by = auth.uid()`) + trigger
   `enforce_price_author_is_owner` qui refuse tout `created_by` non owner, même en `service_role`.
4. **Audit** (`private.enable_audit`) : chaque INSERT/UPDATE/DELETE sur `plans`, `organizations`,
   `org_members`, `stations`, `devices`, `employees`, `employee_pins`, `tanks`, `tank_calibrations`,
   `pumps`, `nozzles`, `price_changes`, `products`, `credit_accounts` écrit dans `audit_log`
   (ancienne et nouvelle valeur, `auth.uid()`, rôle Postgres).
5. **`volume_from_calibration(tank_id, height_mm, at)`** : mêmes règles que `packages/core`
   (`volumeDepuisBaremage`) : point exact, interpolation linéaire arrondie au centilitre, erreur
   `BAREMAGE_HORS_TABLE` / `BAREMAGE_TABLE_VIDE`. `tank_readings.volume_cl` est toujours recalculé
   par ce garde-fou.
6. Compléments : shift clos figé (`SHIFT_CLOSED`), plafond de crédit (`CREDIT_LIMIT`), chemin de
   preuve forcé dans le dossier organisation/station, contre-écriture limitée à la même station.

## Storage

Bucket privé `evidence` (10 Mo, images et PDF). Chemin `{organization_id}/{station_id}/<fichier>`.
Lecture : membres de l'organisation ou appareil de la station. Insertion : appareil dans le dossier
de sa station uniquement. Aucune policy update / delete.

## Tests de sécurité

`supabase/tests/_src/*.sql.src` sont les sources ; `bash supabase/tests/_build.sh` (ou
`pnpm db:test`) les assemble avec le préambule commun en fichiers pgTAP puis lance
`supabase test db`. Chaque fichier est une transaction annulée à la fin ; le préambule simule un
JWT Supabase (`pg_temp.login(uid)`, `logout()`, `as_service()`, `as_anon()`).

## Ajouter une table sans casser la sécurité

1. Créer une migration numérotée dans l'ordre (`supabase migration new <domaine>`).
2. Colonnes obligatoires : `id uuid pk default gen_random_uuid()`, `organization_id`, `station_id`
   (ou seulement `organization_id` pour un référentiel d'organisation), `created_at`. Pour une
   table opérationnelle : `device_id`, `employee_id`, `device_created_at`.
3. Clés composites : `foreign key (station_id, organization_id) references stations (id, organization_id)`,
   et `(device_id, station_id)`, `(employee_id, station_id)`, `(x_id, station_id)` pour tout objet
   de la station référencé. Ajouter `unique (id, station_id)` si la table sera référencée.
4. `alter table … enable row level security;` puis les fabriques : `policy_select_org` toujours ;
   `policy_select_device` si l'appareil doit lire ; `policy_write_owner` pour la configuration ;
   `policy_insert_device(t, colonne_employé)` (+ `policy_update_device` si statut) pour les
   opérations. Jamais de `using (true)`.
   Une RPC qui enregistre un échec (compteur, tentative) doit **renvoyer** l'échec, pas lever une
   exception, sinon l'écriture est annulée.
5. Table de mouvement → `private.enable_append_only` + `revoke update, delete … from authenticated`.
   Table de configuration → `private.enable_audit` + `private.enable_updated_at`.
6. `pnpm db:reset && pnpm db:lint && pnpm db:test` : le test générique `010` vérifie la RLS, l'absence
   de policy `true`, l'absence de privilège `anon` et la présence d'`organization_id`. Ajouter un
   test ciblé dans `_src/`.
7. `pnpm db:types` pour régénérer `packages/database/src/types.generated.ts`.
