# Phase 11: Order Fulfillment & Delivery Coordination - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 13 new/modified artifacts
**Analogs found:** 13 / 13 (every artifact mirrors a verified existing file)

> Hard constraint honored throughout: **ZERO edits under `backend/`**. Every analog cited under `apps/` is same-milestone code that MAY be extended; any `backend/` reference is read-only.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/dgfy-api/src/models/Tenant/AvailmentStageEvent.js` | model | event-driven (append-only) | `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` | exact |
| `apps/dgfy-api/src/models/Tenant/CourierAssignment.js` | model | append-only identity + mutable payout | `InventoryMovement.js` (identity) + Landmine 3 divergence | role-match |
| `apps/dgfy-migration-runner/src/migrations/schema/2026XXXXXXXXXX-create-availment-fulfillment.cjs` | migration | schema DDL | `20260713120000-create-availment-checkout.cjs` (create+trigger) + `20260714103000-add-availment-source-reference.cjs` (addColumn guard) | exact |
| `apps/dgfy-api/src/modules/fulfillment/repositories/stageEventRepository.js` | repository | append-only writes | `inventory/repositories/inventoryMovementRepository.js` | exact |
| `apps/dgfy-api/src/modules/fulfillment/repositories/courierAssignmentRepository.js` | repository | CRUD (payout mutable) | `inventoryMovementRepository.js` | role-match |
| `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js` | usecase | request-response + enum validation | `inventory/usecases/inventoryMovementUseCases.js` | exact |
| `apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js` | controller | request-response (transport-only) | `inventory/controllers/inventoryMovementController.js` | exact |
| `apps/dgfy-api/src/modules/fulfillment/routes.js` | route | request-response | `inventory/routes.js` | exact |
| `apps/dgfy-api/src/modules/fulfillment/index.js` | config (DI) | wiring | `inventory/index.js` | exact |
| `apps/dgfy-api/src/models/Tenant/Availment.js` (MODIFY) | model | add columns + associations | self (existing `associate()` + `add-availment-source-reference.cjs`) | in-place |
| `apps/dgfy-api/src/infra/tenantConnector.js` (MODIFY) | config | model registration | self (existing `getModels()` map) | in-place |
| `apps/dgfy-api/src/routes/index.js` (MODIFY) | config (composition root) | port injection + mount | self (`recordSaleEffect`/`commitReservation` wiring) | in-place |
| `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js` (MODIFY) | repository | inject stage-event write into 2 txns | self (`finalizePersist` L434, `finalizeStorefrontOrder` L606) | in-place |
| `apps/dgfy-api/tests/unit/modules/fulfillment/*.test.js` | test | mock-Sequelize unit | `tests/unit/modules/inventory/inventoryMovementUseCases.test.js` | exact |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` (MODIFY) | config | verify contract | self (`inventory_movements` entry L278) | in-place |

---

## Pattern Assignments

### `models/Tenant/AvailmentStageEvent.js` (model, append-only event log)

**Analog:** `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` (read in full)

**Note on the RESEARCH excerpt:** the actual `InventoryMovement.js` uses the **factory-function** export shape `export default (sequelize) => { class X extends Model {...} X.init({...}); return X; }` — NOT the flat `X.init(...)` the RESEARCH brief showed. Mirror the REAL shape below.

**Structure to copy** (`InventoryMovement.js:18-118`):
```javascript
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class InventoryMovement extends Model {
        static associate(models = {}) {
            if (models.Product && !InventoryMovement.associations?.product) {
                InventoryMovement.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
            }
            if (models.StaffAccount && !InventoryMovement.associations?.actorStaffAccount) {
                InventoryMovement.belongsTo(models.StaffAccount, { foreignKey: 'actor_staff_account_id', as: 'actorStaffAccount' });
            }
        }
    }
    InventoryMovement.init({
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        business_id: { type: DataTypes.CHAR(36), allowNull: false },        // opaque cross-DB UUID, NO FK
        product_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        movement_type: { type: DataTypes.ENUM('restock','loss','adjustment','sale','booking'), allowNull: false },
        actor_account_id: { type: DataTypes.CHAR(36), allowNull: true },    // opaque landlord accounts.id, NO FK
        actor_staff_account_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'staff_accounts', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }
    }, {
        sequelize, modelName: 'InventoryMovement', tableName: 'inventory_movements',
        underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false,   // append-only
        indexes: [ { fields: ['business_id','product_id'], name: 'idx_inventory_movements_business_product' } ],
        hooks: {
            beforeUpdate() { throw new Error('inventory_movements is insert-only'); },
            beforeBulkUpdate() { throw new Error('inventory_movements is insert-only'); }
        }
    });
    return InventoryMovement;
};
```

**Adaptations for `AvailmentStageEvent`:**
- `tableName: 'availment_stage_events'`, `modelName: 'AvailmentStageEvent'`.
- Keep `updatedAt: false` + throwing `beforeUpdate`/`beforeBulkUpdate` hooks verbatim (this one IS strictly append-only, D-07).
- Columns: `business_id CHAR(36)` (no FK); `availment_id INTEGER` FK → `availments.id` `onDelete:'CASCADE'`; `fulfillment_mode ENUM('pickup','delivery','dine_in')`; **`fulfillment_status ENUM('placed','confirmed','preparing','ready','out_for_delivery','completed')`** (NOT `status` — Landmine 1); `fulfillment_stage STRING(32)` nullable (D-15 shared/open); `reason STRING(255)` nullable; `is_forced BOOLEAN default false` (D-10 — Open Q2, discretion); `actor_staff_account_id INTEGER` FK → `staff_accounts` `onDelete:'SET NULL'`; `actor_account_id CHAR(36)` no FK.
- `associate()`: `belongsTo(Availment, { foreignKey:'availment_id', as:'availment' })` + `belongsTo(StaffAccount, ... as:'actorStaffAccount')`.

---

### `models/Tenant/CourierAssignment.js` (model, append-only identity + MUTABLE payout)

**Analog:** `InventoryMovement.js` for the shape — **but deliberately diverge per Landmine 3.**

**Adaptations:**
- **DO NOT** set `updatedAt: false`; **DO NOT** add throwing `beforeUpdate` hooks; **DO NOT** attach the migration's `SIGNAL '45000'` UPDATE trigger. Payout (`payout_status owed→paid`, `paid_at`) must be updatable.
- Keep append-only for assignment IDENTITY (reassignment inserts a NEW row + marks prior via `superseded_at`/`is_active`; never overwrite/delete an attempt — D-04).
- Columns: `business_id CHAR(36)` (no FK); `availment_id INTEGER` FK → `availments.id`; `courier_name STRING(255)` (D-01 free-text, length-bounded per V5); `courier_contact STRING(255)`; `payout_amount DECIMAL` non-negative (server-validated); `payout_status ENUM('owed','paid') default 'owed'` (D-02); `paid_at DATE` nullable; `is_active BOOLEAN` / `superseded_at DATE` (reassignment history); `assigned_by_staff_account_id INTEGER` FK → `staff_accounts` (who assigned, per V5 threat register); `timestamps: true` WITH `updated_at` (mutable table).
- State the divergence explicitly in a header comment (RESEARCH Landmine 3 recommendation).

---

### migration `2026XXXXXXXXXX-create-availment-fulfillment.cjs` (migration, DDL)

**Analog A (create table + append-only triggers):** `20260713120000-create-availment-checkout.cjs`
**Analog B (idempotent addColumn guard):** `20260714103000-add-availment-source-reference.cjs`

**Meta block** (`create-availment-checkout.cjs:47-67`, `add-source-reference.cjs:46-54`):
```javascript
module.exports = {
  meta: { destructive: false, targetKind: 'business', rollbackDescription: '...', estimatedRisk: 'low' },
  async up(queryInterface, Sequelize) { ... },
  async down(queryInterface) { ... }
};
```
`targetKind: 'business'` is REQUIRED — structurally excludes this from `dgfy_core`.

**Idempotent helpers (copy verbatim, `create-availment-checkout.cjs:70-103`):** `tableExists` (tolerant `showAllTables` match), `hasIndex`, `addIndexIfMissing`, `timestampColumns()`.

**Add columns to existing `availments` (guard pattern, `add-source-reference.cjs:72-91`):**
```javascript
const desc = await queryInterface.describeTable('availments');
if (!desc.fulfillment_mode) await queryInterface.addColumn('availments', 'fulfillment_mode',
  { type: Sequelize.ENUM('pickup','delivery','dine_in'), allowNull: true });
if (!desc.fulfillment_status) await queryInterface.addColumn('availments', 'fulfillment_status',
  { type: Sequelize.ENUM('placed','confirmed','preparing','ready','out_for_delivery','completed'), allowNull: true });
if (!desc.fulfillment_stage) await queryInterface.addColumn('availments', 'fulfillment_stage',
  { type: Sequelize.STRING(32), allowNull: true }); // D-15 shared/open, NOT a per-mode enum
```
Do NOT touch `availments.status` (existing `draft/finalized/voided`, Landmine 1). Columns are nullable — additive, no backfill (RESEARCH Runtime State Inventory: existing rows stay NULL, A4).

**Create tables (guard, `create-availment-checkout.cjs:106-107`):**
```javascript
if (!await tableExists('availment_stage_events')) { await queryInterface.createTable('availment_stage_events', { id:{...}, business_id:{type:Sequelize.CHAR(36),...}, ..., created_at: timestampColumns().created_at }); }
```
`availment_stage_events` uses **created_at only** (append-only, no `updated_at`). `courier_assignments` uses full `...timestampColumns()` (mutable, per Landmine 3).

**Append-only triggers (copy `create-availment-checkout.cjs:459-491`) — apply to `availment_stage_events` ONLY, NOT `courier_assignments`:**
```javascript
const appendOnlyTables = ['availment_stage_events'];
for (const tableName of appendOnlyTables) {
  await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_update`);
  await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_delete`);
  await queryInterface.sequelize.query(`CREATE TRIGGER trg_${tableName}_append_only_update BEFORE UPDATE ON ${tableName} FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${tableName} is append-only and cannot be updated'; END`);
  await queryInterface.sequelize.query(`CREATE TRIGGER trg_${tableName}_append_only_delete BEFORE DELETE ON ${tableName} FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${tableName} is append-only and cannot be deleted'; END`);
}
```

**down():** DROP TRIGGER IF EXISTS, dropTable in reverse dep order, `removeColumn` the 3 `availments` columns (guarded), and on mysql `DROP TYPE IF EXISTS enum_availment_stage_events_*` / `enum_availments_fulfillment_*` / `enum_courier_assignments_payout_status` (`create-availment-checkout.cjs:525-532` precedent).

---

### `modules/fulfillment/repositories/stageEventRepository.js` (repository, append-only)

**Analog:** `inventory/repositories/inventoryMovementRepository.js` (read in full)

**Copy verbatim:** `TenantDatabaseUnavailableError` class (`:27-37`), the constructor `{ tenantConnector, businessDatabaseRegistryRepository }` guard (`:74-80`), `resolveDatabaseName` (`:90-116` — requires registry `status==='active'` AND `verified_at`), `resolveModel` (`:123-125` → `getModels(databaseName).AvailmentStageEvent`), and `withModel` (`:136-148`).

**Core write pattern** (`:159-177`):
```javascript
async create(businessId, input = {}) {
    if (!businessId) throw new Error('...requires businessId.');
    return this.withModel(businessId, async (Model) => {
        const record = await Model.create({ business_id: businessId, /* mapped snake_case fields */ });
        return this.toPlain(record);
    });
}
```

**Transaction-aware write (CRITICAL for D-06 seam):** follow `recordMovementWithStockSync`'s `options.transaction` pattern (`:261, :339-342`): when an outer `{ transaction }` is passed, use it directly; else open own. The stage-event auto-write at finalize passes the EXISTING transaction (see Shared Pattern: Finalize Seam).

**Only expose create/bulkCreate/findAll/findOne — NO update/delete** (append-only, mirrors the repository doc comment `:8-14`).

---

### `modules/fulfillment/repositories/courierAssignmentRepository.js` (repository, payout mutable)

**Analog:** `inventoryMovementRepository.js` scaffold (same `resolveDatabaseName`/`withModel`).

**Adaptations:** ADD an `updatePayout(businessId, assignmentId, { payoutStatus, paidAt })` method (a real UPDATE — this table is NOT append-only per Landmine 3) and a `supersedePrior`/`markInactive` on reassignment. Everything else (error classes, `withModel`) is identical.

---

### `modules/fulfillment/usecases/fulfillmentUseCases.js` (usecase, enum/sequence validation)

**Analog:** `inventory/usecases/inventoryMovementUseCases.js` (read `:1-160`)

**Copy the local error-helper block verbatim** (`:16-50`): `validationError` (400), `notFoundError` (404), `forbiddenError` (403), `conflictError` (409), plus `isTenantDatabaseUnavailableError`/`mapTenantDatabaseError` duck-typing (`:58-81`). Every usecase returns `ApplicationResult.success/failure`.

**Membership gate — copy verbatim** (`:96-119`):
```javascript
async function requireMembership(businessRepository, businessId, accountId) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You must be a staff member or owner of this business.') };
    }
    return { membership };
}
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId) {
    const business = await businessRepository.findById(businessId);
    if (!business) return { error: businessNotFoundError() };
    if (requestingAccountId) { const { error } = await requireMembership(...); if (error) return { error }; }
    return {};
}
```
Any-active-member gate (NOT owner-only), per the inventory precedent and A3/discretion.

**Enum + valid-stage-sequence validation (D-15) — pattern basis `MOVEMENT_TYPES = Object.freeze([...])` at `:14`:**
```javascript
export const STAGE_SEQUENCES = Object.freeze({
  pickup:   ['placed','confirmed','preparing','ready','completed'],
  dine_in:  ['placed','confirmed','preparing','ready','completed'],
  delivery: ['placed','confirmed','preparing','out_for_delivery','completed']
});
function nextLegalStage(mode, current) {
  const seq = STAGE_SEQUENCES[mode]; const i = seq.indexOf(current);
  return (i >= 0 && i < seq.length - 1) ? seq[i + 1] : null;
}
// D-10 force-complete: allow jump to 'completed' from out_for_delivery with is_forced=true + reason.
```
Illegal transition → `conflictError`/`validationError`. This is APP-LOGIC only; NO DB per-mode constraint (Pitfall 3).

**Usecases to build:** `buildListIncomingOrdersUseCase` (FUL-01: filter `fulfillment_mode IN (pickup,delivery)` AND `fulfillment_status IN (placed,confirmed,preparing)`, D-08; optional `branch_id`/`fulfillment_mode` filters per Open Q4); `buildProgressStageUseCase` (FUL-02); `buildAssignCourierUseCase` + `buildMarkPayoutUseCase` (FUL-03).

---

### `modules/fulfillment/controllers/fulfillmentController.js` (controller, transport-only)

**Analog:** `inventory/controllers/inventoryMovementController.js` (read in full)

Copy verbatim: `import { sendUseCaseResult }`, the `businessId` read from `req.body`(POST)/`req.query`(GET), `requestingAccountId: req.account.id`, and `return sendUseCaseResult(res, result, 201|200)`. NO model/repository imports (blocked by `eslint.config.mjs` `no-restricted-imports`).

---

### `modules/fulfillment/routes.js` (route)

**Analog:** `inventory/routes.js` (read in full)

```javascript
export function createFulfillmentRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') throw new Error('...requires an authenticateAccount middleware.');
    const router = express.Router();
    const controller = buildFulfillmentController(useCases);
    router.get('/incoming-orders', authenticateAccount, (req,res,next)=>controller.listIncoming(req,res).catch(next));
    router.post('/stage', authenticateAccount, (req,res,next)=>controller.progressStage(req,res).catch(next));
    router.post('/courier', authenticateAccount, (req,res,next)=>controller.assignCourier(req,res).catch(next));
    router.post('/payout', authenticateAccount, (req,res,next)=>controller.markPayout(req,res).catch(next));
    return router;
}
```
Mount top-level at `/fulfillment` (NOT nested under `/businesses/:businessId`), per the inventory precedent.

---

### `modules/fulfillment/index.js` (config, DI wiring)

**Analog:** `inventory/index.js` (read in full)

Mirror `buildInventoryModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository })` (`:84-116`): construct both repositories, build every usecase closed over them, and return `{ repository, useCases, createFulfillmentRoutes, recordStageEvents }` — where `recordStageEvents` is the injectable PORT the availments module consumes (mirrors how inventory exposes `reservationPorts.commitReservation` / `effectContracts.recordSaleEffect`).

---

## Shared Patterns

### Finalize-seam stage-event auto-write (D-05/D-06) — THE phase's linchpin

**Source (both seams in ONE file):** `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js`

**Seam 1 — POS/dine-in `finalizePersist()` (`sequelize.transaction` at L434):** after `availment.update({ status:'finalized', ... })` (L445-457) and alongside the Payment/Receipt writes, inject the FULL 5-row sequence `placed→confirmed→preparing→ready→completed` and set denormalized `fulfillment_mode`/`fulfillment_status='completed'`/`fulfillment_stage='completed'` on the availment update (D-05). Follow the `recordSaleEffect({ ..., transaction })` non-success-THROWs-to-rollback precedent (L462-484):
```javascript
for (const saleEffectLine of (saleEffectLines || [])) {
    const saleResult = await recordSaleEffect({ businessId, ..., transaction });
    if (saleResult && !saleResult.isSuccess) throw new Error(`Sale effect failed ...`); // rolls back whole txn
}
```
POS `fulfillment_mode` acquisition is Open Q1/A1 — default `dine_in`, accept optional controller override. FLAG to user; do NOT silently default without confirmation.

**Seam 2 — online `finalizeStorefrontOrder()` (`sequelize.transaction` at L606):** after `AvailmentModel.create({ status:'finalized', ... })` (L618-635), insert ONE `placed` stage event and set denormalized `fulfillment_mode` (from the already-threaded `fulfillmentMode`, currently DROPPED — Landmine 2) + `fulfillment_status='placed'` + `fulfillment_stage='placed'`.

**Injection style — port at the composition root (do NOT let availmentRepository import the fulfillment module):**

**Source:** `apps/dgfy-api/src/routes/index.js:141-151` — the `recordSaleEffect: inventoryUseCases.recordSale` / `commitReservation: inventoryReservationPorts.commitReservation` precedent:
```javascript
const { useCases: availmentUseCases } = buildAvailmentsModule({
    tenantConnector, businessDatabaseRegistryRepository, businessRepository, productRepository,
    assertComplianceGate,
    recordSaleEffect: inventoryUseCases.recordSale,
    shiftRepository, deviceBridgeClient,
    commitReservation: inventoryReservationPorts.commitReservation
    // ADD: recordStageEvents: fulfillmentModule.recordStageEvents
});
```
Reuse the SAME `tenantConnector`/`businessDatabaseRegistryRepository`/`businessRepository` instances — never a second divergent set (Pitfall 4). Then `router.use('/fulfillment', createFulfillmentRoutes(fulfillmentUseCases, { authenticateAccount }))`.

### Model registration (Pitfall 1 — the exact Phase 9 bug)

**Source:** `apps/dgfy-api/src/infra/tenantConnector.js:129-170` — `getModels()` `modelDefiners` map. ADD both `import defineAvailmentStageEventModel` / `defineCourierAssignmentModel` at top AND both entries to the `modelDefiners` object (L135-165). Missing registration → `TypeError: Cannot read properties of undefined` on `.create`. Also add `Availment.hasMany(AvailmentStageEvent/CourierAssignment)` in `Availment.js` `associate()` (existing `hasMany` block at `Availment.js:37-49`).

### Verify contract

**Source:** `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js:278-300` (`inventory_movements` entry). ADD `availment_stage_events` + `courier_assignments` table entries (columns/indexes/uniqueConstraints/foreignKeys/`projectionOnly:false`) and the 3 new `availments` columns so `verify` covers them. Do NOT expand scope to the 4 pre-existing missing Phase 9 entries (Landmine 5).

### Testing

**Source:** `apps/dgfy-api/tests/unit/modules/inventory/inventoryMovementUseCases.test.js:1-70` — Jest ESM (`import { jest } from '@jest/globals'`), mock-Sequelize style: `makeModels()` returns `{ Model: { create/findAll/findOne: jest.fn(), sequelize:{ transaction: jest.fn((cb)=>cb({})) } } }`; `makeTenantConnector = (models) => ({ getModels: jest.fn(()=>models) })`; `makeRegistryRepository` returns `{ database_name, status:'active', verified_at }`. Place under `tests/unit/modules/fulfillment/`. Live DB tests are ENV-gated (`LIVE_TENANT_DB`) and self-skip — no MySQL needed for unit runs.

---

## No Analog Found

None. Every artifact has a verified analog in `apps/`. The only genuinely novel design decisions (not analog-copyable) are the deliberate Landmine-3 divergence (`courier_assignments` mutable payout) and the D-15 app-logic sequence map — both fully specified above.

---

## Metadata

**Analog search scope:** `apps/dgfy-api/src/{models/Tenant,modules/inventory,modules/availments,infra,routes}`, `apps/dgfy-migration-runner/src/{migrations/schema,schemaContracts}`, `apps/dgfy-api/tests/unit/modules/inventory`.
**Files scanned:** InventoryMovement.js, inventoryMovementRepository.js, inventoryMovementUseCases.js, inventoryMovementController.js, inventory/routes.js, inventory/index.js, availmentRepository.js (finalize seams), routes/index.js, tenantConnector.js, 2 migrations, dgfyBusinessContract.js, inventory unit test, Availment.js (associations).
**Pattern extraction date:** 2026-07-13

**Planner action flags (from RESEARCH, needing user confirmation before locking):** A1 POS `fulfillment_mode` default; A2 online initial `placed` vs `confirmed`; A3 any-member vs owner-only gate; A4 no backfill of pre-migration availments; A5 `courier_assignments` payout mutability (Landmine 3). Open Q2 `is_forced` flag vs `reason`; Open Q3 single-table vs split payout; Open Q4 FUL-01 branch filter.
