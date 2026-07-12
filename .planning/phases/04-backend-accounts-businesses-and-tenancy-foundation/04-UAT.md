---
status: testing
phase: 04-backend-accounts-businesses-and-tenancy-foundation
source: [04-VERIFICATION.md]
started: 2026-07-12T01:22:43Z
updated: 2026-07-12T03:20:00Z
---

## Current Test

number: 2
name: Run the phase's other previously-gated integration/E2E suites (business/staff/session flows)
expected: |
  All suites pass using the shared `tenantSchemaProvisioning.js` in-process stand-in (whose doc comment
  now correctly cites the shipped `activate-tenant` CLI).
awaiting: user re-run of the 5 remaining suites after fix 34108f0e; locationRoutes.test.js needs a scoping decision (see Gaps) before it can pass

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
result: issue
reported: "Round 1: tests/e2e/phase4FullFlow.test.js Journeys 1 & 4 failed (see resolved gaps below) — user confirmed both fixed on re-run (5/5 journeys pass). Round 2: ran the other 5 suites (businessFlows, businessValidation, locationRoutes, tenantSessionFlows, tenantSessionValidation) — all 5 failed near-totally (61 of 66 tests), almost every failure at the file's own afterEach, plus locationRoutes.test.js additionally failing its very first assertion (Expected 201, Received 404)."
severity: blocker
root_cause: "Round 1 (resolved): (1) Journey 1 — BusinessDatabaseRegistry.verified_at had no defaultValue, so JSON.stringify dropped the undefined attribute from the response. (2) Journey 4 — hardcoded staffAccountId:1 with no staff_accounts row ever seeded in that journey's tenant database, an FK violation. Round 2 (partially resolved): (3) ALL FIVE files share an afterEach calling Account.destroy({truncate:true, force:true}) — MySQL/InnoDB unconditionally refuses to TRUNCATE a table referenced by a live FK constraint (business_memberships.account_id -> accounts.id) regardless of row count, so this always threw, even on the very first test. (4) locationRoutes.test.js ADDITIONALLY never wires a businessDatabaseRegistryModel into buildBusinessesModule() — no registry row is ever created for its businesses, and the current (Wave 4+) locationUseCases.js fails closed with 404 NO_TENANT_DATABASE whenever no registry row exists. This file predates that gate (Wave 3.5) and was never updated to match — every one of its ~15 tests needs the same registry+tenant-activation wiring already used elsewhere."
fix_applied: "(1) c9d35949, (2) 05d1ebde — both confirmed passing by user. (3) Removed the doomed afterEach truncation from all 5 files (34108f0e for 4 files, 83b7bdf5 for locationRoutes.test.js), matching phase4FullFlow.test.js's proven strategy of per-test-unique literals + a single afterAll DROP DATABASE (verified none of the existing literals collide within a run). (4) NOT yet fixed — flagged for the user: rewiring locationRoutes.test.js's ~15 tests to provision+activate a real tenant per business is a substantially larger change than the other fixes in this session, and needs a scoping decision before proceeding."
status: awaiting user re-run of businessFlows/businessValidation/tenantSessionFlows/tenantSessionValidation (expected to pass) and a decision on locationRoutes.test.js's larger rewiring need

## Summary

total: 2
passed: 1
issues: 1
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
  reason: "All five files' afterEach called Account.destroy({truncate:true, force:true}), which issues a raw TRUNCATE. MySQL/InnoDB unconditionally refuses to TRUNCATE a table referenced by a live FK constraint (business_memberships.account_id -> accounts.id) regardless of row count, so every test in every one of these files failed at this exact line — apparently never caught because this appears to be the first time any of these files ran against a fully-migrated real MySQL schema. Removed the afterEach entirely (each file already uses per-test-unique business_handle/email literals plus an afterAll DROP DATABASE, matching phase4FullFlow.test.js's already-proven strategy). Awaiting user re-run to confirm."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/integration/businesses/businessFlows.test.js, apps/dgfy-api/tests/integration/businesses/businessValidation.test.js, apps/dgfy-api/tests/integration/businesses/locationRoutes.test.js, apps/dgfy-api/tests/integration/tenancy/tenantSessionFlows.test.js, apps/dgfy-api/tests/integration/tenancy/tenantSessionValidation.test.js]
  missing: []

- truth: "locationRoutes.test.js's location-creation tests succeed against a real, activated tenant database (Test 2, suite 3)."
  status: open
  reason: "This file's buildBusinessesModule() call never wires a businessDatabaseRegistryModel, so no business_database_registry row is ever created for any business it creates. The current (Wave 4+) locationUseCases.js fails closed with 404 NO_TENANT_DATABASE whenever no registry row exists for the business — this file predates that gate (Wave 3.5, when location creation was unconditional) and was never updated. Fixing this properly means rewiring the file's setup to provision+activate a real tenant per business (mirroring businessValidation.test.js/tenantSessionFlows.test.js's existing pattern) across all ~15 of its test cases — a substantially larger change than anything else fixed in this session. Flagged for a scoping decision rather than fixed unilaterally."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/integration/businesses/locationRoutes.test.js]
  missing: ["businessDatabaseRegistryModel wiring + tenant provisioning/activation in this file's beforeAll and/or per-test setup"]
