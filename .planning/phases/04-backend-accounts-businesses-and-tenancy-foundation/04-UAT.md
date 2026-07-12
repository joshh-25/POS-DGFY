---
status: testing
phase: 04-backend-accounts-businesses-and-tenancy-foundation
source: [04-VERIFICATION.md]
started: 2026-07-12T01:22:43Z
updated: 2026-07-12T02:45:00Z
---

## Current Test

number: 2
name: Run the phase's other previously-gated integration/E2E suites (business/staff/session flows)
expected: |
  All suites pass using the shared `tenantSchemaProvisioning.js` in-process stand-in (whose doc comment
  now correctly cites the shipped `activate-tenant` CLI).
awaiting: user re-run of tests/e2e/phase4FullFlow.test.js (Journeys 1 & 4) after fixes c9d35949/05d1ebde, then the remaining suites in the full command

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
reported: "User ran tests/e2e/phase4FullFlow.test.js (one of this test's six suites) against real MySQL: Journey 1 failed (tenant_registry.verified_at missing from response) and Journey 4 failed (SequelizeForeignKeyConstraintError creating an account_staff_assignments row). Journeys 2, 3, and 5 passed."
severity: blocker
root_cause: "Two independent, pre-existing bugs — neither related to 04-09 — surfaced because this appears to be the first time this suite has ever run against real MySQL. (1) Journey 1: BusinessDatabaseRegistry's verified_at column has allowNull:true but no defaultValue; MySQL has no RETURNING clause, so a freshly-created instance leaves the attribute undefined (not null), and JSON.stringify silently drops undefined keys from the API response. (2) Journey 4: hardcodes staffAccountId:1 when seeding a tenant-local assignment, but unlike Journey 2 (which creates a real staff_accounts row via the invitation-accept flow first, so id 1 genuinely exists), Journey 4 never onboards any staff account — its tenant database's staff_accounts table is empty, so id 1 is a dangling FK reference (staff_account_id is a real same-database FK, unlike the opaque cross-database dgfy_account_id)."
fix_applied: "(1) Added defaultValue:null to BusinessDatabaseRegistry.js's verified_at column (apps/dgfy-api/src/models/Landlord/BusinessDatabaseRegistry.js), committed c9d35949. (2) Journey 4 now seeds a real staff_accounts row directly via the tenant StaffAccount model and uses its real id instead of the unseeded literal (apps/dgfy-api/tests/e2e/phase4FullFlow.test.js), committed 05d1ebde. Both fixes verified against the dgfy-api default suite (163 passed / 190 skipped, unchanged) and confirmed the DB-backed file still skips cleanly without MySQL."
status: awaiting user re-run of tests/e2e/phase4FullFlow.test.js to confirm both fixes, then the remaining 5 suites in this test's full command

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
  reason: "BusinessDatabaseRegistry model's verified_at column lacked defaultValue:null, so a freshly created Sequelize instance carried the attribute as undefined (dropped by JSON.stringify) instead of null. Added the explicit default. Awaiting user re-run to confirm."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/src/models/Landlord/BusinessDatabaseRegistry.js]
  missing: []

- truth: "Journey 4's tenant-local staff assignment seed succeeds against a real, existing staff_accounts row (Test 2, Journey 4)."
  status: resolved
  reason: "Journey 4 hardcoded staffAccountId:1 without ever creating a staff_accounts row in its own tenant database (unlike Journey 2, which does via the invitation-accept flow). Fixed by seeding a real staff_accounts row and using its actual id. Awaiting user re-run to confirm."
  severity: blocker
  test: 2
  artifacts: [apps/dgfy-api/tests/e2e/phase4FullFlow.test.js]
  missing: []
