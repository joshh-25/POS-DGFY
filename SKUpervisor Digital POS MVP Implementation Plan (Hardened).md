# SKUpervisor Digital POS MVP Implementation Plan (Hardened v2)

**Author:** Codex  
**Date:** March 25, 2026

## 0.1) Implementation Status Update (March 25, 2026)

The project has now moved from plan-only into implemented hardening with validated evidence.

### Completed Since This Plan
1. POS backend slice is implemented (`migrations`, `models`, `module`, `routes`, `validators`, and transport/use-case tests).
2. POS DB integration coverage is in place with migration-backed checkout validation:
   - `backend/tests/posCheckout.db.integration.test.js`
3. Backend lint warning debt is fully burned down:
   - `backend npm run lint` -> **0 warnings, 0 errors**
4. Architecture governance gates are passing:
   - `npm run check:architecture` -> pass
5. Full monorepo test sweep is passing:
   - Frontend: **51 passed**
   - Backend: **128 suites passed, 3 skipped; 551 tests passed, 7 skipped**

### Current Readiness Ratings (Evidence-Based)
- POS + DB implementation readiness: **9.6/10**
- Overall MVP robustness/user readiness: **9.4/10**

### Explicit Remaining Gap
- Live PayPal canary is not yet available in this environment (no full live/sandbox provider canary evidence captured yet).

## 0) Recommendation Summary

This is the implementation direction I recommend for the most robust MVP:

1. Use a dedicated POS backend module and tables, and keep stock deduction through `createStockMovement` (`goods_issue`) for consistency.
2. Keep the frontend MVP on the same origin (`/pos`) instead of a `pos.` subdomain to avoid auth token/session split risks.
3. Add idempotent checkout and transaction-safe invoice sequencing as non-negotiable reliability controls.
4. Do not update `items.default_sale_price` from POS checkout to prevent global price drift.
5. Gate POS behind both premium plan and explicit POS permissions.

This plan is designed to reduce regressions while staying aligned with current architecture guardrails.

---

## 1) Scope

### Problem Statement
Deliver a production-safe POS MVP that can:
- perform atomic checkout,
- deduct inventory accurately,
- produce receipt-ready tax snapshots,
- support end-of-day aggregation,
- and pass existing architecture and CI guardrails.

### In Scope
- New backend POS module (`routes -> controllers -> usecases -> repositories -> models`)
- New POS data model and migrations
- POS checkout API + transaction history + Z-reading endpoint
- RBAC + premium gating + route-level rate limiting
- POS frontend route and terminal UI skeleton
- Tests (unit, integration, frontend smoke)

### Out of Scope (MVP)
- Hardware integrations (cash drawer, thermal printer drivers, barcode scanner SDK)
- Offline-first sync engine
- Full BIR certification workflow and legal attestation package
- AI tooling expansion for POS analytics (can be Phase 2)

---

## 2) Authoritative Documentation Used

### Mandatory Lookup Order (Compliant)
1. `docs/START_HERE.md` (authoritative, `last_reviewed: 2026-03-06`)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, `last_reviewed: 2026-03-06`)
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, `last_reviewed: 2026-03-06`)
4. Relevant ADRs:
   - `docs/architecture/adr/0001-modular-monolith-boundaries.md`
   - `docs/architecture/adr/0002-error-contract-unification.md`
   - `docs/architecture/adr/0003-migration-facade-strategy.md`
   - `docs/architecture/adr/0004-architecture-compliance-automation.md`
5. Domain docs reviewed for implementation context:
   - `docs/api/specification.md`
   - `docs/database/schema.md`
   - `docs/testing/README.md`
   - `docs/templates/IMPLEMENTATION_PLAN_TEMPLATE.md` (authoritative, `last_reviewed: 2026-03-06`)

### Validation of Freshness
All cited authoritative docs above show `last_reviewed: 2026-03-06`.

---

## 3) Current-State Findings That Affect POS Design

1. Dispatch flow is intentionally 3-step (`draft -> confirmed -> dispatch`) and updates stock only on dispatch.
2. `items.default_sale_price` is currently auto-updated from dispatch logic, so reusing dispatch directly for POS can mutate global item defaults unintentionally.
3. Premium gating is already available via `requirePremium` middleware.
4. `ProtectedRoute` currently enforces authentication only, not permission-based routing; permission checks are handled in-page via `PermissionContext`.
5. Multi-tenant model registration is explicit; any new model must be added to:
   - `backend/src/models/index.js`
   - `backend/src/utils/tenantModelFactory.js`
6. Existing architecture checks are active and passing:
   - `npm run check:architecture` passed on March 25, 2026
   - `npm run lint:docs` passed on March 25, 2026

---

## 4) Architecture Impact

- **Classification:** `within-existing-boundary`
- **Layers affected:** routes, controllers, usecases, repositories, models, frontend pages/services
- **Boundary risk:** moderate (new module + stock writes + financial records)
- **ADR required:** `no` (no cross-boundary architecture change proposed)

Decision rationale:
- We remain inside the established modular monolith boundary.
- We avoid introducing temporary architecture exceptions.

---

## 5) Design

## 5.1 Backend Module Structure

Create `backend/src/modules/pos/` with:
- `controllers/posHandlers.js`
- `usecases/checkoutPosUseCase.js`
- `usecases/getPosTransactionsUseCase.js`
- `usecases/getPosTransactionByIdUseCase.js`
- `usecases/generateZReadingUseCase.js`
- `repositories/posRepository.js`
- `index.js`
- `README.md`

Rules:
- Controllers are transport-only.
- Business rules in usecases.
- DB reads/writes in repositories.
- Use `ApplicationResult` + domain error mapping for responses.

## 5.2 Data Model and Migrations

### Migration A: Add VAT Classification to Items
Add `items.vat_type ENUM('vatable','vat_exempt','zero_rated') DEFAULT 'vatable'`.

### Migration B: Create POS Tables
Create:
- `pos_transactions`
- `pos_transaction_lines`
- `pos_invoice_counters`

Recommended fields:

`pos_transactions`
- `pos_transaction_id` (PK)
- `invoice_number` (unique)
- `idempotency_key` (unique)
- `cashier_id` (FK users)
- `terminal_id` (string)
- `order_method` (`dine_in|takeout|delivery|online`)
- `payment_type` (`cash|gcash|maya|card|bank_transfer`)
- `subtotal_amount`
- `vatable_sales`
- `vat_amount`
- `vat_exempt_sales`
- `zero_rated_sales`
- `discount_amount`
- `total_amount`
- `status` (`completed|voided`)
- `voided_at`, `voided_by`
- `created_at`, `updated_at`

`pos_transaction_lines`
- `line_id` (PK)
- `pos_transaction_id` (FK)
- `item_id` (FK)
- `quantity`
- `unit_of_measure`
- `cost_snapshot`
- `sale_price`
- `line_subtotal`
- `vat_type_snapshot`
- `vat_rate_snapshot`

`pos_invoice_counters`
- `counter_key` (PK, e.g. `POS_OR`)
- `current_value` (bigint)
- `updated_at`

### Migration C: Stock Movement Reference Type
Extend `stock_movements.reference_type` enum to include `POS`.

Why:
- Keeps traceability explicit without overloading `DO` or `MANUAL`.

### Migration D: POS Settings Seed/Migration
Upsert keys in `system_settings`:
- `pos_business_name`
- `pos_tin_branch`
- `pos_address`
- `pos_ptu_number`
- `pos_min_number`
- `pos_accreditation_number`
- `pos_receipt_footer_message`

Note: Add via migration/upsert flow rather than only seed file to ensure existing tenants receive keys.

## 5.3 Checkout Transaction Flow (Atomic)

`POST /api/v1/pos/checkouts`

Inside one DB transaction:
1. Validate request and `idempotency_key`.
2. Lock and verify all item rows (`category='product'`, `product_type='finished_goods'`, active/not deleted).
3. Lock/increment `pos_invoice_counters` row to produce invoice number.
4. Compute VAT buckets from item `vat_type` snapshots.
5. Insert `pos_transactions` + `pos_transaction_lines`.
6. For each line, call `createStockMovement(..., movement_type='goods_issue', reference_type='POS', reference_id=<pos_transaction_id>)` using the same transaction.
7. Commit and return normalized response.

Critical safety rules:
- No mutation of `items.default_sale_price` during POS checkout.
- Idempotency key must guarantee retry safety.
- If any line fails, full rollback.

## 5.4 API Endpoints (MVP)

- `POST /api/v1/pos/checkouts`
- `GET /api/v1/pos/transactions`
- `GET /api/v1/pos/transactions/:id`
- `POST /api/v1/pos/z-reading/close-day`
- `GET /api/v1/pos/z-reading/:date`

All endpoints:
- `authenticate`
- `requirePremium`
- permission checks (`pos:view` or `pos:transact`)

## 5.5 RBAC and Rate Limiting

### RBAC
Add:
- `pos:view`
- `pos:transact`

Default role mapping:
- `admin`: both
- `manager`: both
- `staff`: optional by rollout policy (recommended: `pos:transact` only when explicitly granted)

Update both:
- `backend/src/config/permissions.js`
- `frontend/src/config/permissions_frontend.js`

### Rate Limiting
Add `posLimiter` in `backend/src/middleware/rateLimiter.js` and apply only on `/api/v1/pos/*`.

Recommendation:
- Key by tenant + user + terminal id (not IP-only), because POS terminals often share NAT/public IP.

## 5.6 Frontend Strategy (Recommended for MVP)

Recommended approach:
- Use same-origin route (`/pos`) inside current Vite app.

Reason:
- Current auth storage is localStorage-based per origin. A `pos.` subdomain introduces session split and extra auth/CORS complexity.

MVP frontend additions:
- `frontend/src/features/pos/pages/POSPage.jsx`
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- `frontend/src/features/pos/components/ReceiptPrintView.jsx`
- `frontend/src/features/pos/services/posService.js`
- Route in `frontend/src/main.jsx` to `/pos`
- Route wrapper for permission check using `PermissionContext`

## 5.7 AI Integration (Phase 2, Not Blocking MVP)

After core POS is stable:
- Add read-only POS tools for AI (`get_pos_transactions`, `get_pos_daily_summary`).
- Update `aiSystemPrompt.js` and `aiTools.js`.

---

## 6) Verification Plan

## 6.1 Unit Tests (Backend)
- VAT computation helper
- invoice number sequencing helper
- idempotency collision behavior
- usecase validation and domain error mapping

## 6.2 Integration Tests (Backend + DB)
- successful checkout decrements stock correctly
- insufficient stock causes full rollback
- duplicate idempotency key returns previous result (no double deduction)
- concurrent checkouts produce unique, monotonic invoice numbers
- Z-reading totals match same-day completed transactions

## 6.3 Frontend Tests
- POS page render and guard behavior
- checkout success/failure flows
- receipt print component snapshot/smoke

## 6.4 Required Commands
- `npm run check:architecture`
- `npm run lint:docs` (if docs changed)
- `npm run test:backend`
- `npm run test:frontend`

## 6.5 Operational Verification
- Validate telemetry/logging includes `request_id` and POS transaction references.
- Confirm `/health` remains healthy after migration rollout.

---

## 7) Rollout and Rollback

## 7.1 Rollout
1. Deploy migrations.
2. Deploy backend POS module behind feature flag (`POS_MVP_ENABLED`).
3. Deploy frontend `/pos` route hidden unless permission + flag enabled.
4. Enable for internal pilot tenants first.

## 7.2 Rollback
- Disable `POS_MVP_ENABLED` immediately if incident.
- Keep schema (non-destructive rollback) and block writes.
- Reconcile any partial pilot data via stock movement audit trail.

---

## 8) Exception Tracking

- Planned architecture allowlist additions: **none**
- Planned controller model-import exceptions: **none**
- Planned temporary guardrail exceptions: **none**

No unresolved exception dependency is introduced by this plan.

---

## 9) Execution Plan (Start Here)

## Phase 1: Foundations
1. Create migrations A-D.
2. Add models + associations + tenant model factory registration.
3. Add permissions and route stubs.

## Phase 2: Checkout Core
1. Implement `checkoutPosUseCase` with idempotency + invoice counter locking.
2. Integrate stock movement creation inside single transaction.
3. Implement POS repositories and controllers.

## Phase 3: Read APIs + Z-Reading
1. Implement list/detail transaction APIs.
2. Implement close-day and per-day summary APIs.
3. Add backend tests for all core flows.

## Phase 4: Frontend MVP
1. Add `/pos` route and terminal UI skeleton.
2. Wire checkout API and receipt print view.
3. Add frontend smoke tests and permission gating behavior.

---

## Final Opinion

The best MVP path is a dedicated POS domain model with shared inventory movement primitives, same-origin frontend routing, and strict idempotent checkout. It is the lowest-risk route to a reliable launch while preserving current architecture governance and minimizing side effects in existing Dispatch Order behavior.

---

## 10) Commit Batches by Phase (Prepared)

These batches are prepared to keep review scope clean and reversible.  
Run each commit in order.

## Phase A - POS Data + Backend Core
- Includes migrations, POS models, POS module, POS routes/controllers/validators, and POS backend tests.
- Recommended commit message:
  - `feat(pos): add POS schema, module, and backend transaction flow`

## Phase B - POS Frontend MVP
- Includes `frontend/src/features/pos/**` and route wiring needed for `/pos`.
- Recommended commit message:
  - `feat(pos-ui): add POS page, terminal flow, and service wiring`

## Phase C - Hardening and Quality Burn-Down
- Includes lint-debt removals and non-functional cleanup in backend runtime/services/scripts/seeders/templates/utils.
- Recommended commit message:
  - `chore(hardening): burn down lint debt and stabilize runtime paths`

## Phase D - Documentation + Release Ops
- Includes this plan update, testing/audit doc updates, cleanup of stale artifacts, and commit-batch guide docs.
- Recommended commit message:
  - `docs(release): update readiness evidence and phased commit plan`

## Suggested Command Pattern
1. `git add <phase file set>`
2. `git commit -m "<phase message>"`
3. `git push`

## Live Canary Note
- Keep canary-related changes in a separate follow-up commit once credentials and environment are available, so MVP hardening can ship independently.
