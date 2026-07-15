---
phase: 13-product-inventory-migration
plan: 03
subsystem: data-migration
tags: [migration-runner, products, inventory, bom, idempotency, jest]

requires:
  - phase: 13-product-inventory-migration
    provides: product mappers and product snapshot reader from plans 13-01 and 13-02
provides:
  - Checkpointed product-domain apply pipeline for product folders, products, inventory movements, opening balances, and product embeddings
  - Two-pass BOM attribute update using resolved migrated product ids
  - Product apply integration coverage for dependency order, FK resolution, retry idempotency, and parameterized BOM updates
affects: [phase-13, phase-14-sales-history-migration, migration-runner]

tech-stack:
  added: []
  patterns:
    - Existing checkpointed apply pipeline via legacy_id_map, applyBatchAndRecord, and writeMappedTargetRow
    - Two-pass product update after product pass-1 inserts
    - Parameterized Sequelize query replacements for dynamic JSON updates

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataProductApply.test.js
  modified:
    - apps/dgfy-migration-runner/src/data/apply.js

key-decisions:
  - "Product rows rely on legacy_id_map for idempotency because products.id is auto-increment and sku_code is non-unique."
  - "BOM composition is resolved in apply.js pass 2 because ingredient lookup requires durable legacy_id_map state."
  - "Opening-balance rows and products.stock_count share the mapper-computed stock quantity; apply.js does not recompute stock_count."

patterns-established:
  - "Product-domain apply order: product_folder, product insert, product BOM update, stock movement inventory_movement, opening-balance inventory_movement, product_embedding."
  - "BOM attributes are merged and updated with UPDATE products SET attributes = ? using replacements."

requirements-completed: [PIM-01, PIM-02, PIM-04, PIM-05, PIM-06]

coverage:
  - id: D1
    description: "Product-domain apply writes product folders, products, inventory movements, opening balances, and product embeddings in dependency order."
    requirement: PIM-01
    verification:
      - kind: integration
        ref: "apps/dgfy-migration-runner/tests/dataProductApply.test.js#product-domain apply pipeline"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two-pass BOM update resolves sibling ingredient products through legacy_id_map, binds JSON via replacements, and records unresolved ingredients as orphan findings."
    requirement: PIM-02
    verification:
      - kind: integration
        ref: "apps/dgfy-migration-runner/tests/dataProductApply.test.js#BOM attributes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Retry apply inserts zero duplicate inventory movements and rewrites byte-identical composition attributes."
    requirement: PIM-04
    verification:
      - kind: integration
        ref: "apps/dgfy-migration-runner/tests/dataProductApply.test.js#re-running product apply"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-14
status: complete
---

# Phase 13 Plan 03: Product Apply Pipeline Summary

**Checkpointed product and inventory apply wiring with two-pass BOM resolution, legacy_id_map FK resolution, and retry-safe inventory movements.**

## Performance

- **Duration:** 4min
- **Started:** 2026-07-14T13:37:53Z
- **Completed:** 2026-07-14T13:41:38Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Wired `runApplyTransformations()` to read the Phase 13 product snapshot and apply product folders, products, stock movements, opening balances, and embeddings through the existing checkpointed apply machinery.
- Added the first product-domain non-insert write path: two-pass BOM composition resolution followed by a parameterized `UPDATE products SET attributes = ?`.
- Added integration tests proving fixed ordering, legacy_id_map FK resolution, transfer skip behavior, opening-balance stock synchronization, product embedding writes, unresolved ingredient findings, and retry idempotency.

## Task Commits

1. **Task 1/2 RED: Product apply integration tests** - `58fd04b6` (test)
2. **Task 1/2 GREEN: Product apply pipeline and BOM update** - `41742e91` (feat)

_Note: The two TDD task behaviors share one integration surface, so the RED test commit covers both task acceptance sets and the GREEN commit implements both apply phases in the same touched module._

## Files Created/Modified

- `apps/dgfy-migration-runner/tests/dataProductApply.test.js` - New in-memory integration test for product-domain apply ordering, FK resolution, BOM update binding, orphan findings, and retry idempotency.
- `apps/dgfy-migration-runner/src/data/apply.js` - Added product-domain entity config, product snapshot reads, product apply batches, legacy_id_map FK resolution, and two-pass BOM updates.
- `.planning/phases/13-product-inventory-migration/13-03-SUMMARY.md` - Plan execution summary.

## Decisions Made

- Product idempotency remains legacy_id_map-driven because the target `products` table has no reliable natural key.
- BOM resolution belongs in apply orchestration, not pure mappers, because it depends on migrated sibling item id lookups.
- `products.stock_count` is passed through from the mapper-computed value and stays aligned with the opening-balance row by construction.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- Watchman emitted a recrawl warning during Jest runs. It did not affect test results.

## Known Stubs

None.

## Threat Flags

None beyond the plan threat model. The new dynamic update path binds JSON through Sequelize replacements and is covered by an integration assertion.

## User Setup Required

None - no external service configuration required.

## Verification

- `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataProductApply.test.js` - PASS
- `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataApply.test.js` - PASS

## Next Phase Readiness

Plan 13-04 can consume durable `legacy_id_map` rows for migrated products and inventory movements. Phase 14 remains dependent on this product id map for sales-history product FK resolution.

## Self-Check: PASSED

- Verified `apps/dgfy-migration-runner/src/data/apply.js`, `apps/dgfy-migration-runner/tests/dataProductApply.test.js`, and this SUMMARY file exist.
- Verified commits `58fd04b6` and `41742e91` exist in git history.
- Re-ran the required targeted Jest command successfully.

---
*Phase: 13-product-inventory-migration*
*Completed: 2026-07-14*
