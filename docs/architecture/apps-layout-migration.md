# The `apps/` Layout Migration

## Why this exists

This branch (`feat/dgfy-backend-refactor`) restructured the repo from three top-level
trees — `backend/`, `frontend/`, `android/` — into deployable units under `apps/`. If you
cloned this branch, or an AI agent is reading it for the first time, the old paths **do not
exist here**. This doc is the map: what moved where, why, and how running and deploying the
project differs from the pre-refactor shape.

If you only need one fact: **`backend/`, `frontend/`, and `android/` are gone. Everything
lives under `apps/`.** The rest of this doc is detail.

> **Second fact, added later: `apps/dgfy-web/` is gone too.** The single frontend package this
> migration created was split again into three independent apps plus a shared package
> (ADR 0071). If you are here because a search hit mentions `apps/dgfy-web`, skip to
> [The frontend split](#the-frontend-split-adr-0065) — that
> section supersedes every `apps/dgfy-web` mention above it in this document. The earlier
> sections are preserved because they are the record of the first migration, not a description
> of today's tree.

## The complete path map

| Before | Now |
| --- | --- |
| `backend/src`, `backend/config`, `backend/device-bridge`, `backend/tests` | `apps/dgfy-api/…` |
| `backend/migrations`, `backend/seeders`, `backend/.sequelizerc`, `backend/database-setup.sql` | `apps/dgfy-migration-runner/…` |
| `frontend/**` | `apps/dgfy-web/**` (since split again — see [The frontend split](#the-frontend-split-adr-0065)) |
| `android/imin-wrapper/**` | `apps/dgfy-android-bridge/imin-wrapper/**` |
| `packages/**` | unchanged — was never under `backend/`/`frontend/` |

Each relocation happened on its own date, in this order: `backend/` was split first
(2026-07-20, see ADR 0032), then `android/` (2026-08-05), then `frontend/` (2026-08-06, ADR
0059 — see "ADR history" below).

## Why the split, not a plain rename

- **`apps/dgfy-api` vs `apps/dgfy-migration-runner`**: the migration/seed domain was
  extracted out of the API service on purpose, so the API's Docker image and runtime
  carry no migration CLI, no `sequelize-cli`, no raw SQL bootstrap file. Deploys run
  migrations from a separate, narrowly-scoped package. `apps/dgfy-api/package.json`
  therefore does **not** have the migration/seed scripts `backend/package.json` used to
  have — that's deliberate, not a gap.
- **`apps/dgfy-android-bridge` and `apps/dgfy-web`**: pure relocations, not splits. Every
  file, the Kotlin package name, the internal `apps/{skupervisor,pos,store}` shape inside
  `dgfy-web` — all unchanged one directory deeper. A few paths that pointed *outside* the
  tree needed a one-level depth adjustment: the three Vite `outDir:
  '../../../../dist-apps/<app>'` build targets, and the `file:../../packages/*` dependency
  paths in `package.json`/`package-lock.json`. *(The nested `apps/{skupervisor,pos,store}`
  shape and the `dist-apps/` output convention described here were both dissolved later by
  ADR 0071 — see [The frontend
  split](#the-frontend-split-adr-0065).)*
- **`packages/`**: never moved. `packages/shared-constants` and `packages/pos-receipt` sit
  at the same path they always have, consumed identically by `apps/dgfy-api` and the frontend
  apps. ADR 0071 later added a third package at the same level, `packages/web-core`, holding
  the shared frontend trunk.

## Running locally, before vs after

The root `package.json` scripts are already fully repointed — use them rather than `cd`-ing
manually:

| Before | Now |
| --- | --- |
| `cd backend && npm install && cd frontend && npm install` | `npm run install:all` (installs root + `apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`, `apps/dgfy-api`, `apps/dgfy-migration-runner`; `packages/web-core` has nothing to install) |
| `cd backend && npm run dev` | `npm run dev:backend` (or `cd apps/dgfy-api && npm run dev`) |
| `cd frontend && npm run dev` | `npm run dev:skupervisor` / `npm run dev:pos` / `npm run dev:store` (or `cd apps/dgfy-ims`\|`apps/dgfy-pos`\|`apps/dgfy-storefront` and `npm run dev`). `npm run dev:frontend` still exists and is an alias for `dev:skupervisor`. |
| `backend/.env` | `apps/dgfy-api/.env` (see `apps/dgfy-api/.env.example`) |
| n/a — frontend had no separate env file | one per frontend app: `apps/dgfy-ims/.env`, `apps/dgfy-pos/.env`, `apps/dgfy-storefront/.env` |
| `cd backend && npx sequelize-cli db:migrate` | `cd apps/dgfy-migration-runner && npm run migrate` (wraps `sequelize-cli db:migrate`; config/models/seeders/migrations paths all resolve inside that package via its own `.sequelizerc`) |
| `cd backend && npx sequelize-cli db:seed:all` | `cd apps/dgfy-migration-runner && npm run seed` |
| `npm run dev` (whole stack) | still `npm run dev`, now fanning out to `apps/dgfy-api` (API + device bridge) + `apps/dgfy-ims`. Use `npm run dev:local-pos-stack` to bring up all three frontends. |

Bringing up the full local POS stack (API, device-bridge, and all three frontend apps):

```sh
npm run install:all
npm run dev:local-pos-stack
```

## Deploying, before vs after

- **`ecosystem.config.cjs`** (PM2 process definitions) — each app's `cwd` points at its
  `apps/` package (`./apps/dgfy-api`, `./apps/dgfy-ims`, `./apps/dgfy-pos`,
  `./apps/dgfy-storefront`), not `./backend`/`./frontend`.
- **`scripts/deploy.sh`** — its changed-file detectors grep the release manifest by prefix:
  `BACKEND_CHANGED_FILES` on `^apps/dgfy-api/`, `FRONTEND_CHANGED_FILES` on
  `^(apps/dgfy-ims/|apps/dgfy-pos/|apps/dgfy-storefront/|packages/web-core/)`, and
  `MIGRATIONS_CHANGED` on `apps/dgfy-migration-runner/migrations/` — not the old
  `backend/`/`frontend/` prefixes. Note that `packages/web-core/` counts as a frontend
  change for all three apps, because all three consume it.
- **Docker images** — `infrastructure/docker/dgfy-api/`,
  `infrastructure/docker/dgfy-migration-runner/`, `infrastructure/docker/dgfy-ims/`,
  `infrastructure/docker/dgfy-pos/`, and `infrastructure/docker/dgfy-storefront/`. The single
  `infrastructure/docker/frontend/` image that ADR 0059 kept under its pre-refactor name was
  retired by ADR 0071 and replaced by the three per-app images above.
- **CI path filters** (`.github/workflows/shared-changed-paths.yml`) — there is no single
  `FRONTEND` output anymore. Three independent outputs (`frontend_ims`, `frontend_pos`,
  `frontend_storefront`) each match their own app directory, their own
  `infrastructure/docker/dgfy-<app>/` directory, and the shared packages they depend on
  (`packages/web-core/` and `packages/shared-constants/` for all three;
  `packages/pos-receipt/` for `dgfy-ims` and `dgfy-pos` only). The backend/migration-runner
  filters still key off `apps/dgfy-api/` and `apps/dgfy-migration-runner/`.

## The frontend split (ADR 0071)

Everything above describes the *first* migration (`frontend/` → `apps/dgfy-web/`, ADR 0059).
A second migration then split that single Vite package into three independent apps and one
shared package — see
[ADR 0071](adr/0071-frontend-split-into-three-apps.md). **`apps/dgfy-web/` no longer exists on
disk.** Where this section and any earlier section of this document disagree, this section wins.

### Path map

| Before (`apps/dgfy-web/…`) | Now |
| --- | --- |
| `apps/skupervisor/**` | `apps/dgfy-ims/**` |
| `apps/pos/**` | `apps/dgfy-pos/**` |
| `apps/pos/desktop/pos-electron/**` | `apps/dgfy-pos/desktop/pos-electron/**` |
| `apps/store/**` | `apps/dgfy-storefront/**` |
| `src/**` (the shared trunk) | `packages/web-core/src/**` |
| `Components/**` | `packages/web-core/Components/**` |
| `Pages/DgfyAuthPage.jsx`, `Pages/DgfyCompanySelect.jsx`, `Pages/RegisterCompany.jsx`, `Pages/CompanyRegistrationStatus.jsx` | `packages/web-core/Pages/**` |
| the rest of `Pages/**` | `apps/dgfy-ims/Pages/**` |
| `sentryViteConfig.js` | `packages/web-core/vite/sentryViteConfig.js` |
| `dist-apps/skupervisor`, `dist-apps/pos`, `dist-apps/store` | `apps/dgfy-ims/dist`, `apps/dgfy-pos/dist`, `apps/dgfy-storefront/dist` |
| `infrastructure/docker/frontend/Dockerfile` (one image, three surfaces) | `infrastructure/docker/dgfy-ims/Dockerfile`, `.../dgfy-pos/Dockerfile`, `.../dgfy-storefront/Dockerfile` |
| image `ghcr.io/sieitzz/dgfy-platform/frontend` | `…/dgfy-ims`, `…/dgfy-pos`, `…/dgfy-storefront` |

Container ports are unchanged: **8081** = IMS, **8082** = POS, **8083** = Storefront. Only the
number of containers changed — one nginx serving three roots became three single-purpose images.

### Why a split, not another rename

The three surfaces had independent release cadences but one lockfile, one `node_modules`, one
build graph, and one image. A POS-only change rebuilt and redeployed the Storefront. The split
gives each surface its own `package.json`, its own `package-lock.json`, its own Vite config and
dev port, its own Dockerfile and image, and its own CI path filter.

`packages/web-core` (`@sieitzz/web-core`) holds what genuinely is shared — the API client,
stores, hooks, shared components, the DGFY-auth pages, and the shared Vite helpers. It is
deliberately **not** a buildable package: no build step, no `node_modules`, no lockfile of its
own. Each app consumes it as `"@sieitzz/web-core": "file:../../packages/web-core"` and resolves
its subpaths through Vite aliases, so the source is compiled by whichever app imports it. That
also means `packages/web-core` has no test runner of its own — its Vitest specs are included by
`apps/dgfy-ims`'s config and run from that workspace.

### Commands, before vs after

| Before | Now |
| --- | --- |
| `npm --prefix apps/dgfy-web run dev:skupervisor` | `npm run dev:skupervisor` (port 5173) |
| `npm --prefix apps/dgfy-web run dev:pos` | `npm run dev:pos` (port 5174) |
| `npm --prefix apps/dgfy-web run dev:store` | `npm run dev:store` (port 5175) |
| `npm --prefix apps/dgfy-web run build:all` | **no equivalent** — run `npm run build:skupervisor`, `npm run build:pos`, `npm run build:store` separately, and only for the apps actually affected |
| `npm --prefix apps/dgfy-web test -- <spec>` | `npm --prefix apps/dgfy-ims test -- <spec>` for IMS and shared-trunk specs; `npm --prefix apps/dgfy-pos test` / `npm --prefix apps/dgfy-storefront test` for app-owned specs |
| `npm --prefix apps/dgfy-web run lint` | one lint per app (`apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`) |

### Where the old paths still legitimately appear

`scripts/frontend-split-path-map.json` is the machine-readable record of this move and
intentionally keeps every pre-split path. Same "leave alone" rule as the section below: ADRs,
archives, compliance impact declarations, and dated narratives keep their original paths.

## A note for AI agents

`backend/`, `frontend/`, and `android/` **do not exist on this branch**. If a search hit,
a doc, or your own training data points at one of those paths, the real file is under
`apps/` — use the path map above. Grepping the repo for `backend/` or `frontend/` will
still find real, deliberate hits: **historical** and **dated** records intentionally keep
the old paths because they describe what was true at the time they were written, not
current layout. That includes:

- `docs/archive/**`, `System_Audit/`
- Compliance impact declarations (`docs/compliance/impact-declarations/**`)
- ADRs themselves (dated decision records)
- Dated feature narratives and proposals, release/merge-adoption records

Do not "fix" old paths in those files — that would falsify the historical record. If
you're unsure whether a file you're editing is historical or live, check whether it's in
this doc's or `backend-absorption.md`'s "leave alone" lists, or ask.

`develop` (the upstream integration branch this branch periodically merges from) **still
has and commits to `backend/`/`frontend/`/`android/`** — the relocation only happened on
this branch. See `backend-absorption.md` for how those upstream changes get replayed into
the `apps/` layout without being lost.

## For developers with a branch based on pre-merge `develop`

This branch has now merged into `develop`. If you have an in-flight branch cut from `develop`
*before* that merge, its commits still touch `backend/`, `frontend/`, and/or `android/` — paths
that no longer exist. Rebasing or merging `develop` into that branch will not, by itself, corrupt
anything, but you should know what to expect rather than be surprised by it.

The mechanics here are the mirror image of what `backend-absorption.md` documents (that doc
replayed `develop`'s `backend/`-rooted commits *into* this branch; you're now replaying your
`backend/`-rooted commits *onto* the already-relocated `apps/` layout). Based on that doc's
changelog of 10+ real merge cycles exercising this exact rename shape:

- **Commits that modify a file that already existed** auto-merge cleanly. Git's content-based
  rename detection follows the move without prompting — this covers the large majority of any
  normal feature branch's diff (measured on this branch's own merge: 3106 of 3210 changed paths
  detected as pure `R100` renames).
- **New files your branch added inside a directory that already existed** (e.g. another file
  dropped into what was `backend/src/modules/pos/`) usually surface as a low-friction "confirm
  destination" prompt, correctly resolved to the new `apps/` path.
- **New files inside a brand-new subdirectory your branch introduced** (one that didn't exist
  before your branch created it) are the one real gap: git's directory-rename detection has no
  signal for these. They raise **no conflict and no advisory** and will silently reappear at their
  old, now-dead `backend/`/`frontend/`/`android/` path instead of moving to `apps/`. You have to
  find and `git mv` these yourself — check the path map above for where they belong.

Before finishing your merge/rebase: confirm `backend/`, `frontend/`, and `android/` are absent (or
empty) from your working tree, then run `npm run check:architecture` and `npm run lint:docs`. See
[`backend-absorption.md`](./backend-absorption.md) for the fuller, dated write-up of this failure
mode if you hit it.

## Related documents

- [`backend-absorption.md`](./backend-absorption.md) — the step-by-step procedure for
  replaying `develop`'s ongoing `backend/`/`frontend/`/`android/` commits into this
  branch's `apps/` layout, including known failure modes (git's directory-rename detection
  silently missing brand-new subdirectories) and the full absorption history.
- ADR history for the relocations themselves:
  [0032](adr/0032-standalone-dgfy-api-service.md) (backend →
  `apps/dgfy-api`/`apps/dgfy-migration-runner`), the android move (undocumented as a
  standalone ADR — see `backend-absorption.md`'s android path map), and
  [0059](adr/0059-frontend-relocation-to-apps-dgfy-web.md) (frontend →
  `apps/dgfy-web`), and [0071](adr/0071-frontend-split-into-three-apps.md)
  (`apps/dgfy-web` → `apps/dgfy-ims` + `apps/dgfy-pos` + `apps/dgfy-storefront` +
  `packages/web-core`). ADR 0059 was originally numbered 0054, then 0055, and was renumbered
  twice more since — each time `develop` independently added its own ADR at this branch's
  provisional number. It is not stubbed under its earlier numbers because it was never
  published under them.
- `scripts/frontend-split-path-map.json` — the machine-readable old-path → new-path record for
  the ADR 0071 split.
