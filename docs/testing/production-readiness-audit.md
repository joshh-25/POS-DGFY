# Production Readiness Audit Report
**Date:** 2026-02-19
**Project:** SKUpervisor (SKU-Inventory-Manager)
**Status:** in_progress (as of 2026-03-28; pending POS E2E UAT signoff and runtime doctor checks per environment)

> Historical scope note (2026-04-09): this report is retained for audit traceability and historical remediation context. Canonical current readiness state is maintained in `docs/testing/pos-readiness-status.md` and current operational test protocol is maintained in `docs/testing/README.md`.

> Addendum (2026-04-03): Subscription/payment workflows are now disabled by default.
> Billing-funnel and PayPal canary references in this historical report are no longer active release gates.
> Addendum (2026-04-03): Provider-specific legacy payment suites were moved to opt-in execution (`npm --prefix backend run test:legacy:payments`).
> Addendum (2026-04-03): Fresh full-gate rerun passed (`check:architecture`, docs/backend/frontend lint, backend/frontend tests, frontend/skupervisor/pos/store builds, `check:frontend-budgets`, `doctor:runtime`, `audit:indexes`, `smoke:pos-local` with backend started).
> Addendum (2026-04-08): Targeted runtime remediation rerun confirmed recovery of previously failing local endpoints after compliance/schema alignment migrations. Verified `200` on `/api/v1/compliance/profile`, `/api/v1/compliance/artifacts`, `/api/v1/compliance/peripherals`, `/api/v1/pos/incoming-orders`, `/api/v1/sales/transactions`; `/api/v1/store/checkout` now returns expected contract-level `422` for validation/stock failures instead of `500`.

## Summary
The project has resolved major infrastructure and deployment blockers, and key operational flows (including QR Receive) have end-to-end verification evidence. Overall readiness remains `in_progress` until all non-production gates remain green and manual cashier/admin UAT is formally signed off.

## Resolved Critical Issues

### 1. Database Migration Discrepancy ✅ (RESOLVED)
*   **Resolution:** Aligned `.sequelizerc` to the correct root `migrations` folder. All 63+ migrations are now correctly tracked.
*   **Status:** Successfully applied to production via `bash scripts/deploy.sh`.

### 2. Receive Token (QR Flow) — Full End-to-End Fix ✅ (RESOLVED — Phase 39, Deployed 2026-02-19)
*   **Previous state:** The flow had three compounding bugs that prevented stock from ever being updated via QR scan.
*   **Bug 1 — Wrong endpoint:** `MobileReceive.jsx` called `POST /purchase-orders/:id/receive` which sits behind `router.use(authenticate)`. Mobile scans have no JWT, so every receive silently returned 401.
*   **Fix:** Added `POST /api/v1/receive-tokens/:token/receive` (public). The QR token is the authorization credential. The service resolves the order type, dispatches to the correct PO/JO service, and marks the token used atomically.
*   **Bug 2 — Sequelize serialization:** `validateToken` returned a raw Sequelize model instance; `res.json()` serialized it as a plain DB row, stripping the computed `order_type`, `items`, and `total_remaining` fields.
*   **Fix:** Returned an explicit plain object `{ token_id, token_type, expires_at }` instead.
*   **Bug 3 — Navigation during render:** `navigate('/')` was called inside a `setCountdown` state updater, triggering a React render-phase warning.
*   **Fix:** Moved to a dedicated `useEffect` watching `countdown === 0`.
*   **Real-World Verification (live user testing, production):**
    *   **PO QR Scan:** Pillow PO received — status updated to `received` ✅
    *   **JO QR Scan:** Job Order completed — quantity produced updated ✅
    *   Token correctly marked `used_at` after receive ✅
*   **Deployment note:** Changes must be committed and pushed to GitHub before running `deploy.sh` — the script only deploys what is on `origin/master`. Deploying without pushing results in a stale build (symptom: QR link shows `.com/undefined`).

### 3. Insecure Development Defaults 🟠 (READY FOR OPS)
*   **Action Taken:** Production server secrets have been rotated.
*   **Recommendation:** Continue following `docs/ops/PRODUCTION_CHECKLIST.md` and `docs/guides/SCRIPTS_GUIDE.md` for secret management and deployment hygiene.

### 4. Model DECIMAL Precision Alignment ✅ (RESOLVED — Phase 40)
*   **Issue:** `deploy_fix_precision.js` patched `product_composition.quantity_required` at the DB level in Phase 32, but 6 other Sequelize models still declared physical quantity columns as `DECIMAL(12, 2)`, creating a mismatch between model definitions and actual DB column types.
*   **Affected models & fields:**
    *   `JOIngredient`: `quantity_required`, `quantity_consumed`, `stock_before`, `stock_after`
    *   `JobOrder`: `quantity_to_produce`, `quantity_produced`
    *   `POLineItem`: `quantity_ordered`, `quantity_received`
    *   `StockMovement`: `quantity`
    *   `FIFOBatch`: `quantity`, `quantity_consumed`
    *   `Item`: `current_stock`, `max_capacity`, `min_threshold`, `purchase_allowance`, `batch_size`
*   **Fix:** Updated all 6 model files to `DECIMAL(24, 12)`. Created `backend/scripts/deploy_fix_precision_v2.js` to ALTER the actual DB columns across all tenant databases. Registered in `deploy.sh` Step 5.
*   **Safety:** DECIMAL widening is non-destructive — no existing data loss possible.

## Passed Checks ✅
*   **Frontend Build:** The React/Vite frontend builds successfully for production. (Verified)
*   **Security Middlewares:** `helmet`, `cors`, and `express-rate-limit` are correctly integrated.
*   **Process Management:** `ecosystem.config.js` is correctly configured and live on PM2.
*   **Health Checks:** The `/health` endpoint is functional.
*   **Functional Stability:** All Phase 32 bug fixes (Precision, Over-Production, Value Calculation) are verified on production.
*   **Backend Build:** Verified. The `package.json` includes the necessary build scripts for CI/CD parity.
*   **QR Receive Flow (PO + JO):** Verified by live user scan — both order types update stock and status correctly. ✅
*   **Model/DB Precision Alignment:** All physical quantity columns aligned to `DECIMAL(24, 12)` in both Sequelize models and DB schema. ✅

### 5. Expiry Alert System Overhaul ✅ (RESOLVED — 2026-02-21)

**Issue:** The expiry alert system had two problems:
1. Expired batches (days < 0) were lumped together with critical/soon-to-expire batches, making it hard for users to distinguish truly expired stock from upcoming expirations.
2. The "Next to use" FIFO badge was being assigned to the oldest batch regardless of whether it was expired — creating a contradiction where a batch was simultaneously labeled "Next to use" and "Expired".

**Fix 1 — Alert severity tiers:** Added `'expired'` as a distinct severity in `alertService.js`. The three tiers are now:
- `expired` — `days_until_expiry < 0` (already past expiry date)
- `critical` — within the critical window (≤ 7 days by default)
- `warning` — within the warning window (≤ 30 days by default)

Also added `COALESCE(quantity_consumed, 0)` guard to prevent batches with `NULL` quantity_consumed from being silently excluded.

**Fix 2 — Dashboard tab layout:** `ExpiringBatchesList.jsx` now shows 4 tabs: **Expired | Critical | Warning | Missing**. The Expired tab is the default, ensuring urgent issues are front-and-center.

**Fix 3 — "Next to use" badge:** `FIFOBatchViewer.jsx` now uses `findIndex(b => !isExpired(b.expiry_date))` to find the first *non-expired* batch, so the badge is never shown on an expired batch.

**Fix 4 — FIFO accordion:** The FIFO batch list is now a collapsible accordion with summary chips ("X expired", "X expiring soon") visible in the collapsed header, so high batch counts don't overwhelm the item detail view.

### 6. Expired Batch Write-Off Feature ✅ (NEW — 2026-02-21)

**Feature:** Users can now formally remove expired stock from inventory with a full audit trail, instead of leaving expired stock counted as available.

**Per-batch write-off (Option A):** Each expired batch in the FIFO viewer has a "Write Off" button that opens `WriteOffBatchDialog.jsx`. The dialog shows quantity, loss reason selector (defaults to Spoilage), optional notes, and a stock impact preview (current → change → after). Submits a `calculated_loss` stock movement.

**Bulk write-off (Option B):** The dashboard Expiry Alerts panel shows a "Write Off All Expired" button when there are expired batches. Confirmation dialog shows the number of affected batches and items before submitting via `createBulkMovements()`.

**Reversibility:** Both write-off types create standard `StockMovement` records with `movement_type: 'calculated_loss'` and `loss_reason: 'spoilage'`. These can be voided from the Stock Movements page if needed.

**Files changed:**
- `backend/src/services/alertService.js` — severity tier + COALESCE null guard
- `frontend/Components/dashboard/ExpiringBatchesList.jsx` — 4-tab layout + bulk write-off
- `frontend/Components/items/FIFOBatchViewer.jsx` — accordion + per-batch write-off + fixed "Next to use"
- `frontend/Components/items/WriteOffBatchDialog.jsx` — new component
- `frontend/Pages/Dashboard.jsx` — passes `onRefresh` to expiry list
- `frontend/Components/items/ItemDetailsModal.jsx` — passes `onRefresh` to FIFO viewer
- `frontend/Pages/Items.jsx` — supplies refresh callback

### 7. Email Lookup Test Coverage: 7/10 → 10/10 ✅ (2026-02-21)

`backend/tests/lookup_v2.test.js` was expanded from 2 tests to 10, closing all identified coverage gaps:
- Case normalization (UPPERCASE and mixed-case lookups)
- Multiple-tenant branch (`multiple: true` response shape)
- `status` field assertion (rejected tenants cannot leak through)
- Rejected tenant exclusion (404 after manual status change)
- Validation rejection (422 for malformed, missing, and space-containing emails)
- Rate limiter bypass explicitly documented (6 requests, all 404, none 429)
- Pattern-based cleanup in `afterAll` (orphan-safe via `Op.like`)

All 10 tests pass in ~2.5 seconds.

### 8. Token Refresh Race Condition — Full Resolution ✅ (2026-02-23, Phases 47 + 49)

**Phase 47 — Single-tab hardening:** Three latent gaps in `frontend/src/services/api.js` were identified and fixed:

1. **`_retry` flag** — Prevents queued retries from triggering a second refresh cycle when the backend rejects even the new token with 401.
2. **Queue cap (20)** — Requests beyond 20 are rejected immediately during a long refresh, preventing unbounded memory growth.
3. **`timeout: 15000`** on the refresh call — Guarantees `isRefreshing` resets via `.finally()` within 15 seconds even if the server never responds.

**Phase 49 — Multi-tab coordination:** The `isRefreshing` mutex is JS-heap-scoped (per tab). Two open tabs could both see `isRefreshing = false` and both fire `/auth/refresh-token`, causing RTR to blacklist the first token before the second could use it → forced logout. Fixed using `BroadcastChannel('sku_auth')`:

- **Leader tab** broadcasts `token-refresh-started` → follower tabs set `isRefreshing = true` and queue locally.
- On success: leader broadcasts `token-refresh-success` with new token → followers adopt token and drain their queues.
- On failure: leader broadcasts `session-expired` → followers show a non-disruptive "Session Expired" banner overlay (not a hard-redirect).
- Deliberate logout: `auth:logout` window event is re-broadcast to other tabs → same banner.

**Test coverage (15 tests total):**
- `backend/tests/token_refresh_race.test.js` — 4 unit tests (mocked Redis): happy path, invalid token, missing body, sequential blacklist
- `backend/tests/token_refresh_race_integration.test.js` — 2 integration tests (real Redis): concurrent refresh documents no 5xx + valid JWT structure; sequential RTR blacklist verified via HTTP
- `frontend/src/services/__tests__/api.interceptor.test.js` — **9/9** interceptor tests: mutex, header correctness, failure drain, `_retry` guard, queue cap, timeout contract, network error drain, cross-tab token adoption (2.8), cross-tab session expiry event (2.9)

**Key architectural finding:** The backend does not enforce single-winner RTR under simultaneous HTTP concurrency without a distributed lock (Redlock). The **frontend mutex is therefore load-bearing security**, not just an optimisation.

### 9. Local Development Database Cleanup ✅ (2026-02-23)

16 orphaned MySQL databases were dropped (all empty, created by incomplete provisioning attempts). The `sku` database (pointed to by `DB_NAME=SKU` in `.env`) was confirmed intact with all 36 tables. The `sku.tenants` table was confirmed empty — the system was operating in default fallback mode. The correct tenant registration flow via `/register-company` → admin approval → dedicated database provisioning is now the documented path forward.

## Conclusion
The system is **operationally stable for non-production validation** with strong automated coverage across architecture, runtime schema, and critical POS flows. The QR Receive flow is functional for both Purchase Orders and Job Orders without requiring user authentication on the mobile scanning page. The token refresh race condition is resolved for both single-tab and multi-tab scenarios with dedicated automated coverage.

Release status remains `in_progress` until manual cashier/admin UAT evidence is complete and current automated quality gates (including frontend bundle budget checks) remain passing.

---

## 10. Security + Engagement Signal Integrity Addendum (2026-03-03)

### 10.1 Plaintext Tenant DB Credential Surface Removed (Resolved)

**Risk addressed:** Landlord tenant registry previously modeled `db_username` and `db_password` fields, enabling accidental plaintext secret storage.

**Implemented controls:**
- Removed `db_username` and `db_password` from `Tenant` model.
- Added migration `20260303000003-remove-tenant-plaintext-db-credentials.cjs` to drop both columns.
- Added regression test `tenantCredentialSurface.security.test.js` to prevent reintroduction.
- Updated database documentation to remove those fields.

**Evidence basis:** Runtime tenant DB connectors use environment credentials (`process.env.DB_USER` / `process.env.DB_PASSWORD`), not tenant-table credentials.

### 10.2 Billing Funnel Telemetry Quality Gate (Resolved For Current Scope)

**Problem framing:** A test can pass while measuring only mocked behavior or test harness artifacts, not real billing-funnel behavior and certainly not general product engagement.

**Quality controls now in place:**
- `subscriptionIntegration.test.js` validates route-level state transitions (`/payments/upgrade`, `/admin/tenants/register`) and persisted DB evidence.
- Tests now assert exact billing-funnel event pairs (attempt + outcome), not loose `contains` checks.
- Retry scenarios with same `x-request-id` assert no duplicate billing-funnel events (idempotency guard).
- Correlation/source contracts are asserted (`source`, `correlation_id`) to reduce instrumentation noise.
- Runtime billing-funnel integrity audit flags missing `correlation_id`, missing `metadata.outcome`, duplicate event keys, and orphan attempt rows through `GET /health`.
- Runtime billing-funnel reconciliation now also flags completed PayPal payments without telemetry and success rows that do not match tenant state.
- Runtime billing-funnel reconciliation also flags processed webhook logs without matching telemetry and uses explicit thresholds for degradation policy.
- Runtime counterfactual checks now compare billing-route HTTP outcomes against matching success/failure telemetry by request ID.
- Scriptable billing-funnel integrity gate exists via `npm run audit:billing-funnel` with non-zero exit on drift.
- CI now runs `npm run audit:billing-funnel` after migrations with explicit zero-drift thresholds so persisted telemetry drift fails pull requests before merge.
- `paypalSandboxCanary.e2e.test.js` validates live sandbox subscription verification and upgrade-path telemetry contracts.
- Scheduled workflow `.github/workflows/paypal-sandbox-canary.yml` runs daily and on manual dispatch to detect integration drift early, then runs the same billing-funnel audit against canary-generated data.
- Selected product workflows now emit backend-observed usage events for dashboard, inventory, purchase orders, job orders, and AI endpoints.

**Interpretation rule:**
- Unit tests validate logic contracts.
- Integration tests validate persistence and controller wiring against DB state.
- Scheduled sandbox canary is the closest automated proxy to live PayPal-backed upgrade-route behavior.
- These checks do **not** independently prove real webhook ingress through the HTTP edge.
- These checks do **not** independently prove downstream product engagement (retention, feature adoption, usage depth).

Together, these layers reduce false confidence from syntax-only or mock-only green checks for the current billing funnel scope and provide limited real product-usage evidence at the backend boundary.

**Scope note:** The current `engagement_events` table should be interpreted as **billing funnel telemetry plus limited server-side product-usage telemetry** until broader product instrumentation and production evidence exist. See:
- `docs/testing/billing-funnel-telemetry-definition.md`
- `docs/testing/telemetry-event-catalog.md`
- `docs/testing/billing-funnel-integrity-audit.md`
- `docs/testing/telemetry-schema-contract.md`

### 10.3 Database Index Drift Guard (11.2 Resolved + Hardened, 2026-03-03)

**Risk addressed:** Query performance regressions from missing indexes or legacy non-indexed filter paths in high-traffic flows.

**Implemented controls:**
- CSV export folder filtering uses canonical `items.folder_id` path (indexed), with `product_folder` retained only as compatibility metadata.
- Required index contract is enforced through:
  - Runtime background audit (startup + every 6 hours)
  - `/health` degradation (`503`) when required indexes are missing
  - CI gate via `npm run audit:indexes`

**Validation layers:**
- Contract logic tests (`schemaIndexAuditService.test.js`)
- CSV filter path regression tests (`csvExportFolderFilter.test.js`)
- Health contract tests (`healthSchemaIndexAudit.test.js`, `healthService.test.js`)
- Script-level exit-code integration (`auditIndexesScript.integration.test.js`)

**Operational interpretation:**
- A passing unit suite proves contract logic correctness.
- `npm run audit:indexes` and `/health` schema status prove live-schema compliance.
- This is a reliability/performance guard, not a direct user engagement metric.

## 11. POS MVP Hardening Status Addendum (2026-03-25)

### 11.1 Summary
POS MVP hardening moved from planning into implemented and validated state for transport/use-case/DB integration layers.

### 11.2 Verified Evidence
1. Backend lint debt burn-down completed:
   - `backend npm run lint` -> **0 warnings, 0 errors**
2. Architecture compliance checks are passing:
   - `npm run check:architecture` -> pass
3. POS migration-backed DB integration tests are passing:
   - `tests/posCheckout.db.integration.test.js` -> **2/2 passed**
4. Full monorepo tests are passing:
   - Frontend -> **51 passed**
   - Backend -> **128 suites passed, 3 skipped; 551 tests passed, 7 skipped**

### 11.3 Readiness Re-Rating (Evidence-Based)
- POS + DB implementation readiness: **9.6/10**
- Overall MVP robustness/user readiness: **9.4/10**

### 11.4 Remaining Gap (Explicit)
- Live PayPal canary validation is still pending due missing live/sandbox canary environment credentials.

## 12. POS Completion Batch Progress (2026-03-27, In Progress)

### 12.1 Implemented in this pass
1. VAT contract hardening:
   - Item validators now accept `vat_type` (`vatable|vat_exempt|zero_rated`).
   - Finished goods finalization now requires `vat_type`.
   - Product wizard now captures `vat_type` in Basic Info.
2. POS compliance legacy strict-mode phase (historical):
   - Terminology note (2026-04-09): the strict-mode language in this section is historical. Active policy is dual-mode lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`) and fail-closed compliant gating.
   - Added tenant setting `pos_strict_compliance_enabled` (migration-backed).
   - POS checkout/transaction-detail read paths enforce required compliance fields when strict mode is enabled.
3. POS history completion:
   - Server-side filters wired for invoice search, status, payment type, order method, cashier id, and date range.
4. Unified Sales completion:
   - Backend supports sort/filter improvements and CSV export.
   - Frontend sales page supports sort/filter/date range and CSV export action.

### 12.2 Verification evidence (targeted)
- `npm run check:architecture` -> pass
- `npm run lint:docs` -> pass
- Focused backend tests passed:
  - POS transport/use-case/DB integration
  - Sales transport
  - Item transport
  - CSV transport/filter regression

### 12.3 Verification evidence (full + reconciliation)
- `backend npm test` -> pass (130 suites passed, 3 skipped; 560 tests passed, 7 skipped)
- `frontend npm test` -> pass (14 files, 51 tests)
- `npm run build` -> pass (frontend + backend build scripts)
- Added reconciliation coverage:
  - `backend/tests/posSalesReconciliation.db.integration.test.js` -> pass

## 13. Runtime Schema + Startup 500 Prevention Hardening (2026-03-28)

### 13.1 What was added
1. Runtime schema audit service is now part of startup and `/health` status:
   - required migration presence check
   - required POS/runtime column presence check
2. New operator doctor command:
   - `npm run doctor:runtime`
3. Tenant lookup fail-open hardening:
   - landlord optional-column reads are schema-aware (no hard crash on missing optional fields)
4. POS settings JSON auto-repair:
   - malformed/double-encoded JSON values for POS settings are normalized on read and rewritten safely

### 13.2 Verification evidence (2026-03-28 local run)
1. `npm run check:architecture` -> pass
2. `npm run lint:docs` -> pass
3. `npm run doctor:runtime` -> healthy (0 missing migrations, 0 missing required columns)
4. `backend npm test` -> pass (135 passed suites, 3 skipped; 582 passed tests, 7 skipped)
5. `frontend npm test -- --watch=false` -> pass (14 files, 51 tests)
6. `npm run build` -> pass
7. PM2 smoke sequence returned `200` for:
   - `/health`
   - `/api/v1/auth/validate-token/token-original`
   - `/api/v1/auth/login` (header-based tenant token)
   - `/api/v1/users/me`
   - `/api/v1/dashboard/stats`
   - `/api/v1/dashboard/low-stock`
   - `/api/v1/purchase-orders`
   - `/api/v1/suppliers`
   - `/api/v1/alerts`
   - `/api/v1/pos/catalog`
   - `/api/v1/sales/transactions`

### 13.3 Remaining status
Readiness remains `in_progress` until cashier/admin manual POS E2E UAT is completed and signed off using:
- `docs/testing/pos-e2e-uat-checklist.md`
  - Verifies POS checkout totals reconcile with:
    - POS daily Z-reading summary
    - Unified Sales (`source=POS`) transaction and summary surface
  - Verifies strict mode compliance gating:
    - checkout blocked with deterministic `missing_fields`
    - checkout allowed after required POS setup fields are completed

### 12.4 Status
- Workstream remains explicitly **in progress** pending manual UAT and staging deployment smoke checks.

### 12.5 Manual UAT Signoff Asset
- Added end-to-end cashier/admin signoff checklist:
  - `docs/testing/pos-e2e-uat-checklist.md`
- This checklist is now the required artifact to close the user-readiness gate for POS.

## 14. Implementation Kickoff Sequence Validation (2026-03-28)

Execution-ready kickoff sequence has been re-run and validated on current branch:

1. Baseline lock gates:
   - `npm run check:architecture` -> pass
   - `npm run lint:docs` -> pass
2. Targeted POS/Sales/Settings backend suites:
   - `tests/posUsecases.applicationResult.test.js` -> pass
   - `tests/posHandlers.transport.test.js` -> pass
   - `tests/posCheckout.db.integration.test.js` -> pass
   - `tests/salesHandlers.transport.test.js` -> pass
   - `tests/settingsHandlers.transport.test.js` -> pass
3. Full-suite regression:
   - `backend npm test` -> pass
   - `frontend npm test` -> pass
   - `npm run build` -> pass

Current status remains `in_progress` until manual cashier/admin UAT signoff and environment-specific deployment smoke checks are complete.

## 15. Non-Production Gap Closure Update (2026-03-30)

1. Runtime doctor contract extended to verify latest POS migration and schema surfaces:
   - required migration now includes `20260328000003-add-pos-catalog-overrides-and-user-roles.cjs`
   - required table/column checks now include:
     - `users.role`
     - `users.is_master_admin`
     - `pos_catalog_overrides` core columns
2. Local environment was remediated by applying pending migration `20260328000003` and re-running runtime doctor.
3. Added consolidated non-production smoke command:
   - `npm run smoke:pos-local`
4. Added explicit non-production closure checklist:
   - `docs/testing/nonprod-gap-closure-checklist.md`

Workstream remains `in_progress` until human UAT signoff artifacts are completed.

### 15.1 Automated Re-Verification Evidence (2026-03-30)

Fresh rerun on local environment completed with all automated gates passing:

1. `npm run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
2. `npm run smoke:pos-local` -> PASS (all target endpoints returned `200`)
3. `npm run check:architecture` -> PASS
4. `npm run lint:docs` -> PASS
5. `cd backend && npm test` -> PASS
6. `cd frontend && npm test` -> PASS
7. `npm run build` -> PASS
8. `npm run check:frontend-budgets` -> PASS (POS-critical bundles within budget)

Open item remains human-only:

1. Cashier/admin UAT run and signoff evidence (`docs/testing/pos-e2e-uat-checklist.md`).

### 15.2 Canonical POS Readiness Tracking

To prevent status drift across multiple test/readiness documents, the canonical POS readiness state is tracked in:

1. `docs/testing/pos-readiness-status.md`

All POS readiness updates must be reflected there first, then referenced here.
