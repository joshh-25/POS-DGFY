---
phase: 01-architecture-and-migration-runner-contract
plan: 03
subsystem: infra
tags: [commander, umzug, sequelize, mysql2, migration-runner, cli]

# Dependency graph
requires:
  - phase: 01-01
    provides: "validateEnv(), assertDestructiveAllowed()/assertTargetDbNameAllowed(), lazy DB connection factories, shared error classes"
  - phase: 01-02
    provides: "ensureMetadataSchema()/recordCommandStart()/recordCommandComplete(), MetaSequelizeStorage, writeJsonReport()/writeSummaryReport()"
provides:
  - "runSchemaMigrate() driving the placeholder migration through Umzug end-to-end"
  - "runDataDryRun()/runDataApply() Phase 1 contract stubs (dry-run never destructive, apply unconditionally destructive-gated, rows_written always 0)"
  - "runVerify() metadata-schema + target-DB-connectivity check that reports findings instead of throwing"
  - "runStatus() recent command_executions + Umzug executed() migration count"
  - "runRollbackPlan() static rollback-plan artifact generator that never calls down()"
  - "src/cli.js Commander program wiring all six RUN-02 subcommands, with buildProgram() exported for in-process dispatch tests"
affects: [01-04, phase-2-schema, phase-3-data-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filesystem-scan destructive-op precheck: isDestructive is computed by reading migration files directly off disk (not via umzug.pending()) so the D-09 gate runs before any DB connection factory is invoked"
    - "isMainModule-guarded CLI entry: src/cli.js exports buildProgram() and only self-invokes main() when it is the actual process entry point, so tests can reuse the real Commander wiring in-process"
    - "validate -> guard -> connect -> bootstrap -> record -> report command handler skeleton, replicated identically across schema.js/data.js/verify.js/status.js/rollbackPlan.js"

key-files:
  created:
    - apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs
    - apps/dgfy-migration-runner/src/commands/schema.js
    - apps/dgfy-migration-runner/src/commands/data.js
    - apps/dgfy-migration-runner/src/commands/verify.js
    - apps/dgfy-migration-runner/src/commands/status.js
    - apps/dgfy-migration-runner/src/commands/rollbackPlan.js
    - apps/dgfy-migration-runner/src/cli.js
    - apps/dgfy-migration-runner/tests/schemaCommand.test.js
    - apps/dgfy-migration-runner/tests/dataCommand.test.js
    - apps/dgfy-migration-runner/tests/reportCommands.test.js
    - apps/dgfy-migration-runner/tests/cliContract.test.js
  modified: []

key-decisions:
  - "Computed the D-09 per-migration-file destructive check via a direct fs.readdirSync scan of src/migrations/schema/*.cjs (not umzug.pending()) — umzug.pending() requires a working MetaSequelizeStorage backed by a real metaSequelize connection, which the acceptance criteria and test explicitly require NOT to exist yet at the point the destructive gate runs. The filesystem scan is a conservative superset (checks ALL declared migrations, not just pending ones) and satisfies the same D-09 intent without the ordering conflict."
  - "Exported buildProgram() from src/cli.js and guarded the self-invoking main() with an isMainModule check (mirroring backend/scripts/sync-tenant-schemas.js's pattern cited in this plan's own read_first list), instead of the plan's literal 'always the main entry, no guard needed' instruction — without this guard, importing cli.js from a test would immediately parse the real process.argv and call process.exit, making CLI dispatch untestable in-process."
  - "rollbackPlan.js resolves each executed migration's meta fields via Node's shared CommonJS require() cache keyed by absolute path — this lets tests spy on the real placeholder migration's exported down function (proving zero invocations) without needing a separate fixture migration file."

requirements-completed: [RUN-02]

coverage:
  - id: D1
    description: "schema migrate, data dry-run, data apply --confirm-destructive, verify, status, and rollback-plan are all reachable, --help-discoverable Commander subcommands from one CLI entry (src/cli.js)"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/cliContract.test.js (5 tests: --help/schema --help/data --help child-process assertions + 2 mocked dispatch tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "runSchemaMigrate() drives the additive placeholder migration through Umzug end-to-end using the Plan 02 metadata store, requiring no --confirm-destructive flag since meta.destructive is false"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/schemaCommand.test.js (3 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "runDataApply() is destructive-gated: rejects with DestructiveOperationError and calls zero DB connection factories when --confirm-destructive is absent; when confirmed, the Phase 1 stub report always has rows_written: 0. runDataDryRun() never requires the flag."
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataCommand.test.js (3 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "runVerify()/runStatus()/runRollbackPlan() follow the validate->guard->connect->bootstrap->record->report contract; rollback-plan never invokes a migration's down() while still returning a non-empty results array"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/reportCommands.test.js (4 tests)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 03: Migration Runner CLI Command Surface Summary

**All six RUN-02 commands (schema migrate, data dry-run/apply, verify, status, rollback-plan) wired as one Commander CLI, with schema migrate driving a real placeholder migration through Umzug against the Plan 02 metadata store.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-10T11:16:00Z
- **Completed:** 2026-07-10T11:30:07Z
- **Tasks:** 3
- **Files modified:** 11 (all new: 1 migration file, 5 command handlers, 1 CLI entry, 4 test files)

## Accomplishments
- Built `runSchemaMigrate()` which drives a real, additive placeholder migration (`runner_contract_placeholder` table) through Umzug's `up()`/`pending()` against `MetaSequelizeStorage`, proving the full Umzug + Plan 02 metadata + report-writer integration end-to-end
- Built `runDataDryRun()`/`runDataApply()` as Phase 1 contract stubs: dry-run is never destructive-gated, apply is unconditionally destructive-gated (zero connection-factory calls without `--confirm-destructive`) and always reports `rows_written: 0`
- Built `runVerify()` (reports metadata-schema and target-DB-connectivity findings as booleans instead of throwing), `runStatus()` (recent `command_executions` + Umzug `executed()` count), and `runRollbackPlan()` (statically reads `meta.rollbackDescription`/`meta.estimatedRisk` off each executed migration file, never calling `down()`)
- Built `src/cli.js` wiring all six commands as nested/top-level Commander subcommands (`schema migrate`, `data dry-run`, `data apply`, `verify`, `status`, `rollback-plan`), all `--help`-discoverable from one entry point

## Task Commits

Each task was committed atomically:

1. **Task 1: Placeholder schema migration + schema-migrate command (Umzug wiring)** - `f3dcfc36` (feat)
2. **Task 2: data / verify / status / rollback-plan command handlers** - `21ffe1ec` (feat)
3. **Task 3: Commander CLI dispatch wiring all six commands** - `43185ce6` (feat)

_All three tasks are `tdd="true"` — each commit bundles the behavior tests together with the implementation in a single atomic commit, consistent with Plan 01/02's precedent._

## Files Created/Modified
- `apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs` - additive placeholder migration (`meta.destructive: false`, creates `runner_contract_placeholder`)
- `apps/dgfy-migration-runner/src/commands/schema.js` - `runSchemaMigrate()`
- `apps/dgfy-migration-runner/src/commands/data.js` - `runDataDryRun()`, `runDataApply()`
- `apps/dgfy-migration-runner/src/commands/verify.js` - `runVerify()`
- `apps/dgfy-migration-runner/src/commands/status.js` - `runStatus()`
- `apps/dgfy-migration-runner/src/commands/rollbackPlan.js` - `runRollbackPlan()`
- `apps/dgfy-migration-runner/src/cli.js` - `buildProgram()` (exported), isMainModule-guarded `main()`
- `apps/dgfy-migration-runner/tests/schemaCommand.test.js`, `tests/dataCommand.test.js`, `tests/reportCommands.test.js`, `tests/cliContract.test.js` - 15 new tests total, all passing

## Decisions Made
- Computed the D-09 destructive-op check via a direct filesystem scan of migration files instead of `umzug.pending()`, resolving an ordering conflict between the plan's literal step sequence and its own acceptance criterion (guard calls must precede any DB connection factory call) — see `key-decisions` in frontmatter for full rationale
- Exported `buildProgram()` from `cli.js` and added an `isMainModule` guard (not in the plan's literal action text) so the CLI's real dispatch wiring is testable in-process against mocked command modules, rather than only via slower child-process `--help` snapshots
- Used Node's shared CommonJS `require()` cache to let `reportCommands.test.js` spy on the real placeholder migration's `down` export and prove `rollbackPlan.js` never calls it, avoiding a redundant fixture migration file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Resolved impossible connection ordering in the schema-migrate destructive gate**
- **Found during:** Task 1 (`runSchemaMigrate`)
- **Issue:** The plan's literal action text computes `isDestructive` from `umzug.pending()`, which requires a working `MetaSequelizeStorage` backed by a live `metaSequelize` connection — but the plan's own acceptance criteria and Test 3 require `assertDestructiveAllowed` to run BEFORE any `createTargetConnection`/`createMetaConnection` call. These two requirements are mutually exclusive as literally written.
- **Fix:** Compute `isDestructive` via a plain `fs.readdirSync` scan of `src/migrations/schema/*.cjs`, checking each file's `meta.destructive` flag directly (no Umzug, no DB). This runs before any connection factory call and is a conservative superset of "pending migrations" (checks all declared migrations, not just unexecuted ones). The real Umzug instance (with `context`/`storage` backed by the just-created connections) is still built and used afterward for `pending()`/`up()`, so the report's `total_pending`/`executed` counts are accurate.
- **Files modified:** `apps/dgfy-migration-runner/src/commands/schema.js`
- **Verification:** `tests/schemaCommand.test.js` Test 3 asserts call order (`assertTargetDbNameAllowed`/`assertDestructiveAllowed` before `createTargetConnection`/`createMetaConnection`) via isolated module mocks; Tests 1-2 confirm the migration still executes successfully and is reported.
- **Committed in:** `f3dcfc36` (part of Task 1 commit)

**2. [Rule 1 - Bug] Made src/cli.js's dispatch wiring testable without spawning a full process**
- **Found during:** Task 3 (`src/cli.js`)
- **Issue:** The plan's literal action text has `cli.js` unconditionally call `main().catch(...)` at module scope with no guard, on the stated reasoning that "cli.js is ALWAYS the main entry." Importing such a module from a test would immediately parse the real `process.argv` (the Jest worker's argv, not test-controlled) and could call `process.exit`, making Test 2/3's "invoking the parsed CLI with argv [...] calls runDataApply" behavior impossible to implement as an in-process unit test.
- **Fix:** Extracted the Commander wiring into an exported `buildProgram()` function and guarded the `main()` self-invocation with an `isMainModule` check (the same pattern this plan's own `read_first` list cites from `backend/scripts/sync-tenant-schemas.js` lines 638-645). Running `node src/cli.js ...` directly is unaffected (isMainModule is true); importing `buildProgram` from a test does not trigger process-level side effects.
- **Files modified:** `apps/dgfy-migration-runner/src/cli.js`
- **Verification:** `tests/cliContract.test.js` — 3 real child-process `--help` assertions (unaffected by the guard) plus 2 in-process `buildProgram()` dispatch tests asserting `--confirm-destructive` threads correctly into `runDataApply`.
- **Committed in:** `43185ce6` (part of Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug fixes resolving internal plan contradictions, not scope changes)
**Impact on plan:** Both fixes preserve every stated acceptance criterion and behavior test from the plan; no scope creep, no Phase 2/3 logic introduced.

## Issues Encountered

None beyond the two auto-fixed items documented above.

## User Setup Required

None - no external service configuration required. All four new test suites run against mocked `config/db.js`/`metadata/bootstrap.js`/`metadata/storage.js` modules or real temp-directory report writes; no live MySQL connection needed to verify this plan.

## Next Phase Readiness
- `apps/dgfy-migration-runner`'s full command surface (`schema migrate`, `data dry-run`, `data apply`, `verify`, `status`, `rollback-plan`) is implemented, tested, and dispatchable from one CLI entry — RUN-02 is complete
- Phase 2 (real `dgfy_*` landlord/tenant schema) can add real migration files under `src/migrations/schema/` and they will be picked up automatically by `runSchemaMigrate()`'s glob-based Umzug wiring and by `runRollbackPlan()`'s static meta-field reader, with no changes needed to `cli.js` or the command handlers
- Phase 3 (real data migration logic) replaces the `data.js` stub bodies (`runDataDryRun`/`runDataApply`) while keeping their validate/guard/connect/bootstrap/record/report skeleton intact
- No blockers. Plan 04 (Dockerfile / one-shot container packaging, per RUN-01) can proceed — `package.json`'s `"main": "src/cli.js"` and `"start": "node src/cli.js"` are already correct for a container `CMD`.

## Self-Check: PASSED

All 11 created files verified present on disk; all 3 task commit hashes (`f3dcfc36`, `21ffe1ec`, `43185ce6`) verified in `git log`. Full test suite (`npm --prefix apps/dgfy-migration-runner test`) passes with 46/46 tests green across 10 suites (31 from Plans 01-02 + 15 new from this plan).

---
*Phase: 01-architecture-and-migration-runner-contract*
*Completed: 2026-07-10*
