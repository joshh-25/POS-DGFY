# Phase 12: Scope Unblock + Schema Extension - Research

**Researched:** 2026-07-14
**Domain:** Sequelize additive schema migrations (migration-runner), ADR/doc amendment, scope-check code, one folded transaction-safety fix
**Confidence:** HIGH (every finding grounded in direct reads of the actual codebase files)

## Summary

This phase is deliberately narrow: three additive Sequelize migrations against `dgfy_business_*` tenant databases (extend `products`, create `product_embeddings`, add a unique index to `inventory_movements`), a dual documentation/array amendment that unblocks legacy mappers (ADR 0029 prose + `docs/database/dgfy-data-migration-map.md` §10 + `mappings.js`'s `OUT_OF_SCOPE_LEGACY_TABLES`), and one folded compliance-transaction-safety fix (`recordVerificationAndState()`). No mapper code, no `backend/` writes.

The single most important planning insight is not in the CONTEXT: **the migration alone is invisible to the `verify` command.** `apps/dgfy-migration-runner/src/commands/verify.js` checks each tenant table against the declared shape in `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` — it does NOT introspect "whatever columns happen to exist." ROADMAP success criteria #2–#4 all say "confirmed via schema verification." Therefore every new column/table/index MUST also be added to `dgfyBusinessContract.js`, or `verify` will not check it and the success criteria cannot be met. This is a required, co-equal task alongside each migration — treat migration + contract-entry as one atomic unit of work.

**Primary recommendation:** One additive migration file (targetKind `business`, timestamp lexically greater than `20260715120000`) mirroring the idempotent guard patterns already in `20260714103000-add-availment-source-reference.cjs`; update `dgfyBusinessContract.js` in lockstep; update the three persistence-only dgfy-api models to prevent drift; amend the ADR + migration-map + `mappings.js` array (item_folders removal is a verified no-op); implement `recordVerificationAndState()` mirroring `shiftRepository.js`'s transaction+row-lock pattern as a separate plan/wave.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Satellite-Table Folding & BOM Scope**
- **D-01:** `product_composition`/BOM data IS in scope for migration (locked by PIM-02). Open question was only representation shape, now resolved.
- **D-02:** `attributes.composition` entries resolve their ingredient to the ingredient's migrated `products.id` via `legacy_id_map` (not a name/quantity snapshot). Unmigrated ingredient → `finding` logged (Phase 13 concern, not this phase's schema concern).
- **D-03:** The 8 satellite tables (nutrition, allergens, physical properties, shelf life, packaging, QC, regulatory compliance, cost breakdown) plus composition/barcodes fold into `products.attributes` JSON **namespaced by domain** — one key per legacy satellite table (`attributes.nutrition`, `attributes.allergens`, `attributes.physicalProperties`, `attributes.compliance`, `attributes.costBreakdown`, `attributes.composition`, `attributes.barcodes`). Rejected: flat merged object.
- **D-04:** When a legacy item has no row in a given satellite table, the mapper **omits that key entirely** (not `null`/`{}`). "Key present" = "legacy had this satellite row."

**`products` Typed Columns**
- **D-05:** `sku_code` gets **no uniqueness constraint** — plain index, `unique: false`, duplicates allowed (matches legacy `items.sku_code` exactly).
- **D-06:** `cost_per_unit` is `DECIMAL(14,4)` — matches existing `products.base_price` (Phase 8), not legacy's narrower `DECIMAL(10,4)`. Strict superset, no precision loss.
- **D-07:** `vat_type` is `ENUM('vatable', 'vat_exempt', 'zero_rated')`, `defaultValue: 'vatable'`, `allowNull: false` — reuses legacy's `items.vat_type` enum verbatim.
- **D-08:** `senior_pwd_discount_eligible` (BOOLEAN), `description` (TEXT), `unit_of_measure` (STRING) port directly from legacy's identically-named/typed columns.

**`product_embeddings`**
- **D-09:** One row per product, **unique `product_id`** — matches legacy `item_embeddings`' strict 1:1 shape. No per-model-version dimension (PIM-06 = carry vectors as-is; EMB-01 deferred to v2.x).

**`inventory_movements` Natural Key**
- **D-10:** Natural-key unique index is `(business_id, reference_type, reference_id)` per LDM-04. Existing Phase 8/9 organic movements (restock/loss/adjustment) left untouched — they never populate `reference_type`/`reference_id`, and MySQL treats NULL tuples as distinct, so no collision, no retrofit. Migrated rows populate `reference_type='stock_movement'` / `reference_id=<legacy stock_movements.id>`. This phase does not touch Phase 8/9 application code.

**ADR 0029 Amendment Scope**
- **D-11:** Amend **both** ADR 0029 and `docs/database/dgfy-data-migration-map.md` §10, plus `mappings.js`'s `OUT_OF_SCOPE_LEGACY_TABLES`. Move `items`, `item_folders`, `stock_movements`, `pos_transactions` out of the exclusion list/array, noting they're now covered starting Phase 13.
- **Note for planning:** `item_folders` is named by LDM-01 but is **not actually present** in the current `OUT_OF_SCOPE_LEGACY_TABLES` array — confirm during planning whether this is a stale reference or gated elsewhere before treating removal as a no-op. *(RESEARCH VERDICT below: confirmed no-op — see "Scope-Check Enforcement".)*

### Claude's Discretion
- Exact migration file naming/wave sequencing for the additive schema changes.
- `product_embeddings` vector storage column type/format (legacy stores JSON-stringified float array in `TEXT`) — default to porting the same TEXT-JSON-string shape unless research finds a reason not to. *(RESEARCH: no reason found to deviate — see LDM-03.)*
- Whether/how to add a traceability pointer back to the legacy `embedding_id` on `product_embeddings` rows.

### Deferred Ideas (OUT OF SCOPE)
- None raised beyond the folded todo (which was pulled *into* scope, not deferred).
- LDM-05 (`availments.source_system` additive column) is Phase 14, NOT this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LDM-01 | Amend ADR 0029 to remove `items`/`item_folders`/`stock_movements`/`pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES`, unblocking every new mapper. | Array lives in `mappings.js` (NOT the ADR). `items`/`stock_movements`/`pos_transactions` present → remove. `item_folders` absent → no-op. Dual-amend ADR prose + migration-map §10. See "Scope-Check Enforcement" + "ADR + Migration-Map Amendment". |
| LDM-02 | Extend `products` with 6 typed columns + 1 `attributes` JSON column; document satellite-folding design before mapper code. | Legacy types confirmed from `backend/src/models/Item.js`. Additive `addColumn` pattern + `dgfyBusinessContract.js` update. See "Target-Schema Extension". Satellite-folding design doc = D-01..D-04 already captured; planner emits a committed design doc/decision record. |
| LDM-03 | New `product_embeddings` table (one row per product) for carry-over vectors. | `product_embeddings`/`ProductEmbedding` confirmed to NOT exist anywhere. New `createTable` + new Sequelize model + contract entry. See "product_embeddings". |
| LDM-04 | `inventory_movements` gains natural-key unique index `(business_id, reference_type, reference_id)`. | `addIndexIfMissing` with `unique: true`. Append-only trigger does not fire on DDL; NULL tuples distinct → no retrofit. See "inventory_movements Natural Key". |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Additive tenant-schema DDL (`products`/`product_embeddings`/`inventory_movements`) | Migration runner (`apps/dgfy-migration-runner`) | — | ADR 0029 + established discipline: all `dgfy_business_*` schema changes are Umzug migrations under `src/migrations/schema`, never `sync({alter:true})`. |
| Schema verification contract | Migration runner (`schemaContracts/dgfyBusinessContract.js`) | — | `verify` checks declared contract shape, not live introspection. Contract is the single source of truth for "what must exist." |
| Legacy source-scope gate | Migration runner (`data/mappings.js`) | — | `isInScopeLegacyTable()` / `OUT_OF_SCOPE_LEGACY_TABLES` is the code path LDM-01 unblocks. Pure function, no DB. |
| Ownership-boundary contract (doc) | ADR 0029 + migration-map §10 | — | Prose contract mirroring the code array; must be amended in lockstep (D-11). |
| Persistence models (drift avoidance) | dgfy-api (`src/models/Tenant/*`) | — | Persistence-only models must match the migration exactly (established comment-enforced discipline). |
| Compliance review atomicity | dgfy-api (`modules/compliance`) | — | `recordVerificationAndState()` — repository+usecase, not migration-runner. Separate plan/wave. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sequelize | (already installed) | ORM + `queryInterface` DDL (`addColumn`/`createTable`/`addIndex`/`describeTable`/`showIndex`) | Every existing migration + model uses it. `[VERIFIED: apps/dgfy-migration-runner/src/commands/schema.js imports Sequelize]` |
| umzug | (already installed) | Migration runner/tracker (pending/executed state in metadata storage) | `schema.js` builds `new Umzug(...)`; idempotency derives from executed-migration tracking. `[VERIFIED: schema.js:6 import { Umzug }]` |

**No new packages are installed by this phase.** All work uses already-present sequelize + umzug and edits existing source files. The Package Legitimacy Audit below is therefore N/A.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One combined migration file | Three separate migrations (per LDM) | Separate files give per-LDM rollback granularity but three Umzug entries + three contract diffs. Precedent (`20260714103000`) touched 2 tables in one file. **Recommend: one combined file** — atomic, matches precedent, coarse granularity. |
| `TEXT` vector storage | JSON column / dedicated vector type | Legacy `item_embeddings.vector` is `TEXT` JSON-stringified float array; PIM-06 requires carry-over as-is with no re-embedding. No existing vector infra to match. **Recommend: port `TEXT` shape** (D-09 discretion resolved). |

**Installation:** None.

## Package Legitimacy Audit

N/A — this phase installs zero external packages. All changes edit existing source files using already-installed `sequelize` and `umzug`.

## Migration-Runner Mechanics

### File-naming convention
`YYYYMMDDHHmmss-kebab-case-description.cjs` under `apps/dgfy-migration-runner/src/migrations/schema/`. `[VERIFIED: ls of schema dir]`

Files are discovered by `readdirSync(...).filter(.cjs).sort()` (`schema.js:132-136`) and applied in **lexical sort order**. Current max timestamp is `20260715120000`. **A Phase 12 migration must use a timestamp lexically greater than `20260715120000`** (e.g. `20260716100000-...`) so Umzug treats it as pending and applies it after all existing migrations. Note: timestamps are monotonic, not wall-clock — existing files are dated ahead of today (2026-07-14). `[VERIFIED: schema.js listMigrationFiles + directory contents]`

### up/down module shape
Every migration exports `{ meta, up, down }`. `meta` must include:
```js
meta: {
  destructive: false,          // additive → false; keeps runner off the --confirm-destructive gate
  targetKind: 'business',      // REQUIRED — scopes to dgfy_business_* only; omitting defaults to 'core' (WRONG here)
  rollbackDescription: '...',  // human string
  estimatedRisk: 'low'
}
```
`targetKind: 'business'` is load-bearing: `buildMigrationsForKind()` (`schema.js:145-159`) filters `(migration.meta?.targetKind || 'core') === kind`, so a business migration missing this field would silently attach to `dgfy_core` and never run against tenant DBs. `[VERIFIED: schema.js:152 + 20260712100000 header]`

### Additive-only idempotent guard patterns (copy verbatim)
From `20260714103000-add-availment-source-reference.cjs` (the canonical additive-column precedent) and `20260712100000` (createTable + index precedent):

```js
// column existence guard
const desc = await queryInterface.describeTable('products');
if (!desc.sku_code) {
  await queryInterface.addColumn('products', 'sku_code', { type: Sequelize.STRING(50), allowNull: true });
}

// index existence guard (helper)
const hasIndex = async (t, name) => {
  try { return (await queryInterface.showIndex(t) || []).some(i => String(i.name).toLowerCase() === name.toLowerCase()); }
  catch { return false; }
};
const addIndexIfMissing = async (t, cols, opts = {}) => {
  if (opts.name && await hasIndex(t, opts.name)) return;
  await queryInterface.addIndex(t, cols, opts);
};

// table existence guard
const tableExists = async (name) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some(e => String(typeof e === 'string' ? e : (e.tableName || e)).toLowerCase() === name.toLowerCase());
};
if (!await tableExists('product_embeddings')) { await queryInterface.createTable('product_embeddings', {...}); }
```
`[VERIFIED: 20260714103000 up() + 20260712100000 up() helpers]`

**Additive discipline confirmed:** no migration in the codebase calls `sequelize.sync({ alter: true })` — all schema change is explicit `queryInterface` DDL guarded by existence checks. `down()` reverses with guarded `removeColumn`/`removeIndex`/`dropTable` wrapped in try/catch no-ops. For MySQL ENUM columns, `down()` uses `DROP TYPE IF EXISTS ... .catch(()=>{})` defensively (a Postgres-ism harmless on MySQL where inline enums vanish with the column). `[VERIFIED: 20260712100000 down()]`

### How migrations are applied
CLI: `node src/cli.js schema migrate` → `runSchemaMigrate()` (`schema.js:178`). Flow: validate env → assert target-db-name allowed → capture legacy fingerprint baseline (once) → build Umzug per target → `umzug.pending()` → destructive gate → `umzug.up()` → write JSON + summary report → record in metadata. Applies to the primary target and every `DGFY_BUSINESS_DB_NAMES` tenant target. `[VERIFIED: schema.js:178-304]`

### How verify confirms a column/table/index exists (success criteria #2–#4)
CLI: `node src/cli.js verify` → `runVerify()` (`verify.js:337`). For each configured `dgfy_business_*` target it runs `checkContractSchema({ contract: dgfyBusinessContract })`, which for each table in the **contract** calls `checkTableAgainstContract()`:
- columns: `describeTable(t)` → `tableContract.columns.filter(c => !columns[c])` → `missing_columns`
- indexes: `showIndex(t)` → `tableContract.indexes.filter(name => !indexNames.has(name))` → `missing_indexes`
- unique constraints: unique indexes filtered against `tableContract.uniqueConstraints` → `missing_unique_constraints`
- foreign keys: `information_schema.key_column_usage` query vs `tableContract.foreignKeys` → `missing_foreign_keys`

A table is `ok` only when all four "missing" arrays are empty. `report.summary.business_schemas_ok` is `true` only when every table is `ok`. `[VERIFIED: verify.js:46-137]`

**Consequence (the critical planning fact): a column/table/index that is added by the migration but NOT declared in `dgfyBusinessContract.js` is simply never checked — verify reports it neither present nor missing.** To satisfy "confirmed via schema verification," the contract must gain the new shape. See Common Pitfall 1.

### Idempotency proof (success criterion #4)
`verify.js` derives an `idempotency` section from `checkMigrationMetadata()`: `pending_migrations` per target from Umzug's executed-migration metadata. Zero pending ⇒ a rerun of `schema migrate` is a pure no-op. Separately, `legacy_non_mutation` compares an information_schema fingerprint baseline against a fresh scan (`unchanged: true` ⇒ no drift). The within-migration existence guards additionally make a *forced* rerun of the same file safe (no duplicate-index error). `[VERIFIED: verify.js:159-174, 225-281, 455-469]`

## Target-Schema Extension Surface (LDM-02)

### Legacy source column types (ground truth from `backend/src/models/Item.js`)
| Legacy column | Legacy type | New `products` column (per Decisions) | Notes |
|---------------|-------------|----------------------------------------|-------|
| `sku_code` | `STRING(50)`, `allowNull:true`, `unique:false` | `STRING(50)`, `allowNull:true`, plain non-unique index | D-05 verbatim. `[VERIFIED: Item.js:10-14]` |
| `description` | `TEXT`, `allowNull:true` | `TEXT`, `allowNull:true` | D-08. `[VERIFIED: Item.js:59-62]` |
| `unit_of_measure` | `STRING(50)`, `allowNull:true` | `STRING(50)`, `allowNull:true` | D-08 (legacy width is 50). `[VERIFIED: Item.js:82-85]` |
| `cost_per_unit` | `DECIMAL(10,4)`, `allowNull:true` | `DECIMAL(14,4)`, `allowNull:true` | D-06 widens to match `base_price`. `[VERIFIED: Item.js:86-92 + Product.js base_price DECIMAL(14,4)]` |
| `vat_type` | `ENUM('vatable','vat_exempt','zero_rated')`, `allowNull:false`, `default:'vatable'` | same, verbatim | D-07. `[VERIFIED: Item.js:101-106]` |
| `senior_pwd_discount_eligible` | `BOOLEAN`, `allowNull:false`, `default:false` | same, verbatim | D-08. `[VERIFIED: Item.js:107-111]` |
| (satellite fold) | 8 hasOne/hasMany satellites | `attributes` `JSON`, `allowNull:true` | D-03 namespaced; see below. |

### Existing JSON-column precedent
`products` has **no** `attributes` column today. `[VERIFIED: Product.js — grep for "attributes" returned nothing]`. The `DataTypes.JSON` precedent on `dgfy_business_*` tables is well established: `InventoryMovement.before_snapshot`/`after_snapshot` (`InventoryMovement.js:86-93`), plus `Availment`, `ComplianceModeState.compliance_profile`, `Receipt`. The migration DDL shape is `attributes: { type: Sequelize.JSON, allowNull: true }`. `[VERIFIED: InventoryMovement.js:196-197 migration + model]`

### Satellite-folding shape (grounds D-03/D-04, LDM-02's design-doc deliverable)
From `backend/src/models/index.js` associations `[VERIFIED: lines 242-260]`:
- **1:1 (`hasOne`)** → single object under its namespace key: `nutrition`, `physicalProperties`, `shelfLife`, `packaging`, `qualityControl`, `regulatoryCompliance` (→ `attributes.compliance`), `costBreakdown` (→ `attributes.costBreakdown`).
- **1:many (`hasMany`)** → array under its key: `allergens`, `barcodes` (→ `attributes.barcodes` present as an array — matches ROADMAP Phase 13 criterion #2), `productCompositions` (→ `attributes.composition`).
- `ProductComposition` is keyed on both `product_id` and `ingredient_id` (self-referential BOM); D-02 resolves ingredient → migrated `products.id` via `legacy_id_map` at Phase 13 mapper time — **this phase only reserves the `attributes` JSON container; no resolution logic here.**

LDM-02 requires a *committed design doc/decision* capturing the 1:1-vs-1:many folding (incl. BOM scope) **before mapper code**. D-01..D-04 already are that decision — the planner should emit a short committed design note (or ADR-adjacent doc) recording the namespace→cardinality table above so Phase 13 has a written contract.

### Cross-DB opaque-UUID convention
All new tables/columns pointing at `dgfy_core` use `CHAR(36)` opaque UUIDs with NO real FK (`business_id`). Same-DB relationships (`product_id → products.id`) use `INTEGER` autoincrement FKs. `[VERIFIED: 20260712100000 header + every table def]`

### `product_embeddings` (LDM-03)
Confirmed genuinely new: no `product_embeddings` table or `ProductEmbedding` model exists anywhere in `apps/`. `[VERIFIED: grep product_embeddings/ProductEmbedding → 0 matches]`

Recommended DDL (mirroring legacy `ItemEmbedding` + Phase 8 conventions):
```js
await queryInterface.createTable('product_embeddings', {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  business_id: { type: Sequelize.CHAR(36), allowNull: false },      // opaque UUID, no FK
  product_id: {
    type: Sequelize.INTEGER, allowNull: false,
    references: { model: 'products', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE'
  },
  vector: { type: Sequelize.TEXT, allowNull: false },               // JSON-stringified float array (D-09 discretion → TEXT)
  legacy_embedding_id: { type: Sequelize.INTEGER, allowNull: true },// OPTIONAL traceability pointer (discretion) — recommend include
  created_at: { ... }, updated_at: { ... }
});
await addIndexIfMissing('product_embeddings', ['product_id'], {
  name: 'unique_product_embeddings_product', unique: true          // D-09 strict 1:1
});
```
Legacy source shape confirmed: `ItemEmbedding.vector` is `TEXT`, `allowNull:false`, comment "JSON stringified array of floats"; `item_id` is `unique:true` (1:1). `[VERIFIED: backend/src/models/ItemEmbedding.js:10-25]`. The optional `legacy_embedding_id` pointer (D-09 discretion) is cheap traceability for Phase 13 verification — recommend including it (nullable, no FK — it points at a legacy-DB PK).

### `inventory_movements` Natural Key (LDM-04)
```js
await addIndexIfMissing('inventory_movements', ['business_id', 'reference_type', 'reference_id'], {
  name: 'unique_inventory_movements_natural_key', unique: true
});
```
**Append-only trigger interaction (D-10):** `inventory_movements` carries `BEFORE UPDATE`/`BEFORE DELETE` triggers that `SIGNAL SQLSTATE '45000'`. These fire on row DML, **not on DDL** — `ALTER TABLE ... ADD INDEX` is unaffected, so index creation succeeds. Existing organic rows (restock/loss/adjustment) leave `reference_type`/`reference_id` NULL; MySQL's unique index treats each NULL-containing tuple as distinct, so no collision and **no retrofit/backfill needed**. Migrated Phase 13 rows will set `reference_type='stock_movement'`, `reference_id=<legacy id>`, gaining idempotency protection. `[VERIFIED: 20260712100000:184-185, 456-488 triggers; InventoryMovement.js:65-72; D-10 reasoning]`

### Model-drift avoidance (recommended, Claude's discretion)
The three persistence-only models are comment-enforced to "match the migration exactly." To avoid drift after the migration lands, update in the same phase:
- `apps/dgfy-api/src/models/Tenant/Product.js` — add the 6 columns + `attributes` JSON + `sku_code` index.
- `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` — add the unique index to its `indexes` array.
- New `apps/dgfy-api/src/models/Tenant/ProductEmbedding.js` — new persistence-only model + register it in the Tenant model loader/associations.

ROADMAP success criteria technically only mandate migration + contract + verify; model updates are for parity/drift-prevention. Flag: if the planner defers model updates, it must be a conscious deferral (the API has no feature reading these columns yet, so it is non-blocking — but every other model file in this tree matches its migration).

## Scope-Check Enforcement (LDM-01)

### Current `OUT_OF_SCOPE_LEGACY_TABLES` (verbatim, `mappings.js:54-81`)
`items`, `products`, `skus`, `product_variants`, `categories`, `purchase_orders`, `job_orders`, `stock_movements`, `item_location_stocks`, `fifo_batches`, `suppliers`, `supplier_items`, `pos_transactions`, `pos_transaction_lines`, `shifts`, `cashier_sessions`, `terminal_sessions`, `discounts`, `promos`, `promotions`, `fiscal_receipts`, `fiscal_compliance_logs`, `checkout_sessions`, `storefront_pages`, `storefront_orders`, `storefront_carts`. `[VERIFIED: mappings.js:54-81]`

### `item_folders` verdict: CONFIRMED NO-OP
`item_folders` is **not present** in `OUT_OF_SCOPE_LEGACY_TABLES`, nor in either schema contract's `rejectedTables`, nor anywhere in `apps/dgfy-migration-runner/src`. `[VERIFIED: grep item_folders across migration-runner src + contracts → 0 matches]`. Therefore `isInScopeLegacyTable('item_folders')` **already returns `true`** — Phase 13's folder mapper is already unblocked for it. LDM-01's naming of `item_folders` is a stale/aspirational reference. **Action: remove `items`, `stock_movements`, `pos_transactions` from the array (all three ARE present); document `item_folders` as already-in-scope (no code change).**

### Code paths LDM-01 unblocks
- `isInScopeLegacyTable(legacyTable)` (`mappings.js:134-136`) = `!OUT_OF_SCOPE_LEGACY_TABLES.includes(...)`. Every future mapper/dry-run/apply gates on this.
- `classifyOutOfScopeRecord(legacyTable, legacyId)` (`mappings.js:143-161`) builds the structured `skip` / `out_of_scope_entity` finding. After removal, encountering an `items`/`stock_movements`/`pos_transactions` row no longer short-circuits to this skip. `[VERIFIED: mappings.js:129-161]`

### DO NOT touch `rejectedTables` (important distinction)
The two contracts' `rejectedTables` (`dgfyBusinessContract.js:623-648`, `dgfyCoreContract.js`) are a **different, target-side** guard: table NAMES that must never exist in a `dgfy_business_*` database (verify fails if present). Legacy names `items`/`stock_movements`/`pos_transactions` **still must never appear as tenant tables** — the migration maps their DATA into `products`/`inventory_movements`/`availments`, it does not create tables by those legacy names. `OUT_OF_SCOPE_LEGACY_TABLES` (source-read gate) and `rejectedTables` (target-existence guard) are orthogonal. **LDM-01/D-11 correctly names only `OUT_OF_SCOPE_LEGACY_TABLES` — leave `rejectedTables` unchanged.** `[VERIFIED: rejectedTables semantics in verify.js:129 + dgfyBusinessContract.js:612-648]`

### `pos_transaction_lines` stays (flag for Phase 14)
LDM-01 names only `pos_transactions`, not `pos_transaction_lines`. The array contains both. After this phase `pos_transaction_lines` remains out-of-scope, which will block Phase 14's line-item mapper (SHM-02, `pos_transaction_lines → availment_items`). This is consistent with requirement scoping (Phase 14 owns SHM-02), but the planner should NOT preemptively remove it here. Flag noted for Phase 14 planning. `[VERIFIED: mappings.js:67-68; ROADMAP Phase 14 SHM-02]`

## ADR + Migration-Map Amendment Mechanics (LDM-01 / D-11)

### DISCREPANCY FLAG (success-criterion phrasing vs. reality)
ROADMAP success criterion #1 and LDM-01 both say *"ADR 0029's `OUT_OF_SCOPE_LEGACY_TABLES` list no longer includes..."* — but **ADR 0029 contains no such list.** That array lives in `mappings.js`. The ADR is prose ownership-boundary text. D-11 already handles this correctly (dual amendment of prose + array + migration-map). The planner should write acceptance criteria against the correct artifacts, not literally "the ADR's OUT_OF_SCOPE_LEGACY_TABLES list." `[VERIFIED: full read of ADR 0029 — no array present]`

### Exact ADR 0029 passages to amend (prose)
`docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`:
- **"Current Compatibility Decisions" #1** (line ~48): *"The physical `items` table remains unchanged in this phase."* — add amendment noting the v2.1 Legacy Data Migration milestone now migrates legacy `items` data into the new `dgfy_business_*.products` schema (Phase 13), superseding "remains unchanged in this phase."
- **"Current Compatibility Decisions" #3** (line ~55): *"Online Storefront orders remain stored in `pos_transactions` for v1 compatibility..."* — note legacy `pos_transactions` sales history migrates into `availments` (Phase 14).
- **"Rollout Policy" #3** (line ~95): *"Do not introduce destructive migrations, table renames, or schema splits in this phase."* — remains literally true (v2.1 changes are ADDITIVE migrations to NEW `dgfy_*` tables, not destructive/renames/splits of legacy); add a clarifying amendment note that a new milestone now migrates these domains into the new schema so the "in this phase" framing is not read as "never."

Recommended mechanism: add a dated `## Amendment (v2.1 Legacy Data Migration, 2026-07)` section at the end plus inline pointers, rather than rewriting history. Preserve `status: accepted`; bump `last_reviewed`. Run `npm run lint:docs` (an ADR 0029 validation step) after editing. `[VERIFIED: ADR 0029 Validation #4]`

### Exact migration-map §10 passages to amend
`docs/database/dgfy-data-migration-map.md` §10 "Explicit Exclusions (ADR 0029)" (lines ~268-280). Header states it "mirrors `OUT_OF_SCOPE_LEGACY_TABLES`," so it MUST change in lockstep (D-11). Bullets to edit:
- *"Products/items, SKUs, product variants, categories."* → move `items` out (SKUs/variants/categories stay excluded).
- *"...stock movements, item/location stock, FIFO batches..."* → move `stock_movements` out.
- *"POS transactions/lines, shifts, cashier sessions..."* → move `pos_transactions` out (note: `pos_transaction_lines` stays until Phase 14).
Add a note that these three are now covered starting Phase 13 (v2.1 milestone). Leave `item_folders` implicit (never listed). `[VERIFIED: migration-map §10 read]`

### Triple-amendment checklist (D-11)
1. `mappings.js` — remove `items`, `stock_movements`, `pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES`.
2. ADR 0029 — amend the three prose passages above.
3. migration-map §10 — amend the three bullets above.
(`item_folders`: no code change; document as already in scope.)

## Folded Compliance-Todo Pattern (`recordVerificationAndState()`)

### Current defect (`complianceUseCases.js:307-320`)
`buildReviewComplianceStateUseCase` performs two independent, non-transactional writes:
```js
await repository.recordVerification(businessId, branchId, { verification_status, verified_by_actor_type, verified_at });
const finalRow = verificationStatus === VERIFIED
  ? await repository.upsertState(businessId, branchId, { state: newState })
  : await repository.upsertState(businessId, branchId, { state: NON_COMPLIANT_ACTIVE });
```
A crash/race between the two can leave verification recorded but state not demoted (fail-open for Fiscal POS_CHECKOUT) or vice versa. `[VERIFIED: complianceUseCases.js:307-320]`

### Pattern to mirror (`shiftRepository.js` + existing `recordVerification`)
`shiftRepository.js:264-289` (`closeShift`) is the transaction+row-lock template: resolve `sequelize` from the model, `sequelize.transaction(async (t) => { findOne({..., transaction:t, lock: t.LOCK.UPDATE}); ...update({...},{transaction:t}); })`. `complianceModeStateRepository.recordVerification` (`:269-290`) already uses exactly this shape for the verification-only write. `[VERIFIED: shiftRepository.js:264-289; complianceModeStateRepository.js:269-290]`

### Recommended `recordVerificationAndState()` shape
Add to `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js`:
```js
async recordVerificationAndState(businessId, branchId = null, {
  verification_status, verified_by_actor_type, verified_at, state
}) {
  if (!businessId) throw new Error('...requires businessId.');
  return this.withModel(businessId, async (ComplianceModeState) => {
    const sequelize = ComplianceModeState.sequelize;
    return sequelize.transaction(async (transaction) => {
      const record = await ComplianceModeState.findOne({
        where: { business_id: businessId, branch_id: branchId },
        transaction, lock: transaction.LOCK.UPDATE
      });
      if (!record) throw new ComplianceStateNotFoundError();   // preserve "submit evidence before review" contract
      try {
        await record.update(
          { verification_status, verified_by_actor_type, verified_at, state },
          { transaction }
        );
      } catch (e) {
        if (isUniqueConstraintViolation(e)) throw new DuplicateComplianceModeStateError();
        throw e;
      }
      return this.toPlain(record);
    });
  });
}
```
Key design points:
- **Requires an existing row** (findOne + `ComplianceStateNotFoundError`), matching `recordVerification`'s current contract — at review time evidence was already submitted (which created the row via `upsertState`). Do NOT `findOrCreate` here; that would change semantics and the usecase already maps `ComplianceStateNotFoundError` → 404 "submit evidence before review." `[VERIFIED: complianceUseCases.js:331-334 error mapping]`
- One `record.update()` writes all four fields (verification triplet + `state`) atomically under the row lock.
- Keep `isUniqueConstraintViolation` → `DuplicateComplianceModeStateError` duck-typing for consistency (defensive; unlikely with an existing row).

### Usecase edit
Replace the two-call block (`complianceUseCases.js:308-320`) with a single call, computing `state` before the call:
```js
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
Existing catch-block mappings (`ComplianceStateNotFoundError`/`DuplicateComplianceModeStateError`/`TenantDatabaseUnavailableError`) already cover the new method's throws — no new error handling needed. `[VERIFIED: complianceUseCases.js:324-337]`

### Keep the old methods
`upsertState()` is still used for evidence submission (first-write path, `findOrCreate`); `recordVerification()` may remain for compatibility. Only the review usecase switches to the combined method. This is a **separate plan/wave** from the schema work (touches `dgfy-api`, not migration-runner) — do not blend into the schema-extension plan.

## Architecture Patterns

### System flow (Phase 12 deliverables)
```
[operator] --schema migrate--> Umzug (targetKind=business filter)
                                  |
                                  v
   NEW additive migration (timestamp > 20260715120000)
     |-- addColumn products x6 + attributes JSON (guarded by describeTable)
     |-- createTable product_embeddings (guarded by showAllTables) + unique(product_id)
     |-- addIndexIfMissing inventory_movements unique(business_id,reference_type,reference_id)
                                  |
                                  v
   [operator] --verify--> checkContractSchema(dgfyBusinessContract)  <-- MUST be updated
                                  |                                        in lockstep or
                                  v                                        new shape is unchecked
   report.summary.business_schemas_ok === true  (success criteria #2-4)
   report.idempotency[].pending_migrations === []  (success criterion #4)
   report.legacy_non_mutation.unchanged === true   (no drift)

[SCOPE UNBLOCK — no runtime]         [FOLDED FIX — dgfy-api, separate wave]
  mappings.js OUT_OF_SCOPE array       complianceModeStateRepository
  ADR 0029 prose                         + recordVerificationAndState() (txn+row lock)
  migration-map §10                    complianceUseCases (two writes -> one call)
```

### Anti-Patterns to Avoid
- **`sync({ alter: true })`** — never used here; breaks the additive-migration discipline and the fingerprint non-mutation guarantee.
- **Editing `rejectedTables`** — orthogonal to LDM-01; would wrongly allow legacy table names in tenant DBs.
- **Migration without contract update** — new shape becomes invisible to `verify` (Pitfall 1).
- **`findOrCreate` in `recordVerificationAndState`** — changes the "evidence must exist before review" contract.
- **Timestamp ≤ current max** — a lower-sorted new file will not be treated as pending after later-dated files; use > `20260715120000`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column/table/index existence checks | Custom SQL introspection | `describeTable`/`showIndex`/`showAllTables` guard helpers already in `20260712100000` | Proven idempotent, dialect-normalized. |
| Migration ordering/tracking | Manual "has this run" bookkeeping | Umzug + `MetaSequelizeStorage` | Already wired; `idempotency` report derives from it. |
| Schema verification | Ad-hoc "does column exist" script | `verify` command + `dgfyBusinessContract` entry | The success criteria are literally its output. |
| Transaction + row lock | Manual SELECT-then-UPDATE | `sequelize.transaction` + `lock: t.LOCK.UPDATE` (shiftRepository pattern) | The exact bug being fixed is a non-atomic two-write; reuse the proven Phase 8 lock pattern. |

## Common Pitfalls

### Pitfall 1: Migration adds the shape but `verify` can't see it
**What goes wrong:** Columns/table/index are created, but `verify` reports `business_schemas_ok` without confirming them — success criteria #2–#4 unmet.
**Why:** `checkContractSchema` iterates the **contract's** tables/columns/indexes, not live introspection. Anything absent from `dgfyBusinessContract.js` is never checked.
**How to avoid:** For every migration change, add the matching entry to `dgfyBusinessContract.js` in the SAME plan: `products.columns` += 6 new + `attributes`; new `product_embeddings` table block (columns/indexes/uniqueConstraints/foreignKeys); `inventory_movements.indexes` += `unique_inventory_movements_natural_key` and `uniqueConstraints` += same.
**Warning sign:** `verify` passes but you never saw the new column in `missing_columns`/checked list.

### Pitfall 2: `targetKind` omitted → migration silently targets `dgfy_core`
**What goes wrong:** Migration never runs against tenant DBs; `products` never gains columns.
**Why:** `buildMigrationsForKind` defaults missing `targetKind` to `'core'`.
**How to avoid:** Always set `meta.targetKind: 'business'`.
**Warning sign:** `schema migrate` report shows the file under `migrations_executed` for the core target, not `business_targets`.

### Pitfall 3: Treating `item_folders` removal as a real code change
**What goes wrong:** Planner writes a task to "remove item_folders from OUT_OF_SCOPE," reviewer can't find it, churn.
**Why:** It was never in the array.
**How to avoid:** Document as already-in-scope no-op; the only array edits are `items`, `stock_movements`, `pos_transactions`.

### Pitfall 4: Removing `pos_transaction_lines` prematurely
**What goes wrong:** Over-broad scope edit; Phase 14's requirement (SHM-02) loses its unblock task.
**How to avoid:** Remove only the three LDM-01 names; leave `pos_transaction_lines`.

### Pitfall 5: MySQL ENUM in `down()` on `vat_type`
**What goes wrong:** Over-engineering enum teardown.
**Why:** MySQL inline enums drop with the column; `DROP TYPE` is a Postgres-ism.
**How to avoid:** `down()` = guarded `removeColumn('products','vat_type')`; optionally the defensive `DROP TYPE IF EXISTS enum_products_vat_type .catch(()=>{})` for cross-dialect parity (matches `20260712100000` style). Additive `up()` is the real deliverable; `down()` is best-effort.

## Runtime State Inventory

This phase is additive schema + doc/array edits + one app-code fix — not a rename/refactor of existing runtime state. Explicit findings:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new columns are nullable/additive; `product_embeddings` is a new empty table; no existing rows carry the renamed/new keys. No backfill. | None |
| Live service config | None — no external service (n8n/Datadog/etc.) references these schema names. | None |
| OS-registered state | None — no OS-level registration touches tenant schema. | None |
| Secrets/env vars | None — no new secret/env var. `DGFY_BUSINESS_DB_NAMES` (existing) drives which tenants `schema migrate`/`verify` touch; unchanged. | None |
| Build artifacts | None new. If dgfy-api Tenant models are added (ProductEmbedding), the model loader must register it (module-level, no build artifact). | Register new model in Tenant loader |

**Note (idempotency-relevant, not "renamed state"):** existing `inventory_movements` organic rows have NULL `reference_type`/`reference_id` — verified compatible with the new unique index (NULL tuples distinct), so no migration of existing data. `[VERIFIED: D-10 reasoning + MySQL NULL-in-unique semantics]`

## Code Examples

### Combined additive migration skeleton (recommended primary shape)
```js
// 20260716100000-extend-schema-for-legacy-migration.cjs
'use strict';
module.exports = {
  meta: { destructive: false, targetKind: 'business',
    rollbackDescription: 'Drops products legacy-migration columns + attributes, product_embeddings table, and inventory_movements natural-key unique index — additive Phase 12 only.',
    estimatedRisk: 'low' },
  async up(queryInterface, Sequelize) {
    const hasIndex = async (t, name) => { try { return (await queryInterface.showIndex(t) || []).some(i => String(i.name).toLowerCase() === name.toLowerCase()); } catch { return false; } };
    const addIndexIfMissing = async (t, cols, o = {}) => { if (o.name && await hasIndex(t, o.name)) return; await queryInterface.addIndex(t, cols, o); };
    const tableExists = async (n) => (await queryInterface.showAllTables() || []).some(e => String(typeof e === 'string' ? e : (e.tableName || e)).toLowerCase() === n.toLowerCase());

    // LDM-02: products typed columns + attributes JSON
    const p = await queryInterface.describeTable('products');
    if (!p.sku_code) await queryInterface.addColumn('products', 'sku_code', { type: Sequelize.STRING(50), allowNull: true });
    if (!p.description) await queryInterface.addColumn('products', 'description', { type: Sequelize.TEXT, allowNull: true });
    if (!p.unit_of_measure) await queryInterface.addColumn('products', 'unit_of_measure', { type: Sequelize.STRING(50), allowNull: true });
    if (!p.cost_per_unit) await queryInterface.addColumn('products', 'cost_per_unit', { type: Sequelize.DECIMAL(14, 4), allowNull: true });
    if (!p.vat_type) await queryInterface.addColumn('products', 'vat_type', { type: Sequelize.ENUM('vatable', 'vat_exempt', 'zero_rated'), allowNull: false, defaultValue: 'vatable' });
    if (!p.senior_pwd_discount_eligible) await queryInterface.addColumn('products', 'senior_pwd_discount_eligible', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    if (!p.attributes) await queryInterface.addColumn('products', 'attributes', { type: Sequelize.JSON, allowNull: true });
    await addIndexIfMissing('products', ['sku_code'], { name: 'idx_products_sku_code' }); // D-05 non-unique

    // LDM-03: product_embeddings
    if (!await tableExists('product_embeddings')) {
      await queryInterface.createTable('product_embeddings', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        product_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        vector: { type: Sequelize.TEXT, allowNull: false },
        legacy_embedding_id: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing('product_embeddings', ['product_id'], { name: 'unique_product_embeddings_product', unique: true });

    // LDM-04: inventory_movements natural key
    await addIndexIfMissing('inventory_movements', ['business_id', 'reference_type', 'reference_id'], { name: 'unique_inventory_movements_natural_key', unique: true });
  },
  async down(queryInterface) { /* guarded removeIndex/removeColumn/dropTable, try-catch no-ops */ }
};
```
`// Source: pattern composed from 20260712100000-create-commerce-foundation.cjs + 20260714103000-add-availment-source-reference.cjs (VERIFIED)`

### Contract update (required, in lockstep)
```js
// dgfyBusinessContract.js — products entry
columns: [ ...existing, 'sku_code', 'description', 'unit_of_measure', 'cost_per_unit', 'vat_type', 'senior_pwd_discount_eligible', 'attributes' ],
indexes: [ 'idx_products_business', 'idx_products_folder', 'idx_products_category', 'idx_products_sku_code' ],
// inventory_movements entry
indexes: [ ...existing, 'unique_inventory_movements_natural_key' ],
uniqueConstraints: [ 'unique_inventory_movements_natural_key' ],
// NEW product_embeddings entry
product_embeddings: {
  columns: ['id','business_id','product_id','vector','legacy_embedding_id','created_at','updated_at'],
  indexes: ['unique_product_embeddings_product'],
  uniqueConstraints: ['unique_product_embeddings_product'],
  foreignKeys: [{ column: 'product_id', referencesTable: 'products', referencesColumn: 'id' }],
  projectionOnly: false
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy commerce domains hard-excluded from migration (`OUT_OF_SCOPE_LEGACY_TABLES`, ADR 0029 "unchanged in this phase") | v2.1 milestone additively extends `dgfy_business_*` and unblocks mappers | Phase 12 (this) | Enables Phase 13/14 mappers; strictly additive, no legacy writes |
| Compliance review = two non-atomic writes | Single `recordVerificationAndState()` in one txn + row lock | Phase 12 folded todo | Closes fail-open window for Fiscal POS_CHECKOUT |

**Deprecated/outdated:** none introduced. ADR 0029 remains `accepted`; amended, not superseded.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | One combined migration file is preferable to three | Standard Stack / Code Examples | Low — Claude's discretion (D); three separate files equally valid, minor rollback-granularity tradeoff. |
| A2 | Include optional `legacy_embedding_id` traceability column | product_embeddings | Low — D-09 discretion; if omitted, Phase 13 loses a cheap verify hook, no functional break. |
| A3 | Update the 3 dgfy-api Tenant models in this phase | Target-Schema Extension | Low-Med — not mandated by success criteria; if deferred, models drift from migration until a feature needs them. Planner should decide explicitly. |
| A4 | Recommended timestamp band `2026071610xxxx` (> current max) | Migration-Runner Mechanics | Low — any value lexically > `20260715120000` works; exact value is cosmetic. |

**Everything in the Decisions/type/scope/verification analysis is `[VERIFIED]` against source — the four assumptions above are discretionary recommendations, not unverified facts.**

## Open Questions

1. **Success-criterion #1 phrasing vs. artifact reality**
   - What we know: ADR 0029 has no `OUT_OF_SCOPE_LEGACY_TABLES` list; that array is in `mappings.js`. D-11 already prescribes the correct triple-amendment.
   - What's unclear: only whether the planner writes acceptance criteria against the literal (wrong) phrasing or the real artifacts.
   - Recommendation: acceptance criteria should assert (a) `mappings.js` array no longer contains the 3 names, (b) ADR prose amended, (c) migration-map §10 amended — not "the ADR's array."

2. **dgfy-api model updates: in-scope this phase?**
   - What we know: models are comment-enforced to match migrations; no feature reads the new columns yet.
   - What's unclear: whether the milestone wants parity now or at Phase 13.
   - Recommendation: update now (cheap, prevents drift); if deferred, record as a conscious deferral in the plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + `apps/dgfy-migration-runner` CLI | `schema migrate` / `verify` | ✓ (repo app, run via node) | — | — |
| MySQL `dgfy_business_*` tenant DB | success criteria #2-4 "against a tenant database" | Assumed reachable (lima-dgfy-dev / configured target) | — | If no tenant DB configured, `verify` reports `business_schemas: []`; success criteria need at least one `DGFY_BUSINESS_DB_NAMES` target |
| `npm run lint:docs` | ADR 0029 validation | ✓ (referenced by ADR) | — | — |

**Missing dependencies with no fallback:** none confirmed missing. **Caveat from project memory:** GHCR `:develop` images are amd64-only vs. arm64 lima-dgfy-dev — this affects the *API container* rehearsal, NOT the node-run migration-runner used here. Phase 12 does not require the amd64 images; a real end-to-end apply against production-parity data is Phase 13's rehearsal. `[VERIFIED: MEMORY.md rehearsal-arch-mismatch note; scope is Phase 13, not 12]`

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`. This phase is additive DDL + docs + one concurrency fix; low external attack surface.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | ADR 0029 ownership boundaries preserved; additive-only, no destructive migration |
| V5 Input Validation | no (no new user input surface) | Migration DDL only; usecase input validation already exists |
| V6 Cryptography | no | No crypto; `vector` is opaque float-array text, `password_hash` untouched |
| V11 Business Logic | yes | `recordVerificationAndState()` closes a TOCTOU fail-open (compliance state not demoted after revoke) — the primary security-relevant change |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-atomic verify+state writes leave stale `compliant_active` (Fiscal POS_CHECKOUT fail-open) | Elevation of Privilege / Tampering | Single `sequelize.transaction()` + `lock: t.LOCK.UPDATE` (folded todo) `[VERIFIED: todo + complianceUseCases.js:307-320]` |
| Duplicate migrated `inventory_movements` on retry | Tampering (data integrity) | `(business_id, reference_type, reference_id)` unique index (LDM-04) makes Phase 13 retries idempotent |
| Accidental legacy write / out-of-scope processing | Tampering | Scope gate edits are surgical (3 names); `rejectedTables` target guard left intact so no legacy table name can appear in a tenant DB |
| Secret leakage via new columns | Information Disclosure | New columns carry no secrets (`sku_code`/`description`/`vat_type`/vectors); embedding vectors are non-sensitive derived data |

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` — Phase 8 migration; `products`/`inventory_movements` DDL, triggers, idempotent helpers, targetKind
- `apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs` — canonical additive `addColumn`+unique-index precedent
- `apps/dgfy-migration-runner/src/commands/schema.js` — Umzug apply, `buildMigrationsForKind`, targetKind filter, fingerprint baseline
- `apps/dgfy-migration-runner/src/commands/verify.js` — `checkContractSchema`/`checkTableAgainstContract`, idempotency + legacy_non_mutation derivation
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` — verification contract (the update target) + `rejectedTables` semantics
- `apps/dgfy-migration-runner/src/data/mappings.js` — `OUT_OF_SCOPE_LEGACY_TABLES`, `isInScopeLegacyTable`, `classifyOutOfScopeRecord`
- `apps/dgfy-api/src/models/Tenant/Product.js`, `InventoryMovement.js` — current model shapes (extension targets)
- `backend/src/models/Item.js`, `ItemEmbedding.js`, `models/index.js` (satellite assoc lines 242-260) — legacy source types (D-05..D-09 ground truth)
- `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` — txn+row-lock pattern
- `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js` (307-320), `repositories/complianceModeStateRepository.js` — folded-todo defect + pattern
- `docs/architecture/adr/0029-...md`, `docs/database/dgfy-data-migration-map.md` §10 — amendment targets
- `apps/dgfy-migration-runner/src/cli.js` — command names (`schema migrate`, `verify`, ...)
- `.planning/ROADMAP.md` Phase 12, `.planning/REQUIREMENTS.md` LDM-01..05, `.planning/config.json`

### Secondary / Tertiary
- None required — no external docs consulted; all findings verified in-repo.

## Metadata

**Confidence breakdown:**
- Migration mechanics / naming / verify wiring: HIGH — read the actual runner + verify + contract code
- Legacy source types (D-05..D-09): HIGH — read `Item.js`/`ItemEmbedding.js` directly
- Scope-check (item_folders no-op, pos_transaction_lines retention): HIGH — grep-confirmed absence + array contents
- Folded-todo shape: HIGH — read defect, repository, and mirror-pattern source
- ADR/migration-map passages: HIGH — read both docs; flagged the success-criterion phrasing discrepancy
- Discretionary recommendations (single file, legacy_embedding_id, model updates, timestamp): MEDIUM — Claude's-discretion areas, marked in Assumptions Log

**Research date:** 2026-07-14
**Valid until:** ~2026-08-13 (stable; internal codebase, no fast-moving external deps). Re-verify only if new migrations land after `20260715120000` (recompute the timestamp band) or if `dgfyBusinessContract.js` `products`/`inventory_movements` entries change.
