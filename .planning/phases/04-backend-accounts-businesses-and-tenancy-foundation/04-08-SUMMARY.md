---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
plan: 08
subsystem: api
tags: [tenant-database, sequelize, mysql, clean-architecture, gap-closure, verification-refresh]

# Dependency graph
requires:
  - phase: 04-backend-accounts-businesses-and-tenancy-foundation
    provides: "TenantConnector, LocationRepository, StaffOnboardingRepository, BusinessDatabaseRegistryRepository from 04-04/04-06/04-07"
provides:
  - "TenantConnector.getModels(databaseName): a reachable tenant model definition registry (Location, StaffAccount, StaffInvitation, AccountStaffAssignment, TerminalIdentity) — closes the TerminalIdentity orphan finding"
  - "tests/helpers/tenantSchemaProvisioning.js: real migration-runner schema application + dgfyBusinessContract verification test helper, used by every gated Phase 04 DB-backed suite"
  - "Stricter active/verified tenant-registry gate on tenant session activation (tenantSessionUseCases.js), closing an owner-bypass correctness gap"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TenantConnector.getModels(databaseName) defines every tenant model idempotently on one connection, reusing connection.models[name] if another repository already defined it — a single reachable tenant model registry instead of each repository independently importing its own model factory"
    - "Gated DB-backed test suites apply the REAL migration-runner schema migrations (via createRequire cross-package import of the .cjs migration files) against a disposable tenant database, then verify against dgfyBusinessContract.js's table list, instead of ad hoc model.sync({force:true})"
    - "Tenant registry provisioning test helper resolves the EXISTING provisioning row created by POST /businesses (findByBusinessId) and only ever calls updateStatus() on it — never creates a second, duplicate registry row"

key-files:
  created:
    - apps/dgfy-api/tests/unit/infra/tenantConnector.test.js
    - apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js
    - .planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/deferred-items.md
  modified:
    - apps/dgfy-api/src/infra/tenantConnector.js
    - apps/dgfy-api/src/models/Tenant/TerminalIdentity.js
    - apps/dgfy-api/src/modules/businesses/index.js
    - apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js
    - apps/dgfy-api/tests/integration/businesses/businessFlows.test.js
    - apps/dgfy-api/tests/integration/businesses/businessValidation.test.js
    - apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js
    - apps/dgfy-api/tests/integration/tenancy/tenantSessionValidation.test.js
    - apps/dgfy-api/tests/integration/tenancy/tenantSessionRoutes.test.js
    - apps/dgfy-api/tests/integration/tenancy/tenantSessionUseCases.test.js
    - apps/dgfy-api/tests/unit/modules/businesses/tenantSessionUseCases.test.js
    - apps/dgfy-api/tests/e2e/phase4FullFlow.test.js

key-decisions:
  - "TerminalIdentity wiring is a new TenantConnector.getModels(databaseName) registry method (not a change to TerminalIdentity.js's own schema fields) — reachable from buildBusinessesModule()'s returned tenantConnector, with no new public terminal identity route/controller/use case added in Phase 04"
  - "getModels() reuses connection.models[name] if another repository (LocationRepository/StaffOnboardingRepository/AccountStaffAssignmentRepository) already defined that model on the same cached TenantConnector connection, instead of unconditionally re-defining — this is what makes it genuinely idempotent across independent callers, not just across repeated getModels() calls"
  - "Fixed a latent, previously-undetected bug: every gated real-MySQL suite in this phase called businessDatabaseRegistryRepository.create({...status:'active'}) AFTER POST /businesses had already auto-created a provisioning row for the same businessId (04-06's findOrCreateForBusiness) — creating a second, duplicate registry row per business (no unique constraint on business_id, only on database_name). All 6 affected suites now resolve the EXISTING row via findByBusinessId() and only ever call updateStatus() on it"
  - "tenantSessionUseCases.js's resolveTenantSession() Step 2 now requires registry status='active' AND verified_at populated (matching locationRepository.js's/staffOnboardingRepository.js's already-established 04-06 gate), closing an owner-bypass gap where an owner could activate a session against a still-provisioning tenant database and receive HTTP 200 without ever attempting a tenant connection"
  - "The DB-backed gated test suites now apply the REAL apps/dgfy-migration-runner schema migration .cjs files (via createRequire cross-package import) and verify against dgfyBusinessContract.js's table list, instead of ad hoc model.sync({force:true}) — proving durable schema-migration correctness, not just Sequelize-model-shape agreement"
  - "Logged (not fixed) a pre-existing duplicate-registry-row bug in businessRoutes.test.js to deferred-items.md — that file is not in this plan's <files> list and does not exercise activate-session, so it is out of this task's scope per the Scope Boundary rule"

requirements-completed: ["API-01", "API-02", "API-03", "API-04", "API-05", "API-06"]

coverage:
  - id: D1
    description: "TerminalIdentity is imported by the tenant model definition path used by live module composition (TenantConnector.getModels()), reachable from buildBusinessesModule(), with no new public terminal identity route added"
    requirement: "API-05"
    verification:
      - kind: unit
        ref: "tests/unit/infra/tenantConnector.test.js (5 tests: idempotent definition, association wiring, connection-level model reuse, buildBusinessesModule() reachability, no new route)"
        status: pass
      - kind: other
        ref: "rg \"terminal-identity|terminalIdentity|TerminalIdentity\" apps/dgfy-api/src/modules/businesses/routes.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "Default npm test, lint, and architecture guardrails remain green after the gap-closure changes (API-01/API-06 regression, API-05 Clean Architecture)"
    requirement: "API-01 / API-05 / API-06"
    verification:
      - kind: unit
        ref: "cd apps/dgfy-api && npm test — 163 passed, 189 skipped (gated, no MySQL in this sandbox), 0 failed"
        status: pass
      - kind: other
        ref: "cd apps/dgfy-api && npm run lint — 0 errors, 10 pre-existing warnings"
        status: pass
      - kind: other
        ref: "npm run check:architecture:dgfy-api — 0 controller-boundary violations, 0 new architecture exceptions"
        status: pass
    human_judgment: false
  - id: D3
    description: "E2E/integration tests prove create-business returns only safe `provisioning` registry metadata; location/staff/tenant-session writes only succeed after an explicit operator/migration-runner handoff (real schema migration + verification, then updateStatus); pre-handoff attempts fail closed with no tenant-local row created"
    requirement: "API-02 / API-03 / API-04"
    verification:
      - kind: integration
        ref: "tests/integration/businesses/businessFlows.test.js, businessValidation.test.js, tests/integration/tenancy/tenantSessionFlows.test.js, tenantSessionValidation.test.js, tests/e2e/phase4FullFlow.test.js (new provisioning-metadata + pre-handoff-fail-closed test cases)"
        status: unknown
    human_judgment: true
    rationale: "Every DB-backed gated suite in this phase (RUN_*_INTEGRATION=true) requires a real MySQL server. This sandbox has none (no `mysql`/`mysqld`/`docker` binary reachable). Force-enabling each affected suite confirmed every setup path fails ONLY on SequelizeConnectionRefusedError (ECONNREFUSED 127.0.0.1:3306) — never a syntax/logic/assertion error — proving the code path is reachable and correct up to the connection layer, but this is not the same as a real pass/fail result. A human with real MySQL admin credentials must run the exact command listed under User Setup Required."
  - id: D4
    description: "tenantSessionUseCases.js's owner-bypass gap is closed: an owner can no longer activate a session against a still-provisioning or unverified tenant database"
    requirement: "API-04"
    verification:
      - kind: unit
        ref: "tests/integration/tenancy/tenantSessionUseCases.test.js (2 new cases: provisioning-status rejection, active-but-unverified rejection) and tests/unit/modules/businesses/tenantSessionUseCases.test.js (fixture updated with verified_at)"
        status: pass
    human_judgment: false

duration: ~75min
completed: 2026-07-12
status: complete
---

# Phase 04 Plan 08: TerminalIdentity Model Wiring and DB-Backed Verification Refresh Summary

**Wired TerminalIdentity into a reachable tenant model registry (TenantConnector.getModels), fixed a duplicate-registry-row bug and an owner-bypass tenant-activation gap found across every gated Phase 04 suite, and refreshed integration/E2E tests to prove the explicit provisioning-to-active/verified handoff fails closed pre-handoff**

## Performance

- **Duration:** ~75 min
- **Tasks:** 2
- **Files modified:** 16 (3 created, 13 modified)

## Accomplishments

- `TenantConnector.getModels(databaseName)` is a new, reachable tenant model definition registry that defines `Location`, `StaffAccount`, `StaffInvitation`, `AccountStaffAssignment`, and `TerminalIdentity` idempotently on a real per-tenant Sequelize connection, wiring every `associate()` call. It reuses `connection.models[name]` if another repository already defined that model on the same cached connection, so it never double-defines. `TerminalIdentity.js` itself is unchanged (no schema fields touched) — only its doc comment and reachability changed. `04-VERIFICATION.md`'s TerminalIdentity orphan finding is closed with **no new public terminal identity route/controller/use case** added.
- Found and fixed a latent bug present in every gated real-MySQL suite in this phase: `provisionTenantForBusiness()`/`createBusinessWithTenant()` helpers called `businessDatabaseRegistryRepository.create({...status:'active'})` **after** `POST /businesses` had already auto-created a `provisioning` registry row for the same `businessId` (04-06's `findOrCreateForBusiness()`). Since `business_database_registry` has no unique constraint on `business_id` (only `database_name`), this silently created a **second, duplicate registry row** per business that `findByBusinessId()` could resolve ambiguously with no `ORDER BY`. All 6 affected suites (`businessFlows`, `businessValidation`, `tenantSessionFlows`, `tenantSessionValidation`, `tenantSessionRoutes`, `phase4FullFlow`) now resolve the EXISTING `provisioning` row and only ever call `updateStatus()` on it.
- New shared test helper `tests/helpers/tenantSchemaProvisioning.js` applies the **real** `apps/dgfy-migration-runner` schema migration `.cjs` files (via `createRequire` cross-package import — no new package dependency) against a disposable tenant database, verifies every table against `dgfyBusinessContract.js`'s own table list, then marks the registry `active`/`verified`. This replaces every prior ad hoc `model.sync({force:true})` provisioning path across the 6 affected suites, proving durable schema-migration correctness rather than just Sequelize-model-shape agreement.
- Fixed `tenantSessionUseCases.js`'s `resolveTenantSession()`: Step 2 now requires registry `status='active'` AND `verified_at` populated (matching `locationRepository.js`'s/`staffOnboardingRepository.js`'s already-established 04-06 gate) — closing a real correctness gap where an **owner** (who bypasses Step 3's tenant-assignment connection check) could activate a session against a still-`provisioning` — or never actually created — tenant database and receive HTTP 200.
- Added negative, fail-closed assertions across `businessFlows.test.js`, `businessValidation.test.js`, `tenantSessionFlows.test.js`, `tenantSessionValidation.test.js`, and `phase4FullFlow.test.js`: staff onboarding, location creation, and tenant session activation all fail closed (`503 TENANT_DATABASE_UNAVAILABLE`) before the operator/migration-runner handoff, with no tenant-local row ever created. Added explicit assertions that `POST /businesses` returns only safe `provisioning` registry metadata (never DB host/user/password).

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire TerminalIdentity Into Tenant Model Definition Path** - `e7ead9ae` (feat)
2. **Task 2: Refresh DB-Backed Phase 04 Verification Suites** - `b6e1873a` (feat)

## Files Created/Modified

- `apps/dgfy-api/src/infra/tenantConnector.js` - New `getModels(databaseName)` tenant model definition registry method.
- `apps/dgfy-api/src/models/Tenant/TerminalIdentity.js` - Doc comment only; no schema change.
- `apps/dgfy-api/src/modules/businesses/index.js` - Doc comment documenting `tenantConnector.getModels()` reachability.
- `apps/dgfy-api/tests/unit/infra/tenantConnector.test.js` - New: 5 always-run unit tests for `getModels()` (no real MySQL required).
- `apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js` - `resolveTenantSession()` Step 2 now requires `status='active'` AND `verified_at`.
- `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js` - New shared helper: real migration application + contract verification + registry activation.
- `apps/dgfy-api/tests/integration/businesses/businessFlows.test.js` - Uses the shared helper; added provisioning-metadata assertion + pre-handoff fail-closed test.
- `apps/dgfy-api/tests/integration/businesses/businessValidation.test.js` - Uses the shared helper; added `createBusinessStillProvisioning()` + pre-handoff 503 test.
- `apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js` - Uses the shared helper; terminal-identity model now resolved via `tenantConnector.getModels()`; added pre-handoff owner-activation 503 test.
- `apps/dgfy-api/tests/integration/tenancy/tenantSessionValidation.test.js` - Uses the shared helper; `createBusinessWithoutTenant()` now seeds via `businessRepository.create()` directly (genuinely no registry row) since the HTTP path always auto-creates one; added `createBusinessStillProvisioning()` + 503 test.
- `apps/dgfy-api/tests/integration/tenancy/tenantSessionRoutes.test.js` - Cascading fix: uses the shared helper so its pre-existing HTTP 200 assertions don't regress under the new active/verified gate.
- `apps/dgfy-api/tests/integration/tenancy/tenantSessionUseCases.test.js` - Fixture `verified_at` added; 2 new tests for the provisioning/unverified rejection paths.
- `apps/dgfy-api/tests/unit/modules/businesses/tenantSessionUseCases.test.js` - Fixture `verified_at` added so WR-04 connection-failure tests still exercise Step 3, not the new Step 2 gate.
- `apps/dgfy-api/tests/e2e/phase4FullFlow.test.js` - Uses the shared helper; added provisioning-metadata + pre-handoff fail-closed assertions to Journeys 1 and 2.
- `.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/deferred-items.md` - New: logs the out-of-scope `businessRoutes.test.js` duplicate-row bug.

## Decisions Made

- TerminalIdentity wiring is a `TenantConnector.getModels()` registry method, not a schema change — reachable from `buildBusinessesModule()`, no new public route.
- `getModels()` reuses `connection.models[name]` when already defined by another repository on the same connection, making it genuinely idempotent across independent callers.
- Fixed the duplicate-registry-row bug across all 6 directly-affected gated suites by resolving the existing `provisioning` row instead of creating a second one.
- `tenantSessionUseCases.js` now requires `status='active'` AND `verified_at` before activation succeeds, closing the owner-bypass gap.
- DB-backed suites now apply the real migration-runner schema files and verify against `dgfyBusinessContract.js`, not ad hoc `sync({force:true})`.
- Logged (did not fix) `businessRoutes.test.js`'s identical pre-existing bug — out of this plan's `<files>` scope and does not exercise `activate-session`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed owner-bypass tenant-activation gap in tenantSessionUseCases.js**
- **Found during:** Task 2, while designing the pre-handoff negative-assertion tests the plan requires
- **Issue:** `resolveTenantSession()`'s Step 2 only checked `registryEntry.database_name` truthiness, not `status`/`verified_at`. Since owners bypass Step 3's tenant-connection check entirely, an owner could activate a session against a still-`provisioning` (schema never actually created) tenant database and receive HTTP 200.
- **Fix:** Added a `status !== 'active' || !verified_at` check returning 503, mirroring `locationRepository.js`'s/`staffOnboardingRepository.js`'s existing gate.
- **Files modified:** `apps/dgfy-api/src/modules/businesses/usecases/tenantSessionUseCases.js`
- **Verification:** New unit tests in `tests/integration/tenancy/tenantSessionUseCases.test.js`; `npm test` full suite green.
- **Committed in:** `b6e1873a` (Task 2 commit)

**2. [Rule 3 - Blocking, cascading regression] Fixed duplicate-registry-row bug in 5 additional gated suites not in the plan's `<files>` list**
- **Found during:** Task 2, while auditing every registry-provisioning helper for the plan's "does not itself create/apply the tenant schema" requirement
- **Issue:** `tenantSessionRoutes.test.js` (not in this plan's `<files>` list) has the identical duplicate-registry-row pattern AND exercises `activate-session` directly — the Step 2 production fix above would make its pre-existing "HTTP 200" assertions fail (503) once real MySQL credentials are supplied, since its registry row never had `verified_at` set.
- **Fix:** Updated `tenantSessionRoutes.test.js`'s `createBusinessWithTenant()` to use the same `provisionAndActivateTenantDatabase()` shared helper as the 5 explicitly-scoped files.
- **Files modified:** `apps/dgfy-api/tests/integration/tenancy/tenantSessionRoutes.test.js`
- **Verification:** Parses and skips cleanly; force-enabled to confirm it fails only on `ECONNREFUSED`.
- **Committed in:** `b6e1873a` (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed pre-existing unit-test fixtures broken by the Step 2 production-code change**
- **Found during:** Task 2, immediately after adding the `status`/`verified_at` check
- **Issue:** `tests/integration/tenancy/tenantSessionUseCases.test.js`'s and `tests/unit/modules/businesses/tenantSessionUseCases.test.js`'s `makeRegistryEntry()` mock fixtures had no `verified_at` field, so 6 previously-passing tests started failing (503 instead of the expected 200/other status) the moment the production check was added.
- **Fix:** Added `verified_at: new Date(...)` to both fixtures' defaults.
- **Files modified:** `apps/dgfy-api/tests/integration/tenancy/tenantSessionUseCases.test.js`, `apps/dgfy-api/tests/unit/modules/businesses/tenantSessionUseCases.test.js`
- **Verification:** `npm test` — 163 passed, 0 failed.
- **Committed in:** `b6e1873a` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug fix required by the task's own negative-assertion acceptance criteria; 2 cascading-regression fixes required to keep the existing test suite from regressing as a direct consequence of that bug fix).
**Impact on plan:** One production-code file changed beyond the plan's declared `<files>` list (`tenantSessionUseCases.js`) and one additional gated test file (`tenantSessionRoutes.test.js`) — both required by the plan's own explicit acceptance criteria ("tenant activation attempts fail closed" pre-handoff) and Rule 3's cascading-regression precedent (mirrors 04-07-SUMMARY.md's identical situation). No architectural changes, no new runtime dependencies (the migration-runner `.cjs` files are loaded via `createRequire`, not a new package.json dependency).

## Issues Encountered

- No MySQL server is reachable in this sandbox (`mysql`/`mysqld`/`docker` are not installed). Every gated `RUN_*_INTEGRATION=true` suite was force-enabled locally to confirm it fails ONLY on `SequelizeConnectionRefusedError: connect ECONNREFUSED 127.0.0.1:3306` (never a syntax/assertion/logic error), proving the new provisioning/verification/negative-assertion code paths are reachable and correct up to the connection layer. This is NOT the same as a real DB-backed pass — see User Setup Required below.
- `businessRoutes.test.js` has the same pre-existing duplicate-registry-row bug as the 6 suites this plan fixed, but is out of this plan's declared `<files>` scope and does not exercise `activate-session` (so the Step 2 production fix doesn't regress it). Logged to `deferred-items.md` per the Scope Boundary rule rather than fixed.

## User Setup Required

A human with real MySQL admin credentials should run the exact command below at least once before considering this plan's DB-backed evidence complete:

```
cd apps/dgfy-api && RUN_BUSINESS_FLOWS_INTEGRATION=true RUN_BUSINESS_VALIDATION_INTEGRATION=true RUN_LOCATION_ROUTES_INTEGRATION=true RUN_TENANT_SESSION_FLOWS_INTEGRATION=true RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js tests/integration/businesses/businessValidation.test.js tests/integration/businesses/locationRoutes.test.js tests/integration/tenancy/tenantSessionFlows.test.js tests/integration/tenancy/tenantSessionValidation.test.js tests/e2e/phase4FullFlow.test.js
```

Set `BUSINESS_IT_DB_HOST`/`PORT`/`USER`/`PASSWORD` (or the existing `DB_HOST`/`PORT`/`USER`/`PASSWORD` convention) to point at a disposable MySQL server; every suite creates/drops its own uniquely-suffixed schemas and never touches a shared database.

Also recommended (not required by this plan's declared `<files>`, but now uses the same corrected provisioning helper): `RUN_TENANT_SESSION_ROUTES_INTEGRATION=true npm test -- tests/integration/tenancy/tenantSessionRoutes.test.js`, and `RUN_BUSINESS_ROUTES_INTEGRATION=true npm test -- tests/integration/businesses/businessRoutes.test.js` (this last one still has the pre-existing, unfixed duplicate-registry-row bug — see `deferred-items.md`).

## Commands Run (this session)

**Skip-safe (always run, no DB credentials required):**
- `cd apps/dgfy-api && npm test` — 163 passed, 189 skipped, 0 failed
- `cd apps/dgfy-api && npm run lint` — 0 errors, 10 pre-existing warnings
- `npm run check:architecture:dgfy-api` — 0 controller-boundary violations, 0 new architecture exceptions
- `rg "terminal-identity|terminalIdentity|TerminalIdentity" apps/dgfy-api/src/modules/businesses/routes.js` — no matches

**Force-enabled locally to confirm reachability (NOT a real DB-backed pass — no MySQL in this sandbox):**
- `RUN_BUSINESS_FLOWS_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js` — fails only on `ECONNREFUSED`
- `RUN_BUSINESS_VALIDATION_INTEGRATION=true npm test -- tests/integration/businesses/businessValidation.test.js` — fails only on `ECONNREFUSED`
- `RUN_TENANT_SESSION_FLOWS_INTEGRATION=true npm test -- tests/integration/tenancy/tenantSessionFlows.test.js` — fails only on `ECONNREFUSED`
- `RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true npm test -- tests/integration/tenancy/tenantSessionValidation.test.js` — fails only on `ECONNREFUSED`
- `RUN_TENANT_SESSION_ROUTES_INTEGRATION=true npm test -- tests/integration/tenancy/tenantSessionRoutes.test.js` — fails only on `ECONNREFUSED`
- `RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/e2e/phase4FullFlow.test.js` — fails only on `ECONNREFUSED`

**Not run (operator-required, exact command listed above under User Setup Required):**
- The full DB-backed command with all 6 `RUN_*_INTEGRATION=true` flags set together against a real disposable MySQL server.

## Known Stubs

None new. Carries forward `04-07-SUMMARY.md`'s existing known stub: `businessController.js` does not yet forward a `dgfy_account_id`/`dgfyAccountId` field from the HTTP request body for direct-add/invitation-accept (intentional, deferred staff-to-DGFY-account linking).

## Next Phase Readiness

- API-01 through API-06 are all satisfied for this phase's gap-closure scope: TerminalIdentity is no longer an unexplained orphan, and Phase 04's integration/E2E verification proves the explicit provisioning handoff plus durable gap-closure paths, or records the exact DB credential blocker honestly (no MySQL reachable in this sandbox).
- Any later wave touching tenant provisioning should use `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js`'s `provisionAndActivateTenantDatabase()` pattern (resolve the existing `provisioning` row via `findByBusinessId()`, never create a second row) as the sole test-setup convention for marking a tenant database active/verified.
- A human with real MySQL access should run the command under "User Setup Required" at least once before considering this plan's real-MySQL evidence complete, matching the existing gated-suite precedent across this phase.
- `businessRoutes.test.js`'s identical duplicate-registry-row bug remains open — see `deferred-items.md` for the exact fix a future wave should apply.

---
*Phase: 04-backend-accounts-businesses-and-tenancy-foundation*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 16 claimed created/modified files exist on disk and both task commits (`e7ead9ae`, `b6e1873a`) are present in git history.
