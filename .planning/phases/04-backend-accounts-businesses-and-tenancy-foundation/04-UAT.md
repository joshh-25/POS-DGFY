---
status: testing
phase: 04-backend-accounts-businesses-and-tenancy-foundation
source: [04-VERIFICATION.md]
started: 2026-07-12T01:22:43Z
updated: 2026-07-12T01:48:00Z
---

## Current Test

number: 1
name: Run the 04-09-specific gated DB-backed proof suites against real MySQL
expected: |
  Both suites pass: the registry row genuinely transitions provisioning -> active/verified with all
  dgfyBusinessContract tables present, a second CLI run is a safe no-op, and the dgfy-api tenant write
  moves from 503 to 201 after the real CLI subprocess runs.
awaiting: user re-run after fix (commit e50fffab)

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
reported: "User ran the first command against real MySQL: 2 of 6 tests in activateTenant.test.js failed — 'no business_database_registry row exists' and 'Expected: active, Received: provisioning'."
severity: blocker
root_cause: "Test-isolation bug in activateTenant.test.js itself, not a defect in the shipped activate-tenant CLI. The describeIfIntegration('real MySQL...') block ran AFTER two skip-safe unit blocks that call jest.unstable_mockModule('../src/config/db.js', ...). Empirically verified (Jest 29 ESM, throwaway repro) that unstable_mockModule registrations persist across jest.resetModules() within the same file — so the integration block's dynamic import of activateTenant.js silently inherited a stale fake connection whose query() always resolves to an empty array, regardless of what is actually in the real database. The real registry row genuinely existed and was never touched."
fix_applied: "Reordered activateTenant.test.js so the describeIfIntegration block runs immediately after the first (already-protected) describe block, before any block mocks '../src/config/db.js' or '../src/schema/applyBusinessSchema.js'. Test-only change, no production code touched. Skip-safe suite (11 passed, 2 correctly skipped) and full migration-runner suite (297 passed / 5 skipped, 0 failures) both confirmed unaffected. Committed as e50fffab."
status: awaiting re-run against real MySQL to confirm the fix

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
  reason: "Diagnosed as a test-isolation bug (Jest ESM unstable_mockModule leak across describe blocks in activateTenant.test.js), not a production defect. Fixed by reordering the DB-backed describe block; fix committed at e50fffab. Awaiting user re-run against real MySQL to confirm."
  severity: blocker
  test: 1
  artifacts: [apps/dgfy-migration-runner/tests/activateTenant.test.js]
  missing: []
