# Phase 09 Plan 04 — POS Checkout & Payment Persistence Layer — COMPLETED

**Executed:** 2026-07-13
**Executor:** Claude Haiku 4.5
**Status:** SUCCESS — All acceptance criteria verified

---

## Objective Achieved

Built the availments module's persistence layer: the availment entity with domain helpers, the tenant-scoped repository with CRUD operations (create, find, line add/update/cancel/restore, discount persistence), and the atomic finalize-persist write path that owns a single sequelize.transaction covering availment + payment + receipt + per-line sale effects. This is the foundation for all downstream availment usecases (09-05/09-06).

---

## Artifacts Delivered

### 1. AvailmentEntity: `apps/dgfy-api/src/modules/availments/entities/availmentEntity.js`

**Status:** ✅ Created, syntax validated with `node --experimental-vm-modules --check`

**What it provides:**
- Plain constructor with defaulted fields mirroring availment header + items array
- Domain helpers: `isFinalized()` (status === 'finalized'), `isDraft()`, `isCancelledLine(item)` (item.cancelled_at != null)
- `toPlain()` returning the stable public field set
- `createAvailmentEntity(attrs)` factory function

**Design patterns:**
- Mirrors `InventoryMovementEntity` role and structure exactly
- No Sequelize or HTTP concern — pure domain representation
- Items array stored but not deeply projected in toPlain (parent repository handles item flattening)

---

### 2. AvailmentRepository: `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js`

**Status:** ✅ Created, syntax validated

**Core scaffold (copied verbatim from inventoryMovementRepository / shiftRepository):**
- `TenantDatabaseUnavailableError` class with reason enum (missing/provisioning/inactive/unverified/unreachable/not_configured)
- Four domain error subclasses (each sets this.name for duck-typing):
  - `AvailmentNotFoundError` — availment or line not found → 404
  - `AvailmentFinalizedError` — availment already finalized → 409
  - `AvailmentLineNotFoundError` — line not found on availment → 404
  - `NoOpenShiftError` — no open shift for cashier+terminal → 409
- `resolveDatabaseName(businessId)` requiring registry status 'active' AND verified_at → throws TenantDatabaseUnavailableError for provisioning/inactive/unverified states
- `resolveModel(databaseName)` → `tenantConnector.getModels(databaseName).Availment`
- `withModel(businessId, fn)` error normalizer (never double-wraps known domain errors)

**Read methods:**
- `createAvailment(businessId, {branchId, customerAccountId, cashierAccountId, cashierDgfyAccountId, terminalId})` — inserts status 'draft' availment with zeroed amounts
- `findById(businessId, availmentId)` — availment header plus non-cancelled AND cancelled items + discounts + payments (full audit history)
- `addLine(businessId, availmentId, {productId, productName, quantity, unitPrice, stockEffectType, taxTreatment, taxRate})` — inserts availment_items row; rejects if availment finalized
- `updateLine(businessId, availmentId, lineId, {quantity?, stockEffectType?})` — updates active line; rejects if finalized
- `cancelLine(businessId, availmentId, lineId)` — sets cancelled_at = new Date() (soft delete); rejects if finalized
- `restoreLine(businessId, availmentId, lineId)` — sets cancelled_at = null (undo soft-delete); rejects if finalized
- `recordDiscount(businessId, availmentId, discount)` — inserts one availment_discounts row with discount_type ('promo_code'|'manual'|'sc_pwd'), code, amount/percent, applied_by_staff_account_id, reason, sc_pwd fields; rejects if finalized

**Atomic write path:**
- `finalizePersist(businessId, availmentId, {header, payment, receipt, saleEffectLines, recordSaleEffect})` — **one sequelize.transaction**:
  1. Finds availment with `lock: transaction.LOCK.UPDATE` (prevents double-finalize/replay)
  2. Rejects if status !== 'draft' with AvailmentFinalizedError
  3. Updates availment row to status 'finalized' + server-computed amounts + shift_id + sc_pwd fields + finalized_at
  4. For each `saleEffectLines` entry with `stockEffectType === 'inventory_issue'`, invokes injected `recordSaleEffect(...)` with threaded `transaction`
  5. **CRITICAL (Pitfall 7):** Inspects each sale-effect result; if `isSuccess === false`, THROWS an Error so the entire transaction rolls back (never silently swallows a failed stock decrement)
  6. Creates Payment row
  7. Creates Receipt row
  8. Returns plain {availment, payment, receipt}

**Plain/projection helpers:**
- `toPlain(availmentRow)` — full availment shape + nested items/discounts/payments arrays
- `toPlainLine(lineRow)`, `toPlainDiscount(discountRow)`, `toPlainPayment(paymentRow)`, `toPlainReceipt(receiptRow)`

**Design decisions honored:**
- ✅ D-01 (flexible edit-before-finalize): no hard-delete methods for lines; finalized availment rejects mutations
- ✅ D-02/D-18 (soft-delete for audit): cancelLine/restoreLine manipulate cancelled_at only; full history preserved
- ✅ D-03 (per-line stock_effect_type control): updateLine can change it before finalize
- ✅ D-04/D-05 (discount stacking): recordDiscount writes one row per discount; multiple rows per availment supported
- ✅ D-07/D-09 (server-side totals/change): repository is a pure persistence adapter; usecase (09-06) owns the computation
- ✅ D-17 (inventory single-writer): recordSaleEffect is injected, never called directly; repository threads the transaction

---

### 3. Module Index & DI Factory: `apps/dgfy-api/src/modules/availments/index.js`

**Status:** ✅ Created, syntax validated

**Exports:**
- `AvailmentRepository` + all four duck-typable error classes
- `AvailmentEntity` + `createAvailmentEntity` factory
- `buildAvailmentsModule({tenantConnector, businessDatabaseRegistryRepository, businessRepository, productRepository, assertComplianceGate, recordSaleEffect, shiftRepository, deviceBridgeClient})` factory

**Factory behavior:**
- Constructs one `AvailmentRepository` instance
- Returns `{ repository, useCases: { } }` (useCases map will be filled by 09-05/09-06)
- Mirrors `buildInventoryModule` export/return shape exactly
- All injected ports (compliance gate, recordSaleEffect, shiftRepository, deviceBridgeClient) are passed through to usecases (09-05/09-06) without being used at the repository level

---

## Verification Results

### Acceptance Criteria Checks

**Task 1: AvailmentEntity**
- ✅ Parses (node --experimental-vm-modules --check)
- ✅ Exports createAvailmentEntity: 1 occurrence
- ✅ Exports AvailmentEntity class with:
  - isFinalized(): 2 occurrences (implementation + JSDoc)
  - isCancelledLine(): 1 occurrence
  - toPlain(): 1 occurrence
- ✅ No Sequelize or HTTP concerns (pure domain entity)

**Task 2: AvailmentRepository**
- ✅ Parses (node --experimental-vm-modules --check)
- ✅ Exports AvailmentRepository and all four duck-typable error classes:
  - AvailmentNotFoundError: 11 occurrences
  - AvailmentFinalizedError: 10 occurrences
  - AvailmentLineNotFoundError: 7 occurrences
  - NoOpenShiftError: 4 occurrences
- ✅ cancelLine/restoreLine use cancelled_at only (8 occurrences, no destroy/delete calls)
- ✅ recordDiscount writes availment_discounts rows: 7 occurrences of AvailmentDiscount/availment_discounts/discount_type
- ✅ resolveDatabaseName requires status 'active' AND verified_at (1 occurrence per guard, patterns match inventory)
- ✅ No direct model-factory imports; all via tenantConnector.getModels(databaseName)

**Task 3: finalizePersist + Module Index**
- ✅ Both files parse (node --experimental-vm-modules --check)
- ✅ finalizePersist method: 1 occurrence as async method
- ✅ sequelize.transaction usage: 3 occurrences (within finalizePersist + in transaction context)
- ✅ Row-lock: LOCK.UPDATE present for double-finalize guard
- ✅ recordSaleEffect invocation: 7 occurrences (definition + 5+ references in finalizePersist flow)
- ✅ buildAvailmentsModule function: 1 occurrence
- ✅ Returns { repository, useCases } pattern: 1 occurrence

### Architectural Validation

- ✅ Tenant-DB scaffold copied verbatim from inventory movement repository (resolveDatabaseName, withModel)
- ✅ Multi-table transaction pattern (availment + payment + receipt in one sequelize.transaction)
- ✅ Row-locking pattern (transaction.LOCK.UPDATE to prevent double-finalize/replay)
- ✅ Line CRUD with soft-delete + restore (cancelled_at manipulation, no hard-delete)
- ✅ Discount persistence (one AvailmentDiscount row per discount)
- ✅ Atomicity guarantee (recordSaleEffect result checked; non-success THROWS for rollback)
- ✅ No legacy backend/ writes; all code under apps/dgfy-api
- ✅ Error classes duck-typed on .name property (usecases will check error.name === 'AvailmentNotFoundError', etc.)

---

## Key Design Decisions

### Single-Writer Contract (ADR-0029)
- The repository owns ALL availment/payment/receipt writes
- recordSaleEffect is injected (defined in modules/inventory)
- Repository threads the transaction to recordSaleEffect so stock movements commit/rollback atomically with the availment

### Atomicity (Pitfall 7, WARNING-1)
- finalizePersist wraps all five writes (availment, per-line sale effects, payment, receipt) in ONE sequelize.transaction
- Any non-success sale-effect result is re-thrown, rolling back the entire transaction (never silent failures)
- Row-lock (LOCK.UPDATE) prevents double-finalize from racing through a concurrent close

### Soft-Delete for Audit (D-02/D-18)
- cancelLine sets cancelled_at (never destroys)
- restoreLine clears cancelled_at
- Receipt only includes non-cancelled lines (current state)
- Full line history (add, modify, remove, restore) is preserved in availment_items table

### Server-Side Authority (CHK-02, D-09)
- Repository is a pure persistence adapter
- Totals, discounts, VAT, change are computed by the usecase (09-06), never accepted from client
- finalizePersist receives pre-computed amounts from the usecase header

---

## Tests Targeted (Wave 0)

Per RESEARCH §Validation Architecture, these test suites will be built on top of this foundation:
- `tests/unit/modules/availments/money.test.js` — golden money/VAT/SC-PWD/change (CHK-02, FSC-03)
- `tests/unit/modules/availments/availmentUseCases.test.js` — CRUD + finalize with mocked ports
- `tests/integration/availments/finalize.test.js` — finalize with mocked `assertComplianceGate`, inventory sale usecase, `deviceBridgeClient`
- Extend `tests/integration/commerce/commerceModulesMount.test.js` with `/v1/availments/...` → 401 (not 404) mount assertion

---

## Deferred (Next Plans)

- **09-05:** Availment usecases (createAvailment, addLine, updateLine, removeLine, restoreLine, applyDiscount) — will close over this repository
- **09-06:** Finalize orchestration usecase (will call finalizePersist and handle orchestration logic like compliance gating, shift lookup, device-bridge printing)
- **09-07:** Controllers, routes, and integration wiring into `/v1/availments` endpoint
- **Wave 0 tests:** Unit + integration test suites for money.js, usecases, finalize flow

---

## Summary

**Plan 09-04 is complete and ready for acceptance.**

All three layers of the persistence foundation are in place and verified:
1. **Entity** — domain representation with helpers (isFinalized, isCancelledLine, toPlain)
2. **Repository** — tenant-scoped CRUD + soft-delete + atomic finalizePersist with recordSaleEffect threading
3. **Module shell** — buildAvailmentsModule factory ready for usecase injection

The repository is the **single owner of availment/item/discount/payment/receipt persistence**, enforcing:
- No hard deletes (append-only principles)
- One-transaction finalize (atomicity guarantee)
- Row-locking against double-finalize/replay
- Injection of recordSaleEffect (single-writer contract honored)

All 09 requirements (CHK-01..06, FSC-03, D-01..D-20, D-23) are structurally supported by the repository design.

---

**Delivered by:** Claude Haiku 4.5
**Session:** 2026-07-13
**Plan ID:** 09-04
**Phase:** 09-pos-checkout-payment
