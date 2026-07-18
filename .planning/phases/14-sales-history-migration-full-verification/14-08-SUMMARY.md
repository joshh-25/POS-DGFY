---
phase: 14-sales-history-migration-full-verification
plan: 08
subsystem: migration-verification
tags: [sales-history, migration-runner, rehearsal, jest, production-parity]

requires:
  - phase: 14-sales-history-migration-full-verification
    plan: 07
    provides: "Authoritative production-parity rehearsal runbook and no-false-VER-03 proof contract"
  - phase: 14-sales-history-migration-full-verification
    plan: 06
    provides: "Six-entity sales verification and exact DECIMAL(14,4) reconciliation"
provides:
  - "ENV-gated Phase 14 milestone-wide rehearsal harness for dry-run, apply, retry apply, and verify"
  - "Automated readiness gate inventory proving focused harness, full migration-runner suite, architecture checks, and docs lint are green"
  - "Explicit separation between skip-safe readiness and pending VER-03 real-volume proof"
affects: [14-09, 14-10, 14-11, dgfy-migration-runner, production-parity-rehearsal]

tech-stack:
  added: []
  patterns:
    - "Production-parity rehearsal tests skip unless an explicit RUN_* flag and all operator env vars are present."
    - "Enabled rehearsal tests fail on empty manifest, wrong Docker context, missing six-entity volume, retry inserts, verifier drift, or raw sensitive report fields."

key-files:
  created:
    - apps/dgfy-migration-runner/tests/dataMilestoneRehearsal.test.js
    - .planning/phases/14-sales-history-migration-full-verification/14-08-SUMMARY.md
  modified:
    - apps/dgfy-migration-runner/tests/dataMilestoneRehearsal.test.js

key-decisions:
  - "The Phase 14 milestone harness requires DOCKER_CONTEXT=lima-dgfy-dev when enabled, rather than inheriting the shell's active context."
  - "A skipped Phase 14 milestone harness is automated readiness only and is not represented as VER-03 real-volume proof."
  - "VER-03 remains pending until an operator-authorized production-parity run preserves dry-run/apply/retry/verify evidence."

patterns-established:
  - "Use count-and-order assertions around real runDataDryRun/runDataApply/runVerify exports for rehearsal harnesses."
  - "Use report-shape redaction assertions to keep credential hashes and raw legacy snapshots out of shared evidence."

requirements-completed: [LDM-05, SHM-01, SHM-02, SHM-03, SHM-04, VER-01, VER-02]
requirements-pending: [VER-03]

coverage:
  - id: D1
    description: "Phase 14 milestone rehearsal harness exists and skips cleanly without operator env while remaining strict when enabled."
    requirement: VER-01
    verification:
      - kind: integration
        ref: "cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataMilestoneRehearsal.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full migration-runner, root architecture, and documentation gates are green before destructive authorization."
    requirement: VER-02
    verification:
      - kind: integration
        ref: "npm --prefix apps/dgfy-migration-runner test"
        status: pass
      - kind: other
        ref: "npm run check:architecture"
        status: pass
      - kind: other
        ref: "npm run lint:docs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real-volume VER-03 proof remains pending operator authorization and cannot be satisfied by the skipped harness."
    requirement: VER-03
    verification: []
    human_judgment: true
    rationale: "The required production-parity dry-run/apply/retry/verify run is intentionally gated by Plan 14-09 and was not executed in this plan."

duration: 28min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 08: Milestone Rehearsal Harness Summary

**Phase 14 now has a strict, ENV-gated six-entity rehearsal harness and a green automated gate inventory without claiming skipped VER-03 proof.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-15T02:02:33Z
- **Completed:** 2026-07-15T02:30:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `dataMilestoneRehearsal.test.js`, gated by `RUN_PHASE14_MILESTONE_REHEARSAL=true` plus source/target DB, manifest, business DB list, `DOCKER_CONTEXT`, actor, and report directory env.
- The enabled harness drives the real `runDataDryRun`, `runDataApply`, retry `runDataApply`, and `runVerify` command paths.
- The harness fails enabled runs on empty/mismatched targets, wrong Docker context, missing six-entity dry-run coverage, missing first-apply writes, retry inserts, verifier drift, zero sales/product volume, or raw sensitive report fields.
- Completed the automated gate inventory: focused harness, full migration-runner suite, root architecture checks, and docs lint all passed.
- Confirmed no package manifest/lockfile, architecture allowlist, or live checkout/payment path was changed.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing milestone rehearsal harness gate** - `c13f218f` (test)
2. **Task 1 GREEN: Implement milestone rehearsal harness** - `3114d7ac` (feat)
3. **Task 2: Verify automated rehearsal gates** - `d38a8511` (chore, verification-only empty commit)

## Files Created/Modified

- `apps/dgfy-migration-runner/tests/dataMilestoneRehearsal.test.js` - New production-parity rehearsal harness for six-entity dry-run/apply/retry/verify proof.
- `.planning/phases/14-sales-history-migration-full-verification/14-08-SUMMARY.md` - Captures Plan 08 execution and verification.

## Decisions Made

- The enabled harness requires `DOCKER_CONTEXT=lima-dgfy-dev`; it does not inspect or trust the active Docker context implicitly.
- The harness is skip-safe for CI, but skipped execution is readiness only. It is not VER-03 evidence.
- VER-03 remains pending for the explicit human-authorized destructive production-parity run owned by the next gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Imported Jest globals for the ESM harness**
- **Found during:** Task 1 GREEN focused verification
- **Issue:** The new ESM test used `jest.setTimeout()` without importing `jest` from `@jest/globals`, causing the skip-safe focused run to fail before executing the skipped suite.
- **Fix:** Added `import { jest } from '@jest/globals';`.
- **Files modified:** `apps/dgfy-migration-runner/tests/dataMilestoneRehearsal.test.js`
- **Verification:** The focused harness command exited 0 with the suite skipped after the fix.
- **Committed in:** `3114d7ac`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** No scope expansion; the fix was required for the planned harness to run under the package's ESM Jest configuration.

## Issues Encountered

- Watchman emitted its recurring recrawl warning during Jest runs. Test execution was not affected.
- The real production-parity rehearsal was not run because Plan 14-09 is the required human authorization gate before any destructive target run.

## Known Stubs

None. Stub-pattern scan found no placeholder/TODO/FIXME or hardcoded empty UI/data stubs in the created harness.

## Threat Flags

None. The new enabled rehearsal surface is the planned mitigation for T-14-08-01 through T-14-08-04 and remains gated by explicit env, manifest validation, Docker context assertion, redaction assertions, and `finally` connection cleanup.

## User Setup Required

Before VER-03 can be claimed, an operator must authorize Plan 14-09 and provide the required production-parity env: source/target DB credentials, reviewed `DGFY_MIGRATION_TARGET_MANIFEST`, `DGFY_BUSINESS_DB_NAMES`, `DOCKER_CONTEXT=lima-dgfy-dev`, `MIGRATION_ACTOR`, and `REPORT_DIR`.

## Verification

- RED gate failed as expected:
  `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataMilestoneRehearsal.test.js`
  Result: 1 failing test with the explicit RED implementation error.
- Focused harness passed in skip-safe mode:
  `cd apps/dgfy-migration-runner && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/dataMilestoneRehearsal.test.js`
  Result: 1 skipped suite, exit 0.
- Full migration-runner suite passed:
  `npm --prefix apps/dgfy-migration-runner test`
  Result: 37 suites passed, 6 skipped; 490 tests passed, 11 skipped; migration-runner architecture subtest passed 4/4.
- Root architecture checks passed:
  `npm run check:architecture`
  Result: backend guardrails OK, backend controller boundaries OK, dgfy-api guardrails/controller boundaries OK, migration-runner guardrails OK.
- Docs lint passed:
  `npm run lint:docs`
  Result: `[docs-lint] OK. Validated 21 governed docs.`
- Package/allowlist/live checkout checks passed:
  `git diff --name-only HEAD~2..HEAD -- package.json package-lock.json apps/dgfy-migration-runner/package.json apps/dgfy-migration-runner/package-lock.json docs/architecture/compatibility-seams.json backend/src/config/architectureModelImportAllowlist.js backend/src/config/controllerModelImportAllowlist.js backend/src/config/architectureGuardrailsAllowlist.js apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
  Result: no output.
  `git diff --name-only HEAD~2..HEAD | rg -n "checkout|payment|paymongo|availmentUseCases|checkoutUseCases|apps/dgfy-api/src/modules/availments|backend/" || true`
  Result: no output.

## Next Phase Readiness

Plan 14-09 can now act as the hard human authorization gate for the destructive production-parity run. Automated readiness is green, but VER-03 remains pending until that authorized real-volume run preserves dry-run/apply/retry/verify evidence.

## TDD Gate Compliance

- RED commit present: `c13f218f`
- GREEN commit present after RED: `3114d7ac`
- Refactor commit: not needed

## Self-Check: PASSED

- Summary file exists at `.planning/phases/14-sales-history-migration-full-verification/14-08-SUMMARY.md`.
- Created harness file exists at `apps/dgfy-migration-runner/tests/dataMilestoneRehearsal.test.js`.
- Task commits `c13f218f`, `3114d7ac`, and `d38a8511` exist.
- Required validation commands passed.
- Known unrelated untracked paths remain untouched: `.planning/HANDOFF.json`, `.planning/phases/14-sales-history-migration-full-verification/.continue-here.md`, and `refactor-do-not-commit/`.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*
