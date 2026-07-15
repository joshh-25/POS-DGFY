---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
plan: 01
subsystem: api
tags: [sequelize, clean-architecture, solid, accounts, jwt, bcrypt, dgfy-core]

# Dependency graph
requires:
  - phase: 02-dgfy-database-foundation
    provides: dgfyCoreContract.js accounts table shape (id, first_name, last_name, email, phone, password_hash, status, email_verified_at, phone_verified_at, last_login_at, unique_accounts_email/phone)
provides:
  - "Account Sequelize persistence model (apps/dgfy-api/src/models/Landlord/Account.js) matching dgfy_core.accounts exactly"
  - "AccountEntity domain model with email format + password strength validators (apps/dgfy-api/src/modules/accounts/entities/accountEntity.js)"
  - "AccountRepository Model<->Entity translation adapter (apps/dgfy-api/src/modules/accounts/repositories/accountRepository.js)"
  - "Registration/login/profile-update/lookup/authorized-lookup use cases returning ApplicationResult (apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js)"
  - "buildAccountsModule() dependency-injection wiring point (apps/dgfy-api/src/modules/accounts/index.js) ready for Wave 2 to consume"
  - "Shared ApplicationResult/DomainError contracts for apps/dgfy-api (apps/dgfy-api/src/shared/contracts/)"
affects: [04-02-account-business-routes-controllers, 04-03-business-foundation, 04-04-tenant-session-context-binding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clean Architecture Entity layer separate from Sequelize persistence model (accountEntity.js vs Account.js)"
    - "Repository-as-adapter translating Model<->Entity at every boundary (accountRepository.js)"
    - "Use case builder functions receiving dependencies via closure (buildXUseCase({repository, ...}))"
    - "Module index.js as the single dependency-injection wiring point (buildAccountsModule())"
    - "Real-MySQL integration tests gated behind an opt-in env flag, skipping cleanly without a DB (mirrors apps/dgfy-migration-runner/tests/phase02Integration.test.js)"

key-files:
  created:
    - apps/dgfy-api/src/models/Landlord/Account.js
    - apps/dgfy-api/src/modules/accounts/entities/accountEntity.js
    - apps/dgfy-api/src/modules/accounts/repositories/accountRepository.js
    - apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js
    - apps/dgfy-api/src/modules/accounts/index.js
    - apps/dgfy-api/src/modules/accounts/README.md
    - apps/dgfy-api/src/shared/contracts/applicationResult.js
    - apps/dgfy-api/src/shared/contracts/domainErrors.js
    - apps/dgfy-api/tests/unit/modules/accounts/accountUseCases.test.js
    - apps/dgfy-api/tests/integration/accounts/accountRepository.test.js
  modified: []

key-decisions:
  - "Created apps/dgfy-api/src/shared/contracts/{applicationResult,domainErrors}.js now (not in Wave 1's file list) because 04-02-PLAN.md already imports controllers from this exact location and accountUseCases.js cannot return ApplicationResult without it existing"
  - "ApplicationResult is a class (success()/failure() statics, .isSuccess, .toJSON()) rather than the dgfyAuth module's plain ok()/fail() functions, to match Wave 2's controller pseudocode (result.isSuccess, result.toJSON())"
  - "Session token generation uses a distinct JWT token_scope ('dgfy_account_session') from dgfyAuth's ('dgfy') so the two modules' sessions are never confused, without touching the out-of-scope dgfyAuth module"
  - "Login use case returns businesses: [] always in Wave 1 (no BusinessMembership model exists yet); Wave 3 will populate real memberships per D-05"
  - "Did NOT run requirements mark-complete for API-01 — the master plan's traceability table (04-PLAN.md) assigns API-01 to both Wave 1 (04-01) and Wave 2 (04-02); REQUIREMENTS.md's own wording ('Backend exposes Accounts APIs') requires the HTTP layer that Wave 2 delivers, so marking it complete after Wave 1 alone would be inaccurate"

patterns-established:
  - "Account.associate(models) static hook on the Sequelize model, safely deferred until BusinessMembership exists (Wave 3), instead of a premature hard association"
  - "Repository entityToModel(entity, {partial}) filters to only hasOwnProperty keys in partial mode, so repository.update() never clobbers unspecified fields"

requirements-completed: []  # API-01 intentionally NOT marked complete yet — see key-decisions

coverage:
  - id: D1
    description: "Account Sequelize model maps every column/index in dgfyCoreContract.accounts, no business logic"
    requirement: "API-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api eslint (src) — 0 errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "AccountEntity domain model with email format + password strength validators, isVerified()/isActive()"
    requirement: "API-01"
    verification:
      - kind: unit
        ref: "tests/unit/modules/accounts/accountUseCases.test.js (exercises validators via mocked AccountEntity)"
        status: pass
    human_judgment: false
  - id: D3
    description: "AccountRepository translates Sequelize Account model <-> AccountEntity for create/findById/findByEmail/findByPhone/update"
    requirement: "API-01"
    verification:
      - kind: integration
        ref: "tests/integration/accounts/accountRepository.test.js (gated behind RUN_ACCOUNT_REPOSITORY_INTEGRATION=true)"
        status: unknown
    human_judgment: true
    rationale: "No MySQL server was available in this execution environment; the integration suite is written and gated per the established Phase 2/3 precedent (phase02Integration.test.js), but was never run against a real database. Needs human UAT against a local disposable MySQL instance, same as the accepted Phase 2 precedent (see PROJECT.md Phase 2 completion note)."
  - id: D4
    description: "Registration use case creates unverified accounts (D-01); login validates credentials and returns a session token + business list; profile update enforces email/phone uniqueness; lookup enforces self-or-admin access (D-04)"
    requirement: "API-01"
    verification:
      - kind: unit
        ref: "tests/unit/modules/accounts/accountUseCases.test.js (19 tests, all use case builders)"
        status: pass
    human_judgment: false

# Metrics
duration: 30min
completed: 2026-07-11
status: complete
---

# Phase 4 Plan 1: Account Foundation Summary

**Clean Architecture Account domain for dgfy_core.accounts — Sequelize model, entity, repository, and use cases (registration/login/profile/lookup) returning a class-based ApplicationResult envelope, with 19 passing unit tests and a gated real-MySQL integration suite.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 6 completed
- **Files modified:** 10 created (8 source, 2 test)

## Accomplishments

- `Account.js` Sequelize model mapping every column, unique index, and constraint from `dgfyCoreContract.accounts` exactly, with no business logic
- `accountEntity.js` domain model with `validateEmailFormat`/`validatePasswordStrength` static validators and `isVerified()`/`isActive()` instance queries
- `accountRepository.js` adapter owning all Sequelize queries and Model<->Entity translation (create, findById, findByEmail, findByPhone, partial-safe update)
- `accountUseCases.js` with five dependency-injected use case builders — register, login, update profile, get, and get-with-authorization — all returning `ApplicationResult`, failures as `DomainError`
- `accounts/index.js` `buildAccountsModule()` as the single DI wiring point, ready for Wave 2's routes/controllers
- 19 unit tests (mocked repository/entity/bcrypt) covering success, duplicate email/phone, validation, wrong password, partial updates, and self/admin authorization — 87.6% line coverage on `accountUseCases.js`
- 11 real-MySQL integration tests for `AccountRepository`, gated behind `RUN_ACCOUNT_REPOSITORY_INTEGRATION=true` per the project's established Phase 2/3 precedent

## Task Commits

Each task was committed atomically:

1. **Task 1: Create DgfyAccount Sequelize Model — Account.js** - `04c25bbf` (feat)
2. **Task 2: Create AccountEntity Domain Model — accountEntity.js** - `46d04e06` (feat) — also adds `accounts/index.js` and `accounts/README.md` (deviation, see below)
3. **Task 3: Create AccountRepository Data Access Adapter — accountRepository.js** - `ab95ebeb` (feat)
4. **Task 4: Create Account Use Cases — accountUseCases.js** - `79583a59` (feat) — also adds `shared/contracts/{applicationResult,domainErrors}.js` (deviation, see below)
5. **Task 5: Unit Tests for Account Use Cases — accountUseCases.test.js** - `d710eb00` (test)
6. **Task 6: Integration Tests for AccountRepository — accountRepository.test.js** - `24838644` (test)

_No separate plan-metadata commit; this SUMMARY + STATE/ROADMAP updates are committed as the final `docs(04-01)` commit below._

## Files Created/Modified

- `apps/dgfy-api/src/models/Landlord/Account.js` — Sequelize persistence model for `dgfy_core.accounts`
- `apps/dgfy-api/src/modules/accounts/entities/accountEntity.js` — domain entity with business-rule validators
- `apps/dgfy-api/src/modules/accounts/repositories/accountRepository.js` — Model<->Entity data access adapter
- `apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js` — registration/login/profile/lookup use cases
- `apps/dgfy-api/src/modules/accounts/index.js` — DI wiring point (`buildAccountsModule()`)
- `apps/dgfy-api/src/modules/accounts/README.md` — module overview, relationship to `dgfyAuth`
- `apps/dgfy-api/src/shared/contracts/applicationResult.js` — shared `ApplicationResult` envelope (class-based)
- `apps/dgfy-api/src/shared/contracts/domainErrors.js` — shared `DomainError`/`DomainErrorCode`
- `apps/dgfy-api/tests/unit/modules/accounts/accountUseCases.test.js` — 19 unit tests
- `apps/dgfy-api/tests/integration/accounts/accountRepository.test.js` — 11 gated real-MySQL integration tests

## Decisions Made

- **Class-based `ApplicationResult`** (not the existing `dgfyAuth`-local plain `ok()/fail()` functions) — Wave 2's already-locked controller pseudocode (`04-02-PLAN.md`) reads `result.isSuccess` and calls `result.toJSON()`, so the shared contract needed to support that API. Kept `ok()`/`fail()` as thin static wrappers for parity with the existing convention.
- **`businesses: []` always in the login response for Wave 1** — no `BusinessMembership` model exists yet; this is explicitly correct per the master plan's Wave 3 dependency, not a gap.
- **Distinct JWT `token_scope`** (`dgfy_account_session` vs. `dgfyAuth`'s `dgfy`) so this module's sessions can never be confused with the out-of-scope legacy proxy module's tokens, while both safely share `JWT_SECRET`.
- **Did not mark API-01 complete** — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `apps/dgfy-api/src/shared/contracts/{applicationResult,domainErrors}.js`**
- **Found during:** Task 4 (accountUseCases.js)
- **Issue:** The plan's `accountUseCases.js` task requires returning `ApplicationResult` envelopes and `DomainError` failures, but no shared contract existed yet in `apps/dgfy-api`. The only existing copies live under the out-of-scope `dgfyAuth` module (a different, plain-object `ok()/fail()` shape) — importing from there would create an unwanted coupling to legacy-proxy code. `04-02-PLAN.md` (Wave 2, already locked) explicitly imports controllers from `apps/dgfy-api/src/shared/contracts/applicationResult.js` and `apps/dgfy-api/src/shared/controllers/useCaseResponder.js`, confirming this is the intended shared location.
- **Fix:** Created `apps/dgfy-api/src/shared/contracts/applicationResult.js` (class with `.success()`/`.failure()` statics, `.isSuccess`, `.toJSON()`) and `domainErrors.js` (mirrors the existing `DomainError`/`DomainErrorCode`/`resolveDomainErrorStatus` pattern used elsewhere in the codebase).
- **Files modified:** `apps/dgfy-api/src/shared/contracts/applicationResult.js`, `apps/dgfy-api/src/shared/contracts/domainErrors.js`
- **Verification:** `npm run lint` (0 errors); exercised indirectly by all 19 unit tests in Task 5
- **Committed in:** `79583a59` (Task 4 commit)

**2. [Rule 3 - Blocking] Added `accounts/index.js` and `accounts/README.md` to satisfy the repo's architecture guardrail pre-commit hook**
- **Found during:** Task 2 (accountEntity.js) commit attempt
- **Issue:** `backend/scripts/check-architecture-guardrails.js` (run by husky pre-commit for any `apps/dgfy-api` module change) requires every `apps/dgfy-api/src/modules/<name>/` directory to have `index.js`, `README.md`, and at least one of `controllers/usecases/repositories`. The plan's own file list for this Wave doesn't include these (Wave 2's `04-02-PLAN.md` is where `index.js` is officially scoped), so the very first commit touching the new `accounts/` module directory was blocked.
- **Fix:** Added a minimal `index.js` (exporting the entity layer only, forward-compatible) and a `README.md` describing the module and its Clean Architecture layout; `index.js` was then incrementally expanded in the Task 3 and Task 4 commits as the repository and use cases landed, culminating in `buildAccountsModule()`.
- **Files modified:** `apps/dgfy-api/src/modules/accounts/index.js`, `apps/dgfy-api/src/modules/accounts/README.md`
- **Verification:** `check:architecture:dgfy-api` and `check:controller-boundaries` both passed on every subsequent commit
- **Committed in:** `46d04e06` (Task 2 commit), expanded in `ab95ebeb` and `79583a59`

---

**Total deviations:** 2 auto-fixed (1 missing critical functionality, 1 blocking pre-commit guardrail)
**Impact on plan:** Both were necessary prerequisites — accountUseCases.js literally cannot exist without the ApplicationResult contract, and no commit in this module could land without satisfying the repo's own guardrail hook. No scope creep beyond what Wave 2 already planned to build in the same locations.

## Issues Encountered

- No MySQL server was reachable in this execution environment (no Docker, no local MySQL client). Task 6's integration test suite is complete and follows the exact gating pattern already accepted in this codebase (`apps/dgfy-migration-runner/tests/phase02Integration.test.js`/`phase03Integration.test.js`) — it skips cleanly (`Tests: 11 skipped`) rather than failing when `RUN_ACCOUNT_REPOSITORY_INTEGRATION` isn't set to `true`. It has not yet been run against a real database; see `coverage: D3` above.

## User Setup Required

None - no external service configuration required for this plan. (Running the gated integration test locally requires a disposable MySQL instance and `RUN_ACCOUNT_REPOSITORY_INTEGRATION=true` — this is a developer/CI convenience flag, not a setup requirement for the plan itself.)

## Next Phase Readiness

- Wave 2 (`04-02-PLAN.md`) can now build `routes.js`/`controllers/accountController.js` directly against `buildAccountsModule()`'s exported use cases (`registerAccount`, `loginAccount`, `updateAccountProfile`, `getAccount`, `getAccountForAuthorization`) and the shared `ApplicationResult`/`DomainError`/`useCaseResponder` contracts.
- `apps/dgfy-api/src/shared/contracts/` is now available for Wave 2 and beyond — no further foundational contract work needed.
- Blocker/concern carried forward: the `AccountRepository` integration suite needs a real MySQL run (local disposable instance) before Wave 1's DB-durability claims are independently confirmed — recommended before or during Wave 5's comprehensive test pass.
- API-01 remains `Pending` in REQUIREMENTS.md by design; it will be marked complete once Wave 2 lands the HTTP layer.

---
*Phase: 04-backend-accounts-businesses-and-tenancy-foundation*
*Completed: 2026-07-11*

## Self-Check: PASSED

All 10 created files verified present on disk; all 6 task commit hashes (`04c25bbf`, `46d04e06`, `ab95ebeb`, `79583a59`, `d710eb00`, `24838644`) verified present in `git log`.
