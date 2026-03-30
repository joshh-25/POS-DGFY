# Non-Production Gap Closure Checklist (POS)

Date: 2026-03-30  
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

## 6) Latest Evidence Run (2026-03-30)

Automated verification completed on 2026-03-30 with the following outcomes:

1. `npm run doctor:runtime` -> PASS
   - `status=healthy`
   - `missing_migrations=0`
   - `missing_columns=0`
2. `npm run smoke:pos-local` -> PASS
   - `/health` 200
   - `/api/v1/auth/validate-token/:token` 200
   - `/api/v1/auth/login` 200
   - `/api/v1/users/me` 200
   - `/api/v1/dashboard/stats` 200
   - `/api/v1/dashboard/low-stock` 200
   - `/api/v1/purchase-orders` 200
   - `/api/v1/suppliers` 200
   - `/api/v1/alerts` 200
   - `/api/v1/pos/catalog` 200
   - `/api/v1/sales/transactions` 200
3. `npm run check:architecture` -> PASS
4. `npm run lint:docs` -> PASS
5. `cd backend && npm test` -> PASS
6. `cd frontend && npm test` -> PASS
7. `npm run build` -> PASS
8. `npm run check:frontend-budgets` -> PASS

Remaining blocker before closure:

1. Human UAT evidence/signoff (`docs/testing/pos-e2e-uat-checklist.md`, cashier/admin confirmation)
