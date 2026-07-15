# Phase 9: POS Checkout & Payment - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 20 (13 new + 7 modified)
**Analogs found:** 18 / 20 (money.js and deviceBridgeClient.js have partial-only analogs)

> **Hard constraint reminder:** ZERO writes/edits under `backend/`. Every `backend/*`
> file cited below is a **read-only pattern reference only**. All new code lives under
> `apps/dgfy-api/` and `apps/dgfy-migration-runner/`. The device-bridge is called over
> HTTP; it is never edited or imported.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/dgfy-api/src/modules/availments/index.js` | wiring (DI factory) | composition | `modules/inventory/index.js` + `modules/shifts/index.js` | exact |
| `apps/dgfy-api/src/modules/availments/routes.js` | route | request-response | `modules/inventory/routes.js` + `modules/products/routes.js` | exact |
| `apps/dgfy-api/src/modules/availments/controllers/availmentController.js` | controller | request-response | `modules/inventory/controllers/inventoryMovementController.js` | exact |
| `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` | usecase | CRUD + transform + orchestration | `modules/inventory/usecases/inventoryMovementUseCases.js` | exact (CRUD) / role-match (finalize orchestration) |
| `apps/dgfy-api/src/modules/availments/usecases/money.js` | utility | transform (pure) | — (no money util in repo) | NO ANALOG |
| `apps/dgfy-api/src/modules/availments/entities/availmentEntity.js` | entity | — | `modules/inventory/entities/inventoryMovementEntity.js` | exact |
| `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js` | repository | CRUD + multi-table transaction | `modules/inventory/repositories/inventoryMovementRepository.js` + `modules/shifts/repositories/shiftRepository.js` | exact |
| `apps/dgfy-api/src/models/Tenant/Availment.js` | model | — | `models/Tenant/Shift.js` | exact |
| `apps/dgfy-api/src/models/Tenant/AvailmentItem.js` | model (soft-delete) | — | `models/Tenant/Shift.js` (+ soft-delete `cancelled_at`) | role-match |
| `apps/dgfy-api/src/models/Tenant/Payment.js` | model | — | `models/Tenant/Shift.js` | exact |
| `apps/dgfy-api/src/models/Tenant/Receipt.js` | model (append-only) | — | `models/Tenant/InventoryMovement.js` | exact |
| `apps/dgfy-api/src/models/Tenant/ComplianceEvidence.js` (attestation, D-23) | model | — | `models/Tenant/ComplianceModeState.js` (JSON blob) | role-match |
| `apps/dgfy-api/src/infra/deviceBridgeClient.js` | client (HTTP) | request-response | `infra/backendProxy.js` (native `fetch` + env URL) | partial |
| `apps/dgfy-migration-runner/src/migrations/schema/2026XXXX-create-availment-checkout.cjs` | migration | schema | `migrations/schema/20260712100000-create-commerce-foundation.cjs` | exact |
| `apps/dgfy-api/src/infra/tenantConnector.js` (MODIFY `getModels()`) | wiring (registry) | — | self — registration site lines 129-147 | exact |
| `apps/dgfy-api/src/routes/index.js` (MODIFY) | wiring (composition root) | — | self — lines 75-125 | exact |
| `apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js` (MODIFY — add `buildRecordSaleUseCase`) | usecase | transform | self — `buildRecordLossUseCase` lines 200-208 | exact |
| `apps/dgfy-api/src/modules/inventory/index.js` (MODIFY — expose sale usecase) | wiring | — | self — lines 55-72 | exact |
| `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` (MODIFY — add `findOpenShift`) | repository (read) | request-response | self — `findById`/`findAll` lines 332-349 | exact |
| `apps/dgfy-api/src/modules/shifts/index.js` (MODIFY — expose `shiftRepository`) | wiring | — | self — `buildShiftsModule` return lines 102-115 | exact |

---

## Pattern Assignments

### `apps/dgfy-api/src/modules/availments/index.js` (wiring, DI factory)

**Analogs:** `apps/dgfy-api/src/modules/inventory/index.js` (lines 55-72), `apps/dgfy-api/src/modules/shifts/index.js` (lines 84-116)

**Factory signature to mirror** (inventory/index.js:55-72) — construct ONE repository, close every usecase over it + injected ports, return `{ repository, useCases }`:
```js
export function buildAvailmentsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    productRepository,            // read line-item prices / inventory_mode (D-03)
    assertComplianceGate,         // D-15/D-21 gate port
    recordSaleEffect,             // NEW inventory sale usecase (D-17) — inject, never write movements here
    shiftRepository,              // open-shift lookup (CHK-06) — now exposed by buildShiftsModule
    deviceBridgeClient            // NEW infra adapter (D-11/D-22)
} = {}) {
    const repository = new AvailmentRepository({ tenantConnector, businessDatabaseRegistryRepository });
    return {
        repository,
        useCases: {
            createAvailment: buildCreateAvailmentUseCase({ repository, businessRepository }),
            addLine: buildAddLineUseCase({ repository, businessRepository, productRepository }),
            // ...updateLine/removeLine/restoreLine/applyDiscount...
            finalizeAvailment: buildFinalizeAvailmentUseCase({
                repository, businessRepository, productRepository,
                assertComplianceGate, recordSaleEffect, shiftRepository, deviceBridgeClient
            })
        }
    };
}
```
**Optional env-config resolution pattern** (shifts/index.js:50-61) — read `DEVICE_BRIDGE_URL`/`DEVICE_BRIDGE_API_KEY` / print-timeout at this composition boundary (never inline in usecases), exactly as `resolveStaleThresholdMinutes()` does for `SHIFT_STALE_THRESHOLD_MINUTES`.

---

### `apps/dgfy-api/src/modules/availments/routes.js` (route, request-response)

**Analogs:** `apps/dgfy-api/src/modules/inventory/routes.js` (lines 21-35), `apps/dgfy-api/src/modules/products/routes.js` (lines 25-44)

**Pattern** — require injected `authenticateAccount`, build controller, thin routes with `.catch(next)`. Order specific paths before `/:id` (products/routes.js:34 comment):
```js
export function createAvailmentRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createAvailmentRoutes requires an authenticateAccount middleware.');
    }
    const router = express.Router();
    const controller = buildAvailmentController(useCases);
    router.post('/', authenticateAccount, (req, res, next) => controller.create(req, res).catch(next));
    router.post('/:id/lines', authenticateAccount, (req, res, next) => controller.addLine(req, res).catch(next));
    router.patch('/:id/lines/:lineId', authenticateAccount, (req, res, next) => controller.updateLine(req, res).catch(next));
    router.delete('/:id/lines/:lineId', authenticateAccount, (req, res, next) => controller.removeLine(req, res).catch(next));
    router.post('/:id/finalize', authenticateAccount, (req, res, next) => controller.finalize(req, res).catch(next));
    return router;
}
```
(Exact endpoint names are Claude's discretion per CONTEXT — the load-bearing pattern is `authenticateAccount` on every route + `.catch(next)`.)

---

### `apps/dgfy-api/src/modules/availments/controllers/availmentController.js` (controller, request-response)

**Analog:** `apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js` (whole file, lines 17-54)

**Transport-only pattern** — read from `req.body`/`req.query`/`req.params`, read actor from `req.account.id`, call usecase, `sendUseCaseResult(res, result, code)`. NO model/repository imports (eslint `no-restricted-imports` blocks `**/models` here — RESEARCH Pitfall/Anti-pattern):
```js
import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

export function buildAvailmentController(useCases = {}) {
    return {
        async finalize(req, res) {
            const body = req.body || {};
            const result = await useCases.finalizeAvailment({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                paymentMethod: body.payment_method,                    // Cash|GCash|Credit Card
                cashReceived: body.cash_received,                      // ignored for non-cash
                requestedDocumentContext: body.requested_document_context, // fiscal|non_fiscal (D-15)
                terminalId: body.terminal_id
            });
            return sendUseCaseResult(res, result, 201);
        }
        // ...create/addLine/updateLine/removeLine mirror the same shape
    };
}
```
**Response envelope** — `sendUseCaseResult` (`shared/controllers/useCaseResponder.js:21-33`) reads `result.isSuccess`/`result.statusCode`/`result.toJSON()`; controllers never map HTTP codes. Client-supplied `total`/`change`/`discount_amount` MUST be ignored (CHK-02/D-09) — do not even read them here.

---

### `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` (usecase, CRUD + orchestration)

**Analog:** `apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js` (whole file)

**Error factory + ApplicationResult pattern** (inventoryMovementUseCases.js:16-81) — copy verbatim: `validationError`(400), `notFoundError`(404), `forbiddenError`(403), `conflictError`(409), `noTenantDatabaseError`(404), `mapTenantDatabaseError` (missing/not_configured→404, else 503). Import `ApplicationResult` + `DomainError`/`DomainErrorCode` from `shared/contracts/`.

**Duck-typed repo-error mapping** (inventoryMovementUseCases.js:57-64, 164-175) — never import repo error classes; test `error.name === 'TenantDatabaseUnavailableError'` etc. Availment will add `AvailmentNotFoundError`, `AvailmentFinalizedError`, `NoOpenShiftError`, `AvailmentLineNotFoundError`.

**Access-control helpers** (inventoryMovementUseCases.js:96-119) — copy `requireMembership` (active membership) + `guardBusinessAccess` (business exists + member). For CHK-03 manual-discount permission, extend `requireMembership` with an additional permission check.

**Every usecase returns `ApplicationResult`** (never throws for expected failures): `ApplicationResult.failure(validationError(...))` on bad input, `ApplicationResult.success(data)` on success. See lines 129-176.

**Finalize orchestration** — this is the one usecase with NO exact analog; assemble it from these verified port contracts in this order (RESEARCH §Architecture diagram, Pitfall 7 = ONE transaction):
1. Validate input; recompute all money in `money.js` (never trust client).
2. `assertComplianceGate({ businessId, branchId: null, operation: 'pos.checkout', requestedDocumentContext, artifacts, peripherals, settings, evidence })` — see gate pattern below.
3. `shiftRepository.findOpenShift(businessId, { terminalId, cashierAccountId })` → bind `shift_id` or fail 409 (CHK-06).
4. Per `inventory_issue` line → the injected `recordSaleEffect` (negative signed qty).
5. Persist Availment + Payment + Receipt in ONE `sequelize.transaction()` (repository owns it).
6. Best-effort `deviceBridgeClient.printReceipt(...)` AFTER DB commit (D-22 record-then-warn).

---

### `apps/dgfy-api/src/modules/availments/usecases/money.js` (utility, pure transform) — NO ANALOG

**No money/decimal utility exists anywhere in the repo** (RESEARCH §Money & Tax, `grep` confirmed). Planner builds this fresh from RESEARCH's spec, NOT from a codebase analog:
- Parse `DECIMAL(14,4)` strings (mysql2 returns DECIMAL as JS strings) → integer centavos: `Math.round(Number(priceString) * 100)`.
- All arithmetic in integer centavos; format back to `DECIMAL(14,4)` string only when persisting/printing.
- One round-half-up convention, reused everywhere (no scattered `toFixed`).
- **VAT-inclusive (D-19):** per line total `L`: `vat = round(L − L/1.12)`, `net = L − vat`.
- **SC/PWD (D-20):** VAT-EXEMPT → zero the 12% VAT AND take 20% off the net base.
- **Change (D-09):** `change_due = cash_received − total`, reject if `< total` for Cash; no change for GCash/Credit Card.

This file is a Wave 0 test target (`tests/unit/modules/availments/money.test.js`, golden cases).

---

### `apps/dgfy-api/src/modules/availments/entities/availmentEntity.js` (entity)

**Analog:** `apps/dgfy-api/src/modules/inventory/entities/inventoryMovementEntity.js` (whole file, lines 11-90)

Plain constructor with defaulted fields + domain helpers (`isFinalized()`, `isCancelledLine()`) + `toPlain()` returning the stable public field set + a `createAvailmentEntity(attrs)` factory. Same shape/role as `InventoryMovementEntity`.

---

### `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js` (repository, transactional CRUD)

**Analogs:** `apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js` (lines 27-148, 253-339) + `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` (lines 21-238)

**Copy the tenant-DB scaffold VERBATIM** (inventoryMovementRepository.js:27-148):
- `TenantDatabaseUnavailableError` class (reason enum) — lines 27-37.
- Domain error subclasses (`AvailmentNotFoundError`, `AvailmentFinalizedError`, etc.) mirroring `InsufficientStockError`/`InventoryProductNotFoundError` (lines 46-63) — each sets `this.name` for duck-typing.
- Constructor requiring `tenantConnector`, optional `businessDatabaseRegistryRepository` (fail-closed at op time, not construction) — lines 74-80.
- `resolveDatabaseName(businessId)` requiring registry `status==='active'` AND `verified_at` — lines 90-116 (copy exactly).
- `resolveModel(databaseName)` → `this.tenantConnector.getModels(databaseName).Availment` — lines 123-125.
- `withModel(businessId, fn)` normalizing unknown errors to `TenantDatabaseUnavailableError('unreachable')`, never double-wrapping known domain errors — lines 136-148 (extend the `instanceof` allowlist like shiftRepository.js:170-177).

**Multi-table single-transaction write** (shiftRepository.js:194-238 `openShift` / inventoryMovementRepository.js:253-339 `recordMovementWithStockSync`) — the finalize path must write `availments` + `availment_items` + `payments` + `receipts` inside ONE `sequelize.transaction(async (transaction) => { ... })` obtained via `Model.sequelize`, passing `{ transaction }` to every `.create()`/`.update()`. This is the Pitfall 7 all-or-nothing requirement.

**Row-lock guard for finalize idempotency** (shiftRepository.js:264-271) — read the availment with `lock: transaction.LOCK.UPDATE`, reject if already finalized (mirrors the closed-shift `ShiftNotOpenError` guard) to prevent double-finalize/replay.

**Append-only + soft-delete:** expose NO hard-delete for receipts; line removal is `cancelled_at = new Date()` UPDATE, restore is `cancelled_at = null` (D-02/D-18).

---

### Tenant models — `Availment.js` / `AvailmentItem.js` / `Payment.js` / `Receipt.js` / `ComplianceEvidence.js`

**Analogs:** `apps/dgfy-api/src/models/Tenant/Shift.js` (money + FK columns), `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` (append-only pattern for `Receipt`)

**Persistence-only model pattern** (Shift.js:16-132):
- `export default (sequelize) => { class X extends Model { static associate(models) {...} } X.init({...}, { sequelize, modelName, tableName, underscored:true, timestamps:true, createdAt:'created_at', updatedAt:'updated_at' }); return X; }`.
- **Cross-DB refs are `DataTypes.CHAR(36)` with NO `references`** (`business_id`, `customer_account_id`, etc.) — Shift.js:52-55, comment lines 50-51.
- **Same-DB FKs are `DataTypes.INTEGER` with `references: { model: 'availments', key: 'id' }`** (`availment_id`, `shift_id`, `product_id`) — Shift.js:61-79.
- **Money columns `DataTypes.DECIMAL(14, 4)`; quantity `DECIMAL(24, 12)`** — Shift.js:91-106, Product.js.
- `associate()` guards with `!X.associations?.foo` before defining (Shift.js:18-37).

**Receipt = append-only** — mirror `InventoryMovement.js:94-115`: `updatedAt: false` (no `updated_at` column) + `hooks: { beforeUpdate() { throw ... }, beforeBulkUpdate() { throw ... } }`. DB triggers are the hard backstop (see migration).

**AvailmentItem soft-delete** — add `cancelled_at: { type: DataTypes.DATE, allowNull: true }`; keep `timestamps:true` (it is NOT append-only — lines are updatable for qty/stock_effect_type edits per D-01/D-03). Include `stock_effect_type ENUM('inventory_issue','stock_exempt')`, `tax_treatment ENUM('vatable','vat_exempt','zero_rated')`, `tax_rate DECIMAL(5,4)`, `product_name STRING(255)` snapshot (RESEARCH §Code Examples, from read-only `backend/src/models/PosTransactionLine.js`).

**ComplianceEvidence (D-23 interim attestation)** — mirror `ComplianceModeState.js`: `business_id CHAR(36)`, `branch_id INTEGER` nullable FK to `locations`, plus a `DataTypes.JSON` column holding the operator-attested `{ profile, settings, artifacts, peripherals, evidence }` bundle the finalize usecase reads and forwards to `assertComplianceGate` (see Fiscal Evidence pattern below).

---

### `apps/dgfy-api/src/infra/deviceBridgeClient.js` (client, HTTP) — partial analog

**Analog:** `apps/dgfy-api/src/infra/backendProxy.js` (native `fetch`, env base URL, `buildBackendUrl`/`buildForwardHeaders`)

Build an outbound HTTP client the same way `backendProxy.js` does — native `fetch`, base URL + API key from env (`DEVICE_BRIDGE_URL`, `DEVICE_BRIDGE_API_KEY`). Add an `AbortController` short timeout (~5s, D-11/D-22). Target endpoint (verified, `backend/device-bridge/server.js:85-101`, READ-ONLY): `POST /device/print-receipt` with body `{ receipt, copies }`.

**Success response:** `{ ok: true, result }`. **Failure response:** HTTP 500 `{ ok: false, error: 'RECEIPT_PRINT_FAILED', message }`. Per D-22, translate any non-`ok`/timeout/unreachable into a print-warning (never a rolled-back sale). Receipt payload shape the bridge's `receiptFormatter.buildReceiptLines` consumes is in RESEARCH §Integration Ports #4 (`receipt.business`, `receipt.transaction.lines[]`, `receipt.receipt_contract.document_type`).

---

### `apps/dgfy-migration-runner/src/migrations/schema/2026XXXX-create-availment-checkout.cjs` (migration)

**Analog:** `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` (whole file, lines 57-536)

**Copy the skeleton exactly:**
- `module.exports = { meta: { destructive:false, targetKind:'business', rollbackDescription, estimatedRisk:'low' }, async up(qi, Sequelize){...}, async down(qi){...} }` — lines 57-68. `targetKind:'business'` structurally excludes `dgfy_core`.
- **Idempotent helpers defined inline at top of `up()`** — copy `tableExists`, `hasIndex`, `addIndexIfMissing`, `timestampColumns()` verbatim (lines 71-104).
- **Every `createTable` guarded by `if (!await tableExists(...))`**; every index via `addIndexIfMissing` (lines 107-123 pattern).
- **Cross-DB columns `Sequelize.CHAR(36)` no FK; same-DB FKs `Sequelize.INTEGER` with `references`** (lines 112, 132-138). Note: if any availment column feeds a STORED generated column, its FK must be `onDelete:'RESTRICT'/onUpdate:'RESTRICT'` (shifts precedent, lines 301-319).
- **Append-only `receipts`:** created_at ONLY (no updated_at, lines 199-204) + BEFORE UPDATE / BEFORE DELETE `SIGNAL SQLSTATE '45000'` triggers with `DROP TRIGGER IF EXISTS` first (lines 460-488). Add `'receipts'` to the `appendOnlyTables` array pattern.
- **`down()`** drops triggers, then tables in reverse dependency order, then `DROP TYPE IF EXISTS enum_*` for MySQL (lines 491-535).

Apply per tenant: `node apps/dgfy-migration-runner/src/cli.js activate-tenant --database-name dgfy_business_<x>` (or `schema migrate`). Existing Phase 8 tenant DBs must re-run to gain Phase 9 tables (RESEARCH §Runtime State Inventory).

---

## Shared Patterns

### Compliance Gate (called from INSIDE finalize usecase — never middleware)
**Source:** `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js` (lines 91-152); exposed by `buildComplianceModule(...).assertComplianceGate` (`modules/compliance/index.js:83`).
**Constants** (`modules/compliance/policy/constants.js`): `COMPLIANCE_OPERATION.POS_CHECKOUT = 'pos.checkout'`, `DOCUMENT_CONTEXTS = { FISCAL:'fiscal', NON_FISCAL:'non_fiscal' }`, `POS_OPERATIONS` includes POS_CHECKOUT.
**Apply to:** `finalizeAvailment` only.
**Behavior (verified complianceGate.js:143-150):** returns the ALLOW decision object; THROWS `DomainError` 403 on DENY (`AUTHORIZATION_FAILED`, `details.reason_code`, `details.decision`) and 409 on REQUIRES_SETUP (`CONFLICT`). Signature accepts `{ businessId, branchId=null, operation, requestedDocumentContext, artifacts=[], peripherals=[], settings={}, evidence={}, now }`.
```js
const decision = await assertComplianceGate({
    businessId, branchId: null,
    operation: 'pos.checkout',
    requestedDocumentContext,   // 'fiscal' | 'non_fiscal' from request (D-15)
    artifacts, peripherals, settings, evidence   // from ComplianceEvidence store for compliant_active (D-21/D-23)
});
// decision.decision === 'allow' here; DENY/REQUIRES_SETUP already threw.
// Use decision.receipt_contract.document_type ('fiscal_invoice' | 'non_fiscal') for the printed/stored doc type (D-14).
```
Since it throws, finalize should catch the `DomainError` and wrap into `ApplicationResult.failure` (consistent with the rest of the usecase), surfacing `details.decision.checklist.missing_*` / `activation_blockers[]` on REQUIRES_SETUP so staff see exactly which signals are missing (D-24 hard-fail — never silently downgrade a fiscal sale).

### Fiscal Evidence Bundle (D-21/D-23) — assemble from the interim attestation store
**Source of requirement:** RESEARCH §"Fiscal Checkout Evidence Path" §1-2 (the exact 7-signal bundle). **Storage:** new `ComplianceEvidence` Tenant model (D-23).
**Apply to:** `finalizeAvailment` whenever `compliance_mode_state.state === 'compliant_active'` (RESEARCH A9 — required for BOTH fiscal AND non_fiscal checkout by a compliant_active business; `non_compliant_active` businesses skip the checklist and pass with empty inputs).
- Read the operator-attested JSON bundle for `(businessId, branchId)` and forward `artifacts`/`peripherals`/`settings`/`evidence` to the gate. `compliance_profile` is loaded by the gate from the persisted state row (NOT passed).
- For non-cash payments (GCash/Credit Card, D-10 no live capture) pass `context.payment_handoff_mode: 'external'` to avoid the BSP sub-gate DENY (RESEARCH §2 nuance 2). *(Note: the current `complianceGate.js:132-141` builds `context` as only `{ requested_document_context }`; passing `payment_type`/`payment_handoff_mode` through the gate may require a small forward-compatible extension of the gate's `context` assembly — flag to planner; do NOT edit policyEngine.)*

### Inventory Sale Effect (D-17, single-writer ADR-0029) — WIRE the 501 stub, don't call it
**Source:** the stub `recordSaleEffect` throws 501 (`inventoryEffectContracts.js:72-75`, `RESERVED_EFFECT_NOT_IMPLEMENTED`) — do NOT call it. The real write path is `InventoryMovementRepository.recordMovementWithStockSync(businessId, { productId, movementType:'sale', quantity, referenceType:'availment', referenceId, actorAccountId, actorStaffAccountId })` (repo lines 253-339).
**New usecase to ADD** in `inventoryMovementUseCases.js`, mirroring `buildRecordLossUseCase` (lines 200-208):
```js
export function buildRecordSaleUseCase({ repository, businessRepository }) {
    return buildMovementUseCase({
        repository, businessRepository,
        movementType: 'sale',                        // ENUM already reserves 'sale'
        validateQuantity: (q) => (isPositiveNumber(q) ? null : 'quantity must be a positive number for a sale.'),
        signQuantity: (q) => -Math.abs(Number(q))    // sale decreases stock
    });
}
```
Expose it from `buildInventoryModule` (index.js:64-69 add `recordSale: buildRecordSaleUseCase(...)`), inject into `buildAvailmentsModule` as `recordSaleEffect`. Only call it for `stock_effect_type === 'inventory_issue'` lines (`stock_exempt` lines record nothing). **Atomicity caveat (Pitfall 7):** `recordMovementWithStockSync` opens its own txn per call — for all-or-nothing finalize, add a transaction-accepting variant OR have the availment repo own the outer txn and call a txn-aware inventory method. Flag as a design task for the planner.

### Response Envelope
**Source:** `apps/dgfy-api/src/shared/controllers/useCaseResponder.js` (`sendUseCaseResult`, lines 21-33) + `shared/contracts/applicationResult.js` + `shared/contracts/domainErrors.js` (code→status map: VALIDATION_FAILED→400, RESOURCE_NOT_FOUND→404, AUTHORIZATION_FAILED→403, CONFLICT→409, SERVICE_UNAVAILABLE→503, INTERNAL_ERROR→500).
**Apply to:** every availment controller method + every usecase return.

### Composition Root Wiring (the ONLY place instances are composed)
**Source:** `apps/dgfy-api/src/routes/index.js` (lines 75-125).
**Apply to:** add availments AFTER booking, reusing the SAME `tenantConnector` / `businessDatabaseRegistryRepository` / `businessRepository` / `productRepository` / `assertComplianceGate` instances already built (lines 45-104) — never construct a second set. Also destructure the NEW `recordSale` from `inventoryUseCases`, and the NEW `repository: shiftRepository` from `buildShiftsModule` (see modifications below).
```js
import { buildAvailmentsModule, createAvailmentRoutes } from '../modules/availments/index.js';
const { useCases: availmentUseCases } = buildAvailmentsModule({
    tenantConnector, businessDatabaseRegistryRepository, businessRepository,
    productRepository, assertComplianceGate,
    recordSaleEffect: inventoryUseCases.recordSale,
    shiftRepository, deviceBridgeClient
});
router.use('/availments', createAvailmentRoutes(availmentUseCases, { authenticateAccount }));  // mounts /v1/availments
```

### Tenant Model Registration (RESEARCH Pitfall 2 — CRITICAL)
**Source & exact site:** `apps/dgfy-api/src/infra/tenantConnector.js` — the `modelDefiners` map inside `getModels()` (lines 129-147). A model NOT listed here resolves to `undefined` → `Cannot read properties of undefined (reading 'findOne')`.
**Apply to:** add `import defineAvailmentModel from '../models/Tenant/Availment.js';` (+ AvailmentItem, Payment, Receipt, ComplianceEvidence) at the top (mirroring lines 7-14), and add each to the `modelDefiners` object (lines 129-147) alongside `Product`/`Shift`/etc. The existing loop (lines 150-161) auto-defines and wires `associate()` — no other change needed. Update the `@returns` JSDoc (line 121) for completeness.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/dgfy-api/src/modules/availments/usecases/money.js` | utility | transform | No money/decimal utility exists anywhere in the repo (RESEARCH §Money & Tax, grep-confirmed). Build fresh from the integer-centavo + VAT-inclusive (D-19) + SC/PWD VAT-exempt (D-20) spec. Golden-test in Wave 0. |
| `apps/dgfy-api/src/infra/deviceBridgeClient.js` | client | request-response | Only a partial analog (`infra/backendProxy.js` for the native-`fetch`+env-URL shape). The receipt-print contract, timeout, and record-then-warn failure handling (D-22) are new; the target endpoint contract is read-only in `backend/device-bridge/server.js:85-101`. |

---

## Wave 0 Test Targets (from RESEARCH §Validation Architecture)

Jest `^29.7.0` + supertest (ESM via `--experimental-vm-modules`), config `apps/dgfy-api/jest.config.cjs`. Analog test convention: `tests/integration/commerce/commerceModulesMount.test.js`.
- `tests/unit/modules/availments/money.test.js` — golden money/VAT/SC-PWD/change (CHK-02, FSC-03).
- `tests/unit/modules/availments/availmentUseCases.test.js` — CRUD + finalize with mocked ports.
- `tests/integration/availments/finalize.test.js` — finalize with mocked `assertComplianceGate`, inventory sale usecase, `deviceBridgeClient`.
- Extend `commerceModulesMount.test.js` with a `/v1/availments/...` → 401 (not 404) mount assertion.

---

## Metadata

**Analog search scope:** `apps/dgfy-api/src/modules/{inventory,shifts,products,compliance}`, `apps/dgfy-api/src/models/Tenant/`, `apps/dgfy-api/src/infra/`, `apps/dgfy-api/src/shared/`, `apps/dgfy-api/src/routes/`, `apps/dgfy-migration-runner/src/migrations/schema/`, `backend/device-bridge/` (read-only).
**Files scanned:** ~18 source files read directly this session (every integration port, model, migration, and scaffold cited).
**Pattern extraction date:** 2026-07-13
</content>
</invoke>
