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

`pnpm install` · `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` ·
`supabase start` (Docker requis).

## Où est quoi

- `packages/core/src` : `carburant.ts` (index, stock théorique, barémage, écart cuve), `caisse.ts`
  (attendu / encaissé / écart), `passation.ts`, `alertes.ts` (seuils par défaut : cuve ±0,5 %,
  livraison ±0,3 %, passation 0, paiements électroniques 0), `format.ts`, `unites.ts`.
- `packages/ui/src/tokens.ts` : tokens de la maquette ; `tailwind-preset.ts` : `stationsurePreset('web' | 'native')`.
- `apps/web/src/lib/navigation.ts` : les 12 entrées de la barre latérale et leur phase.
- `apps/mobile/src/app/index.tsx` : écran 01 Connexion PIN (statique).

## Phases

| Phase | Contenu                                                                                                                                         | État      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0     | Fondations : monorepo, apps vides stylées, `packages/core` testé                                                                                | **faite** |
| 1     | Schéma Supabase : tables métier de l'architecture v2 (§8), RLS par `organization_id` / `station_id`, journal d'audit append-only, types générés | à venir   |
| 2     | Auth propriétaire (Supabase Auth), PIN personnel par employé, appareils enregistrés, mode kiosque — écran 01                                    | à venir   |
| 3     | Relevé d'index avec photo + GPS, passation contradictoire — écrans 02 et 03                                                                     | à venir   |
| 4     | Clôture de caisse : attendu vs encaissé (espèces, carte, Wave, OM, crédit), justification, versements — écran 04                                | à venir   |
| 5     | Dashboard propriétaire et rapport WhatsApp / SMS — écrans 05 et 06                                                                              | à venir   |
| 6     | Offline-first (PowerSync ou WatermelonDB), prix verrouillés, livraisons et barémage en production _(proposition, ordre à valider)_              | à venir   |
| 7     | Boutique : POS, codes-barres, comptage surprise à l'aveugle — écran 07                                                                          | à venir   |
| 8     | Garage (ordres de travail) et Car Wash (tickets) — écrans 08 et 09                                                                              | à venir   |
| 9     | Stock unifié et ratios de contrôle — écran 10                                                                                                   | à venir   |

Ne commencer une phase que sur demande explicite.
