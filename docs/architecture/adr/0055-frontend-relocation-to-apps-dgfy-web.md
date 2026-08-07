---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-06
last_reviewed: 2026-08-06
review_by: 2027-02-06
applies_to: repository_layout
topic: frontend_relocation_to_apps_dgfy_web
supersedes_in_part: docs/architecture/adr/0032-standalone-dgfy-api-service.md
---

# ADR 0055: Frontend Relocation to `apps/dgfy-web`

## Status

Accepted (2026-08-06)

## Context

ADR 0032's "Future Direction" named the intended end state for every deployable surface: `backend/`
becomes `apps/ims-backend`, and `frontend/apps/{skupervisor,pos,store}` becomes three separate
top-level entries — `apps/dgfy-pos`, `apps/dgfy-storefront`, `apps/dgfy-skupervisor` — alongside
`apps/dgfy-api`. That end state assumed each vite app would eventually be its own independently
deployable unit, the way `apps/dgfy-api` is.

Since then, this branch (`feat/dgfy-backend-refactor`) shipped `backend/` → `apps/dgfy-api` +
`apps/dgfy-migration-runner`, and separately `android/imin-wrapper` → `apps/dgfy-android-bridge/imin-wrapper`
— both pure relocations, no internal restructuring. `frontend/` was the last deployable surface still
sitting at the repo root, and the same relocation was worth doing for it: nothing buildable would be
left outside `apps/`, and `apps/` would become an honest index of what this platform ships.

But `frontend/` does not decompose into ADR 0032's three-way split for free. It is one npm project —
one `package.json`, one lockfile, one `node_modules`, a 555-file shared trunk (`src/`, `Components/`,
`Pages/`) underneath three vite app shells (`apps/skupervisor` full, `apps/pos` and `apps/store` are
thin shells that import from the shared trunk) — built by one Dockerfile
(`infrastructure/docker/frontend/Dockerfile`) into one GHCR image
(`ghcr.io/sieitzz/dgfy-platform/frontend`), served by one nginx container on three ports
(8081/8082/8083). Splitting it into three `apps/*` entries as ADR 0032 envisioned means splitting the
package, the shared trunk, the Dockerfile, the compose service, the image, and the CI path filter —
a decomposition project, not a relocation. Two untracked, empty directories
(`apps/dgfy-pos/.env.local`, `apps/dgfy-storefront/.env.local`) on disk are leftover evidence of an
earlier attempt at exactly that decomposition; they hold no files and are not referenced anywhere in
the repo.

## Decision

`frontend/` relocates as a **single unit** to `apps/dgfy-web/` — the same shape as the
`backend/`→`apps/dgfy-api` and `android/`→`apps/dgfy-android-bridge` moves: a `git mv` of the whole
tree, its internal structure completely unchanged, only the handful of paths that pointed *outside*
the tree (three vite `outDir`s, a handful of `file:` package deps, several test helpers) adjusted for
the extra directory level. `[binding]`

This ADR supersedes ADR 0032's "Future Direction" **in part**: the frontend's landing spot is
`apps/dgfy-web`, not three separate `apps/dgfy-pos` / `apps/dgfy-storefront` / `apps/dgfy-skupervisor`
entries. `[binding]`

The three-way split ADR 0032 envisioned remains a legitimate future direction, but it is now framed
as a **decomposition of `apps/dgfy-web`**, not a relocation — its own future ADR, evaluated on its own
merits (whether splitting the shared trunk is worth the duplication or workspace-package overhead it
would require), not assumed as the default outcome of moving the directory. `[default]`

Everything else ADR 0032 established is unaffected: `apps/dgfy-api` remains standalone, and new
deployable surfaces still default to `apps/<name>`.

## Consequences

- `apps/dgfy-web` keeps its Docker/compose/nginx/GHCR identity as `frontend` (image name, compose
  service name, nginx upstream, `infrastructure/docker/frontend/` directory, the CI output variable
  `frontend` in `shared-changed-paths.yml`) — only the source path and the CI path-filter regex that
  finds it changed. Nothing deploy-visible was renamed in this move, unlike the `backend/`→`apps/dgfy-api`
  cutover, which did rename the runtime identity end to end. Renaming the runtime identity, if ever
  wanted, is a separate decision from where the source lives.
- `docs/architecture/backend-absorption.md` gains a "The frontend path map" section: `develop` still
  has `frontend/` and commits to it daily, so develop→branch syncs now replay `frontend/**` →
  `apps/dgfy-web/**` the same way `backend/**` → `apps/dgfy-api/**` already works, with the same known
  git ort directory-rename-detection caveats.
- The two untracked `apps/dgfy-pos/` and `apps/dgfy-storefront/` directories from the earlier
  decomposition attempt are unaffected by this ADR; whether to delete them is a separate, smaller
  cleanup.

## Future Direction

A three-way (or N-way) split of `apps/dgfy-web` into independently deployable surfaces remains
possible and may still be the right end state for some slice of the shared trunk — but it is a
decomposition project that has to justify its own cost (duplicating shared code, or extracting it into
a workspace package, versus the coupling it removes), not something assumed to follow automatically
from this relocation. A future ADR proposing it should cite this one for the "why not do it now"
reasoning rather than re-deriving it.

## Validation

- `npm --prefix apps/dgfy-web install && npm --prefix apps/dgfy-web run lint && npm --prefix apps/dgfy-web test`
- `npm --prefix apps/dgfy-web run build:all` (repo-root `dist-apps/{pos,skupervisor,store}` populated,
  not `apps/dist-apps/`)
- `docker build -f infrastructure/docker/frontend/Dockerfile -t dgfy-web-verify .`
- `npm run lint:docs`, `npm run check:compat-seams`, `npm run test:compat-seams`, `npm run test:merge-adoption`
- CI path-filter simulation: a change under `apps/dgfy-web/**` must still set `FRONTEND=true` in
  `shared-changed-paths.yml`
