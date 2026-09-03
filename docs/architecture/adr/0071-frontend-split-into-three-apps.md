---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-15
last_reviewed: 2026-09-03
review_by: 2027-02-15
applies_to: repository_layout
topic: frontend_split_into_three_apps
supersedes_in_part: docs/architecture/adr/0059-frontend-relocation-to-apps-dgfy-web.md
---

# ADR 0071: Frontend Split into Three Apps

## Status

Accepted (2026-08-15)

## Context

ADR 0059 relocated `frontend/` to `apps/dgfy-web/` as a single unit, deliberately deferring the
three-way decomposition ADR 0032 had originally envisioned. Its own "Future Direction" section
named the terms under which that deferred split should happen: "a decomposition project that has
to justify its own cost (duplicating shared code, or extracting it into a workspace package,
versus the coupling it removes), not something assumed to follow automatically from this
relocation. A future ADR proposing it should cite this one for the 'why not do it now' reasoning
rather than re-deriving it." This ADR is that future ADR.

`apps/dgfy-web` was one Vite project — one `package.json`, one lockfile, one `node_modules` — with
three deployable surfaces (`apps/skupervisor` full app, `apps/pos` and `apps/store` thin shells)
sitting on top of a ~1,400-file shared trunk (`src/` 415 files, `Components/` 132, `Pages/` 36,
plus `apps/store`'s own near-self-contained 611 files). All three surfaces shared one Docker image
(`ghcr.io/sieitzz/dgfy-platform/frontend`, one nginx container answering on three ports), one CI
changed-paths boolean, and one release cadence: a change to any one surface forced a rebuild and
redeploy of all three. `apps/skupervisor` and `apps/pos` both mount the 210-file
`src/features/pos` (including the 4,892-line `TerminalPage`), so the shared trunk could not simply
be duplicated per app without either forking that logic or accepting permanent drift between the
IMS-embedded POS view and the standalone POS terminal.

Issue Sieitzz/dgfy-platform#322 requested independently deployable frontend surfaces: a
storefront-only change should not force a POS terminal rebuild, and vice versa. That is the
coupling ADR 0059 deferred judging, now judged: the duplication/workspace-package cost is paid
once (a shared package plus three thin per-app configs), and it buys independent build, test, and
deploy cadences for surfaces that in practice change on unrelated schedules (storefront ships
customer-facing commerce features; POS ships terminal/hardware fixes; IMS ships back-office
admin work).

## Decision

1. The shared trunk (`src/`, `Components/`, `Pages/`'s four DGFY-auth pages, and
   `sentryViteConfig.js`) extracts into `packages/web-core` (`@sieitzz/web-core`) — a private,
   build-step-free, plain-ESM package with no `node_modules` and no lockfile of its own, resolved
   via each consuming app's `file:../../packages/web-core` dependency and a `@sieitzz/web-core/*`
   Vite alias. This is the **only** shared frontend trunk; no app may fork a copy of trunk logic
   instead of depending on the package. `[binding]`
2. The three surfaces become three independently deployable, independently buildable, independently
   testable top-level apps: `apps/dgfy-ims` (formerly `apps/skupervisor`), `apps/dgfy-pos`
   (formerly `apps/pos`, including its Electron shell), `apps/dgfy-storefront` (formerly
   `apps/store`). Each has its own `package.json`, lockfile, Vite config, and test config; none
   depends on another app's source, only on `packages/web-core` and the other shared `packages/*`.
   `[binding]`
3. Each app builds into its own container image — `ghcr.io/sieitzz/dgfy-platform/dgfy-{ims,pos,
   storefront}` — with its own Dockerfile under `infrastructure/docker/dgfy-{ims,pos,storefront}/`,
   scoped to only the `VITE_*`/`SENTRY_*` build args that app's own code actually reads. The single
   `frontend` image, its Dockerfile, and its compose service are retired. `[binding]`
4. `packages/web-core` never gets its own `node_modules` or its own test runner — the single-React
   guarantee ADR 0059's shared-trunk era already relied on stays intact by construction, not by
   convention. Its test suite runs from `apps/dgfy-ims` (the one app whose `test:` include glob
   reaches `packages/web-core/**/*.test.*`), so a duplicate React copy in web-core's own
   `node_modules` cannot silently appear. `[binding]`
5. This supersedes ADR 0059's "Future Direction" and its `[default]`-tagged framing of the eventual
   split ("its own future ADR, evaluated on its own merits") — that evaluation is this document.
   ADR 0059's `[binding]` clause (the single-unit relocation `frontend/` → `apps/dgfy-web/`) is
   historically accurate and unchanged; only the future-direction framing built on top of it is
   superseded. `apps/dgfy-web` itself no longer exists on disk as of this ADR.

Dependencies were duplicated verbatim from the former `apps/dgfy-web/package.json` into all three
apps' `package.json` files rather than pruned per app; pruning unused per-app dependencies is
explicit follow-up work, not required by this decision. `[default]`

Some code in `packages/web-core` today is IMS-only in practice (only reachable from
`apps/dgfy-ims`) but was moved into the shared package wholesale during extraction rather than
left app-local, since the extraction was done by directory (whole `src/`/`Components/`/`Pages/`
moves) to preserve `git mv` rename-detection across the split. Graduating IMS-only code back out of
`web-core` into `apps/dgfy-ims` directly is future cleanup, not required now. `[default]`

## Consequences

- **Independent deploys, independent CI.** `.github/workflows/shared-changed-paths.yml` now emits
  `frontend_ims`/`frontend_pos`/`frontend_storefront` outputs instead of one `frontend` boolean;
  `deploy-frontend.yml` is one reusable workflow taking an `app` input rather than three separate
  files; `deployment-orchestrator.yml` and `deploy-main.yml` run per-app jobs. A storefront-only PR
  no longer triggers an IMS or POS rebuild.
- **Three lockfiles to keep in sync**, not one. Dependency version drift across
  `apps/dgfy-{ims,pos,storefront}/package-lock.json` is now possible in a way it wasn't when there
  was a single lockfile; `security/audit-allowlist.json` duplicates its `react-router`-family
  suppressions per app tree rather than once.
- **`deploy-main.yml`'s frontend chain grew from 2 jobs to 6**, fully serialized
  (`frontend-ims-beta` → `frontend-ims-prod` → `frontend-pos-beta` → ... ), to preserve the GHCR
  registry-pressure mitigation #427 introduced for the single-image case — three independent
  2-job chains would reintroduce the same secondary-rate-limit failure mode #427 fixed.
- **Server-side compose fragments are hand-maintained**, not generated. Cutting a running
  deployment over from the single `frontend` service to three `dgfy-{ims,pos,storefront}` services
  requires a manual runbook sequence (documented in the issue #322 rollout PR): push the three new
  images, update `infrastructure/docker/env/{prod,dev,stage}.compose-fragment.yml`, bring up the
  new services, repoint nginx upstreams, then retire the old `frontend` service. GHCR org package
  permissions for the three new image repos must be granted before the first deploy, or the
  first-push auto-created packages default to visibility/pull permissions that will 403 in
  production.
- **`docs/architecture/backend-absorption.md`'s frontend path map is now two moves deep**
  (`frontend/` → `apps/dgfy-web/` per ADR 0059, then `apps/dgfy-web/**` → the three apps plus
  `packages/web-core` per this ADR) — a `develop`→branch sync during the transition period had to
  replay both.

## Amendments

### 2026-08-23 — `deploy-main.yml`'s frontend chain shrinks from 6 jobs to 3 (beta retired)

- Clause amended: **Consequences item 3** (untagged, `default` tier per ADR 0039) — *"`deploy-
  main.yml`'s frontend chain grew from 2 jobs to 6, fully serialized (`frontend-ims-beta` ->
  `frontend-ims-prod` -> `frontend-pos-beta` -> ... )"*.
- Change: beta.dgfy.ph was retired upstream on `develop` (#329, PRs #909/#910/#911/#912; nginx now
  terminates the beta domain group in three bare `return 301` redirects into the equivalent prod
  host, no upstream). Absorbing that into this branch (issue #322 cycle-3 develop-absorb,
  2026-08-23) removes the three `*-beta` jobs this ADR originally described, leaving
  `frontend-ims-prod` -> `frontend-pos-prod` -> `frontend-storefront-prod` — **3 jobs, not 6**.
- What's unchanged: the chain is **still fully serialized**, for the same reason item 3 originally
  gave — three large pushes to the same GHCR org around the same time is still the secondary-rate-
  limit pressure #427 fixed (run 31728787346); dropping serialization now that only 3 jobs remain
  was considered and rejected during this absorb cycle. The core decision this ADR governs (one
  image per app, `deploy-main.yml`/`deployment-orchestrator.yml` running per-app jobs) is untouched
  — only the beta half of the build matrix and the resulting job count changed.
- PR: #513 (issue #322).

### 2026-08-23 — the cutover runbook now has a home

- Clause amended: **Consequences item 4** (untagged, `default` tier per ADR 0039) — the sentence
  reading *"requires a manual runbook sequence (documented in the issue #322 rollout PR)."*
- Change: that runbook is now a committed file,
  `docs/deployment/2026-08-23-frontend-split-cutover-runbook.md`, rather than living solely in the
  PR #513 description. It documents live topology per environment (DEV/STAGING/PROD), the pre-flight
  GHCR-permissions and no-rollback-mechanism (#495) checklist, and the per-environment cutover
  sequence; the literal paste-in compose diffs it points at were added as a second, dated section to
  each of `infrastructure/docker/env/{prod,dev,stage}.compose-fragment.yml`, the same files this
  Consequences item already named.
- What's unchanged: nothing about the decision itself — this is a citation update pointing future
  readers at where the runbook actually lives, not a change to what it says to do.
- PR: #513 (issue #915, `Refs #322`).

### 2026-08-24 — image registry path flattened, superseded to ADR 0072

- Clause amended: **Decision 3** (`[binding]`) — the image path
  `ghcr.io/sieitzz/dgfy-platform/dgfy-{ims,pos,storefront}`.
- Change: `docs/architecture/adr/0072-ghcr-container-image-naming.md` supersedes-in-part this
  clause, flattening every GHCR package in the repo (including these three) to
  `ghcr.io/sieitzz/<apps-directory-name>` — i.e. `ghcr.io/sieitzz/dgfy-{ims,pos,storefront}`,
  dropping the `dgfy-platform/` path segment. Reason: GHCR's org package listing renders only the
  last path segment, so the old path displayed as a bare, collision-prone name once other Sieitzz
  repositories start publishing their own containers (issue #928).
- What's unchanged: the rest of Decision 3 — one image per app, own Dockerfile per app under
  `infrastructure/docker/dgfy-{ims,pos,storefront}/`, the single `frontend` image and its compose
  service retired. Only the registry path segment moves; per ADR 0072 Decision 4, the legacy
  `frontend` image itself is deliberately not renamed since it has no `apps/*` directory and is
  already scheduled for deletion once this same cutover bakes.
- PR: (this PR, issue #928).

### 2026-08-25 — deploy-main.yml's frontend chain drops serialization (supersedes the 2026-08-23 rejection)

- Clause amended: **Consequences item 3** (untagged, `default` tier per ADR 0039), specifically the
  2026-08-23 amendment's own "what's unchanged" paragraph above, which considered and rejected
  dropping serialization when the chain shrank from 6 jobs to 3.
- Change: that rejection was made without re-checking either the real root cause of #427's GHCR
  secondary-rate-limit incident or current image sizes. #433 (closed the day after #427, same
  2026-08-14 window) found and fixed the actual cause: all three build workflows were also pushing
  a redundant, full `mode=max` registry cache image to GHCR on every build, roughly doubling push
  volume — not the two/three frontend jobs running in parallel per se. That fix (already shipped,
  still in place) removed the real pressure; the `deploy-main.yml` `needs:` chain was a second,
  never-independently-re-justified safeguard layered on top of it. Live evidence the parallel path
  is safe: `deployment-orchestrator.yml` (the DEV/STAGING equivalent) has run these same three
  builds fully in parallel, no `needs:` chain at all, on every dispatch since the frontend split,
  with no rate-limit recurrence across the last 8 dispatches (the one failure was an unrelated stale
  server-compose guard, not GHCR). Current image sizes are modest (~27–33 MB compressed each,
  confirmed directly against GHCR) — not the "large" pre-split combined-image pushes #427's original
  incident described. `deploy-main.yml`'s `frontend-ims-prod`/`frontend-pos-prod`/
  `frontend-storefront-prod` jobs now run independently, matching DEV/STAGING parity.
- What's unchanged: the core decision this ADR governs (one image per app, `deploy-main.yml`/
  `deployment-orchestrator.yml` running per-app jobs) — only the serialization within
  `deploy-main.yml`'s frontend job group is removed. The runner pool is still only 2 self-hosted
  runners (`vm-openproject`, `vm-sieitzstaging`), so this is a bounded wall-clock win (roughly a
  couple of minutes), not a 3x speedup — the third job simply queues for a free runner. If a GHCR
  rate limit does recur, reverting is a one-line `needs:` re-add per job.
- PR: (this PR, issue #1041).

### 2026-09-03 — Interim override: new back-office-level feature work targets POS, not IMS

- Clause amended: **Context** (untagged, `default` tier per ADR 0039) — the framing *"surfaces that
  in practice change on unrelated schedules (... IMS ships back-office admin work)."*
- Change: per issue #1554 (Pat's call), until #1354's dedicated DGFY Back Office ships, **new**
  back-office-level feature work — catalog/inventory authoring, CSV/bulk import-export,
  cross-location configuration — targets `apps/dgfy-pos`, not `apps/dgfy-ims`. Concrete evidence
  this was needed: #1318 and #1495 Part B both landed IMS-only (Surebiz Iteration 4 batch 2,
  2026-09-03/04) with confirmed zero POS reach, by default rather than by decision. Full rule and
  its "back-office-level" definition: `AGENTS.md`'s "Feature placement policy" section, added in
  the same PR as this amendment.
- What's unchanged: this ADR's Decision clauses (the three-app split, `packages/web-core` as the
  only shared trunk, per-app container images) are untouched — only the Context sentence's framing
  of which app currently plays the "back-office" role is overridden, and only on an interim basis.
  POS terminal operational flows (checkout, delivery run assignment, shift management) are outside
  this override's scope. Issue #358 (extract/freeze/deprecate `apps/dgfy-ims`) remains open and
  unresolved — this amendment is a data point toward that decision, flagged there, not a resolution
  of it.
- PR: (this PR, issue #1554).

## Future Direction

Per-app dependency pruning (removing packages a given app doesn't actually use, rather than
carrying the full former `apps/dgfy-web` dependency set into all three) and graduating IMS-only
`packages/web-core` code back into `apps/dgfy-ims` are both named above as explicit, un-scheduled
follow-up — see the `[default]`-tagged clauses. Neither is assumed to happen automatically from
this ADR; a future change proposing either should cite this one rather than re-deriving why the
duplication existed in the first place.

## Validation

- `npm run build:skupervisor && npm run build:pos && npm run build:store` (each app builds
  standalone via its own `package.json`, not a shared `build:all`)
- Full `apps/dgfy-ims` vitest run (its `test:` include glob also runs `packages/web-core`'s suite,
  since web-core has no runner of its own) and `apps/dgfy-storefront`'s own local suite
- `docker build -f infrastructure/docker/dgfy-ims/Dockerfile .` (and `dgfy-pos`, `dgfy-storefront`)
  plus a `docker run` + `curl` smoke test against each, confirming hashed assets 404 (not
  200-with-SPA-fallback) when missing — the chunk-load-recovery contract from issue #182 survives
  per app
- `docker compose config --quiet` across the base/override/local-ports/local-test compose
  combinations
- `npm run lint:docs`, `npm run check:adr`, `npm run check:compliance`, `npm run check:agent-surfaces`
- `node scripts/report-frontend-split-sync.js --post-merge --strict` (zero resurrected
  `apps/dgfy-web/**` paths)
