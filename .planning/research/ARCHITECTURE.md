# Architecture Research

**Domain:** Legacy Data Migration integration — items/inventory/sales-history mappers into the existing `apps/dgfy-migration-runner` orchestration layer
**Researched:** 2026-07-14
**Confidence:** HIGH — every finding below is read directly from the current codebase (`apps/dgfy-migration-runner/src/**`, `apps/dgfy-migration-runner/src/schemaContracts/**`, `backend/src/models/*.js` read as reference only), not inferred from general migration-tooling patterns.

**Supersedes:** the prior v2.0 Commerce Domain ARCHITECTURE.md that lived at this path — that research covered `apps/dgfy-api` module integration (products/inventory/booking/POS/storefront APIs), which is now built (Phases 8-11, see PROJECT.md). This document is scoped to the v2.1 Legacy Data Migration milestone: how new items/inventory/sales-history **mapper functions** integrate with the already-existing `apps/dgfy-migration-runner` orchestration layer (checkpointing, dry-run/apply, idempotent retry, verify) — it does not revisit the runner's core command/orchestration design itself.

## Standard Architecture

### System Overview — where the new mappers plug in

```
┌───────────────────────────────────────────────────────────────────────────┐
│ commands/data.js  (runDataDryRun / runDataApply — UNCHANGED)              │
│   validateEnv → assertTargetDbNameAllowed → [assertDestructiveAllowed]    │
│   → loadMigrationTargetManifest → open target/meta connections            │
│   → runDryRunTransformations() / runApplyTransformations()                │
├───────────────────────────────────────────────────────────────────────────┤
│ ORCHESTRATION LAYER — src/data/dryRun.js, src/data/apply.js               │
│                                                                             │
│  buildDryRunPlan() / runApplyTransformations() — HARD-CODED per-tenant    │
│  entity write order (NOT a pluggable registry):                           │
│    account (landlord, once)                                               │
│      → business (+registry, +ownership)                                   │
│      → staff_account → business_membership → account_staff_assignment    │
│      → location → terminal_identity                                       │
│      → [NEW] product_folder → product → inventory_movement               │
│              → product_embedding                                          │
│      → [NEW, later wave] availment  (+ availment_item, if scoped)         │
│                                                                             │
│  Each new entity is inserted into this SAME literal sequence, in both     │
│  dryRun.js's buildDryRunPlan() and apply.js's runApplyTransformations() — │
│  they must be extended in lockstep or dry-run/apply will disagree.        │
├───────────────────────────────────────────────────────────────────────────┤
│ src/data/legacySource.js  (read-only legacy SELECTs, scoped per target)   │
│   readLegacyLandlordSnapshot()   — tenants/dgfy_accounts/memberships      │
│   readLegacyTenantSnapshot()     — users/tenant_locations/terminal reg.   │
│   [NEW] readLegacyCatalogSnapshot()        — items/item_folders/          │
│         satellite tables/item_embeddings/stock_movements                  │
│   [NEW] readLegacyPosTransactionsSnapshot() — pos_transactions(_lines)    │
│   ALL new reads use the SAME createLegacyTenantSourceConnection() the     │
│   existing reads use — confirmed below, these legacy tables are           │
│   tenant-scoped, not landlord-scoped.                                     │
├───────────────────────────────────────────────────────────────────────────┤
│ src/data/mappings.js  (pure functions, zero I/O — THE pattern to extend)  │
│   Existing: mapLegacyAccountToDgfyAccount, mapLegacyTenantToBusiness,     │
│   mapLegacyMembershipToBusinessMembership, mapLegacyUserToStaffAccount,   │
│   mapLegacyAccountStaffAssignment, mapLegacyLocationToLocation,           │
│   mapTerminalRegistryEntryToTerminalIdentity                              │
│   [NEW] mapLegacyItemFolderToProductFolder                                │
│   [NEW] mapLegacyItemToProduct  (folds satellite tables → attributes)     │
│   [NEW] mapStockMovementToInventoryMovement                               │
│   [NEW] mapItemEmbeddingToEmbeddingRow                                    │
│   [NEW, later wave] mapLegacyPosTransactionToAvailment                    │
│   OUT_OF_SCOPE_LEGACY_TABLES shrinks: 'items'/'stock_movements' removed   │
│   in the catalog wave, 'pos_transactions'(+lines) removed in the          │
│   sales-history wave — same precedent as dgfyBusinessContract.js         │
│   removing 'products'/'shifts' from rejectedTables in Phase 08.           │
├───────────────────────────────────────────────────────────────────────────┤
│ TARGET WRITE LAYER — apply.js's ENTITY_TARGET_CONFIG + writeMappedTargetRow│
│   [NEW config entries] product_folder, product, inventory_movement,      │
│   product_embedding, availment — each needs a primaryKey +                │
│   naturalKeyColumns entry for idempotent retry (see Pitfalls below;      │
│   products/inventory_movements currently have NO usable natural key).    │
├───────────────────────────────────────────────────────────────────────────┤
│ src/data/verifyData.js  (MIG-05 reconciliation — extend, don't replace)  │
│   [NEW] count checks: product_folders/products/inventory_movements/      │
│   product_embeddings/availments source-vs-target (net of skips)          │
│   [NEW] relationship checks: products.folder_id → product_folders,       │
│   inventory_movements.product_id → products (mirrors the existing        │
│   account_staff_assignment↔business_membership / terminal↔location       │
│   pattern in checkRequiredRelationships())                                │
├───────────────────────────────────────────────────────────────────────────┤
│ SCHEMA MIGRATIONS — apps/dgfy-migration-runner/src/migrations/schema/*.cjs│
│   [NEW, additive] ALTER products ADD sku_code/cost_per_unit/vat_type/    │
│   senior_pwd_discount_eligible/description/unit_of_measure/attributes    │
│   [NEW] CREATE product_embeddings (no such table exists yet)             │
│   [NEW, additive] ALTER inventory_movements — unique(business_id,        │
│   reference_type, reference_id) using columns that ALREADY exist         │
│   [NEW, additive, later wave] ALTER availments ADD source_system         │
│   dgfyBusinessContract.js updated in lockstep with every ALTER/CREATE.   │
└───────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Current Responsibility | v2.1 Change |
|-----------|------------------------|-------------|
| `src/data/mappings.js` | Pure legacy-row → target-payload transforms, zero I/O, single source of truth mirrored in `docs/database/dgfy-data-migration-map.md` | **Add** 4-5 new exported mapper functions following the exact existing return contract (`operation`/`entity_type`/`target_table`/`target_database`/`target_payload`/`legacy_id_map_key`/`related_targets`/`findings`). **Edit** `OUT_OF_SCOPE_LEGACY_TABLES` to remove now-in-scope legacy table names. |
| `src/data/legacySource.js` | Read-only, manifest-scoped `SELECT`s against legacy landlord/tenant DBs; explicitly documents which tables are *never* queried | **Add** new read functions for the catalog and sales-history legacy tables. **Edit** the module-level doc comment's "Never queried" list (it currently names `items`, `stock_movements`, `pos_transactions` explicitly — that comment becomes false once these reads exist and must be corrected, not just silently outdated). |
| `src/data/dryRun.js` | `buildDryRunPlan()` — literal, hard-coded per-tenant call sequence to every mapper; `summarizeDryRunReport()` — scalar counters | **Edit** `buildDryRunPlan()` to add product_folder/product/inventory_movement/product_embedding (and later availment) calls, in dependency order, using the same `resolvedIdMap`/`reclassifyOperation()` insert→update logic already used for staff/location/terminal. |
| `src/data/apply.js` | `runApplyTransformations()` — the same literal per-tenant sequence, plus the only code path that writes to `dgfy_*`; `ENTITY_TARGET_CONFIG` — natural-key reconciliation table | **Edit** `runApplyTransformations()` in lockstep with dryRun.js. **Add** `ENTITY_TARGET_CONFIG` entries for every new entity type. |
| `src/data/verifyData.js` | `buildDataVerificationSections()` — MIG-05 count/completeness/relationship checks per target | **Add** new count-check entries and a new relationship-check pass for the catalog/inventory entities. |
| `src/schemaContracts/dgfyBusinessContract.js` | Single source of truth for `dgfy_business_*` table shape, consumed by both the migration file and `verify.js`'s schema-shape checks | **Edit** `products`/`inventory_movements`/`availments` entries' `columns`/`indexes`/`uniqueConstraints`. **Add** a `product_embeddings` entry. |
| `src/migrations/schema/*.cjs` | One additive, idempotent (`tableExists`/`describeTable` guarded) migration file per concern, `meta.targetKind: 'business'` gates every file to tenant DBs only | **Add** 3-4 new small migration files (one ALTER `products`, one CREATE `product_embeddings`, one ALTER `inventory_movements`, one ALTER `availments`) — never touch the existing Phase 08/09 files. |
| `src/metadata/bootstrap.js` / `dataState.js` | Checkpoint/id-map/finding tables | **No change.** `data_checkpoints.entity_type` and `legacy_id_map` are free-form `STRING(80)`/generic key columns, not enums — new entity type names ("product", "inventory_movement", "availment", ...) need zero metadata-schema migration. |
| `docs/database/dgfy-data-migration-map.md` | Authoritative per-entity source→target transform spec the mappers implement against | **Add** new numbered sections (8+) following the exact existing table format — this doc is explicitly the contract mappers.js implements, so it must be updated before/alongside the mapper code, not after. |

## Confirmed Legacy Source Shape (read from `backend/src/models/*.js`, reference-only)

This directly resolves the "what connection do the new reads use" question:

- `items` (`tableName: 'items'`), `item_folders`, `stock_movements`, `item_embeddings`, `pos_transactions`, `pos_transaction_lines`, and every satellite table (`item_barcodes`, `item_cost_breakdown`, `item_nutrition`, `item_allergens`, `item_packaging`, `item_regulatory_compliance`, `item_physical_properties`, `item_shelf_life`, `item_quality_control`, `item_location_stocks`, `service_item_details`, `fnb_item_modifier_groups`, `fnb_item_kitchen_routes`) all live in `backend/src/models/` — the **same directory** as `User.js`/`TenantLocation.js`, which `legacySource.js` already reads via `createLegacyTenantSourceConnection(config, target.legacy_tenant_db_name)`. None of them live in `backend/src/models/Landlord/`.
  - **Conclusion:** the new catalog/inventory/sales-history reads are **per-tenant**, reachable through the exact connection factory already used for `users`/`tenant_locations`/`system_settings` — no new connection factory, no `src/config/db.js` change, no landlord-side read needed.
- `items.category` is a legacy `ENUM('raw_material', 'packaging', 'product', 'supplies', 'service')`, with a conditional `product_type: ENUM('work_in_progress', 'finished_goods')` that is only meaningful when `category = 'product'`. This is exactly the "5 values, raw-material-centric" distinction PROJECT.md defers. The new `dgfy_business_*.products.category` ENUM is `('food', 'service', 'retail')` (Phase 08) — **these two enums do not overlap and must not be conflated.**
- `item_embeddings.vector` is stored as `TEXT` holding JSON (`ItemEmbedding.js`'s own comment: "Store vector as JSON text ... OpenAI 1536-dim vector is ~23KB, fitting in TEXT"), not a native vector column — the new `product_embeddings` target table can use the same simple `JSON`/`TEXT` storage strategy; no vector extension or new MySQL capability is required.
- `availments` already has a `source_reference` column with a `unique_availments_source_reference` index (Phase 10, storefront-order idempotency guard), currently `NULL` for every POS-created availment. This is **not** the same thing as the new `source_system` provenance field PROJECT.md asks for, and MySQL treats every `NULL` in a unique index as distinct, so `source_reference` alone cannot double as the sales-history dedup key without a naming collision risk against the existing storefront-order usage.

## New vs Modified Components (explicit)

| File | New or Modified | What Changes |
|------|------------------|---------------|
| `src/migrations/schema/<timestamp>-add-products-catalog-columns.cjs` | **New file** | Additive `ALTER TABLE products ADD COLUMN` for `sku_code`, `cost_per_unit`, `vat_type`, `senior_pwd_discount_eligible`, `description`, `unit_of_measure`, `attributes` (JSON). `meta.targetKind: 'business'`, `destructive: false`. Follow `20260714104000-add-commerce-payment-session-audit-fields.cjs`'s exact `describeTable()`-guarded `addColumn` pattern. |
| `src/migrations/schema/<timestamp>-create-product-embeddings.cjs` | **New file** | `CREATE TABLE product_embeddings` — no such table exists anywhere yet. `product_id` FK → `products.id`, `vector` JSON/TEXT, model/version metadata, `created_at`-only (append-only, mirrors `inventory_movements`/`payments` triggers). |
| `src/migrations/schema/<timestamp>-harden-inventory-movements-natural-key.cjs` | **New file** | Additive `UNIQUE INDEX` on `inventory_movements(business_id, reference_type, reference_id)` — uses columns that **already exist**, no new column needed. Gives the append-only ledger a real DB-enforced idempotency key (see Pitfall 3). |
| `src/migrations/schema/<timestamp>-add-availment-source-system.cjs` | **New file, later wave** | Additive `source_system` column on `availments` (nullable, e.g. `STRING(32)` or `ENUM`). Keep this migration in the sales-history wave, not the catalog wave — it has no dependency on products/inventory. |
| `src/schemaContracts/dgfyBusinessContract.js` | **Modified** | `products.columns[]`/`inventory_movements.indexes[]`/`availments.columns[]` updated to match the migrations above; **new** `product_embeddings` table entry added. `rejectedTables[]` gets no change — `items`/`stock_movements`/`pos_transactions` were never in this file (it governs `dgfy_business_*` shape, not legacy source scope); the equivalent removal happens in `mappings.js`'s `OUT_OF_SCOPE_LEGACY_TABLES`. |
| `src/data/mappings.js` | **Modified + additive** | Remove `items`/`stock_movements` (catalog wave) and `pos_transactions`(+`pos_transaction_lines` if scoped) (sales-history wave) from `OUT_OF_SCOPE_LEGACY_TABLES`. Add `mapLegacyItemFolderToProductFolder`, `mapLegacyItemToProduct`, `mapStockMovementToInventoryMovement`, `mapItemEmbeddingToEmbeddingRow`, and later `mapLegacyPosTransactionToAvailment` as new exported functions — never edit the 7 existing mappers. |
| `src/data/legacySource.js` | **Modified + additive** | Add `readLegacyCatalogSnapshot(tenantSequelize)` and `readLegacyPosTransactionsSnapshot(tenantSequelize)`, each scoped `SELECT`s matching the existing style. Correct the module doc comment's "Never queried" list once these exist. |
| `src/data/dryRun.js` | **Modified** | Extend `buildDryRunPlan()`'s per-tenant loop with the new mapper calls, in dependency order (folders → products → inventory_movements/embeddings; later: availments after products). No change to `summarizeDryRunReport()`'s shape — it already generically counts by `operation`. |
| `src/data/apply.js` | **Modified** | Extend `runApplyTransformations()` in lockstep with dryRun.js. Add `ENTITY_TARGET_CONFIG` entries for every new `entity_type`. |
| `src/data/verifyData.js` | **Modified** | Extend `buildTargetDataVerification()` (or add a sibling function called from `buildDataVerificationSections()`) with new count/relationship checks. `checkDataCounts()`/`checkMapCompleteness()`/`checkRequiredRelationships()` are already generic pure functions — reuse them directly, don't fork them. |
| `src/metadata/bootstrap.js`, `src/metadata/dataState.js` | **No change** | `entity_type` columns are free-form strings; checkpoint/id-map/finding machinery is entity-agnostic already. |
| `src/config/db.js`, `src/data/targetManifest.js`, `src/commands/data.js` | **No change** | Connection factories, manifest shape, and command-level orchestration (`validateEnv → assertTargetDbNameAllowed → assertDestructiveAllowed → ...`) are entity-agnostic; the new entities are tenant-scoped exactly like the existing ones and need no new manifest fields or command flags. |
| `docs/database/dgfy-data-migration-map.md` | **Modified (additive sections)** | New numbered sections for Product Folder, Product, Inventory Movement, Product Embedding, and (later) Sales Transaction/Availment, in the existing table format (source field → target field → transform rule → skip/conflict rule → `legacy_id_map` key → verification check). |

## Build Order

Given `products`/`product_folders`/`inventory_movements`/`availments` **tables already exist but are empty** (created by the Phase 08/09 Commerce Domain migrations, never populated because `mappings.js`'s reject list and `legacySource.js`'s read scope both structurally exclude their legacy sources today), the work is almost entirely **schema-extension + data-path wiring**, not net-new table creation — except `product_embeddings`, which is genuinely new.

**Wave 0 — Schema (additive, non-destructive, independently reviewable/rollback-able):**
1. `products` ALTER — add the 6 typed columns + `attributes` JSON. Recommend adding a `UNIQUE(business_id, sku_code)` index here (nullable-safe: legacy items without a SKU stay `NULL`, matching MySQL's "every NULL is distinct" unique-index semantics) — this gives `products` a real natural key for idempotent apply-retry, mirroring the `staff_accounts.email` / `terminal_identities.terminal_code` precedent, instead of falling into the no-natural-key gap `inventory_movements` and (originally) `location` have.
2. `product_embeddings` CREATE — new table, FK to `products.id`, JSON/TEXT vector storage (matches legacy `ItemEmbedding.js`'s own storage strategy).
3. `inventory_movements` ALTER (index-only) — add `UNIQUE(business_id, reference_type, reference_id)` using existing columns.
4. Update `dgfyBusinessContract.js` for all three.

*Do not* bundle the `availments.source_system` column into this wave — defer it to Wave 2 so the catalog/inventory wave and the sales-history wave stay independently shippable, matching PROJECT.md's own framing ("Sales-history migration ... as its own phase").

**Wave 1 — Catalog + Inventory data path (items/item_folders/stock_movements/satellite tables/item_embeddings):**
5. `mappings.js`: remove `items`/`stock_movements` from `OUT_OF_SCOPE_LEGACY_TABLES`; add the 4 new mapper functions. `mapLegacyItemToProduct` should fold every satellite table row into the mapper's `related_targets`/`attributes` payload the same way `mapLegacyTenantToBusiness` folds `business_database_registry`/`tenant_ownership_metadata` into `related_targets` — satellite tables should **not** get their own top-level `entity_type`/`legacy_id_map` row; they share the parent item's identity.
6. `legacySource.js`: add `readLegacyCatalogSnapshot()`.
7. `dryRun.js` + `apply.js`: extend the per-tenant sequence with `product_folder → product → inventory_movement → product_embedding`, in that order (folders resolve before products need `folder_id`; products resolve before inventory_movements/embeddings need `product_id` — identical dependency-resolution shape to the existing `location → terminal_identity` pair, using `resolvedIdMap`/`legacy_id_map` lookups, never a raw legacy id).
8. `verifyData.js`: add count checks (source `items`/`item_folders`/`stock_movements`/`item_embeddings` counts vs target, net of skips) and relationship checks (`products.folder_id` → migrated `product_folders`, `inventory_movements.product_id` → migrated `products`).
9. `docs/database/dgfy-data-migration-map.md`: append the corresponding sections.
10. Re-rehearse against the disposable production-parity environment (per PROJECT.md's stated validation approach) before moving to Wave 2.

**Wave 2 — Sales-history data path (pos_transactions → availments), sequenced strictly after Wave 1 is proven:**
11. `availments` ALTER — add `source_system`.
12. `mappings.js`: remove `pos_transactions` (+`pos_transaction_lines` if scoped — see Open Question below) from `OUT_OF_SCOPE_LEGACY_TABLES`; add `mapLegacyPosTransactionToAvailment`.
13. `legacySource.js`: add `readLegacyPosTransactionsSnapshot()`.
14. `dryRun.js` + `apply.js`: extend the per-tenant sequence with `availment` (+ `availment_item` if scoped) **after** `product`/`inventory_movement` in the fixed order — if line items are in scope, `availment_items.product_id` is a `RESTRICT` FK and must resolve through the Wave 1 `legacy_id_map`, which only exists once Wave 1 has actually run.
15. `verifyData.js` + migration-map doc: same extension pattern as Wave 1.

**Why this order and not products+sales-history in parallel:** the runner's orchestration is a single hard-coded sequence per tenant, not independent pipelines — and even if it were parallelized, `availment_items.product_id` has a real FK to `products.id`, so sales-history data cannot be durably written until product identities exist in `legacy_id_map`. Building Wave 2 before Wave 1 is proven would either violate the FK or force sales-history to skip/orphan every line item.

## Pitfalls Specific to This Integration

### Pitfall 1: Two orchestrators must be edited in lockstep, not one
`buildDryRunPlan()` (dryRun.js) and `runApplyTransformations()` (apply.js) each hard-code the same per-tenant entity sequence independently — there is no shared, data-driven entity registry. Adding a mapper function to `mappings.js` alone does nothing; the call must be added to **both** files in the same relative position, or dry-run will report entities apply silently skips (or vice versa), reintroducing the exact "Pitfall 2: dry-run/apply drift" the original Phase 03 design went out of its way to prevent by sharing the mapper functions.

### Pitfall 2: `products.category` enum collision
Legacy `items.category` (`raw_material`/`packaging`/`product`/`supplies`/`service`) and target `products.category` (`food`/`service`/`retail`) are unrelated enums with only a coincidental shared literal (`'service'`). Per PROJECT.md, the raw-material-vs-finished-good distinction is explicitly deferred — do **not** attempt a literal value mapping between the two enums. Recommend `mapLegacyItemToProduct` write a single fixed target value (e.g. `'retail'`) for every migrated item, with the real legacy `category`/`product_type` preserved verbatim inside `attributes` (the JSON catch-all column exists precisely for this). Altering the `products.category` ENUM to add new values later requires care: the existing rollback (`DROP TYPE IF EXISTS enum_products_category`) in `20260712100000-create-commerce-foundation.cjs` shows MySQL ENUM changes are already a first-class, deliberate migration concern here — don't fold an ENUM alteration into this milestone.

### Pitfall 3: No natural key exists today for `products` or `inventory_movements`
Every existing entity type in `ENTITY_TARGET_CONFIG` has a real natural key backed by a DB unique constraint (`staff_accounts.email`, `terminal_identities.terminal_code`, `business_database_registry.database_name`, ...) **except** `location`, which the code's own comments flag as a documented limitation (`name`-only best-effort de-dup). Without Wave 0's proposed `UNIQUE(business_id, sku_code)` on `products` and `UNIQUE(business_id, reference_type, reference_id)` on `inventory_movements`, both new entity types would inherit `location`'s limitation — worse, for the append-only `inventory_movements` ledger, a crash between "target row inserted" and "`legacy_id_map` row recorded" (the documented "target-first interruption point" in `apply.js`'s own doc comment) would have **no natural-key fallback at all**, risking a duplicate historical ledger row on retry. Wave 0 closes this gap using columns (`reference_type`/`reference_id`) that already exist on the table — no new column needed, just a new index.

### Pitfall 4: `availments.source_reference` is already claimed by a different feature
Reusing `source_reference` for the sales-history migration without namespacing risks colliding with Phase 10's storefront-order idempotency guard (same column, same unique index, different meaning). Recommend either namespacing the value (`legacy_pos:<pos_transaction_id>`) if reusing the column, or treating `source_system` (new) + `source_reference` (existing) as a **pair** where `source_system = 'legacy_pos'` disambiguates the value space — this is an open design decision for the sales-history mapper plan, not something to resolve implicitly.

### Pitfall 5: Legacy `system_settings`-style single-row JSON pattern does not apply here
`legacySource.js`'s existing tenant read (`system_settings` → `pos_terminal_registry`) is a single-row-of-JSON pattern specific to terminal registry. `items`/`stock_movements`/`pos_transactions` are ordinary multi-row tables reached with plain `SELECT * FROM <table>` — don't over-generalize the `parseTerminalRegistrySetting()` JSON-parsing helper into the new read functions; it solves a problem the new tables don't have.

### Pitfall 6: Volume — `stock_movements` and `pos_transactions` are typically the largest legacy tables in any POS/IMS system
Unlike `users`/`tenant_locations` (small, bounded per tenant), stock-movement and transaction history can be orders of magnitude larger. The current checkpoint granularity is one checkpoint row per `(run_scope, legacy_tenant_id, entity_type)` — i.e., the **entire** tenant's inventory-movement history (or sales history) is one all-or-nothing batch (`applyTenantEntityBatch()` marks the checkpoint `completed` only after every entry in the batch is written). For a tenant with a very large history, this reintroduces the "correctness lever" the existing design accepted for small entity counts, but may need chunking (e.g., sub-batching by date range with per-chunk checkpoints) once real data volume is known — flag this for phase-specific research/discuss-phase rather than assuming the existing single-batch-per-tenant granularity scales.

## Open Questions to Resolve Before/During Phase Planning

1. **Is `pos_transaction_lines` (→ `availment_items`) in scope for the sales-history phase, or is only the transaction header (`pos_transactions` → `availments`) in scope?** PROJECT.md's target-features list names only `pos_transactions`→`availments`. If line items are out of scope, `availments` rows would exist with no corresponding `availment_items`, which is a real, but perhaps intentional, gap for "sales-history" (aggregate) vs "full checkout replay" — needs an explicit decision, since it changes whether Wave 2 has a hard FK dependency on Wave 1 at all.
2. **`item_location_stocks` (per-location legacy stock) is not named in PROJECT.md's mapper list.** It likely informs either `products.stock_count` (if `inventory_mode = 'basic_inventory'`) or an initial "opening balance" `inventory_movements` row — needs a mapper-design decision, not an architecture-layer one, but flagged here because it's the one satellite table with location-scoped semantics rather than pure item-attribute semantics.
3. **`product_embeddings` cardinality** (one row per product, or one row per product per embedding model/version) is undetermined from the legacy `ItemEmbedding.js` model alone — affects whether the recommended unique constraint is `(product_id)` or `(product_id, model_version)`.

## Sources

All findings are primary-source reads of this repository, not external documentation:
- `apps/dgfy-migration-runner/src/data/mappings.js`, `dryRun.js`, `apply.js`, `verifyData.js`, `legacySource.js`, `targetManifest.js`
- `apps/dgfy-migration-runner/src/metadata/bootstrap.js`, `dataState.js`
- `apps/dgfy-migration-runner/src/commands/data.js`
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`
- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs`
- `apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs`
- `apps/dgfy-migration-runner/src/migrations/schema/20260714104000-add-commerce-payment-session-audit-fields.cjs`
- `docs/database/dgfy-data-migration-map.md`
- `.planning/PROJECT.md`
- `backend/src/models/Item.js`, `ItemFolder.js`, `StockMovement.js`, `ItemEmbedding.js`, `PosTransaction.js`, `PosTransactionLine.js`, and the satellite `Item*.js`/`FnbItem*.js`/`ServiceItemDetail.js` models (read-only reference, per the project's zero-touch-on-`backend/` constraint — never edited)

---
*Architecture research for: DGFY v2.1 Legacy Data Migration — items/inventory/sales-history mapper integration*
*Researched: 2026-07-14*
