---
status: testing
phase: 04-backend-accounts-businesses-and-tenancy-foundation
source: [04-VERIFICATION.md]
started: 2026-07-12T01:22:43Z
updated: 2026-07-12T01:22:43Z
---

## Current Test

number: 1
name: Run the 04-09-specific gated DB-backed proof suites against real MySQL
expected: |
  Both suites pass: the registry row genuinely transitions provisioning -> active/verified with all
  dgfyBusinessContract tables present, a second CLI run is a safe no-op, and the dgfy-api tenant write
  moves from 503 to 201 after the real CLI subprocess runs.
awaiting: user response

## Tests

### 1. Run the 04-09-specific gated DB-backed proof suites against real MySQL
expected: |
  `cd apps/dgfy-migration-runner && RUN_ACTIVATE_TENANT_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/activateTenant.test.js`
  and
  `cd apps/dgfy-api && RUN_PHASE4_E2E_INTEGRATION=true BUSINESS_IT_DB_HOST=... BUSINESS_IT_DB_USER=... BUSINESS_IT_DB_PASSWORD=... npm test -- tests/e2e/phase4FullFlow.test.js`
  against a disposable MySQL 8 instance. Both suites pass: the registry row genuinely transitions
  provisioning -> active/verified with all dgfyBusinessContract tables present, a second CLI run is a
  safe no-op, and the dgfy-api tenant write moves from 503 to 201 after the real CLI subprocess runs.
result: [pending]

### 2. Run the phase's other previously-gated integration/E2E suites (business/staff/session flows)
expected: |
  `RUN_BUSINESS_FLOWS_INTEGRATION=true RUN_BUSINESS_VALIDATION_INTEGRATION=true RUN_LOCATION_ROUTES_INTEGRATION=true RUN_TENANT_SESSION_FLOWS_INTEGRATION=true RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true RUN_PHASE4_E2E_INTEGRATION=true npm test -- tests/integration/businesses/businessFlows.test.js tests/integration/businesses/businessValidation.test.js tests/integration/businesses/locationRoutes.test.js tests/integration/tenancy/tenantSessionFlows.test.js tests/integration/tenancy/tenantSessionValidation.test.js tests/e2e/phase4FullFlow.test.js`
  All suites pass using the shared `tenantSchemaProvisioning.js` in-process stand-in (whose doc comment
  now correctly cites the shipped `activate-tenant` CLI).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
