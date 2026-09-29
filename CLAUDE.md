# StationSûre — guide pour les agents

> ## RÈGLE ABSOLUE : NE JAMAIS EFFACER LA BASE LOCALE DE TRAVAIL
>
> **`supabase db reset` est INTERDIT** sauf demande explicite du propriétaire du repo dans la
> conversation en cours. La base locale contient son compte et ses données de test réelles
> (`mamedine50@gmail.com`, organisation « Leona Énergies »).
>
> - Nouvelle migration → `pnpm db:migrate` (`supabase migration up`), jamais un reset.
> - Tests pgTAP → autonomes : chaque fichier crée son propre jeu de données (seed.sql sous l'espace de
>   noms `test:`) dans sa transaction et fait ROLLBACK. Ils ne dépendent ni de la seed chargée, ni de
>   l'état de la base. Un test qui compte des lignes doit filtrer par `organization_id = pg_temp.org_demo()`.
> - Avant toute opération risquée : `pnpm db:backup-org -- --email <courriel>` ; restauration :
>   `pnpm db:restore-org -- --file <fichier.json> --confirm` (dry-run par défaut).
> - Compter les lignes de l'organisation avant et après un lot et le montrer.

## Le projet en bref

Plateforme de gestion de stations-service au Sénégal. Priorité n° 1 : empêcher un propriétaire absent
de se faire voler par ses employés (carburant, caisse, boutique, garage, Car Wash). Priorité n° 2 : ERP
complet. Architecture validée : `docs/architecture-v2.pdf`. Écrans et règles métier validés :
`docs/maquette/README.md` + les 10 écrans `.html` / `.png`. **Ne pas modifier `docs/`.**

Identité : nom affiché `StationSûre` (constante `APP_NAME` dans `packages/core`), identifiant
technique `stationsure`, scope npm `@stationsure/*`, package Android `sn.stationsure.app`.

## Stack

pnpm workspaces (node-linker hoisted) + Turborepo, TypeScript 5.9 strict partout, Next.js 16 (App
Router, Tailwind 3), Expo SDK 57 + expo-router + NativeWind 4 (Tailwind 3), Supabase CLI local,
Vitest, ESLint 10 (flat config), Prettier. Pas d'EAS : `npx expo prebuild` puis
`npx expo run:android --device`.

Les packages internes sont consommés en **source TypeScript** (`main: ./src/index.ts`), sans build :
Next les transpile via `transpilePackages`, Metro nativement.

## Conventions non négociables

1. **Unités entières** : montants en FCFA entiers, volumes en centilitres entiers (`litresToCl`,
   `clToLitres`). Les fonctions de `packages/core` lèvent une `ErreurMetier` si une valeur n'est pas
   entière. Aucun flottant dans un calcul métier ; les pourcentages sont le seul résultat décimal.
2. **i18n obligatoire** : tout libellé visible passe par `@stationsure/i18n` (FR par défaut, EN). Les
   clés `fr.json` et `en.json` doivent rester identiques (vérifié par `satisfies` au typecheck).
3. **Dark mode uniquement** : tokens de `@stationsure/ui` (couleurs, rayons, polices), jamais de
   couleur en dur dans les composants. Boutons tactiles ≥ 48 px sur mobile.
4. **Pas de preuve, pas de clôture** : toute opération future porte auteur, appareil, horodatage
   appareil + serveur ; photo obligatoire pour index, bons, bordereaux ; append-only en base (pas
   d'UPDATE / DELETE sur les mouvements, contre-écritures uniquement).
5. **Aucune donnée fictive** dans les apps : les pages sans données affichent un état vide propre.
   (Exception assumée en phase 0 : l'écran PIN mobile reproduit les profils d'exemple de la maquette,
   regroupés dans `EXEMPLE_MAQUETTE`, à supprimer en phase 2.)
6. **Format sénégalais** des nombres : `2 385 000`, `482 371,25`, signe moins typographique « − ».
7. Aucun secret versionné : `.env*` ignorés, seuls les `.env.example` sont suivis.

## Commandes

`pnpm install` · `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test`.

Base locale (Docker requis, ports 547xx : API 54721, Postgres 54722, Studio 54723) :
`pnpm db:start` · `pnpm db:migrate` (migrations en attente, sans effacer) · `pnpm db:reset` (**interdit sans demande explicite** : efface la base locale) · `pnpm db:lint` · `pnpm db:test` (pgTAP) ·
`pnpm db:types` (régénère `packages/database/src/types.generated.ts`) · `pnpm db:stop` ·
`pnpm db:functions:test` (tests Deno des Edge Functions) · `pnpm db:functions:serve` (lit `supabase/functions/.env`) ·
`pnpm db:reset-station-config -- --email <courriel> [--confirm]` (nettoyage LOCAL d'une organisation de test) ·
`pnpm db:backup-org -- --email <courriel>` / `pnpm db:restore-org -- --file <json> [--confirm]`.
`psql` n'est pas installé : `docker exec supabase_db_stationsure psql -U postgres -c "…"`.

**INTERDIT sans demande explicite du propriétaire du repo : `supabase link`, `supabase db push`,
toute connexion au projet en ligne. `supabase/seed.sql` est LOCAL uniquement et ne doit jamais
être poussé.**

## Règles de la base (phase 1, détail dans docs/schema.md)

- Une migration par domaine, numérotée dans l'ordre (`supabase/migrations/2026092609000N_*.sql`).
- Chaque table : PK uuid, `organization_id` + `station_id`, `created_at`. Tables opérationnelles :
  `device_id`, `employee_id`, `device_created_at`. Clés étrangères composites `(x_id, station_id)`.
- Montants `*_fcfa bigint`, volumes `*_cl bigint`, hauteurs `height_mm integer`. Enums pour statuts.
- RLS sur 100 % des tables, aucune policy `using (true)`, `anon` sans aucun privilège. Policies
  créées avec les fabriques `private.policy_*` ; helpers `current_org_ids()`, `is_org_owner()`,
  `current_device_*()`, `current_station_ids()`.
- Garde-fous en base : append-only (`private.enable_append_only`), limite de stations, prix
  verrouillés (owner seulement), audit (`private.enable_audit`), `volume_from_calibration`.
- Le PIN vit dans `employee_pins` (bcrypt), sans policy ; seul `set_employee_pin()` y écrit.
- L'appareil ne lit jamais `inventory_movements` (comptage à l'aveugle).
- Tests pgTAP : sources dans `supabase/tests/_src/*.sql.src`, assemblés par `_build.sh`.
- Une RPC qui doit enregistrer un échec (tentative de PIN, code de jumelage) **renvoie** `{ok:false,
error}` au lieu de lever une exception : une exception annulerait l'écriture du compteur.

## Identité (phase 2)

- Web : `@supabase/ssr`, `src/proxy.ts` protège tout sauf `/connexion`, `/inscription`,
  `/mot-de-passe-oublie`, `/auth/callback`. Groupes de routes : `(auth)` public, `(compte)`
  protégé sans barre latérale (onboarding, nouveau mot de passe), `(app)` protégé + organisation +
  station obligatoires (`exigerContexteComplet`). Le superviseur ne voit aucun bouton d'écriture
  (`contexte.estProprietaire`) et la RLS refuse de toute façon.
- Validation des formulaires : `apps/web/src/lib/validation.ts` (zod v4, messages = clés i18n
  `validation.*`), testée avec Vitest. Règles du PIN dans `packages/core/src/pin.ts`, miroir exact de
  `private.is_trivial_pin` en base : modifier les deux ensemble.
- Jumelage : `create_pairing_code` (owner) → code 6 chiffres + QR `stationsure://pair?code=…&id=…`
  → Edge Function `pair-device` (sans JWT, `supabase/functions/pair-device`, logique testable dans
  `handler.ts`, tests `deno test`) → utilisateur auth dédié + ligne `devices` + session renvoyée.
- Mobile : session de l'appareil dans `expo-secure-store` (adaptateur découpé en morceaux,
  `src/lib/stockage-securise.ts`), jamais AsyncStorage. États `non_jumele → pin → connecte` dans
  `src/lib/session.tsx` ; inactivité `INACTIVITE_MINUTES` (10) dans `src/lib/env.ts`.
- Hors ligne : rien d'implémenté, options dans `docs/decisions/offline-pin.md`.

## Caisse et clôture (phase 4)

- Vente = `record_sale(jsonb)` (jamais d'insert direct de paiement depuis l'app). Wave / OM : référence
  obligatoire et unique par opérateur ; carte : 4 derniers chiffres seulement.
- Attendu d'un shift = `shift_cash_summary` (serveur). Un appareil ne l'obtient qu'après un
  `cash_counts` validé (`CASH_COUNT_REQUIRED`) ; `shift_expected_fuel` est réservé aux membres.
  Changement de prix pendant un shift → relevé `price_change` obligatoire sinon `close_shift_cash`
  refuse (`PRICE_CHANGE_READING_MISSING`).
- Seule une annulation **approuvée** (`void_approvals`) diminue l'attendu ; les comptes crédit
  demandés par le gérant sont `pending` / plafond 0 jusqu'à `decide_credit_account`.
- Clôture = `close_shift_cash` → `cash_closings` + shift `closed` immuable ; écart → alerte +
  `cash_variance_decisions`. Versements = `declare_bank_deposit` ; pg_cron : `flag_missing_deposits`,
  `flag_pending_mobile_money`.
- Rapprochement mobile money : le web normalise le CSV (`lireReleveMobileMoney` + mapping), la base
  rapproche (`import_mobile_money_statement`). Interface `AdaptateurReleveMarchand` pour l'API.
- Règles core ↔ SQL : `attenduCarburantParTranches`, `montantAttenduShift`, `montantAttenduEspeces`,
  `totalBilletage` (packages/core/src/cloture.ts).

## Propriétaire à distance (phase 5)

- **Seuils** : jamais de constante dans une règle ; lire `public.effective_setting(station_id, clé)`
  (clés `tank_variance_pct`, `delivery_variance_pct`, `cash_tolerance_fcfa`, `deposit_missing_hours`).
  Tolérance 0 sur paiements électroniques, passation, index qui recule : verrouillée, sans colonne.
- **Notifications** : tout message part de `notification_outbox` (clé d'idempotence, statut courant) +
  `notification_outbox_events` (historique append-only). Rapport du soir = valeurs figées de
  `cash_closings` (`build_evening_report` → `render_evening_report`, miroir de `renderRapportSoir` dans
  `packages/core/src/notifications.ts` : modifier les deux ensemble). Alertes routées « immédiat » ou
  « rapport » (`alert_route_for`), anti-spam 10 min.
- **Envoi** : Edge Function `notify-worker` (pg_cron + pg_net chaque minute, secret `x-worker-secret`),
  adaptateur choisi par `NOTIFIER` : `dev` (défaut, page `/dev/messages`, aucun envoi), `meta`
  (WhatsApp Cloud API, modèles de `docs/whatsapp-modeles.md`), SMS via `SMS_API_URL`. Webhook Meta =
  `notify-webhook` (signature HMAC). **Aucun envoi réel tant que `NOTIFIER=meta` n'est pas posé en ligne.**
- Superviseurs : `invite-supervisor` (service_role, `inviteUserByEmail`), lecture seule, jamais
  destinataires par défaut. Numéros des destinataires lisibles par l'owner seulement.
- Score d'écart : `employee_variance_scores` (formule dans `docs/score-ecart.md`), sans IA.

## Lot de correctifs n°1 (villes, petits écarts, cuves 3D, carburant en étapes)

- Villes : référence `sn_communes` (553, lecture pour tout utilisateur connecté), champ `ChampVille`
  (recherche via `rechercherLocalites` de core) partout où une station est créée ou modifiée ; « Autre »
  = `commune_code` null + `city` libre.
- Petits écarts : jamais ignorés. Tout écart est attribué ; cumul 30 jours par employé
  (`small_variance_cumulative_fcfa`, lu par `effective_setting`) → alerte immédiate, poids 0,25 dans le score.
- Cuves : `tank_levels` (serveur) alimente `components/cuves` (3D `@react-three/fiber` chargée en
  `dynamic(ssr:false)`, vue simple SVG, choix mémorisé `stationsure:vue-cuves`, `choisirVueCuves` de core).
  Seuil de commande par cuve → alerte `tank_low` une fois par passage.
- Configuration carburant : page `/carburant` en 4 étapes pilotée par `station_fuel_setup_status` ;
  `open_shift` et le mobile refusent tant que c'est incomplet. Saisie du barémage : jamais de placeholder
  ressemblant à des données ; `evaluerSaisieBaremage` (core) donne l'erreur à afficher.
- Nettoyage local d'un compte de test : `pnpm db:reset-station-config -- --email <courriel> [--confirm]`
  (jamais l'organisation de démo, jamais une base en ligne).

## Lot de correctifs n°2 (types d'employés, modules, vraie app mobile)

- Droits = **modules** (`employee_module`, liste fermée dans `packages/core/src/modules.ts`, miroir de
  l'enum). Type d'employé (8 système + personnalisés) → modules par défaut ; surcharge par employé.
  Le serveur vérifie : `private.require_module` dans chaque RPC mobile et dans les déclencheurs
  d'insertion → `MODULE_NOT_GRANTED`. L'app ne fait que cacher / désactiver avec la raison.
- Jamais attribuable à un employé : prix, approbations, écarts, comptes crédit, configuration (ils
  n'existent pas dans l'enum ; les RPC owner vérifient `is_org_owner`).
- Mobile : `src/app/(tabs)` (Accueil 21, Carburant 22, Caisse 23, Boutique, Lavage, Vidange, Moi 24) ;
  onglets visibles = `ongletsVisibles(modules)`, gros bouton = `prochaineAction(...)` (core, testés).
  L'accueil lit `shift_tasks` et `my_recent_operations` : aucun montant attendu, jamais.
- Web : `/employes/[id]` (écran 26, modules + historique des droits), `/employes/types`,
  `/carburant/historique` (barémages et prix avec auteur).

## Cycle carburant (phase 3)

- Toute opération mobile passe par : photo caméra (jamais la galerie) → `creerPreuve()` (compression
  1280 px / JPEG 70 %, sha256 sur le téléphone, ligne `evidence_files`, file d'envoi persistée dans
  `apps/mobile/src/lib/preuves.ts`) → insertion de l'opération → `confirm_evidence_upload` quand le
  fichier est arrivé. Les RPC de validation (`open_shift`, passation, livraison) exigent la preuve
  confirmée.
- Le volume d'un jaugeage, le stock théorique, les litres vendus et les écarts sont calculés par le
  serveur ; le mobile n'affiche que ce que la base renvoie (`tank_readings.volume_cl/expected_cl`).
- Barémage : ne jamais modifier `tank_calibrations` ; publier une version avec
  `create_calibration_version`. Mêmes règles dans `packages/core/src/baremage.ts`.
- Statut d'un shift : uniquement via `open_shift`, `close_shift_fuel`, `sign_handover_incoming` /
  `report_handover_discrepancy` (trigger `SHIFT_RPC_ONLY`). Un shift naît en `opening`.
- Passation : le sortant signe (`sign_handover_outgoing`) puis sa session se ferme (`handover`) ;
  l'entrant relève à l'aveugle (RLS) puis `sign_handover_incoming`. Écart → `report_handover_discrepancy`.
- Livraison : `start_delivery` (gérant) → `advance_delivery` (`before_gauged`, `unloading_done`,
  `after_gauged`) → `sign_delivery` ; pistolets de la cuve en pause pendant `unloading`.

## Où est quoi

- `packages/core/src` : `carburant.ts` (index, stock théorique, barémage, écart cuve), `caisse.ts`
  (attendu / encaissé / écart), `passation.ts`, `alertes.ts` (seuils par défaut : cuve ±0,5 %,
  livraison ±0,3 %, passation 0, paiements électroniques 0), `format.ts`, `unites.ts`.
- `packages/ui/src/tokens.ts` : tokens de la maquette ; `tailwind-preset.ts` : `stationsurePreset('web' | 'native')`.
- `apps/web/src/lib/navigation.ts` : les 12 entrées de la barre latérale et leur phase.
- `apps/mobile/src/app/index.tsx` : écran 01 Connexion PIN (statique).

## Phases

| Phase | Contenu                                                                                                                                                                       | État                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 0     | Fondations : monorepo, apps vides stylées, `packages/core` testé                                                                                                              | **faite**                             |
| 1     | Schéma Supabase : tables métier (hors garage / Car Wash), RLS, garde-fous, tests pgTAP, seed de démo, types générés                                                           | **faite**                             |
| 2     | Auth propriétaire, onboarding, jumelage des tablettes, PIN et sessions employé — écran 01                                                                                     | **faite** (mode kiosque : plus tard)  |
| 3     | Cycle carburant : configuration web (écran 13), relevés photo (02), jaugeage (11), passation à l'aveugle (03), livraison (12), rapprochement cuve                             | **faite** (offline complet : phase 6) |
| 4     | Caisse : paiements (Wave/OM/carte/crédit), rapprochement mobile money, crédit client, annulations, billetage à l'aveugle, clôture, décisions, versements — écrans 04, 14 à 17 | **faite**                             |
| 5     | Dashboard propriétaire, alertes, paramètres (écran 18), rapport WhatsApp / SMS via outbox + worker (mode test) — écrans 05, 06, 18                                            | **faite** (envoi réel : à activer)    |
| 6     | Offline-first (PowerSync ou WatermelonDB), prix verrouillés, livraisons et barémage en production _(proposition, ordre à valider)_                                            | à venir                               |
| 7     | Boutique : POS, codes-barres, comptage surprise à l'aveugle — écran 07                                                                                                        | à venir                               |
| 8     | Garage (ordres de travail) et Car Wash (tickets) — écrans 08 et 09                                                                                                            | à venir                               |
| 9     | Stock unifié et ratios de contrôle — écran 10                                                                                                                                 | à venir                               |

Ne commencer une phase que sur demande explicite.
