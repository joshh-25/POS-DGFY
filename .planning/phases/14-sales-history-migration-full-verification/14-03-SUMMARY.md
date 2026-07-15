---
phase: 14-sales-history-migration-full-verification
plan: 03
subsystem: database
tags: [migration, sequelize, mysql, data-quality, tdd]

# Dependency graph
requires:
  - phase: 03-old-to-new-migration-proof
    provides: legacy_id_map / data_checkpoints / data_quality_findings tables in dgfy_migration_meta and the original recordDataQualityFinding/resolveDataQualityFindings helpers this plan extends
provides:
  - "syncDataQualityFindings() — reason-tuple-identified finding lifecycle sync (insert/reopen/leave/resolve) that Plans 04/05 must call for every legacy pos_transactions/pos_transaction_lines scan"
  - "resolveDataQualityFindings() optional reasonCode filter for selective (not blanket) resolution"
affects: [14-04, 14-05, 14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Full-tuple (run_scope, legacy_tenant_id, entity_type, legacy_table, legacy_id, reason_code) identity for data_quality_findings, using MySQL null-safe <=> for the optional-scope columns"
    - "Checkpoint-completion state is never consulted by finding synchronization — sync must run on every scan regardless of batch status"

key-files:
  created: []
  modified:
    - apps/dgfy-migration-runner/src/metadata/dataState.js
    - apps/dgfy-migration-runner/tests/dataState.test.js

key-decisions:
  - "Full source-record-plus-reason-code tuple identifies a finding, not just the source record — lets multiple simultaneously-open reasons for one record resolve independently"
  - "resolveDataQualityFindings() kept as an exported helper with a new optional reasonCode parameter (backward-compatible: existing apply.js callers that omit it keep prior blanket-by-record behavior) rather than replaced, per the plan's compatibility requirement for Plans 04/05"
  - "Reopen is an UPDATE by row id (status/severity/message/remediation), not a delete+reinsert, so a single reason's row identity is stable across its whole open -> resolved -> reopened lifecycle"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "syncDataQualityFindings() synchronizes current mapper findings for one source record: same-reason repeat sync is a no-op (no duplicate row), a resolved reason reopens when re-emitted, and an absent reason resolves without touching other open reasons for the same or a different run/tenant/entity scope"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataState.test.js#syncDataQualityFindings"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 03: Reason-Specific Current-State Finding Synchronization Summary

**Added `syncDataQualityFindings()`, a full-tuple (source record + reason_code) idempotent/reopenable finding-lifecycle helper that closes the false-clean and checkpoint-suppression defects apply.js's blanket-resolve-on-retry pattern had, ahead of D-14-06/VER-03 growing-table retry evidence.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-15T08:29:38+08:00 (first commit of this plan's work)
- **Completed:** 2026-07-15T08:41:29+08:00
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `syncDataQualityFindings(metaSequelize, {runScope, legacyTenantId, entityType, legacyTable, legacyId, findings})` now identifies findings by the full tuple including `reason_code`: a reason still emitted and already open is left untouched (no duplicate insert on repeat sync), a reason emitted again after being resolved is reopened in place by row id, a brand-new reason is inserted, and a previously-open reason absent from the current mapper output is resolved — with every other open reason for the same or a different run/tenant/entity scope left alone.
- `resolveDataQualityFindings()` gained an optional `reasonCode` filter for selective resolution while staying 100% backward-compatible for its existing `apply.js` call sites (which don't pass it, so they keep the prior blanket-by-record resolve behavior until Plans 04/05 migrate them).
- Checkpoint completion status is never read or consulted by `syncDataQualityFindings()` — the function has no notion of "batch already completed," which mechanically prevents the checkpoint-suppression defect the plan's threat model calls out.
- 6 new unit tests cover repeat-open, reopen-after-resolved (with row-id stability across the transition), selective single-reason resolution alongside a still-open sibling reason, empty-current-set resolving every prior open reason, tenant/run/entity isolation across 4 distinct scopes sharing the same `legacy_table`/`legacy_id`/`reason_code`, and an end-state check that a still-emitted reason set never ends up blanket-resolved.

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1 RED: failing test for syncDataQualityFindings lifecycle** - `57f36fa3` (test)
2. **Task 1 GREEN: implement syncDataQualityFindings** - `ef662e9c` (feat)

_No refactor commit was needed — the GREEN implementation required no follow-up cleanup._

## Files Created/Modified
- `apps/dgfy-migration-runner/src/metadata/dataState.js` - Added `syncDataQualityFindings()` plus two private helpers (`listDataQualityFindingsForRecord()` using a null-safe `<=>` full-tuple lookup, `reopenDataQualityFinding()` doing an UPDATE-by-id reopen); extended `resolveDataQualityFindings()` with an optional `reasonCode` filter. Old exported helpers (`recordDataQualityFinding`, `resolveDataQualityFindings`, `listOpenDataQualityFindings`) are retained unchanged for existing `apply.js` consumers, per the plan's compatibility requirement.
- `apps/dgfy-migration-runner/tests/dataState.test.js` - Added a `syncDataQualityFindings` describe block (6 tests) and extended the in-memory fake `metaSequelize.query()` to recognize the new full-tuple lookup SQL shape (matched before the pre-existing generic `data_quality_findings` shape so the two don't collide).

## Decisions Made
- Full source-record-plus-`reason_code` tuple is the finding identity, not just the source record — this is what lets one reason resolve while a sibling reason for the same `pos_transactions` row (or `pos_transaction_lines` row) stays open, satisfying the plan's third must-have truth.
- Kept `resolveDataQualityFindings()` as a public export rather than removing it or making `reasonCode` required, matching the plan's explicit instruction to retain old exported helpers for compatibility until Plans 04/05 migrate their call sites.
- Reopen is implemented as an `UPDATE ... WHERE id = ?` (via `bulkUpdate`) on the exact existing row, not a resolve-then-reinsert — this keeps one finding's row `id` stable across its full open/resolved/reopened lifecycle, which is cleaner for any future audit trail over `data_quality_findings.id`.

## Deviations from Plan

None - plan executed exactly as written. The task's `<action>` and `<acceptance_criteria>` were followed literally: `syncDataQualityFindings` was added as specified, old helpers were retained unchanged, all new SQL uses Sequelize `replacements` (verified by the existing parameterization test, whose call-count-vs-replacements-count assertion still passes with the new `metaSequelize.query()` call site included), and no test or implementation path blanket-resolves all reasons before recording current findings (the "does not blanket-resolve" test explicitly asserts this end-state).

## Issues Encountered
- The worktree had no `node_modules` installed (fresh git worktree). Confirmed `package.json`/`package-lock.json` are byte-identical to the main checkout's already-installed copy, then symlinked `apps/dgfy-migration-runner/node_modules` to the main repo's install rather than re-running `npm ci` (git-ignored, not committed, avoids an unnecessary reinstall). This is local worktree-execution housekeeping, not a plan deviation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `syncDataQualityFindings()` is ready for Plans 04/05 to call on every `pos_transactions`/`pos_transaction_lines` mapper scan, replacing the current `recordDataQualityFinding()` + conditional-on-`alreadyCompleted` + blanket `resolveDataQualityFindings()` pattern in `apply.js` for those entity types.
- `apply.js`'s existing callers (`writeMappedTargetRow()`, `applyProductCompositionUpdates()`, `runApplyTransformations()`) are untouched and still pass their full test suite (31/36 suites, 397/407 tests passing, 5 suites/10 tests intentionally gated on real MySQL per existing project convention) — no regression risk to Phase 12/13 product/inventory migration paths.
- Full migration to `syncDataQualityFindings()` in the actual sales-history apply/dry-run/verify code paths, and closing D-14-06/VER-03's growing-table retry evidence gap, is explicitly out of this plan's scope and belongs to Plans 04/05/06 per the phase's own sequencing.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*
