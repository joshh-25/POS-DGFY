---
phase: 01-architecture-and-migration-runner-contract
plan: 02
subsystem: infra
tags: [sequelize, umzug, mysql2, migration-metadata, audit-log, reporting]

# Dependency graph
requires: ["01-01"]
provides:
  - "ensureMetadataSchema() self-heal-then-validate dgfy_migration_meta bootstrap"
  - "recordCommandStart()/recordCommandComplete() per-command audit log rows"
  - "MetaSequelizeStorage — Umzug custom storage backed by dgfy_migration_meta.schema_migrations"
  - "writeJsonReport()/writeSummaryReport() dual JSON+human-readable report writers"
affects: [01-03, 01-04, phase-2-schema, phase-3-data-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["self-heal-on-first-run, fail-fast-on-mismatch metadata bootstrap (never silent addColumn)", "separate JSON + summary.txt report pair sharing one timestamp prefix"]

key-files:
  created:
    - apps/dgfy-migration-runner/src/metadata/bootstrap.js
    - apps/dgfy-migration-runner/src/metadata/storage.js
    - apps/dgfy-migration-runner/src/reports/reportWriter.js
    - apps/dgfy-migration-runner/src/reports/summaryWriter.js
    - apps/dgfy-migration-runner/tests/metadataBootstrap.test.js
    - apps/dgfy-migration-runner/tests/umzugStorage.test.js
    - apps/dgfy-migration-runner/tests/reportWriter.test.js
  modified: []

key-decisions:
  - "ensureMetadataSchema() wraps showAllTables() in try/catch to detect an 'Unknown database' MySQL error and self-heal via a short-lived raw mysql2 connection (no DB selected) issuing CREATE DATABASE IF NOT EXISTS, reusing metaSequelize.config's host/username/password — matches D-08's self-heal-on-first-run contract without requiring a pre-existing dgfy_migration_meta database"
  - "Column-mismatch detection compares only column presence (Object.keys(expected) vs describeTable() keys), not full type/nullability equality — sufficient to satisfy D-08's fail-fast contract while avoiding false positives from driver-reported type string variations"
  - "buildSummaryLine() explicitly skips any summary field whose value is a non-null object/array, guaranteeing the acceptance criterion (grep for '\"summary\":'/'\"results\":' returns 0) holds for any report shape, not just the tested fixtures"

requirements-completed: [RUN-04, RUN-05]

coverage:
  - id: D1
    description: "ensureMetadataSchema() self-heals (creates missing tables) on first run, is an idempotent no-op when both tables already match the expected column contract, and rejects with MetadataSchemaError (never a silent addColumn) when an existing table is missing an expected column"
    requirement: "RUN-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/metadataBootstrap.test.js#ensureMetadataSchema (3 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "recordCommandStart()/recordCommandComplete() write a full per-command audit trail row (command/mode/actor/timestamps/exit_status) via bulkInsert/bulkUpdate against command_executions"
    requirement: "RUN-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/metadataBootstrap.test.js#recordCommandStart, #recordCommandComplete (2 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "MetaSequelizeStorage implements Umzug's logMigration/unlogMigration/executed contract against dgfy_migration_meta.schema_migrations, with executed() returning a plain array of migration-name strings"
    requirement: "RUN-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/umzugStorage.test.js (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every command run produces a separate JSON report file and human-readable summary.txt file sharing the same timestamp prefix, with the summary also printed to stdout and never containing a raw JSON dump"
    requirement: "RUN-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/reportWriter.test.js (5 tests)"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 02: Migration Metadata Store + Report Writers Summary

**Self-healing dgfy_migration_meta bootstrap with fail-fast column-contract validation, a per-command audit log, a Umzug custom storage adapter, and dual JSON+human-readable report writers — the metadata/reporting substrate every Plan 03 command handler calls into.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-10T11:05:00Z
- **Completed:** 2026-07-10T11:15:46Z
- **Tasks:** 3
- **Files modified:** 7 (4 source files + 3 test files)

## Accomplishments
- Built `ensureMetadataSchema()` implementing D-08's self-heal-then-validate contract: detects a missing `dgfy_migration_meta` database via a MySQL "Unknown database" error, self-heals it with a short-lived raw `mysql2` `CREATE DATABASE IF NOT EXISTS` connection, creates `command_executions`/`schema_migrations` when tables are missing, and — critically — throws `MetadataSchemaError` (never a silent `addColumn`) when an existing table's column set doesn't match the expected contract, directly mitigating threat T-01-04
- Built `recordCommandStart()`/`recordCommandComplete()` producing the D-06 full per-command audit trail (command/mode/actor/runtime_mode/timestamps/exit_status/report paths), fetching the inserted id via a separate `LAST_INSERT_ID()` query since `bulkInsert` doesn't reliably return ids across dialects
- Built `MetaSequelizeStorage`, a drop-in Umzug `storage` option (`logMigration`/`unlogMigration`/`executed`) backed by `dgfy_migration_meta.schema_migrations` instead of the default `SequelizeMeta` table, per D-05/D-07's independent-permanent-metadata-schema requirement
- Built `writeJsonReport()`/`writeSummaryReport()` producing the D-16 file pair — `{timestamp}-{command}.json` and `{timestamp}-{command}.summary.txt` sharing the same timestamp prefix — with `buildSummaryLine()` staying a terse `key=value` line (never a JSON dump) and `writeSummaryReport()` echoing that line to stdout per D-13

## Task Commits

Each task was committed atomically:

1. **Task 1: Metadata bootstrap — self-heal, validate, and command execution audit log** - `218f4561` (feat)
2. **Task 2: Umzug custom storage backed by dgfy_migration_meta** - `aaed1635` (feat)
3. **Task 3: JSON report writer + human-readable summary writer** - `33efd102` (feat)

_All three tasks are `tdd="true"` — each commit bundles the behavior tests together with the implementation in a single atomic commit (tests + implementation were written and verified together before committing, rather than as separate RED/GREEN commits), consistent with Plan 01's precedent._

## Files Created/Modified
- `apps/dgfy-migration-runner/src/metadata/bootstrap.js` - `META_DB_NAME`/`COMMAND_EXECUTIONS_TABLE`/`SCHEMA_MIGRATIONS_TABLE` constants, `ensureMetadataSchema()`, `recordCommandStart()`, `recordCommandComplete()`
- `apps/dgfy-migration-runner/src/metadata/storage.js` - `MetaSequelizeStorage` class (Umzug custom storage)
- `apps/dgfy-migration-runner/src/reports/reportWriter.js` - `writeReportFile()`, `buildReportFileName()`, `writeJsonReport()`
- `apps/dgfy-migration-runner/src/reports/summaryWriter.js` - `buildSummaryLine()`, `writeSummaryReport()`
- `apps/dgfy-migration-runner/tests/metadataBootstrap.test.js` - 5 tests covering bootstrap self-heal/idempotent-no-op/fail-fast + audit log start/complete
- `apps/dgfy-migration-runner/tests/umzugStorage.test.js` - 4 tests covering `logMigration`/`unlogMigration`/`executed` + custom `tableName` override
- `apps/dgfy-migration-runner/tests/reportWriter.test.js` - 5 tests covering JSON/summary file pair, directory creation, shared timestamp prefix, and no-JSON-dump-in-summary-line

## Decisions Made
- `ensureMetadataSchema()`'s database-creation fallback reuses `metaSequelize.config`'s `host`/`username`/`password` for a short-lived unauthenticated-database `mysql2` connection, rather than requiring a separate admin connection config — keeps the env contract from Plan 01 unchanged
- Column-contract comparison checks presence only (not full type equality) via `describeTable()` — sufficient for D-08's fail-fast guarantee while avoiding false positives from MySQL driver type-string formatting differences
- `buildSummaryLine()` unconditionally skips any `summary` field whose value is a non-null object/array, so the "no raw JSON dump" acceptance criterion holds structurally for any future report shape, not just the tested fixtures

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. All three test suites run entirely against mocked Sequelize/QueryInterface objects or a real filesystem temp directory (`os.tmpdir()`); no live MySQL connection needed to verify this plan.

## Next Phase Readiness
- `apps/dgfy-migration-runner`'s metadata bootstrap, Umzug storage, and report writers are ready for Plan 03 to wire into the CLI dispatch (`src/cli.js`) and command handlers (`src/commands/*.js`)
- `command_executions`/`schema_migrations` column contracts are locked and tested; Plan 03's command handlers can call `recordCommandStart`/`recordCommandComplete`/`writeJsonReport`/`writeSummaryReport` directly against those exact shapes
- No blockers.

## Self-Check: PASSED

All 7 created files verified present on disk; all 3 task commit hashes (`218f4561`, `aaed1635`, `33efd102`) verified in `git log`. Full test suite (`npm --prefix apps/dgfy-migration-runner test`) passes with 31/31 tests green across 6 suites (17 from Plan 01 + 14 new from this plan).

---
*Phase: 01-architecture-and-migration-runner-contract*
*Completed: 2026-07-10*
