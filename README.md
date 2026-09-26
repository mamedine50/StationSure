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

Ports locaux : API `54721`, Postgres `54722`, Studio `54723`, Inbucket (mails) `54724`.

```bash
pnpm db:start       # démarre Postgres, Auth, Storage… dans Docker (= supabase start)
supabase status     # affiche l'URL de l'API et la clé publishable à copier dans les .env
pnpm db:reset       # rejoue les migrations puis supabase/seed.sql
pnpm db:lint        # supabase db lint
pnpm db:test        # assemble et lance les tests pgTAP (supabase/tests)
pnpm db:types       # régénère packages/database/src/types.generated.ts
pnpm db:stop
```

Le schéma, la matrice RLS et les garde-fous sont décrits dans [docs/schema.md](docs/schema.md).

### Données de démo (local uniquement)

`supabase/seed.sql` ne doit **jamais** être poussé en ligne. Comptes de développement :

| Compte             | E-mail                      | Mot de passe             |
| ------------------ | --------------------------- | ------------------------ |
| Propriétaire (web) | `owner@demo.local`          | `Demo-StationSure-2026!` |
| Appareil Mbour     | `device-mbour@demo.local`   | `Demo-Appareil-2026!`    |
| Appareil Thiès     | `device-thies@demo.local`   | `Demo-Appareil-2026!`    |
| Appareil Kaolack   | `device-kaolack@demo.local` | `Demo-Appareil-2026!`    |

Organisation « Démo StationSûre » (plan groupe), stations Mbour, Thiès, Kaolack, 2 cuves + barémage,
3 pompes et 6 pistolets par station. Les prix de la seed sont fictifs. Les appareils de la seed ont
un compte auth mais pas de jumelage : pour une vraie tablette, générez un code depuis le web.

PIN de démo (non triviaux, **local uniquement**) :

| Station | Employé       | Rôle       | PIN  |
| ------- | ------------- | ---------- | ---- |
| Mbour   | Awa Diop      | Pompiste   | 4062 |
| Mbour   | Moussa Ndiaye | Pompiste   | 7391 |
| Mbour   | Ibrahima Sarr | Gérant     | 8175 |
| Mbour   | Khady Fall    | Boutique   | 3946 |
| Mbour   | Lamine Gueye  | Mécanicien | 6203 |
| Mbour   | Pape Seck     | Laveur     | 5817 |
| Thiès   | Fatou Faye    | Gérante    | 9034 |
| Kaolack | Cheikh Mbaye  | Gérant     | 1748 |
| Kaolack | P. Sow        | Laveur     | 2794 |

### Parcours complet en local (phase 2)

1. `pnpm db:start`, puis dans deux terminaux : `pnpm db:functions:serve` (Edge Function
   `pair-device`) et `pnpm --filter @stationsure/web dev`.
2. Web : http://localhost:3000/inscription → créer un compte → ouvrir Mailpit
   (http://127.0.0.1:54724) → cliquer le lien de confirmation → onboarding (organisation, formule,
   première station) → Employés : créer un employé et définir son PIN → Stations › Gérer les
   appareils › Jumeler une tablette : un code à 6 chiffres et un QR s'affichent (10 min).
   Ou connectez-vous directement avec `owner@demo.local`.
3. Mobile : `cp apps/mobile/.env.example apps/mobile/.env`, remplacer `127.0.0.1` par l'IP du Mac
   sur le Wi-Fi (`ipconfig getifaddr en0`) et coller la clé publishable de `supabase status`.
   **Sans ce fichier l'app affiche « Configuration manquante »** (`supabaseUrl is required` dans les
   anciennes versions). Les variables `EXPO_PUBLIC_*` sont figées dans le bundle au démarrage de
   Metro : après toute modification du `.env`, relancer avec `npx expo start --clear`. Puis
   `npx expo run:android --device` (ou Expo Go pour un premier essai : `npx expo start`, scanner le QR). Saisir le code (ou scanner le QR) → écran PIN avec les
   employés de la station → PIN → accueil → « Changer d'employé ».
4. Révocation : web › Appareils › Révoquer : la tablette revient à l'écran de jumelage.

### Cycle carburant (phase 3)

Web : Carburant et cuves (owner) → cuves, barémage (import CSV `hauteur_mm;volume_l`, certificat
PDF, courbe), pompes / pistolets, prix. Mobile (PIN d'un employé de la station) : « Ouvrir le shift »
→ photo + index de chaque pistolet → jaugeage de chaque cuve (volume calculé par le serveur) → shift
ouvert → « Passation » (le sortant relève et signe, l'entrant se connecte, relève à l'aveugle, signe)
→ « Fermer le shift » (relevés + jaugeages de clôture) ; « Réception de livraison » réservée au
gérant (jauge avant, dépotage avec pistolets en pause, jauge après, photo du bon, signature avec
réserve si l'écart dépasse 0,3 %). Toutes les photos viennent de la caméra et partent en file
d'attente ; une opération reste « en attente d'envoi » tant que sa photo n'est pas confirmée.

### Tests

- `pnpm test` : Vitest (`packages/core`, validation des formulaires web).
- `pnpm db:test` : pgTAP (RLS, garde-fous, jumelage, PIN, sessions).
- `pnpm db:functions:test` : tests Deno de l'Edge Function `pair-device`.

### Envoyer le schéma en ligne (à faire manuellement, jamais par un agent)

```bash
supabase link --project-ref <ref-du-projet>
supabase db push          # n'envoie QUE supabase/migrations/, jamais seed.sql
```

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
│   ├── database/         types générés Supabase (pnpm db:types)
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
