# dgfy-storefront

The customer-facing storefront frontend, formerly `apps/dgfy-web/apps/store`, split out by issue
[#322](https://github.com/Sieitzz/dgfy-platform/issues/322)/ADR
[0071](../../docs/architecture/adr/0071-frontend-split-into-three-apps.md). Was already the most
self-contained of the three surfaces before the split (534 of the former `apps/dgfy-web/apps/store`
files were app-owned, vs. thin shells for the other two), so this app carries the most of its own
code and pulls comparatively less from the shared trunk.

## Contents

Its own `src/` — the storefront routes, checkout flow, tracking, and delivery-map integration —
plus what it imports from `packages/web-core` (mainly the shared `@/components` UI primitives and
auth/session services).

## Commands

Run from this directory, or via the equivalent root script (`npm run <name>` from the repo root):

| Here | From repo root | What |
|---|---|---|
| `npm run dev` | `npm run dev:store` | Dev server, port **5175** |
| `npm run build` | `npm run build:store` | Production build → `dist/` |
| `npm run preview` | — | Preview the production build |
| `npm test` | `npm --prefix apps/dgfy-storefront test` | Vitest — this app's own specs only; **not** run by any root script |
| `npm run lint` | — | ESLint over `src` |
| `npm run test:e2e` | — | Playwright |
| `npm run test:e2e:fast` | — | Single-spec fast smoke (mode-route regression) |
| `npm run test:e2e:fnb-contract` | — | F&B contract suite, own Playwright config |
| `npm run test:security` | — | Auth/input/headers security specs |

## Environment

Copy `.env.example` → `.env.local` (gitignored). See
`docs/architecture/apps-layout-migration.md` and `docs/setup/COLLABORATOR_LOCAL_ENV.md` for what
each variable does. This app's env surface is scoped to only the `VITE_*` vars its own code and
what it pulls from `packages/web-core` actually read (ADR 0071 clause 3) — do not copy
`apps/dgfy-ims/.env.example` wholesale.

## Deploy

Own image `ghcr.io/sieitzz/dgfy-storefront`, own Dockerfile
(`infrastructure/docker/dgfy-storefront/Dockerfile`), own CI path filter
(`frontend_storefront` in `.github/workflows/shared-changed-paths.yml`). Container port **8083**.

## What this app deliberately does not have

No copy of the shared trunk — the `@/components` UI primitives, auth/session services, and the
DGFY-auth pages it links out to all live in `packages/web-core`, consumed via a smaller set of
retargeted `@/...` Vite aliases than the other two apps use (see `packages/web-core/README.md`).
