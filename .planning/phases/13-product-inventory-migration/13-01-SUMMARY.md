---
phase: 13-product-inventory-migration
plan: 01
subsystem: data-migration
tags: [migration-runner, products, inventory, mappers, jest]

requires:
  - phase: 12-scope-unblock-schema-extension
    provides: products attributes columns, product_embeddings table, inventory_movements natural key
provides:
  - Phase 13 pure product and inventory mapper functions
  - Reviewed stock movement type remap decision document
  - item_location_stocks migration scope unblock
affects: [phase-13-product-inventory-migration, phase-14-sales-history-migration]

tech-stack:
  added: []
  patterns:
    - Pure mapper contract in apps/dgfy-migration-runner/src/data/mappings.js
    - TDD mapper tests using Jest ESM runner

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataProductMappings.test.js
    - apps/dgfy-migration-runner/tests/fixtures/phase13/legacyProductRecords.js
    - docs/database/legacy-stock-movement-type-remap.md
  modified:
    - apps/dgfy-migration-runner/src/data/mappings.js
    - apps/dgfy-migration-runner/tests/dataMappings.test.js

key-decisions:
  - "Legacy item categories map unconditionally to products.category='retail' per D-09."
  - "Legacy stock movement transfer rows emit LOSSY_CATEGORY_COLLAPSE findings and insert no inventory_movements row per D-08."
  - "products.inventory_mode='basic_inventory' is used because the authoritative schema uses inventory_mode, not the plan text's product_type typo."

patterns-established:
  - "computeOpeningBalanceQuantity is the single pure helper for products.stock_count and legacy_opening_balance quantity."
  - "inventory_movements migration payloads synthesize reference_type/reference_id from legacy primary keys, never nullable legacy reference fields."

requirements-completed: [PIM-01, PIM-02, PIM-03, PIM-04, PIM-05, PIM-06]

coverage:
  - id: D1
    description: "Pure mappers for product folders, products, stock movements, opening balances, and product embeddings"
    requirement: PIM-01
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataProductMappings.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reviewed 8-to-5 stock movement remap decision record"
    requirement: PIM-03
    verification:
      - kind: other
        ref: "docs/database/legacy-stock-movement-type-remap.md"
        status: pass
    human_judgment: false
  - id: D3
    description: "item_location_stocks removed from migration exclusion list while pos_transaction_lines remains deferred"
    requirement: PIM-05
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataMappings.test.js"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-14
status: complete
---

# Phase 13 Plan 01: Product Mapper Foundation Summary

**Pure Phase 13 product and inventory mappers with locked category, stock, movement, opening-balance, and embedding transform rules.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-14T13:14:41Z
- **Completed:** 2026-07-14T13:22:02Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added five pure mapper functions: `mapItemFolderToProductFolder`, `mapItemToProduct`, `mapStockMovementToInventoryMovement`, `mapItemLocationStocksToOpeningBalance`, and `mapItemEmbeddingToProductEmbedding`.
- Added `LOSSY_CATEGORY_COLLAPSE`, `FOLDER_NESTING_FLATTENED`, `UNRESOLVED_INGREDIENT`, frozen `MOVEMENT_TYPE_MAP`, and shared `computeOpeningBalanceQuantity`.
- Added Phase 13 fixtures/tests proving flat `retail` category mapping, attributes folding, 8-to-5 movement remap, deterministic natural keys, opening-balance synthesis, and byte-identical embedding copy.
- Removed `item_location_stocks` from `OUT_OF_SCOPE_LEGACY_TABLES` and committed the reviewed movement-type remap decision doc.

## Task Commits

1. **Task 1 RED: Product mapper tests** - `c70bee5c` (test)
2. **Task 1 GREEN: Product folder and item mappers** - `dc4281ea` (feat)
3. **Task 2 RED: Inventory mapper tests** - `ef0469ab` (test)
4. **Task 2 GREEN: Movement/opening-balance/embedding mappers** - `b4439b2b` (feat)
5. **Task 3: Scope unblock and movement remap doc** - `5b55f621` (docs)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/data/mappings.js` - Phase 13 mapper functions, reason codes, movement map, opening-balance helper, and exclusion-list update.
- `apps/dgfy-migration-runner/tests/dataProductMappings.test.js` - Focused Phase 13 mapper unit coverage.
- `apps/dgfy-migration-runner/tests/fixtures/phase13/legacyProductRecords.js` - Product/inventory legacy fixtures.
- `apps/dgfy-migration-runner/tests/dataMappings.test.js` - Updated obsolete exclusion assertion after products/stock movements became in scope.
- `docs/database/legacy-stock-movement-type-remap.md` - PIM-03 decision record for all 8 legacy movement types.

## Decisions Made

- Used `inventory_mode: 'basic_inventory'` in product payloads because the authoritative schema and DGFY API model expose `inventory_mode`, not `product_type`.
- Kept BOM `composition` as raw legacy lines in `attributes.composition`; apply remains responsible for resolving ingredient IDs through `legacy_id_map`.
- Opening-balance skip with no location rows and null `current_stock` emits no finding because no row is expected and `products.stock_count` is also null.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected product inventory field name**
- **Found during:** Task 1
- **Issue:** The plan text referenced `products.product_type`, but the authoritative migration and API model use `inventory_mode`.
- **Fix:** Mapper emits `inventory_mode: 'basic_inventory'` so payloads match the target schema.
- **Files modified:** `apps/dgfy-migration-runner/src/data/mappings.js`, `apps/dgfy-migration-runner/tests/dataProductMappings.test.js`
- **Verification:** `tests/dataProductMappings.test.js` asserts the payload field; targeted Jest passed.
- **Committed in:** `dc4281ea`

**2. [Rule 1 - Bug] Updated obsolete Phase 03 exclusion assertion**
- **Found during:** Task 3
- **Issue:** Existing `dataMappings.test.js` asserted no Product or StockMovement mapper exports could exist, which became false by design in Phase 13.
- **Fix:** Narrowed the exclusion assertion to still-deferred POS line, fiscal, discount, and checkout domains; added `item_location_stocks` to the in-scope table proof.
- **Files modified:** `apps/dgfy-migration-runner/tests/dataMappings.test.js`
- **Verification:** `tests/dataMappings.test.js` and `tests/dataProductMappings.test.js` both passed together.
- **Committed in:** `5b55f621`

**Total deviations:** 2 auto-fixed (Rule 1)
**Impact on plan:** No scope creep; both fixes were required to match authoritative schema/current phase scope.

## Issues Encountered

None beyond the documented auto-fixed deviations.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None - changes add pure object mappers and documentation only; no new endpoint, auth path, file access pattern, schema, or SQL construction was introduced.

## Known Stubs

None.

## Verification

- `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataProductMappings.test.js` - PASS, 18/18 tests.
- `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataMappings.test.js tests/dataProductMappings.test.js` - PASS, 60/60 tests.
- Mapper export grep found all five required functions.
- Purity check found no `import` or `require` in `mappings.js`.
- Scope check confirmed `item_location_stocks` in scope and `pos_transaction_lines` still out of scope.

## Next Phase Readiness

Plan 13-02 can wire the source reader/apply/dry-run layers against these mapper contracts. The mapper tests now provide regression coverage for the Phase 13 transform rules downstream plans must preserve.

## Self-Check: PASSED

- Summary file exists.
- Created/modified key files exist.
- Task commits exist in git history.
- Required verification command passed.

---
*Phase: 13-product-inventory-migration*
*Completed: 2026-07-14*
