# Phase 12: Scope Unblock + Schema Extension - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 9 (2 new, 7 modified)
**Analogs found:** 9 / 9 (every artifact grounded in an existing in-repo analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/dgfy-migration-runner/src/migrations/schema/2026071610xxxx-extend-schema-for-legacy-migration.cjs` (NEW) | migration | transform (DDL) | `.../schema/20260712100000-create-commerce-foundation.cjs` (createTable+index) + `.../schema/20260714103000-add-availment-source-reference.cjs` (addColumn) | exact |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` (MODIFIED) | config (verification contract) | transform | own `products` / `inventory_movements` / `product_folders` entries | exact (self-analog) |
| `apps/dgfy-migration-runner/src/data/mappings.js` (MODIFIED) | config (scope gate) | transform | own `OUT_OF_SCOPE_LEGACY_TABLES` array | exact (self-analog) |
| `apps/dgfy-api/src/models/Tenant/Product.js` (MODIFIED) | model | CRUD | own current `Product.init` block | exact (self-analog) |
| `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` (MODIFIED) | model | CRUD | own current `indexes` array | exact (self-analog) |
| `apps/dgfy-api/src/models/Tenant/ProductEmbedding.js` (NEW) | model | CRUD | `Product.js` + legacy `backend/src/models/ItemEmbedding.js` | role-match |
| `apps/dgfy-api/src/infra/tenantConnector.js` (MODIFIED) | provider (model registry) | event-driven | own `modelDefiners` registration block | exact (self-analog) |
| `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js` (MODIFIED) | repository | CRUD (txn+row-lock) | own `recordVerification()` + `shiftRepository.js` `closeShift()` | exact |
| `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js` (MODIFIED) | service (usecase) | request-response | own `buildReviewComplianceStateUseCase` two-write block | exact (self-analog) |
| `docs/architecture/adr/0029-...ownership-boundaries.md` (MODIFIED) | docs | n/a | dated `## Amendment` section (prose) | n/a |
| `docs/database/dgfy-data-migration-map.md` §10 (MODIFIED) | docs | n/a | §10 exclusion bullets (prose) | n/a |

> **CRITICAL cross-file invariant (RESEARCH top insight):** the migration and the
> `dgfyBusinessContract.js` entry are ONE atomic unit of work. `verify` iterates
> the *contract's* declared tables/columns/indexes — anything added by the
> migration but absent from the contract is never checked, so ROADMAP success
> criteria #2–#4 ("confirmed via schema verification") cannot be met. Never plan
> the migration without the matching contract diff in the same plan/wave.

---

## Pattern Assignments

### `2026071610xxxx-extend-schema-for-legacy-migration.cjs` (migration, DDL transform)

**Analogs:** `20260714103000-add-availment-source-reference.cjs` (canonical additive `addColumn` + unique-index precedent) and `20260712100000-create-commerce-foundation.cjs` (canonical `createTable` + index guard precedent).

**`meta` block pattern** — copy verbatim, only change strings (from `20260712100000` lines 57–68):
```js
module.exports = {
  meta: {
    destructive: false,          // additive → keeps runner off the --confirm-destructive gate
    targetKind: 'business',      // LOAD-BEARING: omitting defaults to 'core' → migration never runs vs tenant DBs (Pitfall 2)
    rollbackDescription: 'Drops products legacy-migration columns + attributes, product_embeddings table, and inventory_movements natural-key unique index — additive Phase 12 only.',
    estimatedRisk: 'low'
  },
```

**Idempotent guard helpers** — copy verbatim from `20260712100000` lines 71–104 (`tableExists`, `hasIndex`, `addIndexIfMissing`, `timestampColumns`). `20260714103000` lines 57–69 use the identical `hasIndex`/`addIndexIfMissing` pair:
```js
const tableExists = async (tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => {
    const value = typeof entry === 'string' ? entry : (entry?.tableName || entry?.table_name || String(entry));
    return String(value).toLowerCase() === String(tableName).toLowerCase();
  });
};
const hasIndex = async (tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
  } catch { return false; }
};
const addIndexIfMissing = async (tableName, columns, options = {}) => {
  if (options.name && await hasIndex(tableName, options.name)) return;
  await queryInterface.addIndex(tableName, columns, options);
};
const timestampColumns = () => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
});
```

**Additive `addColumn` pattern (LDM-02)** — mirror `20260714103000` lines 72–91 (`describeTable` guard, then `addColumn`). Per-column source types are **ground truth from legacy `backend/src/models/Item.js`** (see Shared table below):
```js
const p = await queryInterface.describeTable('products');
if (!p.sku_code) await queryInterface.addColumn('products', 'sku_code', { type: Sequelize.STRING(50), allowNull: true });
if (!p.description) await queryInterface.addColumn('products', 'description', { type: Sequelize.TEXT, allowNull: true });
if (!p.unit_of_measure) await queryInterface.addColumn('products', 'unit_of_measure', { type: Sequelize.STRING(50), allowNull: true });
if (!p.cost_per_unit) await queryInterface.addColumn('products', 'cost_per_unit', { type: Sequelize.DECIMAL(14, 4), allowNull: true }); // D-06 widens legacy DECIMAL(10,4) → base_price convention
if (!p.vat_type) await queryInterface.addColumn('products', 'vat_type', { type: Sequelize.ENUM('vatable', 'vat_exempt', 'zero_rated'), allowNull: false, defaultValue: 'vatable' }); // D-07 legacy verbatim
if (!p.senior_pwd_discount_eligible) await queryInterface.addColumn('products', 'senior_pwd_discount_eligible', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
if (!p.attributes) await queryInterface.addColumn('products', 'attributes', { type: Sequelize.JSON, allowNull: true }); // D-03 satellite fold container
await addIndexIfMissing('products', ['sku_code'], { name: 'idx_products_sku_code' }); // D-05: NON-unique (unique:false)
```

**`createTable` + unique-index pattern (LDM-03 `product_embeddings`)** — mirror the `20260712100000` table shape (lines 126–160 for `products`; opaque-UUID `business_id` CHAR(36) at line 131, same-DB INTEGER FK at lines 132–138) and its `addIndexIfMissing(..., { unique: true })` pattern (lines 120–123, 283–286):
```js
if (!await tableExists('product_embeddings')) {
  await queryInterface.createTable('product_embeddings', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    business_id: { type: Sequelize.CHAR(36), allowNull: false },                 // opaque UUID, NO FK (cross-DB convention, line 131)
    product_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' }, // same-DB INTEGER FK (lines 170-176)
    vector: { type: Sequelize.TEXT, allowNull: false },                          // legacy ItemEmbedding.vector shape (TEXT JSON-stringified floats)
    legacy_embedding_id: { type: Sequelize.INTEGER, allowNull: true },           // OPTIONAL traceability pointer (D-09 discretion — recommend include)
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  });
}
await addIndexIfMissing('product_embeddings', ['product_id'], { name: 'unique_product_embeddings_product', unique: true }); // D-09 strict 1:1
```

**Natural-key unique index (LDM-04 `inventory_movements`)** — same `addIndexIfMissing` unique pattern; existing organic rows leave NULL tuples (distinct under MySQL unique index) so no backfill (D-10). DDL does not trip the append-only `BEFORE UPDATE/DELETE` triggers (`20260712100000` lines 456–488):
```js
await addIndexIfMissing('inventory_movements', ['business_id', 'reference_type', 'reference_id'], { name: 'unique_inventory_movements_natural_key', unique: true });
```

**`down()` pattern** — guarded, try/catch no-op reversal. Copy the `20260714103000` `down()` shape (lines 94–127: `removeIndex` in try/catch, then `describeTable`-guarded `removeColumn`). For the `vat_type` ENUM teardown use the `20260712100000` MySQL defensive style (lines 524–534: `DROP TYPE IF EXISTS enum_products_vat_type .catch(()=>{})` — Postgres-ism, harmless on MySQL). Reverse dependency order: drop `product_embeddings` table before removing `products` columns.

---

### `dgfyBusinessContract.js` (config, verification contract — MODIFIED, in lockstep with the migration)

**Analog:** its own existing `products` (lines 250–273), `inventory_movements` (lines 278–300), and `product_folders` (lines 230–245) entries — copy the exact `{ columns, indexes, uniqueConstraints, foreignKeys, projectionOnly }` shape.

**`products` entry** — append the 7 new column names to `columns` (currently lines 251–266) and the new index name to `indexes` (currently line 267):
```js
products: {
  columns: [ /* ...14 existing... */, 'sku_code', 'description', 'unit_of_measure', 'cost_per_unit', 'vat_type', 'senior_pwd_discount_eligible', 'attributes' ],
  indexes: ['idx_products_business', 'idx_products_folder', 'idx_products_category', 'idx_products_sku_code'],
  uniqueConstraints: [],   // D-05: sku_code index is NON-unique, do NOT add here
  foreignKeys: [ { column: 'folder_id', referencesTable: 'product_folders', referencesColumn: 'id' } ],
  projectionOnly: false
}
```

**`inventory_movements` entry** — add the unique index name to BOTH `indexes` (line 293) and `uniqueConstraints` (currently `[]` at line 294):
```js
indexes: [ 'idx_inventory_movements_business_product', 'idx_inventory_movements_movement_type', 'unique_inventory_movements_natural_key' ],
uniqueConstraints: [ 'unique_inventory_movements_natural_key' ],
```

**NEW `product_embeddings` entry** — model it on `product_folders` (lines 230–245), adding the FK block from `inventory_movements` (lines 295–298):
```js
product_embeddings: {
  columns: ['id', 'business_id', 'product_id', 'vector', 'legacy_embedding_id', 'created_at', 'updated_at'],
  indexes: ['unique_product_embeddings_product'],
  uniqueConstraints: ['unique_product_embeddings_product'],
  foreignKeys: [ { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' } ],
  projectionOnly: false
}
```

> **DO NOT touch `rejectedTables`** (lines ~612–648). It is an orthogonal *target-side* guard (legacy table NAMES that must never exist in a tenant DB). Legacy `items`/`stock_movements`/`pos_transactions` must still never appear as tenant tables. Only `OUT_OF_SCOPE_LEGACY_TABLES` in `mappings.js` changes for LDM-01.

---

### `mappings.js` (config, scope gate — MODIFIED, LDM-01)

**Analog:** its own `OUT_OF_SCOPE_LEGACY_TABLES` array (lines 54–81, `Object.freeze([...])`).

**Edit:** remove exactly three entries — `'items'` (line 55), `'stock_movements'` (line 62), `'pos_transactions'` (line 67). LEAVE `'pos_transaction_lines'` (line 68 — Phase 14/SHM-02 owns it, Pitfall 4). `item_folders` is NOT in the array → its "removal" is a documented no-op, zero code change (Pitfall 3).

**Consumers unblocked (no code change to these functions, they read the array):**
```js
// lines 134-136 — the literal gate LDM-01 unblocks
export function isInScopeLegacyTable(legacyTable) {
  return !OUT_OF_SCOPE_LEGACY_TABLES.includes(toTrimmedString(legacyTable));
}
// lines 143-161 — classifyOutOfScopeRecord() no longer short-circuits items/stock_movements/pos_transactions to a skip finding
```

---

### `Product.js` (model — MODIFIED, drift-avoidance / A3 discretion)

**Analog:** its own `Product.init` block (lines 43–114). Add the 7 new fields alongside existing ones (matching legacy types exactly, mirroring how `base_price` uses `DataTypes.DECIMAL(14, 4)` at lines 79–82), and add `{ fields: ['sku_code'], name: 'idx_products_sku_code' }` to the `indexes` array (lines 109–113). Model uses `DataTypes` (not `Sequelize.*`), `underscored: true`, `timestamps: true`, `createdAt/updatedAt` explicit. The file header comment enforces "matching the migration ... exactly" — keep that contract.

---

### `InventoryMovement.js` (model — MODIFIED, drift-avoidance)

**Analog:** its own `indexes` array (lines 103–106). Append the natural-key unique index:
```js
indexes: [
  { fields: ['business_id', 'product_id'], name: 'idx_inventory_movements_business_product' },
  { fields: ['movement_type'], name: 'idx_inventory_movements_movement_type' },
  { fields: ['business_id', 'reference_type', 'reference_id'], name: 'unique_inventory_movements_natural_key', unique: true }
]
```
Note: `reference_type`/`reference_id` columns already exist (lines 65–72). Preserve the append-only `updatedAt: false` + `beforeUpdate`/`beforeBulkUpdate` throwing hooks (lines 100–114).

---

### `ProductEmbedding.js` (NEW model — role-match)

**Analogs:** `Product.js` for the modern Tenant-model shape (`(sequelize) => { class X extends Model {...} X.init({...}, { sequelize, tableName, underscored, timestamps }) }`), and legacy `backend/src/models/ItemEmbedding.js` for field semantics.

**Imports + shape** — copy `Product.js` lines 1, 13–14, 43–48, 101–114 skeleton. **Legacy field ground truth** (`ItemEmbedding.js` lines 10–25):
```js
item_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: 'items', key: 'item_id' } }, // → product_id unique 1:1 (D-09)
vector: { type: DataTypes.TEXT, allowNull: false, comment: 'JSON stringified array of floats from OpenAI embedding model' }
```
New model: `business_id` CHAR(36) opaque UUID, `product_id` INTEGER FK to `products` (`references: { model: 'products', key: 'id' }`), `vector` TEXT, `legacy_embedding_id` INTEGER nullable; `tableName: 'product_embeddings'`, `underscored: true`, `timestamps: true`. Add `associate(models)` `belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' })` following `InventoryMovement.js` lines 20–33.

---

### `tenantConnector.js` (provider, model registry — MODIFIED)

**Analog:** its own `modelDefiners` registration (lines 140–174) + import block (lines 2–22). Register `ProductEmbedding` so repositories don't resolve `undefined` at runtime (the exact Phase 9/Pitfall 1 bug called out in the comment at lines 158–160). Add an import `import defineProductEmbeddingModel from '../models/Tenant/ProductEmbedding.js';` and an entry `ProductEmbedding: defineProductEmbeddingModel,` in the `modelDefiners` object. The loop at lines 176–188 auto-instantiates and wires `associate()`.

> **Flag (Open Question #2 / A3):** the three model edits + new model + registration are drift-avoidance, NOT mandated by ROADMAP success criteria (only migration + contract + verify are). No API feature reads these columns yet. If the planner defers models to Phase 13, make it a conscious, recorded deferral.

---

### `complianceModeStateRepository.js` — NEW method `recordVerificationAndState()` (repository, txn+row-lock)

**Analogs:** its own `recordVerification()` (lines 269–290) and `shiftRepository.js` `closeShift()` (lines 256–289) — identical `sequelize.transaction` + `lock: transaction.LOCK.UPDATE` template.

**Existing `recordVerification()` to mirror** (lines 269–290):
```js
async recordVerification(businessId, branchId = null, { verification_status, verified_by_actor_type, verified_at }) {
  if (!businessId) throw new Error('...requires businessId.');
  return this.withModel(businessId, async (ComplianceModeState) => {
    const sequelize = ComplianceModeState.sequelize;
    return sequelize.transaction(async (transaction) => {
      const record = await ComplianceModeState.findOne({
        where: { business_id: businessId, branch_id: branchId },
        transaction, lock: transaction.LOCK.UPDATE
      });
      if (!record) throw new ComplianceStateNotFoundError();          // preserve "evidence before review" contract — do NOT findOrCreate
      await record.update({ verification_status, verified_by_actor_type, verified_at }, { transaction });
      return this.toPlain(record);
    });
  });
}
```
**New method:** identical shape, but the single `record.update()` writes all FOUR fields atomically — the verification triplet PLUS `state`. Wrap the update in the `try { ... } catch (e) { if (isUniqueConstraintViolation(e)) throw new DuplicateComplianceModeStateError(); throw e; }` pattern already used by `upsertState` (lines 241–248). Return `this.toPlain(record)`.

**`shiftRepository.js` row-lock template** (lines 264–289) — same `sequelize.transaction(async (t) => { findOne({..., transaction, lock: t.LOCK.UPDATE}); if (!x) throw NotFound; await x.update({...},{transaction}); })` structure.

**Keep** `upsertState()` (still used by evidence-submission first-write, `findOrCreate` path) and `recordVerification()` (compatibility). Only the review usecase switches over.

---

### `complianceUseCases.js` — usecase edit (service, request-response)

**Analog:** its own `buildReviewComplianceStateUseCase` two-write block (lines 307–320). Replace the two independent calls with one atomic call, computing `state` first:
```js
// BEFORE (lines 307-320): non-atomic recordVerification() then upsertState() — crash/race window
// AFTER:
const finalState = verificationStatus === COMPLIANCE_VERIFICATION_STATUS.VERIFIED
  ? newState
  : COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE;
const finalRow = await repository.recordVerificationAndState(businessId, branchId, {
  verification_status: verificationStatus,
  verified_by_actor_type: verifierActorType,
  verified_at: new Date(),
  state: finalState
});
```
The existing `catch` block (lines 324–337) already maps `DuplicateComplianceModeStateError` → duplicate, `TenantDatabaseUnavailableError` → tenant-db, `ComplianceStateNotFoundError` → 404 "submit evidence before review" — no new error handling needed.

> **Separate plan/wave:** this compliance fix touches `dgfy-api`, not the migration-runner. Do NOT blend it into the schema-extension plan (folded todo, per CONTEXT D-Folded).

---

### ADR 0029 + migration-map §10 (docs — MODIFIED, LDM-01/D-11)

**`docs/architecture/adr/0029-...ownership-boundaries.md`** (prose amendment): three passages —
- "Current Compatibility Decisions" #1 (~line 48): *"The physical `items` table remains unchanged in this phase."*
- "Current Compatibility Decisions" #3 (~line 55): *"Online Storefront orders remain stored in `pos_transactions` for v1 compatibility..."*
- "Rollout Policy" #3 (~line 95): *"Do not introduce destructive migrations, table renames, or schema splits in this phase."* (remains literally true — v2.1 is additive to NEW tables).
Recommended mechanism: add a dated `## Amendment (v2.1 Legacy Data Migration, 2026-07)` section + inline pointers; preserve `status: accepted`; bump `last_reviewed`; run `npm run lint:docs` after.

**`docs/database/dgfy-data-migration-map.md` §10 "Explicit Exclusions (ADR 0029)"** (~lines 268–280): move `items`, `stock_movements`, `pos_transactions` out of the exclusion bullets (SKUs/variants/categories/`pos_transaction_lines` STAY); note these three are covered starting Phase 13. Header states it "mirrors `OUT_OF_SCOPE_LEGACY_TABLES`" → must change in lockstep with `mappings.js`.

> **Discrepancy flag:** ROADMAP criterion #1 / LDM-01 say "ADR 0029's `OUT_OF_SCOPE_LEGACY_TABLES` list" — but the ADR contains no such array; it lives in `mappings.js`. Write acceptance criteria against the real artifacts: (a) `mappings.js` array no longer contains the 3 names, (b) ADR prose amended, (c) migration-map §10 amended.

---

## Shared Patterns

### Legacy → target column type map (LDM-02 ground truth)
**Source:** `backend/src/models/Item.js` (verified line ranges).
**Apply to:** the migration `addColumn` calls AND `Product.js` model fields.

| New `products` column | Legacy `Item.js` type | Target type | Decision |
|-----------------------|------------------------|-------------|----------|
| `sku_code` | `STRING(50)`, `allowNull:true` (lines 10–12) | `STRING(50)`, nullable, plain non-unique index | D-05 |
| `description` | `TEXT`, `allowNull:true` (lines 59–61) | `TEXT`, nullable | D-08 |
| `unit_of_measure` | `STRING(50)`, `allowNull:true` (lines 82–84) | `STRING(50)`, nullable | D-08 |
| `cost_per_unit` | `DECIMAL(10,4)`, `allowNull:true` (lines 86–88) | `DECIMAL(14,4)`, nullable (widened) | D-06 |
| `vat_type` | `ENUM('vatable','vat_exempt','zero_rated')`, `allowNull:false`, `default:'vatable'` (lines 101–104) | same verbatim | D-07 |
| `senior_pwd_discount_eligible` | `BOOLEAN`, `allowNull:false`, `default:false` (lines 107–110) | same verbatim | D-08 |
| `attributes` (satellite fold) | n/a (8 hasOne/hasMany satellites) | `JSON`, nullable | D-03 |

### Cross-DB opaque-UUID convention
**Source:** `20260712100000-create-commerce-foundation.cjs` line 131 + comment lines 33–43.
**Apply to:** every new column/table pointing at `dgfy_core` (`business_id`).
`business_id: { type: Sequelize.CHAR(36), allowNull: false }` — NO real FK (MySQL can't FK across databases). Same-DB relationships (`product_id → products.id`) use INTEGER autoincrement FKs with `references`/`onDelete`/`onUpdate`.

### JSON-column precedent on `dgfy_business_*` tables
**Source:** `InventoryMovement.js` lines 86–93 (`before_snapshot`/`after_snapshot`), migration lines 196–197.
**Apply to:** `products.attributes`. DDL: `{ type: Sequelize.JSON, allowNull: true }`; model: `{ type: DataTypes.JSON, allowNull: true }`.

### Transaction + row-lock (atomicity fix)
**Source:** `shiftRepository.js` `closeShift()` lines 264–289; `complianceModeStateRepository.js` `recordVerification()` lines 269–290.
**Apply to:** `recordVerificationAndState()`.
`const sequelize = Model.sequelize; return sequelize.transaction(async (transaction) => { const row = await Model.findOne({ where, transaction, lock: transaction.LOCK.UPDATE }); if (!row) throw NotFound; await row.update({...}, { transaction }); return this.toPlain(row); });`

### Additive-only migration discipline
**Source:** all prior migrations; verified zero `sync({ alter: true })` in codebase.
**Apply to:** the new migration. Every DDL op guarded by `describeTable`/`showIndex`/`showAllTables` existence checks; `down()` = guarded `removeColumn`/`removeIndex`/`dropTable` in try/catch no-ops.

---

## No Analog Found

None. Every artifact in this phase has a concrete in-repo analog. The only genuinely new schema object (`product_embeddings` table / `ProductEmbedding` model) is grounded in the `products` createTable pattern + legacy `ItemEmbedding.js` field semantics.

---

## Metadata

**Analog search scope:**
- `apps/dgfy-migration-runner/src/migrations/schema/` (13 migration files), `schemaContracts/`, `data/mappings.js`
- `apps/dgfy-api/src/models/Tenant/` (22 models), `src/infra/tenantConnector.js`, `src/modules/{compliance,shifts}/`
- `backend/src/models/` (legacy `Item.js`, `ItemEmbedding.js`)

**Files scanned:** ~15 read in full/targeted; directory listings for migrations + Tenant models.
**Pattern extraction date:** 2026-07-14
</content>
</invoke>
