---
phase: 12-scope-unblock-schema-extension
plan: 01
subsystem: database
tags: [migration-runner, scope-gate, adr, docs-lint]

# Dependency graph
requires:
  - phase: 03-old-to-new-migration-proof
    provides: OUT_OF_SCOPE_LEGACY_TABLES scope gate and mappings.js mapper pattern that this plan edits
provides:
  - isInScopeLegacyTable('items') / ('stock_movements') / ('pos_transactions') now return true
  - ADR 0029 dated v2.1 amendment recording items/stock_movements -> Phase 13, pos_transactions -> Phase 14 migration
  - migration-map §10 amended in lockstep with mappings.js
affects: [13-product-inventory-migration, 14-sales-history-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ADR amendment via dated ## Amendment section + inline superseded-by pointers, never rewriting original decision history"

key-files:
  created: []
  modified:
    - apps/dgfy-migration-runner/src/data/mappings.js
    - docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md
    - docs/database/dgfy-data-migration-map.md

key-decisions:
  - "Removed exactly 3 entries ('items', 'stock_movements', 'pos_transactions') from OUT_OF_SCOPE_LEGACY_TABLES; left 'pos_transaction_lines' gated for Phase 14/SHM-02, per plan instruction and functional verification"
  - "Did not touch rejectedTables in schema contracts — orthogonal target-side guard, confirmed byte-identical via git diff against pre-plan commit"
  - "ADR 0029 amended via dated ## Amendment section + inline pointers on Compatibility Decisions #1/#3 and Rollout Policy #3, preserving status: accepted and decision history rather than rewriting it"

patterns-established:
  - "ADR amendment pattern: dated '## Amendment (milestone, date)' section at end of file + short inline 'superseded by' pointers at the specific passages being updated, keeping status/history intact"

requirements-completed: [LDM-01]

coverage:
  - id: D1
    description: "isInScopeLegacyTable('items'), ('stock_movements'), ('pos_transactions') all return true; ('pos_transaction_lines') and ('item_folders') unchanged"
    requirement: "LDM-01"
    verification:
      - kind: unit
        ref: "node --input-type=module scope-gate assertion (Task 1 <verify> block)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ADR 0029 and migration-map §10 amended in lockstep with mappings.js; npm run lint:docs passes; pos_transaction_lines/SKUs/categories/FIFO batches retained as exclusions"
    requirement: "LDM-01"
    verification:
      - kind: other
        ref: "npm run lint:docs"
        status: pass
      - kind: other
        ref: "grep -n pos_transaction_lines docs/database/dgfy-data-migration-map.md (retained-exclusion bullet)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-07-14
status: complete
---

# Phase 12 Plan 01: Scope Gate Unblock + ADR/Migration-Map Amendment Summary

**Removed items/stock_movements/pos_transactions from the migration-runner's out-of-scope array and amended ADR 0029 + migration-map §10 in lockstep, unblocking every future Phase 13/14 mapper.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-14T09:42:00Z
- **Completed:** 2026-07-14T09:56:07Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- `OUT_OF_SCOPE_LEGACY_TABLES` in `mappings.js` no longer gates `items`, `stock_movements`, or `pos_transactions`; `isInScopeLegacyTable()` now returns `true` for all three, functionally verified via a Node ESM assertion
- `pos_transaction_lines` remains gated (Phase 14/SHM-02 scope), `item_folders` unaffected (was never in the array), `rejectedTables` confirmed byte-identical to the pre-plan commit
- ADR 0029 gained a dated `## Amendment (v2.1 Legacy Data Migration, 2026-07)` section plus inline "superseded by" pointers at Compatibility Decisions #1/#3 and Rollout Policy #3, `status: accepted` preserved, `last_reviewed` bumped to 2026-07-14
- `docs/database/dgfy-data-migration-map.md` §10 exclusion bullets amended in lockstep — `items`/`stock_movements`/`pos_transactions` moved out, `pos_transaction_lines`/SKUs/categories/FIFO batches retained, new v2.1-amendment note added
- `npm run lint:docs` passes (21 governed docs validated)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove the three unblocked legacy tables from the scope gate** - `a0953237` (feat)
2. **Task 2: Amend ADR 0029 prose and migration-map §10 in lockstep** - `9bf55c18` (docs)

_Plan metadata commit is made by the wave orchestrator after all worktree agents in this wave complete (per parallel-execution instructions)._

## Files Created/Modified
- `apps/dgfy-migration-runner/src/data/mappings.js` - Removed `'items'`, `'stock_movements'`, `'pos_transactions'` from `OUT_OF_SCOPE_LEGACY_TABLES`; added a one-line comment documenting the v2.1 unblock and that `pos_transaction_lines` stays gated
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` - Added dated `## Amendment (v2.1 Legacy Data Migration, 2026-07)` section; added inline superseded-by pointers at Compatibility Decisions #1/#3 and Rollout Policy #3; bumped `last_reviewed`
- `docs/database/dgfy-data-migration-map.md` - Amended §10 "Explicit Exclusions (ADR 0029)" bullets to remove `items`/`stock_movements`/`pos_transactions`, added a v2.1-amendment note

## Decisions Made
- Followed the plan's exact 3-entry removal instruction rather than inferring scope from other context (e.g., left `products`, a distinct legacy table name in the same array, untouched — it was never in scope for this plan)
- Preserved ADR decision history by amending rather than rewriting Compatibility Decisions #1/#3 and Rollout Policy #3 — added short inline pointers instead of deleting/rewording the original prose, consistent with "amend, do not delete" guidance in the plan

## Deviations from Plan

None - plan executed exactly as written. Both tasks' automated verification (Node ESM scope-gate assertion, `npm run lint:docs`) passed on first attempt with no auto-fixes required.

## Issues Encountered

The plan's `<context>` referenced `12-PATTERNS.md`, which exists in the main repository working tree but is untracked by git and therefore was not present in this worktree checkout. Read it directly from the main repo's filesystem path (`/Users/pat/Projects/Sieitz/dgfy-platform/.planning/phases/12-scope-unblock-schema-extension/12-PATTERNS.md`) for reference before editing — no code/doc content was affected, this only affected where the pattern-map context was sourced from.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 13's product/inventory mappers and Phase 14's sales-history mapper are now unblocked at the scope-gate level (`isInScopeLegacyTable('items')`/`('stock_movements')`/`('pos_transactions')` all return `true`)
- ADR 0029 and migration-map §10 are consistent with the amended array — no stale documentation blocking Phase 13/14 planning or review
- `pos_transaction_lines` remains correctly gated pending Phase 14/SHM-02
- No blockers for the next wave in this phase (12-02 through 12-04, which extend the schema itself)

---
*Phase: 12-scope-unblock-schema-extension*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all task and summary commit hashes (`a0953237`, `9bf55c18`, `d8811652`) confirmed present in git log.
