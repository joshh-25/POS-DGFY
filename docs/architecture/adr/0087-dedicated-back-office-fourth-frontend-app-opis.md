---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-09-23
last_reviewed: 2026-10-10
review_by: 2027-03-29
applies_to: repository_layout
topic: opis_fourth_frontend_app
supersedes_in_part: docs/architecture/adr/0071-frontend-split-into-three-apps.md
---

# ADR 0087: Dedicated DGFY Back Office as a Fourth Frontend App (`apps/dgfy-opis`)

## Status

Accepted (2026-09-29) — Pat approved the architecture decision before the operational rollout.
The implementation PR is #2054; the environment rollout is tracked separately under #2052.

## Context

ADR 0071 split `apps/dgfy-web` into three independently deployable frontend apps
(`apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`) over the single shared trunk
`packages/web-core`. Its Context framed IMS as the surface that "ships back-office admin
work." That framing was overridden on an interim basis (2026-09-03 amendment, issue
#1554): until epic #1354's dedicated DGFY Back Office ships, new back-office-level feature
work targets `apps/dgfy-pos`, not IMS — because POS is where merchant customers actually
operate. The POS Back Office built up under that rule
(`apps/dgfy-pos/src/features/businessAdmin`, routes `/backoffice/*` and `/business-admin/*`,
API `/api/v1/business-admin`) is the implementation this ADR moves to its permanent home.

Issue #2052 (epic #1354) establishes that home: `apps/dgfy-opis`, serving `opis.dgfy.ph`
(`opis.dev.dgfy.ph`, `opis.stage.dgfy.ph`). This ADR is the scoped successor the #2052 plan
requires: it extends ADR 0071's binding three-app decision to four apps while preserving
its shared-code and app-isolation rules.

## Decision

1. The merchant Back Office shell moves from `apps/dgfy-pos` to the new independently
   deployable, independently buildable, independently testable top-level app `apps/dgfy-opis`
   (dev port 5176, container port 8084, image `ghcr.io/sieitzz/dgfy-opis` per ADR 0072's
   flat naming). The Back Office overview is `/`, and each section is served directly from
   its own root-level path (`/sales`, `/orders`, `/catalog`, `/settings/profile`, etc.).
   Existing `/backoffice/*` and `/business-admin/*` links remain compatible by redirecting
   to the equivalent root-level path while preserving query and hash. `/backoffice/overview`
   and `/business-admin/overview` redirect to `/`. Reserved OPIS flows (`/dgfy/*`,
   `/register-company/*`, `/receive/:token`) keep their existing routes. POS keeps terminal operations only
   (checkout, pairing, shifts); its former Back Office routes redirect to OPIS preserving
   path and query, and IMS merchant handoffs retarget to OPIS. `[binding]`
2. `packages/web-core` remains the **only** shared frontend trunk; no app may fork trunk
   logic instead of depending on the package. Each of the four apps declares
   `"@sieitzz/web-core": "file:../../packages/web-core"`, depends on no other app's
   source, and keeps its own `package.json`, lockfile, Vite config, and test config.
   OPIS carries the same browser-support guards, build stamps, shared runtime aliases,
   and React deduplication approach as the existing three. `[binding]`
3. Each app builds into its own container image with its own Dockerfile under
   `infrastructure/docker/dgfy-<app>/`, scoped to only the `VITE_*`/`SENTRY_*` build args
   that app's own code actually reads. OPIS gets `ghcr.io/sieitzz/dgfy-opis`, its own
   Dockerfile/healthcheck, compose and environment fragments, and Nginx routing for the
   dev/stage/prod OPIS hosts, retaining API/upload/analytics proxying, security headers,
   SPA behavior, and hashed-asset 404 behavior. `[binding]`
4. OPIS keeps an independent browser session from POS: the `opis_*` cookie namespace
   (`opis_refresh_token`, `opis_tenant_context`, `opis_csrf_token`) is selected per
   request by the `x-dgfy-app-surface: opis` header — a cookie-namespace selector only,
   never authorization. Company switching or logout in OPIS never consumes or clears the
   `sku_*` POS cookies, including under a shared `SESSION_COOKIE_DOMAIN`. Host-only
   cookie policy, `HttpOnly`, `Secure`, CSRF enforcement/rotation, in-memory access
   tokens, and existing server-side tenant/branch/permission checks are preserved; the
   `/api/v1/business-admin` request/response contracts are unchanged. `[binding]`
5. POS refreshes its canonical settings when it regains focus/visibility or reconnects
   after offline state (coalesced), reusing existing scoped hydration. The refresh never
   changes tenant, resets checkout, closes a shift, overwrites dirty settings, or
   silently reprices an active sale. No realtime service and no cross-origin token
   messaging are introduced. `[default]`
6. `packages/web-core` never gets its own `node_modules` or its own test runner; its
   suite keeps running from `apps/dgfy-ims`, so a duplicate React copy cannot silently
   appear. OPIS app-owned tests run from `apps/dgfy-opis`, like the other apps.
   `[binding]`
7. Retained POS/IMS Back Office routes are registered as compatibility seams under
   ADR 0035 with owner, tests, rollback, and removal criteria tied to #1354 migration
   completion — not silent leftovers. `[default]`
8. OPIS owns the merchant partner-connection settings section, including consent, scoped
   health, tenant disconnect, and plan-bounded allocation/sync inputs; DGFY Admin remains the
   platform control surface. Exact route placement follows OPIS's existing settings/navigation
   conventions. `[default]`

Dependencies were duplicated verbatim from `apps/dgfy-pos/package.json` into
`apps/dgfy-opis/package.json` (OPIS keeps the `pos-receipt` shared package for the order
receipt viewer; the Electron desktop shell stays POS-only) rather than pruned per app;
pruning unused per-app dependencies is explicit follow-up work, not required by this
decision. `[default]`

## Consequences

- **Four lockfiles to keep in sync**, not three. Dependency version drift across
  `apps/dgfy-{ims,pos,storefront,opis}/package-lock.json` is now possible;
  `security/audit-allowlist.json` carries the per-app-tree suppressions for OPIS too.
- **Deploy inputs grow by one app**: `deploy-frontend.yml` takes `dgfy-opis`,
  `deployment-orchestrator.yml`/`deploy.yml`/`deploy-main.yml` carry
  `build_frontend_opis` and the OPIS candidate-source-SHA/tag plumbing, and the
  floor-alias promotion loop covers six apps.
- **CI path filters grow by one output** (`frontend_opis` in `shared-changed-paths.yml`,
  the `route-build-checks`/`resolve-frontend-build-triggers`/`pr-checks.js` mirrors, and
  the `frontend-opis-{build,lint}-check` jobs). The required feature branch
  `feat/DGFY-459-pos-development-pr-ready` is a temporary `pr-checks.yml` trigger for the
  #2052 integration line; it is removed once PR #2026 merges.
- **On acceptance**, `AGENTS.md`'s interim "back-office-level work goes to POS" rule
  retires for new work: new back-office-level feature work targets OPIS, and the
  `area:pos`-for-back-office labeling note falls away with it. The corresponding policy
  updates landed alongside acceptance in `AGENTS.md` and
  `docs/process/ISSUE-TAXONOMY.md`.
- **Operational rollout dependencies** (DNS records in #2051, TLS, GHCR package
  visibility/pull permissions, per-environment server config) need release coordination;
  configuration in the implementing PR does not prove deployment readiness, and this PR
  dispatches no deployment.

## Validation

- `npm run build:opis` (standalone via its own `package.json`) plus `build:pos`,
  `build:skupervisor`, and `build:store` for shared-code/auth/routing reachability
- `docker build -f infrastructure/docker/dgfy-opis/Dockerfile .` plus a `docker run` +
  `curl` smoke test confirming hashed assets 404 (not 200-with-SPA-fallback)
- Focused suites: moved Back Office modules/routes, OPIS auth, cookie namespace, CSRF,
  settings refresh, handoff URL builders, app-version/image/trigger registries
- `npm run check:architecture`, `npm run lint:docs`, `npm run check:compat-seams`,
  `npm run check:agent-surfaces`, `npm run check:compliance`,
  `npm run check:pr-quality-workflow`, `npm run check:workspace-hygiene`,
  `npm run test:web-core-reachability`, `npm run test:frontend-build-triggers`,
  `npm run test:app-versions`, `git diff --check`

## Amendments

### 2026-10-10 — Merchant partner-connection administration belongs to OPIS (#2379)

- Clause added: Decision 8 (`default`).
- Change: OPIS is the merchant surface for consenting to connect an approved partner App at explicit
  tenant/location/scopes, viewing redacted connection/credential/sync/allocation health, changing
  plan-bounded merchant allocation and sync-round inputs, and disconnecting/revoking that tenant's
  attachment. Platform App approval, platform credentials, client suspension, platform audit, and
  plan/entitlement authority remain in DGFY Admin under ADR 0047/0089.
- Boundary: OPIS actions remain subject to existing tenant/session/location checks and server-side
  authorization. This amendment does not alter Decisions 1–4 or 6 binding text; it does not change
  the independent `/admin` surface in ADR 0089.
- Reference: `docs/api/PARTNER_ADMINISTRATION_MATRIX.md`; proposed ADR 0091.
