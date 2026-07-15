---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
plan: 02
subsystem: api
tags: [express, sequelize, clean-architecture, jwt, dgfy-core, dgfy-api]

# Dependency graph
requires:
  - phase: 04-backend-accounts-businesses-and-tenancy-foundation
    provides: "Wave 1 (04-01): Account Sequelize model, AccountEntity, AccountRepository, and register/login/updateProfile/getAccount/getAccountForAuthorization use cases returning ApplicationResult; buildAccountsModule() DI wiring point"
provides:
  - "HTTP transport layer for accounts: POST /accounts/register, POST /accounts/login, GET /accounts/me, PATCH /accounts/me, GET /accounts/:id — all mounted live at /v1/accounts/* in the real app"
  - "apps/dgfy-api/src/shared/controllers/useCaseResponder.js — sendUseCaseResult(res, result, successStatusCode) response formatter"
  - "apps/dgfy-api/src/modules/accounts/middleware/accountAuthMiddleware.js — bearer-token auth for the accounts module's 'dgfy_account_session' JWT scope, with env-driven ACCOUNT_ADMIN_EMAILS admin-role resolution for self-or-admin access control"
  - "apps/dgfy-api/src/modules/businesses/ scaffold (index.js, README.md, routes.js, controllers/businessController.js) — empty stubs satisfying the architecture guardrail, ready for Wave 3"
  - "apps/dgfy-api/src/routes/index.js composition root wiring the accounts module's real DI chain (Account model -> buildAccountsModule -> buildAccountAuthMiddleware -> createAccountRoutes) against config/db.js"
  - "apps/dgfy-api/src/config/db.js default database corrected to dgfy_core (from the legacy sku_inventory_manager) for the non-test environment branch"
  - "apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js — apps/dgfy-api-local controller-naming allowlist, loaded via ARCH_GUARDRAIL_ALLOWLIST_PATH, keeping backend/ untouched"
affects: [04-03-business-foundation, 04-04-tenant-session-context-binding, 04-05-comprehensive-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sendUseCaseResult(res, result, successStatusCode) resolves failure HTTP status from ApplicationResult's own .statusCode getter (DomainError-derived), so controllers never map domain error codes to HTTP status themselves"
    - "Controllers are pure transport: routes.js -> controller builder(useCases) -> sendUseCaseResult, no model/repository imports, DI-injected use cases"
    - "Module-level auth middleware factory pattern (buildAccountAuthMiddleware({getAccount})) receiving a use case instead of importing a repository/model directly, so it composes against production or test module instances interchangeably"
    - "routes/index.js as the composition root: builds the Sequelize model + calls buildAccountsModule()/createAccountRoutes()/buildAccountAuthMiddleware(), mirroring dgfyAuth's existing module-level singleton-composition pattern"
    - "apps/dgfy-api-local architecture-guardrail allowlist (apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js), loaded via ARCH_GUARDRAIL_ALLOWLIST_PATH, keeping backend/'s own allowlist untouched for cross-service exceptions"

key-files:
  created:
    - apps/dgfy-api/src/shared/controllers/useCaseResponder.js
    - apps/dgfy-api/src/modules/accounts/controllers/accountController.js
    - apps/dgfy-api/src/modules/accounts/routes.js
    - apps/dgfy-api/src/modules/accounts/middleware/accountAuthMiddleware.js
    - apps/dgfy-api/src/modules/businesses/index.js
    - apps/dgfy-api/src/modules/businesses/README.md
    - apps/dgfy-api/src/modules/businesses/routes.js
    - apps/dgfy-api/src/modules/businesses/controllers/businessController.js
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
    - apps/dgfy-api/tests/integration/accounts/accountRoutes.test.js
  modified:
    - apps/dgfy-api/src/modules/accounts/index.js
    - apps/dgfy-api/src/routes/index.js
    - apps/dgfy-api/src/config/db.js
    - package.json

key-decisions:
  - "sendUseCaseResult() resolves failure status codes from ApplicationResult.statusCode (not a controller-side error-code-to-HTTP map) since Wave 1's DomainError already carries the correct statusCode per failure — controllers stay minimal"
  - "GET /accounts/:id self-or-admin access control resolved via an env-driven ACCOUNT_ADMIN_EMAILS allowlist rather than inventing schema, since dgfy_core.accounts has no role column and 04-CONTEXT.md explicitly left 'admin account lookup' strategy open for the executor — approved by the user as-is"
  - "accountRoutes.test.js (Task 3) is gated behind RUN_ACCOUNT_ROUTES_INTEGRATION=true, mirroring Wave 1's accountRepository.test.js precedent, since no MySQL server was reachable in this execution environment; end-to-end behavior was independently smoke-tested against an in-memory fake repository before commit"
  - "Controller-naming allowlist entries moved to a new apps/dgfy-api-local file (apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js, loaded via ARCH_GUARDRAIL_ALLOWLIST_PATH) instead of backend/src/config/architectureGuardrailsAllowlist.js, after the coordinator flagged the initial approach as crossing the phase's apps/dgfy-api-only scope boundary — backend/ and frontend/ are confirmed byte-identical to before this plan across all 5 commits"
  - "routes/index.js (not app.js directly) is the actual composition/mount point for the new /accounts and /businesses routes, since app.js already unconditionally delegates all route registration to routes/index.js via app.use('/v1', routes) — no app.js edit was needed"
  - "config/db.js's default (non-test) database name changed from sku_inventory_manager to dgfy_core, per explicit user direction after the app-wiring gap was flagged; this is a shared connection also used by the out-of-scope dgfyAuth module's legacy models, but production is unaffected because infrastructure/docker/.env already sets DB_NAME=sku_inventory_manager explicitly via env_file (env var always wins over the code fallback) — the new default only takes effect where DB_NAME is left unset"
  - "API-01 marked complete (HTTP layer now live and mounted); API-05 left Pending — it is a phase-wide Clean Architecture pattern requirement spanning accounts/businesses/tenancy, and businesses/tenancy modules are still stub-only pending Waves 3-4"

patterns-established:
  - "Auth middleware factories receive a use case (getAccount) rather than a repository/model, per Dependency Inversion — testable against any module instance"
  - "Empty-stub module scaffolding (index.js + README.md + one layer dir) satisfies the repo's architecture guardrail ahead of a module's real implementation landing in a later wave"

requirements-completed: ["API-01"]

coverage:
  - id: D1
    description: "Account HTTP endpoints (register/login/me/updateProfile/getAccount) implemented as dependency-injected, transport-only controllers using sendUseCaseResult, and mounted live at /v1/accounts/*"
    requirement: "API-01"
    verification:
      - kind: integration
        ref: "apps/dgfy-api/tests/integration/accounts/accountRoutes.test.js (18 tests, gated behind RUN_ACCOUNT_ROUTES_INTEGRATION=true)"
        status: unknown
      - kind: manual_procedural
        ref: "uncommitted supertest smoke test against real app.js with no live MySQL: POST /v1/accounts/register -> 500 (graceful, not a crash); GET /v1/accounts/me -> 401; all 18 in-memory-fake-repository flow assertions passed"
        status: pass
    human_judgment: true
    rationale: "The committed integration suite skips cleanly (no MySQL server reachable in this sandbox), matching the established Wave 1 precedent. A human should run it against a real disposable MySQL instance (RUN_ACCOUNT_ROUTES_INTEGRATION=true) to independently confirm the real-DB path, same as Wave 1's AccountRepository suite."
  - id: D2
    description: "Clean Architecture boundaries enforced: controllers never import models/repositories, dependencies injected via accounts/index.js, no allowlist entries added to the model-import boundary"
    requirement: "API-05"
    verification:
      - kind: other
        ref: "npm run check:architecture:dgfy-api (check-architecture-guardrails.js + check-controller-boundaries.js)"
        status: pass
      - kind: other
        ref: "cd apps/dgfy-api && npm run lint (eslint no-restricted-imports on controllers)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Self-or-admin access control on GET /accounts/:id (D-04, threat T-04-06) via env-driven ACCOUNT_ADMIN_EMAILS allowlist"
    requirement: "API-01"
    verification:
      - kind: manual_procedural
        ref: "uncommitted supertest smoke test: self-access 200, non-admin-to-other 403, admin-to-other 200, not-found 404"
        status: pass
    human_judgment: true
    rationale: "Approach was reviewed and approved by the user during the checkpoint, but the only proof is an uncommitted manual smoke test plus the gated (skipped) integration suite — no committed automated run against a real database exists yet."
  - id: D4
    description: "Businesses module scaffolded (index.js, README.md, routes.js, controllers/businessController.js) as empty stubs, satisfying the architecture guardrail ahead of Wave 3's real implementation"
    verification:
      - kind: other
        ref: "npm run check:architecture:dgfy-api — module structure check (index.js/README.md/layer dir present)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Routes mounted into the real running app (routes/index.js composition root) and config/db.js's default database corrected to dgfy_core"
    requirement: "API-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/health.transport.test.js (exercises the real app.js -> routes/index.js composition)"
        status: pass
      - kind: manual_procedural
        ref: "uncommitted supertest probe of the real app.js with no live MySQL"
        status: pass
    human_judgment: true
    rationale: "The composition wiring is exercised indirectly by a passing committed test (health.transport.test.js) plus an uncommitted manual probe, but there is no committed automated test that hits /v1/accounts/register through the real app against a live database — recommend covering this in Wave 5's comprehensive integration pass."

# Metrics
duration: 20min
completed: 2026-07-11
status: complete
---

# Phase 4 Plan 2: Account & Business Routes & Controllers Summary

**Dependency-injected HTTP transport layer (routes/controllers/auth-middleware) exposing Wave 1's account use cases at live `/v1/accounts/*` endpoints, plus a scaffolded businesses module for Wave 3, wired through a new `sendUseCaseResult` response formatter and mounted into the real `app.js` against a corrected `dgfy_core` default database.**

## Performance

- **Duration:** ~20 min (task-commit span; total session including a checkpoint round-trip and a follow-up correction round-trip was longer)
- **Tasks:** 3 planned auto tasks + 1 checkpoint (paused twice for coordinator-directed corrections) + 2 follow-up commits
- **Files modified:** 14 (10 created, 4 modified) net across `apps/dgfy-api/` and root `package.json`; `backend/` and `frontend/` are confirmed byte-identical to before this plan

## Accomplishments

- `apps/dgfy-api/src/shared/controllers/useCaseResponder.js` — `sendUseCaseResult(res, result, successStatusCode)`, resolving failure HTTP status from `ApplicationResult.statusCode` (DomainError-derived), so controllers never map error codes to HTTP status themselves
- `accounts/controllers/accountController.js` + `accounts/routes.js` — transport-only endpoints for register (201), login (200), getMe (200), updateProfile (200, partial-update-safe), and self-or-admin getAccount (200/403/404), all dependency-injected
- `accounts/middleware/accountAuthMiddleware.js` — bearer-token auth for the `dgfy_account_session` JWT scope (distinct from `dgfyAuth`'s `dgfy` scope), with an `ACCOUNT_ADMIN_EMAILS`-driven admin-role resolution for the self-or-admin access control required by `GET /accounts/:id`
- `businesses/` scaffold (`index.js`, `README.md`, `routes.js`, `controllers/businessController.js`) — empty stubs satisfying the architecture guardrail, ready for Wave 3
- `apps/dgfy-api/tests/integration/accounts/accountRoutes.test.js` — 18 real-MySQL-backed HTTP tests covering all 5 endpoints' success/validation/conflict/auth paths, gated behind `RUN_ACCOUNT_ROUTES_INTEGRATION=true`
- `routes/index.js` composition root wiring the accounts module's real DI chain against `config/db.js`, mounted live at `/v1/accounts/*` and `/v1/businesses/*`
- `config/db.js`'s default (non-test) database corrected from the legacy `sku_inventory_manager` to `dgfy_core`, matching what apps/dgfy-api's own models actually target
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` — apps/dgfy-api-local controller-naming allowlist (loaded via `ARCH_GUARDRAIL_ALLOWLIST_PATH`), keeping `backend/` untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Account Routes & Controllers — HTTP Transport Layer** - `b419ecbc` (feat) — also scaffolds `businesses/` and adds the `shared/controllers/useCaseResponder.js` this task depends on
2. **Task 2: Create Module Exports with Dependency Injection — index.js** - `5296d4d8` (feat) — also adds `accounts/middleware/accountAuthMiddleware.js`
3. **Task 3: Integration Tests for Account Routes** - `2ca1f836` (test)
4. **Checkpoint correction 1 (coordinator-flagged scope boundary):** Moved controller-naming allowlist out of `backend/` - `c05619e0` (fix)
5. **Checkpoint correction 2 (coordinator-directed app-wiring gap):** Mounted routes into the real app + corrected `db.js` default - `755144cc` (feat)

**Plan metadata:** *(this commit — recorded below)*

## Files Created/Modified

- `apps/dgfy-api/src/shared/controllers/useCaseResponder.js` — response envelope formatter
- `apps/dgfy-api/src/modules/accounts/controllers/accountController.js` — transport-only account controller
- `apps/dgfy-api/src/modules/accounts/routes.js` — Express routing for accounts
- `apps/dgfy-api/src/modules/accounts/middleware/accountAuthMiddleware.js` — bearer-token auth + admin-role resolution
- `apps/dgfy-api/src/modules/accounts/index.js` — extended DI wiring point (routes/controller/middleware exports)
- `apps/dgfy-api/src/modules/businesses/{index.js,README.md,routes.js,controllers/businessController.js}` — Wave 3 scaffold
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` — apps/dgfy-api-local controller-naming allowlist
- `apps/dgfy-api/src/routes/index.js` — composition root mounting `/accounts` and `/businesses`
- `apps/dgfy-api/src/config/db.js` — default database corrected to `dgfy_core`
- `apps/dgfy-api/tests/integration/accounts/accountRoutes.test.js` — 18 gated HTTP integration tests
- `package.json` (root) — `check:architecture:dgfy-api` script updated with `ARCH_GUARDRAIL_ALLOWLIST_PATH`

## Decisions Made

- `sendUseCaseResult()` resolves failure status codes from `ApplicationResult.statusCode` rather than a controller-side mapping table, keeping controllers minimal
- `GET /accounts/:id` admin access resolved via an env-driven `ACCOUNT_ADMIN_EMAILS` allowlist (no role column exists on `dgfy_core.accounts`) — reviewed and approved by the user as-is during the checkpoint
- Controller-naming allowlist entries live in a new `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` (not `backend/`) after the coordinator flagged the initial approach as an out-of-scope backend/ edit
- `routes/index.js`, not `app.js`, is the actual mount point for new route modules (matches the existing `dgfyAuth` convention — `app.js` unconditionally delegates via `app.use('/v1', routes)`)
- `config/db.js`'s default database changed to `dgfy_core` per explicit user direction; production is unaffected since `infrastructure/docker/.env` already sets `DB_NAME=sku_inventory_manager` explicitly (env var wins over the code fallback) — flagged as a shared-connection nuance since `dgfyAuth`'s legacy models also use this same connection
- API-01 marked complete; API-05 intentionally left Pending (phase-wide architecture-pattern requirement; businesses/tenancy modules are still stubs pending Waves 3-4)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `accounts/middleware/accountAuthMiddleware.js`**
- **Found during:** Task 2 (index.js DI wiring)
- **Issue:** The plan's success criteria require working bearer-token authentication on `GET /accounts/me`, `PATCH /accounts/me`, and self-or-admin authorization on `GET /accounts/:id`, but no auth middleware existed for the accounts module's own `dgfy_account_session` JWT scope (distinct from `dgfyAuth`'s `dgfy` scope) — reusing `dgfyAuth`'s middleware would have coupled to the out-of-scope legacy module.
- **Fix:** Added a dependency-injected `buildAccountAuthMiddleware({getAccount})` factory, resolving admin status via an env-driven `ACCOUNT_ADMIN_EMAILS` allowlist (no role column exists on `dgfy_core.accounts`; `04-CONTEXT.md` left this strategy open for the executor).
- **Files modified:** `apps/dgfy-api/src/modules/accounts/middleware/accountAuthMiddleware.js`
- **Verification:** Manual smoke test (auth/unauth/self/admin/forbidden/not-found flows all passed); user approved the approach during the checkpoint
- **Committed in:** `5296d4d8` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Mounted routes into the real app + corrected `config/db.js`'s default database**
- **Found during:** Checkpoint review — flagged by the coordinator as a scope gap before final approval
- **Issue:** Wave 2's own objective ("expose Wave 1 use cases through HTTP endpoints") was not actually achieved by Task 1-3 alone — the built routes were never mounted into the real `app.js`, and `config/db.js`'s default database (`sku_inventory_manager`) didn't match what the new Account model actually targets (`dgfy_core`).
- **Fix:** Wired `routes/index.js` (the file `app.js` already delegates all routing to) with the accounts module's real DI composition, mounted at `/v1/accounts/*` and `/v1/businesses/*`; changed `config/db.js`'s non-test default to `dgfy_core`.
- **Files modified:** `apps/dgfy-api/src/routes/index.js`, `apps/dgfy-api/src/config/db.js`
- **Verification:** `npm run lint` (0 errors), `npm test` (39 passed, 29 skipped, 0 failed, including `health.transport.test.js` against the real composed app), uncommitted supertest probe of the real `app.js` confirming graceful 500/401/404 behavior without a live database
- **Committed in:** `755144cc`

**3. [Rule 3 - Blocking, self-corrected] Controller-naming allowlist initially placed in `backend/`**
- **Found during:** Checkpoint review — flagged by the coordinator as crossing the phase's apps/dgfy-api-only scope boundary
- **Issue:** `check-architecture-guardrails.js` enforces a `*Handlers.js` controller-file-naming convention even when run against `apps/dgfy-api/src/modules` (via `check:architecture:dgfy-api`), and this plan's locked file names (`accountController.js`/`businessController.js`) don't follow it. The initial fix added an allowlist entry to `backend/src/config/architectureGuardrailsAllowlist.js`, which violates the explicit apps/dgfy-api-only scope boundary for this phase.
- **Fix:** Reverted `backend/src/config/architectureGuardrailsAllowlist.js` to its exact original content; added the two entries instead to a new `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`, loaded via `check-architecture-guardrails.js`'s existing `ARCH_GUARDRAIL_ALLOWLIST_PATH` env override, updated in root `package.json`'s `check:architecture:dgfy-api` script (root tooling, not backend/ or frontend/ code).
- **Files modified:** `backend/src/config/architectureGuardrailsAllowlist.js` (reverted), `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` (new), `package.json` (root)
- **Verification:** `npm run check:architecture:dgfy-api` still reports OK with 0 violations (identical result); `git diff` and `git status` confirm `backend/` and `frontend/` are byte-identical to before this plan across all 5 commits
- **Committed in:** `c05619e0`

---

**Total deviations:** 3 auto-fixed (2 missing-critical additions, 1 self-corrected blocking scope violation)
**Impact on plan:** All three were necessary for the plan's stated objective (a genuinely working, correctly-scoped HTTP layer) or for staying within the phase's confirmed apps/dgfy-api-only boundary. No scope creep beyond what Wave 2 already needed to deliver.

## Issues Encountered

- No MySQL server was reachable in this execution environment (same as Wave 1). `accountRoutes.test.js`'s 18 tests are complete and gated behind `RUN_ACCOUNT_ROUTES_INTEGRATION=true`, following the established Wave 1/migration-runner precedent — they skip cleanly rather than fail. End-to-end behavior was independently verified via an uncommitted supertest smoke test against an in-memory fake repository (all 18 flow assertions passed) before every commit.
- `config/db.js` is a single shared Sequelize connection also used by the out-of-scope `dgfyAuth` module's legacy models. Changing its default to `dgfy_core` is inert in the actual deployed environment (`infrastructure/docker/.env` sets `DB_NAME=sku_inventory_manager` explicitly), but in any environment where `DB_NAME` is left unset, `dgfyAuth`'s legacy queries would now target the wrong database. This was flagged to and accepted by the user; `dgfyAuth` is already slated for Phase 5 removal.

## User Setup Required

None - no external service configuration required for this plan. (Running the gated integration test locally requires a disposable MySQL instance and `RUN_ACCOUNT_ROUTES_INTEGRATION=true` — a developer/CI convenience flag, not a setup requirement for the plan itself. Optionally set `ACCOUNT_ADMIN_EMAILS` — comma-separated — to grant admin lookup access to specific accounts.)

## Known Stubs

- `apps/dgfy-api/src/modules/businesses/routes.js` and `controllers/businessController.js` are intentional empty stubs (return an empty router / empty controller object) — explicitly scoped this way by the plan ("Stub files with empty exports... Will be filled in Wave 3"). `GET /v1/businesses` currently 404s (no routes registered). Resolved by Wave 3 (`04-03-PLAN.md`).

## Next Phase Readiness

- Account endpoints are live, tested (unit-level via Wave 1 + gated HTTP integration suite), and mounted in the real app — Wave 3 can build directly on the same `routes/index.js` composition pattern for the businesses module.
- `businesses/` module skeleton (routes/controller/index.js/README) is ready for Wave 3 to fill in with real entity/repository/use-case layers.
- Blocker/concern carried forward: the `accountRoutes.test.js` integration suite (18 tests) and the `AccountRepository` suite from Wave 1 (11 tests) both need a real MySQL run (local disposable instance, `RUN_ACCOUNT_ROUTES_INTEGRATION=true` / `RUN_ACCOUNT_REPOSITORY_INTEGRATION=true`) before Wave 2's DB-durability claims are independently confirmed — recommended before or during Wave 5's comprehensive test pass.
- API-05 (Clean Architecture pattern compliance) remains Pending in REQUIREMENTS.md by design — it spans accounts/businesses/tenancy and will be marked complete once all three modules' real layers land.

---
*Phase: 04-backend-accounts-businesses-and-tenancy-foundation*
*Completed: 2026-07-11*

## Self-Check: PASSED

All 13 created/modified files under `apps/dgfy-api/` and root `package.json` verified present on disk; all 5 commit hashes (`b419ecbc`, `5296d4d8`, `2ca1f836`, `c05619e0`, `755144cc`) verified present in `git log`.
