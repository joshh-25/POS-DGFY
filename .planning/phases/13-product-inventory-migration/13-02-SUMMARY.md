---
phase: 13-product-inventory-migration
plan: 02
subsystem: data-migration
tags: [migration-runner, legacy-source, products, inventory, jest]

requires:
  - phase: 13-product-inventory-migration
    provides: product and inventory mapper contracts from 13-01
provides:
  - readLegacyProductSnapshot raw SELECT reader for Phase 13 product-domain source data
  - unit coverage for stitched item satellite shape and query isolation contract
affects: [phase-13-apply, phase-13-dry-run, phase-13-verification]

tech-stack:
  added: []
  patterns:
    - literal raw SELECTs against already-scoped legacy tenant connection
    - in-memory item_id/product_id satellite stitching

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataProductSource.test.js
  modified:
    - apps/dgfy-migration-runner/src/data/legacySource.js

key-decisions:
  - "readLegacyProductSnapshot reads only literal Phase 13 source tables from the supplied tenant connection and never opens its own connection."
  - "1:1 item satellites are omitted when absent; 1:many aliases are attached as arrays for mapper compatibility."

patterns-established:
  - "Product-domain source reads stay in legacySource.js and stitch Sequelize association aliases in JS instead of importing legacy runtime models."

requirements-completed: [PIM-01, PIM-02, PIM-05, PIM-06]

coverage:
  - id: D1
    description: "readLegacyProductSnapshot reads items, product satellites, barcodes, BOM rows, folders, stock movements, location stocks, and embeddings with literal raw SELECTs."
    requirement: PIM-02
    verification:
      - kind: unit
        ref: "tests/dataProductSource.test.js#issues literal table SELECTs with no interpolated legacy values"
        status: pass
      - kind: unit
        ref: "tests/dataProductSource.test.js#reads product-domain tables and stitches item satellites by item_id"
        status: pass
    human_judgment: false
  - id: D2
    description: "The migration runner source reader remains isolated from legacy runtime imports and backend path markers."
    requirement: PIM-06
    verification:
      - kind: unit
        ref: "tests/dataProductSource.test.js#legacySource keeps the migration runner isolated from backend runtime modules"
        status: pass
      - kind: other
        ref: "grep -c \"backend/\" apps/dgfy-migration-runner/src/data/legacySource.js"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-14
status: complete
---

# Phase 13 Plan 02: Product Source Snapshot Reader Summary

**Product-domain legacy source reader with literal raw SELECTs and stitched item satellites for Phase 13 mappers.**

## Performance

- **Duration:** 4min
- **Started:** 2026-07-14T13:26:48Z
- **Completed:** 2026-07-14T13:29:51Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `readLegacyProductSnapshot(tenantSequelize)` to read the Phase 13 product-domain source tables from an already-scoped legacy tenant connection.
- Stitched item satellites by `item_id` using the mapper-facing aliases: `nutrition`, `allergens`, `physicalProperties`, `shelfLife`, `packaging`, `qualityControl`, `regulatoryCompliance`, `costBreakdown`, `barcodes`, `itemLocationStocks`, and `productCompositions`.
- Added focused Jest coverage for query order, literal table names, no SQL interpolation markers, backend isolation, and the stitched snapshot shape.

## Task Commits

1. **Task 1 RED: product source snapshot tests** - `bef483da` (test)
2. **Task 1 GREEN: product source snapshot reader** - `2cb98347` (feat)

## Files Created/Modified

- `apps/dgfy-migration-runner/tests/dataProductSource.test.js` - new unit tests for the product source reader contract and stitched snapshot shape.
- `apps/dgfy-migration-runner/src/data/legacySource.js` - new raw SELECT reader and in-memory satellite stitching helpers.

## Decisions Made

- Used one literal `SELECT * FROM <table>` per approved Phase 13 source table, matching the existing `readLegacyTenantSnapshot` pattern.
- Attached empty arrays for absent 1:many aliases (`allergens`, `barcodes`, `itemLocationStocks`, `productCompositions`) so downstream mapper calls can use array checks consistently.
- Omitted absent 1:1 aliases so the attributes fold can distinguish missing legacy satellite data from present empty objects.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The initial GREEN run still found an old comment containing a `backend/` path marker. Removed that comment marker so the plan's strict grep contract passes while preserving the existing behavior documentation.

## Auth Gates

None.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataProductSource.test.js` - PASS, 3 tests.
- `grep -n "export async function readLegacyProductSnapshot" apps/dgfy-migration-runner/src/data/legacySource.js` - PASS.
- `grep -c "backend/" apps/dgfy-migration-runner/src/data/legacySource.js` - PASS, 0.
- `grep -c '\${' apps/dgfy-migration-runner/src/data/legacySource.js` - PASS, 0.

## Next Phase Readiness

The reader now provides the stitched product snapshot shape expected by later Phase 13 dry-run/apply wiring. Plan 13-03 can consume `{ items, itemFolders, stockMovements, itemEmbeddings }` without importing legacy runtime models.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/13-product-inventory-migration/13-02-SUMMARY.md`
- Task commits exist: `bef483da`, `2cb98347`
- Scoped files verified: `apps/dgfy-migration-runner/src/data/legacySource.js`, `apps/dgfy-migration-runner/tests/dataProductSource.test.js`

---
*Phase: 13-product-inventory-migration*
*Completed: 2026-07-14*
