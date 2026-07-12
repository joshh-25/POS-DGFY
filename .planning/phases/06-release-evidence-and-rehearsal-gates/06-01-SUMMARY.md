---
phase: 06-release-evidence-and-rehearsal-gates
plan: 01
subsystem: infra
tags: [migration-runner, inquirer, commander, sequelize, mysql, release-evidence, cli]

# Dependency graph
requires:
  - phase: 04-backend-accounts-businesses-and-tenancy-foundation
    provides: business_database_registry schema, activate-tenant CLI, registry status enum (provisioning|active|migrating|deprecated)
  - phase: 02-dgfy-database-foundation
    provides: dgfyBusinessContract/dgfyCoreContract schema contracts, verify.js drift-check engine
provides:
  - Interactive `release-evidence` migration-runner subcommand (registry discovery + operator checkbox selection)
  - Exported checkContractSchema (drift engine) and checkMigrationMetadata (migration-ledger engine) from verify.js, reusable by sibling commands
  - Two distinct evidence report streams: tenant_drift.json/.md and migration_verification.json/.md
affects: [06-02, 06-03]

# Tech tracking
tech-stack:
  added: ["@inquirer/prompts@^8 (runner-only dependency)"]
  patterns:
    - "Command modules reuse verify.js's exported checkContractSchema/checkMigrationMetadata rather than duplicating drift/ledger logic"
    - "TTY guard before any interactive prompt — fail closed, never fall back to an implicit 'select all' default"

key-files:
  created:
    - apps/dgfy-migration-runner/src/commands/releaseEvidence.js
    - apps/dgfy-migration-runner/tests/releaseEvidence.test.js
  modified:
    - apps/dgfy-migration-runner/src/commands/verify.js
    - apps/dgfy-migration-runner/src/cli.js
    - apps/dgfy-migration-runner/package.json
    - apps/dgfy-migration-runner/tests/cliContract.test.js

key-decisions:
  - "@inquirer/prompts@^8 installed runner-only (npm --prefix apps/dgfy-migration-runner); mysql2 ^3.6.5 pin left untouched"
  - "checkContractSchema and checkMigrationMetadata exported in place from verify.js (not factored into a shared module) — lowest blast radius, mirrors existing buildMigrationsForKind reuse pattern"
  - "Tenant selection is a single shared metadata connection (createMetaConnection) opened once for all selected tenants, mirroring runVerify()'s own metaSequelize reuse"
  - "Zero active tenants short-circuits to a no_targets:true report and returns ok:true without ever reaching the TTY guard or prompting — an empty registry is not a failure"

patterns-established:
  - "Release-evidence commands wrap each evidence source (drift vs migration-ledger) in its own independent try/catch so a metadata-store failure is never relabeled as a drift result, and vice versa"

requirements-completed: [CMP-04]

coverage:
  - id: D1
    description: "Operator sees a live checklist of active tenants sourced from business_database_registry JOIN businesses and explicitly picks which to include"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "tests/releaseEvidence.test.js#produces tenant_drift and migration_verification report payloads with no credential-named keys"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each selected tenant is both drift-checked (checkContractSchema) and migration-verified (checkMigrationMetadata against dgfy_migration_meta), producing two distinct, correctly-sourced reports"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "tests/releaseEvidence.test.js#produces tenant_drift and migration_verification report payloads with no credential-named keys"
        status: pass
    human_judgment: false
  - id: D3
    description: "Command fails closed on non-TTY stdin or invalid env — never falls back to an all-tenants run"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "tests/releaseEvidence.test.js#throws (never falls back to an all-tenants run) when process.stdin.isTTY is falsy"
        status: pass
      - kind: unit
        ref: "tests/releaseEvidence.test.js#with invalid/missing env, runReleaseEvidence rejects with EnvValidationError and never opens a connection"
        status: pass
    human_judgment: false
  - id: D4
    description: "release-evidence CLI subcommand registered with --evidence-dir option, real-MySQL run against a live registry (deferred to operator — no MySQL reachable in this sandbox)"
    verification:
      - kind: unit
        ref: "tests/releaseEvidence.test.js#buildProgram() registers 'release-evidence' with an --evidence-dir option"
        status: pass
    human_judgment: true
    rationale: "The interactive checkbox prompt and live MySQL registry/drift/ledger checks require a DB-reachable, TTY-attached environment this sandbox does not have. The RUN_RELEASE_EVIDENCE_INTEGRATION-gated test proves the wiring; an operator must run `dgfy-migration-runner release-evidence` against real infrastructure to confirm end-to-end behavior."

# Metrics
duration: 10min
completed: 2026-07-12
status: complete
---

# Phase 06 Plan 01: Interactive Release-Evidence Command Summary

**New `release-evidence` migration-runner subcommand that discovers active tenants live from `business_database_registry`, lets the operator checkbox-select which ones to include, and produces two distinct reviewable reports (tenant-drift via the reused schema-conformance engine, migration-verification via the reused `dgfy_migration_meta` ledger engine).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-12T05:56:32Z
- **Completed:** 2026-07-12T06:06:18Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- Exported `checkContractSchema` (drift engine) and `checkMigrationMetadata` (migration-ledger engine) from `verify.js` for zero-duplication reuse
- Built `releaseEvidence.js`: live registry discovery (`business_database_registry JOIN businesses WHERE status='active' AND verified_at IS NOT NULL`), an `@inquirer/prompts` checkbox selection step, and per-tenant drift + migration-verification checks writing two distinct JSON+markdown reports
- Registered `release-evidence` as a first-class Commander subcommand with `--evidence-dir <dir>`
- Added a DB-free jest suite proving CLI registration, fail-closed TTY/env behavior, no-secrets report shape, and the zero-active-tenants no-op path; a real-MySQL path is gated behind `RUN_RELEASE_EVIDENCE_INTEGRATION`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add @inquirer/prompts and export verify.js's drift engine** - `b341224d` (feat)
2. **Task 2: Build the interactive release-evidence command** - `106c4321` (feat)
3. **Task 3: Register the release-evidence subcommand in cli.js and add jest coverage** - `1ece7b4b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/dgfy-migration-runner/src/commands/releaseEvidence.js` - NEW: `runReleaseEvidence({ evidenceDir })` — registry discovery, checkbox selection, per-tenant drift + migration-verification, report writing
- `apps/dgfy-migration-runner/tests/releaseEvidence.test.js` - NEW: jest suite (CLI registration, fail-closed TTY/env, no-secrets report shape, zero-tenant path, RUN_RELEASE_EVIDENCE_INTEGRATION-gated real-MySQL path)
- `apps/dgfy-migration-runner/src/commands/verify.js` - MODIFIED: `checkContractSchema` and `checkMigrationMetadata` now `export`ed (no behavior change)
- `apps/dgfy-migration-runner/src/cli.js` - MODIFIED: registers `release-evidence` subcommand wired to `runReleaseEvidence`
- `apps/dgfy-migration-runner/package.json` - MODIFIED: adds `@inquirer/prompts@^8.5.2` dependency (mysql2 `^3.6.5` pin unchanged)
- `apps/dgfy-migration-runner/tests/cliContract.test.js` - MODIFIED: verify.js/schema.js mocks extended with the two newly-exported functions and `resolveTargetKind` so cli.js's real (unmocked) transitive load of `releaseEvidence.js` resolves at import time

## Decisions Made
- Installed `@inquirer/prompts@^8` scoped to the runner package only, matching the plan's package-legitimacy-approved recommendation; left `mysql2` pinned at `^3.6.5` per the existing STATE.md package-audit decision.
- Exported `checkContractSchema`/`checkMigrationMetadata` in place rather than factoring them into a new shared module — lower blast radius, and mirrors how `verify.js` already reuses `schema.js`'s `buildMigrationsForKind`.
- Zero active/verified tenants in the registry short-circuits to a `no_targets:true` report (`ok:true`) without ever reaching the TTY guard or prompting — an empty selection surface is not itself a failure; the Wave 2 gate decides pass/fail on that basis.
- Each selected tenant's drift check and migration-verification check are wrapped in independent try/catch blocks so a metadata-store failure is reported as `migrationResult.ok=false` with its own error detail, never silently relabeled as (or masked by) the drift result.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing `cliContract.test.js` breakage caused by cli.js's new transitive import chain**
- **Found during:** Task 3 (full-suite verification after registering `release-evidence`)
- **Issue:** `cli.js` now statically imports `releaseEvidence.js`, which statically imports `checkContractSchema`/`checkMigrationMetadata` from `verify.js` and `resolveTargetKind` from `schema.js`. `cliContract.test.js`'s existing mocks for `verify.js` (only `runVerify`) and `schema.js` (only `runSchemaMigrate`) didn't provide those exports, so `SyntaxError: The requested module ... does not provide an export named ...` broke 4 previously-passing dispatch tests when `cli.js` was imported.
- **Fix:** Added `checkContractSchema: jest.fn()`, `checkMigrationMetadata: jest.fn()` to the `verify.js` mock and `resolveTargetKind: jest.fn()` to the `schema.js` mock in `cliContract.test.js`. No test assertions changed — this only satisfies ESM's link-time export requirement for imports the suite never calls.
- **Files modified:** `apps/dgfy-migration-runner/tests/cliContract.test.js`
- **Verification:** `npm --prefix apps/dgfy-migration-runner test -- cliContract` — all 7 tests pass; full suite (`npm --prefix apps/dgfy-migration-runner test`) — 308 passed, 7 intentionally skipped (integration), 0 failed.
- **Committed in:** `1ece7b4b` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the existing test suite green after adding the new command's real import chain to cli.js. No scope creep — only mock surface area extended, no behavior or assertions changed.

## Issues Encountered
None beyond the deviation above.

## User Setup Required

None for this plan directly — `release-evidence` is operator-run on demand against a DB-reachable environment (per the plan's `user_setup` note: `TARGET_DB_HOST/PORT/USER/PASSWORD/NAME` supplied via the runner's existing env-validate-before-connect contract, no credentials in the repo). No MySQL was reachable in this execution sandbox, so the interactive flow and real-registry discovery could not be exercised end-to-end here; the `RUN_RELEASE_EVIDENCE_INTEGRATION`-gated test documents exactly how an operator verifies it against real infrastructure.

## Next Phase Readiness
- `checkContractSchema` and `checkMigrationMetadata` are now reusable exports — 06-02's seam-smoke runner and 06-03's orchestrator can shell out to (or import) this command without duplicating drift/ledger logic.
- `release-evidence --evidence-dir <dir>` is ready to be invoked by 06-03's `gate-release-dgfy-evidence.js` orchestrator as GATE 2 (migration.verification + tenant.drift), per the phase RESEARCH's architecture diagram.
- No blockers. SC2 (tenant-drift/migration-verification evidence) is now fully deliverable by this command; aggregation into the overall release verdict remains 06-03's job as planned.

---
*Phase: 06-release-evidence-and-rehearsal-gates*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created/modified files verified present on disk; all task commit hashes (`b341224d`, `106c4321`, `1ece7b4b`) and the summary commit (`33c7aa6b`) verified present in git history.
