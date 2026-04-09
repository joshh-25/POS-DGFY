# Non-Production Gap Closure Checklist (POS)

Date: 2026-03-31  
Status: in_progress  
Scope: local/staging-like validation only (no production rollout).

Canonical readiness source:

1. `docs/testing/pos-readiness-status.md`

## 1) Runtime Schema Integrity

1. Run `npm run doctor:runtime`
2. Expect:
- `status=healthy`
- `missing_migrations=0`
- `missing_columns=0`

## 2) Local Endpoint Smoke

Precondition:
1. Backend API is running locally (for example `npm run dev:backend`).

1. Run `npm run smoke:pos-local`
2. Expect all checks `PASS` including:
- `/health`
- `/api/v1/auth/validate-token/:token`
- `/api/v1/auth/login`
- `/api/v1/users/me`
- `/api/v1/dashboard/stats`
- `/api/v1/dashboard/low-stock`
- `/api/v1/purchase-orders`
- `/api/v1/suppliers`
- `/api/v1/alerts`
- `/api/v1/pos/catalog`
- `/api/v1/sales/transactions`

## 3) Automated Gate Verification

1. `npm run check:architecture`
2. `npm run lint:docs`
3. `cd backend && npm test`
4. `cd frontend && npm test`
5. `npm run build`
6. `npm run check:frontend-budgets`

## 4) Human UAT Completion

1. Run `docs/testing/pos-e2e-uat-checklist.md`
2. Record evidence in `docs/testing/pos-e2e-uat-run-2026-03-28.md`
3. Capture cashier/admin signoffs.

## 5) Exit Rule

Keep status as `in_progress` until all 4 sections above are complete with evidence.

## 6) Latest Evidence Run (2026-04-03)

Automated verification completed on 2026-04-03 with the following outcomes:

1. `npm run install:all` -> PASS
2. `npm --prefix backend run migrate` -> PASS
   - `No migrations were executed, database schema was already up to date`
3. `npm run doctor:runtime` -> PASS
   - `status=healthy`
   - `missing_migrations=0`
   - `missing_columns=0`
4. `npm run smoke:pos-local` -> PASS
   - Precondition satisfied: backend server started before invoking smoke script
   - All checks returned `PASS` (`/health`, auth token validation, login, users/me, dashboard stats, dashboard low-stock, purchase-orders, suppliers, alerts, pos/catalog, sales/transactions)
5. `npm run check:architecture` -> PASS
6. `npm run lint:docs` -> PASS
7. `cd backend && npm run lint` -> PASS
8. `cd frontend && npm run lint` -> PASS
9. `cd backend && npm test` -> PASS (`147 passed suites / 149 total`, `621 passed tests / 624 total`)
10. `cd frontend && npm test -- --run` -> PASS (`17 files / 64 tests`)
11. `npm run build:frontend` -> PASS
12. `npm run build:skupervisor` -> PASS
13. `npm run build:pos` -> PASS
14. `npm run build:store` -> PASS
15. `npm run check:frontend-budgets` -> PASS
16. `npm --prefix backend run audit:indexes` -> PASS (`status=healthy`, `missing=0`)

Remaining blocker before closure:

1. Human UAT evidence/signoff (`docs/testing/pos-e2e-uat-checklist.md`, cashier/admin confirmation)

## 7) Targeted Remediation Evidence Run (2026-04-08)

Issue scope validated: prior local `500` responses on compliance, POS incoming queue, sales feed, and store checkout transport.

1. `npm --prefix backend run migrate` -> PASS
   - Applied migrations:
     - `20260407000002-compliance-hardening-phase1-2.cjs`
     - `20260407000003-align-tenant-schema-with-model.cjs`
     - `20260407000004-align-job-orders-schema-with-model.cjs`
     - `20260407000005-add-compliance-audit-fallback-table.cjs`
2. `npm --prefix backend run doctor:runtime` -> PASS
   - `status=healthy`
   - `missing_migrations=0`
   - `missing_columns=0`
3. `npm --prefix backend test -- runtimeSchemaAuditService.test.js` -> PASS
4. `npm run check:architecture` -> PASS
5. `npm run build:frontend` -> PASS
6. Endpoint probes after migration + restart:
   - `GET /api/v1/compliance/profile` -> `200`
   - `GET /api/v1/compliance/artifacts` -> `200`
   - `GET /api/v1/compliance/peripherals` -> `200`
   - `GET /api/v1/pos/incoming-orders` -> `200`
   - `GET /api/v1/sales/transactions` -> `200`
   - `POST /api/v1/store/checkout` -> expected `422` in stock/validation breach path (no `500`)

Status after this targeted rerun remains `in_progress` until human UAT evidence is complete.
