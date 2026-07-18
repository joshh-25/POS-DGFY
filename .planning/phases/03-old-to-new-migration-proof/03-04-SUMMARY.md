---
phase: 03-old-to-new-migration-proof
plan: 04
subsystem: database
tags: [migration-runner, apply, checkpoint, id-map, retry-safety, mysql2, sequelize]

# Dependency graph
requires:
  - phase: 03-old-to-new-migration-proof
    provides: "03-01's DGFY_MIGRATION_TARGET_MANIFEST contract, dgfy_migration_meta legacy_id_map/data_checkpoints/data_quality_findings tables, and metadata/dataState.js helpers; 03-02's pure mapper functions in mappings.js; 03-03's runDryRunTransformations()/DEFAULT_RUN_SCOPE and legacySource.js snapshot readers"
provides:
  - "apps/dgfy-migration-runner/src/data/apply.js — writeMappedTargetRow()/applyTenantEntityBatch()/resumeFromDataCheckpoint()/assertMappedTargetIdentity()/runApplyTransformations()"
  - "Real `data apply` command orchestration in src/commands/data.js (manifest gate, checkpointed writes, report-safe results)"
  - "Fan-out disambiguation pattern for legacy records that map to more than one target table (business_membership + account_staff_assignment sharing one dgfy_account_tenant_memberships row)"
affects: [03-05-verification-retry-evidence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Target-first, natural-key reconciliation: because target and dgfy_migration_meta are separate MySQL connections with no cross-database transaction, every insert first checks the target table's own natural unique key (email, terminal_code, database_name, business_id, (business_id,account_id), dgfy_account_id, name) for a row already durably written in a prior interrupted run, before ever inserting — this closes the interruption window between 'target row written' and 'map row recorded'"
    - "Fan-out disambiguation: when the durable legacy_id_map row found under a record's key belongs to a different target_table than the current write, the lookup/record key is transparently re-scoped to `legacy_id + '::' + target_table` so two target rows can share one legacy source key without violating legacy_id_map's (run_scope, legacy_source, legacy_table, legacy_id) unique index"
    - "Checkpoint-gated verify-not-rewrite: applyTenantEntityBatch() only marks a (tenant, entity_type) checkpoint 'completed' on the pass that actually processed writes; a batch whose checkpoint is already 'completed' runs the same writeMappedTargetRow() path, which naturally short-circuits to a verify-only reconciliation (assertMappedTargetIdentity) with zero DB writes and zero duplicate finding persistence"
    - "Live dependency resolution via durable legacy_id_map (not an in-memory per-run map): account_staff_assignment resolves staff_account_id and terminal_identity resolves location_id by querying legacy_id_map at write time, so dependents correctly resolve whether the dependency was written moments earlier in the same run or in a prior completed run"

key-files:
  created:
    - apps/dgfy-migration-runner/src/data/apply.js
    - apps/dgfy-migration-runner/tests/dataApply.test.js
  modified:
    - apps/dgfy-migration-runner/src/commands/data.js
    - apps/dgfy-migration-runner/tests/dataCommand.test.js

key-decisions:
  - "metadata/dataState.js required no modification — 03-01's findLegacyIdMap/recordLegacyIdMap/getDataCheckpoint/markDataCheckpoint/recordDataQualityFinding already provide every idempotent primitive apply.js needed; only apply.js's own call ordering and natural-key layer were new"
  - "coreSequelize (the dgfy_core connection) is opened once by runDataApply() and passed into runApplyTransformations(), rather than apply.js opening its own — mirrors the existing Phase 1 command-ordering contract (createTargetConnection() called before ensureMetadataSchema()/recordCommandStart()) instead of introducing a second dgfy_core connection"
  - "business_database_registry and tenant_ownership_metadata (related_targets of the business mapper) get no legacy_id_map row of their own — each already has a real target-side unique constraint (database_name, business_id respectively), so natural-key lookup-before-insert alone is sufficient idempotency, and giving them a synthetic legacy_id_map key would only duplicate what the unique index already guarantees"
  - "location has no unique constraint in the Phase 02 schema; its natural key is name (best-effort). Documented as a known limitation: two legacy locations with an identical name in one tenant would be treated as already-migrated on a target-first retry. Not fixed here — would require a Phase 02 schema change, out of this plan's scope"
  - "account_staff_assignment.staff_account_id / terminal_identity.location_id are explicitly coerced to Number() after legacy_id_map lookup (dataState.js stores dgfy_id as a string via toKeyString()), matching the real INTEGER column type in dgfyBusinessContract.js"
  - "The apply report's `results` array never includes raw target_payload or mapper findings text — only { legacy_tenant_id, entity_type, operation, status, target_table, target_database, dgfy_id } — closing the threat model's 'Secret leakage in reports' row for password_hash/terminal secrets/company_token"

requirements-completed: [MIG-03, MIG-04]

coverage:
  - id: D1
    description: "writeMappedTargetRow() implements lookup-before-insert: an existing durable legacy_id_map row is used directly (with a target-existence re-verification) and never triggers a second target write"
    requirement: "MIG-03"
    verification:
      - kind: unit
        ref: "tests/dataApply.test.js#writeMappedTargetRow (lookup-before-insert, natural-key reconciliation, deterministic-id vs LAST_INSERT_ID paths)"
        status: pass
    human_judgment: false
  - id: D2
    description: "applyTenantEntityBatch()/resumeFromDataCheckpoint() mark the per-(tenant, entity type) checkpoint only after that batch's writes durably complete, and re-verify (never re-write) once a checkpoint is already completed"
    requirement: "MIG-03"
    verification:
      - kind: unit
        ref: "tests/dataApply.test.js#applyTenantEntityBatch (marks checkpoint only after writes complete / verifies without re-marking when already completed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "runApplyTransformations() writes account, business (+registry+ownership), staff_account, business_membership, account_staff_assignment, location, and terminal_identity in the documented entity order, resolving staffAccountId/location_id via the durable legacy_id_map so dependents reference real DGFY ids, never legacy raw ids"
    requirement: "MIG-03"
    verification:
      - kind: unit
        ref: "tests/dataApply.test.js#runApplyTransformations 'writes accounts, business (+registry+ownership), staff, membership, assignment (resolved staffAccountId), location, and terminal (resolved location_id) in one run'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Missing accepted membership creates a conflict/finding and skips both business_membership and account_staff_assignment writes (ADR 0028 non-inference preserved in apply, not just dry-run)"
    requirement: "MIG-03"
    verification:
      - kind: unit
        ref: "tests/dataApply.test.js#runApplyTransformations 'missing accepted membership creates a conflict/finding and skips both business_membership and account_staff_assignment writes'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Interrupted apply reruns converge without duplicate target rows or a second legacy_id_map row across three distinct interruption points: post-target-insert (pre-map), post-map (pre-checkpoint), and post-checkpoint"
    requirement: "MIG-04"
    verification:
      - kind: unit
        ref: "tests/dataApply.test.js#'retry safety across interruption points' (3 tests) and #runApplyTransformations 'rerunning against the same durable metadata + target state does not duplicate any rows'"
        status: pass
    human_judgment: false
  - id: D6
    description: "`data apply` preserves the --confirm-destructive gate before any connection factory or manifest load, and the apply report/argsJson never contain secrets, password hashes, terminal secrets, or company_token"
    requirement: "MIG-03"
    verification:
      - kind: unit
        ref: "tests/dataCommand.test.js#'runDataApply({confirmDestructive:false}) rejects ... before any connection factory or manifest load' and #'runDataApply report and argsJson never contain secrets, password hashes, terminal secrets, or company_token'"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-07-11
status: complete
---

# Phase 03 Plan 04: Apply Mode with ID Maps, Checkpoints, and Retry Safety Summary

**Checkpointed, ID-mapped destructive apply service (`apply.js`) writing real `dgfy_core`/`dgfy_business_*` rows via lookup-before-insert, target-first natural-key reconciliation, and per-(tenant, entity type) checkpoints — proven idempotent across three real interruption points with 19 new unit tests, all against mocked connections.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-11
- **Completed:** 2026-07-11
- **Tasks:** 3 (Task 3's retry-safety tests were authored together with Task 1 — see Deviations)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `apps/dgfy-migration-runner/src/data/apply.js` implements the full checkpointed apply write path: `writeMappedTargetRow()` (lookup-before-insert against durable `legacy_id_map`, then target-first natural-key reconciliation, then insert), `applyTenantEntityBatch()`/`resumeFromDataCheckpoint()` (per-(tenant, entity type) checkpoint gating), `assertMappedTargetIdentity()` (verifies a mapped target row still exists), and `runApplyTransformations()` (full orchestration in the documented entity order: account -> business+registry+ownership -> staff_account -> business_membership -> account_staff_assignment -> location -> terminal_identity).
- Discovered and fixed a real structural bug during Task 1 GREEN: `business_membership` and `account_staff_assignment` both derive their `legacy_id_map_key` from the same legacy `dgfy_account_tenant_memberships` row (per `mappings.js`/the mapping doc), but `legacy_id_map`'s unique index (03-01) only allows one row per `(run_scope, legacy_source, legacy_table, legacy_id)`. Fixed via transparent "fan-out disambiguation": when the durable map row found under a key belongs to a different `target_table`, the lookup/record key is re-scoped to `legacy_id + '::' + target_table` for that entity only — `legacy_source`/`legacy_table` stay exactly as documented for MIG-05.
- `account_staff_assignment.staff_account_id` and `terminal_identity.location_id` are resolved live via `legacy_id_map` lookups (not an in-memory per-run cache), so a first-ever apply correctly creates real, working assignment/terminal rows referencing genuine DGFY ids in the same run — closing the gap dry-run intentionally left open (dry-run reports these as orphan-skip on a first-ever run since it never writes).
- `runDataApply()` in `commands/data.js` now passes `{ requireMigrationManifest: true }` to `validateEnv()`, loads/validates the manifest, and calls `runApplyTransformations()` — while preserving `--confirm-destructive`/target-guard ordering exactly, and producing a report whose `results` array is deliberately stripped of raw `target_payload` (no `password_hash`/terminal secrets/`company_token` can reach the JSON report).
- 19 new tests in `tests/dataApply.test.js` use a small generic in-memory fake SQL engine (bulkInsert/bulkUpdate/parameterized SELECT/LAST_INSERT_ID) rather than per-call jest.fn() stubs, so retry tests can call `runApplyTransformations()` twice against the *same* backing store and assert real convergence — proving MIG-04 behaviorally, not just via mock call counts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement checkpointed apply service** — `7f586b3a` (test, RED) + `b7df750b` (feat, GREEN)
2. **Task 2: Wire `data apply` command with destructive gate and reports** — `6959dc51` (test, RED) + `9955d8d3` (feat, GREEN)
3. **Task 3: Add retry-safety regression coverage** — no separate commit; already delivered inside `7f586b3a`/`b7df750b` (see Deviations)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/data/apply.js` — `runApplyTransformations()`, `applyTenantEntityBatch()`, `writeMappedTargetRow()`, `resumeFromDataCheckpoint()`, `assertMappedTargetIdentity()`, plus internal `findExistingTargetRow()`/`insertTargetRow()`/`writeRelatedTargetRow()` helpers and the `ENTITY_TARGET_CONFIG` natural-key table
- `apps/dgfy-migration-runner/tests/dataApply.test.js` — 19 tests: `writeMappedTargetRow` lookup-before-insert/reconciliation/insertion, `assertMappedTargetIdentity`, `resumeFromDataCheckpoint`/`applyTenantEntityBatch` checkpoint gating, end-to-end `runApplyTransformations` (happy path + missing-membership conflict + retry), 3 explicit interruption-point retry tests, and a structural parameterized-SQL contract test
- `apps/dgfy-migration-runner/src/commands/data.js` — `runDataApply()` replaced with real manifest-gated, checkpointed apply orchestration
- `apps/dgfy-migration-runner/tests/dataCommand.test.js` — `runApplyTransformations` mocked at module level; updated/added tests for manifest gating, real summary/results shape, failure marking, and the report/argsJson secret-redaction contract

## Decisions Made

- Kept `metadata/dataState.js` untouched — 03-01's helpers already covered every durable primitive apply.js needed (lookup-before-insert for both `legacy_id_map` and `data_checkpoints`, finding persistence). No `dataState.js` change was required despite it being listed in the plan's `files_modified`.
- `coreSequelize` is opened once by `runDataApply()` (mirroring the existing `createTargetConnection()` call site from Phase 1) and passed into `runApplyTransformations()`, rather than `apply.js` opening a second `dgfy_core` connection itself.
- `business_database_registry`/`tenant_ownership_metadata` (related writes derived from the same business mapper call) rely purely on their own target-side unique constraints (`database_name`, `business_id`) for idempotency — no `legacy_id_map` row is created for them, avoiding a second instance of the fan-out collision described above.
- `location`'s natural key is `name` only (no real unique constraint exists in the Phase 02 schema) — documented as a known best-effort limitation rather than silently assumed correct.
- Numeric ids resolved from `legacy_id_map` (which stores `dgfy_id` as a string) are explicitly `Number()`-coerced before being used as `staff_account_id`/`location_id` foreign-key values, matching the real `INTEGER` column types.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fan-out collision in `legacy_id_map` for `business_membership` + `account_staff_assignment`**
- **Found during:** Task 1 (writing `runApplyTransformations` GREEN implementation, caught by a failing end-to-end test before any commit)
- **Issue:** `mapLegacyMembershipToBusinessMembership()` and `mapLegacyAccountStaffAssignment()` (03-02, unmodified by this plan) both emit an identical `legacy_id_map_key` (`{legacy_source:'landlord', legacy_table:'dgfy_account_tenant_memberships', legacy_id:<membership.id>}`) since both derive from the same legacy membership row. `legacy_id_map`'s unique index (03-01) is `(run_scope, legacy_source, legacy_table, legacy_id)` only, so once `business_membership` recorded its map row, `account_staff_assignment`'s lookup-before-insert would find that row (belonging to a different target table) and silently skip ever creating the assignment — a real, previously-untested correctness gap since dry-run never writes `legacy_id_map` and so never exercised this path.
- **Fix:** `writeMappedTargetRow()` now detects when an existing map row's `dgfy_table` doesn't match the current entry's `target_table`, and transparently re-scopes the lookup/record key to `legacy_id + '::' + target_table` for that entity only — `legacy_source`/`legacy_table` remain exactly as documented in `docs/database/dgfy-data-migration-map.md` (only `legacy_id` gains a disambiguating suffix, and only for the entity that would otherwise collide).
- **Files modified:** `apps/dgfy-migration-runner/src/data/apply.js`
- **Verification:** `tests/dataApply.test.js#runApplyTransformations 'writes accounts, business (+registry+ownership), staff, membership, assignment...'` asserts a real `account_staff_assignments` row is created referencing the correct resolved `staff_account_id`.
- **Committed in:** `b7df750b` (Task 1 GREEN commit — never landed broken)

### Consolidated Task

**2. [Process] Task 3's retry-safety tests were authored together with Task 1, not as a separate follow-up**
- The three interruption-point tests and the end-to-end retry test the plan's Task 3 calls for were integral to designing `writeMappedTargetRow()`'s lookup-before-insert/natural-key-reconciliation contract in the first place — they could not be meaningfully written as throwaway tests after Task 1's GREEN commit without re-deriving the same fake-SQL-engine test infrastructure a second time. All of Task 3's acceptance criteria (3+ interruption points, no duplicate `bulkInsert` calls on retry, mapped ids not legacy raw ids) are satisfied by tests already present in commits `7f586b3a`/`b7df750b`. No additional commit was created for Task 3; `npm --prefix apps/dgfy-migration-runner test -- dataApply.test.js` (19/19 passing) independently verifies its acceptance criteria.

---

**Total deviations:** 1 auto-fixed bug (Rule 1) + 1 process consolidation (Task 3 folded into Task 1's commits)
**Impact on plan:** The fan-out fix is essential for MIG-03 correctness (without it, every tenant's `account_staff_assignments` would silently be empty after the first apply run). The Task 3 consolidation is a documentation-only deviation — all required tests exist and pass; no scope was skipped.

## Issues Encountered

- Self-caught during Task 1 GREEN (before any broken commit): the fan-out collision above, found via a failing assertion (`assignmentRow` was `undefined`) in the end-to-end `runApplyTransformations` test. Diagnosed with temporary `console.error` tracing (removed before committing), confirmed the root cause was the shared `legacy_id_map_key`, and fixed via the disambiguation mechanism documented above.
- Initial `staff_account_id`/`location_id` resolution used the raw string `dgfy_id` from `legacy_id_map` without coercion, which would have inserted string values into `INTEGER` columns and failed a strict-equality test comparing against the numeric autoincrement id. Fixed by explicitly `Number()`-coercing both resolved ids.

## User Setup Required

None — no external service configuration required. All 19 new tests and the 5 updated `dataCommand.test.js` tests run against mocked/fake connections; nothing in this plan touches a real or live database.

## Next Phase Readiness

- Plan 03-05 (verification/retry evidence) can rely on: every migrated row's `legacy_id_map` row (with the fan-out disambiguation caveat — `account_staff_assignment`'s `legacy_id` may carry a `::account_staff_assignments` suffix when it shares a source key with a `business_membership` row; verification queries joining on raw legacy membership id should account for this), every per-(tenant, entity type) `data_checkpoints` row, and every skip/conflict `data_quality_findings` row this plan's apply run persists.
- 03-05 should be aware `business_database_registry`/`tenant_ownership_metadata` intentionally have no `legacy_id_map` row of their own — their idempotency evidence is their own unique constraint plus their parent business's map row, not a JOIN on `legacy_table = 'business_database_registry'`.
- The `location` natural-key limitation (name-only, no unique constraint) is a real, documented gap that a future hardening pass (or a Phase 02 schema change) should close if realistic legacy data has duplicate location names within one tenant.
- No blockers identified for Plan 03-05.

## Self-Check: PASSED

All created files and task commit hashes verified present in the working tree and git history:
- `apps/dgfy-migration-runner/src/data/apply.js` — FOUND
- `apps/dgfy-migration-runner/tests/dataApply.test.js` — FOUND
- `7f586b3a`, `b7df750b`, `6959dc51`, `9955d8d3` — FOUND in git log

---
*Phase: 03-old-to-new-migration-proof*
*Completed: 2026-07-11*
