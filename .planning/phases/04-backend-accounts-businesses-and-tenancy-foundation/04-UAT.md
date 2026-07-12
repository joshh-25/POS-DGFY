---
status: complete
phase: 04-backend-accounts-businesses-and-tenancy-foundation
source: [04-VERIFICATION.md]
started: 2026-07-12T01:22:43Z
updated: 2026-07-12T04:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Run the 04-09-specific gated DB-backed proof suites against real MySQL
expected: |
  `cd apps/dgfy-migration-runner && RUN_ACTIVATE_TENANT_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/activateTenant.test.js`
  and
  `cd apps/dgfy-api && RUN_PHASE4_E2E_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/e2e/phase4FullFlow.test.js`
  against a disposable MySQL 8 instance. Both suites pass: the registry row genuinely transitions
  provisioning -> active/verified with all dgfyBusinessContract tables present, a second CLI run is a
  safe no-op, and the dgfy-api tenant write moves from 503 to 201 after the real CLI subprocess runs.
result: pass
history: "Two rounds of a test-isolation bug (Jest ESM unstable_mockModule leak across describe blocks in activateTenant.test.js) were found and fixed before this passed — see resolved Gap below. Not a production defect. Journey 5 (the new activate-tenant CLI proof, part of tests/e2e/phase4FullFlow.test.js) also confirmed passing: real 503->201 transition via the shipped CLI subprocess."

### 2. Run the phase's other previously-gated integration/E2E suites (business/staff/session flows)
expected: |
  `RUN_BUSINESS_FLOWS_INTEGRATION=true RUN_BUSINESS_VALIDATION_INTEGRATION=true RUN_LOCATION_ROUTES_INTEGRATION=true RUN_TENANT_SESSION_FLOWS_INTEGRATION=true RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js tests/integration/businesses/businessValidation.test.js tests/integration/businesses/locationRoutes.test.js tests/integration/tenancy/tenantSessionFlows.test.js tests/integration/tenancy/tenantSessionValidation.test.js tests/e2e/phase4FullFlow.test.js`
  All suites pass using the shared `tenantSchemaProvisioning.js` in-process stand-in (whose doc comment
  now correctly cites the shipped `activate-tenant` CLI).
result: pass
reported: "Round 1: tests/e2e/phase4FullFlow.test.js Journeys 1 & 4 failed — fixed (c9d35949, 05d1ebde), confirmed 5/5 journeys passing. Round 2: all 5 remaining suites failed near-totally at their own afterEach truncate step, plus locationRoutes.test.js failing its first assertion — fixed (34108f0e, 83b7bdf5, bf10bdcf), confirmed passing. Round 3: tenantSessionFlows.test.js and tenantSessionValidation.test.js still failed on a dangling staffAccountId:1 FK reference (identical root cause to Journey 4) — fixed (c9c31eae), seeding a real staff_accounts row at all 3 call sites. User re-ran the full 6-suite command against real MySQL and confirmed all 6 pass."
severity: n/a
root_cause: "See fix_applied — three distinct rounds of the same class of bug (missing default value, missing FK seed, TRUNCATE-vs-FK-constraint, stale pre-Wave-4 wiring), all now resolved."
fix_applied: "(1) c9d35949, (2) 05d1ebde, (3) 34108f0e + 83b7bdf5 (truncate removal), (4) bf10bdcf (locationRoutes tenant wiring), (5) c9c31eae (tenantSessionFlows/Validation FK seed) — all confirmed passing by user against real MySQL."
status: resolved — all 6 suites confirmed passing by user

## Acknowledged Gaps

- The 4 files outside Test 2's declared scope (businessRoutes.test.js, businessRepository.test.js, tenantRegistryRoutes.test.js, tenantSessionRoutes.test.js) share the same truncate/FK fix (commit 1a5f4543) but were never explicitly re-run/confirmed by the user this session. Not blocking phase completion — flagged for a future spot-check if these suites are exercised.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "After running the shipped activate-tenant command against a provisioning business, a fresh connection reads status='active'/verified_at and finds all dgfyBusinessContract tables (Test 1)."
  status: resolved
  reason: "Diagnosed as a test-isolation bug (Jest ESM unstable_mockModule leak across describe blocks in activateTenant.test.js), not a production defect. Took two fix passes: e50fffab moved the block but only accounted for one of two leaking specifiers; 4f932d8b moved it further, before all four. Confirmed passing by user against real MySQL after the corrected fix."
  severity: blocker
  test: 1
  artifacts: [apps/dgfy-migration-runner/tests/activateTenant.test.js]
  missing: []

- truth: "POST /businesses response's tenant_registry.verified_at is present as null for a freshly provisioning business (Test 2, Journey 1)."
  status: resolved
  reason: "BusinessDatabaseRegistry model's verified_at column lacked defaultValue:null, so a freshly created Sequelize instance carried the attribute as undefined (dropped by JSON.stringify) instead of null. Added the explicit default. Confirmed by user: phase4FullFlow.test.js now passes 5/5 journeys."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/src/models/Landlord/BusinessDatabaseRegistry.js]
  missing: []

- truth: "Journey 4's tenant-local staff assignment seed succeeds against a real, existing staff_accounts row (Test 2, Journey 4)."
  status: resolved
  reason: "Journey 4 hardcoded staffAccountId:1 without ever creating a staff_accounts row in its own tenant database (unlike Journey 2, which does via the invitation-accept flow). Fixed by seeding a real staff_accounts row and using its actual id. Confirmed by user: phase4FullFlow.test.js now passes 5/5 journeys."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/e2e/phase4FullFlow.test.js]
  missing: []

- truth: "businessFlows.test.js, businessValidation.test.js, locationRoutes.test.js, tenantSessionFlows.test.js, and tenantSessionValidation.test.js each run to completion against real MySQL without failing at their own cleanup step (Test 2, suites 1-5)."
  status: resolved
  reason: "All five files' afterEach called Account.destroy({truncate:true, force:true}), which issues a raw TRUNCATE. MySQL/InnoDB unconditionally refuses to TRUNCATE a table referenced by a live FK constraint (business_memberships.account_id -> accounts.id) regardless of row count, so every test in every one of these files failed at this exact line — apparently never caught because this appears to be the first time any of these files ran against a fully-migrated real MySQL schema. Removed the afterEach entirely (each file already uses per-test-unique business_handle/email literals plus an afterAll DROP DATABASE, matching phase4FullFlow.test.js's already-proven strategy). Confirmed by user: all 5 files now pass against real MySQL (tenantSessionFlows/Validation needed one more fix, c9c31eae, for a separate dangling FK — see the new Gap entry below)."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/integration/businesses/businessFlows.test.js, apps/dgfy-api/tests/integration/businesses/businessValidation.test.js, apps/dgfy-api/tests/integration/businesses/locationRoutes.test.js, apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js, apps/dgfy-api/tests/integration/tenancy/tenantSessionValidation.test.js]
  missing: []

- truth: "locationRoutes.test.js's location-creation tests succeed against a real, activated tenant database (Test 2, suite 3)."
  status: resolved
  reason: "This file's buildBusinessesModule() call never wired a businessDatabaseRegistryModel, so no business_database_registry row was ever created for any business it creates, and the current (Wave 4+) locationUseCases.js fails closed with 404 NO_TENANT_DATABASE whenever no registry row exists. This file predated that gate (Wave 3.5, when location creation was unconditional) and was never updated. User chose 'fix it now': createBusiness() rewired to run provisionAndActivateTenantDatabase() after HTTP creation, mirroring businessValidation.test.js's proven pattern (bf10bdcf). All ~15 tests route through this one helper, so no test bodies changed. Confirmed by user: passes against real MySQL."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/integration/businesses/locationRoutes.test.js]
  missing: []

- truth: "tenantSessionFlows.test.js and tenantSessionValidation.test.js's staff-assignment tests succeed against a real, existing staff_accounts row (Test 2, 3 call sites)."
  status: resolved
  reason: "Identical root cause to the Journey 4 gap above: account_staff_assignments.staff_account_id is a real same-database FK into staff_accounts, and these tests never onboarded a staff account first, leaving hardcoded staffAccountId:1 as a dangling FK reference in a freshly-provisioned tenant database. Fixed by seeding a real staff_accounts row via defineStaffAccountModel at all 3 call sites (2 in tenantSessionFlows.test.js, 1 in tenantSessionValidation.test.js), copying the already-proven phase4FullFlow.test.js Journey 4 pattern exactly. Confirmed by user: both files now pass against real MySQL."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js, apps/dgfy-api/tests/integration/tenancy/tenantSessionValidation.test.js]
  missing: []

- truth: "businessRoutes.test.js, businessRepository.test.js, tenantRegistryRoutes.test.js, and tenantSessionRoutes.test.js (outside this test's original suite list, but sharing the identical bug) also run to completion against real MySQL without failing at cleanup."
  status: resolved
  reason: "Same TRUNCATE-vs-FK-constraint issue as the 5 in-scope files, found by checking every other dgfy-api integration file that both truncates accounts and defines/syncs BusinessMembership in its own per-file Sequelize instance. businessRepository.test.js additionally tried truncating child-to-parent (BusinessMembership, then Business, then Account) — confirmed this does not help, since the restriction is based on the FK constraint's existence, not on whether the referencing table has rows. Removed all four afterEach truncations (1a5f4543); the 5 accountXxx.test.js files were checked and excluded (they never sync BusinessMembership, so no FK exists in their isolated per-file database). Not part of Test 2's pass/fail criteria but worth a spot-check by the user."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js, apps/dgfy-api/tests/integration/businesses/businessRepository.test.js, apps/dgfy-api/tests/integration/businesses/tenantRegistryRoutes.test.js, apps/dgfy-api/tests/integration/tenancy/tenantSessionRoutes.test.js]
  missing: []
