---
phase: 14-sales-history-migration-full-verification
plan: 04
subsystem: database
tags: [migration-runner, sequelize, sales-history, dry-run, data-quality]

# Dependency graph
requires:
  - phase: 14-sales-history-migration-full-verification (plan 02)
    provides: "mapPosTransactionToAvailment()/mapPosTransactionLineToAvailmentItem() pure header/line mappers this plan wires into dry-run planning"
  - phase: 14-sales-history-migration-full-verification (plan 03)
    provides: "syncDataQualityFindings() reason-lifecycle-aware finding sync, adopted here for the two new sales entity types"
provides:
  - "readLegacySalesSnapshot() — read-only two-table (pos_transactions/pos_transaction_lines) full-scan source reader, D-14-06 compliant (no watermark cursor)"
  - "buildDryRunPlan() extended with entity 13 (availment) and entity 14 (availment_item), ordered after the four Phase 13 product-domain entity types"
  - "Within-pass planned-dependency tracking (pending: sentinel) so a clean-target first dry-run never falsely orphans every sales line"
  - "redactTargetPayload() legacy_snapshot redaction (has_legacy_snapshot + sorted legacy_snapshot_keys evidence only)"
  - "runDryRunTransformations() creator-owned connection closure (finally, success and failure) and syncDataQualityFindings adoption for availment/availment_item"
affects: ["14-05 (apply orchestration reuses the same mappers/planned-dependency reasoning at write time)", "14-06 (verification reconciles against this plan's entity/finding shapes)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Planned-vs-durable dependency resolution: a within-this-pass 'planned' key set (populated only for validly-inserted/updated rows) is checked after the durable legacy_id_map, before falling through to a genuine unresolved-dependency finding — a `pending:<lookup-key>` sentinel (never a real-looking id) marks a dependency that will exist once apply runs"
    - "Report redaction generalized from an allow-list copy to a deny-list copy plus targeted legacy_snapshot -> {has_legacy_snapshot, legacy_snapshot_keys} evidence transform, recursively collecting key names (never values) from nested snapshot objects"
    - "Selective adoption of syncDataQualityFindings (Plan 03) scoped to the two new Phase 14 entity types only, leaving every existing Phase 3/13 entity type's append-only recordDataQualityFinding() behavior unchanged"

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataSalesSource.test.js
    - apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js
  modified:
    - apps/dgfy-migration-runner/src/data/legacySource.js
    - apps/dgfy-migration-runner/src/data/dryRun.js
    - apps/dgfy-migration-runner/tests/dataVerify.test.js
    - apps/dgfy-migration-runner/tests/dataProductVerify.test.js

key-decisions:
  - "A line's parent-availment/product dependency resolves in this priority: durable legacy_id_map row (real dgfy id) > within-this-pass planned insert/update (pending:<lookup-key> sentinel) > genuinely absent (null, triggering the mapper's existing blocking skip+finding) — implemented entirely in dryRun.js's orchestration layer, never inside mappings.js, preserving the 'dry-run calls the exact same mapper apply will call' invariant (no Pitfall 2 drift)."
  - "syncDataQualityFindings() is adopted only for entity_type 'availment'/'availment_item', not globally — matches Plan 03's own stated scope ('ready for Plans 04/05 to call on every pos_transactions/pos_transaction_lines mapper scan') and avoids any behavior change to the already-verified Phase 3/13 finding persistence path."
  - "redactTargetPayload()'s legacy_snapshot key-evidence walk is recursive and shape-agnostic (collects every nested key name) rather than hardcoded to the header's `legacy_pos` / line's `legacy_pos_line` wrapper key, so it stays correct if the snapshot's internal shape changes later."

requirements-completed: [SHM-01, SHM-02, VER-01]

coverage:
  - id: D1
    description: "Each dry-run full-scans exactly the two legacy sales tables (pos_transactions, pos_transaction_lines) without writes or cursors"
    requirement: "SHM-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesSource.test.js#readLegacySalesSnapshot"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dry-run plans both pos_transactions -> availment and pos_transaction_lines -> availment_item, ordered after the four Phase 13 product-domain entity types"
    requirement: "SHM-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js#sales-history dry-run planning (buildDryRunPlan) > orders the four Phase 13 product-domain entity types before availment, then availment_item"
        status: pass
    human_judgment: false
  - id: D3
    description: "A clean-target dry-run understands planned header/product dependencies (this-pass insert/update) and does not falsely orphan every sales line; a genuinely absent dependency still hard-blocks"
    requirement: "SHM-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js#sales-history dry-run planning (buildDryRunPlan) > clean target: a line whose header and product are both validly planned this pass is NOT falsely orphaned"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js#sales-history dry-run planning (buildDryRunPlan) > genuinely absent parent/product (not planned, not durable) remains a real blocking orphan"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dry-run reports never disclose legacy snapshot values (customer/payment/delivery/fiscal fields) — only presence + sorted key-name evidence survives serialization"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js#sales-history dry-run report redaction (redactTargetPayload) > replaces legacy_snapshot with presence + sorted key-name evidence only, never leaking seeded header values"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every landlord/tenant connection this orchestration opens closes in finally on both success and thrown failure (creator-owned pool closure)"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js#runDryRunTransformations ... connection lifecycle > closes the landlord and every tenant connection in finally on success"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js#runDryRunTransformations ... connection lifecycle > closes the landlord and any already-opened tenant connection in finally even when a tenant read throws"
        status: pass
    human_judgment: false
  - id: D6
    description: "syncDataQualityFindings resolves a reason no longer emitted and leaves a still-open sibling reason untouched for the sales entity types"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js#runDryRunTransformations ... > current-state findings: a reason no longer emitted this run is resolved via syncDataQualityFindings, not left stale forever"
        status: pass
    human_judgment: false

duration: 17min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 04: Sales-History Dry-Run Reads & Planning Summary

**Six-entity sales-aware dry-run: readLegacySalesSnapshot() plus buildDryRunPlan() availment/availment_item planning with within-pass planned-dependency resolution (no false line orphans on a clean target), legacy_snapshot key-evidence-only redaction, and creator-owned connection closure via runDryRunTransformations().**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-15T08:52:26+08:00 (base commit)
- **Completed:** 2026-07-15T09:09:18+08:00
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `readLegacySalesSnapshot(tenantSequelize)` issues one full unpaginated `SELECT * FROM pos_transactions` and one `SELECT * FROM pos_transaction_lines`, returning both result sets verbatim with no stitching, target lookup, or write — matching D-14-06's "full scan every run, no watermark cursor" decision and the existing `readLegacyProductSnapshot` pattern.
- `buildDryRunPlan()` now plans entity 13 (`availment`, from `pos_transactions`) and entity 14 (`availment_item`, from `pos_transaction_lines`) after the four existing Phase 13 product-domain entity types, reusing the same durable `legacy_id_map`-backed location/terminal/staff resolution built for entities 4/6/7.
- Added within-pass "planned dependency" tracking (`plannedAvailmentKeys`, `plannedProductKeys`) so a line whose parent header or product is validly planned as insert/update *in this same dry-run pass* resolves through a distinguishable `pending:<lookup-key>` sentinel rather than falsely triggering `availment_parent_not_mapped`/`sale_product_not_mapped` — this only affects dry-run's own orchestration layer; the mapper functions themselves are called unchanged (no dry-run/apply drift, per the file's existing Pitfall 2 contract).
- `redactTargetPayload()` now replaces any `legacy_snapshot` value with `has_legacy_snapshot`/`legacy_snapshot_keys` (recursively-collected, sorted key names only) instead of copying it verbatim — closing an information-disclosure gap that previously let every header/line's full snapshot (customer name/phone/email, payment references, delivery address, fiscal document hash, etc.) leak straight into the JSON dry-run report.
- `runDryRunTransformations()` now reads the sales snapshot per tenant, wraps its landlord + per-tenant connection lifecycle in `try/finally` so every connection it creates is closed exactly once on both success and any thrown failure, and adopts Plan 03's `syncDataQualityFindings()` for the two new sales entity types (leaving every existing Phase 3/13 entity type's append-only `recordDataQualityFinding()` behavior unchanged).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the two-table read-only sales snapshot** - `d395b79d` (feat)
2. **Task 2: Plan sales dependencies and redact snapshots in dry-run reports** - `32ae2cd3` (feat)

**Plan metadata:** committed separately as part of this SUMMARY.

## Files Created/Modified
- `apps/dgfy-migration-runner/src/data/legacySource.js` - Added `readLegacySalesSnapshot()`; corrected the file's stale header comment that still listed `pos_transactions` as "never queried in this reader"
- `apps/dgfy-migration-runner/tests/dataSalesSource.test.js` - 5 tests: verbatim two-table read, empty-table handling, single-SELECT-per-table (no pagination), a source-guard scan for mutation SQL, and the backend-isolation contract test
- `apps/dgfy-migration-runner/src/data/dryRun.js` - Imports `readLegacySalesSnapshot`/`mapPosTransactionToAvailment`/`mapPosTransactionLineToAvailmentItem`/`syncDataQualityFindings`; adds `PENDING_DEPENDENCY_PREFIX`/`resolvePlannedDependencyId()`; extends `buildDryRunPlan()` with entities 13-14 and planned-dependency tracking for entities 9 (product) and 13 (availment); extends `redactTargetPayload()` with `legacy_snapshot` key-evidence redaction; extends `runDryRunTransformations()` with the sales snapshot read, `try/finally` connection closure, and scoped `syncDataQualityFindings()` adoption
- `apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js` - 14 tests: entity ordering, clean-target planned-dependency (not falsely orphaned), retried-dry-run durable resolution, genuinely-absent blocking orphan, header attribution findings, `legacy_snapshot` redaction (with seeded customer/payment/delivery/fiscal sentinel non-leak assertions), sales snapshot wiring, zero target mutation, two current-state finding lifecycle scenarios, and three connection-closure scenarios (success, tenant-read failure, landlord-read failure)
- `apps/dgfy-migration-runner/tests/dataVerify.test.js` / `tests/dataProductVerify.test.js` - Added `syncDataQualityFindings: jest.fn()` to each file's existing `../src/metadata/dataState.js` mock (see Deviations)

## Decisions Made
- Planned-dependency resolution lives entirely in `dryRun.js`'s orchestration layer (a `resolvePlannedDependencyId()` helper plus two `Set`s built while walking entities 9 and 13), never inside `mappings.js` — the mapper functions receive a resolved id or `null` exactly as before; only the *value supplied* differs (durable id, pending sentinel, or null), preserving the codebase's explicit "dry-run and apply call the exact same mapper" contract.
- `syncDataQualityFindings()` adoption is scoped to `entity_type === 'availment' | 'availment_item'` only, matching Plan 03's own stated readiness note rather than migrating every existing entity type's finding-persistence path in the same change.
- Header-level location/terminal/cashier attribution gaps (D-14-02/D-14-03) intentionally do NOT use the planned-dependency mechanism — those target columns are nullable and the mappers already treat a miss as a non-blocking `orphan` finding with `null`, so there was no false-orphan defect to fix there (unlike the line's two non-null FKs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated two verify-test dataState.js mocks to add the new syncDataQualityFindings export**
- **Found during:** Task 2 (running the full migration-runner suite after wiring `syncDataQualityFindings` into `dryRun.js`)
- **Issue:** `tests/dataVerify.test.js` and `tests/dataProductVerify.test.js` both use `jest.unstable_mockModule('../src/metadata/dataState.js', ...)` with a fixed export list. `verifyData.js` imports `DEFAULT_RUN_SCOPE` from `dryRun.js`, which now statically imports `syncDataQualityFindings` from `dataState.js`; since ESM named imports are checked at link time, the mock's missing export made both test suites fail to load entirely (`SyntaxError: ... does not provide an export named 'syncDataQualityFindings'`), not just fail assertions.
- **Fix:** Added `syncDataQualityFindings: jest.fn().mockResolvedValue(undefined)` to both mocks' export lists.
- **Files modified:** `apps/dgfy-migration-runner/tests/dataVerify.test.js`, `apps/dgfy-migration-runner/tests/dataProductVerify.test.js`
- **Verification:** Full migration-runner suite (`npm test` equivalent via `jest --runInBand`, no path filter) passes: 35/40 suites (5 intentionally ENV-gated), 455/465 tests, 10 intentionally skipped.
- **Committed in:** `32ae2cd3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking ESM link-time failure caused directly by this plan's own `syncDataQualityFindings` import)
**Impact on plan:** No scope creep; the fix only adds a missing mock export required for the plan's own new import to resolve. No behavior change to either test file's actual assertions.

## Issues Encountered
- Fresh worktree checkout had no `node_modules` installed for `apps/dgfy-migration-runner` (gitignored, not shared across worktrees). Symlinked to the main checkout's already-installed copy (identical `package.json`/`package-lock.json`, confirmed via `diff -q`) rather than reinstalling; the symlink is untracked/gitignored housekeeping, removed before this plan's final commit per worktree-executor convention.
- `apps/dgfy-api/node_modules` was also missing, which caused an unrelated pre-existing test suite (`tests/phase14SalesHistorySchema.test.js`, testing `apps/dgfy-api`'s own `Availment.js` Sequelize model — outside this plan's file scope) to fail with "Cannot find module 'sequelize'". Symlinked temporarily to confirm this was purely an environment gap (not caused by this plan's changes), then removed the symlink again since `apps/dgfy-api` is out of this plan's scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `runDryRunTransformations()` now produces a complete six-entity plan (Phase 3's five + Phase 13's four product-domain types + this plan's two sales types) with report-safe redaction and bounded connection lifecycle, ready for Plan 05 (apply orchestration) to reuse the same mappers and an analogous durable-vs-genuinely-absent dependency distinction at actual write time (apply, unlike dry-run, resolves real ids as it inserts, so it does not need the `pending:` sentinel mechanism itself — only the same "don't falsely orphan a same-batch dependency" reasoning).
- `syncDataQualityFindings()` is now proven end-to-end through `runDryRunTransformations()` for `availment`/`availment_item`, closing part of the D-14-06/VER-03 growing-table retry-evidence gap that Plan 03 opened; Plan 05/06 still own migrating the remaining Phase 3/13 entity types (if ever desired) and the apply-side/verify-side reconciliation work.
- Full migration-runner suite: 455 tests passing (35/40 suites; 5 suites/10 tests intentionally ENV-gated on real MySQL, unchanged from before this plan), zero regressions. `check:architecture` passes (29 files checked).
- No blockers.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: apps/dgfy-migration-runner/src/data/legacySource.js
- FOUND: apps/dgfy-migration-runner/tests/dataSalesSource.test.js
- FOUND: apps/dgfy-migration-runner/src/data/dryRun.js
- FOUND: apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js
- FOUND: apps/dgfy-migration-runner/tests/dataVerify.test.js
- FOUND: apps/dgfy-migration-runner/tests/dataProductVerify.test.js
- FOUND commit: d395b79d (feat: Task 1)
- FOUND commit: 32ae2cd3 (feat: Task 2)
- FOUND commit: efc19380 (docs: plan metadata)
