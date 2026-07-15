# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** ~55 new files across 5 modules + 8 Tenant models + 4 migration/wiring touch-points
**Analogs found:** 51 / 55 (near-total coverage — every hard problem has a verified in-repo precedent)

**Zero-`backend/`-writes constraint honored:** every `backend/**` file below is a READ-ONLY pattern-porting source. Its "Modify" column is empty. All new/modified code lands under `apps/dgfy-api/**` or `apps/dgfy-migration-runner/**`.

---

## File Classification

### New Tenant models — `apps/dgfy-api/src/models/Tenant/`

| New File | Role | Data Flow | Closest Analog (read-only unless noted) | Match |
|----------|------|-----------|------------------------------------------|-------|
| `Product.js` | model | CRUD | `apps/dgfy-api/src/models/Tenant/TerminalIdentity.js` | exact (class+init+underscored+indexes) |
| `ProductFolder.js` | model | CRUD | `apps/dgfy-api/.../TerminalIdentity.js` shape + `backend/src/models/ItemFolder.js` (fields) | exact shape / field-list port |
| `InventoryMovement.js` | model | event-driven (append-only) | `backend/src/models/StockMovement.js` (`updatedAt:false`) + `apps/.../TerminalIdentity.js` (structure) | role-match (insert-only) |
| `Booking.js` | model | CRUD | `apps/.../TerminalIdentity.js` (structure) | exact shape |
| `BookingCapacity.js` (counter table for atomic guard) | model | transform (counter) | `apps/.../Location.js` (structure) | role-match |
| `Shift.js` | model | CRUD + state | `backend/src/models/PosTerminalShift.js` (fields) + `apps/.../TerminalIdentity.js` (structure) | field-list port |
| `CashDrawerEvent.js` | model | event-driven (append-only) | `backend/src/models/StockMovement.js` (`updatedAt:false`) | role-match (insert-only) |
| `ComplianceModeState.js` | model | CRUD (state machine row) | `apps/.../TerminalIdentity.js` (structure) + `backend/.../complianceConstants.js` (enum values) | exact shape / enum port |

### `modules/products/`

| New File | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `index.js` | config (DI factory) | — | `apps/dgfy-api/src/modules/businesses/index.js` | exact |
| `routes.js` | route | request-response | `apps/dgfy-api/src/modules/accounts/routes.js` (top-level) + `businesses/routes.js` | exact |
| `controllers/productController.js` | controller | request-response | `apps/.../businesses/controllers/locationController.js` | exact |
| `controllers/productFolderController.js` | controller | request-response | `apps/.../locationController.js` | exact |
| `usecases/productUseCases.js` | usecase | CRUD | `apps/.../businesses/usecases/locationUseCases.js` | exact |
| `usecases/productFolderUseCases.js` | usecase | CRUD | `apps/.../locationUseCases.js` | exact |
| `repositories/productRepository.js` | repository | CRUD (tenant DB) | `apps/.../businesses/repositories/locationRepository.js` | exact |
| `repositories/productFolderRepository.js` | repository | CRUD (tenant DB) | `apps/.../locationRepository.js` | exact |
| `entities/productEntity.js` | entity | — | `apps/.../businesses/entities/businessEntity.js` | exact |

### `modules/inventory/` (SOLE WRITER of `inventory_movements`, ADR 0029 / D-06)

| New File | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `index.js` | config (DI factory) | — | `apps/.../businesses/index.js` | exact |
| `routes.js` | route | request-response | `apps/.../accounts/routes.js` | exact |
| `controllers/inventoryMovementController.js` | controller | request-response | `apps/.../locationController.js` | exact |
| `usecases/inventoryMovementUseCases.js` (restock/loss/adjustment) | usecase | event-driven (append) | `apps/.../locationUseCases.js` | role-match |
| `usecases/inventoryEffectContracts.js` (reserved `sale`/`booking` stubs, D-06) | usecase (contract) | event-driven | — (no analog — see No Analog) | none |
| `repositories/inventoryMovementRepository.js` (create/findAll ONLY) | repository | append-only (tenant DB) | `apps/.../locationRepository.js` (tenant resolution) + `backend/src/models/StockMovement.js` (insert-only mindset) | role-match |
| `entities/inventoryMovementEntity.js` | entity | — | `apps/.../businessEntity.js` | exact |

### `modules/booking/`

| New File | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `index.js` | config (DI factory) | — | `apps/.../businesses/index.js` | exact |
| `routes.js` | route | request-response | `apps/.../accounts/routes.js` | exact |
| `controllers/bookingController.js` | controller | request-response | `apps/.../locationController.js` | exact |
| `usecases/bookingUseCases.js` (create, cancel) | usecase | transform (capacity guard) | `apps/.../locationUseCases.js` (structure) + Pattern D atomic guard | role-match |
| `repositories/bookingRepository.js` (atomic guarded UPDATE) | repository | transform (tenant DB) | `apps/.../locationRepository.js` (tenant resolution) | role-match |
| `entities/bookingEntity.js` | entity | — | `apps/.../businessEntity.js` | exact |

### `modules/shifts/`

| New File | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `index.js` | config (DI factory) | — | `apps/.../businesses/index.js` | exact |
| `routes.js` | route | request-response | `apps/.../accounts/routes.js` | exact |
| `controllers/shiftController.js` | controller | request-response | `apps/.../locationController.js` | exact |
| `usecases/shiftUseCases.js` (open/close/no-sale pop/reconcile) | usecase | CRUD + transform | `apps/.../locationUseCases.js` (structure) | role-match |
| `repositories/shiftRepository.js` (one-open-shift 409 mapping) | repository | CRUD (tenant DB) | `apps/.../locationRepository.js` | role-match |
| `repositories/cashDrawerEventRepository.js` (create/findAll ONLY) | repository | append-only (tenant DB) | `apps/.../locationRepository.js` + `StockMovement.js` | role-match |
| `entities/shiftEntity.js` | entity | — | `apps/.../businessEntity.js` | exact |

### `modules/compliance/` (owns state machine + `assertComplianceGate` port; Phase 9 is first real caller)

| New File | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `index.js` | config (DI factory) | — | `apps/.../businesses/index.js` | exact |
| `routes.js` | route | request-response | `apps/.../accounts/routes.js` | exact |
| `controllers/complianceController.js` | controller | request-response | `apps/.../locationController.js` | exact |
| `usecases/complianceUseCases.js` (submit evidence, review/transition, get state) | usecase | CRUD (state machine) | `apps/.../locationUseCases.js` | role-match |
| `usecases/complianceGate.js` (`assertComplianceGate` port) | usecase (port) | request-response (gate) | `backend/.../compliancePolicyEngine.js` `evaluateComplianceDecision` (line 725) — **port with D-05 deviation** | port-with-deviation |
| `repositories/complianceModeStateRepository.js` | repository | CRUD (tenant DB) | `apps/.../locationRepository.js` | exact |
| `policy/policyEngine.js` | utility (pure fn) | transform | `backend/.../compliancePolicyEngine.js` (**port, delete lines 903–918 only**) | port-with-deviation |
| `policy/policyPacks.js` | config (data) | — | `backend/.../policy/policyPacks.js` | exact port |
| `policy/constants.js` | config (enums) | — | `backend/.../policy/complianceConstants.js` | exact port |
| `entities/complianceEntity.js` | entity | — | `apps/.../businessEntity.js` | exact |

### Migration-runner + wiring

| File | New/Modify | Role | Closest Analog | Match |
|------|-----------|------|----------------|-------|
| `apps/dgfy-migration-runner/src/migrations/schema/2026NNNN-create-commerce-foundation.cjs` | **New** | migration | `apps/.../schema/20260710021000-create-dgfy-business-foundation.cjs` + trigger/generated-col SQL from `backend/migrations/*` | exact (helpers) / port (SQL) |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` | **Modify** | config | itself (lines 37–252) — add 7 `tables{}` entries, remove `products`/`shifts` from `rejectedTables` | self |
| `apps/dgfy-api/src/infra/tenantConnector.js` | **Modify** | config | itself (lines 121–127) — add 8 models to `modelDefiners` | self |
| `apps/dgfy-api/src/routes/index.js` | **Modify** | config (composition root) | itself (lines 40–62) — build + mount 5 modules | self |

---

## Pattern Assignments

### Module DI factory — `modules/{products,inventory,booking,shifts,compliance}/index.js`

**Analog:** `apps/dgfy-api/src/modules/businesses/index.js` (exact — every new module `index.js` copies this shape)

**Factory + return contract** (lines 132–218): a single `buildXModule({...deps}) → { repository, useCases }` that news up repositories and closes usecases over them. Note the tenant-scoped repos take `{ tenantConnector, businessDatabaseRegistryRepository }`, and `tenantConnector` defaults to a fresh `new TenantConnector()` but is overridable for tests (line 144):
```js
export function buildBusinessesModule({ businessModel, sequelize, businessDatabaseRegistryModel, tenantConnector: tenantConnectorOverride } = {}) {
    const tenantConnector = tenantConnectorOverride || new TenantConnector();
    const locationRepository = new LocationRepository({ tenantConnector, businessDatabaseRegistryRepository });
    return {
        repository, locationRepository, tenantConnector,
        useCases: {
            createLocation: buildCreateLocationUseCase({ repository: locationRepository, businessRepository: repository }),
            // ...
        }
    };
}
```
**Copy for Phase 8:** each new tenant-scoped repo (Product, InventoryMovement, Booking, Shift, ComplianceModeState) constructs with `{ tenantConnector, businessDatabaseRegistryRepository }` exactly like `LocationRepository`. Every gated usecase (shift-open) receives the `assertComplianceGate` port via closure here — **injected in this factory, never imported inside the usecase** (research Pattern A).

**Barrel re-exports** (lines 13–56): `index.js` re-exports every repository/usecase builder + `createXRoutes` + `TenantConnector`. Copy the export-then-import-then-compose ordering.

---

### Module routes — `modules/*/routes.js`

**Analog:** `apps/dgfy-api/src/modules/accounts/routes.js` (top-level resource — best match; new modules mount at `/products`, `/inventory`, `/bookings`, `/shifts`, `/compliance`, NOT nested under `/businesses`)

**Factory signature + injected auth + `.catch(next)`** (accounts/routes.js lines 18–33):
```js
export function createAccountRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createAccountRoutes requires an authenticateAccount middleware.');
    }
    const router = express.Router();
    const controller = buildAccountController(useCases);
    router.post('/register', (req, res, next) => controller.register(req, res).catch(next));
    router.get('/:id', authenticateAccount, (req, res, next) => controller.getAccount(req, res).catch(next));
    return router;
}
```
**Copy for Phase 8:** `createXRoutes(useCases, { authenticateAccount })` — throw if `authenticateAccount` missing, build controller, one thin route per handler with `authenticateAccount` in front and `.catch(next)` on every async call. `businesses/routes.js` (lines 47–96) shows the same for `:businessId`-scoped resources if a module needs business-nested paths.

---

### Controller — `modules/*/controllers/*.js`

**Analog:** `apps/dgfy-api/src/modules/businesses/controllers/locationController.js` (exact)

**Transport-only `buildXController(useCases)` factory** (lines 13–28): parses `req.params`/`req.body`/`req.query`, resolves the actor via `req.account.id`, calls the injected usecase, returns `sendUseCaseResult(res, result, <successCode>)`. No model/repository imports (ESLint `no-restricted-imports` blocks them from this dir):
```js
export function buildLocationController(useCases = {}) {
    return {
        async createLocation(req, res) {
            const { name, address_line, latitude, longitude, setAsPrimary } = req.body || {};
            const result = await useCases.createLocation({
                businessId: req.params.businessId,
                requestingAccountId: req.account.id,
                name, address_line, latitude, longitude, setAsPrimary
            });
            return sendUseCaseResult(res, result, 201);
        },
        // ...
    };
}
```
**Copy for Phase 8:** 201 for create endpoints (booking create, shift open, movement record, product create), 200 for reads/updates. Booking cancel by a consumer account (D-09) reads the actor from `req.account.id` and passes it as `requestingAccountId` for the consumer-owns-booking check.

---

### Usecase — `modules/*/usecases/*.js`

**Analog:** `apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js` (exact)

**Imports + DomainError helper factories** (lines 1–47):
```js
import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

const validationError = (message, details = null) => new DomainError(DomainErrorCode.VALIDATION_FAILED, message, { statusCode: 400, details });
const conflictError   = (message, details = null) => new DomainError(DomainErrorCode.CONFLICT, message, { statusCode: 409, details });
const notFoundError   = (message = '...') => new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, message, { statusCode: 404 });
const forbiddenError  = (message) => new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, { statusCode: 403 });
```
**Copy for Phase 8:** every module reuses these exact factory helpers. Shift's one-open-shift collision → `conflictError` (409). Booking capacity-full → `conflictError`. Compliance gate DENY → `forbiddenError`. Validation is currently **inline `DomainError`, no joi** — the existing convention (OQ-3; joi optional). Follow inline unless the planner adopts joi.

**Builder-per-usecase closing over deps, always returns `ApplicationResult`** (lines 131–179):
```js
export function buildCreateLocationUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        // 1. validate → ApplicationResult.failure(validationError(...))
        // 2. access control (guardBusinessAccess) → ApplicationResult.failure(error)
        // 3. try { ... repository call ... return ApplicationResult.success({ location }) }
        //    catch (tenantError) { map TenantDatabaseUnavailableError → failure; else rethrow }
    };
}
```

**Access-control helpers to copy verbatim** (lines 97–123): `requireMembership(businessRepository, businessId, accountId, { role })` (reads `businessRepository.getMembership`, checks `membership.status === 'active'` and `membership.role === role`) and `guardBusinessAccess(...)`. Owner-role write gating (product create, shift open, compliance transition) reuses `{ role: 'owner' }`. **D-09 booking cancel** adds a second authorization branch: staff/owner (via `requireMembership`) OR the booking's own `customer_account_id === requestingAccountId`.

**Tenant-error mapping to copy** (lines 57–78): duck-type `error.name === 'TenantDatabaseUnavailableError'`; `missing`/`not_configured` → 404, else 503. Every tenant-scoped usecase wraps its repository call in the same `try/catch (tenantError)`.

---

### Tenant-scoped repository — `modules/*/repositories/*.js`

**Analog:** `apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js` (exact — the canonical tenant-DB access adapter)

**`TenantDatabaseUnavailableError` class + `resolveDatabaseName` + `withModel`** (lines 24–122): copy this whole scaffold. `resolveDatabaseName(businessId)` requires the registry row `status === 'active'` AND `verified_at` populated before any tenant connection; `withModel(businessId, fn)` resolves the model and normalizes any thrown error to `TenantDatabaseUnavailableError('unreachable')`:
```js
async withModel(businessId, fn) {
    const databaseName = await this.resolveDatabaseName(businessId);
    try {
        const model = this.resolveModel(databaseName);
        return await fn(model);
    } catch (error) {
        if (error instanceof TenantDatabaseUnavailableError) throw error;
        throw new TenantDatabaseUnavailableError('unreachable', '...');
    }
}
```
**CRUD + `toPlain` normalization** (lines 130–257): `create`/`findById`/`findAll`/`update`/soft-`delete` all go through `withModel`; `toPlain` maps the Sequelize row to an explicit plain field set.

**Phase-8 repository specializations:**
- **`inventoryMovementRepository` / `cashDrawerEventRepository` (append-only):** expose ONLY `create`/`bulkCreate`/`findAll`/`findOne` — NEVER `update`/`delete` (research Pattern C). The `InventoryMovement`/`CashDrawerEvent` models carry `updatedAt:false` + `beforeUpdate` throw hooks; the DB trigger is the hard backstop.
- **`bookingRepository` (atomic capacity guard, Pattern D):** capacity decrement/release must be a single guarded statement, never `findOne`→check→`update`. Inside `withModel`, use a raw guarded UPDATE and assert `affectedRows === 1`:
  ```sql
  UPDATE booking_capacity SET slots_remaining = slots_remaining - 1
    WHERE product_id = :id AND branch_id = :branch AND slot = :slot AND slots_remaining >= 1;
  -- affectedRows === 0 → capacity full → conflictError (BOK-02)
  ```
  Cancel releases with the mirror `+ 1` inside the same `sequelize.transaction()` as the booking-status write.
- **`shiftRepository` (one-open-shift 409):** wrap the open-shift insert in `sequelize.transaction()`; catch the raw MySQL unique-index violation on `active_terminal_cashier_key` and surface it as `conflictError` (409) rather than an unhandled 500.

---

### Entity — `modules/*/entities/*.js`

**Analog:** `apps/dgfy-api/src/modules/businesses/entities/businessEntity.js` (exact)

**Class with constructor defaults + `toPlain()` + domain helper + factory fn** (lines 12–53, 109–115):
```js
export class BusinessEntity {
    constructor({ id = null, status = 'active', /* ... */ } = {}) { /* assign */ }
    isActive() { return this.status === 'active'; }
    toPlain() { return { id: this.id, /* explicit public field set */ }; }
}
export const createBusinessEntity = (attrs) => new BusinessEntity(attrs);
```
**Copy for Phase 8:** e.g. `ShiftEntity.isOpen()`, `BookingEntity.isCancellable()`, `ComplianceModeStateEntity.allowsFiscal()` as domain helpers; `toPlain()` defines the stable public response shape.

---

### Tenant model — `apps/dgfy-api/src/models/Tenant/*.js`

**Analog:** `apps/dgfy-api/src/models/Tenant/TerminalIdentity.js` (exact — class-extends-Model + `init` + `associate`) and `Location.js` for the doc-comment convention ("matches the real migration exactly").

**Structure** (TerminalIdentity.js lines 22–81): `export default (sequelize) => { class X extends Model { static associate(models){...} } X.init({...cols...}, { sequelize, modelName, tableName, underscored:true, timestamps:true, createdAt:'created_at', updatedAt:'updated_at', indexes:[...] }); return X; }`. Same-DB FK example (lines 49–55): `location_id` with `references: { model: 'locations', key: 'id' }`.

**Insert-only models (`InventoryMovement.js`, `CashDrawerEvent.js`) — port from `backend/src/models/StockMovement.js`:**
- `updatedAt: false` (StockMovement.js line 85) → no `updated_at` column, `created_at` only.
- Add `hooks: { beforeUpdate() { throw new Error('insert-only'); }, beforeBulkUpdate() { throw new Error('insert-only'); } }` (research Pattern C — StockMovement doesn't have the hooks; the DB trigger is the true backstop).
- Field-list port (not the table): `quantity DECIMAL(24,12)` (StockMovement.js line 31), `movement_type` ENUM (`restock`,`loss`,`adjustment`; reserve `sale`,`booking` per D-06), `reference_type`/`reference_id` (lines 42–49), `product_id` FK. **Do NOT name the table `stock_movements`** — that name is in `rejectedTables`; use `inventory_movements`.

**`ComplianceModeState.js` enums — port values from `backend/.../complianceConstants.js`:** `state` ENUM = `COMPLIANCE_MODE_STATE` values (`non_compliant_active`,`compliant_pending`,`compliant_active`, lines 1–5). Verification/verifier fields use `COMPLIANCE_VERIFICATION_STATUS` (lines 46–51) and `COMPLIANCE_VERIFIER_ACTOR_TYPE` (lines 53–56). `compliance_profile` JSON defaults to `COMPLIANCE_PROFILE_DEFAULT` shape (lines 58–90).

**`ProductFolder.js` — port field list from `backend/src/models/ItemFolder.js`:** `name` (STRING 100 — but per-tenant unique, NOT globally unique as legacy line 13), `description` TEXT, `show_in_pos_filter` BOOL, `is_active` BOOL. **OQ-1:** legacy has a `parent_id` self-nesting FK (lines 29–36) — CONTEXT D-discretion says default **flat** (drop `parent_id`); flag the discrepancy to the user at plan time.

**`Shift.js` — port money columns from `backend/src/models/PosTerminalShift.js`:** `opening_float_amount`/`closing_cash_amount`/`expected_cash_amount`/`cash_variance_amount` all `DECIMAL(14,4)` (lines 26–51), `status` ENUM `open`/`closed` (lines 64–68). Change from legacy: `terminal_id` FKs `terminal_identities.id` (INTEGER, already migrated), not a VARCHAR. **OQ-2:** decide `cashier_account_id` = tenant `staff_accounts.id` (INTEGER, same-DB FK; recommended) vs landlord `dgfy_account_id` (UUID); the choice drives the generated-column definition.

---

### Commerce-foundation migration — `apps/dgfy-migration-runner/src/migrations/schema/2026NNNN-create-commerce-foundation.cjs` (NEW)

**Analog:** `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs` (exact — helpers + `meta` + idempotency)

**`meta.targetKind: 'business'`** (lines 25–35) — structurally excludes this migration from any `dgfy_core` run.

**Idempotent helpers to copy verbatim** (lines 38–71): `tableExists`, `hasIndex`, `addIndexIfMissing`, `timestampColumns()`. Every `createTable` is guarded by `if (!await tableExists(...))` (lines 74–85). Cross-DB refs (`business_id`, `customer_account_id`, `owner_dgfy_account_id`) are **opaque UUID columns, never real FKs** (lines 117–119, 228–235); same-DB FKs only (lines 120–126).

**Generated-column + unique index (one-open-shift, D-12) — port SQL from `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs`** (lines 39–53), extended to composite cashier+terminal:
```sql
ALTER TABLE shifts ADD COLUMN active_terminal_cashier_key VARCHAR(150)
  GENERATED ALWAYS AS (CASE WHEN status='open' THEN CONCAT_WS('|', terminal_id, cashier_account_id) ELSE NULL END) STORED;
CREATE UNIQUE INDEX uq_shifts_active_terminal_cashier ON shifts (active_terminal_cashier_key);
```
Emit via `queryInterface.sequelize.query(...)`, guarded by `describeTable`/`hasIndex` checks exactly like the legacy migration.

**Append-only triggers (InventoryMovement + CashDrawerEvent, PRD-04/SFT-03) — port from `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs`** (lines 25–46):
```sql
CREATE TRIGGER trg_inventory_movements_append_only_update BEFORE UPDATE ON inventory_movements FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_movements is append-only and cannot be updated'; END;
-- + BEFORE DELETE variant; + identical pair for cash_drawer_events
```
Precede each `CREATE TRIGGER` with `DROP TRIGGER IF EXISTS ...` (legacy lines 25–26) for idempotency. `down()` drops tables in reverse dependency order + drops ENUM types (foundation migration lines 285–304).

---

### Schema contract — `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` (MODIFY)

**Analog:** itself. **CRITICAL — Pitfall 1.** The `verify` command computes `ok: tables.every(ok) && rejectedTablesPresent.length === 0` (`apps/.../commands/verify.js` line 133); `rejectedTablesPresent` = any `rejectedTables` name that exists in the DB (line 129). Creating `products` or `shifts` while they remain in `rejectedTables` (lines 224–251) makes verify **fail**.

**Required edits:**
1. **Add** 7 entries to `tables{}` (mirroring the existing entry shape at lines 39–55: `columns[]`, `indexes[]`, `uniqueConstraints[]`, `foreignKeys[]`, `projectionOnly:false`): `products`, `product_folders`, `inventory_movements`, `bookings` (+ `booking_capacity` if used), `shifts`, `cash_drawer_events`, `compliance_mode_state`.
2. **Remove** `'products'` and `'shifts'` from `rejectedTables` (lines 237, 239). **Keep** `'stock_movements'` rejected (line 231) — the new ledger is `inventory_movements`, which is not in the list.

---

### tenantConnector model registry — `apps/dgfy-api/src/infra/tenantConnector.js` (MODIFY)

**Analog:** itself. **Add** 8 new model definers to `getModels()`'s `modelDefiners` map (lines 121–127, currently `Location`/`StaffAccount`/`StaffInvitation`/`AccountStaffAssignment`/`TerminalIdentity`):
```js
const modelDefiners = {
    Location: defineLocationModel, /* existing... */
    Product: defineProductModel, ProductFolder: defineProductFolderModel,
    InventoryMovement: defineInventoryMovementModel, Booking: defineBookingModel,
    Shift: defineShiftModel, CashDrawerEvent: defineCashDrawerEventModel,
    ComplianceModeState: defineComplianceModeStateModel
};
```
The existing idempotent resolution (`connection.models[name] || define(connection)`, lines 130–132) and `associate()` wiring loop (lines 137–141) already handle the new models unchanged. Add the 8 `import defineXModel from '../models/Tenant/X.js';` lines at top (mirroring lines 2–6).

---

### Composition root — `apps/dgfy-api/src/routes/index.js` (MODIFY)

**Analog:** itself (lines 32–62). Build each new module via its `buildXModule({...})` after `buildBusinessesModule`, reusing the SAME `tenantConnector` and `businessRepository` instances (research Pattern E — avoid divergent instances), then mount top-level (lines 60–62 pattern):
```js
const { useCases: productUseCases } = buildProductsModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository });
router.use('/products', createProductRoutes(productUseCases, { authenticateAccount }));
// ...inventory, bookings, shifts, compliance
```
Inject the compliance module's `assertComplianceGate` port into `buildShiftsModule({ assertComplianceGate })` so shift-open (the only real Phase-8 gate caller) can call it inside the usecase body.

---

### Compliance gate + policy engine — the D-05 deviation (`modules/compliance/policy/policyEngine.js`, `usecases/complianceGate.js`)

**Analog:** `backend/src/modules/compliance/policy/compliancePolicyEngine.js` — **port with exactly ONE change (D-05).**

**Entry function to port** (line 725): `evaluateComplianceDecision({ tenant, operation, context, artifacts, peripherals, settings, evidence, now })`. It reads `requestedDocumentContext` from `context.requested_document_context` (line 753) — this is the D-05 first-class input. `POS_OPERATIONS` set (lines 18–22) and `DOCUMENT_CONTEXTS` (lines 24–28) port unchanged.

**Branches that port UNCHANGED (already correct per D-05):**
- `NON_COMPLIANT_ACTIVE` (lines 804–859): fiscal receipt/checkout → DENY `NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED`, else ALLOW.
- `COMPLIANT_PENDING` (lines 861–901): fiscal → REQUIRES_SETUP `COMPLIANT_ACTIVATION_PENDING`, else ALLOW.

**The ONLY block to change — DO NOT PORT (compliancePolicyEngine.js lines 903–918):**
```js
if (modeState === COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE) {
    if (POS_OPERATIONS.has(operation) && requestedDocumentContext && requestedDocumentContext !== DOCUMENT_CONTEXTS.FISCAL) {
        return buildDecision({ ...decision: DENY, reasonCode: DOCUMENT_CONTEXT_NOT_ALLOWED, ... }); // ← DELETE THIS branch
    }
    // ... keep the SETTINGS_UPDATE + checklist branches below (lines 920+)
}
```
Deleting only this `DOCUMENT_CONTEXT_NOT_ALLOWED` deny branch makes `compliant_active` allow BOTH `fiscal` and `non_fiscal` (Omni-default, Fiscal-on-request). Everything after line 918 (settings update ALLOW, checklist completeness → REQUIRES_SETUP) ports unchanged.

**Gate port shape (`usecases/complianceGate.js`):** expose `assertComplianceGate({ businessId, operation, requestedDocumentContext })` (naming = planner's call) that loads the tenant's `ComplianceModeState`, calls the ported engine, and returns/throws based on the decision (DENY → `forbiddenError`; REQUIRES_SETUP → domain error). Add a test asserting `compliant_active` + `requestedDocumentContext:'non_fiscal'` → ALLOW (Pitfall 2 regression guard).

**`policy/policyPacks.js` (exact port, D-03):** `backend/.../policyPacks.js` — versioned `POLICY_PACKS[]` (line 1, `version: '2026.04.07'`) with per-regulator `required_settings_keys`/`required_profile_fields`/`required_artifacts` and `required_classes_for_compliant_active` (lines 7–50); exports `getActivePolicyPack(now)` (line 62) + `listPolicyPacks()` (line 80). Port whole file.

**`policy/constants.js` (exact port, D-02):** `backend/.../complianceConstants.js` (whole file) — all 8 frozen enum objects.

---

## Shared Patterns

### Result / error contracts
**Source:** `apps/dgfy-api/src/shared/contracts/applicationResult.js` + `domainErrors.js` (reuse as-is — DO NOT create new copies)
**Apply to:** every usecase in all 5 modules.
- `ApplicationResult.success(data)` / `ApplicationResult.failure(error)` (applicationResult.js lines 50–65); `.statusCode` getter reads the DomainError's statusCode (lines 39–42).
- `DomainError(code, message, { statusCode, details })` with frozen `DomainErrorCode` (domainErrors.js lines 13–53). Note: `domainErrors.js` does NOT export a `SERVICE_UNAVAILABLE` 409/`CONFLICT` gap — `CONFLICT:409` and `SERVICE_UNAVAILABLE:503` both exist (lines 18–19, 28–29), so shift-collision and tenant-down map cleanly.

### Response formatting
**Source:** `apps/dgfy-api/src/shared/controllers/useCaseResponder.js` (reuse)
**Apply to:** every controller. `sendUseCaseResult(res, result, successStatusCode)` (lines 21–33) — success status supplied by caller (201/200), failure status derived from `result.statusCode`.

### Authentication
**Source:** `apps/dgfy-api/src/modules/accounts/middleware/accountAuthMiddleware.js` (built once in `routes/index.js` line 54, injected into every `createXRoutes`)
**Apply to:** all module routes. Populates `req.account.id`, which controllers pass as `requestingAccountId`.

### Access control (membership / role)
**Source:** `apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js` `requireMembership`/`guardBusinessAccess` (lines 97–123)
**Apply to:** all owner/staff-gated writes (product create, shift open, compliance transition, manual inventory movement). D-09 booking cancel extends this with a consumer-account-owns-booking branch.

### Tenant DB resolution + fail-closed
**Source:** `apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js` `TenantDatabaseUnavailableError` + `resolveDatabaseName` + `withModel` (lines 24–122)
**Apply to:** every tenant-scoped repository in all 5 modules.

### Append-only enforcement (two-layer)
**Source (model):** `backend/src/models/StockMovement.js` `updatedAt:false` (line 85) + research Pattern C hooks.
**Source (DB):** `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs` trigger pair (lines 25–46).
**Apply to:** `InventoryMovement` + `CashDrawerEvent` (models, repositories, migration).

### Atomic guarded UPDATE (never read-then-write)
**Source:** research Pattern D (no direct app-layer analog exists yet — this is net-new to `apps/dgfy-api`).
**Apply to:** booking-capacity decrement/release; any counter mutation. Assert `affectedRows === 1`; wrap release + status-write in one `sequelize.transaction()`.

---

## No Analog Found

| File | Role | Data Flow | Reason / Guidance |
|------|------|-----------|-------------------|
| `modules/inventory/usecases/inventoryEffectContracts.js` (reserved `sale`/`booking` effect stubs, D-06) | usecase (contract) | event-driven | No effect-request contract exists in `apps/dgfy-api` yet. Define the shape now; keep `modules/inventory` the sole writer (ADR 0029). Follow the module usecase-builder shape but the contract itself is net-new. |
| `bookingRepository` atomic guarded UPDATE | repository | transform | No existing `apps/dgfy-api` repo does a guarded counter UPDATE — port research Pattern D + `sequelize.transaction()` (CLAUDE.md "use transactions for multi-table updates"). |
| Shift reconciliation formula (`expected_cash = opening_float + sales - refunds + payins - payouts`, D-10) | usecase (compute) | transform | No reconciliation code exists yet; RESEARCH Code Examples gives the formula shape (all Phase-9 inputs = 0 this phase). Anticipate the extra inputs; don't restructure. |
| Stale-shift flag threshold (D-11) | config | — | No configurable-threshold precedent loaded; RESEARCH says operator-configurable, not hardcoded (mirror Phase 7). Planner decides storage location. |

---

## Metadata

**Analog search scope:** `apps/dgfy-api/src/modules/{accounts,businesses}`, `apps/dgfy-api/src/models/{Tenant,Landlord}`, `apps/dgfy-api/src/shared`, `apps/dgfy-api/src/infra`, `apps/dgfy-api/src/routes`, `apps/dgfy-migration-runner/src/{migrations,schemaContracts,commands}`, `backend/src/modules/compliance/policy`, `backend/src/models`, `backend/migrations`.
**Files scanned:** ~25 read in full/targeted ranges; all verified against RESEARCH.md's file+line citations.
**Pattern extraction date:** 2026-07-12
</content>
</invoke>
