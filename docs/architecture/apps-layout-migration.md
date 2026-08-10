# The `apps/` Layout Migration

## Why this exists

This branch (`feat/dgfy-backend-refactor`) restructured the repo from three top-level
trees — `backend/`, `frontend/`, `android/` — into deployable units under `apps/`. If you
cloned this branch, or an AI agent is reading it for the first time, the old paths **do not
exist here**. This doc is the map: what moved where, why, and how running and deploying the
project differs from the pre-refactor shape.

If you only need one fact: **`backend/`, `frontend/`, and `android/` are gone. Everything
lives under `apps/`.** The rest of this doc is detail.

## The complete path map

| Before | Now |
| --- | --- |
| `backend/src`, `backend/config`, `backend/device-bridge`, `backend/tests` | `apps/dgfy-api/…` |
| `backend/migrations`, `backend/seeders`, `backend/.sequelizerc`, `backend/database-setup.sql` | `apps/dgfy-migration-runner/…` |
| `frontend/**` | `apps/dgfy-web/**` |
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
  paths in `package.json`/`package-lock.json`.
- **`packages/`**: never moved. `packages/shared-constants` and `packages/pos-receipt` sit
  at the same path they always have, consumed identically by `apps/dgfy-api` and
  `apps/dgfy-web`.

## Running locally, before vs after

The root `package.json` scripts are already fully repointed — use them rather than `cd`-ing
manually:

| Before | Now |
| --- | --- |
| `cd backend && npm install && cd frontend && npm install` | `npm run install:all` (installs root + all four `apps/` packages) |
| `cd backend && npm run dev` | `npm run dev:backend` (or `cd apps/dgfy-api && npm run dev`) |
| `cd frontend && npm run dev` | `npm run dev:frontend` (or `cd apps/dgfy-web && npm run dev`) |
| `backend/.env` | `apps/dgfy-api/.env` (see `apps/dgfy-api/.env.example`) |
| n/a — frontend had no separate env file | `apps/dgfy-web/.env` (see `apps/dgfy-web/.env.example`) |
| `cd backend && npx sequelize-cli db:migrate` | `cd apps/dgfy-migration-runner && npm run migrate` (wraps `sequelize-cli db:migrate`; config/models/seeders/migrations paths all resolve inside that package via its own `.sequelizerc`) |
| `cd backend && npx sequelize-cli db:seed:all` | `cd apps/dgfy-migration-runner && npm run seed` |
| `npm run dev` (whole stack) | unchanged — still `npm run dev`, now internally fanning out to `apps/dgfy-api` + `apps/dgfy-web` |

Bringing up the full local POS stack (API, device-bridge, and all three frontend apps):

```sh
npm run install:all
npm run dev:local-pos-stack
```

## Deploying, before vs after

- **`ecosystem.config.cjs`** (PM2 process definitions) — each app's `cwd` points at its
  `apps/` package (`./apps/dgfy-api`, `./apps/dgfy-web`), not `./backend`/`./frontend`.
- **`scripts/deploy.sh`** — its changed-file detectors (`BACKEND_CHANGED_FILES`,
  `FRONTEND_CHANGED_FILES`, `MIGRATIONS_CHANGED`) grep the release manifest for
  `apps/dgfy-api/`, `apps/dgfy-web/`, and `apps/dgfy-migration-runner/migrations/`
  respectively — not the old `backend/`/`frontend/` prefixes.
- **Docker images** — `infrastructure/docker/dgfy-api/`, `infrastructure/docker/
  dgfy-migration-runner/`, and `infrastructure/docker/frontend/` (the frontend image
  deliberately kept its directory name — see ADR 0059 — while the compose service and
  nginx upstream also kept their pre-refactor names).
- **CI path filters** (`.github/workflows/shared-changed-paths.yml`) — the regex that sets
  `FRONTEND=true` matches `^apps/dgfy-web/`, `^packages/pos-receipt/`,
  `^packages/shared-constants/`, `^infrastructure/docker/frontend/`, and a handful of
  named workflow files — not `^frontend/`. The equivalent backend/migration-runner filters
  key off `apps/dgfy-api/` and `apps/dgfy-migration-runner/`.

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
  `apps/dgfy-web`). ADR 0059 was originally numbered 0054, then 0055, and was renumbered
  twice more since — each time `develop` independently added its own ADR at this branch's
  provisional number. It is not stubbed under its earlier numbers because it was never
  published under them.
