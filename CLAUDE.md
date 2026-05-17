# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

React 19 + TypeScript + Vite 7 SPA, deployed to Netlify (primary, see `netlify.toml`) and Firebase Hosting (`firebase.json`). Backend is **client-side Firebase only** — Firestore (named database `gameparty`), Realtime Database, Storage, Auth — plus two Netlify Functions in `netlify/functions/` for Telegram notifications. There is no Node server in this repo; the `D backend/...` paths in `git status` are deleted artifacts of a previous backend.

## Commands

```bash
npm run dev              # default heng36 theme, port 5173
npm run dev:<theme>      # heng | max | jeed | kamo | kiki | mab | abm | ai (each on its own port 5173–5180)
npm run dev:all          # spawns all themes in parallel via run-dev-all.ps1

npm run type-check       # tsc --noEmit (no `npm test` exists — this is the type gate)
npm run lint             # eslint flat config (eslint.config.js)
npm run build            # default build; build:<theme> for theme-specific bundles
npm run preview          # vite preview after build
```

The build outputs to `dist/`. The custom `copy-netlify-files` Vite plugin in `vite.config.ts` copies `public/_redirects`, `public/_headers`, and `public/404.html` into `dist/` on `writeBundle` — don't replicate this manually.

## Multi-theme architecture (read first)

The single most important thing about this codebase: **one Firebase project (`gameparty-8911c`) serves eight white-labelled "brands"** (themes): `heng36`, `max56`, `jeed24`, `kamo99`, `kiki49`, `mab96`, `abm96`, `aigaming88`. Data isolation is by path, not by project.

- **Firestore** paths follow `themes/{theme}/{collection}/{docId}`. Always build paths via `getThemePath()` / `getThemeCollectionPath()` / `getThemeDocumentPath()` in `src/services/firebase-theme.ts` — never hardcode `themes/heng36/...`.
- **Realtime Database** paths follow `{theme}/{path}` via `getThemeRTDBPath()`.
- **Storage** uses `themes/{theme}/{folder}/{fileName}`; image URLs are then rewritten to a per-theme CDN domain (`cdn.<theme>.party`) by `src/services/image-upload.ts` using `VITE_CDN_DOMAIN_<THEME>` env vars (set in `netlify.toml` build env and in `.env.<theme>` files locally).
- **Firestore rules** (`firebase/firestore.rules`) are currently fully public (`allow read, write: if true`). Security is by obscurity of player links (`/?id=<userId>`), not by rules. Don't assume rule-based authorization when reasoning about data access.

### Theme resolution

Theme is resolved with this precedence (see `src/utils/theme-resolver.ts` and the `useState` initializer in `src/contexts/ThemeContext.tsx`):

1. `?theme=...` query param (only `getCurrentTheme()`, not `ThemeContext`)
2. Vite `import.meta.env.MODE` (set by `--mode <theme>` scripts)
3. `window.location.hostname` substring match (`hostname.includes('jeed24')` → `jeed24`, etc.)
4. Default `heng36`

Both `theme-resolver.ts` and `ThemeContext.tsx` contain their own copies of this hostname/mode ladder — keep them in sync when adding a new theme. Adding a theme also requires: a `ThemeConfig` entry in `src/config/themes.ts`, a `dev:<theme>` + `build:<theme>` pair in `package.json`, an `.env.<theme>` file, the CDN/bucket vars in `netlify.toml`, and a `dns-prefetch` link in `index.html`.

### Theme assets / no-flash hydration

`index.html` contains an **inline script that runs before React mounts**: it reads `localStorage['themeAssetsCache:<theme>']` (written by `src/utils/theme-assets-cache.ts` when `ThemeContext` last loaded settings from Firestore) and immediately sets CSS variables (`--theme-asset-background-image`, `--theme-asset-logo`, etc.) plus injects `<link rel="preload">` tags. This avoids a visible flash of fallback assets on refresh while Firestore is still responding. If you change the cache key format or the CSS variable names, **both** that inline script and `ThemeContext` must be updated.

`migrateOldUrl()` in `ThemeContext.tsx` rewrites legacy URLs (`img.<theme>.party` → `cdn.<theme>.party`; `game-images/<theme>/...` → `game-images/themes/<theme>/...`). Old Firestore documents still have legacy URLs, so don't remove this migration.

## App structure

- Entry: `src/main.tsx` → `BrowserRouter` → `src/App.tsx` (defines routes, wraps in `ThemeProvider`).
- Routes (in `App.tsx`):
  - `/?id=<userId>` is the **public player gate**; redirects to `/play/:id`. `/play/:id`, `/games/play/:id`, `/games/:id/play`, `/host/:id` all render `GamePlay`.
  - `/admin/answers/:gameId` is public (no auth) by design.
  - `/login`, `/theme-test`, `/test-checkin-security` are public.
  - Everything else (`/home`, `/games`, `/games/:id`, `/creategame`, `/upload-users-extra`, `/image-settings`) is wrapped in `<RequireAuth><AdminLayout/></RequireAuth>` — auth state is read live via `onAuthStateChange` from `firebase-auth`.
- `src/pages/games/GamePlay.tsx` is the dispatcher that picks one of the 13 game components in `src/components/*Game.tsx` based on `GameData.type` (defined in `src/types/game.ts`). When adding a new game type: add the union literal in `game.ts`, the data shape on `GameData`, a component in `src/components/`, and a case in `GamePlay.tsx`.

## Services layer (`src/services/`)

Each domain has its own `firebase-<domain>-new.ts` module (`games-new`, `users-new`, `answers-new`, `bingo-new`, `checkins-new`, `rewards-new`, `chat-new`, `coins-new`, plus `announce-users`, `referral`, `blacklist`, `theme-settings`, `global-settings`). All of them:

1. Import `db` from `./firebase-theme`.
2. Call `getCurrentTheme()` at module load and build paths via the `getThemePath()` helpers.
3. Layer on `dataCache`/`cacheKeys` (from `cache.ts`) and `request-deduplication.ts` for read-heavy queries.

When adding a query, **check `FIREBASE_INDEXES_GUIDE.md` and `firebase/firestore.indexes.json` first** — most multi-field queries already have composite indexes defined; if you add a new shape, add the index in the same PR.

## Notable gotchas

- **Console error suppression**: `src/main.tsx` and `index.html` both patch `console.error` and `unhandledrejection` to swallow Firebase SDK `INTERNAL ASSERTION FAILED` / `FIRESTORE INTERNAL` noise and (in production only) `permission-denied`. When debugging, run in dev mode — `import.meta.env.DEV` skips the production-only filters in `main.tsx`.
- **Chunk size**: `vite.config.ts` raises `chunkSizeWarningLimit` to 2200 and silences specific Rollup warnings (dynamic-vs-static import, "will not move module"). The main chunk is ~2 MB minified and this is expected.
- **Player-name cache**: `GamePlay.tsx` caches the entered player name in `localStorage` under `player_name` with a 24-hour TTL — clearing this is sometimes needed when debugging player-side flows.
- **No backend in this repo**: the `D backend/...` entries in `git status` are an old Node backend that was removed; current architecture is browser → Firebase directly. The only server-side code is `netlify/functions/send-telegram-*.cjs`.

## Local env files

`.env.<theme>` files (gitignored) set `VITE_CDN_DOMAIN_<THEME>` and `VITE_STORAGE_BUCKET_<THEME>`. Without them, `image-upload.ts` falls back to raw Firebase Storage URLs (working but slower). For Netlify, the same vars are duplicated in `netlify.toml` under `[build.environment]`.
