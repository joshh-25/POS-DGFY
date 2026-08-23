# dgfy-ims

The IMS (SKUpervisor) frontend — the primary back-office admin app, formerly
`apps/dgfy-web/apps/skupervisor`, split out by issue
[#322](https://github.com/Sieitzz/dgfy-platform/issues/322)/ADR
[0071](../../docs/architecture/adr/0071-frontend-split-into-three-apps.md).

## Contents

Own entry point, Layout, and routing (`src/main.jsx`, `Layout.jsx`, `utils.js`, `Pages/`) plus
everything imported from the shared trunk, `packages/web-core` — most of what renders on screen
lives there, not here. This is also the one app whose Vitest config reaches into
`packages/web-core/**` (see the note below), and the only app with a `.env.shared.example` /
`.env.vps.example` in addition to the standard local example, since it's the primary dev target.

## Commands

Run from this directory, or via the equivalent root script (`npm run <name>` from the repo root):

| Here | From repo root | What |
|---|---|---|
| `npm run dev` | `npm run dev:skupervisor` | Dev server, port **5173** |
| `npm run build` | `npm run build:skupervisor` | Production build → `dist/` |
| `npm run preview` | — | Preview the production build |
| `npm test` | `npm --prefix apps/dgfy-ims test` | Vitest — **also runs `packages/web-core`'s specs**, since web-core has no test runner of its own (its `include` glob is added to this app's Vitest config) |
| `npm run lint` | — | ESLint over `src Pages Layout.jsx utils.js` |
| `npm run test:e2e` | — | Playwright |
| `npm run test:security` | — | Auth/input/headers security specs |

`npm run dev` / `npm test` / `npm run build` at the repo root all target this app by default
(it's the primary dev target) — see `docs/architecture/apps-layout-migration.md` for the full
root-script table.

## Environment

Copy `.env.example` → `.env` (this app, uniquely, uses a committed `.env` name rather than
`.env.local` — see `.env.shared.example`/`.env.vps.example` for the other environment profiles).
See `docs/architecture/apps-layout-migration.md` and `docs/setup/COLLABORATOR_LOCAL_ENV.md` for
what each variable does.

## Deploy

Own image `ghcr.io/sieitzz/dgfy-platform/dgfy-ims`, own Dockerfile
(`infrastructure/docker/dgfy-ims/Dockerfile`), own CI path filter
(`frontend_ims` in `.github/workflows/shared-changed-paths.yml`). Container port **8081**.

## What this app deliberately does not have

No copy of the shared trunk — `Components/`, most of `src/`, and the shared `Pages/*` auth
routes all live in `packages/web-core` and are consumed via the `@/...` Vite aliases retargeted
at it (see `packages/web-core/README.md`), plus some deep relative imports. This app does not
duplicate that code locally.
