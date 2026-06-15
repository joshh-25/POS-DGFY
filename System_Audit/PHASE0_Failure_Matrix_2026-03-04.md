# Phase 0 Failure Matrix (Locked Baseline, Closed 2026-03-04)

## Baseline Source
- Baseline log: `backend/full_test_run_after_fixes_v2.log`
- Baseline summary:
  - `Test Suites: 6 failed, 2 skipped, 38 passed, 44 of 46 total`
  - `Tests: 11 failed, 3 skipped, 223 passed, 237 total`
  - Open-handle warning present.

## Final Closure Status
All six baseline suites are now closed against runtime-first contracts.

| Suite | Baseline Root Cause | Final Resolution | Status |
|---|---|---|---|
| `tests/toctou_integration.test.js` | Harness state leakage (auth cache key collision) and brittle expectation path | Added deterministic tenant-token headers per path; assertions now validate real DB-side item state after confirm | Closed |
| `tests/token_refresh_race_integration.test.js` | Integration semantics were running in non-integration mode | Explicit integration gating retained (`TEST_TYPE=integration`) and verified green in dedicated integration run | Closed |
| `tests/rtr_verification.test.js` | Stale contract + runtime rotation weakness | Rewrote test to current flow (`register -> login -> refresh`), and fixed runtime refresh token generation to include unique `jti` | Closed |
| `tests/ai_export_e2e.test.js` | Missing premium tenant context and permissioned user setup | Added premium tenant harness mock, explicit authorized user (`ai:chat`) and forbidden user coverage (`403`) | Closed |
| `tests/purchaseOrder.test.js` | Destructive global cleanup + outdated item/permission payloads | Replaced with scoped, current-model fixtures (`sku_code`, current permissions), deterministic DB reset (`sync({ force: true })`) | Closed |
| `tests/supertest_security.test.js` | Redis lock assertions conflicted with non-stateful redis test harness | Upgraded global redis mock to stateful in-memory semantics; lock acquire/reacquire assertions now stable | Closed |

## Evidence (Phase 1)
- Fresh targeted matrix revalidation runs:
  - `backend/targeted_matrix_revalidation_2026-03-04_run1.log`
  - `backend/targeted_matrix_revalidation_2026-03-04_run2.log`
  - `backend/targeted_matrix_revalidation_2026-03-04_run3.log`
- Dedicated integration-gated evidence:
  - `backend/integration_revalidation_2026-03-04_token_refresh_race.log`

## Evidence (Phase 2/3)
- Open-handle diagnostics run completed cleanly with `--detectOpenHandles`.
- AI parser lifecycle hardening applied:
  - `backend/src/controllers/aiController.js` now lazy-loads PDF/DOC parsers.
- Jest teardown/lifecycle hardening applied:
  - `backend/tests/globalTeardown.cjs`
  - `backend/jest.config.cjs` (`globalTeardown`, `openHandlesTimeout`)

## Evidence (Phase 3)
- 3 consecutive full green runs (no open-handle warning):
  - `backend/full_run_revalidation_2026-03-04_run1.log`
  - `backend/full_run_revalidation_2026-03-04_run2.log`
  - `backend/full_run_revalidation_2026-03-04_run3.log`
- Each run summary: `Test Suites: 3 skipped, 43 passed, 43 of 46 total` and `Tests: 5 skipped, 233 passed, 238 total`.
