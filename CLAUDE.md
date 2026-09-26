# StationSûre — guide pour les agents

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
`pnpm db:start` · `pnpm db:reset` (migrations + seed) · `pnpm db:lint` · `pnpm db:test` (pgTAP) ·
`pnpm db:types` (régénère `packages/database/src/types.generated.ts`) · `pnpm db:stop` ·
`pnpm db:functions:test` (tests Deno de l'Edge Function) · `pnpm db:functions:serve`.
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

| Phase | Contenu                                                                                                                                           | État                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 0     | Fondations : monorepo, apps vides stylées, `packages/core` testé                                                                                  | **faite**                             |
| 1     | Schéma Supabase : tables métier (hors garage / Car Wash), RLS, garde-fous, tests pgTAP, seed de démo, types générés                               | **faite**                             |
| 2     | Auth propriétaire, onboarding, jumelage des tablettes, PIN et sessions employé — écran 01                                                         | **faite** (mode kiosque : plus tard)  |
| 3     | Cycle carburant : configuration web (écran 13), relevés photo (02), jaugeage (11), passation à l'aveugle (03), livraison (12), rapprochement cuve | **faite** (offline complet : phase 6) |
| 4     | Clôture de caisse : attendu vs encaissé (espèces, carte, Wave, OM, crédit), justification, versements — écran 04                                  | à venir                               |
| 5     | Dashboard propriétaire et rapport WhatsApp / SMS — écrans 05 et 06                                                                                | à venir                               |
| 6     | Offline-first (PowerSync ou WatermelonDB), prix verrouillés, livraisons et barémage en production _(proposition, ordre à valider)_                | à venir                               |
| 7     | Boutique : POS, codes-barres, comptage surprise à l'aveugle — écran 07                                                                            | à venir                               |
| 8     | Garage (ordres de travail) et Car Wash (tickets) — écrans 08 et 09                                                                                | à venir                               |
| 9     | Stock unifié et ratios de contrôle — écran 10                                                                                                     | à venir                               |

Ne commencer une phase que sur demande explicite.
