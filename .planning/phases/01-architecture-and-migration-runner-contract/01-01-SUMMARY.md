---
phase: 01-architecture-and-migration-runner-contract
plan: 01
subsystem: infra
tags: [sequelize, mysql2, dotenv, node-esm, migration-runner, env-validation]

# Dependency graph
requires: []
provides:
  - "apps/dgfy-migration-runner standalone package scaffold (package.json, jest.config.cjs, .env.example)"
  - "validateEnv() pure env validation with RUNTIME_MODES enum + TARGET_DB_NAME_PATTERN allowlist"
  - "assertDestructiveAllowed() / assertTargetDbNameAllowed() safety gates"
  - "createSourceConnection() / createTargetConnection() / createMetaConnection() lazy DB factories"
  - "shared error classes + normalizeErrorSignature()/createCommandFailureRecord() fingerprinting"
  - "computeFileChecksum() migration-file checksum utility"
affects: [01-02, 01-03, 01-04, phase-2-schema, phase-3-data-migration]

# Tech tracking
tech-stack:
  added: [commander@^15.0.0, umzug@^3.8.3, sequelize@^6.37.8 (new package instance), mysql2@^3.6.5 (new package instance), dotenv@^16.6.1 (new package instance), jest@^29.7.0 (new package instance)]
  patterns: ["pure validation module with zero DB imports (RUN-03 ordering)", "lazy DB connection factories (no eager module-scope construction)", "sha-hash-and-truncate-to-16-chars fingerprinting for both error signatures and file checksums"]

key-files:
  created:
    - apps/dgfy-migration-runner/package.json
    - apps/dgfy-migration-runner/jest.config.cjs
    - apps/dgfy-migration-runner/.env.example
    - apps/dgfy-migration-runner/src/config/env.js
    - apps/dgfy-migration-runner/src/config/db.js
    - apps/dgfy-migration-runner/src/safety/destructiveGate.js
    - apps/dgfy-migration-runner/src/safety/targetGuard.js
    - apps/dgfy-migration-runner/src/utils/errors.js
    - apps/dgfy-migration-runner/src/metadata/checksum.js
    - apps/dgfy-migration-runner/tests/env.test.js
    - apps/dgfy-migration-runner/tests/safetyGates.test.js
    - apps/dgfy-migration-runner/tests/dbFactories.test.js
  modified: []

key-decisions:
  - "Inlined new Sequelize(...) separately in each of the three factory functions (createSourceConnection/createTargetConnection/createMetaConnection) rather than sharing one internal helper, so the plan's 'three occurrences live inside the three factory function bodies' behavior test is literally true, not just structurally equivalent"
  - "Pinned mysql2 to ^3.6.5 (not latest 3.22.6) per RESEARCH.md's package legitimacy audit flagging the newest publish SUS: too-new"

patterns-established:
  - "Env validation modules must be reachable and testable with zero DB client imports, enforced by a source-grep test, not just code review convention"
  - "DB connection factories take the validated config object (never process.env directly) and are only ever called inside command handlers after validateEnv() succeeds — never at module import time"

requirements-completed: [RUN-01, RUN-03]

coverage:
  - id: D1
    description: "validateEnv() rejects missing/malformed env (missing vars, bad runtime mode, non-dgfy_ TARGET_DB_NAME, missing production MIGRATION_ACTOR) and returns a fully populated config object when the env is complete and correctly shaped"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/env.test.js#validateEnv (6 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "assertDestructiveAllowed()/assertTargetDbNameAllowed() safety gates block destructive ops without --confirm-destructive and reject non-dgfy_-prefixed target DB names regardless of runtime mode"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/safetyGates.test.js (6 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "createSourceConnection/createTargetConnection/createMetaConnection are lazy, non-eager Sequelize factories consuming the validated config object; computeFileChecksum() produces deterministic 16-char hex digests"
    requirement: "RUN-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dbFactories.test.js (5 tests)"
        status: pass
    human_judgment: false

duration: 32min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 01: Migration Runner Scaffold + Validation Layer Summary

**Standalone `apps/dgfy-migration-runner` package with pure env validation, destructive-op/target-DB-name safety gates, and lazy Sequelize connection factories — zero DB connection possible before validation passes.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-10T11:02:16Z
- **Completed:** 2026-07-10T11:34:22Z
- **Tasks:** 3
- **Files modified:** 14 (11 source/test files + package.json + jest.config.cjs + .env.example; package-lock.json auto-generated)

## Accomplishments
- Scaffolded `apps/dgfy-migration-runner` as a standalone ESM Node package mirroring `apps/dgfy-api`'s conventions (own `package.json`, `jest.config.cjs`, `.env.example`), with `mysql2` pinned to the repo-aligned `^3.6.5` per the package legitimacy audit
- Built `validateEnv()` — a pure, DB-import-free function that collects ALL env violations (missing vars, invalid `RUNTIME_MODE`, non-`dgfy_`-prefixed `TARGET_DB_NAME`, missing `MIGRATION_ACTOR` in production) into a single error list, structurally guaranteeing validation happens before any DB connection
- Built `assertDestructiveAllowed()` and `assertTargetDbNameAllowed()` safety gates, plus shared `EnvValidationError`/`DestructiveOperationError`/`TargetGuardError`/`MetadataSchemaError` classes and `normalizeErrorSignature()`/`createCommandFailureRecord()` fingerprinting ported from `backend/scripts/sync-tenant-schemas.js`
- Built three lazy DB connection factories (`createSourceConnection`/`createTargetConnection`/`createMetaConnection`) and `computeFileChecksum()` for migration-file identity — all unit-testable without a live MySQL connection

## Task Commits

Each task was committed atomically:

1. **Task 1: Package scaffold + pure env validation module** - `b27f9d7a` (feat)
2. **Task 2: Safety gates (destructive-op + target-DB-name) and shared error classes** - `ff97cb1a` (feat)
3. **Task 3: Lazy DB connection factories + migration-file checksum utility** - `e9240886` (feat)

_All three tasks are `tdd="true"` — each commit bundles the behavior tests together with the implementation in a single atomic commit (tests + implementation were written and verified together before committing, rather than as separate RED/GREEN commits)._

## Files Created/Modified
- `apps/dgfy-migration-runner/package.json` - standalone app manifest (commander/dotenv/mysql2/sequelize/umzug deps, jest devDep)
- `apps/dgfy-migration-runner/jest.config.cjs` - byte-for-byte copy of `apps/dgfy-api`'s jest config
- `apps/dgfy-migration-runner/.env.example` - documents full `SOURCE_DB_*`/`TARGET_DB_*`/`RUNTIME_MODE`/`REPORT_DIR`/`MIGRATION_ACTOR` contract with placeholder-only values
- `apps/dgfy-migration-runner/src/config/env.js` - `RUNTIME_MODES`, `TARGET_DB_NAME_PATTERN`, `validateEnv()`
- `apps/dgfy-migration-runner/src/config/db.js` - `createSourceConnection()`, `createTargetConnection()`, `createMetaConnection()`
- `apps/dgfy-migration-runner/src/safety/destructiveGate.js` - `assertDestructiveAllowed()`
- `apps/dgfy-migration-runner/src/safety/targetGuard.js` - `assertTargetDbNameAllowed()` (imports pattern from `config/env.js`)
- `apps/dgfy-migration-runner/src/utils/errors.js` - error classes, `normalizeErrorSignature()`, `createCommandFailureRecord()`
- `apps/dgfy-migration-runner/src/metadata/checksum.js` - `computeFileChecksum()`
- `apps/dgfy-migration-runner/tests/env.test.js`, `tests/safetyGates.test.js`, `tests/dbFactories.test.js` - 17 tests total, all passing
- `apps/dgfy-migration-runner/tests/fixtures/checksum-a.txt`, `checksum-b.txt` - checksum determinism fixtures

## Decisions Made
- Inlined `new Sequelize(...)` in each of the three factory functions separately (rather than a shared internal helper) so the acceptance criterion "all three occurrences live inside the three factory function bodies" holds literally, not just in spirit
- Kept `mysql2` at `^3.6.5` per RESEARCH.md's package legitimacy audit (latest `3.22.6` flagged `SUS: too-new`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- My first draft of `tests/dbFactories.test.js`'s module-scope-scan test naively flagged a JSDoc comment line containing the literal string `` new Sequelize( `` as a false-positive top-level call. Fixed by filtering out comment lines (`*`, `//`, `/**`) before scanning for brace-depth and occurrence count. This was a test-authoring bug caught and fixed during Task 3's own TDD cycle, not a deviation from the plan.

## User Setup Required

None - no external service configuration required. `.env.example` ships with placeholder-only values (no real credentials).

## Next Phase Readiness
- `apps/dgfy-migration-runner`'s validation/safety/DB-factory layer is ready for Plan 02/03 to build the CLI dispatch (`src/cli.js`), command handlers (`src/commands/*.js`), metadata bootstrap (`src/metadata/bootstrap.js`, `src/metadata/storage.js`), and report writers on top of it
- No blockers. The `--confirm-destructive` CLI flag referenced in this plan's `artifacts_produced` is defined as a contract here (consumed by `assertDestructiveAllowed()`) but not yet wired to Commander — that wiring is explicitly deferred to Plan 03 per this plan's frontmatter

## Self-Check: PASSED

All 12 created files verified present on disk; all 3 task commit hashes (`b27f9d7a`, `ff97cb1a`, `e9240886`) verified in `git log`.

---
*Phase: 01-architecture-and-migration-runner-contract*
*Completed: 2026-07-10*
