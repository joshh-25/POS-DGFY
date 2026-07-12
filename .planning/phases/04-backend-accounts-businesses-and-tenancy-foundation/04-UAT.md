---
status: testing
phase: 04-backend-accounts-businesses-and-tenancy-foundation
source: [04-VERIFICATION.md]
started: 2026-07-12T01:22:43Z
updated: 2026-07-12T02:10:00Z
---

## Current Test

number: 1
name: Run the 04-09-specific gated DB-backed proof suites against real MySQL
expected: |
  Both suites pass: the registry row genuinely transitions provisioning -> active/verified with all
  dgfyBusinessContract tables present, a second CLI run is a safe no-op, and the dgfy-api tenant write
  moves from 503 to 201 after the real CLI subprocess runs.
awaiting: user re-run after corrected fix (commit 4f932d8b)

## Tests

### 1. Run the 04-09-specific gated DB-backed proof suites against real MySQL
expected: |
  `cd apps/dgfy-migration-runner && RUN_ACTIVATE_TENANT_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/activateTenant.test.js`
  and
  `cd apps/dgfy-api && RUN_PHASE4_E2E_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/e2e/phase4FullFlow.test.js`
  against a disposable MySQL 8 instance. Both suites pass: the registry row genuinely transitions
  provisioning -> active/verified with all dgfyBusinessContract tables present, a second CLI run is a
  safe no-op, and the dgfy-api tenant write moves from 503 to 201 after the real CLI subprocess runs.
result: issue
reported: "User ran the first command against real MySQL twice. Round 1: 'no business_database_registry row exists' / 'Received: provisioning'. Round 2 (after first fix attempt e50fffab): different failure — 'tenant schema verification against dgfyBusinessContract failed — missing tables: locations, staff_accounts, ...' (all 9 tables) / 'Received: provisioning'."
severity: blocker
root_cause: "Test-isolation bug in activateTenant.test.js itself, not a defect in the shipped activate-tenant CLI — same underlying mechanism surfaced twice via two different leaked specifiers. Empirically verified (Jest 29 ESM, throwaway repro): jest.unstable_mockModule() registrations persist across jest.resetModules() within the same file, so a later-declared real dynamic import silently inherits an earlier block's mock for the same specifier. Round 1: the describeIfIntegration block ran after two blocks mocking '../src/config/db.js' (its SELECT always returned []). Round 2: the fix moved it to right after the 'missing-table verification error' block — but that block ITSELF mocks '../src/commands/schema.js' (buildMigrationsForKind -> always []), '../src/metadata/storage.js', and '../src/safety/destructiveGate.js', so the integration block's umzug had zero migrations to apply against the real database, producing 'missing tables' for the entire contract, not a partial gap."
fix_applied: "Moved the describeIfIntegration block to the very top of the file — before ALL FOUR leak-prone specifiers ('../src/config/db.js', '../src/commands/schema.js', '../src/metadata/storage.js', '../src/safety/destructiveGate.js') are ever mocked by any later describe block, and expanded the file's protective comments to name the full set explicitly. Test-only change, no production code touched. Skip-safe suite (11 passed, 2 correctly skipped) and full migration-runner suite (297 passed / 5 skipped, 0 failures) confirmed unaffected both times. Round 1 fix committed e50fffab; corrected fix committed 4f932d8b."
status: awaiting re-run against real MySQL to confirm the corrected fix

### 2. Run the phase's other previously-gated integration/E2E suites (business/staff/session flows)
expected: |
  `RUN_BUSINESS_FLOWS_INTEGRATION=true RUN_BUSINESS_VALIDATION_INTEGRATION=true RUN_LOCATION_ROUTES_INTEGRATION=true RUN_TENANT_SESSION_FLOWS_INTEGRATION=true RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js tests/integration/businesses/businessValidation.test.js tests/integration/businesses/locationRoutes.test.js tests/integration/tenancy/tenantSessionFlows.test.js tests/integration/tenancy/tenantSessionValidation.test.js tests/e2e/phase4FullFlow.test.js`
  All suites pass using the shared `tenantSchemaProvisioning.js` in-process stand-in (whose doc comment
  now correctly cites the shipped `activate-tenant` CLI).
result: [pending]

## Summary

total: 2
passed: 0
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- truth: "After running the shipped activate-tenant command against a provisioning business, a fresh connection reads status='active'/verified_at and finds all dgfyBusinessContract tables (Test 1)."
  status: resolved
  reason: "Diagnosed as a test-isolation bug (Jest ESM unstable_mockModule leak across describe blocks in activateTenant.test.js), not a production defect. Took two fix passes: e50fffab moved the block but only accounted for one of two leaking specifiers; 4f932d8b moved it further, before all four. Awaiting user re-run against real MySQL to confirm."
  severity: blocker
  test: 1
  artifacts: [apps/dgfy-migration-runner/tests/activateTenant.test.js]
  missing: []
