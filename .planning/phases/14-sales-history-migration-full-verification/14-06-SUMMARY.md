---
phase: 14-sales-history-migration-full-verification
plan: 06
subsystem: migration-verification
tags: [sales-history, migration-runner, verification, decimal, jest]

requires:
  - phase: 14-sales-history-migration-full-verification
    plan: 05
    provides: "Sales apply writes availments and availment_items with source_reference natural keys and truthful findings"
  - phase: 13-product-inventory-migration
    plan: 05
    provides: "Product-domain verification structure and product ID/FK reconciliation"
provides:
  - "Exact BigInt DECIMAL(14,4) helper for sales monetary verification"
  - "Sales reconciliation for availment counts, status/source totals, provenance, ID-map coverage, relationships, and void fidelity"
  - "Six-entity data verification verdict across product_folder, product, inventory_movement, product_embedding, availment, and availment_item"
affects: [14-07, 14-08, 14-09, 14-10, 14-11, dgfy-migration-runner]

tech-stack:
  added: []
  patterns:
    - "Money verification parses fixed-scale DECIMAL strings into BigInt units; it never uses Number() for sales totals."
    - "Header attribution findings are visible but non-blocking through an exact sales attribution reason-code allowlist."
    - "Sales aggregate SQL uses sales-specific header_count aliases to avoid colliding with product count summaries."

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataSalesVerify.test.js
    - .planning/phases/14-sales-history-migration-full-verification/14-06-SUMMARY.md
  modified:
    - apps/dgfy-migration-runner/src/data/verifyData.js

key-decisions:
  - "Only sale_location_not_mapped, sale_terminal_not_mapped, and sale_cashier_not_mapped are non-blocking sales attribution findings."
  - "Unsupported sale status, missing parent availment maps, and missing product maps remain blocking verification findings."
  - "Sales status totals compare source and target total_amount at four decimal places using BigInt units."

patterns-established:
  - "Sales verification hangs off product verification as sales_reconciliation, preserving existing product_reconciliation and staff_auth sections."
  - "Per-target data_counts now includes availments and availment_items alongside existing staff/location/product entities."

requirements-completed: [SHM-03, SHM-04, VER-01, VER-02]

coverage:
  - id: D1
    description: "Exact DECIMAL(14,4) parser rejects malformed or over-scale money input and returns BigInt units for valid positive and negative totals."
    requirement: VER-02
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesVerify.test.js#decimal4ToUnits"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sales reconciliation detects count, exact total, mapped status, provenance, ID-map coverage, parent/product FK, and void-status mismatches."
    requirement: VER-02
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesVerify.test.js#sales verification orchestration"
        status: pass
    human_judgment: false
  - id: D3
    description: "Six migration entity types contribute to data_migration.ok while header attribution findings stay visible and non-blocking."
    requirement: VER-01
    verification:
      - kind: unit
        ref: "cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataSalesVerify.test.js tests/dataProductVerify.test.js tests/dataVerify.test.js"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 06: Sales Verification Reconciliation Summary

**Sales verification now proves exact DECIMAL(14,4) monetary parity, provenance, relationships, ID-map coverage, void fidelity, and a six-entity migration verdict.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-15T02:01:53Z
- **Completed:** 2026-07-15T02:08:45Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Added `decimal4ToUnits()` to parse canonical DECIMAL(14,4) strings into exact BigInt units, rejecting malformed or over-scale input.
- Added `SALES_ATTRIBUTION_REASON_CODES` with exactly three non-blocking header attribution codes: location, terminal, and cashier.
- Added sales status/source-system total reconciliation for migrated legacy availments using fixed-scale units instead of binary floating point.
- Added `sales_reconciliation` with line counts, map completeness, provenance, parent/product relationship checks, and void fidelity.
- Folded `availments` and `availment_items` into the target `data_counts` verdict so the verifier reports all six migration entity types.
- Added `dataSalesVerify.test.js` covering exact money parsing, mismatch failures, attribution policy, duplicate finding behavior, and successful six-entity verification.

## Task Commits

Each TDD task was committed atomically:

1. **RED gate: sales verification coverage** - `7aabcd04` (`test`)
2. **GREEN: exact sales reconciliation implementation** - `6c1e7115` (`feat`)

## Files Created/Modified

- `apps/dgfy-migration-runner/tests/dataSalesVerify.test.js` - New sales verification tests for exact decimal parsing, counts, totals, status mapping, provenance, FK relationships, map coverage, void fidelity, and non-blocking header attribution findings.
- `apps/dgfy-migration-runner/src/data/verifyData.js` - Adds BigInt sales money parsing, sales attribution routing, sales reconciliation, and six-entity verdict folding.
- `.planning/phases/14-sales-history-migration-full-verification/14-06-SUMMARY.md` - Captures this plan result.

## Decisions Made

- Used BigInt units for sales monetary verification so DECIMAL(14,4) totals compare exactly without `Number()` coercion.
- Kept sales attribution policy narrow: only location, terminal, and cashier attribution gaps are non-blocking because raw evidence is preserved on migrated headers.
- Kept unsupported statuses and missing parent/product mappings blocking because those represent unmigrated or invalid target records.
- Used `header_count` as the sales aggregate alias so sales SQL cannot be mistaken for product category count summaries in existing verifier fakes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided generic aggregate alias collision**
- **Found during:** Task 1 required regression verification
- **Issue:** The first sales aggregate used a generic `COUNT(*) AS count` alias, which collided with an existing product-verifier fake query branch and made product regression tests fail for no-sales fixtures.
- **Fix:** Changed sales aggregate SQL to use the sales-specific `header_count` alias and taught `summarizeSalesStatusTotals()` to read either `header_count` or `count`.
- **Files modified:** `apps/dgfy-migration-runner/src/data/verifyData.js`
- **Verification:** The required sales/product/baseline verification command passed after the fix.
- **Committed in:** `6c1e7115`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** No scope creep; the fix keeps the sales verifier compatible with existing product verification fixtures and makes the aggregate shape less ambiguous.

## Issues Encountered

- Watchman emitted its recurring recrawl warning during Jest runs. Test execution was not affected.

## Known Stubs

None. Stub-pattern scan found only intentional default parameters, empty accumulator initializers, and null handling in verifier/test helpers.

## Threat Flags

None. The new DB read/aggregate surfaces are the planned verification mitigations for T-14-06-01 through T-14-06-04.

## Verification

RED gate failed as expected before implementation:

```bash
cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataSalesVerify.test.js
```

Post-implementation required verification passed:

```bash
cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataSalesVerify.test.js tests/dataProductVerify.test.js tests/dataVerify.test.js
```

Result: 3 suites passed, 59 tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 07 can build on a verifier that now fails on sales count, exact total, status, provenance, parent/product relationship, ID-map, and void-fidelity drift while preserving the non-blocking attribution policy required for legacy location/terminal/cashier gaps.

## Self-Check: PASSED

- Found summary file: `.planning/phases/14-sales-history-migration-full-verification/14-06-SUMMARY.md`
- Found created test file: `apps/dgfy-migration-runner/tests/dataSalesVerify.test.js`
- Found modified verifier file: `apps/dgfy-migration-runner/src/data/verifyData.js`
- Found task commits: `7aabcd04`, `6c1e7115`
- Required validation command passed after final source commit.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*
