# Phase 13: Product & Inventory Migration - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Legacy `items`/`item_folders`/`stock_movements` (plus 8 satellite tables, `item_barcodes`, `product_composition`/BOM, and `item_embeddings`) migrate into the new `products`/`product_folders`/`inventory_movements`/`product_embeddings` schema, with full fidelity proven via dry-run/apply/verify evidence against a real tenant before Sales History migration (Phase 14) begins. Requirements: PIM-01 through PIM-06 (ROADMAP.md Phase 13).

This phase does NOT touch `pos_transactions`/`pos_transaction_lines` → `availments`/`availment_items` (Phase 14, blocked on this phase's `legacy_id_map` entries for `product_id` FK resolution) and does NOT add a location dimension to the new schema (explicitly ruled out below).

</domain>

<decisions>
## Implementation Decisions

### Movement-type mapping (8 legacy → 5 new, PIM-03)

Legacy `stock_movements.movement_type` has 8 values; new `inventory_movements.movement_type` has 5 (`restock`, `loss`, `adjustment`, `sale`, `booking`). The lookup table is now locked:

- **D-01:** `purchase_receipt` → `restock`
- **D-02:** `calculated_loss` → `loss`
- **D-03:** `adjustment` → `adjustment`
- **D-04:** `goods_issue` → `sale`
- **D-05:** `return` → `restock` (goods physically return to stock)
- **D-06:** `production_consumption` → `adjustment` (NOT `loss` — it's productive use, not shrinkage; the raw-material-vs-finished-good/manufacturing distinction is explicitly deferred for this migration, so no dedicated semantics are invented for it)
- **D-07:** `production_output` → `adjustment` (same rationale as D-06, symmetric treatment)
- **D-08:** `transfer` → **no `inventory_movements` row is inserted.** Log a `finding` (lossy-category-collapse, per PIM-03's own language) instead of fabricating a net-zero `adjustment` row. Rationale: the new schema has zero location dimension anywhere (confirmed: neither `products` nor `inventory_movements` has a `location_id`/`branch_id` column), so a transfer has no honest target representation — inserting a fake net-zero row would clutter the audit trail with a movement that means nothing in the new model. This is the single documented, reviewed 8→5 collapse table required by PIM-03's acceptance criteria.

### Legacy category → new category mapping

Legacy `items.category` is `ENUM(ingredient, product, packaging)` — an internal materials taxonomy. New `products.category` is `ENUM(food, service, retail)` — a customer-facing sellable-product taxonomy. PROJECT.md already decided all legacy categories migrate as generic sellable products (raw-material-vs-finished-good distinction deferred).

- **D-09:** All three legacy category values (`ingredient`, `product`, `packaging`) map to `retail`. Rationale: legacy items are physical stocked goods (`current_stock`, `unit_of_measure`, `cost_per_unit` all present) — this matches `retail` semantics far better than `service` (bookable, no stock) or `food` (carries its own compliance/nutrition connotations in the new schema that legacy `packaging`/`ingredient` items don't warrant). One flat rule, zero per-value ambiguity, easy to verify in the apply report.

### Multi-location stock collapse (`item_location_stocks` → opening-balance rows, PIM-05)

Legacy `item_location_stocks` is a real, populated per-`(item_id, location_id)` stock ledger (authoritative per-branch on-hand quantity, unique on that pair). The new schema has no location dimension at all.

- **D-10:** The per-location breakdown is **fully discarded after summing**. One `inventory_movements` opening-balance row is inserted per product, with `quantity` = the sum across all of that item's legacy `item_location_stocks` rows. Nothing preserves which location contributed what — no location identity is stashed in `reference_id`, `before_snapshot`/`after_snapshot`, or any other field. This matches the existing single-scalar `products.stock_count` design exactly and requires no schema/JSON workarounds. If a future location-aware inventory feature needs per-location history, it starts fresh from that feature's own migration/backfill, not from this phase's data.

### Claude's Discretion

- Exact `findings` reason-code string for the `transfer` collapse (D-08) and the `MAPPING_REASON_CODES` shape it uses — follow the existing `classifyMappingConflict()` / `MAPPING_REASON_CODES` pattern in `apps/dgfy-migration-runner/src/data/mappings.js`.
- Ordering/dependency mechanics for `product_composition` (BOM) `ingredient_id` resolution via `legacy_id_map` (already flagged as this phase's job in the Phase 12 fold-design doc) — implementation detail for research/planning, not a user preference.
- Exact opening-balance `inventory_movements` row's `reference_type`/`reference_id` values for D-10 — pick whatever is consistent with the existing dry-run/apply reporting conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & data-model design (Phase 12 outputs)
- `docs/database/legacy-product-attributes-folding-design.md` — the satellite-table-folding contract for `products.attributes` JSON (namespaced keys: `nutrition`, `physicalProperties`, `shelfLife`, `packaging`, `qualityControl`, `compliance`, `costBreakdown`, `allergens`, `barcodes`, `composition`); explicitly flags `item_location_stocks`'s target as "a separate, still-open Phase 13 planning decision" — resolved above as D-10.
- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` — base `products`, `inventory_movements`, `bookings` table definitions.
- `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs` — Phase 12's additive columns (`sku_code`, `description`, `unit_of_measure`, `cost_per_unit`, `vat_type`, `senior_pwd_discount_eligible`, `attributes`), `product_embeddings` table, and the `inventory_movements` natural-key unique index.
- `.planning/phases/12-scope-unblock-schema-extension/12-CONTEXT.md` and `12-RESEARCH.md` — full design rationale from the phase that built the target schema.

### Legacy source schema
- `backend/migrations/20240101000002-create-items.js` — base `items` table.
- `backend/migrations/20260202000002-create-item-folders.js` — `item_folders` (nested via `parent_id`; new `product_folders` is flat by design — folder-nesting collapse is an implementation detail for research to confirm against `product_folders`' actual schema).
- `backend/migrations/20240101000014-create-stock-movements.js`, `backend/src/models/StockMovement.js`, `backend/migrations/20260416000007-add-multi-location-inventory-ledger.cjs` — `stock_movements` full schema including the location columns being deliberately dropped per D-10.
- `backend/src/validators/stockMovementValidator.js`, `backend/src/services/stockMovementService.js` — canonical legacy `movement_type`/`reference_type` enum values used to build the D-01..D-08 lookup table.
- `backend/src/models/index.js` (lines ~242-260) — the 8 satellite-table associations to `items`.
- `backend/migrations/20260130000001-create-item-embedding.cjs`, `backend/src/models/ItemEmbedding.js` — `item_embeddings` schema (no model-name/dimensions column; TEXT-stored JSON float array).
- `backend/migrations/20260416000007-add-multi-location-inventory-ledger.cjs`, `backend/src/models/ItemLocationStock.js` — `item_location_stocks` schema (the table being collapsed per D-10).
- `backend/src/models/ItemBarcode.js`, `backend/src/models/ProductComposition.js` — the two satellite-adjacent tables (barcodes, BOM) already scoped into the attributes fold per PIM-02.

### Mapper pattern to follow (Phase 3 precedent)
- `apps/dgfy-migration-runner/src/data/mappings.js` — the pure-function mapper contract (`{operation, entity_type, target_table, target_database, target_payload, legacy_id_map_key, related_targets, findings}`), `classifyMappingConflict()`, `MAPPING_REASON_CODES`, and the `OUT_OF_SCOPE_LEGACY_TABLES` list (already documents `items`/`stock_movements`/`pos_transactions` becoming in-scope at Phase 13).
- `apps/dgfy-migration-runner/src/data/dryRun.js`, `apps/dgfy-migration-runner/src/data/apply.js` — dry-run/apply dual-mode wiring around the same mapper functions.
- `apps/dgfy-migration-runner/src/metadata/dataState.js` — `legacy_id_map` lookup-before-insert, per-`(run_scope, legacy_tenant_id, entity_type)` checkpointing, and `recordDataQualityFinding()` — the mechanisms PIM-04's idempotency requirement and D-08's `finding` both reuse.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Product & Inventory Migration" (PIM-01..PIM-06) — full acceptance criteria text.
- `.planning/ROADMAP.md` §"Phase 13: Product & Inventory Migration" — the 5 success criteria this phase must satisfy.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dgfy-migration-runner/src/data/mappings.js`'s existing mapper functions (account/business/tenant/membership/staff_account/location/terminal_identity) are the direct pattern template for the new `item_folder`→`product_folder`, `item`→`product`, `stock_movement`→`inventory_movement`, `item_embedding`→`product_embedding` mappers.
- `classifyMappingConflict()` / `MAPPING_REASON_CODES` — reuse directly for the `transfer`-collapse finding (D-08) and any other skip/conflict cases this phase's mappers surface.
- `legacy_id_map` (`dataState.js`) — reuse directly for `item_id`→`product.id` resolution needed by `product_composition.ingredient_id` and (in Phase 14) `pos_transaction_lines`' product FK.

### Established Patterns
- Mappers are pure functions with zero DB/SQL access; dry-run and apply both call the same mapper so logic can't drift between modes — this phase's new mappers must follow the same shape.
- Checkpointing is per-`(run_scope, legacy_tenant_id, entity_type)` — the new entity types (`product_folder`, `product`, `inventory_movement`, `product_embedding`) each need their own checkpoint rows, following the existing pattern exactly (no new checkpoint design needed).

### Integration Points
- `product_folders` must be migrated (and their `legacy_id_map` entries recorded) before any `product` mapper runs, since `products.folder_id` FKs to it (PIM-01's explicit ordering requirement, mirrored in ROADMAP.md Success Criterion 1).
- `product_composition.ingredient_id` resolution depends on the referenced ingredient item already having a `legacy_id_map` entry — may require either a two-pass apply or a deferred/retry mechanism if a composition references an item processed later in the same run (open implementation question for research/planning, not a user-preference gray area).

</code_context>

<specifics>
## Specific Ideas

No additional specific UI/behavior examples beyond the locked decisions above — this is a backend/data-migration phase with no user-facing surface.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Manufacturing/raw-material distinction, location-aware inventory, and embedding-model metadata tagging were all already deferred at the milestone level before this discussion started — see PROJECT.md "Out of Scope" and REQUIREMENTS.md v3 "Legacy Data Migration (v2.x)".)

### Reviewed Todos (not folded)
None — `todo.match-phase 13` returned zero matches.

</deferred>

---

*Phase: 13-Product & Inventory Migration*
*Context gathered: 2026-07-14*
