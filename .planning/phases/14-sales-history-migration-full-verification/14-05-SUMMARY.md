---
phase: 14-sales-history-migration-full-verification
plan: 05
subsystem: migration-runner
tags: [sales-history, migration-runner, apply, idempotency, jest]

requires:
  - phase: 14-sales-history-migration-full-verification
    plan: 04
    provides: "readLegacySalesSnapshot and dry-run sales dependency planning"
  - phase: 13-product-inventory-migration
    plan: 05
    provides: "Product-domain checkpoints and product ID map verification precedent"
provides:
  - "Sales apply checkpoint gate requiring product_folder, product, inventory_movement, and product_embedding completion"
  - "Dependency-ordered availment then availment_item persistence"
  - "Timestamp-preserving target inserts for mapper-supplied historical sales rows"
  - "Reason-aware current finding synchronization on every apply scan"
  - "Sales natural-key target-first recovery for availments and availment_items"
affects: [14-06, 14-07, 14-08, 14-09, dgfy-migration-runner]

tech-stack:
  added: []
  patterns:
    - "Apply-side sales pass resolves all target foreign keys from legacy_id_map immediately before mapper calls"
    - "Target insert defaults only fill timestamps absent from mapper payloads"
    - "Apply findings use syncDataQualityFindings instead of blanket resolve plus conditional append"

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataSalesApply.test.js
  modified:
    - apps/dgfy-migration-runner/src/data/apply.js
    - apps/dgfy-migration-runner/tests/dataApply.test.js

key-decisions:
  - "Sales apply can run in the same command after product-domain apply, but the sales boundary refuses to start unless all four Phase 13 product checkpoints are completed for the tenant."
  - "availment and availment_item retry recovery uses source_reference natural keys."
  - "Opened landlord, legacy tenant, and business target connections are creator-owned and closed in finally."

patterns-established:
  - "Sales apply tests use the same in-memory SQL harness style as existing apply tests, extended for syncDataQualityFindings null-safe finding queries."

requirements-completed: [SHM-01, SHM-02, SHM-03, SHM-04, VER-01]

coverage:
  - id: D1
    description: "Mapper-supplied historical sales timestamps survive inserts while legacy payloads without timestamps still receive defaults."
    requirement: SHM-01
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesApply.test.js#sales-history apply timestamp preservation"
        status: pass
    human_judgment: false
  - id: D2
    description: "Apply synchronizes current data-quality findings on every scan, including completed checkpoints and retries."
    requirement: VER-01
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesApply.test.js#sales-history apply current-state finding synchronization"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sales apply is product-checkpoint-gated, writes headers before lines, resolves parent/product IDs, preserves void status, recovers through source_reference natural keys, discovers new rows after completed checkpoints, and closes opened pools."
    requirement: SHM-02
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesApply.test.js#sales-history apply orchestration"
        status: pass
      - kind: other
        ref: "cd apps/dgfy-migration-runner && npm run check:architecture"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 05: Sales Apply Orchestration Summary

**Sales-history apply now persists legacy POS headers before lines with product-checkpoint gating, durable ID-map FK resolution, historical timestamps, truthful findings, retry recovery, and bounded connection cleanup.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-15T01:47:59Z
- **Completed:** 2026-07-15T01:56:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `dataSalesApply.test.js` with RED/GREEN coverage for timestamp preservation, completed-checkpoint finding sync, retry finding truth, product-domain prerequisite gating, header-before-line ordering, resolved parent/product IDs, normal and void sales payloads, sales natural-key recovery, new-row discovery after completed checkpoints, and success/failure connection closure.
- Updated `insertTargetRow()` so mapper-supplied `created_at`/`updated_at` values survive while older mapper payloads still receive default timestamps.
- Replaced apply-side blanket finding resolution plus checkpoint-conditioned recording with `syncDataQualityFindings()` on every scanned entry.
- Added `availment` and `availment_item` natural-key configs using `source_reference`.
- Wired `readLegacySalesSnapshot()` into `runApplyTransformations()`, added `assertSalesPrerequisiteCheckpoints()`, applied all headers before lines, and resolved branch/terminal/cashier/parent/product IDs from `legacy_id_map`.
- Wrapped apply-created landlord, legacy tenant, and business target connections in `finally` cleanup.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1 RED: Sales apply timestamp/finding sync coverage** - `018aceed` (`test`)
2. **Task 1 GREEN: Preserve timestamps and sync findings** - `6c90ac60` (`feat`)
3. **Task 2 RED: Sales apply orchestration coverage** - `2d424591` (`test`)
4. **Task 2 GREEN: Dependency-safe sales apply** - `2df03859` (`feat`)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/data/apply.js` - Preserves mapper timestamps, syncs findings, gates/writes sales history, resolves sales FKs, adds sales natural keys, and closes opened connections.
- `apps/dgfy-migration-runner/tests/dataSalesApply.test.js` - New sales apply TDD coverage.
- `apps/dgfy-migration-runner/tests/dataApply.test.js` - Updates the existing fake SQL engine so shared apply tests understand the `syncDataQualityFindings()` null-safe finding query.

## Decisions Made

- Kept apply-side sales orchestration inside the existing migration runner boundary; no new ADR or allowlist entry was required.
- Used `source_reference` as the natural key for both sales target tables to match Phase 10/14 schema precedent.
- Treated connection ownership narrowly: only connections opened inside `runApplyTransformations()` are closed there; caller-owned `coreSequelize` remains caller-managed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing apply test fake for syncDataQualityFindings**
- **Found during:** Task 2
- **Issue:** `tests/dataApply.test.js` failed after apply switched to `syncDataQualityFindings()` because its in-memory SQL fake did not implement the helper's null-safe `data_quality_findings` lookup.
- **Fix:** Added support for the `legacy_table <=> ?` finding query shape in the existing fake engine.
- **Files modified:** `apps/dgfy-migration-runner/tests/dataApply.test.js`
- **Verification:** `dataApply`, `dataProductApply`, `dataSalesApply`, and `dataState` suites passed together.
- **Committed in:** `2df03859`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** No scope creep; the change only keeps existing shared apply tests compatible with the new apply-side finding sync path.

## Issues Encountered

- Watchman emitted a recurring recrawl warning during Jest runs. Test execution was not affected.

## Known Stubs

None. Stub-pattern scan found only intentional test defaults, empty in-memory table initializers, and null checks.

## Threat Flags

None. The new surfaces are the planned mitigations for duplicate/retry writes, false-clean findings, wrong FK domain, and connection cleanup.

## User Setup Required

None - no external service configuration required.

## Verification

Passed:

```bash
cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataSalesApply.test.js tests/dataState.test.js
```

Passed:

```bash
cd apps/dgfy-migration-runner && npm run check:architecture
```

Additional shared apply regression passed:

```bash
cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataApply.test.js tests/dataProductApply.test.js tests/dataSalesApply.test.js tests/dataState.test.js
```

## Next Phase Readiness

Plan 06 can build sales verification on top of durable `legacy_id_map` rows for all six entity types. Apply now provides the expected target rows, source references, preserved timestamps, and truthful open/resolved finding state for verification to reconcile.

## Self-Check: PASSED

- Found summary file: `.planning/phases/14-sales-history-migration-full-verification/14-05-SUMMARY.md`
- Found created test file: `apps/dgfy-migration-runner/tests/dataSalesApply.test.js`
- Found modified apply file: `apps/dgfy-migration-runner/src/data/apply.js`
- Found modified shared apply test file: `apps/dgfy-migration-runner/tests/dataApply.test.js`
- Found task commits: `018aceed`, `6c90ac60`, `2d424591`, `2df03859`

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*
