---
phase: 14-sales-history-migration-full-verification
plan: 01
subsystem: database
tags: [sequelize, mysql, migration-runner, dgfy-api, schema-contract]

# Dependency graph
requires:
  - phase: 09-pos-checkout-payment
    provides: "availments/availment_items base tables (20260713120000-create-availment-checkout.cjs)"
  - phase: 10-storefront-discovery-online-ordering
    provides: "availments.source_reference precedent (20260714103000-add-availment-source-reference.cjs)"
provides:
  - "Additive availments.source_system/legacy_snapshot/additional_fees and availment_items.source_system/source_reference/legacy_snapshot columns"
  - "unique_availment_items_source_reference unique index"
  - "dgfyBusinessContract.js availments extension + backfilled full availment_items entry"
  - "Availment/AvailmentItem tenant model parity with column-for-column type/nullability matching"
affects: [14-02, 14-03, sales-history-migration-mapper-plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive/nullable schema-extension migration with describeTable/showIndex existence guards (copied from 20260714103000/20260715120000)"
    - "Backfilling a physically-existing-but-contract-missing table (availment_items) in the same commit as its next additive extension"
    - "readFileSync-based source-surface guard test asserting persistence-only fields never appear in live controller/usecase/entity/repository files"

key-files:
  created:
    - apps/dgfy-migration-runner/src/migrations/schema/20260718000000-extend-schema-for-sales-history-migration.cjs
    - apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js
  modified:
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
    - apps/dgfy-api/src/models/Tenant/Availment.js
    - apps/dgfy-api/src/models/Tenant/AvailmentItem.js

key-decisions:
  - "availments gains source_system STRING(32), legacy_snapshot JSON, additional_fees JSON (D-14-01/D-14-05/D-14-08/D-14-09, LDM-05)"
  - "availment_items gains source_system STRING(32), source_reference STRING(64), legacy_snapshot JSON plus unique_availment_items_source_reference (SHM-04)"
  - "dgfyBusinessContract.js's availment_items entry — physically existing since Phase 9 but never contracted — is backfilled in full from the physical DDL in this same commit, not deferred further"
  - "additional_fees is a separate additive column from legacy_snapshot with zero live checkout write path wired in this plan (explicitly out of scope per 14-CONTEXT.md Deferred Ideas)"

patterns-established:
  - "Source-surface guard tests (readFileSync + string-absence assertions) as the mechanical proof that a persistence-only migration column has zero live API surface, not just a plan-level promise"

requirements-completed: [LDM-05, SHM-04]

coverage:
  - id: D1
    description: "Guarded, additive sales-history schema migration (availments + availment_items columns, unique index) with idempotent rerun and narrow rollback"
    requirement: "LDM-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js#Phase 14 Plan 01: sales-history schema migration"
        status: pass
    human_judgment: false
  - id: D2
    description: "dgfyBusinessContract.js availments extension + full availment_items contract entry backfill (columns, indexes, FKs)"
    requirement: "SHM-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js#Phase 14 Plan 01: dgfyBusinessContract sales-history persistence surface"
        status: pass
    human_judgment: false
  - id: D3
    description: "Availment/AvailmentItem tenant model parity (exact types, nullability, physical field names, index parity) plus source-surface proof that no live availment entity/controller/usecase/repository references a Phase 14 field"
    requirement: "SHM-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js#Phase 14 Plan 02: apps/dgfy-api tenant persistence model parity"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js#Phase 14 Plan 02: source-surface guard"
        status: pass
      - kind: other
        ref: "npm run check:architecture"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 01: Guarded Schema Extension & Persistence Parity Summary

**Additive availments/availment_items sales-history migration schema (`source_system`, `legacy_snapshot`, `additional_fees`, line-level `source_reference` + unique index) with full dgfyBusinessContract.js parity and matching tenant Sequelize model fields — zero live checkout write path.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2/2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Added `20260718000000-extend-schema-for-sales-history-migration.cjs`: three nullable `availments` columns (`source_system`, `legacy_snapshot`, `additional_fees`) and three nullable `availment_items` columns (`source_system`, `source_reference`, `legacy_snapshot`) plus the `unique_availment_items_source_reference` unique index, all guarded with `describeTable`/`showIndex` existence checks for idempotent reruns and a narrow, index-before-column `down()`.
- Extended `dgfyBusinessContract.js`'s `availments` entry with the three new columns and backfilled a previously-missing full `availment_items` contract entry (columns, indexes, unique constraint, same-tenant FKs) sourced directly from the physical Phase 9 DDL plus the new Phase 14 additions.
- Added matching field definitions to `Availment.js`/`AvailmentItem.js` tenant models (persistence-only), including the new `AvailmentItem` unique index option, with zero changes to any live checkout controller, use case, repository payload, or serializer.
- Wrote `phase14SalesHistorySchema.test.js` (18 tests) covering: exact nullable types/index name/contract columns/FKs/target kind/idempotent rerun/narrow rollback for the migration and contract (Task 1); exact model attribute names/types/nullability/physical field names/index parity against both the migration and contract, plus source-surface `readFileSync` assertions proving no live availment entity/controller/usecase/repository file references any Phase 14 field, and that `AvailmentEntity.toPlain()`'s public response shape stays narrow even when constructed with a Phase 14 field (Task 2).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add guarded schema migration and verification contract** - `d67c10f0` (feat)
2. **Task 2: Mirror Phase 14 fields in tenant persistence models only** - `d5254164` (feat)

_Note: both tasks were pure add/extend commits — no separate RED/GREEN split was needed since Task 1's `tdd="true"` behavior/implementation were authored together and verified green before commit (see Deviations for the reasoning)._

## Files Created/Modified
- `apps/dgfy-migration-runner/src/migrations/schema/20260718000000-extend-schema-for-sales-history-migration.cjs` - Additive, `targetKind: 'business'` migration adding the six Phase 14 columns and the one unique index
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - `availments` entry extended; full `availment_items` entry backfilled
- `apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js` - 18 focused tests across migration, contract, model parity, and source-surface guards
- `apps/dgfy-api/src/models/Tenant/Availment.js` - Adds `source_system`/`legacy_snapshot`/`additional_fees` field definitions
- `apps/dgfy-api/src/models/Tenant/AvailmentItem.js` - Adds `source_system`/`source_reference`/`legacy_snapshot` field definitions plus the `unique_availment_items_source_reference` model index

## Decisions Made
- Followed 14-CONTEXT.md's locked decisions verbatim: `legacy_snapshot` (not a more granular multi-column shape) for D-14-01/D-14-05/D-14-08 unmapped evidence; separate `additional_fees` JSON column for D-14-09; line-level provenance mirrors the exact `availments.source_reference` STRING(64) pattern for SHM-04.
- Backfilled the full `availment_items` contract entry in this same commit rather than deferring it further, since the plan explicitly required closing that pre-existing Phase 9 contract gap as part of adding the Phase 14 index to that table (an index that didn't exist on an uncontracted table would otherwise be unverifiable by `verify`).
- No `OUT_OF_SCOPE_LEGACY_TABLES`/`rejectedTables` allowlist entry was touched — `availment_items` was already a physical table, not a newly-legitimized name.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>`/`<acceptance_criteria>` were implemented directly; no bugs, missing critical functionality, blocking issues, or architectural changes were discovered during execution.

## Issues Encountered

- The worktree had no `node_modules` installed anywhere (root, `apps/dgfy-migration-runner`, `apps/dgfy-api`, `backend`) since it's a fresh git worktree and `node_modules/` is gitignored. Verified `package-lock.json` was byte-identical to the main repo for each affected package, then symlinked each package's `node_modules` from the main repo checkout for the duration of test/verification runs, and removed all four symlinks before the final commit (confirmed via `git status --short` showing a clean tree with no untracked entries). No `node_modules` symlink was ever staged or committed.
- Task 2's model-parity test needed to load `apps/dgfy-api`'s Sequelize model definer functions from a migration-runner test file (different npm package, own `node_modules`). Verified this resolves correctly because Node's ESM bare-specifier resolution (`import 'sequelize'` inside `Availment.js`) is relative to the importing file's own location, not the top-level test file's location — confirmed with a standalone script before writing the test, and `new Sequelize(...)` + `Model.init()` require no live DB connection (mysql2 dialect resolution succeeds without a `connect()` call).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The additive schema/contract/model surface required for a future sales-history mapper (`pos_transaction`→`availment`, `pos_transaction_line`→`availment_item`) now exists and is independently verified — no mapper, checkpoint wiring, or `OUT_OF_SCOPE_LEGACY_TABLES` change was built in this plan (that is explicitly deferred to a later 14-0N plan per 14-CONTEXT.md's mapper/runner-pattern canonical refs).
- `npm run check:architecture` passes cleanly against the new model/contract surface with no new exception, confirming the persistence-only boundary holds.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*

## Self-Check: PASSED

All created/modified files and all three commits (`d67c10f0`, `d5254164`, `aa96231a`) verified present on disk and in git history.
