# StationSûre

Plateforme de gestion de stations-service pour le Sénégal. D'abord un outil anti-fraude pour un
propriétaire absent (carburant, caisse, boutique, garage, Car Wash), ensuite un ERP complet.

Principe global : **pas de preuve, pas de clôture**. Tout est attribué à une personne, un appareil et
une heure.

Références : [docs/architecture-v2.pdf](docs/architecture-v2.pdf) et [docs/maquette/README.md](docs/maquette/README.md).

## Prérequis

| Outil                | Version                                   | Remarque                                                |
| -------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Node.js              | ≥ 22 (24 recommandé, voir `.nvmrc`)       |                                                         |
| pnpm                 | 11 (`corepack enable` ou `npm i -g pnpm`) | version épinglée dans `package.json`                    |
| Docker Desktop       | récent                                    | uniquement pour `supabase start`                        |
| Supabase CLI         | ≥ 2.x                                     | `brew install supabase/tap/supabase`                    |
| Android Studio + SDK | API 35+                                   | pour le build Android local                             |
| JDK                  | 17                                        | fourni par Android Studio (`ANDROID_HOME`, `JAVA_HOME`) |

## Installation

```bash
git clone https://github.com/mamedine50/StationSure.git stationsure
cd stationsure
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
cp supabase/.env.example supabase/.env
```

Aucun secret n'est versionné : les fichiers `.env*` sont ignorés par git, seuls les `.env.example` sont
suivis.

## Scripts racine

| Commande         | Effet                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`       | lance en parallèle le web (Next.js) et le mobile (Expo / Metro) via Turborepo |
| `pnpm build`     | build de production du web                                                    |
| `pnpm lint`      | ESLint sur tous les packages et apps                                          |
| `pnpm typecheck` | `tsc --noEmit` partout (TypeScript strict)                                    |
| `pnpm test`      | tests Vitest de `packages/core`                                               |
| `pnpm format`    | Prettier sur tout le repo                                                     |

## Lancer le web (propriétaire)

```bash
pnpm --filter @stationsure/web dev
# http://localhost:3000
```

## Lancer le mobile (station) sur un téléphone Android

Pas d'EAS : build local uniquement.

1. Activer le mode développeur et le débogage USB sur le téléphone, le brancher, vérifier `adb devices`.
2. Générer les projets natifs puis compiler et installer sur l'appareil :

```bash
cd apps/mobile
npx expo prebuild --platform android   # génère apps/mobile/android (ignoré par git)
npx expo run:android --device          # compile, installe et lance Metro
```

3. Ensuite, pour le développement quotidien, `pnpm --filter @stationsure/mobile dev` (ou `pnpm dev`
   à la racine) suffit : l'app de développement installée se reconnecte à Metro.

iOS si besoin : `npx expo prebuild --platform ios` puis `npx expo run:ios --device` (Xcode requis).

Refaire `npx expo prebuild` après toute modification de `app.json` ou ajout d'un module natif.

## Supabase local

```bash
supabase start      # démarre Postgres, Auth, Storage… dans Docker
supabase status     # affiche l'URL de l'API et la clé anon à copier dans les .env
supabase stop
```

Aucune migration métier en phase 0 (`supabase/migrations/` est vide). Les types TypeScript seront
générés en phase 1 avec `pnpm --filter @stationsure/database gen:types`.

## Structure du repo

```
stationsure/
├── apps/
│   ├── web/              Next.js (App Router) + Tailwind — espace propriétaire
│   └── mobile/           Expo + expo-router + NativeWind — application station (Android d'abord)
├── packages/
│   ├── core/             règles métier pures, 0 dépendance, testées (Vitest)
│   ├── ui/               design tokens (dark mode) + preset Tailwind partagé web / NativeWind
│   ├── i18n/             libellés FR (défaut) + EN, i18next
│   ├── database/         types générés Supabase (placeholder en phase 0)
│   └── config/           tsconfig, eslint, prettier partagés
├── supabase/             config.toml, migrations/ (vide), functions/ (vide)
└── docs/                 architecture v2 et maquette validée (ne pas modifier)
```

## Conventions

- **Unités entières** dans `packages/core` : montants en FCFA entiers, volumes en centilitres
  entiers (`litresToCl` / `clToLitres`). Jamais de flottant dans un calcul métier.
- **i18n obligatoire** : aucun libellé en dur dans les apps, tout passe par `@stationsure/i18n`.
- **Nom du produit** : la constante `APP_NAME` de `@stationsure/core` est la seule source (hors
  `app.json` d'Expo, qui est un manifeste statique).
- **Dark mode uniquement**, tokens dans `@stationsure/ui`, polices Sora / IBM Plex Sans / IBM Plex Mono.
- **Format sénégalais** : espace comme séparateur de milliers, virgule décimale (`formatFCFA`,
  `formatLitres`).
- Boutons tactiles ≥ 48 px sur mobile.
