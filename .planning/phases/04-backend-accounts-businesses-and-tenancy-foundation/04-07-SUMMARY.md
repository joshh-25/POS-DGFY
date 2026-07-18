---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
plan: 07
subsystem: api
tags: [tenant-database, sequelize, mysql, clean-architecture, staff-onboarding, gap-closure]

# Dependency graph
requires:
  - phase: 04-backend-accounts-businesses-and-tenancy-foundation
    provides: "TenantConnector, BusinessDatabaseRegistryRepository, AccountStaffAssignmentRepository from 04-04/04-06"
provides:
  - "TenantConnector-backed LocationRepository (real dgfy_business_* persistence, replacing the Wave 3.5 in-memory Map)"
  - "StaffOnboardingRepository (tenant-local staff_accounts/staff_invitations persistence + assignment delegation)"
  - "dgfy_business_* staff_invitations schema contract + additive migration + StaffInvitation model"
affects: [04-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TenantDatabaseUnavailableError(reason) thrown by tenant repositories, mapped by use cases into a stable ApplicationResult failure (404 NO_TENANT_DATABASE or 503 TENANT_DATABASE_UNAVAILABLE) — never an uncaught exception"
    - "Registry gating requires status='active' AND verified_at populated (04-06's documented 'active/verified' meaning) before any tenant connection is attempted"
    - "Invitation token is a composite ${businessId}:${uuid} string so an unauthenticated accept request can resolve which tenant database to query — only the SHA-256 hash of the full composite is ever persisted"

key-files:
  created:
    - apps/dgfy-api/src/models/Tenant/StaffInvitation.js
    - apps/dgfy-api/src/modules/businesses/repositories/staffOnboardingRepository.js
    - apps/dgfy-api/tests/integration/businesses/staffOnboardingRepository.test.js
    - apps/dgfy-migration-runner/src/migrations/schema/20260711143000-add-dgfy-business-staff-invitations.cjs
    - apps/dgfy-migration-runner/tests/phase04StaffInvitationsSchema.test.js
  modified:
    - apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js
    - apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js
    - apps/dgfy-api/src/modules/businesses/repositories/accountStaffAssignmentRepository.js
    - apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js
    - apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js
    - apps/dgfy-api/src/modules/businesses/index.js
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
    - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js
    - apps/dgfy-api/tests/unit/modules/businesses/locationUseCases.test.js
    - apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js
    - apps/dgfy-api/tests/integration/businesses/locationRepository.test.js
    - apps/dgfy-api/tests/integration/businesses/businessValidation.test.js
    - apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js
    - apps/dgfy-api/tests/integration/businesses/businessFlows.test.js
    - apps/dgfy-api/tests/e2e/phase4FullFlow.test.js

key-decisions:
  - "LocationRepository/StaffOnboardingRepository both require registry status='active' AND verified_at populated (not just 'active') before opening a tenant connection — matches 04-06-SUMMARY.md's explicit documented meaning of 'active/verified', stricter than the pre-existing tenantSessionUseCases.js check (which only requires a non-null database_name and predates this plan's scope)"
  - "Invitation tokens are now a composite ${businessId}:${uuid} string (not a bare UUID) so POST /invitations/:token/accept — deliberately unauthenticated — can resolve which per-business tenant database to query before any lookup; the full composite string is still SHA-256 hashed before persistence, so no raw token (business-scoped or otherwise) is ever stored"
  - "Direct-add and invitation-accept both create an active tenant assignment ONLY when an optional dgfyAccountId is supplied on the request; when absent, only the StaffAccount is created/linked — matches 04-07-PLAN.md's own Source Audit/Deferred section ('Deferred staff-to-DGFY account linking ... are not planned') rather than inventing an account-linking flow out of scope"
  - "AccountStaffAssignmentRepository gained findByDgfyAccountId()/createOrActivate() rather than duplicating assignment-row upsert logic inside StaffOnboardingRepository — StaffOnboardingRepository resolves+validates the tenant database, then delegates the actual assignment row write to the existing repository that already owns that table"
  - "createStaffAccount() no longer accepts/stores initialPassword — the real tenant staff_accounts schema has no password/credential column (never did); the field is still accepted at the use-case boundary for controller-body compatibility but is silently dropped rather than persisted, matching the pre-existing 'never a credential' rule"
  - "staff_invitations is a SEPARATE additive migration (20260711143000), not an edit to the already-applied Phase 02 foundation migration — keeps DBF-04 idempotent-rerun safety for every already-migrated dgfy_business_* database"

requirements-completed: ["API-02", "API-03", "API-04", "API-05", "API-06"]

coverage:
  - id: D1
    description: "LocationRepository persists branch/location records through TenantConnector into the tenant database, not process memory, preserving existing API response shape and authorization behavior"
    requirement: "API-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/businesses/locationUseCases.test.js (34 tests, including 5 new tenant-database-unavailable cases)"
        status: pass
      - kind: integration
        ref: "tests/integration/businesses/locationRepository.test.js (gated on RUN_LOCATION_REPOSITORY_INTEGRATION, no MySQL in this sandbox)"
        status: unknown
    human_judgment: true
    rationale: "The integration suite proves fresh-instance re-reads, primary-location semantics, soft-delete persistence, and every fail-closed registry state against a real disposable dgfy_business_* database, but no MySQL was reachable in this sandbox — it ran and skipped cleanly (11 skipped) rather than proving pass/fail. A human with real MySQL access must run it once to confirm."
  - id: D2
    description: "Staff direct-add and invitation acceptance persist StaffAccount, StaffInvitation, and AccountStaffAssignment tenant rows; invitation persistence stores a token hash only and rejects replay"
    requirement: "API-02 / API-04"
    verification:
      - kind: unit
        ref: "tests/unit/modules/businesses/businessUseCases.test.js#buildOnboardStaffDirectUseCase / buildAcceptInvitationUseCase (including tenant-database-unavailable and replay-rejection cases)"
        status: pass
      - kind: integration
        ref: "tests/integration/businesses/staffOnboardingRepository.test.js (gated on RUN_STAFF_ONBOARDING_REPOSITORY_INTEGRATION, no MySQL in this sandbox; 'BusinessRepository no longer owns...' check runs unconditionally and passes)"
        status: unknown
    human_judgment: true
    rationale: "The always-run check (BusinessRepository has no invitation/staff-account/assignment stores or methods) passed. The real-MySQL-gated portion (direct-add assignment creation, invitation token-hash-only persistence, accept/replay, fail-closed registry states) ran and skipped cleanly (8 skipped) — no MySQL reachable in this sandbox. A human with real MySQL access must run it once to confirm."
  - id: D3
    description: "Tenant provisioning metadata from 04-06 is used to resolve tenant database names for location and staff persistence only when registry status is active/verified and the tenant schema is reachable; otherwise writes fail closed with a stable ApplicationResult failure"
    requirement: "API-03"
    verification:
      - kind: unit
        ref: "tests/unit/modules/businesses/locationUseCases.test.js and businessUseCases.test.js — missing/provisioning/inactive/unverified/unreachable registry states all map to ApplicationResult.failure (404 NO_TENANT_DATABASE or 503 TENANT_DATABASE_UNAVAILABLE), never an uncaught exception"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repositories (LocationRepository, StaffOnboardingRepository, AccountStaffAssignmentRepository) own all Sequelize access; use cases (locationUseCases.js, businessUseCases.js) retain only authorization/business logic"
    requirement: "API-05"
    verification:
      - kind: other
        ref: "npm run check:architecture:dgfy-api"
        status: pass
    human_judgment: false
  - id: D5
    description: "Repository tests prove created rows survive a fresh repository instance (durable persistence, not process-local object identity)"
    requirement: "API-06"
    verification:
      - kind: integration
        ref: "tests/integration/businesses/locationRepository.test.js / staffOnboardingRepository.test.js — every create/update test explicitly re-reads through a second, freshly-constructed repository instance"
        status: unknown
    human_judgment: true
    rationale: "Both suites are written to prove this via fresh-instance re-reads but are gated behind real MySQL credentials unavailable in this sandbox; skipped cleanly rather than proving pass/fail."
  - id: D6
    description: "Additive staff_invitations schema contract + migration apply cleanly to a disposable dgfy_business_* schema with the required columns and token-hash/email/status indexes"
    requirement: "API-02 / API-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js (mocked-queryInterface: exports meta, creates staff_invitations, idempotent rerun, down() drops only staff_invitations) — 294 tests pass, 3 gated suites skip cleanly"
        status: pass
      - kind: integration
        ref: "apps/dgfy-migration-runner/tests/phase04StaffInvitationsSchema.test.js (gated on RUN_PHASE04_STAFF_INVITATIONS_SCHEMA_INTEGRATION)"
        status: fail
    human_judgment: true
    rationale: "This sandbox has no reachable MySQL server. The plan's own acceptance criteria require that this be stated honestly rather than claimed as passing: running `cd apps/dgfy-migration-runner && RUN_PHASE04_STAFF_INVITATIONS_SCHEMA_INTEGRATION=true DGFY_BUSINESS_DB_NAMES=dgfy_business_phase04_staff_it npm test -- tests/phase04StaffInvitationsSchema.test.js` in this sandbox produced a MySQL connection error (ECONNREFUSED-class failure inside withAdminConnection), not a passing or a cleanly-skipped result, because the flag was explicitly set to true with no server behind it. A human with real MySQL admin credentials must run this exact command to obtain real pass/fail evidence."

duration: ~50min
completed: 2026-07-12
status: complete
---

# Phase 04 Plan 07: Location and Staff Onboarding Tenant Persistence Gap Closure Summary

**Replaced the in-memory location store and process-local staff/invitation/assignment bridging stores with real TenantConnector-backed `dgfy_business_*` persistence, closing the two durability gaps 04-VERIFICATION.md flagged**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2
- **Files modified:** 20 (5 created, 15 modified)

## Accomplishments

- `LocationRepository` now resolves `businessId` to an active/verified tenant database via `BusinessDatabaseRegistryRepository` and reads/writes the real `Location` Sequelize model over a `TenantConnector` connection — the Wave 3.5 in-memory `Map` bridging stub is gone, and `Location.js` is now imported by a runtime repository instead of being orphaned.
- Added an additive `staff_invitations` `dgfy_business_*` schema contract entry + migration (separate from the already-applied Phase 02 foundation migration, preserving idempotent-rerun safety) and a `StaffInvitation` tenant model that stores only a SHA-256 `token_hash`, never a raw token.
- New `StaffOnboardingRepository` owns tenant-local `staff_accounts`/`staff_invitations` persistence and delegates assignment-row writes to `AccountStaffAssignmentRepository`'s new `findByDgfyAccountId()`/`createOrActivate()` methods — closing the "StaffAccount orphaned" verification gap.
- `businessUseCases.js`'s staff onboarding flows (`onboardStaffViaInvitation`, `onboardStaffDirect`, `acceptInvitation`) now persist exclusively through `staffOnboardingRepository`; `BusinessRepository`'s in-memory `invitationStore`/`staffAccountStore`/`assignmentStore` and their methods were removed entirely.
- Every tenant-database resolution failure (missing/provisioning/inactive/unverified/unreachable registry state) surfaces as a stable `ApplicationResult` failure (`404 NO_TENANT_DATABASE` or `503 TENANT_DATABASE_UNAVAILABLE`) — never an uncaught exception — for both location and staff-onboarding operations.
- Updated four existing gated real-MySQL HTTP integration/e2e suites (`businessValidation.test.js`, `businessRoutes.test.js`, `businessFlows.test.js`, `phase4FullFlow.test.js`) to provision an active/verified tenant database before exercising staff-onboarding endpoints, and to match the new response shape (`assignment` is now optional, only present when a `dgfyAccountId` is supplied).

## Task Commits

Each task was committed atomically:

1. **Task 1: Persist Locations Through TenantConnector** - `52a2c8d6` (feat)
2. **Task 2: Persist Staff Invitations, Staff Accounts, And Assignments** - `c613628a` (feat)
3. **Deviation follow-up: update gated HTTP suites for the new tenant-backed shapes** - `d865041b` (test)

_Note: `index.js`'s Task 1 wiring (LocationRepository construction reordered to build `tenantConnector` before it) and Task 2 wiring (StaffOnboardingRepository, use-case injection) both land in the same shared composition-root function body — mirroring 04-06-SUMMARY.md's identical precedent, `index.js`'s diff was committed as part of the Task 2 commit rather than split across both._

## Files Created/Modified

- `apps/dgfy-api/src/models/Tenant/StaffInvitation.js` - New tenant model (`id`, `staff_account_id`, `email`, `token_hash`, `status`, `expires_at`, `accepted_at`, timestamps); never a raw-token column.
- `apps/dgfy-api/src/modules/businesses/repositories/staffOnboardingRepository.js` - New: resolves businessId to an active/verified tenant database, owns `StaffAccount`/`StaffInvitation` persistence, delegates assignment writes to `accountStaffAssignmentRepository`.
- `apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js` - Rewritten onto `TenantConnector` + `BusinessDatabaseRegistryRepository`; exports `TenantDatabaseUnavailableError`.
- `apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js` - Every use case wraps repository calls in try/catch, mapping `TenantDatabaseUnavailableError` to a stable `ApplicationResult` failure.
- `apps/dgfy-api/src/modules/businesses/repositories/accountStaffAssignmentRepository.js` - Added `findByDgfyAccountId()` and `createOrActivate()`.
- `apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js` - Removed the in-memory invitation/staff-account/assignment stores and their methods.
- `apps/dgfy-api/src/modules/businesses/usecases/businessUseCases.js` - Staff onboarding use cases refactored onto `staffOnboardingRepository`; invitation tokens are now `${businessId}:${uuid}`; direct-add/accept both accept an optional `dgfyAccountId` to create an active assignment.
- `apps/dgfy-api/src/modules/businesses/index.js` - Wires `staffOnboardingRepository` through `buildBusinessesModule()`; `locationRepository` construction now depends on `tenantConnector`.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - Added `staff_invitations` table contract entry.
- `apps/dgfy-migration-runner/src/migrations/schema/20260711143000-add-dgfy-business-staff-invitations.cjs` - New additive migration.
- `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js` - Scoped 3 pre-existing assertions to the original foundation migration's own table set (not the now-larger full contract); added a new describe block for the additive migration.
- `apps/dgfy-migration-runner/tests/phase04StaffInvitationsSchema.test.js` - New gated real-MySQL schema evidence test.
- `apps/dgfy-api/tests/unit/modules/businesses/locationUseCases.test.js` - Added 5 tenant-database-unavailable tests.
- `apps/dgfy-api/tests/unit/modules/businesses/businessUseCases.test.js` - Rewrote the three staff-onboarding describe blocks for the new `staffOnboardingRepository`-backed shapes; added tenant-database-unavailable and replay tests.
- `apps/dgfy-api/tests/integration/businesses/locationRepository.test.js` - Rewritten as a gated real-MySQL suite.
- `apps/dgfy-api/tests/integration/businesses/staffOnboardingRepository.test.js` - New gated real-MySQL suite + an always-run "BusinessRepository no longer owns..." check.
- `apps/dgfy-api/tests/integration/businesses/businessValidation.test.js`, `businessRoutes.test.js`, `businessFlows.test.js`, `apps/dgfy-api/tests/e2e/phase4FullFlow.test.js` - Updated to provision an active/verified tenant database before staff-onboarding assertions and match the new response shape.

## Decisions Made

- Registry gating requires `status='active'` AND `verified_at` populated (not just `status='active'`) before any tenant connection — the stricter, explicitly-documented "active/verified" meaning from 04-06-SUMMARY.md.
- Invitation tokens are `${businessId}:${uuid}` so the unauthenticated `POST /invitations/:token/accept` endpoint can resolve which tenant database to query; the full composite is still SHA-256-hashed before persistence.
- Direct-add and invitation-accept both create an active tenant assignment only when an optional `dgfyAccountId` is supplied — matches the plan's own Deferred section rather than inventing a DGFY-account-linking flow.
- `AccountStaffAssignmentRepository` gained `findByDgfyAccountId()`/`createOrActivate()` rather than duplicating assignment-row upsert logic inside `StaffOnboardingRepository`.
- `createStaffAccount()` no longer accepts/stores `initialPassword` — the real tenant schema has no credential column.
- `staff_invitations` ships as a separate additive migration, not an edit to the already-applied Phase 02 foundation migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scoped 3 pre-existing dgfyBusinessSchema.test.js assertions to the original foundation migration's own table list**
- **Found during:** Task 2 (adding `staff_invitations` to the shared `dgfyBusinessContract.js`)
- **Issue:** Three pre-existing tests (`up() creates exactly the contract tenant tables...`, the index-matching test, the FK-wiring test, and `down() drops every contract table`) compared the OLD foundation migration's actual behavior against `Object.keys(dgfyBusinessContract.tables)` — adding `staff_invitations` to the contract would make these fail, since that table is created/dropped by a separate, later additive migration.
- **Fix:** Re-scoped the assertions to the file's own pre-existing `BUSINESS_TABLE_NAMES` local constant (the exact original table set) instead of the full contract key list; added a new describe block with equivalent assertions for the new additive migration.
- **Files modified:** `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js`
- **Verification:** `cd apps/dgfy-migration-runner && npm test` — 294 tests pass, 3 gated suites skip cleanly.
- **Committed in:** `c613628a` (Task 2 commit)

**2. [Rule 1/3 - Blocking, cascading regression] Updated 4 gated real-MySQL HTTP suites broken by the staff-onboarding refactor**
- **Found during:** Post-Task-2 review of downstream test files not in this plan's `<files>` list
- **Issue:** `businessValidation.test.js`, `businessRoutes.test.js`, and `businessFlows.test.js` construct `buildBusinessesModule()` without a `businessDatabaseRegistryModel`/`tenantConnector`, so every staff-onboarding endpoint they exercise would now fail closed (`TENANT_DATABASE_UNAVAILABLE`/`NO_TENANT_DATABASE`) instead of succeeding. `phase4FullFlow.test.js` already provisions a tenant database per business but only sets `status: 'active'` (not `verified_at`), and asserted the pre-refactor `assignment.email` response shape.
- **Fix:** Added `BusinessDatabaseRegistry`/`TenantConnector` wiring and a per-business tenant-provisioning helper (mirroring `tenantSessionFlows.test.js`'s `createBusinessWithTenant()`) to the three under-wired files, and updated `phase4FullFlow.test.js`'s existing helper to also call `updateStatus({verifiedAt: new Date()})`. Updated accept-invitation assertions in all four files to match the new response shape (`staffAccount` always present, `assignment` only when `dgfyAccountId` is supplied).
- **Files modified:** `apps/dgfy-api/tests/integration/businesses/businessValidation.test.js`, `businessRoutes.test.js`, `businessFlows.test.js`, `apps/dgfy-api/tests/e2e/phase4FullFlow.test.js`
- **Verification:** All four suites parse and skip cleanly (41 tests skipped, 0 failures) — no MySQL reachable in this sandbox to prove the real-MySQL path; a human with real credentials must confirm.
- **Committed in:** `d865041b` (separate test-only commit)

---

**Total deviations:** 2 auto-fixed (both blocking/cascading, required to keep the existing test suite from regressing as a direct consequence of this plan's own refactor).
**Impact on plan:** No architectural changes, no new dependencies, no files outside the businesses/migration-runner modules and their tests.

## Issues Encountered

- Execution was interrupted mid-Task-2 by a connection error after Task 1's commit and part of Task 2's file writes had landed uncommitted. Resumed by reviewing all uncommitted diffs against the plan's task breakdown and acceptance criteria (rather than assuming partial work was complete), then continued writing `StaffOnboardingRepository` and the remaining `businessUseCases.js`/`index.js`/test changes before committing Task 2 atomically. No rework was needed — the pre-interruption diffs matched the intended design.
- Every gated real-MySQL/schema-integration suite in this plan's scope (`locationRepository.test.js`, `staffOnboardingRepository.test.js`, `phase04StaffInvitationsSchema.test.js`) ran and either skipped cleanly or (in the one case where the flag was explicitly forced on for verification) failed with a MySQL connection error — no MySQL server is reachable in this sandbox. None of these suites are claimed as passing; see the coverage table's `human_judgment: true` entries above.

## User Setup Required

A human with real MySQL admin credentials should run, at minimum, once before considering this plan's evidence complete:
- `cd apps/dgfy-api && RUN_LOCATION_REPOSITORY_INTEGRATION=true npm test -- tests/integration/businesses/locationRepository.test.js`
- `cd apps/dgfy-api && RUN_STAFF_ONBOARDING_REPOSITORY_INTEGRATION=true npm test -- tests/integration/businesses/staffOnboardingRepository.test.js`
- `cd apps/dgfy-migration-runner && RUN_PHASE04_STAFF_INVITATIONS_SCHEMA_INTEGRATION=true npm test -- tests/phase04StaffInvitationsSchema.test.js`
- (Optional, broader confidence) `RUN_BUSINESS_VALIDATION_INTEGRATION=true`, `RUN_BUSINESS_ROUTES_INTEGRATION=true`, `RUN_BUSINESS_FLOWS_INTEGRATION=true`, and `RUN_PHASE4_E2E_INTEGRATION=true` against `tests/integration/businesses/*.test.js` and `tests/e2e/phase4FullFlow.test.js`, since this plan updated their tenant-provisioning wiring.

Set `BUSINESS_IT_DB_HOST`/`PORT`/`USER`/`PASSWORD` (or the existing `DB_HOST`/`PORT`/`USER`/`PASSWORD` convention) to point at a disposable MySQL server; every suite creates/drops its own uniquely-suffixed schemas and never touches a shared database.

## Known Stubs

- `businessController.js` (not modified by this plan — out of its `<files>` scope) does not yet forward a `dgfy_account_id`/`dgfyAccountId` field from the HTTP request body for direct-add or invitation-accept, so the "create an active tenant assignment when a target DGFY account id is supplied" behavior this plan implements at the repository/use-case layer has no HTTP-reachable trigger yet. This is intentional and matches the plan's own Deferred section ("Deferred staff-to-DGFY account linking ... are not planned") — a future wave that builds real DGFY-account creation/linking for invitees should wire this field through the controller.

## Next Phase Readiness

- API-02, API-03, API-04, API-05, and API-06 are all satisfied by this plan for the location/staff-onboarding durability gap 04-VERIFICATION.md identified; both explicit gaps that plan flagged (in-memory location store; in-memory staff/invitation/assignment stores; `StaffAccount`/`Location` orphaned) are closed.
- 04-08 (or any later wave touching staff onboarding) should treat `staffOnboardingRepository`/`locationRepository` as the sole tenant-persistence path for these domains — do not reintroduce process-local bridging stores.
- A human with real MySQL access should run the gated suites listed under "User Setup Required" at least once before considering this plan's real-MySQL evidence complete, matching the existing gated-suite precedent across this phase.

---
*Phase: 04-backend-accounts-businesses-and-tenancy-foundation*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 20 claimed created/modified files exist on disk and all three task commits (`52a2c8d6`, `c613628a`, `d865041b`) are present in git history.
