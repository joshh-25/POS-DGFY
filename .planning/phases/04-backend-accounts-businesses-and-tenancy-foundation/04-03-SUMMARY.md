---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
plan: 03
subsystem: api
tags: [sequelize, clean-architecture, solid, businesses, tenancy-adjacent, dgfy-core]

# Dependency graph
requires:
  - phase: 04-backend-accounts-businesses-and-tenancy-foundation
    provides: "Wave 1 (04-01): Account Sequelize model, shared ApplicationResult/DomainError contracts. Wave 2 (04-02): sendUseCaseResult response formatter, accounts HTTP layer, businesses/ module scaffold (empty stubs), routes/index.js composition root, config/db.js pointed at dgfy_core"
provides:
  - "Business/BusinessMembership Sequelize persistence models (apps/dgfy-api/src/models/Landlord/{Business,BusinessMembership}.js) matching the real dgfy_core migration schema exactly"
  - "BusinessRepository with transaction-safe auto-owner-assignment (apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js), D-10"
  - "Business use cases: create/list/get/update, staff onboarding (invitation + direct-add, D-11), accept invitation, list members (apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js) — all returning ApplicationResult"
  - "HTTP transport: POST/GET /businesses, GET/PATCH /businesses/:id, POST/GET /businesses/:id/staff, POST /invitations/:token/accept — all mounted live at /v1/*"
  - "buildBusinessesModule() DI wiring point (apps/dgfy-api/src/modules/businesses/index.js), mirroring buildAccountsModule()"
  - "Login use case (accounts) now returns the account's real business list with D-05 auto-binding, via an injected businessRepository shared from routes/index.js"
affects: [04-03.5-branch-location-management, 04-04-tenant-session-context-binding, 04-05-comprehensive-integration-tests]

# Tech tracking
tech-stack:
  added: [nodemailer (already a dependency; new generic sendEmail adapter for invitations)]
  patterns:
    - "Repository-owned in-memory temporary storage (Map/array) for a domain concept (staff onboarding) whose real persistence layer (dgfy_business_* tenant DB) doesn't exist yet — explicitly sanctioned by the plan itself as a bridging strategy, swappable via constructor injection"
    - "requireMembership(repository, businessId, accountId, {role}) shared access-control helper inside the use-case layer, applied only when requestingAccountId is supplied by the HTTP layer — mirrors Wave 1's buildGetAccountForAuthorizationUseCase self-or-admin pattern but generalized to membership/role checks"
    - "buildXModule({...deps}) returns {repository, useCases} so a composition root can share ONE repository instance across two modules (accounts' login use case needs businesses' repository) instead of each module constructing its own"
    - "Model definitions verified against the real migration file (apps/dgfy-migration-runner/.../20260710020000-create-dgfy-core-foundation.cjs), not the plan's simplified prose, when the two disagree on enum values/column types"

key-files:
  created:
    - apps/dgfy-api/src/models/Landlord/Business.js
    - apps/dgfy-api/src/models/Landlord/BusinessMembership.js
    - apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js
    - apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js
    - apps/dgfy-api/src/modules/businesses/infra/sendInvitationEmail.js
    - apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js
    - apps/dgfy-api/tests/integration/businesses/businessRepository.test.js
    - apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js
  modified:
    - apps/dgfy-api/src/modules/businesses/controllers/businessController.js
    - apps/dgfy-api/src/modules/businesses/routes.js
    - apps/dgfy-api/src/modules/businesses/index.js
    - apps/dgfy-api/src/modules/businesses/README.md
    - apps/dgfy-api/src/routes/index.js
    - apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js
    - apps/dgfy-api/src/modules/accounts/index.js

key-decisions:
  - "Model enum values corrected to match the actual migration schema (apps/dgfy-migration-runner's create-dgfy-core-foundation.cjs), not 04-03-PLAN.md's simplified Task 1 prose: businesses.status is pending|active|suspended|archived (not active|suspended); business_memberships.id is an auto-increment INTEGER (not UUID); business_memberships.role is owner|manager|member (not owner|manager|staff); business_memberships.status is active|invited|removed (not active|suspended)"
  - "New businesses are explicitly created with status: 'active' in BusinessRepository.create() (overriding the model's DB-default 'pending'), so a newly created business is immediately usable by its owner"
  - "Staff onboarding (invitations, staff accounts, accepted assignments) uses in-memory Map/array storage inside BusinessRepository rather than a new dgfy_core table — the plan's own Task 3 text explicitly sanctions 'temporary storage' as an alternative to a new invitations table, and real persistence depends on Wave 4's tenant DB infrastructure (04-04-PLAN.md) which does not exist yet. Reviewed and explicitly accepted by the user at the checkpoint."
  - "POST /invitations/:token/accept is served by a separate createInvitationRoutes() mounted at the top-level /invitations path (not /businesses/invitations/...), matching the plan's literal endpoint list"
  - "buildAccountsModule() accepts businessRepository as an OPTIONAL injected dependency (not a direct import of businesses/repositories/businessRepository.js) so the accounts module never depends on businesses' internals; routes/index.js builds the businesses module first and shares its one BusinessRepository instance into accounts' login use case"
  - "Did NOT run requirements mark-complete for API-02 or API-05 — 04-PLAN.md's traceability table splits API-02 across Wave 3 (business creation/ownership/staff, this plan) and Wave 3.5 (branch registry basics, 04-03.5-PLAN.md); REQUIREMENTS.md's own wording for API-02 includes 'branch registry basics', which this plan does not deliver. API-05 is tracked '1-5 | all' (phase-wide Clean Architecture pattern requirement) per 04-PLAN.md, consistent with Wave 1/2's precedent of leaving it Pending until all Phase 4 modules land"

patterns-established:
  - "BusinessRepository.toPlainBusiness()/toPlainMembership() Model<->plain-object translation (no dedicated Entity class, unlike accounts) since this plan's task list didn't require one — kept simple and consistent with the repository's own return contract"
  - "findAccountBusinesses() resolves via an explicit id-list query (findAll + Op.in) rather than a Sequelize association include, so it works correctly regardless of whether Business.associate()/BusinessMembership.associate() are ever invoked by the composition root"

requirements-completed: []  # API-02/API-05 intentionally NOT marked complete yet — see key-decisions

coverage:
  - id: D1
    description: "Business and BusinessMembership Sequelize models matching the real dgfy_core migration schema (columns, enum values, named indexes, FKs) exactly"
    requirement: "API-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api eslint (src) — 0 errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "BusinessRepository.create() inserts a business and an 'owner' BusinessMembership inside one transaction (D-10); findById/findByHandle/findAccountBusinesses/update/createMembership/getMembership/listMembers/findMemberByRole implemented"
    requirement: "API-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/businesses/businessUseCases.test.js (exercises the repository contract via a mocked repository across 25 tests)"
        status: pass
      - kind: integration
        ref: "tests/integration/businesses/businessRepository.test.js (gated behind RUN_BUSINESS_REPOSITORY_INTEGRATION=true)"
        status: unknown
    human_judgment: true
    rationale: "No MySQL server was reachable in this execution environment; the integration suite is written and gated per the established Phase 4 Wave 1/2 precedent, but was never run against a real database. Needs human UAT against a local disposable MySQL instance."
  - id: D3
    description: "Business use cases (create/list/get/update, onboard-staff-via-invitation, onboard-staff-direct, accept-invitation, list-members) all return ApplicationResult; membership/owner-role access control enforced via requireMembership() when requestingAccountId is supplied"
    requirement: "API-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/businesses/businessUseCases.test.js (25 tests, 87.34% statement coverage on businessUseCases.js)"
        status: pass
    human_judgment: false
  - id: D4
    description: "HTTP endpoints (POST/GET /businesses, GET/PATCH /businesses/:id, POST/GET /businesses/:id/staff, POST /invitations/:token/accept) implemented as dependency-injected, transport-only controllers using sendUseCaseResult, mounted live at /v1/*"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js (18 tests, gated behind RUN_BUSINESS_ROUTES_INTEGRATION=true)"
        status: unknown
    human_judgment: true
    rationale: "The committed integration suite skips cleanly (no MySQL server reachable in this sandbox), matching the established Wave 1/2 precedent. A human should run it (RUN_BUSINESS_ROUTES_INTEGRATION=true) to independently confirm the real-DB path, including D-10 auto-owner-assignment end-to-end and access-control status codes (403/409)."
  - id: D5
    description: "Login use case (accounts module) returns the account's real business list after credential validation, auto-binding active_business_id when there is exactly one business (D-05)"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js 'GET /accounts login -> businesses list (D-05)' (gated, same as D4)"
        status: unknown
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/accounts/accountUseCases.test.js 'logs in with valid credentials and returns a token + empty businesses list' (confirms backward-compatible [] behavior when businessRepository is omitted)"
        status: pass
    human_judgment: true
    rationale: "The real-DB, businessRepository-wired login path is only exercised by the gated integration suite (D4's rationale applies identically); the unit suite only proves the omitted-dependency fallback path."
  - id: D6
    description: "Clean Architecture boundaries enforced: businesses controllers/use cases never import models directly; module structure (index.js/README.md/a layer dir) satisfies the repo's architecture guardrail"
    requirement: "API-05"
    verification:
      - kind: other
        ref: "npm run check:architecture:dgfy-api (check-architecture-guardrails.js + check-controller-boundaries.js) — passed on every commit"
        status: pass
      - kind: other
        ref: "cd apps/dgfy-api && npm run lint (eslint no-restricted-imports on controllers) — 0 errors on every commit"
        status: pass
    human_judgment: false

# Metrics
duration: 30min
completed: 2026-07-11
status: complete
---

# Phase 4 Plan 3: Business Foundation Summary

**Business creation/ownership/staff-onboarding domain — Business/BusinessMembership Sequelize models matched against the real dgfy_core migration schema, transaction-safe auto-owner-assignment (D-10), invitation/direct-add staff onboarding (D-11) backed by in-memory temporary storage, HTTP endpoints mounted live at /v1/businesses and /v1/invitations, and login now returning the account's real business list (D-05).**

## Performance

- **Duration:** ~30 min (task-commit span, plus a checkpoint round-trip for human verification)
- **Tasks:** 8 auto tasks completed + 1 checkpoint (human-verify, approved)
- **Files modified:** 15 (8 created, 7 modified)

## Accomplishments

- `Business.js`/`BusinessMembership.js` Sequelize models mapping every column, enum value, and named index from the *actual* dgfy_core migration (not the plan's simplified prose — see Deviations), with no business logic
- `businessRepository.js` — `create()` wraps a business insert + owner-membership insert in one transaction (D-10); `findById`/`findByHandle` (case-insensitive)/`findAccountBusinesses`/`update`/`createMembership`/`getMembership`/`listMembers`/`findMemberByRole`, plus in-memory staff-onboarding stores (invitations, staff accounts, assignments)
- `businessUseCases.js` — eight dependency-injected use case builders (create/list/get/update/onboard-via-invitation/onboard-direct/accept-invitation/list-members), all returning `ApplicationResult`; a shared `requireMembership()` helper enforces membership/owner-role access control
- `businessController.js`/`routes.js` — `POST/GET /businesses`, `GET/PATCH /businesses/:id`, `POST/GET /businesses/:id/staff`, and a separately-mounted `POST /invitations/:token/accept` (unauthenticated — the invitee has no session yet), all using `sendUseCaseResult`
- `businesses/index.js` `buildBusinessesModule()` DI wiring point, exposing its repository instance so `routes/index.js` can share it with the accounts module
- `infra/sendInvitationEmail.js` — generic `{to,subject,text,html}` SMTP sender with graceful degradation, matching the codebase's established email-notification convention
- `accountUseCases.js`'s `buildLoginAccountUseCase` now accepts an optional `businessRepository`, fetches the real membership list post-credential-validation, and auto-binds `active_business_id` when there's exactly one business (D-05)
- `routes/index.js` builds `Business`/`BusinessMembership` models and mounts `/businesses` and `/invitations` into the real app
- 25 unit tests (mocked repository) covering all 8 use cases including access-control rejections — 87.34% statement coverage on `businessUseCases.js`
- 18 + 13 real-MySQL integration tests for `BusinessRepository` and the HTTP routes, gated behind `RUN_BUSINESS_REPOSITORY_INTEGRATION`/`RUN_BUSINESS_ROUTES_INTEGRATION`, per the established Phase 4 precedent

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Business Models** - `04b56707` (feat)
2. **Task 2: Create BusinessRepository** - `5d3abc1b` (feat)
3. **Task 3: Create Business Use Cases** - `981c44cc` (feat)
4. **Task 4: Business Routes & Controllers** - `bdd1ddfb` (feat)
5. **Task 5: Update Module Index & Wire Dependencies** - `e07c37b4` (feat) — also adds `infra/sendInvitationEmail.js` and mounts `/businesses`+`/invitations` into `routes/index.js` (deviation, see below)
6. **Task 6: Unit Tests for Business Use Cases** - `088714c5` (test)
7. **Task 7: Integration Tests for Business Repository & Routes** - `9fad08dc` (test)
8. **Task 8: Update Login Use Case & Accounts Index** - `1b7b18fd` (feat)

_Checkpoint (human-verify, gate="blocking") was reached after Task 8, reviewed, and approved by the user, including explicit sign-off on the in-memory invitation storage and the invitation-token-in-response detail._

**Plan metadata:** *(this commit — recorded below)*

## Files Created/Modified

- `apps/dgfy-api/src/models/Landlord/Business.js` — Sequelize persistence model for `dgfy_core.businesses`
- `apps/dgfy-api/src/models/Landlord/BusinessMembership.js` — Sequelize persistence model for `dgfy_core.business_memberships`
- `apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js` — data access adapter + in-memory staff-onboarding stores
- `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js` — 8 use case builders
- `apps/dgfy-api/src/modules/businesses/controllers/businessController.js` — transport-only controller
- `apps/dgfy-api/src/modules/businesses/routes.js` — `createBusinessRoutes()` + `createInvitationRoutes()`
- `apps/dgfy-api/src/modules/businesses/index.js` — `buildBusinessesModule()` DI wiring point
- `apps/dgfy-api/src/modules/businesses/infra/sendInvitationEmail.js` — generic SMTP sender
- `apps/dgfy-api/src/modules/businesses/README.md` — module overview, endpoint list, known limitation
- `apps/dgfy-api/src/routes/index.js` — mounts `/businesses`/`/invitations`, shares `businessRepository` into accounts
- `apps/dgfy-api/src/modules/accounts/usecases/accountUseCases.js` — login use case D-05 wiring
- `apps/dgfy-api/src/modules/accounts/index.js` — `buildAccountsModule({businessRepository})`
- `apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js` — 25 unit tests
- `apps/dgfy-api/tests/integration/businesses/businessRepository.test.js` — 13 gated real-MySQL integration tests
- `apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js` — 18 gated real-MySQL HTTP integration tests

## Decisions Made

- **Model enum/column types corrected to the real migration schema** — `businesses.status` is `pending|active|suspended|archived`; `business_memberships.id` is an auto-increment `INTEGER`; `role` is `owner|manager|member`; `status` is `active|invited|removed`. New businesses are still explicitly created `status: 'active'` so they're immediately usable.
- **Staff onboarding uses in-memory temporary storage** inside `BusinessRepository` (not a new `dgfy_core` table) — explicitly sanctioned by the plan's own text ("temporary storage" / "Wave 4 concern") and confirmed accepted by the user at the checkpoint as a known Wave 4 dependency.
- **`POST /invitations/:token/accept` mounted at the top-level `/invitations` path** via a separate `createInvitationRoutes()`, matching the plan's literal endpoint list rather than nesting under `/businesses`.
- **`businessRepository` is dependency-injected into `buildAccountsModule()`**, not imported as a module-level singleton from `businesses/repositories/businessRepository.js` — avoids coupling the accounts module to businesses' internals and ensures both modules share the exact same repository instance (and its in-memory stores).
- **Did not mark API-02/API-05 complete** — see Deviations below and the `requirements-completed` frontmatter rationale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Business/BusinessMembership model enum values and business_memberships.id type to match the real migration**
- **Found during:** Task 1 (Business.js/BusinessMembership.js)
- **Issue:** 04-03-PLAN.md's Task 1 prose describes `businesses.status` as `enum('active','suspended')` and `business_memberships` as `{id (UUID), role: enum('owner','manager','staff'), status: enum('active','suspended')}`. The actual, already-applied Phase 2 migration (`apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs`) defines `businesses.status` as `enum('pending','active','suspended','archived')` and `business_memberships` as `{id: INTEGER autoincrement, role: enum('owner','manager','member'), status: enum('active','invited','removed')}`. Building the model against the plan's prose instead of the real schema would have produced a model that fails to `sync()`/insert against the real `dgfy_core` database.
- **Fix:** Modeled both tables exactly against the real migration file's column/enum/index definitions.
- **Files modified:** `apps/dgfy-api/src/models/Landlord/Business.js`, `apps/dgfy-api/src/models/Landlord/BusinessMembership.js`
- **Verification:** `npm run lint` (0 errors); exercised indirectly by all 25 unit tests and the (gated, unrun) integration suites
- **Committed in:** `04b56707` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Created `businesses/infra/sendInvitationEmail.js`**
- **Found during:** Task 5 (module wiring)
- **Issue:** The plan's Task 5 pseudocode imports `sendEmail` from `../../services/emailService.js`, but no such generic sender exists — `apps/dgfy-api/src/infra/emailService.js` only sends a fixed-shape OTP email, which cannot be reused for an arbitrary `{to, subject, text, html}` invitation message.
- **Fix:** Created a narrow, purpose-built `sendEmail({to, subject, text, html})` adapter reusing the same SMTP_*/nodemailer convention and graceful-degradation behavior as `infra/emailService.js` and the codebase's documented email-notification pattern (CLAUDE.md).
- **Files modified:** `apps/dgfy-api/src/modules/businesses/infra/sendInvitationEmail.js`
- **Verification:** `npm run lint` (0 errors); exercised by 3 unit tests in `businessUseCases.test.js`'s `buildOnboardStaffViaInvitationUseCase` suite (via a mocked `sendEmail`)
- **Committed in:** `e07c37b4` (Task 5 commit)

**3. [Rule 2 - Missing Critical] Mounted `/businesses` and `/invitations` into the real app + shared `businessRepository` into accounts**
- **Found during:** Task 5 (module wiring)
- **Issue:** Without mounting the new routers into `routes/index.js`, Wave 3's HTTP endpoints would stay dead code (mirrors Wave 2's own identical deviation for the accounts HTTP layer). Task 8's D-05 login wiring additionally requires ONE shared `BusinessRepository` instance to be available to both the businesses routes and the accounts login use case.
- **Fix:** `routes/index.js` now builds `Business`/`BusinessMembership` Sequelize models, calls `buildBusinessesModule()` first, and passes its `repository` into `buildAccountsModule({..., businessRepository})` before mounting `/accounts`, `/businesses`, and `/invitations`.
- **Files modified:** `apps/dgfy-api/src/routes/index.js`
- **Verification:** `npm run lint` (0 errors); `npm test` (64 passed, 51 skipped, 0 failed)
- **Committed in:** `e07c37b4` (Task 5 commit)

---

**Total deviations:** 3 auto-fixed (1 bug fix to match the real DB schema, 2 missing-critical additions)
**Impact on plan:** All three were necessary for correctness (models must match the real, already-applied migration) or for the plan's stated objective to actually work end-to-end (a business API that's live and returns real login business lists). No scope creep beyond what this wave already needed to deliver. The in-memory staff-onboarding storage was explicitly reviewed and accepted by the user at the checkpoint, not auto-fixed unilaterally.

## Issues Encountered

- No MySQL server was reachable in this execution environment (same as Waves 1-2). `businessRepository.test.js` (13 tests) and `businessRoutes.test.js` (18 tests) are complete and gated behind `RUN_BUSINESS_REPOSITORY_INTEGRATION=true`/`RUN_BUSINESS_ROUTES_INTEGRATION=true`, following the established precedent — they skip cleanly (`22 skipped` combined) rather than failing. Not yet run against a real database; see `coverage: D2/D4/D5` above.
- Staff onboarding (invitations/staff accounts/assignments) does not survive a process restart, since it's stored in-memory pending Wave 4's tenant DB infrastructure. Explicitly reviewed and accepted by the user at the checkpoint as a known, tracked Wave 4 dependency — not a silent gap.

## User Setup Required

None - no external service configuration required for this plan. (Running the gated integration tests locally requires a disposable MySQL instance and `RUN_BUSINESS_REPOSITORY_INTEGRATION=true`/`RUN_BUSINESS_ROUTES_INTEGRATION=true`. Optionally set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` for real invitation emails to send — without them, `sendInvitationEmail.js` degrades gracefully and invitations still succeed.)

## Known Stubs

- Staff onboarding storage (invitations, staff accounts, accepted assignments) is in-memory (`BusinessRepository`'s `Map`/array fields), not persisted to a database table. This is an explicitly plan-sanctioned bridging strategy (see Deviations #3 above and the plan's own Task 3 text), reviewed and accepted by the user at the checkpoint. Resolved by Wave 4 (`04-04-PLAN.md`, tenant session/context binding), which will provide the real `dgfy_business_*` tenant DB connection this storage needs to move into.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: token-in-response | `apps/dgfy-api/src/modules/businesses/controllers/businessController.js` (`onboardStaff`) | The invitation `token` is returned directly in the `POST /businesses/:id/staff` HTTP response body, per the plan's own explicit spec (`ApplicationResult.success({invitation: {token,...}})`). Reviewed at the checkpoint: token is a `crypto.randomUUID()`, expires in 7 days, and is single-use via `markInvitationAccepted()` — user confirmed no concern, matches the plan's own spec as-is. |

## Next Phase Readiness

- Business creation/ownership/staff-onboarding APIs are live, tested (unit-level + gated HTTP/repository integration suites), and mounted in the real app — Wave 3.5 (`04-03.5-PLAN.md`) can build branch/location management directly against this same `businesses/` module composition pattern.
- Login (`POST /accounts/login`) now returns the account's real business list with D-05 auto-binding — ready for Wave 4's tenant session/context binding to consume `active_business_id`.
- Blocker/concern carried forward: `businessRepository.test.js` (13 tests) and `businessRoutes.test.js` (18 tests) both need a real MySQL run (local disposable instance) before this wave's DB-durability and access-control claims are independently confirmed — recommended before or during Wave 5's comprehensive test pass.
- Blocker/concern carried forward: staff onboarding's in-memory storage must be migrated to real `dgfy_business_*` tenant persistence once Wave 4 provides that connection — tracked as a Known Stub above, not a silent gap.
- API-02 remains `Pending` in REQUIREMENTS.md by design; it will be marked complete once Wave 3.5 lands branch registry basics. API-05 remains `Pending` by design (phase-wide requirement spanning all Phase 4 waves).

---
*Phase: 04-backend-accounts-businesses-and-tenancy-foundation*
*Completed: 2026-07-11*

## Self-Check: PASSED

All 14 created/modified files verified present on disk; all 8 task commit hashes (`04b56707`, `5d3abc1b`, `981c44cc`, `bdd1ddfb`, `e07c37b4`, `088714c5`, `9fad08dc`, `1b7b18fd`) verified present in `git log`.
