# Phase 9: POS Checkout & Payment - Research

**Researched:** 2026-07-13
**Domain:** Backend transactional POS module (Node.js ESM + Express + Sequelize/MySQL, Clean Architecture, multi-tenant DB-per-business)
**Confidence:** HIGH (codebase-verified — every integration port, model, and convention below was read directly from source this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flexible line-item editing before finalization; finalized Availment is immutable (no cancel/refund in Phase 9).
- **D-02 / D-18:** Soft-delete removed lines (`cancelled_at` flag, restore = set NULL); rows never physically deleted. Receipt shows only non-cancelled lines; full history preserved.
- **D-03:** Per-line `stock_effect_type` toggle (`inventory_issue` decrements stock / `stock_exempt` does not). Default derived from Product `inventory_mode` (`basic_inventory`→`inventory_issue`; `non_stock`→`stock_exempt`); staff may override per line before finalize.
- **D-04:** All discount types stack on one Availment: promo/discount codes + one staff manual discount + one SC/PWD statutory discount.
- **D-05:** **Independent (non-cascading) calculation.** Each discount computes on the ORIGINAL base subtotal, then all are summed and subtracted. SC/PWD is NOT applied to an already-discounted subtotal.
- **D-06:** SC/PWD verify via ID — optimistic camera scan with manual fallback. Backend STORES the ID (+ optional customer name) for audit; backend does NOT validate ID format in Phase 9.
- **D-07:** SC/PWD discount is **server-side only**: VAT-exclusive base, 20% off that base; shown as its own separate receipt line. MEMC 5% group-meal rule NOT implemented.
- **D-08:** Single payment method per Availment (Cash | GCash | Credit Card), selected at finalization. Split-tender deferred to Phase 11+.
- **D-09:** Automatic **server-side** cash change: `change_due = cash_received − total`. Client cannot submit an arbitrary change amount. GCash/Credit Card have no `change_due`.
- **D-10:** Payment records `payment_method` + `amount_received` only — NO live gateway capture/settlement.
- **D-11:** **Synchronous** receipt generation at finalization via `device-bridge`. Blocks the finalize call until print completes or fails in a controlled way.
- **D-12:** Store immutable `Receipt` records in the `dgfy_business_*` tenant schema (append-only, like `inventory_movements`).
- **D-13:** Tax = per-item hierarchical structure, but Phase 9 uses a uniform 12% VAT for all products. Compute per line, then sum.
- **D-14:** Receipt content includes all listed elements incl. compliance mode (Fiscal/Non-Fiscal).
- **D-15:** Call `assertComplianceGate({ businessId, operation: 'POS_CHECKOUT', requestedDocumentContext })` before finalize. Gate returns ALLOW / REQUIRES_SETUP / BLOCKED (mapped in code to a decision object or thrown DomainError). `compliant_active` may use fiscal + non_fiscal; only `non_compliant_active` is blocked from fiscal.
- **D-16:** Finalization requires an open shift for (cashier, terminal); DB-level one-open-shift invariant from Phase 8. No soft-check fallback.
- **D-17:** On finalize, create `inventory_movements` rows via `modules/inventory` for every `inventory_issue` line, `movement_type='sale'`, linked to the Availment. `modules/availments` NEVER writes movements directly (ADR 0029 single-writer).

### Claude's Discretion (planner decides)
- Exact endpoint/command names for availment create / line add-remove-modify / finalize (follow `routes → controllers → usecases → repositories → models`).
- Discount entity shape; whether promo codes are a DB table or hardcoded.
- Exact Receipt schema beyond the D-14 mandatory fields.
- Whether `modules/discounts` is separate or embedded in `modules/availments` (keep `modules/inventory` sole stock-effect writer).
- Timeout/error handling for synchronous receipt printing (device-bridge unavailable behavior).
- SC/PWD ID scanning library/approach (no OCR tool mandated).
- Whether customer name is a separate field or structured metadata.

### Deferred Ideas (OUT OF SCOPE)
- Split-tender (multi-payment per Availment) → Phase 11+ (design Payment as a separate entity, not a field on Availment).
- Live payment gateway capture/settlement/webhooks/refunds.
- MEMC 5% group-meal loyalty discount.
- Automatic compliance-state transitions (still manual).
- Availment cancellation & refunds (finalized = immutable).
- Per-category tax rates (schema supports; Phase 9 uses uniform 12%).
- New frontend apps (deferred milestone-wide — Phase 9 is backend-only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHK-01 | Add products to Availment, adjust qty, remove lines before finalize | `availment_items` table + soft-delete (`cancelled_at`); usecase mirrors `productUseCases` CRUD shape. Products read via existing `productRepository`/tenant `Product` model. |
| CHK-02 | Server-side totals AND cash change (`change_due = cash_received − total`); client cannot submit total/change | Compute entirely in the finalize usecase from stored line data; never trust client totals. Money-math approach in §Money & Tax. |
| CHK-03 | Discount code OR permission-gated manual discount, recorded with staff ID + reason | Discount rows carry `applied_by_staff_account_id` + `reason`; permission gate via existing `requireMembership` pattern (extend for a manual-discount permission). |
| CHK-04 | Select payment method (Cash/GCash/Credit Card) per Availment; record method + amount, not a gateway charge | Separate `payments` table (future-proof split-tender); no gateway calls (D-10). |
| CHK-05 | Completed Availment → receipt reflecting every discount + tax, gated by fiscal/compliance state | `assertComplianceGate` (verified port) + `receipts` table + device-bridge print. Receipt payload contract in §Code Examples. |
| CHK-06 | Availment cannot be recorded without an open shift for cashier+terminal | Look up open shift (see GAP: `ShiftRepository` has NO open-shift query yet — must add one) and bind `shift_id`; DB one-open-shift invariant already enforced. |
| FSC-03 | SC/PWD computed server-side per BIR (VAT-exclusive base, 20%), correct separate receipt lines | Server-side computation only (D-07); MEMC excluded. See §Money & Tax for BIR formula + the VAT-exemption open question. |
</phase_requirements>

## Summary

Phase 9 is a **new backend module `apps/dgfy-api/src/modules/availments`** plus its Tenant models and a migration. It is not greenfield in isolation — it plugs into four already-shipped Phase 8 foundations (compliance gate, inventory single-writer ledger, shift one-open invariant, tenant-connector/model registry). The dominant risk is NOT choosing libraries (this codebase is deliberately dependency-light) — it is **faithfully following the established Clean Architecture seams and the zero-`backend/`-writes constraint**, and **computing money correctly server-side** where the current codebase has no money utility and MySQL returns `DECIMAL` as JS strings.

Every layer has a concrete analog to copy: `productUseCases.js` / `inventoryMovementUseCases.js` (usecase + `ApplicationResult` + `DomainError` shape), `inventoryMovementRepository.js` / `shiftRepository.js` (tenant-DB resolution, `TenantDatabaseUnavailableError`, transaction-wrapped multi-table writes), `productController.js` + `routes.js` (transport-only controllers, `.catch(next)` routes), and `routes/index.js` (the single composition root where `buildAvailmentsModule(...)` gets wired and `/availments` mounted). The compliance gate and the inventory sale-effect are the two hand-off contracts Phase 8 explicitly built and left for Phase 9 to WIRE.

Three integration facts are load-bearing and each is a task the planner must not miss: (1) the inventory **sale effect is a reserved stub that throws 501** — Phase 9 must implement the real path through `recordMovementWithStockSync(..., movementType:'sale')`; (2) **`ShiftRepository` has no open-shift lookup method** — one must be added to bind `shift_id` at finalize; (3) new tables require a **migration-runner migration (`apps/dgfy-migration-runner`, allowed to edit) + a Tenant model file + registration in `tenantConnector.js`** — miss any one and the model is unreachable.

**Primary recommendation:** Build `modules/availments` by cloning the `modules/inventory` layer scaffold verbatim (repository error classes, `resolveDatabaseName`/`withModel`, usecase `ApplicationResult` returns, transport-only controller). Compute all money in **integer centavos** server-side. Wire the sale effect as a new `buildRecordSaleUseCase` inside `modules/inventory` (keeps ADR-0029 single-writer intact) and inject it into `modules/availments`. Call the device-bridge over HTTP via a new `apps/dgfy-api` client adapter (never edit `backend/device-bridge`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Availment/line CRUD, totals, change, discount composition | API / Backend (`modules/availments`) | — | CHK-02/D-09: all computation server-side; client cannot be trusted with totals. |
| Stock decrement on sale | API / Backend (`modules/inventory` sole writer) | `modules/availments` (requests effect) | ADR-0029 D-17: only inventory writes `inventory_movements`. |
| Compliance/fiscal gating | API / Backend (`modules/compliance` gate port) | `modules/availments` (caller) | FSC-02/D-15: one shared gate, called from inside the finalize usecase body. |
| Open-shift precondition | Database (unique generated-column constraint) + API read | `modules/availments` (looks up + binds) | D-16: DB is source of truth; usecase reads the open shift to attach `shift_id`. |
| Receipt printing | Device (host-side `backend/device-bridge` HTTP service) | `apps/dgfy-api` client adapter (calls it) | D-11: physical printer lives on the host; API is an HTTP client only (zero backend/ writes). |
| SC/PWD ID scan (OCR) | Browser / Client (future frontend, out of scope) | API stores the resulting string only | D-06: backend is a dumb store; no server-side OCR needed in Phase 9. |
| Money/tax/discount math | API / Backend | — | CHK-02/FSC-03: server-side authority. |

## Standard Stack

This codebase is intentionally dependency-light. **No new runtime dependency is required for Phase 9.** Everything is already present.

### Core (already installed — reuse, do not re-add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express` | (in `apps/dgfy-api`) | HTTP routing | Every existing module uses it. `[VERIFIED: apps/dgfy-api routes]` |
| `sequelize` | `^6.37.8` | ORM / tenant models + transactions | All Tenant models + repositories. `[VERIFIED: apps/dgfy-api/package.json]` |
| `mysql2` | `^3.6.5` | MySQL driver | Sequelize dialect for tenant DBs. `[VERIFIED: apps/dgfy-api/package.json]` |
| `umzug` | `^3.8.3` | Migration execution (in migration-runner) | Runs `apps/dgfy-migration-runner` schema migrations. `[VERIFIED: apps/dgfy-migration-runner/package.json]` |
| `jest` + `supertest` | jest `^29.7.0` | Unit + transport tests | Existing test convention (`tests/integration/commerce/...`). `[VERIFIED: apps/dgfy-api/tests]` |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `helmet`, `cors`, `morgan` | (in app.js) | Security headers / CORS / logging | Already applied app-wide; nothing to add. `[VERIFIED: apps/dgfy-api/src/app.js]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Integer-centavo money math (recommended, zero-dep) | `decimal.js` `10.6.0` `[VERIFIED: npm registry — OK, 69M weekly dl, official repo git+https://github.com/MikeMcl/decimal.js.git]` | decimal.js is battle-tested for arbitrary-precision decimals, but adds a dependency the codebase currently avoids and MySQL `DECIMAL` still round-trips as strings. Integer centavos (parse string→int, compute in int, format back) needs no dep and is exact for PHP currency. Only reach for decimal.js if fractional-centavo intermediate precision (e.g., 12% of an odd amount) proves awkward. |
| New `modules/discounts` module | Discount logic embedded in `modules/availments` | D-04/Claude's discretion. Embedding is simpler for MVP (discounts are computed, not independently queried); a separate module is only warranted if promo codes become a first-class queryable resource. Recommend **embedded** for Phase 9. |

**Installation:** None required. If the planner elects decimal.js (not recommended): `npm install decimal.js --workspace apps/dgfy-api`.

## Package Legitimacy Audit

Phase 9 installs **no new packages** under the primary recommendation. The one alternative evaluated:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `decimal.js` | npm | mature (10.x, last publish 2025-07-06) | ~69.2M/wk | github.com/MikeMcl/decimal.js | OK | Approved as optional alternative only; not recommended |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                          POS client (future FE, out of scope)
                                     │  HTTP  (bearer token)
                                     ▼
   apps/dgfy-api  /v1/availments/*   │   authenticateAccount middleware
   ┌─────────────────────────────────────────────────────────────────────┐
   │ routes.js ──▶ availmentController (transport-only, no model imports)  │
   │                    │                                                  │
   │                    ▼                                                  │
   │  availmentUseCases (Application layer, returns ApplicationResult)     │
   │    • createAvailment / addLine / updateLine / removeLine / restoreLine│
   │    • applyDiscount (permission-gated)                                 │
   │    • finalizeAvailment  ───────────────────────────────────┐         │
   │         │  (1) compute totals/VAT/discounts/change (int ¢)  │         │
   │         │  (2) assertComplianceGate({operation:'pos.checkout'})────┐  │
   │         │  (3) look up OPEN shift (cashier+terminal) ──────────┐   │  │
   │         │  (4) recordSale effect per inventory_issue line ─┐   │   │  │
   │         │  (5) persist Availment/Payment/Receipt (1 txn)   │   │   │  │
   │         │  (6) print receipt (sync HTTP to device-bridge)  │   │   │  │
   │         ▼                                                  │   │   │  │
   │  availmentRepository (owns Sequelize; tenant-DB resolved   │   │   │  │
   │    via tenantConnector.getModels(databaseName))            │   │   │  │
   └────────────┼──────────────────┼───────────────┼───────────┼───┼───┼──┘
                │                   │               │           │   │   │
        dgfy_business_* tenant DB   │      modules/inventory    │ modules/    │
        (availments, availment_     │      recordMovementWith-  │ compliance  │
         items, payments, receipts) │      StockSync(sale)      │ gate port   │
                                    │      → inventory_movements│             │
                            modules/shifts (open-shift lookup)  │             │
                                                                              │
                          backend/device-bridge (host HTTP service) ◀─────────┘
                          POST /device/print-receipt  (ESC/POS printer)
```
Trace the primary flow: request → controller → `finalizeAvailment` usecase → [compute money] → [gate] → [shift lookup] → [sale effect via inventory] → [persist in one txn] → [print] → receipt response.

### Recommended Project Structure (clone `modules/inventory` shape)
```
apps/dgfy-api/src/modules/availments/
├── index.js                              # buildAvailmentsModule() DI factory + createAvailmentRoutes export
├── routes.js                             # thin Express routes, .catch(next), authenticateAccount injected
├── controllers/
│   └── availmentController.js            # transport-only (NO model imports — eslint-enforced)
├── usecases/
│   ├── availmentUseCases.js              # create/addLine/updateLine/removeLine/restoreLine/applyDiscount/finalize
│   └── money.js                          # integer-centavo helpers (parse/compute/format) — server-side authority
├── entities/
│   └── availmentEntity.js               # domain shape + toPlain() (mirror productEntity.js)
└── repositories/
    ├── availmentRepository.js            # owns availments + availment_items + payments + receipts writes (1 txn)
    └── (optional) discountRepository.js  # only if promo codes become a DB table

apps/dgfy-api/src/models/Tenant/
├── Availment.js          # + register in infra/tenantConnector.js getModels() modelDefiners
├── AvailmentItem.js
├── Payment.js
└── Receipt.js

apps/dgfy-api/src/infra/
└── deviceBridgeClient.js  # NEW HTTP client for backend/device-bridge (never edit device-bridge itself)

apps/dgfy-migration-runner/src/migrations/schema/
└── 2026XXXXHHMMSS-create-availment-checkout.cjs   # meta.targetKind:'business', idempotent helpers
```

### Pattern 1: DI factory + composition-root wiring (MANDATORY)
**What:** Each module exposes `buildXModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository, ...ports })` returning `{ repository, useCases, ... }`, and `createXRoutes(useCases, { authenticateAccount })`. The ONLY place concrete instances are composed is `apps/dgfy-api/src/routes/index.js`.
**When to use:** Always — this is the project's Clean Architecture "Dependency Inversion" convention.
**Example (wire Phase 9 into the existing composition root):**
```js
// Source: apps/dgfy-api/src/routes/index.js (verified pattern) — ADD after booking wiring
import { buildAvailmentsModule, createAvailmentRoutes } from '../modules/availments/index.js';

const { useCases: availmentUseCases } = buildAvailmentsModule({
    tenantConnector,                         // reuse the SAME instance (never construct a 2nd)
    businessDatabaseRegistryRepository,
    businessRepository,
    productRepository,                       // read line-item prices/inventory_mode
    assertComplianceGate,                    // already built by buildComplianceModule (D-15)
    recordSaleEffect: inventorySaleUseCase,  // NEW sale usecase from modules/inventory (D-17)
    shiftRepository,                          // for open-shift lookup (CHK-06) — may need to expose it
    deviceBridgeClient                        // NEW infra adapter (D-11)
});
router.use('/availments', createAvailmentRoutes(availmentUseCases, { authenticateAccount }));
```
Note: `buildShiftsModule` currently returns `{ useCases }` only — to reuse its `shiftRepository` for the open-shift lookup, either expose the repository from `buildShiftsModule` or add a read usecase. `[VERIFIED: apps/dgfy-api/src/routes/index.js, shifts/index.js]`

### Pattern 2: Tenant-DB repository scaffold (copy verbatim)
**What:** Every tenant repository defines `TenantDatabaseUnavailableError` + domain error subclasses, `resolveDatabaseName(businessId)` (requires registry row `active` AND `verified_at`), `resolveModel`, `withModel`, and wraps multi-table writes in one `sequelize.transaction()`. Errors are duck-typed by `error.name` and mapped to `DomainError` in the usecase.
**When to use:** `availmentRepository.js` — identical structure to `inventoryMovementRepository.js` / `shiftRepository.js`.
**Example:** see `apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js` lines 65–339 `[VERIFIED]`.

### Pattern 3: Usecase returns `ApplicationResult`; controller stays transport-only
**What:** Usecases return `ApplicationResult.success(data)` / `ApplicationResult.failure(domainError)`; never throw for expected failures. Controllers call `sendUseCaseResult(res, result, 201)`. The `ApplicationResult.statusCode` getter reads the `DomainError.statusCode` so controllers never map HTTP codes.
**Example:** `apps/dgfy-api/src/modules/products/controllers/productController.js` + `shared/controllers/useCaseResponder.js` `[VERIFIED]`.

### Pattern 4: Gate called from INSIDE the usecase body (never middleware)
**What:** `assertComplianceGate(...)` is invoked within `finalizeAvailment`, not as route middleware. It THROWS a `DomainError` (403 DENY, 409 REQUIRES_SETUP) or RETURNS the ALLOW decision object.
**Example:**
```js
// Source: apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js (verified signature)
const decision = await assertComplianceGate({
    businessId,
    branchId: null,
    operation: 'pos.checkout',            // COMPLIANCE_OPERATION.POS_CHECKOUT
    requestedDocumentContext,             // 'fiscal' | 'non_fiscal' — from request (D-15)
    // artifacts/peripherals/settings/evidence default to [] / {} — see Pitfall 4
});
// decision.decision === 'allow' here; DENY/REQUIRES_SETUP already threw.
```
Because it throws, `finalizeAvailment` should either let the thrown `DomainError` propagate to Express's `errorHandler` OR catch and wrap into `ApplicationResult.failure`. Match whichever the planner picks consistently. `[VERIFIED: complianceGate.js]`

### Anti-Patterns to Avoid
- **Writing `inventory_movements` from `modules/availments`.** Violates ADR-0029 single-writer. Always go through the inventory sale usecase. `[VERIFIED: ADR-0029, inventoryEffectContracts.js header]`
- **Editing anything under `backend/`.** Hard constraint. `backend/device-bridge` and `backend/src/models/PosTransactionLine.js` are READ-ONLY reference. Call device-bridge over HTTP.
- **Trusting client-supplied totals / change / discount amounts.** CHK-02/D-09 — recompute everything server-side.
- **Importing a Tenant model directly in a controller.** `apps/dgfy-api/eslint.config.mjs` `no-restricted-imports` blocks `**/models` in controllers. `[VERIFIED: eslint.config.mjs]`
- **Adding `stock_effect_type` to `products`.** It lives on `availment_items` (per-line, D-03/D-07). `[VERIFIED: Product.js header comment]`
- **Float money math** (`0.1 + 0.2`). Use integer centavos. See §Money & Tax.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant DB resolution / connection | Custom connection lookup | `tenantConnector.getModels(databaseName)` + `resolveDatabaseName` scaffold | Already handles active/verified/provisioning states + caching. `[VERIFIED]` |
| Stock decrement + negative-stock guard + concurrency | New stock update code | `InventoryMovementRepository.recordMovementWithStockSync` (via a sale usecase) | Already does app-level guard + optimistic-concurrency WHERE + txn. `[VERIFIED]` |
| One-open-shift enforcement | App-level check | DB generated-column unique index (Phase 8) | Race-safe at DB layer; app only needs to READ the open shift. `[VERIFIED]` |
| Compliance/fiscal decisioning | Per-call-site checks | `assertComplianceGate` port | Single source of truth; 7-signal checklist for compliant_active. `[VERIFIED]` |
| HTTP response envelope | Custom JSON shapes | `ApplicationResult` + `sendUseCaseResult` | Consistent `{success,data,error,message}` + status mapping. `[VERIFIED]` |
| Receipt ESC/POS formatting | New formatter | POST the receipt payload to `device-bridge` `/device/print-receipt` | `receiptFormatter.js` already renders lines/discount/VAT/total. `[VERIFIED]` |
| Append-only immutability | App-only guard | DB BEFORE UPDATE/DELETE triggers (SIGNAL 45000) in the migration | Phase 8 precedent for `inventory_movements`/`cash_drawer_events`. Apply to `receipts`. `[VERIFIED: migration header]` |

**Key insight:** Nearly every "hard" part of a POS checkout (stock races, one-open-shift, fiscal gating, immutability) is already solved at the DB/port layer by Phase 8. Phase 9's job is orchestration + money math, not re-solving these.

## Money & Tax Computation

**Representation (verified):** All money columns are `DECIMAL(14,4)` (`shifts.opening_float_amount`, `products.base_price`, legacy `PosTransactionLine` amounts). `stock_count` is `DECIMAL(24,12)`. **MySQL/mysql2 returns `DECIMAL` columns as JavaScript strings**, and the existing code coerces loosely with `Number(...)` (e.g., `productUseCases` validates `base_price` via `Number.isFinite(Number(value))`). There is **no money/decimal utility anywhere in the repo** (`grep` for decimal.js/dinero/toFixed in modules → none). `[VERIFIED: grep]`

**Recommended approach — integer centavos (zero-dependency):**
1. At the boundary, parse `base_price` string → integer centavos: `Math.round(Number(priceString) * 100)`.
2. Do ALL arithmetic (line subtotals, discounts, VAT, total, change) in integer centavos.
3. Format back to `DECIMAL(14,4)` strings only when persisting/printing.
4. Define one rounding convention (round half-up on each discount/VAT computation) in `usecases/money.js` and reuse it everywhere — do not scatter `toFixed`.

**VAT (D-13, uniform 12%):** Philippine retail prices are conventionally **VAT-inclusive**. Compute per line, then sum (D-13). VAT-inclusive decomposition for a line total `L`: `vat = round(L − L/1.12)`, `net = L − vat`. `[ASSUMED]` that prices are VAT-inclusive — the codebase does not state inclusive vs. exclusive; **confirm with user** (Assumptions A1).

**SC/PWD (FSC-03 / D-07 / D-05):** BIR rule — Senior Citizen/PWD sales are **VAT-EXEMPT** and receive a **20% discount on the VAT-exclusive (net-of-VAT) selling price**. So for a VAT-inclusive line total `L`: base = `L/1.12`; SC/PWD discount = `round(base × 0.20)`. D-05 fixes this as independent (computed on the original base subtotal, not on an already-discounted amount) and D-07 fixes "VAT-exclusive base, 20%". `[CITED: BIR SC/PWD rule, RA 9994 / RA 10754 — general public knowledge; not verified against a live BIR source this session → treat as ASSUMED for exact edge behavior]`
- **Open nuance (A2):** BIR SC/PWD is also **VAT-exempt**, meaning the 12% VAT should be REMOVED for SC/PWD-qualified sales, not merely used as a base for the 20%. D-07 only specifies "VAT-exclusive base, 20% discount" and D-13 says uniform 12% VAT. Whether the SC/PWD receipt line ALSO zeroes the VAT on that sale is unspecified in the decisions. **Flag to user before implementing.** For a strict BIR-correct receipt, an SC/PWD sale shows: VATable = 0, VAT-exempt sales = base, less 20% SC/PWD discount.

**Change (D-09):** `change_due = cash_received − total`, integer centavos, server-side only; reject if `cash_received < total` for Cash. No `change_due` for GCash/Credit Card. `[VERIFIED: D-09]`

## Integration Ports (exact signatures — copy these)

### 1. Compliance gate — `assertComplianceGate` `[VERIFIED: modules/compliance/usecases/complianceGate.js]`
- **Obtain:** returned from `buildComplianceModule(...)` as `assertComplianceGate`; already constructed in `routes/index.js` and injectable.
- **Signature:** `assertComplianceGate({ businessId, branchId=null, operation, requestedDocumentContext, artifacts=[], peripherals=[], settings={}, evidence={}, now=new Date() })`
- **Operation constants** (`modules/compliance/policy/constants.js`): `POS_CHECKOUT='pos.checkout'`, `RECEIPT_RENDER='pos.receipt_render'`. `DOCUMENT_CONTEXTS = { FISCAL:'fiscal', NON_FISCAL:'non_fiscal', TRAINING_TEST:'training_test' }`.
- **Behavior:** returns the ALLOW decision object; THROWS `DomainError` 403 on DENY, 409 on REQUIRES_SETUP. For a `non_compliant_active` business (the default state) with `non_fiscal` context → ALLOW. For `compliant_active`, the gate consults a full 7-signal evidence checklist and returns REQUIRES_SETUP if `artifacts/peripherals/settings/evidence` are empty (the FSC-02 gap-closure). See Pitfall 4.

### 2. Inventory sale effect — MUST WIRE (currently a 501 stub) `[VERIFIED: inventoryEffectContracts.js + inventoryMovementRepository.js]`
- `recordSaleEffect(input)` in `inventoryEffectContracts.js` validates shape then **throws 501 (reserved)**. It is NOT wired.
- **The real write path** already exists: `InventoryMovementRepository.recordMovementWithStockSync(businessId, { productId, movementType:'sale', quantity, referenceType:'availment', referenceId, actorAccountId, actorStaffAccountId })`. `movement_type` ENUM already includes `'sale'`. `quantity` is the **signed delta** — a sale is a **negative** quantity (stock decrease); the repo guards against negative stock and uses optimistic concurrency.
- **Recommendation:** Add `buildRecordSaleUseCase({ repository, businessRepository })` to `modules/inventory/usecases/inventoryMovementUseCases.js` (mirror `buildRecordLossUseCase`, `signQuantity: q => -Math.abs(Number(q))`, `movementType:'sale'`), expose it from `buildInventoryModule`, and inject into `modules/availments`. This keeps `modules/inventory` the sole writer (ADR-0029) and avoids implementing the throwaway `recordSaleEffect` stub. Only `basic_inventory` products sync stock; `non_stock` still records a movement row but no stock delta (matches D-03 `inventory_issue` vs `stock_exempt` intent — but note: stock_effect_type is decided per Availment LINE, so only call the sale effect for `inventory_issue` lines).
- **Atomicity caveat:** `recordMovementWithStockSync` opens its OWN `sequelize.transaction()` per call. For a multi-line finalize you have two options: (a) loop and call it per `inventory_issue` line (each line atomic, but the overall finalize is not one transaction), or (b) add a batch sale method that records all lines + the availment/payment/receipt in ONE transaction. **Recommend (b)** for a trustworthy checkout (all-or-nothing). This likely means a new inventory repository method that accepts an external `transaction`, OR the availment repo owning the txn and calling a transaction-aware inventory method. Flag as a design task.

### 3. Open-shift lookup — GAP, must add `[VERIFIED: shiftRepository.js has no such method]`
- `ShiftRepository` exposes `openShift/closeShift/recordNoSalePop/findById/findAll` — **no query for "the open shift for (businessId, terminalId, cashierAccountId)".**
- Phase 9 needs it to bind `shift_id` to the availment (CHK-06/D-16). Add a read method, e.g. `findOpenShift(businessId, { terminalId, cashierAccountId })` → `Shift.findOne({ where:{ business_id, terminal_id, cashier_account_id, status:'open' } })`. `cashier_account_id` is the tenant-local `staff_accounts.id` (INTEGER), NOT the landlord UUID (D-13). If none found → 409/422 "no open shift". `[VERIFIED: Shift.js columns]`

### 4. Device-bridge receipt printing (D-11) `[VERIFIED: backend/device-bridge/server.js + receipts/receiptFormatter.js]`
- **Transport:** HTTP. `backend/device-bridge` is a separate host-side Express service. Auth via `requireBridgeAuth` (API key header). Endpoints: `GET /health`, `GET /device/status`, `POST /device/test-print`, **`POST /device/print-receipt`**, `POST /device/open-drawer`.
- **`POST /device/print-receipt` body:** `{ receipt, copies }` where the receipt payload shape consumed by `receiptFormatter.buildReceiptLines` is:
```js
{
  receipt: {
    business: { name, address, tin_branch, footer_message },
    transaction: {
      invoice_number, created_at,
      lines: [ { /* name/detail */, line_subtotal }, ... ],
      subtotal_amount, discount_amount, service_fee_amount,
      restaurant_service_charge_amount, vat_amount, total_amount
    },
    receipt_contract: { document_type: 'fiscal_invoice' | 'non_fiscal', version }
  },
  copies: 1
}
```
- **Zero backend/ writes:** create `apps/dgfy-api/src/infra/deviceBridgeClient.js` that POSTs to a configurable base URL (env, e.g. `DEVICE_BRIDGE_URL`, `DEVICE_BRIDGE_API_KEY`). Do NOT modify device-bridge.
- **Failure modes to design (D-11, Claude's discretion):** device-bridge unreachable, printer offline (500 `PRINTER_DISCOVERY_FAILED`/`TEST_PRINT_FAILED`), timeout. **Recommendation:** short timeout (e.g. 5s) via `AbortController`/`fetch`; persist the Availment/Payment/Receipt FIRST (money is authoritative and recorded), THEN attempt sync print; on print failure return success-with-print-warning (receipt is stored in DB per D-12 and re-printable) rather than rolling back a paid transaction. Present the alternative (fail-closed: roll back if print fails) to the user — D-11 says "or timeout/fails in a controlled way", so either is defensible; recommend record-then-warn to avoid losing a real payment. `[ASSUMED — planner/user decision]`

## Runtime State Inventory

Phase 9 is a **new module (greenfield within the app)**, not a rename/refactor. No existing runtime state is being renamed. The relevant "state" concern is the opposite — NEW state that must be registered so it is reachable:

| Category | Items | Action Required |
|----------|-------|------------------|
| New tenant tables | `availments`, `availment_items`, `payments`, `receipts` (+ optional `availment_discounts`) | New migration in `apps/dgfy-migration-runner/src/migrations/schema/*.cjs` (`meta.targetKind:'business'`), applied per tenant via `activate-tenant`/`schema migrate`. |
| New Tenant models | `models/Tenant/{Availment,AvailmentItem,Payment,Receipt}.js` | Create model files AND register each in `infra/tenantConnector.js` `getModels()` `modelDefiners` map — else `tenantConnector.getModels(db).Availment` is undefined. `[VERIFIED: tenantConnector.js lines 129–147]` |
| Existing tenant DBs already provisioned | Any `dgfy_business_*` schema created in Phase 8 | Must re-run the tenant migration to add Phase 9 tables (append-only migration; idempotent helpers). |
| Config/env | `DEVICE_BRIDGE_URL`, `DEVICE_BRIDGE_API_KEY` (new) | Add to env contract; device-bridge already reads its own `runtimeConfig.apiKey`. |
| Nothing renamed | — | None — no `dgfy-108`-style string rename in this phase. |

## Common Pitfalls

### Pitfall 1: Sale effect is an unwired 501 stub
**What goes wrong:** Calling `recordSaleEffect(...)` throws `RESERVED_EFFECT_NOT_IMPLEMENTED` (501). A plan that "calls the existing sale effect" will fail at runtime.
**Why:** Phase 8 deliberately reserved the contract without wiring it (D-06).
**How to avoid:** Implement the sale path via `recordMovementWithStockSync(..., movementType:'sale', quantity: negative)` inside a new inventory usecase (§Integration Ports #2).
**Warning signs:** 501 responses on finalize; `error_code: RESERVED_EFFECT_NOT_IMPLEMENTED`.

### Pitfall 2: New Tenant model not registered → `undefined` model
**What goes wrong:** Repository does `tenantConnector.getModels(db).Availment` → `undefined` → crash.
**Why:** `getModels` only wires models listed in its `modelDefiners` map.
**How to avoid:** Add each new model to `infra/tenantConnector.js` AND create the model file matching the migration columns exactly (like `Shift.js`/`Product.js` do).
**Warning signs:** `Cannot read properties of undefined (reading 'findOne')`.

### Pitfall 3: Missing open-shift query (CHK-06)
**What goes wrong:** No `ShiftRepository` method returns the open shift; plan can't bind `shift_id`.
**How to avoid:** Add `findOpenShift(businessId, { terminalId, cashierAccountId })` (§Integration Ports #3). Use tenant-local `staff_accounts.id` for cashier, not the landlord UUID.

### Pitfall 4: Compliance gate returns REQUIRES_SETUP for compliant_active with empty evidence
**What goes wrong:** For a `compliant_active` business, the gate now (post FSC-02 gap-closure) requires the full 7-signal checklist; passing no `artifacts/peripherals/settings/evidence` → 409 REQUIRES_SETUP, blocking checkout.
**Why:** Intentional fail-closed for fiscal readiness.
**How to avoid:** For Phase 9 MVP, businesses are `non_compliant_active` + `non_fiscal` context → ALLOW works with empty evidence. If a `compliant_active` + `fiscal` checkout must pass, the availment finalize must gather and pass the evidence inputs — likely out of Phase 9 scope; confirm which business states Phase 9 must support. `[VERIFIED: complianceGate.js header + policyEngine gap-closure notes]`

### Pitfall 5: DECIMAL-as-string float math
**What goes wrong:** `Number(base_price) * qty` accumulates float error; totals/VAT/change off by a centavo.
**How to avoid:** Integer-centavo math (§Money & Tax); parse strings once, compute in ints, format once.
**Warning signs:** Totals like `100.00000000001`; receipt vs. stored total mismatch.

### Pitfall 6: Touching `backend/`
**What goes wrong:** Editing `backend/device-bridge` or copying logic INTO backend violates the milestone-wide zero-`backend/`-writes rule.
**How to avoid:** device-bridge is called over HTTP; `PosTransactionLine.js` / `compliancePolicyEngine.js` are read-only pattern references. All new code under `apps/dgfy-api` / `apps/dgfy-migration-runner`.

### Pitfall 7: Multi-line finalize atomicity
**What goes wrong:** Looping per-line sale effects (each its own txn) + separate availment/receipt writes can leave a partially-committed sale if one line fails mid-loop.
**How to avoid:** Wrap the whole finalize (sale movements + availment + payment + receipt) in ONE transaction (§Integration Ports #2 caveat). Legacy precedent: one PosTransaction per purchase (Domain doc §9 "single-transaction-per-purchase").

## Code Examples

### Sale usecase to add in modules/inventory (mirror of buildRecordLossUseCase)
```js
// Source: derived from apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js (VERIFIED pattern)
export function buildRecordSaleUseCase({ repository, businessRepository }) {
    return buildMovementUseCase({
        repository,
        businessRepository,
        movementType: 'sale',                        // ENUM already reserves 'sale'
        validateQuantity: (q) => (isPositiveNumber(q) ? null : 'quantity must be a positive number for a sale.'),
        signQuantity: (q) => -Math.abs(Number(q))    // sale decreases stock
    });
}
```

### Transport-only controller (mirror productController)
```js
// Source: apps/dgfy-api/src/modules/products/controllers/productController.js (VERIFIED)
export function buildAvailmentController(useCases = {}) {
    return {
        async finalize(req, res) {
            const body = req.body || {};
            const result = await useCases.finalizeAvailment({
                businessId: body.businessId,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                paymentMethod: body.payment_method,        // Cash|GCash|Credit Card
                cashReceived: body.cash_received,          // ignored for non-cash
                requestedDocumentContext: body.requested_document_context, // fiscal|non_fiscal
                terminalId: body.terminal_id
            });
            return sendUseCaseResult(res, result, 201);
        }
    };
}
```

### AvailmentItem schema shape (from legacy PosTransactionLine reference, read-only)
```
availment_items (dgfy_business_* tenant):
  id INT PK, business_id CHAR(36), availment_id INT FK,
  product_id INT, product_name STRING(255),   -- snapshot name for receipt
  quantity DECIMAL(24,12), unit_price DECIMAL(14,4),
  stock_effect_type ENUM('inventory_issue','stock_exempt'),   -- D-03
  tax_treatment ENUM('vatable','vat_exempt','zero_rated') default 'vatable',  -- D-13
  tax_rate DECIMAL(5,4) default 0.1200,
  cancelled_at DATETIME NULL,                  -- D-02/D-18 soft delete
  created_at, updated_at
```
`[VERIFIED: backend/src/models/PosTransactionLine.js columns — pattern reference only, DO NOT import]`

### Migration file skeleton (idempotent, append-only receipts)
```js
// Source: apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs (VERIFIED)
module.exports = {
  meta: { destructive: false, targetKind: 'business' },   // business-only; never runs on dgfy_core
  async up(queryInterface, Sequelize) {
    // reuse verbatim helpers: tableExists / hasIndex / addIndexIfMissing / timestampColumns()
    // createTable('availments'/'availment_items'/'payments'/'receipts', {...})
    // for receipts: add BEFORE UPDATE / BEFORE DELETE triggers SIGNAL SQLSTATE '45000' (immutability)
  },
  async down(queryInterface) { /* drop in reverse dependency order */ }
};
```
Apply to a tenant: `node apps/dgfy-migration-runner/src/cli.js activate-tenant --database-name dgfy_business_<x>` (applies + verifies + marks registry active) or `schema migrate` for pending business migrations. `[VERIFIED: cli.js, activateTenant.js]`

## State of the Art

| Old Approach (legacy `backend/`) | Current Approach (`apps/dgfy-api`) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PosTransactionLine` model, controller-service pattern | Clean Architecture `routes→controllers→usecases→repositories→models` | Phases 4–8 refactor | Phase 9 must use the new layering, not the legacy service pattern. |
| `stock_movements` table name | `inventory_movements` (single-writer) | Phase 8 | Never use `stock_movements`; it's a rejected legacy name. |
| `stock_effect_type` on transaction line | Same field, on `availment_items` (per line, D-03) | Phase 9 | Decided per line at sale time, not on Product. |
| Compliance logic inline in engine | `assertComplianceGate` port + pure `policyEngine` | Phase 8 (D-05 deviation) | Call the port, don't re-implement decisions. |

**Deprecated/outdated:** `backend/src/modules/compliance/policy/compliancePolicyEngine.js` and `backend/src/models/PosTransactionLine.js` — read-only pattern references; superseded by the `apps/dgfy-api` equivalents.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | **CONFIRMED (D-19)** — Product prices are VAT-INCLUSIVE (VAT decomposed as `L − L/1.12`). | Money & Tax | Resolved: VAT-inclusive is now locked. |
| A2 | **CONFIRMED (D-20)** — SC/PWD sales are VAT-EXEMPT: zero the 12% VAT entirely AND take 20% off the net base (BIR-correct branch). | Money & Tax / FSC-03 | Resolved: implement the VAT-exempt branch (VATable=0, VAT-exempt sales=base, less 20%). |
| A3 | **CONFIRMED (D-22)** — Device-bridge print failure = record-then-warn / fail-open (persist money, print best-effort). | Integration Ports #4 / D-11 | Resolved: never roll back a recorded sale on print failure; receipt stored + re-printable. |
| A4 | **SUPERSEDED by D-21** — Phase 9 MUST support BOTH fiscal (`compliant_active`) and non_fiscal checkout. No longer non_fiscal-only. | Pitfall 4 → §Fiscal Checkout Evidence Path | Scope expanded; see the new `## Fiscal Checkout Evidence Path (D-21)` section for the full evidence mapping and new-field requirements. |
| A5 | Multi-line finalize should be ONE transaction (all-or-nothing) incl. sale movements | Integration Ports #2 / Pitfall 7 | Per-line-txn looping risks partial commits on failure. |
| A6 | BIR SC/PWD = 20% off VAT-exclusive base (RA 9994/10754 general rule) | Money & Tax | Not verified against a live BIR source this session; edge cases (minimum purchase, per-item vs per-transaction cap) unconfirmed. |

**If all assumptions are confirmed by the user in discuss/plan, this research is execution-ready.**

## Open Questions (RESOLVED)

> All four open questions are now resolved by locked decisions and the Phase 9 plan set. Inline resolutions below.

1. **VAT inclusive vs. exclusive + SC/PWD VAT-exemption (A1/A2/A6).** → **RESOLVED by D-19 + D-20.** Stored prices are VAT-INCLUSIVE (VAT decomposed per line as `L − L/1.12`, D-19); an SC/PWD sale is VAT-EXEMPT (zero the 12% VAT AND take 20% off the net base, D-20). Locked as the money.js golden-test basis in plan 09-02.
   - Original: are stored prices VAT-inclusive, and does an SC/PWD sale zero the VAT?

2. **Multi-line + sale-movement atomicity (A5).** → **RESOLVED: availments owns the outer transaction (09-04 `finalizePersist`).** Finalize opens ONE `sequelize.transaction`, threads the transaction into each `recordSaleEffect`, and re-throws any non-success sale-effect `ApplicationResult` so an insufficient-stock decrement rolls the whole sale back (single atomic unit, Pitfall 7).
   - Original: should inventory expose a transaction-aware sale method, or does availments own the outer txn?

3. **Which compliance business states must checkout support (A4)?** → **RESOLVED by D-21 (supersedes A4).** Phase 9 supports BOTH `non_compliant_active`/`non_fiscal` AND `compliant_active`/fiscal checkout; the finalize usecase (09-06) assembles and passes the full evidence bundle via the interim per-business attestation store (option B / A8). Fiscal checkout hard-fails on incomplete evidence (D-24), never a silent downgrade.
   - Original: confirm which compliance business states checkout must support.

4. **Promo codes: DB table or omitted?** → **RESOLVED: dedicated `availment_discounts` table (plan 09-01).** Each discount (promo_code | manual | sc_pwd) is one row carrying `discount_type`, `code` (free-text, stored-not-validated per D-06 precedent), `amount`/`percent`, `applied_by_staff_account_id`, and `reason`. This satisfies CHK-03 (staff id + reason) and D-14 (each discount listed separately on the receipt) — a single aggregate `discount_amount` column could not.
   - Original: DB table or omitted, and how are codes stored/validated?

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MySQL (tenant `dgfy_business_*` DB) | All persistence | ✓ (dev: lima-dgfy-dev per STATE) | 8.0 | None — required for live finalize; unit/transport tests mock (see below). |
| `apps/dgfy-migration-runner` (umzug) | New table migration | ✓ | umzug ^3.8.3 | None. |
| `backend/device-bridge` host service | Sync receipt print (D-11) | ✗ in CI / not always running | — | Record-then-warn (A3): persist receipt in DB, skip/queue print; unit-test via mocked `deviceBridgeClient`. |
| Physical ESC/POS printer | Actual paper receipt | ✗ in dev/CI | — | device-bridge `test-print`/mock; receipt stored in DB (D-12) regardless. |

**Missing dependencies with no fallback:** MySQL for live end-to-end finalize (mirrors Phase 8 UAT needing live MySQL — see STATE 08-UAT blocker).
**Missing dependencies with fallback:** device-bridge + printer — use mocked client + DB-stored receipts; matches the existing `commerceModulesMount.test.js` convention of testing transport/wiring without live hardware.

## Validation Architecture

> Note: `workflow.nyquist_validation` is `false` in config, so formal Nyquist gating is off. This section is included because the orchestrator requested it and the codebase has clear test seams.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` + supertest (ESM via `--experimental-vm-modules`) |
| Config file | `apps/dgfy-api/jest.config.cjs` (`roots: ['<rootDir>/tests']`, 30s timeout) |
| Quick run | `cd apps/dgfy-api && npm test -- tests/unit/modules/availments` (after Wave 0 files exist) |
| Full suite | `cd apps/dgfy-api && npm test` |
| Arch guard | `npm run check:compat-boundary` (ensures no legacy/compat imports) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | Exists? |
|-----|----------|-----------|---------|---------|
| CHK-01 | line add/adjust/remove/restore (soft delete) | unit (usecase) | `npm test -- tests/unit/modules/availments/availmentUseCases.test.js` | ❌ Wave 0 |
| CHK-02 | server-side totals + change; reject client total | unit (money.js) | `npm test -- tests/unit/modules/availments/money.test.js` | ❌ Wave 0 |
| CHK-03 | discount recorded w/ staff id + reason; permission gate | unit | same usecase test | ❌ Wave 0 |
| CHK-04 | payment method + amount recorded, no gateway | unit + integration | availment finalize test | ❌ Wave 0 |
| CHK-05 | receipt reflects discounts/tax; gated | integration (mock gate + device client) | `tests/integration/availments/finalize.test.js` | ❌ Wave 0 |
| CHK-06 | reject finalize with no open shift | unit (mock shift repo) | usecase test | ❌ Wave 0 |
| FSC-03 | SC/PWD 20% VAT-exclusive base, separate line | unit (golden example) | `money.test.js` | ❌ Wave 0 |
| Mount | `/v1/availments/*` returns 401 not 404 | transport | extend `tests/integration/commerce/commerceModulesMount.test.js` | ⚠️ extend existing |

### Sampling
- Per task commit: `npm test -- <touched test>` + `npm run check:compat-boundary`.
- Per wave/phase gate: full `npm test` green.

### Wave 0 Gaps
- [ ] `tests/unit/modules/availments/money.test.js` — golden money/VAT/SC-PWD/change cases (CHK-02, FSC-03).
- [ ] `tests/unit/modules/availments/availmentUseCases.test.js` — CRUD + finalize orchestration with mocked ports.
- [ ] `tests/integration/availments/finalize.test.js` — finalize with mocked `assertComplianceGate`, inventory sale usecase, `deviceBridgeClient`.
- [ ] Extend `commerceModulesMount.test.js` with an `/v1/availments/...` 401 assertion.
- [ ] Test helper reuse: `tests/helpers/tenantSchemaProvisioning.js` provisions a real tenant schema for live-DB integration (mirrors Phase 8).

## Security Domain

`security_enforcement: true`, ASVS level 1, block-on high.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `authenticateAccount` middleware on every `/availments` route (verified pattern). |
| V4 Access Control | yes | `requireMembership`/`guardBusinessAccess` (active member) for reads; add a manual-discount permission check for CHK-03; cashier bound to open shift (CHK-06). |
| V5 Input Validation | yes | Validate `quantity`, `payment_method` enum, `cash_received` numeric ≥ 0, `requested_document_context` enum, `businessId` present — in the usecase (mirror existing `validationError` pattern). Reject client-supplied `total`/`change` entirely (CHK-02/D-09). |
| V6 Cryptography | no | No new crypto; device-bridge API key handled by env (never hard-code). |
| V7 Error Handling/Logging | yes | Use `DomainError` + `ApplicationResult`; do not leak SQL/tenant DB names in messages (existing code maps to stable `error_code`s). |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client submits arbitrary total/change/discount | Tampering | Recompute all money server-side; ignore client totals (CHK-02/D-09). |
| Cross-tenant data access via forged `businessId` | Elevation of Privilege / Info Disclosure | `guardBusinessAccess` membership check + tenant-DB resolution scoped to `businessId`; all `WHERE business_id = ?`. |
| SQL injection | Tampering | Sequelize parameterized queries only (no raw string SQL in module code; migration triggers are static DDL). |
| Selling with no open shift (unauthorized cash handling) | Repudiation | CHK-06 open-shift binding + DB one-open-shift invariant. |
| Mutating a finalized/immutable receipt or availment line | Tampering | Append-only `receipts` (DB triggers), soft-delete lines only, finalized availment immutable (D-01). |
| Discount abuse (unlogged manual discounts) | Repudiation | CHK-03 records `applied_by_staff_account_id` + `reason`; permission-gate manual discounts. |
| device-bridge API key exposure | Info Disclosure | Store `DEVICE_BRIDGE_API_KEY` in env; never in code/logs. |
| Double-finalize / replay | Tampering | Idempotency: reject finalize if availment already finalized; single-txn finalize. |

## Project Constraints (from CLAUDE.md + governance)
- **Zero `backend/` writes** (PROJECT.md, milestone-wide): no edits to any file under `backend/`, including `device-bridge`, not even an approved seam. All Phase 9 code under `apps/dgfy-api` and `apps/dgfy-migration-runner`. `backend/src/models/PosTransactionLine.js` and `backend/src/modules/compliance/policy/compliancePolicyEngine.js` are READ-ONLY references.
- **Clean Architecture layering** (`docs/architecture/ARCHITECTURE_BOUNDARIES.md`): `routes → controllers → usecases → repositories → models`; controllers transport-only; repositories own Sequelize; entities/usecases must not import compat/continuity code (eslint-enforced, CMP-03).
- **ADR-0029 single-writer:** only `modules/inventory` writes `inventory_movements`.
- **ADR-0003 no-legacy-mutation:** Phase 9 tables are genuinely new `dgfy_business_*` tables; no FK into legacy `items`/`PosTransactionLine`.
- **Cross-database references are opaque `CHAR(36)` UUID columns with NO foreign key** (`business_id`, `customer_account_id`, etc.); same-DB FKs use INTEGER PKs.
- **`npm run check:architecture` / `check:compat-boundary`** must pass for implementation phases (DoD).

## Sources

### Primary (HIGH confidence — read this session)
- `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js` — gate signature, throw/return semantics, 7-signal checklist.
- `apps/dgfy-api/src/modules/compliance/policy/constants.js` — `COMPLIANCE_OPERATION`, `DOCUMENT_CONTEXTS`.
- `apps/dgfy-api/src/modules/inventory/{usecases/inventoryMovementUseCases.js, usecases/inventoryEffectContracts.js, repositories/inventoryMovementRepository.js, index.js}` — sale-effect stub, `recordMovementWithStockSync`, usecase/DI patterns.
- `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` + `models/Tenant/Shift.js` — open-shift columns, missing lookup method.
- `apps/dgfy-api/src/modules/products/{controllers/productController.js, routes.js, entities/productEntity.js, usecases/productUseCases.js}` — controller/routes/entity/money-validation patterns.
- `apps/dgfy-api/src/{routes/index.js, app.js, infra/tenantConnector.js, shared/contracts/applicationResult.js, shared/controllers/useCaseResponder.js}` — composition root, `/v1` mount, model registry, result envelope.
- `apps/dgfy-api/src/models/Tenant/Product.js` — `DECIMAL(14,4)` money, `DECIMAL(24,12)` stock.
- `apps/dgfy-migration-runner/src/{cli.js, commands/activateTenant.js, commands/schema.js, migrations/schema/20260712100000-create-commerce-foundation.cjs}` — migration mechanism, `meta.targetKind:'business'`, idempotent helpers, append-only triggers.
- `backend/device-bridge/{server.js, receipts/receiptFormatter.js}` — print endpoint + receipt payload contract (read-only).
- `backend/src/models/PosTransactionLine.js` — legacy line schema (read-only reference).
- `.planning/phases/09-.../09-CONTEXT.md`, `.planning/REQUIREMENTS.md` (CHK-01..06, FSC-03), `.planning/config.json`.

### Secondary (MEDIUM confidence)
- `apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js` — transport-test convention.

### Tertiary (LOW confidence)
- BIR SC/PWD rule (RA 9994 / RA 10754) — general knowledge, not verified against a live BIR source this session (A2/A6).
- `decimal.js` legitimacy — `[VERIFIED: gsd-tools package-legitimacy → OK]`, but recommendation is zero-dep integer math.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all verified in package.json + source.
- Architecture / integration ports: HIGH — every port read directly from source, exact signatures captured.
- Money/tax/BIR specifics: MEDIUM — representation verified; VAT-inclusive assumption and SC/PWD VAT-exemption need user confirmation (A1/A2/A6).
- Pitfalls: HIGH — derived from actual stub/registration/gap facts in the code.

**Research date:** 2026-07-13
**Valid until:** ~2026-08-13 (stable internal codebase; re-verify if Phase 8 modules change).

---

## Fiscal Checkout Evidence Path (D-21)

> **Added 2026-07-13** after D-21 expanded scope: Phase 9 MUST support BOTH `non_fiscal` (default/Omni) and `fiscal` (`compliant_active`, on-request Official Receipt) checkout. This section maps, from the actual compliance source, exactly what the finalize usecase must pass for a `compliant_active` + `fiscal` checkout to return ALLOW — and what is NOT yet obtainable from the Phase 8/9 data model. Supersedes assumption A4.

### 0. The load-bearing finding (read first)

The persisted `compliance_mode_state` row stores **only** `state`, `compliance_profile` (JSON), `active_policy_pack_version`, and the three verification fields — **NOT** artifacts, peripherals, settings, or the evidence signals. `[VERIFIED: complianceModeStateRepository.js:292-308 toPlain(); models/Tenant/ComplianceModeState.js]`

The gate loads that row and builds its `tenant` context, then passes `artifacts`, `peripherals`, `settings`, `evidence` **straight through from the caller's `input`, defaulting to `[] / [] / {} / {}`** — it does NOT source them from anywhere. `[VERIFIED: complianceGate.js:92-101 (destructured defaults) and :132-141 (forwarded verbatim to evaluateComplianceDecision)]`

**Consequence:** For a `compliant_active` business, `POS_CHECKOUT` runs the full `evaluateComplianceChecklist`. With empty inputs, `profile_complete`/`settings_complete`/`artifacts_complete`/`peripherals_complete`/`ready_for_compliant_activation` all evaluate false, so the gate returns **REQUIRES_SETUP** (or DENY for peripherals) and the fiscal sale is blocked. `[VERIFIED: policyEngine.js:947-1035]` The finalize usecase therefore has to **actively assemble and pass the complete evidence bundle** — and most of that bundle has **no storage home** in the current schema (see §4).

### 1. Exact evidence inputs required for `compliant_active` + `fiscal` ALLOW

The active policy pack is `2026.04.07` (the only pack; effective 2026-04-07). `[VERIFIED: policyPacks.js:8-61, getActivePolicyPack]` For `POS_CHECKOUT` the engine calls `evaluateComplianceChecklist` and then gates on four section flags plus `ready_for_compliant_activation` (which folds in seven more evidence-derived signals). All must be satisfied:

**(a) Profile fields** — read from the persisted `compliance_mode_state.compliance_profile` JSON (the gate maps `stateRow.compliance_profile` → `tenant.compliance_profile` `[VERIFIED: complianceGate.js:124-126]`; the checklist normalizes it against `COMPLIANCE_PROFILE_DEFAULT`). Required (validated by `checkProfileField`, `[VERIFIED: policyPacks.js:22-45, policyEngine.js:177-201]`):
| Field path | Type | Validity rule |
|---|---|---|
| `bir.software_accreditation_number` | string | non-empty |
| `bir.software_accreditation_valid_until` | date string | `YYYY-MM-DD` ≥ today |
| `bir.tax_classification_controls_confirmed` | boolean | true-like |
| `bir.non_resettable_grand_total_enabled` | boolean | true-like |
| `bir.mandatory_receipt_fields_confirmed` | boolean | true-like |
| `bir.rmo_24_2023_filing_verified` | boolean | true-like |
| `bir.fiscal_document_content_reviewed` | boolean | true-like |
| `bir.terminal_registration_controls_confirmed` | boolean | true-like |
| `bir.ejournal_integrity_controls_confirmed` | boolean | true-like |
| `bir.esales_reporting_controls_confirmed` | boolean | true-like |
| `npc.dpo_name` | string | non-empty |
| `npc.dpo_email` | string | non-empty |
| `npc.dps_registration_number` | string | non-empty |
| `npc.dps_registration_valid_until` | date string | ≥ today |
| `npc.breach_notification_procedure_confirmed` | boolean | true-like |
| `readiness.tests_passed` | boolean | true-like (always required, `[VERIFIED: policyEngine.js:378-381]`) |
| `bsp.ops_registration_status` = `'active'`, `bsp.payment_control_reviewed` = true | — | **only when** `bsp.ops_registration_required` is true-like `[VERIFIED: policyEngine.js:369-376]` |

**(b) Settings** — passed as `settings` input, shape `{ <key>: { value: <non-empty> } }`. Required keys (`bir.required_settings_keys`): `pos_business_name`, `pos_tin_branch`, `pos_address`, `pos_ptu_number`, `pos_min_number`, `pos_accreditation_number`. A key is missing if `settings[key].value` is null/blank. `[VERIFIED: policyPacks.js:14-21, policyEngine.js:425-428]`

**(c) Artifacts** — passed as `artifacts` array; each item `{ artifact_type, verification_status:'verified', status:'valid', valid_until? }`. An artifact counts only if `verification_status==='verified'` AND `status==='valid'` AND (`valid_until` absent OR ≥ now). Required types: `bir_accreditation_certificate`, `bir_ptu_document`, `npc_dps_certificate` (+ `bsp_ops_certificate` only when OPS required). `[VERIFIED: policyEngine.js:141-147, 400-415; policyPacks.js:34-54]`

**(d) Peripherals** — passed as `peripherals` array; each `{ device_class, verification_status:'verified', status:'accredited', accreditation_valid_until?, is_shared?/terminal_id? }`. Required classes: `receipt_printer`, `cash_drawer`. A device must be accredited+verified+unexpired AND eligible for the checkout `terminal_id` (either `is_shared===true` or `terminal_id` matches `context.terminal_id`). Missing peripherals return **DENY** (not REQUIRES_SETUP): `ACCREDITED_PERIPHERAL_REQUIRED`, or `TERMINAL_DEVICE_MISMATCH` when a `terminal_id` is supplied. `[VERIFIED: policyEngine.js:149-175, 417-423, 986-1001]`

**(e) The seven evidence-derived signals** — passed inside the `evidence` object; each must be exactly `true`/`ready:true`. `[VERIFIED: policyEngine.js:383-398, 693-706]`
| # | Signal | Required `evidence` shape |
|---|--------|---------------------------|
| 1 | Fiscal accumulator stream | `evidence.fiscal_accumulator_stream_ready === true` |
| 2 | Audit-log append-only enforced | `evidence.audit_log_append_only_enforced === true` |
| 3 | Payment-handoff policy | `evidence.payment_handoff_policy_ready === true` |
| 4 | Encryption policy prerequisites | `evidence.encryption_policy_prerequisites_ready === true` |
| 5 | Submission documentary readiness | `evidence.submission_artifacts.ready === true` |
| 6 | RMO 24-2023 filing readiness | `evidence.rmo_filing_readiness.ready === true` |
| 7 | Fiscal terminal registration | `evidence.fiscal_terminal_registration.ready === true` |

`ready_for_compliant_activation` is the AND of all four section-completes + `readiness_tests_passed` + these seven. `[VERIFIED: policyEngine.js:693-706]`

**(f) Context** — `context.terminal_id` (for peripheral eligibility); for non-cash payments also `context.payment_type` and `context.payment_handoff_mode` (see §2 BSP note).

### 2. Exact call signature — fiscal vs non_fiscal path

Both paths call the SAME injected port (`assertComplianceGate`, `operation: COMPLIANCE_OPERATION.POS_CHECKOUT` = `'pos.checkout'`). The ONLY required difference is `requestedDocumentContext` and, for fiscal, the evidence bundle:

```js
// NON-FISCAL path (default / Omni build) — works for any state incl. compliant_active
const decision = await assertComplianceGate({
  businessId, branchId: null,
  operation: 'pos.checkout',
  requestedDocumentContext: 'non_fiscal',   // DOCUMENT_CONTEXTS.NON_FISCAL
  // artifacts/peripherals/settings/evidence NOT needed:
  //   non_compliant_active + non_fiscal  → ALLOW  (policyEngine.js:873-880)
  //   compliant_pending  + non_fiscal    → ALLOW  (policyEngine.js:914-922)
  //   compliant_active   + non_fiscal    → still runs the checklist (POS_OPERATIONS),
  //     so a compliant_active business ALSO needs the full bundle even for non_fiscal!  ⚠
});

// FISCAL path (Official-Receipt request; only valid when compliant_active)
const decision = await assertComplianceGate({
  businessId, branchId: null,
  operation: 'pos.checkout',
  requestedDocumentContext: 'fiscal',       // DOCUMENT_CONTEXTS.FISCAL
  artifacts,        // §1(c) — verified+valid, all required types
  peripherals,      // §1(d) — accredited+verified, receipt_printer + cash_drawer, terminal-eligible
  settings,         // §1(b) — all six required keys with non-empty .value
  evidence,         // §1(e) — all seven signals true/ready
  // profile comes from the persisted state row (loaded by the gate), NOT this call
});
```

**Return / throw behavior** (`[VERIFIED: complianceGate.js:143-151]`): on `ALLOW` the port **returns the decision object** (`{ decision:'allow', reason_code:'ALLOWED', mode_state, receipt_contract, checklist, obligations }`); on `DENY` it **throws** `DomainError` 403 (`AUTHORIZATION_FAILED`, `details.reason_code`, `details.decision`); on `REQUIRES_SETUP` it **throws** `DomainError` 409 (`CONFLICT`, same details). There is no separate "BLOCKED" string — a hard block surfaces as the **DENY→403** throw (e.g. `NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED` when a `non_compliant_active` business requests `fiscal`, `[VERIFIED: policyEngine.js:842-855]`).

**Two nuances the finalize usecase must handle:**
- ⚠ **compliant_active + non_fiscal still runs the checklist.** `POS_CHECKOUT` is in `POS_OPERATIONS`, so ANY checkout by a `compliant_active` business (fiscal OR non_fiscal) evaluates the full evidence bundle. `[VERIFIED: policyEngine.js:947-948, constants.js:131-135]` So the evidence bundle is required whenever `state==='compliant_active'`, regardless of document context — not only for fiscal. (A `non_compliant_active` business never hits the checklist.)
- ⚠ **Non-cash BSP sub-gate.** For `POS_CHECKOUT` with a non-cash `context.payment_type` (GCash/Credit Card) and `payment_handoff_mode !== 'external'`, the engine runs `evaluateBspGate`; if the profile marks OPS required but not active/reviewed it returns **DENY** `BSP_OPS_REGISTRATION_REQUIRED`/`BSP_PAYMENT_CONTROL_REQUIRED`. `[VERIFIED: policyEngine.js:781-800, 203-239]` Since D-10 records payments without a live gateway, pass `context.payment_handoff_mode: 'external'` for GCash/Credit Card to stay on the intended (non-capture) path and avoid spurious denials.

### 3. What finalize must do on REQUIRES_SETUP / DENY (fiscal checkout)

Because the port throws, the finalize usecase should catch the `DomainError` and convert to `ApplicationResult.failure` (or let it propagate to Express `errorHandler`) — but for a fiscal checkout it must **reject the sale** (do not silently downgrade to non-fiscal without an explicit rule). Recommended behavior:
- **REQUIRES_SETUP (409):** reject; surface the missing items. The thrown error carries `details.decision.checklist` with `missing_profile_fields`, `missing_setting_keys`, `missing_artifacts`, `missing_peripheral_classes`, and `activation_blockers[]` (each `{ code, section, message, action_target }`), plus `next_blocking_step`. `[VERIFIED: policyEngine.js:633-649, 526-628; complianceGate.js:55-59]` Return these so staff/ops know exactly which signal is missing.
- **DENY (403):** reject; this is a hard block (wrong state for fiscal, peripheral mismatch, or BSP OPS gate). Do not retry as fiscal.
- **Fallback question (planner/user):** should a failed fiscal request auto-fall-back to a `non_fiscal` sale, or hard-fail so the customer is told "Official Receipt unavailable"? Not specified by D-21 — flag it (see Assumption A7). Recommend **hard-fail with a clear reason** for fiscal (Official Receipts are a legal artifact; silent downgrade is risky).
- On **ALLOW**, use `decision.receipt_contract` for the printed/stored document type: `compliant_active` → `{ document_type:'fiscal_invoice', label:'FISCAL INVOICE', document_context:'fiscal' }`; otherwise `non_fiscal_slip`. This maps directly to device-bridge's `receipt_contract.document_type === 'fiscal_invoice'` branch (§Integration Ports #4) and satisfies D-14's "compliance mode on receipt". `[VERIFIED: policyEngine.js:710-724, 742; receiptFormatter.js:85]`

### 4. Evidence signals NOT obtainable from the Phase 9 data model — concrete new-field requirements

The gate expects the bundle but Phase 8 shipped **no producer/storage** for most of it. This is the real cost of D-21. Concrete gaps the planner must resolve (either build storage, or define an interim attestation source):

| Bundle input | Persistence today | New requirement for fiscal support |
|---|---|---|
| `compliance_profile` (all §1a fields) | ✅ stored on `compliance_mode_state.compliance_profile` JSON `[VERIFIED]` | Needs a WRITE path/UI to populate it — `upsertState()` exists `[VERIFIED: complianceModeStateRepository.js:206-251]` but no Phase 9 endpoint sets these BIR/NPC fields. Either an operator seeds the profile, or Phase 9 adds a compliance-profile write surface. |
| `settings` (six `pos_*` keys) | ❌ **no table** | New `compliance_settings` (or POS-settings) storage keyed by business/branch, returning `{ key: { value } }`; plus a producer that loads it at finalize. |
| `artifacts` (4 cert types w/ verification + validity) | ❌ **no table** | New `compliance_artifacts` table (`artifact_type`, `verification_status`, `status`, `valid_until`) + loader. |
| `peripherals` (accredited receipt_printer + cash_drawer, terminal-scoped) | ❌ **no table** (Phase 8 has `terminal_identities` but no accreditation/device-class rows) | New `compliance_peripherals` table (`device_class`, `verification_status`, `status`, `accreditation_valid_until`, `is_shared`/`terminal_id`) + loader. |
| `evidence` signals 1-7 (accumulator, audit append-only, payment-handoff, encryption, submission docs, RMO filing, fiscal terminal registration) | ❌ **none** — no producer exists | Each is a `true`/`ready` attestation with no compute path in the codebase. Needs either an evidence-storage/attestation record per business, or a documented interim (operator-attested) source. Signals 5-7 carry sub-structures (`items[]`, `verified_count/total_count`). |

**Planner call-out:** These five storage/producer needs (settings, artifacts, peripherals, evidence-attestation, plus a profile-write surface) are a **material sub-scope of D-21** — larger than the checkout tables themselves. Options to present to the user: (A) build a minimal `compliant_active` evidence layer (tables + a single "assemble compliance bundle for finalize" reader); (B) interim: gate reads an operator-seeded per-business attestation blob (one JSON row) so fiscal works end-to-end without full UIs; (C) restrict live fiscal to businesses whose evidence has been seeded out-of-band. Recommend (B) for MVP — one `compliance_evidence` JSON store per business/branch, populated by an operator endpoint, read and passed by the finalize usecase — it satisfies the gate with the least new surface while keeping the real bundle shape. `[ASSUMED — needs user/planner decision, tracked as A8]`

### New assumptions raised by this section

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A7 | On a failed fiscal gate, finalize hard-fails (no silent fall-back to non_fiscal). | §3 | If auto-downgrade is desired, add an explicit rule; silent downgrade of an Official-Receipt request is a compliance risk. |
| A8 | Fiscal evidence bundle sourced via a minimal per-business attestation store (interim option B), not a full artifacts/peripherals/settings subsystem. | §4 | If full subsystems are required, D-21 scope grows substantially; confirm the MVP shape with the user. |
| A9 | For `compliant_active` businesses, the evidence bundle is passed on EVERY checkout (fiscal and non_fiscal), since the checklist runs for all POS operations. | §2 | If missed, `compliant_active` non_fiscal sales would also be blocked at REQUIRES_SETUP. |
