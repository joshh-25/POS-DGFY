# Phase 13: Product & Inventory Migration - Research

**Researched:** 2026-07-14
**Domain:** Backend legacy→DGFY data migration (pure-mapper + checkpointed apply, `apps/dgfy-migration-runner`)
**Confidence:** HIGH (every finding grounded in in-repo source; no external dependencies)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Movement-type mapping (8 legacy → 5 new, PIM-03):**
- **D-01:** `purchase_receipt` → `restock`
- **D-02:** `calculated_loss` → `loss`
- **D-03:** `adjustment` → `adjustment`
- **D-04:** `goods_issue` → `sale`
- **D-05:** `return` → `restock` (goods physically return to stock)
- **D-06:** `production_consumption` → `adjustment` (NOT `loss` — productive use, not shrinkage; manufacturing distinction deferred)
- **D-07:** `production_output` → `adjustment` (symmetric with D-06)
- **D-08:** `transfer` → **no `inventory_movements` row inserted.** Log a `finding` (lossy-category-collapse). Rationale: new schema has zero location dimension, so a transfer has no honest target representation; a fake net-zero row would pollute the audit trail. This is the single documented, reviewed 8→5 collapse table PIM-03 requires.

**Category mapping:**
- **D-09:** ALL legacy `items.category` values map to `retail`. One flat rule, zero per-value ambiguity. (See Pitfall 1 — the live enum has MORE than the three values named in CONTEXT.md; the flat rule still covers them.)

**Multi-location stock collapse (PIM-05):**
- **D-10:** `item_location_stocks` per-location breakdown is **fully discarded after summing**. One opening-balance `inventory_movements` row per product, `quantity` = sum across all of that item's legacy `item_location_stocks` rows. No location identity preserved in `reference_id`/`before_snapshot`/`after_snapshot`/any field.

### Claude's Discretion
- Exact `findings` reason-code string for the `transfer` collapse (D-08) and the `MAPPING_REASON_CODES` shape — follow existing `classifyMappingConflict()`/`MAPPING_REASON_CODES` in `mappings.js`.
- Ordering/dependency mechanics for `product_composition` (BOM) `ingredient_id` resolution via `legacy_id_map`.
- Exact opening-balance `inventory_movements` row's `reference_type`/`reference_id` for D-10 — pick values consistent with existing dry-run/apply reporting conventions.

### Deferred Ideas (OUT OF SCOPE)
- None from this discussion. Already deferred at the milestone level (per PROJECT.md / REQUIREMENTS.md v3): manufacturing/raw-material distinction, location-aware inventory, embedding-model metadata tagging (EMB-01), human-readable per-tenant report (RPT-01).
- `pos_transactions`/`pos_transaction_lines` → `availments`/`availment_items` is **Phase 14** (blocked on this phase's `product_id` `legacy_id_map` entries). Not this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIM-01 | `item_folders` → `product_folders` mapper runs **before** item migration | New `mapItemFolderToProductFolder()` pure mapper + fixed apply ordering (folders → products); `product_folders` is FLAT — nesting collapse mechanic in §"Folder-Nesting Collapse". `products.folder_id` resolved via `legacy_id_map`. |
| PIM-02 | `items` → `products` migrates 6 promoted fields + all 8 satellites (incl. BOM) folded into `attributes` JSON; `attributes.barcodes` is an array | New `mapItemToProduct()` pure mapper; folding contract in `legacy-product-attributes-folding-design.md` (10 namespaced keys, 7 objects + 3 arrays); satellites eager-read via raw SQL in a new snapshot reader. BOM ingredient resolution = two-pass (§"BOM/Composition Resolution"). |
| PIM-03 | Documented, reviewed 8→5 `movement_type` remap; `findings` raised for lossy collapse | Lookup table D-01..D-08 (locked); `transfer` → finding via `classifyMappingConflict()` + new reason code. |
| PIM-04 | `stock_movements` → `inventory_movements` idempotency-safe against append-only target (skip-if-mapped, never re-insert) | Triple guard: `legacy_id_map` skip-if-mapped + per-`(run_scope, legacy_tenant_id, entity_type)` checkpoint + `unique_inventory_movements_natural_key`. Requires deterministic non-null `reference_type`/`reference_id` per row (§"Idempotency Architecture"). |
| PIM-05 | Legacy per-location stock sums into one opening-balance `inventory_movements` row per product (D-10), not a direct `stock_count` write | New `mapItemLocationStocksToOpeningBalance()` mapper summing across locations. **Blocker:** `item_location_stocks` is still in `OUT_OF_SCOPE_LEGACY_TABLES` — must be removed (§"Don't Hand-Roll" / Pitfall 3). |
| PIM-06 | `item_embeddings` → `product_embeddings` carries vectors as-is (same format, no re-embedding) | New `mapItemEmbeddingToProductEmbedding()` — copy `vector` TEXT verbatim, set `legacy_embedding_id`, resolve `product_id` via `legacy_id_map`. |
</phase_requirements>

## Summary

This is a pure data-migration phase inside `apps/dgfy-migration-runner`, adding four new legacy→DGFY entity types (`product_folder`, `product`, `inventory_movement`, `product_embedding`) to a mature, proven pipeline. The pipeline's shape is fixed and non-negotiable: **pure mapper functions** in `src/data/mappings.js` (zero I/O, zero imports) return a uniform `{ operation, entity_type, target_table, target_database, target_payload, legacy_id_map_key, related_targets, findings }` result; **dry-run** (`src/data/dryRun.js`) and **apply** (`src/data/apply.js`) call the *same* mapper so behavior cannot drift; durable state (`legacy_id_map`, per-`(run_scope, legacy_tenant_id, entity_type)` checkpoints, `data_quality_findings`) lives in `src/metadata/dataState.js`; verification (`src/data/verifyData.js`) reconciles source vs. target counts and fails while any finding is open. Phase 13's job is to extend every one of these six files following the exact Phase-3 precedent — **not** to invent new infrastructure.

Three net-new mechanisms are genuinely required beyond "copy the account/staff mapper shape": (1) a **two-pass product apply** to resolve BOM `ingredient_id` → migrated `products.id` (the first `UPDATE`-after-`INSERT` path in `apply.js` — all existing writes are pure inserts, and any item can be an ingredient so single-pass ordering cannot guarantee ingredient-before-parent); (2) a **new legacy source snapshot reader** that eager-reads `items` + its 8 satellite tables + `item_folders`/`stock_movements`/`item_location_stocks`/`item_embeddings` via raw SELECTs (the runner has zero `backend/` imports by design, so no Sequelize `include`); (3) **deterministic non-null natural keys** on every `inventory_movements` row so the `unique_inventory_movements_natural_key` index actually enforces idempotency (a NULL in any key column makes MySQL treat the row as distinct and the reconciliation lookup returns null → duplicate on retry).

The target schema is 100% ready — Phase 12 shipped `products.attributes` JSON + 6 typed columns, the `product_embeddings` table, and the `inventory_movements` natural-key unique index, all present in `dgfyBusinessContract.js` so `verify` checks them. No new schema migration is needed in this phase (all writes go to existing columns/tables).

**Primary recommendation:** Add four pure mappers to `mappings.js` mirroring the account/staff pattern; extend `legacySource.js` with a product-domain snapshot reader; wire folders→products(pass 1 insert)→products(pass 2 BOM update)→inventory_movements→opening-balance→product_embeddings into `apply.js`/`dryRun.js` in that fixed order; add `ENTITY_TARGET_CONFIG` natural-key entries for the four new types; remove `item_location_stocks` from `OUT_OF_SCOPE_LEGACY_TABLES`; extend `verifyData.js` with product-domain count + sum-by-type checks. Prove with dry-run → apply → retry-apply (zero new rows) → verify against a real tenant.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Legacy→DGFY field transform (all 4 entities) | Pure mapper (`src/data/mappings.js`) | — | Hard contract: zero imports, zero SQL, pure function of args; dry-run + apply both call it so logic can't drift. |
| BOM ingredient resolution (cross-item `legacy_id_map` lookup) | Apply orchestration (`src/data/apply.js`) | Metadata (`dataState.findLegacyIdMap`) | Requires I/O (DB lookup of another item's mapped id) — cannot live in the pure mapper. Two-pass `UPDATE`. |
| Reading legacy items + satellites | Legacy source reader (`src/data/legacySource.js`) | — | Only module that issues raw SELECTs against legacy tenant DBs; must add product-domain reader. |
| Durable ID map / checkpoints / findings | Metadata (`src/metadata/dataState.js`) | — | Existing helpers reused verbatim; new entity types just get their own checkpoint rows. |
| Idempotent target write / reconciliation | Apply (`writeMappedTargetRow`) | Target DB unique indexes | Natural-key + `legacy_id_map` lookup-before-insert; needs new `ENTITY_TARGET_CONFIG` rows. |
| Count + sum-by-type reconciliation | Verify (`src/data/verifyData.js`) | Metadata (open findings) | Source-vs-target evidence; must extend to product-domain entities. |
| Target schema (tables/columns/indexes) | Schema migration (Phase 12, **done**) | Contract (`dgfyBusinessContract.js`) | Nothing to build here — `products.attributes`, `product_embeddings`, natural-key index already exist. |

## Standard Stack

No external packages are introduced by this phase. All work uses the runner's existing dependency set.

### Core (already installed — `apps/dgfy-migration-runner/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sequelize` | (installed) | Raw parameterized SQL (`sequelize.query` + `replacements`), `bulkInsert`, `queryInterface` | Already the runner's only DB access layer; mappers stay pure, I/O modules use it. |
| `mysql2` | (installed) | MySQL 8.0 driver | Existing. |
| `jest` | (installed, dev) | Test runner (`--experimental-vm-modules`, `--runInBand`) | All existing mapper/apply/verify tests use it. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `umzug` | (installed) | Schema migration runner | Not needed this phase — no new DDL. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two-pass product `UPDATE` for BOM | Topological sort by `items.nesting_level` then single-pass | Rejected: nested/packaging compositions and potential cross-level refs make strict ordering fragile; a cycle would leave unresolved refs with no clean recovery. Two-pass is order-independent and naturally idempotent. |
| Raw SELECT satellite reads | Import `backend/` Sequelize models with `include` | Rejected: violates the runner's hard "zero `backend/` imports" isolation contract (`legacySource.js` header, Phase 1 D-01). |

**Installation:** None. `npm install` adds nothing.

**Version verification:** N/A — no new packages. `[VERIFIED: apps/dgfy-migration-runner/package.json]` deps = `@inquirer/prompts, commander, dotenv, mysql2, sequelize, umzug`; devDeps = `jest`.

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All code reuses the runner's existing, already-audited dependency set. No `npm install`, no new `package.json` entries.

## Architecture Patterns

### System Data Flow

```
                       ┌─────────────────────────────────────────────┐
                       │  Migration target manifest (legacy_tenant_id │
                       │  → target_business_db_name, expected_business_id)
                       └───────────────────┬─────────────────────────┘
                                           │
   Legacy tenant DB (per target)           ▼                     dgfy_migration_meta
   ┌──────────────────────────┐   ┌──────────────────┐          ┌──────────────────────┐
   │ item_folders (nested)    │   │ legacySource.js  │          │ legacy_id_map        │
   │ items (+8 satellites,    │──▶│ (NEW product-    │          │ data_checkpoints     │
   │        barcodes, BOM)    │   │  domain reader,  │          │ data_quality_findings│
   │ stock_movements          │   │  raw SELECTs)    │          └─────────▲────────────┘
   │ item_location_stocks     │   └────────┬─────────┘                    │
   │ item_embeddings          │            │ snapshot objects             │ record/lookup
   └──────────────────────────┘            ▼                              │
                                  ┌──────────────────┐                    │
                                  │ mappings.js      │  pure, no I/O      │
                                  │ mapItemFolder…   │  returns {operation│
                                  │ mapItemToProduct │   entity_type,     │
                                  │ mapStockMovement…│   target_payload,  │
                                  │ mapItemLocStk…   │   legacy_id_map_key│
                                  │ mapItemEmbedding…│   findings}        │
                                  └────────┬─────────┘                    │
                        same mapper ┌──────┴───────┐                      │
                                    ▼              ▼                      │
                          ┌──────────────┐  ┌──────────────────┐         │
                          │ dryRun.js    │  │ apply.js         │─────────┘
                          │ (read-only,  │  │ writeMappedTarget│  lookup-before-insert
                          │  plan+report)│  │ Row + 2-pass BOM │  + natural-key reconcile
                          └──────┬───────┘  └────────┬─────────┘  + checkpoint per entity
                                 │                   │ INSERT/UPDATE
                                 ▼                   ▼
                          data:dry-run report   dgfy_business_* target DB
                                                ┌────────────────────────┐
                                                │ product_folders (flat)  │
                                                │ products (+attributes)  │
                                                │ inventory_movements     │  ◀ append-only
                                                │ product_embeddings      │
                                                └────────────┬────────────┘
                                                             │
                                                    ┌────────▼─────────┐
                                                    │ verifyData.js    │ counts + sum-by-type
                                                    │ (NEW product     │ + open findings
                                                    │  reconciliation) │ → data_migration_ok
                                                    └──────────────────┘
```

Trace the primary use case: a legacy `item` enters via the product-domain snapshot reader (with its satellites eager-loaded), flows through `mapItemToProduct()` which emits a `products` insert payload with folded `attributes`, gets written idempotently by `writeMappedTargetRow()` (recording a `legacy_id_map` row), then a second pass resolves its BOM ingredient refs, then its stock movements / opening balance / embedding follow — each proven by `verifyData.js`.

### Recommended File Structure (all EXISTING files — extend, don't create new dirs)
```
apps/dgfy-migration-runner/src/
├── data/
│   ├── mappings.js         # ADD: mapItemFolderToProductFolder, mapItemToProduct,
│   │                       #      mapStockMovementToInventoryMovement,
│   │                       #      mapItemLocationStocksToOpeningBalance,
│   │                       #      mapItemEmbeddingToProductEmbedding
│   │                       # ADD: new MAPPING_REASON_CODES (LOSSY_CATEGORY_COLLAPSE,
│   │                       #      FOLDER_NESTING_FLATTENED, UNRESOLVED_INGREDIENT)
│   │                       # EDIT: remove 'item_location_stocks' from OUT_OF_SCOPE_LEGACY_TABLES
│   ├── legacySource.js     # ADD: readLegacyProductSnapshot() — raw SELECTs for
│   │                       #      items+satellites, item_folders, stock_movements,
│   │                       #      item_location_stocks, item_embeddings
│   ├── dryRun.js           # ADD: product-domain entities to buildDryRunPlan() ordering
│   ├── apply.js            # ADD: ENTITY_TARGET_CONFIG rows; folder→product(2-pass)→
│   │                       #      movement→opening-balance→embedding ordering; UPDATE path
│   └── verifyData.js       # ADD: product-domain count + sum-by-type reconciliation
├── metadata/dataState.js   # REUSE verbatim (findLegacyIdMap, markDataCheckpoint,
│                           #   recordDataQualityFinding, resolveDataQualityFindings)
└── commands/data.js        # likely unchanged (orchestration already generic)
```

### Pattern 1: Pure mapper returning the uniform result shape
**What:** Every new mapper is a pure function returning the exact 8-field result object.
**When to use:** All five new mappers.
**Example (mirrors `mapLegacyLocationToLocation`, `mappings.js:625`):**
```javascript
// Source: apps/dgfy-migration-runner/src/data/mappings.js (existing pattern)
export function mapItemFolderToProductFolder(legacyFolder = {}, context = {}) {
    const { legacyTenantDbName, expectedBusinessId } = context;
    const legacyId = legacyFolder.folder_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName, legacyTable: 'item_folders', legacyId
    });
    const name = toTrimmedString(legacyFolder.name);
    if (isBlank(name)) {
        return skipResult({ entityType: 'product_folder', targetTable: 'product_folders',
            legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, { /* … */ }) });
    }
    const findings = [];
    if (!isBlank(legacyFolder.parent_id)) {
        // Legacy nesting is flattened — product_folders has no parent_id (D-14, flat by design).
        findings.push(classifyMappingConflict(MAPPING_REASON_CODES.FOLDER_NESTING_FLATTENED, {
            entityType: 'product_folder', legacyTable: 'item_folders', legacyId,
            severity: 'skip', // informational — see "Findings severity" open question
            message: `Legacy item_folder ${legacyId} had parent_id ${legacyFolder.parent_id}; new product_folders is flat, nesting discarded.`,
            remediation: null
        }));
    }
    return {
        operation: 'insert', entity_type: 'product_folder',
        target_table: 'product_folders', target_database: context.targetBusinessDbName,
        target_payload: {
            business_id: expectedBusinessId, name,
            description: legacyFolder.description ?? null,
            is_active: true
        },
        legacy_id_map_key: legacyIdMapKeyValue, related_targets: [], findings
    };
}
```

### Pattern 2: Deterministic natural key for the append-only ledger
**What:** Every `inventory_movements` payload sets non-null `reference_type` + `reference_id` derived from the legacy PK.
**Why:** `findExistingTargetRow()` (`apply.js:139`) returns `null` the moment *any* natural-key column is null, falling through to `INSERT` — so a NULL reference silently defeats idempotency.
```javascript
// Migrated stock movement (D-01..D-07):
target_payload: {
    business_id: expectedBusinessId, product_id: /* resolved via legacy_id_map */,
    movement_type: MOVEMENT_TYPE_MAP[legacy.movement_type], // restock|loss|adjustment|sale
    quantity: legacy.quantity,
    reference_type: 'legacy_stock_movement',
    reference_id: String(legacy.movement_id),   // deterministic, non-null
    actor_account_id: null, actor_staff_account_id: null,
    before_snapshot: null, after_snapshot: null
}
// Opening-balance row (D-10):
reference_type: 'legacy_opening_balance', reference_id: String(legacy.item_id)
```

### Pattern 3: Two-pass BOM resolution in apply.js
**What:** Insert all products first (recording `legacy_id_map`), then a second pass resolves each `product_composition.ingredient_id` → migrated `products.id` and `UPDATE`s `products.attributes.composition`.
**When:** After the whole `product` batch for a tenant completes.
```javascript
// Pass 2 (new UPDATE path — first non-insert write in apply.js):
for (const item of tenantSnapshot.items) {
    const parentMap = await findLegacyIdMap(metaSequelize, {
        runScope, legacySource: legacyTenantDbName, legacyTable: 'items', legacyId: item.item_id });
    if (!parentMap || !item.productCompositions?.length) continue;
    const composition = [];
    for (const bom of item.productCompositions) {
        const ingMap = await findLegacyIdMap(metaSequelize, {
            runScope, legacySource: legacyTenantDbName, legacyTable: 'items', legacyId: bom.ingredient_id });
        if (!ingMap) {
            await recordDataQualityFinding(metaSequelize, { /* UNRESOLVED_INGREDIENT, severity 'orphan' */ });
            continue;
        }
        composition.push({ ingredient_product_id: Number(ingMap.dgfy_id),
            composition_type: bom.composition_type, quantity_required: bom.quantity_required,
            unit_of_measure: bom.unit_of_measure });
    }
    // Re-read current attributes, merge composition key, UPDATE (products is NOT append-only).
    await targetSequelize.query(
        'UPDATE products SET attributes = ?, updated_at = ? WHERE id = ?',
        { replacements: [JSON.stringify(mergedAttributes), new Date(), parentMap.dgfy_id] });
}
```
Idempotent by construction: re-running writes the identical resolved array; unresolved-ingredient findings get `resolveDataQualityFindings()` cleared on a later run once the ingredient exists.

### Anti-Patterns to Avoid
- **NULL `reference_type`/`reference_id` on inventory movements** — defeats the natural-key unique index; duplicates on retry (breaks PIM-04).
- **Resolving BOM in the pure mapper** — mappers do zero I/O; cross-item lookups belong in `apply.js`.
- **Writing per-location `inventory_movements` rows** — D-10 requires ONE summed opening-balance row per product; no location identity anywhere.
- **Fabricating a net-zero `adjustment` for `transfer`** — D-08 explicitly forbids this; emit a finding instead.
- **Importing `backend/` models** — violates the runner isolation contract; use raw SELECTs.
- **Adding a unique constraint on `sku_code`** — legacy allows duplicate SKUs; Phase 12 index is intentionally non-unique.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skip-if-mapped idempotency | Custom "already migrated?" check | `writeMappedTargetRow()` existing-map branch (`apply.js:234`) | Handles map lookup, target existence assert, fan-out disambiguation, natural-key reconcile — all proven. |
| Per-entity resume/checkpoint | New checkpoint table/logic | `markDataCheckpoint`/`getDataCheckpoint` per `(run_scope, legacy_tenant_id, entity_type)` (`dataState.js:68-123`) | Each new entity type just gets its own checkpoint rows; zero new design. |
| Skip/conflict/orphan reporting | Ad-hoc error arrays | `classifyMappingConflict()` + `recordDataQualityFinding()` | Uniform shape consumed by dry-run/apply/verify; findings gate `data_migration_ok`. |
| ID resolution across entities | Passing raw legacy ids around | `findLegacyIdMap()` (folder→product, item→product for BOM/embedding/movement) | Works whether the dependency was written this run or a prior completed run; never a raw legacy id (MIG-04). |
| `item_location_stocks` scope | Leaving it in the OUT_OF_SCOPE list and special-casing | **Remove `'item_location_stocks'` from `OUT_OF_SCOPE_LEGACY_TABLES`** (`mappings.js:65`) | It is currently listed as out-of-scope (frozen array line 65) but D-10/PIM-05 require migrating it. This is a concrete edit, not a workaround. |

**Key insight:** The entire idempotency + reporting + checkpoint machinery already exists and is battle-tested against Phases 3-11. Phase 13's risk is almost entirely in the *mapper transform rules* and the *two new plumbing points* (product-domain snapshot reader + two-pass UPDATE), not in the durable-state layer.

## Runtime State Inventory

> Included because this is a data-migration phase. "State" here = migration-run state that persists between rehearsal runs and must be understood for idempotency.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (source) | Legacy tenant DBs: `items`, 8 satellite tables (`item_nutrition`, `item_allergens`, `item_physical_properties`, `item_shelf_life`, `item_packaging`, `item_quality_control`, `item_regulatory_compliance`, `item_cost_breakdown`), `item_barcodes`, `product_composition` (BOM), `item_folders` (nested), `stock_movements` (8 movement types), `item_location_stocks` (per-`(item,location)`), `item_embeddings` (TEXT JSON vector). | Read-only via new snapshot reader; nothing mutated on legacy side. |
| Stored data (target) | `dgfy_business_*`: `product_folders`, `products` (+`attributes` JSON, 6 typed cols), `inventory_movements` (append-only), `product_embeddings` (1:1). All created by Phase 12/8 — **no schema work this phase**. | Write via apply; verify column presence via `dgfyBusinessContract.js` (already updated). |
| Migration meta (durable run state) | `dgfy_migration_meta`: `legacy_id_map`, `data_checkpoints`, `data_quality_findings` — rows from prior Phase-3 runs and any Phase-13 rehearsal accumulate here under `run_scope='data-migration'`. | Idempotency depends on these. Between clean-slate rehearsals, operator must reset the target `dgfy_business_*` DB **and** these meta rows, or a completed checkpoint will short-circuit re-processing (verify-only pass). Document reset procedure in the plan's rehearsal step. |
| Live service config | None — no external service (n8n, scheduler, etc.) embeds product data. | None. |
| Secrets/env vars | Runner uses existing `.env` DB creds. **Known blocker (STATE.md, Phase 12 Plan 04):** lima-dgfy-dev MySQL only provisioned `sku_inventory_user`; migration-runner `.env` user `sieitzsqladmin` was rejected and `DGFY_BUSINESS_DB_NAMES` unset — apply/verify against a real tenant cannot run until operator fixes creds/target config. | Environment prerequisite for the dry-run/apply/verify proof (PIM acceptance). Flag in plan; rehearsal likely on EC2 (MEMORY: arch-mismatch note). |
| Build artifacts | None — pure JS, no compiled artifact. | None. |

## Common Pitfalls

### Pitfall 1: Legacy `items.category` enum has drifted — it is NOT just `ingredient/product/packaging`
**What goes wrong:** CONTEXT.md D-09 names three legacy category values; the **live `Item.js` model enum is five values**: `raw_material, packaging, product, supplies, service` `[VERIFIED: backend/src/models/Item.js:20]`. The original `20240101000002-create-items.js` migration declared yet a different set: `ingredient, product, packaging` `[VERIFIED: backend/migrations/20240101000002-create-items.js:19]`. Real tenant DBs may contain any of these (plus historical values).
**Why it happens:** The schema evolved via later `ALTER`s not reflected in the base migration; CONTEXT.md quoted the base migration.
**How to avoid:** Implement D-09 as a **flat unconditional rule** — every legacy category value maps to `retail`, regardless of the source string. Do NOT enumerate a whitelist of three; a whitelist would drop/skip `raw_material`/`supplies`/`service` items. The flat rule is exactly why D-09 chose "one flat rule, zero per-value ambiguity" — this pitfall is the concrete reason it's correct.
**Warning signs:** A mapper `switch`/lookup on category with only 3 cases; verify count mismatch (fewer products than items).

### Pitfall 2: NULL natural-key columns silently defeat idempotency
**What goes wrong:** `findExistingTargetRow()` returns `null` if any natural-key value is `undefined`/`null` (`apply.js:143-145`), so a retried apply re-inserts. The `inventory_movements` natural key is `(business_id, product_id, reference_type, reference_id)`; `reference_type`/`reference_id` are nullable columns.
**Why it happens:** Legacy `stock_movements.reference_id`/`reference_type` are often NULL for MANUAL movements — if the mapper copies them through, the natural key is unusable.
**How to avoid:** Mapper MUST synthesize deterministic non-null `reference_type='legacy_stock_movement'` + `reference_id=String(movement_id)` (and `legacy_opening_balance`/`String(item_id)` for D-10), independent of legacy reference fields.
**Warning signs:** Retry-apply summary shows `rows_written > 0` on a second run; duplicate rows in `inventory_movements`.

### Pitfall 3: `item_location_stocks` is still frozen out-of-scope
**What goes wrong:** `OUT_OF_SCOPE_LEGACY_TABLES` (`mappings.js:65`) still contains `'item_location_stocks'`. Any guard using `isInScopeLegacyTable()` will reject it; `classifyOutOfScopeRecord()` would skip it — but D-10/PIM-05 require migrating it into opening-balance rows.
**Why it happens:** Phase 12 amended the ADR/comment for `items`/`stock_movements`/`pos_transactions` but left `item_location_stocks` in the frozen list.
**How to avoid:** Remove `'item_location_stocks'` from the array as an explicit task; update the accompanying comment. (Also confirm no verify/guard path double-rejects it.)
**Warning signs:** Opening-balance rows never appear; a skip finding tagged `OUT_OF_SCOPE_ENTITY` for `item_location_stocks`.

### Pitfall 4: BOM `ingredient_id` referenced before it's migrated
**What goes wrong:** A composition's ingredient is another item processed later in the same run → single-pass resolution finds no `legacy_id_map` row → unresolved.
**Why it happens:** Any item can be an ingredient (`Item.hasMany(ProductComposition, {foreignKey:'ingredient_id'})`, `models/index.js:252`); nested recipes (level 1-3) mean parents and children interleave.
**How to avoid:** Two-pass (Pattern 3). Pass 1 inserts every product; pass 2 resolves ingredients. Emit `UNRESOLVED_INGREDIENT` (severity `orphan`) for genuinely missing ingredients (e.g. soft-deleted/filtered items) and let `resolveDataQualityFindings` clear it if a later run fills the gap.
**Warning signs:** `attributes.composition` entries missing on parents; orphan findings that never resolve.

### Pitfall 5: `transfer` collapse findings block `verify` green
**What goes wrong:** `checkOpenFindings()` fails `data_migration_ok` on ANY open finding of severity `conflict`/`skip`/`orphan` (`verifyData.js:140-154`). D-08's `transfer` collapse is an *expected, non-erroneous* lossy collapse — but if recorded as an open `skip`/`conflict` it will keep every rehearsal RED forever.
**Why it happens:** The existing finding model has no "expected/informational" tier that's excluded from the blocking set.
**How to avoid (decision needed — see Open Questions):** Recommended — record the `transfer` collapse (and `FOLDER_NESTING_FLATTENED`) as findings for the audit trail, then either (a) immediately `resolveDataQualityFindings()` them so they're logged-but-closed, or (b) extend `checkOpenFindings`/`buildDataVerificationSections` to exclude a defined set of "expected lossy-collapse" reason codes from `data_migration_ok` (like the storefront-projection non-blocking precedent, `verifyData.js:164`). Do NOT leave them as plain open blocking findings.
**Warning signs:** `verify` reports `ok:false` with only `LOSSY_CATEGORY_COLLAPSE`/`FOLDER_NESTING_FLATTENED` open findings and no real data problem.

### Pitfall 6: Satellite reads need raw SQL, not model includes
**What goes wrong:** Reaching for `Item.findAll({ include: [...] })` — impossible, the runner imports no `backend/` code.
**How to avoid:** New `readLegacyProductSnapshot()` issues one SELECT per table (or LEFT JOINs) and stitches satellites onto each item by `item_id` in JS, matching the association aliases in `models/index.js:242-260`. Keep `attributes.compliance` sourced from the `regulatoryCompliance` table (key renamed per folding-design D-03).

## Code Examples

### Movement-type lookup (D-01..D-08)
```javascript
// Source: locked CONTEXT.md decisions; legacy enum from backend/src/models/StockMovement.js:27
const MOVEMENT_TYPE_MAP = Object.freeze({
    purchase_receipt: 'restock',        // D-01
    calculated_loss: 'loss',            // D-02
    adjustment: 'adjustment',           // D-03
    goods_issue: 'sale',                // D-04
    return: 'restock',                  // D-05
    production_consumption: 'adjustment', // D-06
    production_output: 'adjustment',    // D-07
    transfer: null                      // D-08 → no row; emit LOSSY_CATEGORY_COLLAPSE finding
});
// Target enum accepts restock|loss|adjustment|sale|booking (booking unused here).
```

### Embedding copy (PIM-06)
```javascript
// Source: legacy backend/src/models/ItemEmbedding.js:21 (vector TEXT); target
//   apps/dgfy-migration-runner/src/migrations/schema/20260716100000-…cjs:169
target_payload: {
    business_id: expectedBusinessId,
    product_id: /* Number(findLegacyIdMap items→product .dgfy_id) */,
    vector: legacyEmbedding.vector,              // TEXT JSON float array — copied verbatim, no parse/re-embed
    legacy_embedding_id: legacyEmbedding.embedding_id
}
// legacy_id_map_key: { legacy_source: tenantDb, legacy_table: 'item_embeddings', legacy_id: embedding_id }
// entity_type 'product_embedding'; runs AFTER products; natural key = ['product_id'] (unique).
```

### ENTITY_TARGET_CONFIG additions (apply.js:101)
```javascript
product_folder:     { primaryKey: 'id', naturalKeyColumns: ['business_id', 'name'] },
product:            { primaryKey: 'id', naturalKeyColumns: ['id'] }, // deterministic? see note
inventory_movement: { primaryKey: 'id', naturalKeyColumns: ['business_id', 'product_id', 'reference_type', 'reference_id'] },
product_embedding:  { primaryKey: 'id', naturalKeyColumns: ['product_id'] },
```
*Note:* `products.id` is AUTO_INCREMENT (no deterministic id), so `product`'s natural key can't be `id`. Use `sku_code`? — **rejected**, non-unique. There is no target-side natural unique key for products. Rely on the `legacy_id_map` skip-if-mapped branch as the sole idempotency guard for products (acceptable: the map row is recorded in the same flow, and the interruption window is the documented `location`-style limitation). Alternatively add a `legacy_item_id`-style column — out of scope (no schema change this phase). Document this as the products idempotency approach.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `items`/`stock_movements` out of scope (ADR 0029) | In scope from Phase 13 (LDM-01 amended the ADR) | Phase 12 | Mappers unblocked; `OUT_OF_SCOPE_LEGACY_TABLES` trimmed. |
| No target `attributes`/`product_embeddings`/natural-key index | All present + in `dgfyBusinessContract.js` | Phase 12 | No schema work this phase. |
| All apply writes are inserts | Phase 13 adds first `UPDATE` path (two-pass BOM) | This phase | New write path; must not trip append-only triggers (products has none — safe). |

**Deprecated/outdated:**
- CONTEXT.md's three-value legacy category list — superseded by the live 5-value enum (Pitfall 1).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 8 satellite tables (`item_nutrition` … `item_cost_breakdown`) exist as physical tenant-local tables with the association FKs shown in `models/index.js:242-260`. Their exact columns weren't read (only associations verified). | Standard Stack / Pitfall 6 | Mapper's satellite read/fold shape may need per-table column handling; low risk (fold whole row minus `item_id`/timestamps). Verify actual columns during planning if fidelity of a specific satellite matters. |
| A2 | Real tenant `stock_movements` rows carry the full 8-value `movement_type` enum (model) rather than only the base migration's 5 values. | Movement map | If a tenant only ever used 5, D-04/D-07/D-08 branches are simply unexercised — no harm. Confirm against rehearsal tenant data. |
| A3 | `product_composition.ingredient_id` always references an `item_id` that is itself in-scope for migration (i.e., ingredients are `items`, not some other entity). | BOM resolution | If an ingredient points outside `items`, resolution always fails → orphan finding. Confirm via a COUNT of compositions whose `ingredient_id` has no matching `items.item_id` on the rehearsal tenant. |
| A4 | Operator can provision working DB creds + `DGFY_BUSINESS_DB_NAMES` for a real tenant (the Phase-12 blocker) before the apply/verify proof. | Runtime State Inventory | Blocks the PIM acceptance proof, not the mapper code. Rehearsal likely on EC2. |

## Open Questions (RESOLVED)

1. **Findings severity for expected lossy collapses (D-08 transfer, folder flattening).**
   - What we know: `checkOpenFindings` blocks `verify` on any open finding; storefront-projection precedent shows a non-blocking informational channel exists.
   - What's unclear: whether to (a) auto-resolve these findings, or (b) add reason-code exclusion to the blocking set.
   - Recommendation: (b) — define `LOSSY_CATEGORY_COLLAPSE` + `FOLDER_NESTING_FLATTENED` as a known "expected" set excluded from `data_migration_ok`, so the audit trail keeps them visible AND verify goes green. Decide in planning.
   - **RESOLVED: Plan 13-05 Task 1 adopts option (b) — a frozen `EXPECTED_LOSSY_REASON_CODES` set (built from `MAPPING_REASON_CODES` constants) partitions open findings so `LOSSY_CATEGORY_COLLAPSE` + `FOLDER_NESTING_FLATTENED` are reported-but-non-blocking while `UNRESOLVED_INGREDIENT` and all conflicts stay blocking.**

2. **Products idempotency without a target natural key.**
   - What we know: `products.id` is AUTO_INCREMENT; `sku_code` is non-unique; no other unique key.
   - Recommendation: rely on `legacy_id_map` skip-if-mapped as the sole product idempotency guard (same documented limitation class as `location`). Accept the narrow target-first interruption window; no schema change this phase.
   - **RESOLVED: Plan 13-03 Task 1 relies on the `legacy_id_map` skip-if-mapped branch as the sole product idempotency guard (the `product` ENTITY_TARGET_CONFIG natural-key lookup returns null so `writeMappedTargetRow` short-circuits on the map), matching the documented `location`-style limitation.**

3. **Sum-by-type verification depth (VER-02 formally lands Phase 14).**
   - What we know: Phase 13 "carries its own product/inventory-side dry-run/apply/verify rehearsal success criteria" (STATE.md roadmap note) without owning VER-02's REQ-ID.
   - Recommendation: extend `verifyData.js` with product-domain counts + `SUM(quantity)` grouped by `movement_type` and product `category` distribution — enough to prove PIM-03/04/05 against a real tenant, structured so Phase 14 can bolt on availment-side checks.
   - **RESOLVED: Plan 13-05 Task 2 adds the product-domain count reconciliation + `SUM(quantity)` grouped by `movement_type`, a product `category` distribution, a one-embedding-per-product check, and a `stock_count`-equals-`reference_type='legacy_opening_balance'`-sum check — structured so Phase 14 can bolt on availment-side checks.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MySQL 8.0 (legacy tenant DB) | Source snapshot reads | ✓ (lima-dgfy-dev / EC2) | 8.0 | — |
| MySQL 8.0 (`dgfy_business_*` target) | Apply/verify | ⚠ blocked | — | Operator must provision creds + `DGFY_BUSINESS_DB_NAMES` (Phase-12 Plan-04 blocker, STATE.md). |
| Node.js + runner deps | All | ✓ | (installed) | — |
| Real tenant test data | PIM acceptance proof | ⚠ | — | Rehearsal env (EC2 per MEMORY note); dry-run works without target write. |

**Missing dependencies with no fallback:** Target DB creds/`DGFY_BUSINESS_DB_NAMES` for the apply/verify-against-real-tenant proof — must be resolved by operator before the acceptance step (does not block writing mapper code + unit tests).

**Missing dependencies with fallback:** None blocking mapper development; dry-run and Jest unit tests run without a live target.

## Security Domain

> `security_enforcement: true`, ASVS level 1. This is a backend batch tool with no HTTP surface, no auth, no user-facing input — the dominant control is SQL-injection safety on dynamically-scoped queries.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth surface (batch runner; DB creds via env). |
| V3 Session Management | no | N/A. |
| V4 Access Control | partial | Target-name guard (`assertTargetDbNameAllowed`) + destructive gate (`assertDestructiveAllowed`, `--confirm-destructive`) already enforce which DBs apply may write. New entities inherit this unchanged. |
| V5 Input Validation | yes | All source data treated as untrusted; every SQL uses `replacements` (parameterized), never string interpolation of values (`dataState.js`, `legacySource.js` contract). |
| V6 Cryptography | no | No new crypto. Embeddings are opaque TEXT copied verbatim. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via legacy string values folded into `attributes` / UPDATE | Tampering | Parameterized `replacements` for every write; `JSON.stringify` the attributes object as a single bound param, never concatenate. The two-pass `UPDATE products SET attributes = ?` MUST bind, not interpolate. |
| Table-name interpolation (`SELECT * FROM ${table}`) with attacker-influenced name | Tampering | Table/column names come only from a fixed in-code allow-list (`ENTITY_TARGET_CONFIG`, hardcoded SELECTs) — never from legacy data. Keep new entity configs literal. |
| Secret leakage into reports | Info Disclosure | Existing `recordResult()` deliberately omits `target_payload`/findings text; embeddings/`attributes` must likewise never be echoed into report rows. Preserve this for new entities. |
| Writing to a legacy or wrong DB | Elevation | `assertTargetDbNameAllowed` + `createLegacyTenantSourceConnection` reject `dgfy_*` on source and vice-versa — reuse, don't bypass. |

## Sources

### Primary (HIGH confidence — in-repo, VERIFIED this session)
- `apps/dgfy-migration-runner/src/data/mappings.js` — mapper contract, `classifyMappingConflict`, `MAPPING_REASON_CODES`, `OUT_OF_SCOPE_LEGACY_TABLES` (incl. `item_location_stocks` at line 65).
- `apps/dgfy-migration-runner/src/data/apply.js` — `writeMappedTargetRow`, `ENTITY_TARGET_CONFIG`, `findExistingTargetRow`, fixed entity ordering, fan-out disambiguation.
- `apps/dgfy-migration-runner/src/data/dryRun.js` — `buildDryRunPlan`, `reclassifyOperation`, summary counters.
- `apps/dgfy-migration-runner/src/metadata/dataState.js` — `findLegacyIdMap`, `markDataCheckpoint`, `recordDataQualityFinding`, `resolveDataQualityFindings`, `listOpenDataQualityFindings`.
- `apps/dgfy-migration-runner/src/data/legacySource.js` — snapshot-reader pattern + isolation contract.
- `apps/dgfy-migration-runner/src/data/verifyData.js` — `checkDataCounts`, `checkMapCompleteness`, `checkOpenFindings`, `data_migration_ok`.
- `apps/dgfy-migration-runner/src/commands/data.js` — dry-run/apply orchestration wiring.
- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` — `product_folders`(flat), `products`, `inventory_movements`(append-only) definitions.
- `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs` — `attributes` JSON, 6 typed cols, `product_embeddings`, `unique_inventory_movements_natural_key`.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` — confirms `attributes`/`product_embeddings`/natural-key index are verified; `stock_movements` stays in `rejectedTables` (target-name guard).
- `docs/database/legacy-product-attributes-folding-design.md` — the 10-key satellite folding contract (7 objects + 3 arrays; barcodes always array; omit-when-absent; compliance from `regulatoryCompliance`).
- `backend/src/models/Item.js` (category 5-value enum, promoted fields), `StockMovement.js` (8-value movement_type), `ItemEmbedding.js` (TEXT vector), `ItemLocationStock.js`, `ItemBarcode.js`, `ProductComposition.js`, `models/index.js:236-261` (folder + satellite associations), `validators/stockMovementValidator.js` (enum authority), and the legacy `items`/`item_folders`/`stock_movements`/`item_embeddings`/multi-location-ledger migrations.

### Secondary (MEDIUM)
- `.planning/STATE.md` — Phase-12 Plan-04 DB-cred blocker; roadmap sequencing notes (VER-01/02 → Phase 14).

### Tertiary (LOW)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external packages; all infra verified in-repo.
- Architecture (mapper/apply/verify extension): HIGH — direct Phase-3 precedent read line-by-line.
- Pitfalls: HIGH — each grounded in a specific verified line (category enum drift, NULL natural key, frozen out-of-scope table, verify blocking).
- BOM two-pass mechanism: MEDIUM-HIGH — no existing two-pass precedent in the codebase; recommended design is sound but net-new (validate in planning).

**Research date:** 2026-07-14
**Valid until:** 2026-08-13 (stable internal codebase; re-check if `apply.js`/`mappings.js` change before planning).
