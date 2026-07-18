---
phase: 03-old-to-new-migration-proof
plan: 03
subsystem: database
tags: [migration-runner, dry-run, mysql2, sequelize, data-quality]

# Dependency graph
requires:
  - phase: 03-old-to-new-migration-proof
    provides: "03-01's DGFY_MIGRATION_TARGET_MANIFEST contract, dgfy_migration_meta legacy_id_map/data_checkpoints/data_quality_findings tables, dataState.js helpers, and createLegacyTenantSourceConnection() legacy connection factory; 03-02's dgfy-data-migration-map.md and pure mapper functions in mappings.js"
provides:
  - "apps/dgfy-migration-runner/src/data/legacySource.js — readLegacyLandlordSnapshot()/readLegacyTenantSnapshot() read-only, manifest-scoped legacy source readers"
  - "apps/dgfy-migration-runner/src/data/dryRun.js — buildDryRunPlan()/summarizeDryRunReport()/runDryRunTransformations()/DEFAULT_RUN_SCOPE dry-run report planner shared by apply (03-04)"
  - "Real `data dry-run` command orchestration in src/commands/data.js (manifest load/validate, dry-run planner, JSON+summary reports)"
affects: [03-04-checkpointed-apply, 03-05-verification-retry-evidence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only source snapshot readers take an already-opened Sequelize connection (never construct their own) and issue only explicitly-named SELECT statements — legacySource.js has zero backend/Sequelize/mysql2 imports, structurally excluding out-of-scope tables rather than filtering them at runtime"
    - "Pure plan-building (buildDryRunPlan/summarizeDryRunReport) is fully separated from I/O orchestration (runDryRunTransformations) so mapper-driven classification logic is unit-testable without any database, mirroring 03-02's pure-mapper contract"
    - "Current target state probe: a single scoped `SELECT ... FROM legacy_id_map WHERE run_scope = ?` resolves every existing mapping in one query, then buildDryRunPlan() reclassifies insert->update per record — avoids per-record round trips while still preventing retry duplicate-write evidence gaps"
    - "DEFAULT_RUN_SCOPE ('data-migration') is a stable constant exported from dryRun.js so 03-04's apply mode reads/writes the exact same durable legacy_id_map/data_quality_findings rows dry-run does"

key-files:
  created:
    - apps/dgfy-migration-runner/src/data/legacySource.js
    - apps/dgfy-migration-runner/src/data/dryRun.js
    - apps/dgfy-migration-runner/tests/dataDryRun.test.js
  modified:
    - apps/dgfy-migration-runner/src/commands/data.js
    - apps/dgfy-migration-runner/tests/dataCommand.test.js

key-decisions:
  - "runDataDryRun() passes { requireMigrationManifest: true } to validateEnv() (the opt-in flag 03-01 added specifically for this callsite) and loads/validates the manifest before any DB connection factory call, matching the plan's required env->manifest->connection ordering"
  - "Dry-run report shape changed from Phase 1's array-valued summary.tenant_coverage to a scalar summary.tenant_coverage_count plus a separate top-level tenant_coverage array, per the plan's explicit scalar-summary/detailed-JSON-array split"
  - "dataCommand.test.js mocks targetManifest.js and dryRun.js as whole modules so commands/data.js's orchestration/gating is tested in isolation; the real dry-run/legacySource logic is covered separately by dataDryRun.test.js — avoids re-testing the same logic twice with different mocking depths"

requirements-completed: [MIG-02]

coverage:
  - id: D1
    description: "legacySource.js reads landlord tenants/accounts/memberships scoped strictly to manifest-listed legacy_tenant_id targets (never enumerates every tenant) and tenant-local users/locations/user_location_grants/pos_terminal_registry for a single already-scoped legacy tenant connection, with zero backend or Sequelize/mysql2 imports"
    requirement: "MIG-02"
    verification:
      - kind: unit
        ref: "tests/dataDryRun.test.js#readLegacyLandlordSnapshot / readLegacyTenantSnapshot / legacySource.js import contract"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildDryRunPlan() classifies every in-scope legacy record into insert/update/skip/conflict using the exact pure mappers from 03-02, reclassifies insert->update via a legacy_id_map probe, and summarizeDryRunReport() produces scalar-only summary counts (planned_inserts/updates/skips/conflicts/orphan_records/tenant_coverage_count) with a separate tenant_coverage array"
    requirement: "MIG-02"
    verification:
      - kind: unit
        ref: "tests/dataDryRun.test.js#buildDryRunPlan (happy path, reclassification, missing-tenant conflict, missing-owner conflict, non-accepted membership skip) / summarizeDryRunReport"
        status: pass
    human_judgment: false
  - id: D3
    description: "runDryRunTransformations() persists every skip/conflict/orphan finding via recordDataQualityFinding() and never calls a target/business connection factory or writes checkpoint state"
    requirement: "MIG-02"
    verification:
      - kind: unit
        ref: "tests/dataDryRun.test.js#runDryRunTransformations (persists findings) / dryRun.js structural contract (no target mutation, no checkpoints)"
        status: pass
    human_judgment: false
  - id: D4
    description: "runDataDryRun() rejects invalid env/manifest before any DB factory call, runs the real dry-run planner, records report paths in command_executions, and still succeeds without confirmDestructive"
    requirement: "MIG-02"
    verification:
      - kind: unit
        ref: "tests/dataCommand.test.js#runDataDryRun (report shape, report paths recorded, manifest-missing/invalid rejection before DB calls, failed-execution marking, no confirmDestructive requirement)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-07-11
status: complete
---

# Phase 03 Plan 03: Dry-Run Transformations and Report Evidence Summary

**Real read-only `data dry-run` command: manifest-scoped legacy source readers, a mapper-driven dry-run planner classifying inserts/updates/skips/conflicts/orphans with retry-aware ID-map reclassification, and persisted data-quality findings — replacing the Phase 1 stub body.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-07-11
- **Completed:** 2026-07-11
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `apps/dgfy-migration-runner/src/data/legacySource.js` reads landlord-scoped legacy source data (`tenants`, `dgfy_accounts`, `dgfy_account_tenant_memberships`) scoped strictly to the manifest's `legacy_tenant_id` targets via `WHERE id IN (...)`/`WHERE tenant_id IN (...)` clauses — issuing zero queries when the target list is empty — and reads tenant-local data (`users`, `tenant_locations`, `user_location_grants`, and the single `pos_terminal_registry` `system_settings` row) for a single already-scoped legacy tenant connection. Zero backend runtime imports and zero Sequelize/mysql2 imports; every excluded table (`pos_transactions`, `pos_terminal_shifts`, fiscal, product/inventory) is structurally never named in a query, not runtime-filtered.
- `apps/dgfy-migration-runner/src/data/dryRun.js` builds the full per-target migration plan by calling the exact pure mapper functions 03-02 shipped (`mapLegacyAccountToDgfyAccount`, `mapLegacyTenantToBusiness`, `mapLegacyMembershipToBusinessMembership`, `mapLegacyUserToStaffAccount`, `mapLegacyAccountStaffAssignment`, `mapLegacyLocationToLocation`, `mapTerminalRegistryEntryToTerminalIdentity`), resolving `staffAccountId`/`locationId` caller inputs from within the same tenant's plan build so assignments/terminals only orphan when genuinely unresolved (never inferred).
- A single `SELECT ... FROM legacy_id_map WHERE run_scope = ?` resolves every existing durable mapping for the run in one query; `buildDryRunPlan()` reclassifies any mapper `insert` result to `update` when its `legacy_id_map_key` is already mapped — proving the plan's "classify existing target rows as updates using ID-map" threat mitigation without a database round trip per record.
- `summarizeDryRunReport()` produces a strictly scalar `summary` object (`planned_inserts`/`planned_updates`/`planned_skips`/`planned_conflicts`/`orphan_records`/`tenant_coverage_count`) plus a separate `tenant_coverage` array with per-tenant `entities_planned` counts — matching the plan's "scalar summary, detailed arrays in JSON" split.
- `runDryRunTransformations()` orchestrates read-only landlord + per-tenant legacy connections, persists every skip/conflict/orphan finding via `recordDataQualityFinding()`, and — verified structurally by a source-scan test — never references a target/business connection factory or checkpoint-marking call.
- `runDataDryRun()` in `commands/data.js` now passes `{ requireMigrationManifest: true }` to `validateEnv()`, loads and validates the manifest before any DB connection, runs the real planner, and writes JSON+summary reports with report paths recorded in `command_executions` — while preserving the original ordering, failure-handling, and no-`--confirm-destructive`-required contract from the Phase 1 stub.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add read-only legacy source snapshot reader** - `8777c71f` (feat)
2. **Task 2: Build dry-run report planner with persisted findings** - `612a49be` (feat)
3. **Task 3: Wire `data dry-run` command to manifest, metadata, and reports** - `bbced458` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/data/legacySource.js` - `readLegacyLandlordSnapshot()`, `readLegacyTenantSnapshot()`
- `apps/dgfy-migration-runner/src/data/dryRun.js` - `buildDryRunPlan()`, `summarizeDryRunReport()`, `runDryRunTransformations()`, `DEFAULT_RUN_SCOPE`
- `apps/dgfy-migration-runner/src/commands/data.js` - real `runDataDryRun()` orchestration (manifest load, planner call, report shape)
- `apps/dgfy-migration-runner/tests/dataDryRun.test.js` - legacySource.js scoping/exclusion tests, buildDryRunPlan/summarizeDryRunReport pure-function tests, runDryRunTransformations orchestration tests
- `apps/dgfy-migration-runner/tests/dataCommand.test.js` - updated `runDataDryRun` tests (manifest gating, real report shape, failure marking) with `targetManifest.js`/`dryRun.js` mocked at the module level

## Decisions Made

- Passed `{ requireMigrationManifest: true }` to `validateEnv()` in `runDataDryRun()` — the exact opt-in flag 03-01 added specifically so data dry-run/apply/verify command wiring could enforce manifest presence without affecting `schema`/`status`/`rollback-plan`.
- Changed the dry-run report shape: Phase 1's stub had `summary.tenant_coverage` as an array; this plan's `summarizeDryRunReport()` instead emits a scalar `summary.tenant_coverage_count` with the actual per-tenant array as a separate top-level `tenant_coverage` field, satisfying the plan's explicit "summary output uses scalar fields only; detailed arrays remain JSON report content" acceptance criterion.
- `dataCommand.test.js` mocks `../src/data/targetManifest.js` and `../src/data/dryRun.js` as whole modules (rather than mocking their internals or letting them run for real) so command-level orchestration/gating tests stay independent of dry-run's actual mapper-driven logic, which is fully covered by `dataDryRun.test.js` instead — avoids duplicate/overlapping test coverage across two files.
- `idMapLookupKey()` in `dryRun.js` destructures the snake_case `{ legacy_source, legacy_table, legacy_id }` shape directly (matching both `legacy_id_map_key` mapper output and raw `legacy_id_map` table rows) rather than requiring a camelCase translation at every call site — this was corrected mid-implementation after a self-caught test failure (see Issues Encountered).

## Deviations from Plan

None beyond the documented decisions above (already covered under "Decisions Made"). No architectural changes, no scope expansion beyond `legacySource.js`, `dryRun.js`, updated `commands/data.js`, and their tests.

## Issues Encountered

- **Self-caught bug during test-writing:** an initial `idMapLookupKey()` implementation destructured camelCase field names (`legacySource`/`legacyTable`/`legacyId`) but `mappings.js`'s `legacy_id_map_key` objects and raw `legacy_id_map` table rows both use snake_case (`legacy_source`/`legacy_table`/`legacy_id`) — this silently produced `"undefined|undefined|undefined"` lookup keys everywhere, so the insert->update reclassification never fired. Caught by three failing unit tests (`buildDryRunPlan` reclassification test, staff-resolution test, and the `runDryRunTransformations` update-classification test); fixed by making `idMapLookupKey()` accept the snake_case shape directly at its single definition site.
- **Self-caught doc-comment self-reference:** the structural test asserting `dryRun.js` never references `createTargetConnection`/`createBusinessTargetConnection`/`markDataCheckpoint` initially failed against the file's own JSDoc comments, which named those functions literally while explaining why they're never called. Reworded the comments to describe the contract without the literal identifiers (mirroring the project's existing pattern of avoiding literal grep-matched substrings in comments, per STATE.md's Dockerfile precedent).
- Both were caught and fixed before any task commit; no broken code was ever committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-04 (checkpointed apply) can reuse `DEFAULT_RUN_SCOPE` from `dryRun.js`, the same pure mappers from `mappings.js`, and the same `legacy_id_map`/`data_quality_findings` durable rows this dry-run wrote — apply mode should call `markDataCheckpoint()` and the target `bulkInsert`/`bulkUpdate` helpers that dry-run intentionally never calls.
- Plan 03-04 should follow the same staff-before-assignments and locations-before-terminals ordering `buildDryRunPlan()` established, since assignment/terminal mappers require caller-resolved `staffAccountId`/`locationId` inputs.
- Plan 03-05 (verification/retry evidence) can query the `data_quality_findings` rows this dry-run persisted (scoped by `DEFAULT_RUN_SCOPE`) as part of its MIG-05 reconciliation.
- `runDataApply()` in `commands/data.js` remains the unmodified Phase 1 stub — 03-04 owns replacing it with real checkpointed writes.
- No blockers identified for subsequent Phase 03 plans.

## Self-Check: PASSED

All created files and task commit hashes verified present in the working tree and git history:
- `apps/dgfy-migration-runner/src/data/legacySource.js` - FOUND
- `apps/dgfy-migration-runner/src/data/dryRun.js` - FOUND
- `apps/dgfy-migration-runner/tests/dataDryRun.test.js` - FOUND
- `8777c71f`, `612a49be`, `bbced458` - FOUND in git log

---
*Phase: 03-old-to-new-migration-proof*
*Completed: 2026-07-11*
