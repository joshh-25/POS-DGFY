---
phase: 06-release-evidence-and-rehearsal-gates
plan: 02
subsystem: testing
tags: [release-evidence, compatibility-seams, node-test, jest, spawnSync, fail-closed]

# Dependency graph
requires:
  - phase: 05-compatibility-and-backend-first-cutover-seam
    provides: docs/architecture/compatibility-seams.json manifest + scripts/check-compat-seams.js loadManifest export
provides:
  - "scripts/dgfy-seam-smoke.js — generic, manifest-driven seam-smoke runner (SC3)"
  - "seam_smoke.json runtime artifact contract (per-seam { id, ok, detail } + overall ok)"
affects: [06-03, 07-cutover-rehearsal-and-abort-thresholds]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "seam-id -> required-integration-env map with pinned-value support (RUN_CONTINUITY_INTEGRATION must equal 'true', not just be set)"
    - "test-path prefix -> owning-package runner dispatch table, explicit extension point, no pre-built unused runners"
    - "fail-closed by construction: every branch in runSeam (missing env, no tests[], unmapped path) returns ok:false, never a silent pass"

key-files:
  created:
    - scripts/dgfy-seam-smoke.js
    - scripts/dgfy-seam-smoke.test.js
  modified: []

key-decisions:
  - "SEAM_REQUIRED_ENV seeds db-continuity-legacy-backup with RUN_CONTINUITY_INTEGRATION + all four SOURCE_DB_* creds (not just the boolean flag), since verifyContinuity's real probe also requires those to connect"
  - "SEAM_REQUIRED_ENV_VALUES pins RUN_CONTINUITY_INTEGRATION to the exact string 'true' — a seam with RUN_CONTINUITY_INTEGRATION=false present is still treated as missing/fail-closed, not merely 'set'"
  - "runSeam/runSeamSmoke accept an injectable env parameter (default process.env) purely for test isolation — production dispatch still reads process.env by default"
  - "TEST_PATH_RUNNERS is a small explicit prefix->function array (not a generic path-walk-to-package.json resolver) since only the migration-runner (jest) case has an active seam; the array shape is the documented extension point for future runners"

patterns-established:
  - "Fail-closed seam dispatch: missing integration env, empty tests[], and unmapped test-path owners are all treated identically as ok:false with an explanatory detail — never silently skipped or passed"

requirements-completed: [CMP-04]

coverage:
  - id: D1
    description: "scripts/dgfy-seam-smoke.js reuses loadManifest from check-compat-seams.js and filters status==='active' seams, iterating every active manifest entry generically (D-04)"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "scripts/dgfy-seam-smoke.test.js#active-filter returns only status:\"active\" seams, excluding provisioning/accepted/pending/removed"
        status: pass
      - kind: other
        ref: "grep -q \"require('./check-compat-seams.js')\" scripts/dgfy-seam-smoke.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "A seam whose required integration env/credentials are absent fails closed (ok:false) rather than reporting a pass on skipped integration tests"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "scripts/dgfy-seam-smoke.test.js#fail-closed: a seam with missing required integration env yields ok:false, never a pass on a skipped integration test"
        status: pass
    human_judgment: false
  - id: D3
    description: "An unknown seam id / unmapped test-path owner resolves to fail-closed (ok:false), never a silent pass"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "scripts/dgfy-seam-smoke.test.js#fail-closed: an unknown seam id with no test-runner mapping resolves to ok:false, not a silent pass"
        status: pass
    human_judgment: false
  - id: D4
    description: "require('./scripts/dgfy-seam-smoke.js') does not execute the smoke loop (guarded by require.main === module), enabling in-process unit tests"
    requirement: "CMP-04"
    verification:
      - kind: other
        ref: "node -e \"require('./scripts/dgfy-seam-smoke.js')\" — no console output, no process.exit"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full node --test suite (12 tests) proving active-filter, required-env map, fail-closed semantics, and runner resolution — no live MySQL, no real jest spawn"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "node --test scripts/dgfy-seam-smoke.test.js (12/12 pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-07-12
status: complete
---

# Phase 6 Plan 2: Generic Compatibility-Seam Smoke Runner Summary

**Generic manifest-driven seam-smoke runner (scripts/dgfy-seam-smoke.js) that iterates every active compatibility-seam entry, dispatches its tests[] through the owning package's test runner with required integration env injected, and fails closed on missing env or unmapped seam owners — never a silent pass on a skipped integration test.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-12T06:14:09Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments

- `scripts/dgfy-seam-smoke.js`: CommonJS root script reusing `loadManifest` from `check-compat-seams.js`, filtering `status === 'active'` seams (D-04), and running each seam's `tests[]` through a small explicit test-path-prefix → owning-package-runner dispatch table (migration-runner → jest, documented extension point for future runners per Open Question 2).
- Seam-id → required-integration-env map (`SEAM_REQUIRED_ENV`) seeded with `db-continuity-legacy-backup` → `RUN_CONTINUITY_INTEGRATION` + all four `SOURCE_DB_*` creds; `RUN_CONTINUITY_INTEGRATION` is pinned to the exact string `'true'` via `SEAM_REQUIRED_ENV_VALUES` so a present-but-`'false'` value still fails closed.
- Fail-closed by construction across every branch of `runSeam`: missing required env → `ok:false`; empty `tests[]` → `ok:false`; unmapped test-path owner → `ok:false`. No branch of the function can return a pass without a real, successfully-dispatched test run.
- Writes `{ id, ok, detail }[]` plus overall `ok` to `seam_smoke.json` under an evidence dir resolved from `--evidence-dir <dir>` / `SEAM_SMOKE_EVIDENCE_DIR` env / default `.tmp/release-gates/<sha>/`, matching the existing `gate-release-local.js` evidence-dir convention. Prints per-seam PASS/FAIL lines and exits non-zero (`process.exit(2)`) on any failing seam.
- Exports pure helpers (`filterActiveSeams`, `resolveRequiredEnv`, `findMissingEnv`, `resolveRunnerForTestPath`, `runSeam`, `runSeamSmoke`, `resolveEvidenceDir`) guarded behind `require.main === module`, so `require()`-ing the module for tests never runs the real smoke loop or spawns a child test process.
- `scripts/dgfy-seam-smoke.test.js`: 12-test `node --test` suite covering active-filter status handling, the required-env resolver/map, pinned-value mismatch handling, both fail-closed paths (missing env, unmapped owner), empty-`tests[]` handling, and runner resolution for the registered vs. an unregistered prefix. No live MySQL, no real jest spawn — every case exercises the pure resolvers or `runSeam`'s early-return branches, which never reach the actual `spawnSync` dispatch when the seam is going to fail closed anyway.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the generic manifest-driven seam-smoke runner (CommonJS, fail-closed)** - `2c34abec` (feat)
2. **Task 2: Add node --test coverage for the seam-smoke runner** - `5faaf658` (test)

_No TDD tasks in this plan; each task is a single commit._

## Files Created/Modified

- `scripts/dgfy-seam-smoke.js` - Generic manifest-driven seam-smoke runner; reuses `loadManifest`, active-status filter, seam-id→env map, test-path→runner dispatch table, fail-closed `runSeam`/`runSeamSmoke`, `seam_smoke.json` writer, CLI `--evidence-dir` support.
- `scripts/dgfy-seam-smoke.test.js` - `node --test` suite (12 tests) covering active-filter, required-env map, fail-closed semantics, and runner resolution.

## Decisions Made

- `SEAM_REQUIRED_ENV` for `db-continuity-legacy-backup` includes all four `SOURCE_DB_*` credential vars, not just `RUN_CONTINUITY_INTEGRATION` — the real probe in `verifyContinuity.js` cannot connect without them, so treating them as "required" keeps the fail-closed guarantee honest (a boolean flag alone with no real creds would still be a false pass).
- `RUN_CONTINUITY_INTEGRATION` is pinned to the literal string `'true'` (via `SEAM_REQUIRED_ENV_VALUES`), not merely "present" — this matches `verifyContinuity.test.js`'s own `=== 'true'` gate exactly, so the smoke runner's fail-closed check is consistent with the test file it's proxying.
- `runSeam`/`runSeamSmoke` accept an injectable `env` parameter (default `process.env`) solely to make the fail-closed unit tests deterministic without mutating global process state; production CLI dispatch (`main()`) still reads `process.env` by default, unchanged from the plan's described behavior.
- `TEST_PATH_RUNNERS` stays a small explicit `{ prefix, run }` array rather than a generic "walk up to nearest `package.json`" resolver — only the migration-runner (jest) case has an active seam today (Open Question 2 resolution), and the array is the documented, low-risk extension point for future seam owners.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were met without needing any Rule 1-4 auto-fixes; the only design choices made were within the plan's explicitly stated "Claude's discretion" bounds (env-map shape, runner-dispatch table shape).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This script requires no new dependencies (reuses Node built-ins + the existing `check-compat-seams.js` export) and needs no `npm install`.

## Next Phase Readiness

- `scripts/dgfy-seam-smoke.js` is ready to be wired into `06-03`'s orchestrator (`gate-release-dgfy-evidence.js`) as the SC3 gate — it can be `require()`'d directly (via `runSeamSmoke()`) or spawned as a CLI subprocess; either integration path is supported since the module both exports pure helpers and has a guarded `main()`.
- The `seam_smoke.json` artifact contract (`{ generated_at, ok, seam_count, seams: [{ id, ok, detail }] }`) is stable and ready for 06-03 to convert into `addGate` entries (one per seam id) in the release verdict.
- No blockers. This plan does not require live MySQL — its own verification is fully DB-free by design (fail-closed logic is proven via env-injection unit tests, not a real connection attempt); the real end-to-end proof (an actual `RUN_CONTINUITY_INTEGRATION=true` run against reachable `SOURCE_DB_*`) is deferred to whichever operator-run environment 06-03/07 execute the full release-evidence gate in, consistent with Phase 5/06-01's established DB-reachability precedent.

---
*Phase: 06-release-evidence-and-rehearsal-gates*
*Completed: 2026-07-12*
