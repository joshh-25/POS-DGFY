---
phase: 02-dgfy-database-foundation
plan: 01
subsystem: dgfy-migration-runner
tags: [migration-runner, hardening, umzug, safety-gates, reporting]
dependency-graph:
  requires: []
  provides:
    - runner-pending-only-destructive-gate
    - runner-command-failure-audit
    - runner-container-safe-report-dir
  affects:
    - apps/dgfy-migration-runner
tech-stack:
  added: []
  patterns:
    - "Umzug resolveMigration() carries each migration module's `meta` object through onto the object pending()/up() return, so downstream gate logic can classify pending-only destructive migrations without a second filesystem scan or a second require() pass."
    - "Command handlers separate health-check findings (booleans in a report) from command/reporting failures (exit_status in command_executions) — a failed finding is not a command failure."
key-files:
  created: []
  modified:
    - apps/dgfy-migration-runner/src/commands/schema.js
    - apps/dgfy-migration-runner/src/commands/verify.js
    - apps/dgfy-migration-runner/src/config/env.js
    - apps/dgfy-migration-runner/src/cli.js
    - apps/dgfy-migration-runner/tests/schemaCommand.test.js
    - apps/dgfy-migration-runner/tests/reportCommands.test.js
    - apps/dgfy-migration-runner/tests/env.test.js
decisions:
  - "Attached each migration module's `meta` object to the object returned by resolveMigration() (name/meta/up/down) so Umzug's own pending() result already carries the destructive flag — avoiding a second require()-based file scan to compute pending-only destructive classification (D-17)."
  - "verify.js now distinguishes a failed health check (metadata_schema_ok/target_db_reachable false — a reported finding) from a genuine report-write failure (a real command/reporting failure) when deciding command_executions.exit_status, per D-18's narrower acceptance criteria; verify() itself still never throws."
  - "REPORT_DIR now defaults to the absolute /reports path the Dockerfile already provisions, rather than the dev-oriented relative ./reports, closing the WR-08/D-20 gap where operators who forgot to pass REPORT_DIR at runtime silently lost report evidence in the ephemeral container filesystem."
metrics:
  duration: 25min
  completed: 2026-07-11
status: complete
---

# Phase 02 Plan 01: Runner hardening before DGFY schema migrations Summary

Hardened the Phase 1 `dgfy-migration-runner`'s destructive-migration gate, command failure audit trail, and report directory default so Phase 02's real `dgfy_core`/`dgfy_business_*` schema migrations don't inherit an all-file destructive scan, silent `running`-stuck audit rows, or a report path that's lost on container removal.

## What Was Built

**Task 1 — Pending-only destructive detection (D-16/D-17).** Replaced `schema.js`'s WR-04 all-file destructive scan (`listMigrationFiles().some(...)`, run before any connection so it necessarily covered every migration file that ever existed) with a pending-only check computed after metadata bootstrap and `umzug.pending()` resolution. `resolveMigration()` now carries each migration module's `meta` object through onto the object Umzug returns, so `isPendingMigrationDestructive()` can read `.meta?.destructive` directly off the already-loaded pending migration objects — no second filesystem scan, no second `require()` pass, and no widening of the command beyond `src/migrations/schema`. Target DB name validation (`assertTargetDbNameAllowed`) still runs first, before any connection is opened; the destructive gate now runs after the meta connection + `umzug.pending()` but still strictly before `umzug.up()` (target mutation). Updated `schema migrate --help` in `cli.js` to describe the new pending-only contract instead of the old "confirm-destructive is required forever" caveat.

**Task 2 — Command failure audit completeness (D-18).** Confirmed via source inspection and Phase 1's `01-REVIEW-FIX.md` that `status.js`, `rollbackPlan.js`, and the bulk of `verify.js`'s CR-01 fix were already implemented in Phase 1's code-review fix pass (WR-03, CR-01) — added regression tests locking that behavior in for Phase 2's reliance on it (`status`/`rollback-plan` mark `command_executions.exit_status='failed'` and rethrow on any post-start failure). Found and fixed one real remaining gap: `verify.js` unconditionally recorded `exit_status='success'` even when its own `writeJsonReport`/`writeSummaryReport` calls genuinely threw. Now tracks the report-write error separately from health-check findings — a failed health check alone still completes as `success` (verify's job is to detect and report exactly that), but a genuine report-write failure now flips the row to `failed` with an `error_message`. `verify()` still never throws either way.

**Task 3 — Summary status and report directory defaults (D-19/D-20).** Confirmed `writeSummaryReport`/`buildSummaryLine` already accept an explicit `exitStatus` parameter and all five command handlers already pass `'success'` explicitly on their success paths (Phase 1's CR-02 fix) — added a regression test reading the actual written `.summary.txt` file to prove it contains `status=success` and never `status=unknown`. Fixed the one real remaining gap: `validateEnv()`'s `reportDir` default was still the dev-oriented relative `./reports` (matching `.env.example`) rather than the absolute `/reports` the Dockerfile pre-creates and chowns — an operator who forgot to pass `REPORT_DIR=/reports` at `docker run` time would silently lose all report evidence in the ephemeral container filesystem (WR-08). Default now resolves to `/reports`; an explicit `REPORT_DIR` override is still honored unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `verify.js` always recorded `exit_status='success'` even when report writing genuinely failed**
- **Found during:** Task 2, while writing the regression test for "verify records failure status only for command/reporting failure paths."
- **Issue:** `recordCommandComplete` in `verify.js` hardcoded `exitStatus: 'success'` regardless of whether `writeJsonReport`/`writeSummaryReport` threw, conflating "health check failed" (a finding) with "the command itself failed to report" (a real failure).
- **Fix:** Track the report-write error separately; only flip `exit_status` to `'failed'` (with `error_message`) when report writing itself throws. Health-check findings alone still complete as `success`. `verify()` continues to never throw.
- **Files modified:** `apps/dgfy-migration-runner/src/commands/verify.js`
- **Commit:** `3e238adb`

**2. [Rule 1 - Bug] `REPORT_DIR` default was the dev-oriented `./reports`, not the container-provisioned `/reports`**
- **Found during:** Task 3.
- **Issue:** `validateEnv()` defaulted `reportDir` to `./reports` when `REPORT_DIR` was unset, matching `.env.example`'s dev default but diverging from the Dockerfile's pre-created, chowned `/reports` mount (WR-08) — a container run without an explicit `REPORT_DIR` env var would silently write reports into the ephemeral image filesystem instead of the intended bind mount.
- **Fix:** Changed the fallback to `/reports`. `.env.example`'s dev-oriented override is left untouched per the plan's explicit instruction.
- **Files modified:** `apps/dgfy-migration-runner/src/config/env.js`
- **Commit:** `7715afe7`

**3. [Test-isolation bug, not part of Rules 1-4 but blocking Task 1] Stale mock leak across Jest ESM test files**
- **Found during:** Task 1, while adding the D-17 regression tests.
- **Issue:** An existing isolated test in `schemaCommand.test.js` locally mocked `../src/safety/destructiveGate.js` and `../src/safety/targetGuard.js` with permissive no-op stubs (`jest.unstable_mockModule(...)`) that always return `true`. That mock-factory registration outlived the test's own `jest.resetModules()` call and leaked into later tests in the same file that expected the *real* `assertDestructiveAllowed` to throw — silently making the destructive gate a no-op for those tests.
- **Fix:** Statically imported the real `assertDestructiveAllowed`/`assertTargetDbNameAllowed` implementations at the top of the test file and explicitly re-registered them as the mock factory for those two specifiers in the new D-17 describe block, so no earlier test's stub can shadow the real gate.
- **Files modified:** `apps/dgfy-migration-runner/tests/schemaCommand.test.js`
- **Commit:** `3a6ef089`

None of these required user input — all were fixed inline per Rules 1-3 (bug fixes / blocking-issue fixes directly caused by this plan's own task scope).

## TDD Gate Compliance

Each task followed RED → GREEN:
- Task 1: `test(02-01)` @ `5f27b516` (RED — 2 failing tests) → `feat(02-01)` @ `3a6ef089` (GREEN — all passing).
- Task 2: `test(02-01)` @ `35ade314` (RED — 1 failing test; 2 already-passing regression tests locking in Phase 1's existing fix) → `feat(02-01)` @ `3e238adb` (GREEN).
- Task 3: `test(02-01)` @ `665c1544` (RED — 1 failing test) → `feat(02-01)` @ `7715afe7` (GREEN, plus one additional passing regression assertion for D-19).

No refactor commits were needed beyond the fixes themselves.

## Verification

All plan verification commands pass:
```
npm --prefix apps/dgfy-migration-runner test -- schemaCommand.test.js   # 6/6
npm --prefix apps/dgfy-migration-runner test -- reportCommands.test.js  # 9/9
npm --prefix apps/dgfy-migration-runner test -- env.test.js reportWriter.test.js reportCommands.test.js  # 22/22
npm --prefix apps/dgfy-migration-runner test  # 56/56
```

`node --check` passed for all modified source files; `node src/cli.js schema migrate --help` confirmed the updated D-17 help text renders correctly.

## Known Stubs

None — this plan modifies only existing runner command/config code and tests; no new UI or data-flow stubs were introduced.

## Self-Check: PASSED

- FOUND: `apps/dgfy-migration-runner/src/commands/schema.js`
- FOUND: `apps/dgfy-migration-runner/src/commands/verify.js`
- FOUND: `apps/dgfy-migration-runner/src/config/env.js`
- FOUND: `apps/dgfy-migration-runner/src/cli.js`
- FOUND: `apps/dgfy-migration-runner/tests/schemaCommand.test.js`
- FOUND: `apps/dgfy-migration-runner/tests/reportCommands.test.js`
- FOUND: `apps/dgfy-migration-runner/tests/env.test.js`
- FOUND commit `5f27b516`, `3a6ef089`, `35ade314`, `3e238adb`, `665c1544`, `7715afe7` in `git log --oneline --all`
