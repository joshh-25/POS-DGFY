---
phase: 12-scope-unblock-schema-extension
plan: 03
subsystem: api
tags: [sequelize, transactions, row-lock, compliance, fsc-01, tenant-database]

# Dependency graph
requires:
  - phase: 08-commerce-domain-product-shift-compliance
    provides: complianceModeStateRepository.js (upsertState/recordVerification), buildReviewComplianceStateUseCase, the row-lock (sequelize.transaction + lock:t.LOCK.UPDATE) pattern proven by shiftRepository.js's closeShift()/openShift()
provides:
  - "recordVerificationAndState() on complianceModeStateRepository.js — atomic, row-locked write of verification_status/verified_by_actor_type/verified_at + state in one record.update()"
  - "buildReviewComplianceStateUseCase switched to the single atomic call, closing the FSC-01 TOCTOU fail-open window"
affects: [13-product-inventory-migration, 14-sales-history-migration, any-future-compliance-review-touchpoints]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Row-locked read-modify-write: sequelize.transaction(async (t) => { findOne({..., transaction: t, lock: t.LOCK.UPDATE}); if (!row) throw NotFound; await row.update({...all fields...}, {transaction: t}); }) — now used by recordVerification(), recordVerificationAndState(), and shiftRepository.js's closeShift()/openShift()."
    - "Combine multiple logically-atomic field writes into ONE record.update() call inside the lock, rather than two independent repository calls each with their own lock/commit — closes crash/race windows between related writes."

key-files:
  created: []
  modified:
    - apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js
    - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js
    - apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js
    - apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js

key-decisions:
  - "recordVerificationAndState() does NOT findOrCreate — mirrors recordVerification()'s ComplianceStateNotFoundError-on-missing-row behavior exactly, preserving the 'evidence before review' 404 contract."
  - "upsertState() and recordVerification() are retained unchanged — recordVerification() is still used by buildSubmitComplianceEvidenceUseCase's evidence-submission reset-to-pending_review path; only the review usecase switches to the new atomic method."

patterns-established:
  - "Pattern: when a usecase performs two related writes to the same row via two separate repository calls, check whether they can be folded into one row-locked record.update() to eliminate the crash/race window between them (applies broadly, not compliance-specific)."

requirements-completed: [FSC-01]

coverage:
  - id: D1
    description: "recordVerificationAndState() writes verification_status, verified_by_actor_type, verified_at, and state in ONE record.update() call inside ONE sequelize.transaction with lock: transaction.LOCK.UPDATE"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js#ComplianceModeStateRepository.recordVerificationAndState — writes verification_status/verified_by_actor_type/verified_at AND state in ONE record.update() inside ONE row-locked transaction"
        status: pass
    human_judgment: false
  - id: D2
    description: "Missing compliance_mode_state row throws ComplianceStateNotFoundError (no findOrCreate) — preserves 'submit evidence before review' 404 contract"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js#throws ComplianceStateNotFoundError when no row exists yet (does NOT findOrCreate)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Unique-constraint violation on the atomic update maps to DuplicateComplianceModeStateError, matching upsertState()'s error convention"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js#rethrows a record.update() unique-constraint violation as DuplicateComplianceModeStateError"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildReviewComplianceStateUseCase calls repository.recordVerificationAndState(...) exactly once and no longer calls recordVerification + upsertState as a pair in the review path; reject/revoke demotes to non_compliant_active, verified sets the reviewer-supplied newState"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js#FSC-01: reject/revoke demotes compliance_mode_state to non_compliant_active"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js#FSC-01/T-12-07: a verified review outcome sets state to the reviewer-supplied newState via the single atomic call"
        status: pass
    human_judgment: false
  - id: D5
    description: "Existing catch-block error mappings (409 duplicate, 503 tenant-db, 404 not-found) are unchanged and cover the new call's throws; full compliance suite (repository + gate + demotion + checklist) passes green"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "cd apps/dgfy-api && npm test -- compliance (35 tests, 4 suites, all pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 16min
completed: 2026-07-14
status: complete
---

# Phase 12 Plan 03: Atomic Compliance Verification + State Write Summary

**Folded the review usecase's two independent verification/state writes into one row-locked `recordVerificationAndState()` transaction, closing a Fiscal POS_CHECKOUT fail-open TOCTOU window (FSC-01/T-12-07/T-12-08).**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-07-14T09:42:00Z (approx, base commit 08f79367)
- **Completed:** 2026-07-14T09:58:08Z
- **Tasks:** 2/2 completed
- **Files modified:** 4

## Accomplishments
- Added `recordVerificationAndState()` to `complianceModeStateRepository.js`: one `sequelize.transaction()` with `lock: transaction.LOCK.UPDATE`, one `record.update()` writing all four fields (verification triplet + state), `ComplianceStateNotFoundError` on missing row (no `findOrCreate`), `DuplicateComplianceModeStateError` on unique-constraint violation.
- Switched `buildReviewComplianceStateUseCase` to compute `finalState` first, then call `repository.recordVerificationAndState(...)` exactly once — the old `recordVerification()` + `upsertState()` two-write block (lines 308-320) is gone from the review path.
- `upsertState()` and `recordVerification()` remain intact and are still used elsewhere (`upsertState()` for evidence submission's first-write/patch, `recordVerification()` for evidence submission's reset-to-`pending_review` step).
- Extended `complianceModeStateRepository.test.js` with 4 new tests proving the atomicity, not-found, duplicate, and toPlain-shape behaviors of `recordVerificationAndState()`.
- Rewrote `complianceReviewDemotion.test.js`'s mocked repository from `{recordVerification, upsertState}` to `{recordVerificationAndState}`, updated the reject/revoke assertions to check the single atomic call, and added a new test proving the `verified` outcome also routes through the single call with the reviewer-supplied `newState`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add row-locked recordVerificationAndState() to the repository** - `1201158f` (feat)
2. **Task 2: Switch the review usecase to the atomic call** - `ca77bdbb` (feat)

_Note: Both tasks were `type="auto"`; Task 1 carried `tdd="true"` and its tests were written alongside the implementation and verified green before commit (both landed in the same commit per plan's file grouping, not a separate RED/GREEN commit split)._

## Files Created/Modified
- `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js` - Added `recordVerificationAndState()` method
- `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js` - `buildReviewComplianceStateUseCase` now uses the single atomic call
- `apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js` - New atomicity/not-found/duplicate/shape tests for `recordVerificationAndState()`
- `apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js` - Mocked repository and assertions updated to the single-call contract; added a `verified`-outcome coverage case

## Decisions Made
- `recordVerificationAndState()` deliberately does NOT `findOrCreate` — mirrors `recordVerification()`'s missing-row behavior exactly (throws `ComplianceStateNotFoundError`), preserving the "evidence must be submitted before review" 404 contract that the plan's `must_haves.truths` requires.
- Kept `upsertState()` and `recordVerification()` untouched rather than refactoring/removing them — they're still exercised by the evidence-submission usecase (`buildSubmitComplianceEvidenceUseCase`), which is out of this plan's scope.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria were met without needing any Rule 1-4 auto-fixes.

## Issues Encountered
- The worktree checkout has no `node_modules` (gitignored, not copied into the worktree). Symlinked `apps/dgfy-api/node_modules` to the main repo's installed `node_modules` to run `npm test`/`npm run lint` locally, then removed the symlink before the final commit (never staged, confirmed via `git status --short`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- FSC-01's compliance-review atomicity gap is closed; the pending todo `.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md` can be marked resolved/archived by the orchestrator.
- No blockers for Plans 01/02/04 in this phase (this plan touches `dgfy-api` only, not the migration-runner, and ran independently in parallel).

---
*Phase: 12-scope-unblock-schema-extension*
*Completed: 2026-07-14*
