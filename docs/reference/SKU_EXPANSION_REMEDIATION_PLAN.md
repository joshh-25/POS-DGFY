---
status: reference
authority_level: reference
owner: expansion_program
last_reviewed: 2026-03-31
applies_to: skupervisor_expansion_remediation
topic: post_implementation_risk_burndown
---

# SKUpervisor Expansion Remediation Plan (Post-Implementation Audit)

## 1) Authoritative Sources Used

1. `docs/START_HERE.md` (`last_reviewed: 2026-03-06`)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (`last_reviewed: 2026-03-06`)
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (`last_reviewed: 2026-03-06`)
4. ADR `0001` to `0006`, especially:
- `docs/architecture/adr/0005-unified-sales-read-model.md`
- `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`

## 2) Audit Evidence Snapshot (2026-03-31)

Recent quality gate status used as baseline:

- `npm run check:architecture` -> pass
- `npm run lint:docs` -> pass
- `npm --prefix backend run migrate` -> pass (`No migrations were executed, database schema was already up to date`)
- `npm --prefix backend run doctor:runtime` -> healthy
- `npm --prefix backend run audit:indexes` -> healthy
- `npm --prefix backend run lint` -> pass
- `npm --prefix frontend run lint` -> pass
- `npm --prefix backend test` -> pass (`140 passed suites / 143 total`, `624 passed tests / 631 total`)
- `npm --prefix frontend test -- --run` -> pass (`15 files / 57 tests`)
- `npm run smoke:pos-local` -> pass (all local endpoint checks returned `200`)
- `npm run build:skupervisor` -> pass
- `npm run build:pos` -> pass
- `npm run build:store` -> pass

## 3) Root-Cause Matrix With Affected Areas

| ID | Finding | Root Cause | Hard Evidence | Affected Areas | Severity |
|---|---|---|---|---|---|
| F1 | Public order cancellation | Cancel endpoint has no store-auth middleware and use case does not enforce ownership | `backend/src/routes/store.js:32`, `backend/src/modules/store/controllers/storeHandlers.js:270-274`, `backend/src/modules/store/usecases/storeUseCases.js:1130-1166` | Public store API, order integrity, abuse surface | P0 |
| F2 | Public tracking leaks PII | Tracking endpoint reuses broad serializer containing customer/contact/address fields | `backend/src/routes/store.js:31`, `backend/src/modules/store/usecases/storeUseCases.js:125-162` | Privacy, regulatory exposure, scraping risk | P0 |
| F3 | Tracking PIN brute-force risk | PIN entropy is low and validation contract is inconsistent with message | `backend/src/modules/store/usecases/storeUseCases.js:12,57,230-234`, `backend/src/validators/storeValidator.js:64-66` | Track/cancel endpoints, abuse resistance | P1 |
| F4 | Sales recognition regression for online orders | Online checkout writes `status='completed'` before fulfillment; reporting filters rely on status only | `backend/src/modules/store/usecases/storeUseCases.js:1037,1051`, `backend/src/modules/pos/usecases/posUseCases.js:1390-1392`, `backend/src/modules/pos/repositories/posRepository.js:352-358,607-615`, `backend/src/modules/sales/repositories/salesRepository.js:163-190` | Z-reading, POS dashboard totals, unified sales page/CSV | P0 |
| F5 | Missing inventory movements for online orders | Online checkout path bypasses stock movement writes used by in-store checkout | In-store: `backend/src/modules/pos/usecases/posUseCases.js:669-678`; online store flow lacks equivalent call: `backend/src/modules/store/usecases/storeUseCases.js:1026-1078`; online status updates also do not write stock movements: `backend/src/modules/pos/usecases/posUseCases.js:1390-1401` | Stock accuracy, COGS confidence, oversell risk | P0 |
| F6 | Tenant isolation gap on store public flows | Tenant handler fail-open fallback to default context; store checkout/track/cancel do not require explicit tenant context | `backend/src/middleware/tenantHandler.js:36-41,61-63,69-73,90-92`, store use case tenant guard only used in auth/register/login: `backend/src/modules/store/usecases/storeUseCases.js:504,572` | Cross-tenant safety and default-context bleed risk | P1 |
| F7 | Operational settings not enforced | Location and ops flags are stored but not enforced during quote/checkout | `backend/src/models/TenantLocation.js:31-69`, `backend/src/modules/store/usecases/storeUseCases.js:438-490`, `backend/src/modules/store/repositories/storeRepository.js:27` | Invalid order acceptance when closed/inactive/unsupported method | P1 |
| F8 | Contract drift (`order_method`) and UX inconsistency | Expansion contract expects method/source split, but validators/docs/ui still keep legacy `online` method in write/read filters | ADR: `docs/architecture/adr/0006...:23-27`; validators/usecases: `backend/src/validators/storeValidator.js:3`, `backend/src/validators/posValidator.js:3`, `backend/src/modules/store/usecases/storeUseCases.js:9`; docs drift: `docs/api/specification.md:1679,1732`; frontend drift: `frontend/src/features/sales/pages/SalesPage.jsx:146-151` | API consistency, reporting filters, docs trust | P2 |
| F9 | Coverage gap for critical paths | No integration tests for store route auth, cancel ownership, online lifecycle accounting, and online stock side effects | `backend/tests/storeUsecases.applicationResult.test.js`, `backend/tests/storeHandlers.transport.test.js`, search results show no online lifecycle integration tests | Regression risk despite green CI | P1 |
| F10 | Stage split readiness is scaffold-only | Staged app entries are placeholder pages, not production app shells | `frontend/apps/skupervisor/src/main.jsx`, `frontend/apps/pos/src/main.jsx`, `frontend/apps/store/src/main.jsx` | Deploy readiness for multi-app rollout | P2 |

## 4) Phased Remediation Plan (Ordered by Risk Burn-Down)

### Phase R0 - Control Plane And Decision Lock

- [x] Freeze online-store rollout to non-production until R1-R3 pass.
- [x] Record this remediation plan in the phase checklist.
- [x] Capture fresh baseline gate outputs and link them in `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`.
- [x] Confirm decision items D1-D4 (see Section 6) before code changes.

Hard gate:

- No code merge without approved decisions and rollback notes.

### Phase R1 - Security Containment (F1, F2, F3)

- [x] Protect `PATCH /store/orders/:tracking_pin/cancel` with secure cancellation policy.
- [x] Enforce order ownership or equivalent proof for cancellation.
- [x] Split serializers: public tracking payload must exclude customer PII by default.
- [x] Increase tracking PIN entropy and align regex/message/contracts everywhere.
- [x] Add stricter store-specific rate limiter for track/cancel/auth endpoints.
- [x] Add structured security logging for repeated invalid tracking attempts.

Primary change surfaces:

- `backend/src/routes/store.js`
- `backend/src/modules/store/controllers/storeHandlers.js`
- `backend/src/modules/store/usecases/storeUseCases.js`
- `backend/src/validators/storeValidator.js`
- `backend/src/middleware/rateLimiter.js` (+ store route binding)

Hard gate:

- New integration tests must prove unauthorized cancellation cannot succeed.
- Public tracking response must not expose `customer_phone`, `customer_email`, `delivery_address`.

Current evidence (2026-03-31):

- `npm --prefix backend test -- storeUsecases.applicationResult.test.js` -> pass
- `npm --prefix backend test -- storeHandlers.transport.test.js storeUsecases.applicationResult.test.js` -> pass
- `npm --prefix backend run lint` -> pass
- `npm --prefix backend test` -> pass

### Phase R2 - Financial Recognition Integrity (F4)

- [x] Define a single "financially recognized sale" predicate for POS read/report flows.
- [x] Apply predicate to Z-reading summary and POS dashboard totals.
- [x] Apply predicate to unified sales repository default read path.
- [x] Keep in-store POS behavior unchanged while gating online rows by fulfillment completion.
- [x] Add regression tests for rejected/cancelled/placed online orders not counted as sales.

Primary change surfaces:

- `backend/src/modules/pos/repositories/posRepository.js`
- `backend/src/modules/sales/repositories/salesRepository.js`
- `backend/src/modules/pos/usecases/posUseCases.js` (if needed for contract output)
- `frontend/src/features/pos/components/TerminalSidebarPanel.jsx` (validation of totals)
- `frontend/src/features/sales/pages/SalesPage.jsx` (filter expectations)

Hard gate:

- Scenario proof: placed -> rejected order does not contribute to Z-reading, dashboard sales, or sales timeline totals.

Current evidence (2026-03-31):

- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "counts only financially recognized"` -> pass
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js` -> pass

### Phase R3 - Inventory Integrity For Online Orders (F5)

- [x] Introduce stock movement side effects for online lifecycle at the selected trigger point.
- [x] Add compensating movement flow for allowed cancellation transitions (if deduction happens before completion). (Not required for current trigger: deduct on `completed` only)
- [x] Enforce idempotent stock side effects so repeated lifecycle updates do not double-deduct.
- [x] Add integration tests covering acceptance, cancellation, completion, and movement ledger correctness.

Primary change surfaces:

- `backend/src/modules/pos/usecases/posUseCases.js`
- `backend/src/modules/store/usecases/storeUseCases.js`
- `backend/src/modules/pos/index.js` (dependency injection for stock movement service)
- Possibly migration/model extension if movement idempotency markers are needed.

Hard gate:

- Inventory delta from online lifecycle must match movement ledger exactly in test scenarios.

Current evidence (2026-03-31):

- `npm --prefix backend test -- posUsecases.applicationResult.test.js` -> pass
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "deducts inventory exactly once"` -> pass
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "does not deduct inventory for cancelled placed orders"` -> pass
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "covers online order tracking"` -> pass

### Phase R4 - Tenant Boundary Hardening (F6)

- [x] Add explicit tenant-context requirement middleware for store endpoints (at minimum checkout/track/cancel).
- [x] Ensure invalid/missing tenant token does not execute store public flows in default context.
- [x] Preserve current backward compatibility for routes intentionally using default context (document exceptions).
- [x] Add integration tests for missing/invalid `x-company-token` on store routes.

Primary change surfaces:

- `backend/src/middleware/tenantHandler.js` (if scoped change needed)
- New middleware (recommended): `backend/src/middleware/requireTenantContext.js`
- `backend/src/routes/store.js`
- Store handler tests and new route integration tests.

Hard gate:

- Store checkout/track/cancel must fail safe without valid tenant context.

Current evidence (2026-03-31):

- `npm --prefix backend test -- requireTenantContext.middleware.test.js` -> pass
- `backend/src/routes/store.js` now enforces `router.use(requireTenantContext)`
- `npm --prefix backend test -- storeRouteTenantContext.integration.test.js` -> pass

### Phase R5 - Operational Enforcement + Contract Harmonization (F7, F8)

- [x] Enforce location `is_active` and `is_open` at quote/checkout.
- [x] Enforce per-location method capabilities (`supports_delivery/pickup/dine_in`).
- [x] Enforce `pos_open_status` and wait-time semantics for storefront availability response.
- [x] Harmonize `order_source` vs `order_method` write contracts to avoid new `order_method='online'` writes.
- [x] Keep backward-compatible read handling for historical `online` rows.
- [x] Update frontend filters/options for `pickup` and legacy visibility strategy.

Primary change surfaces:

- `backend/src/modules/store/usecases/storeUseCases.js`
- `backend/src/modules/store/repositories/storeRepository.js`
- `backend/src/validators/storeValidator.js`
- `backend/src/validators/posValidator.js`
- `frontend/src/features/sales/pages/SalesPage.jsx`
- `docs/api/specification.md` and related docs.

Hard gate:

- Closed or unsupported locations cannot accept checkout/quote for blocked methods.

Current evidence (2026-03-31):

- `npm --prefix backend test -- storeUsecases.applicationResult.test.js` -> pass
- `npm --prefix frontend run lint` -> pass
- `docs/api/specification.md` updated for method contract (`pickup` + legacy `online` filter note)

### Phase R6 - Verification, Documentation, And Release Readiness (F9, F10)

- [x] Add full integration suite for store checkout -> POS lifecycle -> tracking -> reporting -> inventory.
- [x] Add negative-path security tests (cancel auth bypass, track PII contract, tenant context failure).
- [x] Update docs (API, database behavior notes, phase checklist evidence links).
- [x] Re-run full gate pack and attach outputs.
- [ ] Decide whether staged apps remain placeholders or are elevated to production shells in this release.

Required gates:

- `npm run check:architecture`
- `npm run lint:docs`
- `npm --prefix backend run doctor:runtime`
- `npm --prefix backend run audit:indexes`
- `npm --prefix backend run lint`
- `npm --prefix frontend run lint`
- `npm --prefix backend test`
- `npm --prefix frontend test -- --run`
- `npm run build:skupervisor`
- `npm run build:pos`
- `npm run build:store`

Hard gate:

- No production promotion unless R1-R4 are complete and green.

Current evidence (2026-03-31):

- `npm run check:architecture` -> pass
- `npm run lint:docs` -> pass
- `npm --prefix backend run doctor:runtime` -> healthy
- `npm --prefix backend run audit:indexes` -> healthy
- `npm --prefix backend run lint` -> pass
- `npm --prefix frontend run lint` -> pass
- `npm --prefix backend test` -> pass
- `npm --prefix frontend test -- --run` -> pass
- `npm run build:skupervisor` -> pass
- `npm run build:pos` -> pass
- `npm run build:store` -> pass
- `npm --prefix backend test -- storeHandlers.transport.test.js storeUsecases.applicationResult.test.js` -> pass (cancel/track negative path)
- `npm --prefix backend test -- storeRouteTenantContext.integration.test.js` -> pass (tenant-context failure coverage)
- `npm --prefix backend test -- posSalesReconciliation.db.integration.test.js -t "covers storefront checkout -> tracking"` -> pass
- `npm --prefix backend run migrate` -> pass (`20260331000008-make-pos-cashier-nullable-for-online-store` applied)
- Root-cause fixed: `pos_transactions.cashier_id` nullable contract enforced for online-store checkout inserts.

## 5) Cross-Boundary / ADR Impact

Current recommendation:

- No new ADR required if tenant hardening is scoped to store routes only and does not alter global tenant fallback policy.
- ADR addendum required if we change global `tenantHandler` behavior from fail-open to fail-closed.

## 6) Decision Items Requiring Product/Tech Signoff

D1. Guest cancellation policy (required before R1)

- Option A: account-authenticated cancellation only
- Option B: signed cancellation proof for guest orders
- Selected (2026-03-31): **Option B**

D2. Inventory movement trigger for online orders (required before R3)

- Option A: deduct on `confirmed`, restore on cancellation when allowed
- Option B: deduct on `completed` only (simpler, weaker reservation)
- Selected (2026-03-31): **Option B**

D3. Tenant hardening scope (required before R4)

- Option A: store-route fail-safe enforcement only
- Option B: global tenantHandler fail-closed redesign (cross-boundary)
- Selected (2026-03-31): **Option A**

D4. Public tracking payload policy (required before R1)

- Option A: status + non-sensitive order metadata only (recommended)
- Option B: include selected customer fields with explicit consent and risk acceptance
- Selected (2026-03-31): **Option A**

## 7) Rollback Strategy By Phase

- R1: route/middleware serializer rollback bundle.
- R2: read-model predicate rollback bundle (reporting only).
- R3: lifecycle stock-side-effect rollback bundle.
- R4: tenant-context enforcement rollback bundle.
- R5-R6: contract/docs/frontend rollback bundle.

Each phase must log:

- Trigger condition
- Last known good commit
- Forward-fix branch
- Verification evidence after rollback
