# dgfy-pos

The standalone POS terminal frontend, formerly `apps/dgfy-web/apps/pos`, split out by issue
[#322](https://github.com/Sieitzz/dgfy-platform/issues/322)/ADR
[0071](../../docs/architecture/adr/0071-frontend-split-into-three-apps.md). Also carries the
Electron desktop shell (`desktop/pos-electron/`) that wraps this same web app for hardware POS
terminals.

## Contents

Own entry point (`src/main.jsx`) plus the Electron packaging config. The actual terminal UI
(`TerminalPage`, `POSCheckoutTerminal`, and the rest of `features/pos/`) is shared code that
lives in `packages/web-core` and is mounted here the same way `apps/dgfy-ims` mounts it.

## Commands

Run from this directory, or via the equivalent root script (`npm run <name>` from the repo root):

| Here | From repo root | What |
|---|---|---|
| `npm run dev` | `npm run dev:pos` | Dev server, port **5174** |
| `npm run build` | `npm run build:pos` | Production build → `dist/` |
| `npm run build:desktop` | — | Build + Electron package (`desktop:pos` runs the unpacked Electron shell) |
| `npm run preview` | — | Preview the production build |
| `npm test` | `npm --prefix apps/dgfy-pos test` | Vitest — this app's own specs only; **not** run by any root script (`npm test` at the repo root covers `apps/dgfy-ims` + `packages/web-core` only) |
| `npm run lint` | — | ESLint over `src` |
| `npm run test:e2e` | — | Playwright |
| `npm run test:security` | — | Auth/input/headers security specs |

## Environment

Copy `.env.example` → `.env.local` (gitignored). See
`docs/architecture/apps-layout-migration.md` and `docs/setup/COLLABORATOR_LOCAL_ENV.md` for what
each variable does. This app's env surface is scoped to only the `VITE_*` vars its own code and
what it pulls from `packages/web-core` actually read (ADR 0071 clause 3) — do not copy
`apps/dgfy-ims/.env.example` wholesale.

## Deploy

Own image `ghcr.io/sieitzz/dgfy-platform/dgfy-pos`, own Dockerfile
(`infrastructure/docker/dgfy-pos/Dockerfile`), own CI path filter
(`frontend_pos` in `.github/workflows/shared-changed-paths.yml`). Container port **8082**.

## What this app deliberately does not have

No copy of the shared trunk — the POS terminal feature and everything else it depends on from
the former `apps/dgfy-web/src`/`Components` live in `packages/web-core`, consumed via retargeted
`@/...` Vite aliases plus deep relative imports (see `packages/web-core/README.md`).
