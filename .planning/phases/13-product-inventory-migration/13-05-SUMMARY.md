---
phase: 13-product-inventory-migration
plan: 05
subsystem: migration-verification
tags: [migration-runner, product-migration, inventory-migration, verification, jest]

requires:
  - phase: 13-product-inventory-migration
    provides: "Product/inventory mappers, product snapshot reader, and dry-run/apply product-domain wiring from plans 13-01 through 13-04"
provides:
  - "Expected-lossy product migration findings are visible but non-blocking"
  - "Product-domain target counts reconcile against mapper-aware expected counts"
  - "Inventory movement SUM(quantity) by movement_type and product category distribution verification"
  - "One product_embeddings row per product verification"
  - "products.stock_count to legacy_opening_balance inventory movement verification"
affects: [phase-13-product-inventory-migration, phase-14-sales-history-migration, dgfy-migration-runner]

tech-stack:
  added: []
  patterns:
    - "Verifier aggregate checks use literal SQL with no interpolated runtime values"
    - "Expected-lossy findings are partitioned from blocking findings while remaining visible in the audit trail"

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataProductVerify.test.js
  modified:
    - apps/dgfy-migration-runner/src/data/verifyData.js

key-decisions:
  - "Only LOSSY_CATEGORY_COLLAPSE and FOLDER_NESTING_FLATTENED are non-blocking expected-lossy findings."
  - "stock_count reconciliation uses only inventory_movements rows with reference_type='legacy_opening_balance', not all adjustment rows."

patterns-established:
  - "Product verification sections are nested under product_reconciliation so Phase 14 can add availment-side reconciliation without changing existing count/check shapes."
  - "Open findings now report blocking_count and expected_lossy_count separately."

requirements-completed: [PIM-03, PIM-04, PIM-05]

coverage:
  - id: D1
    description: "Expected-lossy transfer-collapse and folder-flatten findings no longer block data_migration_ok while unresolved ingredients and ordinary conflicts still block."
    requirement: PIM-03
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataProductVerify.test.js#product expected-lossy open findings"
        status: pass
    human_judgment: false
  - id: D2
    description: "Product-domain row counts reconcile for product_folders, products, inventory_movements, and product_embeddings net of intentional skips."
    requirement: PIM-04
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataProductVerify.test.js#reconciles product counts net of a transfer skip and reports movement/category distributions"
        status: pass
    human_judgment: false
  - id: D3
    description: "Verifier reports movement SUM(quantity) by movement_type, product category distribution, one embedding per product, and stock_count equals legacy_opening_balance sum."
    requirement: PIM-05
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataProductVerify.test.js#product-domain target verification"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-07-14
status: complete
---

# Phase 13 Plan 05: Product Verification Reconciliation Summary

**Product migration verification now reconciles product-domain counts, aggregate inventory totals, embedding cardinality, and opening-balance stock while keeping expected lossy findings audit-visible but non-blocking.**

## Performance

- **Duration:** 5min
- **Started:** 2026-07-14T13:50:35Z
- **Completed:** 2026-07-14T13:54:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `EXPECTED_LOSSY_REASON_CODES` in `verifyData.js`, built from `MAPPING_REASON_CODES.LOSSY_CATEGORY_COLLAPSE` and `MAPPING_REASON_CODES.FOLDER_NESTING_FLATTENED`.
- Extended open-finding verification to report blocking findings and expected-lossy findings separately.
- Extended target verification to read product-domain source and target rows for `product_folders`, `products`, `inventory_movements`, and `product_embeddings`.
- Added product reconciliation for movement-type quantity totals, product category distribution, one embedding per product, and stock-count-to-opening-balance parity.
- Added unit coverage proving transfer skips do not cause count mismatches, unresolved ingredients still block, duplicate embeddings fail, stock mismatches fail, and extra non-opening adjustment rows do not inflate stock reconciliation.

## Task Commits

Each task was committed atomically:

1. **RED gate: product verification tests** - `bb046b15` (`test`)
2. **Task 1: Expected-lossy finding exclusion** - `a8fc8712` (`feat`)
3. **Task 2: Product-domain counts and sum-by-type reconciliation** - `00314dce` (`feat`)

## Files Created/Modified

- `apps/dgfy-migration-runner/tests/dataProductVerify.test.js` - New product verification tests for expected-lossy findings, product counts, aggregates, embedding coverage, and opening-balance stock parity.
- `apps/dgfy-migration-runner/src/data/verifyData.js` - Product-domain verifier implementation and expected-lossy finding partitioning.

## Decisions Made

- Used a narrow reason-code set for expected-lossy findings to avoid masking real corruption: only transfer-collapse and folder-flattening are non-blocking.
- Kept `UNRESOLVED_INGREDIENT` and unrelated conflicts blocking because they represent unresolved mapping gaps.
- Used a literal aggregate query with `WHERE reference_type = 'legacy_opening_balance'` for stock reconciliation so D-03/D-06/D-07 adjustment movements cannot cause false stock parity.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- `apps/dgfy-migration-runner/tests/dataProductVerify.test.js` did not exist at plan start; it was created during the RED TDD gate as planned.
- The first RED fixture omitted the zero-quantity opening-balance row for the second product. During GREEN, the fixture was corrected to match the mapper contract that emits one opening-balance movement for products with zero stock.

## Known Stubs

None. The stub-pattern scan only found existing JavaScript default parameters and empty accumulator initializers, not UI-facing or unfinished implementation stubs.

## Threat Flags

None. The new target DB reads and aggregate checks are the surfaces already covered by the plan threat model; all SQL is literal in-code with no interpolated runtime values.

## Verification

Passed:

```bash
cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataProductVerify.test.js
```

Additional regression check passed:

```bash
cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataVerify.test.js tests/dataProductVerify.test.js
```

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 14 can bolt sales-history or availment-side reconciliation onto the product verification structure without weakening product-domain gates. The product verifier now confirms product IDs, opening-balance inventory rows, and embeddings are coherent before sales-history migration consumes migrated products.

## Self-Check: PASSED

- Found summary file: `.planning/phases/13-product-inventory-migration/13-05-SUMMARY.md`
- Found created test file: `apps/dgfy-migration-runner/tests/dataProductVerify.test.js`
- Found modified verifier file: `apps/dgfy-migration-runner/src/data/verifyData.js`
- Found task commits: `bb046b15`, `a8fc8712`, `00314dce`

---
*Phase: 13-product-inventory-migration*
*Completed: 2026-07-14*
