# Phase 0 Acceptance Gates (Locked and Verified 2026-03-04)

## Locked Gates
1. Full backend test suite is green.
2. No post-run async-handle warning is emitted.
3. `System_Audit` markdown set is free from local-only path/thread artifacts.
4. All six baseline failing suites have reproducible closure evidence.

## Verification Outcome
- Gate 1: Passed.
- Gate 2: Passed.
- Gate 3: Passed.
- Gate 4: Passed.

## Evidence Commands Used
1. `cd backend && npm test -- --runInBand`
2. `cd backend && npm test -- --runInBand --detectOpenHandles`
3. `cd backend && powershell -Command "for ($i=1; $i -le 3; $i++) { npm test -- --runInBand > full_run_revalidation_2026-03-04_run$($i).log 2>&1; npm test -- tests/subscriptionIntegration.test.js tests/paypalWebhookHandlers.test.js tests/billingScheduler.idempotency.test.js tests/billingScheduler.db.integration.test.js tests/rtr_verification.test.js tests/toctou_integration.test.js tests/supertest_security.test.js tests/softDeleteHardeningRegression.test.js tests/ai_export_e2e.test.js --runInBand > targeted_matrix_revalidation_2026-03-04_run$($i).log 2>&1 }"`
4. `cd backend && npm run test:integration > integration_revalidation_2026-03-04_token_refresh_race.log 2>&1`
5. `cd backend && npm test -- tests/paypalSandboxCanary.e2e.test.js --runInBand > canary_revalidation_2026-03-04_paypal.log 2>&1`
6. `rg -n "<artifact-pattern>" System_Audit` (artifact signature set used during closure validation)

## Evidence Files
- Baseline: `backend/full_test_run_after_fixes_v2.log`
- Full-run revalidation set:
  - `backend/full_run_revalidation_2026-03-04_run1.log`
  - `backend/full_run_revalidation_2026-03-04_run2.log`
  - `backend/full_run_revalidation_2026-03-04_run3.log`
- Targeted matrix revalidation set:
  - `backend/targeted_matrix_revalidation_2026-03-04_run1.log`
  - `backend/targeted_matrix_revalidation_2026-03-04_run2.log`
  - `backend/targeted_matrix_revalidation_2026-03-04_run3.log`
- Open-handle diagnostics:
  - `backend/full_run_revalidation_2026-03-04_openhandles.log`
- Gated suite evidence:
  - `backend/integration_revalidation_2026-03-04_token_refresh_race.log`
  - `backend/canary_revalidation_2026-03-04_paypal.log`
