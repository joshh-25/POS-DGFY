# dgfy-opis

The dedicated DGFY Back Office (OPIS) frontend at `opis.dgfy.ph` (`opis.dev.dgfy.ph`,
`opis.stage.dgfy.ph`), split from the POS-embedded Back Office by issue
[#2052](https://github.com/Sieitzz/dgfy-platform/issues/2052) (epic
[#1354](https://github.com/Sieitzz/dgfy-platform/issues/1354)).

## Contents

Own entry point (`src/main.jsx`) and app-owned account actions. The shared Business Admin
shell, service, styles, manifest, settings models, and receipt UI live in
`packages/web-core/src/features/businessAdmin/` and are consumed by both OPIS and POS.
OPIS's canonical routes are root-level (`/`, `/sales`, `/settings/profile`, etc.);
`/backoffice/*` and `/business-admin/*` redirect to the equivalent root route. Shared auth
pages/services come from `packages/web-core`; the API stays
under `/api/v1/business-admin` with its existing server-side tenant, branch, and permission
checks.

## Commands

Run from this directory, or via the equivalent root script (`npm run <name>` from the repo root):

| Here | From repo root | What |
|---|---|---|
| `npm run dev` | `npm run dev:opis` | Dev server, port **5176** |
| `npm run build` | `npm run build:opis` | Production build → `dist/` |
| `npm run preview` | — | Preview the production build |
| `npm test` | `npm --prefix apps/dgfy-opis test` | Vitest — this app's own specs only |
| `npm run lint` | — | ESLint over `src` |

## Environment

Copy `.env.example` → `.env.local` (gitignored). Local origin defaults to
`http://localhost:5176`. `VITE_OPIS_URL` is used by IMS and other OPIS handoffs; POS
administration stays on the POS origin. This app's env surface is scoped to only the
`VITE_*` vars its own code and what it pulls from `packages/web-core` actually read — do not
copy another app's `.env.example` wholesale.

## Deploy

Own image `ghcr.io/sieitzz/dgfy-opis`, own Dockerfile
(`infrastructure/docker/dgfy-opis/Dockerfile`), own CI path filter
(`frontend_opis` in `.github/workflows/shared-changed-paths.yml`). Container port **8084**.

## What this app deliberately does not have

No copy of the shared trunk — everything it depends on from the former `apps/dgfy-web/src`/
`Components` lives in `packages/web-core`, consumed via retargeted `@/...` Vite aliases plus
deep relative imports (see `packages/web-core/README.md`). No POS terminal, pairing, shift, or
checkout code — those stay in `apps/dgfy-pos`. The shared Business Admin shell presents the
inventoried workflows in both apps; new back-office-level feature work still defaults to OPIS.
