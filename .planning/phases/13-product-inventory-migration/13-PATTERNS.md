# Phase 13: Product & Inventory Migration - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 6 modified (0 net-new files — the whole phase extends existing modules)
**Analogs found:** 6 / 6 (all in-repo, exact-role precedent from Phase 3)

> This is a pure data-migration phase inside `apps/dgfy-migration-runner`. There are **no new files** — every unit of work extends one of six existing modules that already migrate account/staff/location/terminal domains. The Phase-3 mappers are the *direct* template (same module, same contract), so every match below is "exact." The planner should treat the excerpts here as copy-from-this-exact-function instructions, not loose inspiration.

## File Classification

| Modified File | Role | Data Flow | Closest Analog (same file) | Match Quality |
|---------------|------|-----------|----------------------------|---------------|
| `src/data/mappings.js` — 5 new pure mappers + reason codes + trim OUT_OF_SCOPE list | mapper / transform | batch transform (pure, no I/O) | `mapLegacyLocationToLocation` (625), `mapLegacyUserToStaffAccount` (451), `mapTerminalRegistryEntryToTerminalIdentity` (697) | exact |
| `src/data/legacySource.js` — `readLegacyProductSnapshot()` | source reader | file/DB read (raw SELECT) | `readLegacyTenantSnapshot` (135), `readLegacyLandlordSnapshot` (48) | exact |
| `src/data/apply.js` — 4 ENTITY_TARGET_CONFIG rows + folder→product(2-pass)→movement→opening-balance→embedding ordering + first UPDATE path | service / orchestration | CRUD write + event-ordered batch | `runApplyTransformations` (451), `writeMappedTargetRow` (234), `applyTenantEntityBatch` (342) | exact (insert path); role-match (net-new UPDATE path) |
| `src/data/dryRun.js` — product-domain entities in `buildDryRunPlan()` | service / planner | read-only plan build | `buildDryRunPlan` (89), `reclassifyOperation` (62) | exact |
| `src/data/verifyData.js` — product-domain count + sum-by-type reconciliation | service / verify | read-only reconcile | `buildTargetDataVerification` (203), `checkDataCounts` (40), `checkOpenFindings` (140) | exact |
| `src/metadata/dataState.js` — **REUSE VERBATIM, no edit** | metadata / durable state | CRUD (meta) | `findLegacyIdMap` (23), `markDataCheckpoint` (82), `recordDataQualityFinding` (130), `resolveDataQualityFindings` (162) | reuse as-is |

**Target schema (no work this phase — Phase 12 shipped it):**
- `product_folders` (flat): `business_id CHAR(36)`, `name STRING(100)`, `description TEXT?`, `show_in_pos_filter BOOL`, `is_active BOOL`; unique `unique_product_folders_business_name` on `(business_id, name)`. `[schema 20260712100000:108-122]`
- `products`: `business_id CHAR(36)`, `folder_id INT?`, `name STRING(255)`, `category ENUM('food','service','retail')`, `product_type ENUM('basic_inventory','non_stock')`, `stock_count DECIMAL(24,12)?`, `base_price DECIMAL(14,4)?`, plus Phase-12 additive cols `sku_code STRING(50)?`, `description TEXT?`, `unit_of_measure STRING(50)?`, `cost_per_unit DECIMAL(14,4)?`, `vat_type ENUM('vatable','vat_exempt','zero_rated')`, `senior_pwd_discount_eligible BOOL`, `attributes JSON?`. `idx_products_sku_code` is **non-unique** (do NOT rely on it for idempotency). `[schema 20260712100000:127-154 + 20260716100000:115-152]`
- `inventory_movements` (append-only): `business_id CHAR(36)`, `product_id INT`, `movement_type ENUM('restock','loss','adjustment','sale','booking')`, `quantity DECIMAL(24,12)`, `reference_type STRING(64)?`, `reference_id STRING(64)?`, `actor_account_id CHAR(36)?`, `actor_staff_account_id INT?`, `before_snapshot JSON?`, `after_snapshot JSON?`. Unique `unique_inventory_movements_natural_key` on `(business_id, product_id, reference_type, reference_id)`. `[schema 20260712100000:165-197 + 20260716100000:189-192]`
- `product_embeddings` (1:1): `business_id CHAR(36)`, `product_id INT`, `vector TEXT`, `legacy_embedding_id INT?`; unique `unique_product_embeddings_product` on `(product_id)`. `[schema 20260716100000:156-177]`

---

## Pattern Assignments

### `src/data/mappings.js` — 5 new pure mappers (mapper, batch transform)

**Analog:** `mapLegacyLocationToLocation` (lines 625-686) is the cleanest one-table→one-table template; `mapTerminalRegistryEntryToTerminalIdentity` (697-755) is the template for the "resolved-dependency + informational finding" shape (mirror it for movements/embeddings whose `product_id` is resolved in apply, not the mapper).

**Hard contract to copy (module header, lines 22-33):** every mapper returns exactly
`{ operation, entity_type, target_table, target_database, target_payload, legacy_id_map_key, related_targets, findings }`. Zero imports, zero SQL, pure function of args. Dry-run and apply both call it — logic can't drift.

**Shared helpers already in the file — reuse, do not re-implement:** `isBlank` (86), `toTrimmedString` (90), `toKeyString` (94), `legacyIdMapKey` (98), `classifyMappingConflict` (111), `skipResult` (164).

**Standard insert-mapper skeleton to copy (from `mapLegacyLocationToLocation`, 625-686):**
```javascript
export function mapLegacyLocationToLocation(legacyLocation = {}, context = {}) {
    const { legacyTenantDbName = 'legacy_tenant', targetBusinessDbName = null } = context;
    const legacyId = legacyLocation.location_id;
    const legacyIdMapKeyValue = legacyIdMapKey({
        legacySource: legacyTenantDbName, legacyTable: 'tenant_locations', legacyId
    });
    const name = toTrimmedString(legacyLocation.name);
    if (isBlank(name)) {
        return skipResult({ entityType: 'location', targetTable: 'locations', legacyIdMapKeyValue,
            finding: classifyMappingConflict(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD, {
                entityType: 'location', legacyTable: 'tenant_locations', legacyId, severity: 'skip',
                message: `...`, remediation: `...` }) });
    }
    return {
        operation: 'insert', entity_type: 'location', target_table: 'locations',
        target_database: targetBusinessDbName,
        target_payload: { name, address_line: addressLine, /* ...columns... */ },
        legacy_id_map_key: legacyIdMapKeyValue, related_targets: [], findings: []
    };
}
```

**New reason codes to add to `MAPPING_REASON_CODES` (Object.freeze block, lines 38-48):** follow the exact `SNAKE_CASE_KEY: 'snake_case_value'` shape. Add `LOSSY_CATEGORY_COLLAPSE: 'lossy_category_collapse'` (D-08 transfer), `FOLDER_NESTING_FLATTENED: 'folder_nesting_flattened'` (PIM-01 flat folders), `UNRESOLVED_INGREDIENT: 'unresolved_ingredient'` (BOM pass-2 orphan).

**Movement-type lookup — declare as a frozen map alongside `TENANT_STATUS_MAP` (254) / `BUSINESS_MEMBERSHIP_ROLE_MAP` (375):**
```javascript
const MOVEMENT_TYPE_MAP = Object.freeze({
    purchase_receipt: 'restock', calculated_loss: 'loss', adjustment: 'adjustment',
    goods_issue: 'sale', return: 'restock', production_consumption: 'adjustment',
    production_output: 'adjustment', transfer: null   // D-08 → no row, emit finding
});
```

**Category rule (D-09, Pitfall 1) — flat unconditional, NOT a whitelist switch:** every legacy `items.category` value → `'retail'`. Do not enumerate; the live enum has 5 values (`raw_material, packaging, product, supplies, service`), a 3-case switch would silently drop rows.

**Deterministic non-null natural key on every inventory_movement payload (Pitfall 2):** synthesize independent of legacy reference fields —
`reference_type: 'legacy_stock_movement', reference_id: String(legacy.movement_id)` for D-01..D-07 rows; `reference_type: 'legacy_opening_balance', reference_id: String(legacy.item_id)` for the D-10 opening-balance row. A NULL in any natural-key column makes `findExistingTargetRow()` fall through to INSERT and defeats idempotency.

**Transfer collapse (D-08) — emit a finding, insert no row.** Use `mapTerminalRegistryEntryToTerminalIdentity`'s informational-finding pattern (724-734) but return a `skip`-style result with a `LOSSY_CATEGORY_COLLAPSE` finding rather than an insert. See Shared Pattern "Expected-lossy findings" for the verify-green requirement.

**Edit — trim OUT_OF_SCOPE_LEGACY_TABLES (lines 58-82):** remove `'item_location_stocks'` (currently line 65). Update the accompanying comment (54-57) to note `item_location_stocks` is now in scope from Phase 13 (D-10/PIM-05). Leave `pos_transaction_lines` in the list (Phase 14).

**`mapItemToProduct` payload — folding contract:** promote the 6 typed cols (`sku_code, description, unit_of_measure, cost_per_unit, vat_type, senior_pwd_discount_eligible`) to real columns; fold the 8 satellites + barcodes + BOM into `attributes` JSON per `docs/database/legacy-product-attributes-folding-design.md` (10 namespaced keys: `nutrition, physicalProperties, shelfLife, packaging, qualityControl, compliance, costBreakdown, allergens, barcodes, composition`; `barcodes` always an array; `compliance` sourced from the `regulatoryCompliance` satellite). `folder_id` is left null by the mapper and resolved in apply via `legacy_id_map` (folders migrate first).

---

### `src/data/legacySource.js` — `readLegacyProductSnapshot()` (source reader, raw SELECT)

**Analog:** `readLegacyTenantSnapshot` (135-147) — the exact shape to copy: one `await tenantSequelize.query('SELECT * FROM <table>')` per table, destructure `[rows]`, stitch in JS, return a single snapshot object.

**Copy this structure (135-147):**
```javascript
export async function readLegacyTenantSnapshot(tenantSequelize) {
    const [users] = await tenantSequelize.query('SELECT * FROM users');
    const [locations] = await tenantSequelize.query('SELECT * FROM tenant_locations');
    const [userLocationGrants] = await tenantSequelize.query('SELECT * FROM user_location_grants');
    const [settingsRows] = await tenantSequelize.query(
        'SELECT * FROM system_settings WHERE setting_key = ?',
        { replacements: [POS_TERMINAL_REGISTRY_SETTING_KEY] });
    // ...stitch/parse...
    return { users, locations, userLocationGrants, terminalRegistry };
}
```

**Isolation contract (module header, 1-30):** zero `backend/` imports, only raw SELECTs against the already-scoped tenant connection. The new reader issues one SELECT per table — `items`, the 8 satellites (`item_nutrition, item_allergens, item_physical_properties, item_shelf_life, item_packaging, item_quality_control, item_regulatory_compliance, item_cost_breakdown`), `item_barcodes`, `product_composition`, `item_folders`, `stock_movements`, `item_location_stocks`, `item_embeddings` — then stitches satellites onto each item by `item_id` in JS (no Sequelize `include`, Pitfall 6). Parameterize every value via `replacements` (Security Domain V5); table names stay literal in-code (never from legacy data).

**Scoped-empty guard to copy (readLegacyLandlordSnapshot, 51-53):** return an empty-arrays snapshot when there is nothing to read, never an unscoped enumeration.

---

### `src/data/apply.js` — ENTITY_TARGET_CONFIG + fixed ordering + two-pass BOM UPDATE (orchestration)

**Analog (insert path — exact):** `runApplyTransformations` (451-664) is the ordering/orchestration template; `writeMappedTargetRow` (234-309) and `applyTenantEntityBatch` (342-395) are reused unchanged for every new entity's insert.

**Add 4 rows to `ENTITY_TARGET_CONFIG` (101-111), same literal shape:**
```javascript
product_folder:     { primaryKey: 'id', naturalKeyColumns: ['business_id', 'name'] },
product:            { primaryKey: 'id', naturalKeyColumns: ['id'] }, // see note
inventory_movement: { primaryKey: 'id', naturalKeyColumns: ['business_id', 'product_id', 'reference_type', 'reference_id'] },
product_embedding:  { primaryKey: 'id', naturalKeyColumns: ['product_id'] },
```
*`product` note (Open Question 2):* `products.id` is AUTO_INCREMENT and `sku_code` is non-unique — there is **no** target-side natural key. Rely on the `legacy_id_map` skip-if-mapped branch (writeMappedTargetRow, 262-282) as the sole product idempotency guard — the same documented limitation class as `location` (see the ENTITY_TARGET_CONFIG doc comment, 87-100). Give `product` a config whose natural-key lookup will always return null (or omit it and let `config ? ... : null` at 284 short-circuit); do not fabricate a false key.

**Ordering to copy — mirror the per-tenant loop (485-661).** New per-tenant order: `product_folder` → `product` (pass-1 insert) → `product` (pass-2 BOM UPDATE) → `inventory_movement` (from stock_movements) → `inventory_movement` (opening-balance from item_location_stocks) → `product_embedding`. Folders before products because `products.folder_id` resolves via `legacy_id_map`; products before movements/embeddings for the same reason. Each entity type goes through `applyBatchAndRecord` (422-428) → `applyTenantEntityBatch`, getting its own per-`(run_scope, legacy_tenant_id, entity_type)` checkpoint automatically.

**Dependency-id resolution — copy the staffAccountId / locationId pattern (592-610, 636-647):**
```javascript
const staffMap = await findLegacyIdMap(metaSequelize, {
    runScope, legacySource: target.legacy_tenant_db_name, legacyTable: 'users', legacyId: membership.tenant_user_id });
staffAccountId = staffMap ? Number(staffMap.dgfy_id) : null;   // string→number coercion for INT FK
```
Apply this verbatim for: `products.folder_id` (lookup `item_folders`→`product_folders`), `inventory_movements.product_id` (lookup `items`→`products`), `product_embeddings.product_id` (lookup `items`→`products`). `dgfy_id` is stored as a string — coerce with `Number()` for the INT FK columns.

**Net-new: two-pass BOM UPDATE (RESEARCH Pattern 3) — the first non-insert write in this file.** After the whole `product` insert batch for a tenant, re-loop items, resolve each `product_composition.ingredient_id` via `findLegacyIdMap('items')`, and `UPDATE products SET attributes = ?, updated_at = ? WHERE id = ?` with the merged `attributes.composition`. **Must bind, never interpolate** the JSON (`JSON.stringify(merged)` as a single `replacements` param — Security Domain SQL-injection row). Emit `UNRESOLVED_INGREDIENT` (severity `orphan`) via `recordDataQualityFinding` for a missing ingredient; `resolveDataQualityFindings` clears it on a later run once the ingredient exists (same self-healing pattern as apply's existing 359-368). Idempotent by construction: a re-run rewrites the identical resolved array.

**Do NOT hand-roll (RESEARCH "Don't Hand-Roll"):** skip-if-mapped (`writeMappedTargetRow` existing-map branch, 262-282), per-entity checkpoints (`applyTenantEntityBatch`), findings (`classifyMappingConflict` + `recordDataQualityFinding`), cross-entity id resolution (`findLegacyIdMap`). All battle-tested against Phases 3-11.

**Imports to extend (52-77):** add the 5 new mapper names to the `./mappings.js` import; `findLegacyIdMap`, `recordLegacyIdMap`, `recordDataQualityFinding`, `resolveDataQualityFindings` are already imported from `../metadata/dataState.js`.

---

### `src/data/dryRun.js` — product-domain entities in `buildDryRunPlan()` (planner)

**Analog:** `buildDryRunPlan` (89-253) — the pure plan-builder. Add the product-domain mapper calls to the per-target `targets.forEach` loop (114-250) in the same fixed order apply uses, pushing `{ legacy_tenant_id, ...reclassifyOperation(result, resolvedIdMap) }` entries exactly as staff/location/terminal do (191, 227, 248).

**`reclassifyOperation` (62-71) is reused unchanged** — it flips `insert`→`update` when a durable `legacy_id_map` row already exists. New mappers get it for free; no dry-run-specific transform logic exists (that is the whole point — dry-run and apply share the mapper).

**Resolve-dependency-in-plan pattern to copy (staff→assignment, 173-216; location→terminal, 220-249):** the plan pre-resolves a dependent id from `resolvedIdMap` (`idMapLookupKey`, 51) so a *retried* dry-run reflects prior-apply state. For BOM the mapper stays pure — dry-run reports the parent product insert; the composition UPDATE is apply-only (report it as a planned product update or a note, not a second mapper).

**Extend `summarizeDryRunReport` (265-315) only if new counters are wanted** — the existing `planned_inserts/updates/skips/conflicts` + `orphan_records` (from `finding.severity === 'orphan'`, 303-307) already cover the new entities generically. No structural change required.

**Imports (28-38):** add the 5 new mapper names to the `./mappings.js` import block.

---

### `src/data/verifyData.js` — product-domain count + sum-by-type reconciliation (verify)

**Analog:** `buildTargetDataVerification` (203-292) — extend the `Promise.all` target reads (218-223) and the `checkDataCounts` entries (234-259) to add `product_folders`, `products`, `inventory_movements`, `product_embeddings`.

**Copy the mapper-aware expected-count pattern (234-259):** `expected_target_count = source_count - skippedByEntity[type]`. Extend `skippedByEntity` (225) with the new entity types so intentional D-08/D-09 skips don't read as mismatches. Add `product`/`product_folder`/`inventory_movement`/`product_embedding` keys.

**Reuse pure checks unchanged:** `checkDataCounts` (40), `checkMapCompleteness` (122), `checkOpenFindings` (140). Extend `expectedLegacyKeys` (262-265) with `items`→`products` and `item_folders`→`product_folders` keys in the `${source}|${table}|${id}` format.

**Net-new: sum-by-type reconciliation (RESEARCH Open Question 3).** Add a `SUM(quantity)` grouped by `movement_type` check for `inventory_movements` and a `category` distribution count for `products` — enough to prove PIM-03/04/05. Structure it so Phase 14 can bolt on availment-side checks. Follow the never-throws contract (try/catch → `ok:false` + `error`, 284-291).

**`data_migration_ok` gate (352):** `targetVerifications.every(ok) && openFindingsCheck.ok`. See Shared Pattern "Expected-lossy findings" — the D-08/folder-flatten findings must NOT keep this red forever.

---

### `src/metadata/dataState.js` — REUSE VERBATIM (no edit)

**No changes.** `findLegacyIdMap` (23), `recordLegacyIdMap` (36), `getDataCheckpoint` (68), `markDataCheckpoint` (82), `recordDataQualityFinding` (130), `resolveDataQualityFindings` (162), `listOpenDataQualityFindings` (196) all work for the new entity types as-is. New entity types simply get their own checkpoint/finding/map rows keyed by their `entity_type` string. Listed here so the planner does not accidentally scope work into it.

---

## Shared Patterns

### Pure-mapper contract
**Source:** `src/data/mappings.js` header (lines 22-33) + every existing mapper.
**Apply to:** all 5 new mappers.
Every mapper returns the 8-field result object; zero imports/SQL; dry-run and apply both call it. Skip/conflict via `skipResult` (164) + `classifyMappingConflict` (111), never ad-hoc objects.

### Deterministic non-null natural key (idempotency)
**Source:** `findExistingTargetRow` (`apply.js` 139-153) — returns null (→ INSERT) if ANY natural-key column is null.
**Apply to:** every `inventory_movements` payload.
Synthesize `reference_type`/`reference_id` from the legacy PK, independent of legacy reference fields (`legacy_stock_movement`/`String(movement_id)`; `legacy_opening_balance`/`String(item_id)`). Pitfall 2 — a NULL silently defeats the `unique_inventory_movements_natural_key` index.

### Cross-entity id resolution (never a raw legacy id)
**Source:** `findLegacyIdMap` usage in `apply.js` (596-604, 641-647).
**Apply to:** `products.folder_id`, `inventory_movements.product_id`, `product_embeddings.product_id`, BOM `ingredient_product_id`.
Always resolve via `legacy_id_map`, coerce `dgfy_id` string → `Number()` for INT FK columns. Works whether the dependency was written this run or a prior completed run (MIG-04).

### Findings recorded, never silently dropped (+ expected-lossy exception)
**Source:** `recordDataQualityFinding` (`dataState.js` 130), `checkOpenFindings` (`verifyData.js` 140-154), `summarizeStorefrontDiscoveryProjection` non-blocking precedent (`verifyData.js` 164-170).
**Apply to:** D-08 transfer collapse, folder-nesting-flatten, unresolved-ingredient.
`checkOpenFindings` fails `data_migration_ok` on ANY open `conflict`/`skip`/`orphan`. D-08 and folder-flatten are *expected* lossy collapses — record them for audit but keep verify green via either (a) immediate `resolveDataQualityFindings()` (log-but-close) or (b) a reason-code exclusion set in `checkOpenFindings`/`buildDataVerificationSections`, mirroring the storefront-projection non-blocking precedent (Pitfall 5 / Open Question 1 — decide in planning; recommendation is (b)). Genuine `UNRESOLVED_INGREDIENT` orphans stay blocking until resolved.

### Per-(tenant, entity_type) checkpointing
**Source:** `applyTenantEntityBatch` (`apply.js` 342-395) + `markDataCheckpoint`/`getDataCheckpoint` (`dataState.js` 68-123).
**Apply to:** all 4 new entity types.
Each entity type gets its own checkpoint rows for free by going through `applyBatchAndRecord`. A completed batch is re-verified, not re-written. No new checkpoint design.

### Parameterized SQL / no interpolation (security)
**Source:** every `.query(sql, { replacements })` in `dataState.js`, `legacySource.js`, `apply.js`.
**Apply to:** the new snapshot reader SELECTs and the two-pass BOM `UPDATE products SET attributes = ?`.
Bind every legacy value (including `JSON.stringify(attributes)` as one param); table/column names stay literal in-code. Never echo `target_payload`/embeddings/attributes into report rows (`recordResult`, 397-410, deliberately omits them).

---

## No Analog Found

None. Every unit of work has an exact in-file Phase-3 precedent. Two mechanisms are *net-new behavior* but reuse existing infrastructure and shapes:

| Work item | Role | Data Flow | Note |
|-----------|------|-----------|------|
| Two-pass BOM `UPDATE products SET attributes` (`apply.js`) | orchestration | CRUD update | First non-insert write in the file. No existing UPDATE precedent, but reuses `findLegacyIdMap` + `recordDataQualityFinding` + parameterized-query patterns. `products` has no append-only trigger (safe). |
| Sum-by-type / category-distribution reconciliation (`verifyData.js`) | verify | read-only aggregate | Extends `buildTargetDataVerification`; net-new aggregate queries but same never-throws + `checkDataCounts` shape. |

## Metadata

**Analog search scope:** `apps/dgfy-migration-runner/src/data/` (mappings, apply, dryRun, legacySource, verifyData), `apps/dgfy-migration-runner/src/metadata/` (dataState), `apps/dgfy-migration-runner/src/migrations/schema/` (target column definitions).
**Files scanned:** 8 (6 analog modules + 2 schema migrations).
**Pattern extraction date:** 2026-07-14
