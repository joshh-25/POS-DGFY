---
phase: 13-product-inventory-migration
plan: 04
subsystem: migration-runner
tags: [data-migration, dry-run, product-inventory, jest]
requires:
  - phase: 13-product-inventory-migration
    provides: product mappers, legacy product snapshot reader, product apply ordering
provides:
  - Product-domain dry-run plan entries in apply order
  - Product snapshot wiring for dry-run transformation runs
  - Unit coverage for ordering, retry reclassification, and finding persistence
affects: [phase-13-product-inventory-migration, phase-14-sales-history-migration]
tech-stack:
  added: []
  patterns: [pure mapper reuse, read-only dry-run planning, legacy_id_map retry reclassification]
key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataProductDryRun.test.js
  modified:
    - apps/dgfy-migration-runner/src/data/dryRun.js
key-decisions:
  - "Dry-run reuses the existing product-domain mappers instead of introducing dry-run-only transform logic."
  - "Product-domain dry-run entries follow apply ordering: product_folder, product, inventory_movement, opening-balance inventory_movement, product_embedding."
patterns-established:
  - "Product dry-run dependency IDs are resolved from legacy_id_map using the same pre-resolution pattern as staff assignments and terminal locations."
requirements-completed: [PIM-01, PIM-03]
coverage:
  - id: D1
    description: "Dry-run emits product_folder entries before products and products before movements/embeddings."
    requirement: PIM-01
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataProductDryRun.test.js#plans folders before products, products before movements/embeddings, and reclassifies mapped product-domain rows"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dry-run persists product-domain transfer-collapse findings before returning."
    requirement: PIM-03
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataProductDryRun.test.js#runDryRunTransformations reads product snapshots and persists product-domain findings before returning"
        status: pass
    human_judgment: false
duration: 4min
completed: 2026-07-14
status: complete
---

# Phase 13 Plan 04: Product Dry-Run Planning Summary

**Product-domain dry-run planning now mirrors apply order and reports transfer-collapse findings without opening target databases.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-14T13:45:43Z
- **Completed:** 2026-07-14T13:48:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added product dry-run coverage for folder-before-product ordering, product-before-movement/embedding ordering, transfer skip findings, and retry reclassification.
- Wired `runDryRunTransformations()` to read `readLegacyProductSnapshot()` per target and pass it into `buildDryRunPlan()`.
- Extended `buildDryRunPlan()` to emit `product_folder`, `product`, `inventory_movement`, opening-balance `inventory_movement`, and `product_embedding` entries using the existing pure product mappers.

## Task Commits

1. **RED: Product dry-run coverage** - `2b71faf9` (`test`)
2. **GREEN: Product dry-run implementation** - `d8a07e5c` (`feat`)

## Files Created/Modified

- `apps/dgfy-migration-runner/tests/dataProductDryRun.test.js` - Focused dry-run tests for product-domain ordering, reclassification, and finding persistence.
- `apps/dgfy-migration-runner/src/data/dryRun.js` - Product snapshot wiring and product-domain dry-run plan entries.

## Decisions Made

- Reused the product-domain mapper functions from `mappings.js` so dry-run and apply cannot drift.
- Kept BOM composition update handling apply-only; dry-run reports the parent product plan entry and does not emit a second composition mapper call.
- No architecture ADR update was needed because the change stays within the existing migration-runner read-only dry-run boundary defined by ADR 0029's v2.1 amendment.

## Verification

- `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataProductDryRun.test.js` - PASS
- `dryRun.js` still does not import or call target/business connection factories.
- Changed-file scan found no commit-blocker markers before commits.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The expected RED failure occurred before implementation, then the GREEN verification passed.

## Known Stubs

None.

## Threat Flags

None. The change adds read-only product snapshot consumption to dry-run and no target write path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Product dry-run now reports the same product-domain entity order that apply uses. Phase 13 can proceed to product verification/rehearsal work with dry-run/apply ordering aligned.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/13-product-inventory-migration/13-04-SUMMARY.md`.
- Task commits exist: `2b71faf9`, `d8a07e5c`.
- Required targeted Jest command passed.

---
*Phase: 13-product-inventory-migration*
*Completed: 2026-07-14*
