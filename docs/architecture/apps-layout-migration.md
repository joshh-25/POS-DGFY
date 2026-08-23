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
> [The frontend split](#the-frontend-split-adr-0071) — that
> section supersedes every `apps/dgfy-web` mention above it in this document. The earlier
> sections are preserved because they are the record of the first migration, not a description
> of today's tree.

## The complete path map

| Before | Now |
| --- | --- |
| `backend/src`, `backend/config`, `backend/device-bridge`, `backend/tests` | `apps/dgfy-api/…` |
| `backend/migrations`, `backend/seeders`, `backend/.sequelizerc`, `backend/database-setup.sql` | `apps/dgfy-migration-runner/…` |
| `frontend/**` | `apps/dgfy-web/**` (since split again — see [The frontend split](#the-frontend-split-adr-0071)) |
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
  split](#the-frontend-split-adr-0071).)*
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
| image `ghcr.io/sieitzz/dgfy-platform/frontend` | `ghcr.io/sieitzz/dgfy-ims`, `ghcr.io/sieitzz/dgfy-pos`, `ghcr.io/sieitzz/dgfy-storefront` |

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

`backend/`, `frontend/`, `android/`, and `apps/dgfy-web/` **do not exist on this branch**.
If a search hit, a doc, or your own training data points at one of those paths, the real
file is under `apps/dgfy-{api,ims,pos,storefront}`, `apps/dgfy-android-bridge`, or
`packages/web-core` — use the path maps above (the first table for the `backend/`/
`frontend/`/`android/` move, [the frontend-split table](#the-frontend-split-adr-0071) for
the `apps/dgfy-web/` move). Grepping the repo for `backend/`, `frontend/`, or
`apps/dgfy-web/` will still find real, deliberate hits: **historical** and **dated**
records intentionally keep the old paths because they describe what was true at the time
they were written, not current layout. That includes:

- `docs/archive/**`, `System_Audit/`
- Compliance impact declarations (`docs/compliance/impact-declarations/**`)
- ADRs themselves (dated decision records)
- Dated feature narratives and proposals, release/merge-adoption records

Do not "fix" old paths in those files — that would falsify the historical record. If
you're unsure whether a file you're editing is historical or live, check whether it's in
this doc's or `backend-absorption.md`'s "leave alone" lists, or ask.

An automatic guard exists so a stray old-path file doesn't silently reach `develop`:
`.husky/pre-commit` blocks staging anything under `apps/dgfy-web/`, `frontend/`, or
`backend/`, and `pr-quality-checks.yml`'s `repository-quality` job runs the same check
(`npm run report:frontend-split-sync:post-merge`) in CI. If either fires on a file you
believe genuinely belongs at that path (a historical doc, an ADR), that's a false
positive worth flagging — the guard only inspects real source trees, not `docs/`.

`develop` (the upstream integration branch this branch periodically merges from) **now has
the `apps/` layout with `apps/dgfy-web/` already split**, since this branch merged into it
— see the note below if you're working from an in-flight branch cut before that merge.

## For developers with an in-flight branch

Two different relocations have happened on `develop`, on two different dates. Which section
below applies to you depends on when your branch was cut, not on which paths its commits touch
today — check both if you're unsure.

### From pre-merge `develop` (`backend/`/`frontend/`/`android/`)

If your branch was cut from `develop` *before* PR #55 merged (2026-08-10), its commits still
touch `backend/`, `frontend/`, and/or `android/` — paths that no longer exist. Rebasing or
merging `develop` into that branch will not, by itself, corrupt anything, but you should know
what to expect rather than be surprised by it.

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

### From pre-split `develop` (`apps/dgfy-web/`)

If your branch was cut from `develop` *before* PR #513 merged (issue #322), its commits touch
`apps/dgfy-web/` — a path that no longer exists. This is a **different, harder** case than the
one above, and the reassuring rename statistic from that section does not transfer here — say so
explicitly rather than implying the same ease.

**Why it's harder:** the `backend/`/`frontend/`/`android/` move was a pure 1:1 relocation — one
source tree, one destination. This split fans **one** tree (`apps/dgfy-web/`) out to **four**
destinations (`apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`, `packages/web-core`), so a
file's new home depends on *which part* of the old tree it was in, not just that it moved.
`backend-absorption.md` states this plainly: *"This is the first replay surface that is not a
pure relocation... git's rename detection will not carry you."*

Measured on this branch's own merge into `develop` (1766 changed paths): **1622 detected as
renames, 1464 of those exact `R100` matches, only 155 inexact.** That is still a strong majority
— most of your diff will carry over with no help needed — but the one-in-eight that doesn't land
as a clean `R100` is exactly where a file can end up somewhere non-obvious, and the **silent
reappearance** failure mode below has now been logged **five separate times** in
`backend-absorption.md`'s changelog (2026-08-05, 08-07, 08-10, 08-16, 08-23) — it is not a rare
edge case, it is the routine one.

**The silent reappearance failure mode, same shape as the section above:** a file inside a
brand-new subdirectory your branch introduced (one `apps/dgfy-web/apps/store/...` didn't have
before) raises **no conflict and no advisory** and reappears at the dead `apps/dgfy-web/` path
instead of moving. You have to find these yourself.

**Import rules — the part that's new to this split, and recorded nowhere else:**

- `@/components`, `@/hooks`, `@/lib`, `@/services`, `@/src` imports need **no change**. The alias
  *keys* are unchanged; only their targets were retargeted, from `apps/dgfy-web/src/...` to
  `packages/web-core/src/...`.
- `@/Pages` and a bare `@/` **do** change meaning — they now resolve to whichever app's own root
  you're in, and there are three different roots (`apps/dgfy-ims`, `apps/dgfy-pos`,
  `apps/dgfy-storefront`), not one.
- A deep relative import like `../../../src/features/pos/pages/TerminalPage.jsx` becomes
  `../../../packages/web-core/src/features/pos/pages/TerminalPage.jsx` — same depth, with
  `packages/web-core/` inserted before `src/`. **Only a build catches a wrong one** — this is not
  hypothetical: two absorbed files in the 2026-08-16 cycle carried a stale relative path one level
  short, and `npm run build:store` was what caught it, not the merge itself.

**Recipe:**

```sh
git fetch origin && git merge origin/develop
# Preview what's incoming and where it maps, before resolving anything:
node scripts/report-frontend-split-sync.js --base <your-merge-base> --head HEAD
# After merging, relocate whatever got stranded to its mapped destination:
node scripts/report-frontend-split-sync.js --post-merge --fix
# Confirm nothing old-shaped survived (also enforced by .husky/pre-commit and CI):
git ls-files -- apps/dgfy-web/ frontend/ backend/          # must be empty
npm run install:all                                        # 1 lockfile -> 3 per-app + root
npm run build:skupervisor                                  # and/or build:pos / build:store
```

`--fix` (added for issue #914) `git mv`s every file it can map via
`scripts/frontend-split-path-map.json` and prints anything it can't for manual placement — it
refuses to run on a dirty working tree, and refuses to guess a destination it isn't sure of. See
[`frontend-split-sync.md`](frontend-split-sync.md) for the full flag list
(`--project-root`, `--manifest`, `--base`, `--head` all work from your own clone against your own
branch, not just from this one).

**Reassurance, so this doesn't read as all downside:** every root `package.json` script *name* you
already know still exists and is repointed — `dev:skupervisor`, `dev:pos`, `dev:store`,
`build:skupervisor`, `install:all`, `test:frontend` are all unchanged. Dev server ports
(5173/5174/5175) and container ports (8081/8082/8083) are unchanged. The real differences are: a
per-app `.env` instead of one shared file, per-app `node_modules` instead of one, and re-running
`install:all` because the lockfile fan-out (1 → 3 per-app + root) means your existing
`node_modules` is now stale.

**Traps worth knowing before you hit them:**

- `npm run build` and `build:frontend` now build **IMS only** — the old `apps/dgfy-web`
  `build:all` has no root equivalent. Build each app you actually touched; a `packages/web-core`
  change is a three-app change.
- `npm test`/`test:frontend` now cover **IMS + `packages/web-core` only** — run
  `npm --prefix apps/dgfy-pos test` and `npm --prefix apps/dgfy-storefront test` explicitly for
  those apps. There is no root `lint` — lint is per-app.
- Adding an npm dependency used from `packages/web-core` source requires adding it to **all three**
  app `package.json` files *and* to `WEB_CORE_RUNTIME_DEPS` in
  `packages/web-core/vite/webCoreRuntimeDeps.js` — web-core has no `node_modules` of its own by
  design (see `packages/web-core/README.md`), so its bare imports resolve through the consuming
  app's `node_modules` via that alias list. Skipping either half fails the build with
  `Rollup failed to resolve import`.
- A private, uncommitted `do-not-commit/local-test/docker-compose.yml` copy pointing at
  `infrastructure/docker/frontend/Dockerfile` needs repointing at the three per-app Dockerfiles —
  that image and Dockerfile no longer exist.

Before finishing: confirm `apps/dgfy-web/`, `frontend/`, and `backend/` are all absent (or empty)
from your working tree (`git ls-files -- apps/dgfy-web/ frontend/ backend/`), then run
`npm run check:architecture` and `npm run lint:docs`. See
[`backend-absorption.md`](./backend-absorption.md) for the fuller changelog of every real cycle
this branch itself absorbed, if you want more worked examples than fit here.

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
