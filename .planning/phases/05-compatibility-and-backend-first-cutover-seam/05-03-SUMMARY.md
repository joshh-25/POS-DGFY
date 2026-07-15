---
phase: 05-compatibility-and-backend-first-cutover-seam
plan: 03
subsystem: infra
tags: [migration-runner, reference-seam, compat-seam, db-continuity, cmp-01]

# Dependency graph
requires:
  - "docs/architecture/compatibility-seams.json manifest scaffold + scripts/check-compat-seams.js validator (Plan 01)"
  - "check:compat-seams CI/pre-commit acceptance gate (Plan 02)"
provides:
  - "apps/dgfy-migration-runner/src/commands/verifyContinuity.js — runVerifyContinuity(), non-destructive DB-level CMP-01 reference seam"
  - "verify-continuity CLI subcommand in buildProgram()"
  - "docs/architecture/compatibility-seams.json's FIRST complete manifest entry (db-continuity-legacy-backup)"
  - "regenerated docs/architecture/COMPATIBILITY_INVENTORY.md"
  - "proof that the full governance loop (marker <-> manifest <-> CI gate) reconciles end-to-end"
affects: [phase-06-cmp-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure/impure split for report building: buildContinuityReport() (pure, unit-testable without any DB) vs probeSourceTables() (impure, SHOW TABLES + COUNT(*) only), mirroring verify.js's checkContractSchema idiom stripped to read-only"
    - "Hardcoded in-file allowlist constant (EXPECTED_LEGACY_DOMAIN_TABLES) is itself defensively re-validated against a SAFE_IDENTIFIER_PATTERN before use in any SQL string, even though it is never caller/config-supplied — mirrors config/db.js's createLegacyTenantSourceConnection defense-in-depth posture"

key-files:
  created:
    - apps/dgfy-migration-runner/src/commands/verifyContinuity.js
    - apps/dgfy-migration-runner/tests/verifyContinuity.test.js
  modified:
    - apps/dgfy-migration-runner/src/cli.js
    - docs/architecture/compatibility-seams.json
    - docs/architecture/COMPATIBILITY_INVENTORY.md

key-decisions:
  - "EXPECTED_LEGACY_DOMAIN_TABLES = ['items','purchase_orders','job_orders','stock_movements','suppliers','users'] — the exact legacy backup (SOURCE_DB) table names confirmed via backend/src/models/*.js `tableName` fields, cross-checked against schemaContracts/dgfyCoreContract.js's `rejectedTables` list (same names, explicitly out-of-scope for dgfy_core under ADR 0029 because they remain legacy-owned)"
  - "Combined Task 1 (verifyContinuity.js + cli.js) and Task 3 (manifest entry + regenerated inventory) into a single commit — the Plan 02 pre-commit hook's compat-seams gate structurally requires any staged @compat-seam marker to be accompanied by a complete, reconciled manifest entry in the SAME commit; splitting them per the plan's literal task order fails check:compat-seams --staged"
  - "Task 2 (verifyContinuity.test.js) was committed on its own between Task 1 and the combined Task 1+3 commit, since a plain test file addition touches no compat-seam surface and does not trigger the pre-commit gate"

requirements-completed: [CMP-01]

coverage:
  - id: D1
    description: "A non-destructive DB-level continuity command reads the legacy backup (SOURCE_DB) and verifies its domain tables remain intact"
    requirement: CMP-01
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/verifyContinuity.test.js (5/5 unconditional tests passing, 1 gated integration test skipped without RUN_CONTINUITY_INTEGRATION)"
        status: pass
      - kind: other
        ref: "node -e buildProgram() introspection confirms verify-continuity is wired (Task 1 verify command)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reference seam is registered as the FIRST manifest entry with all governance fields complete, carrying a code marker the Plan 01 validator reconciles"
    requirement: CMP-01
    verification:
      - kind: other
        ref: "npm run check:compat-seams (both default and --staged modes) PASS, 1 seam checked, bidirectional reconciliation green"
        status: pass
      - kind: other
        ref: "node scripts/generate-compat-inventory.js && git diff --exit-code docs/architecture/COMPATIBILITY_INVENTORY.md (zero drift)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The seam is strictly read-only on SOURCE_DB"
    requirement: CMP-01
    verification:
      - kind: other
        ref: "Source review: verifyContinuity.js issues only SHOW TABLES (via queryInterface.showAllTables()) and SELECT COUNT(*) — no INSERT/UPDATE/DELETE/DDL statement exists in the file"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-12
status: complete
---

# Phase 05 Plan 03: DB-Level Reference Compatibility Seam (verifyContinuity) Summary

**Built the one concrete D-01/D-02 reference seam: a non-destructive `verify-continuity` migration-runner command that proves the legacy backup's POS/Storefront domain tables remain intact, registered it as the first complete compatibility-seams.json entry, and proved the full marker<->manifest<->CI-gate governance loop reconciles end-to-end (CMP-01)**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-12
- **Tasks:** 3 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Created `apps/dgfy-migration-runner/src/commands/verifyContinuity.js`: `runVerifyContinuity()` follows the runner's `validateEnv() -> createSourceConnection() -> probe -> writeJsonReport()` ordering (RUN-03), connecting only to `SOURCE_DB` (the legacy backup) and never touching `TARGET_DB`. Runs a strictly read-only probe (`SHOW TABLES` via `queryInterface.showAllTables()` + `SELECT COUNT(*)`) against a hardcoded, defensively re-validated `EXPECTED_LEGACY_DOMAIN_TABLES` allowlist (`items`, `purchase_orders`, `job_orders`, `stock_movements`, `suppliers`, `users`) — the exact legacy backup table names, confirmed against `backend/src/models/*.js` and cross-checked against `dgfyCoreContract.js`'s `rejectedTables` list. Report building is factored into a pure `buildContinuityReport()` function (no I/O) separate from the impure `probeSourceTables()`, mirroring `verify.js`'s pure/impure split. Carries the `@compat-seam id=db-continuity-legacy-backup` marker.
- Wired `verify-continuity` as a new subcommand inside `buildProgram()` in `apps/dgfy-migration-runner/src/cli.js`, alongside the existing `verify` command.
- Added `apps/dgfy-migration-runner/tests/verifyContinuity.test.js` (jest, 6 cases): env-validate-before-connect rejection (`EnvValidationError`, zero DB connection attempts), `EXPECTED_LEGACY_DOMAIN_TABLES` shape, `buildContinuityReport` payload shape (both the all-present and one-missing-table cases, asserting no raw-row leakage), and an end-to-end `runVerifyContinuity()` run against a fake read-only `SOURCE_DB` connection (mocked `createSourceConnection`) proving the JSON report is written. The real-`SOURCE_DB` integrity probe is gated behind `RUN_CONTINUITY_INTEGRATION=true` (skipped in this sandbox, matching the established Phase 1-4 precedent). 5/5 unconditional tests pass; 1 gated test skips cleanly.
- Registered the reference seam as the **first and only** entry in `docs/architecture/compatibility-seams.json` (`id: db-continuity-legacy-backup`, `type: db-level`, `status: active`) with all six governance fields (`rationale`, `tests`, `rollback`, `removal_criteria`) complete, then regenerated `docs/architecture/COMPATIBILITY_INVENTORY.md` via the Plan 01 generator (confirmed deterministic — running the generator twice in a row produces byte-identical output).
- Proved the full acceptance loop: `npm run check:compat-seams` passes in both default (full-tree) and `--staged` modes — the code marker in `verifyContinuity.js` bidirectionally reconciles against the manifest entry, the referenced test path (`apps/dgfy-migration-runner/tests/verifyContinuity.test.js`) exists, and the completeness gate is satisfied.

## Task Commits

1. **Task 1: Create verifyContinuity.js reference seam + wire CLI subcommand** — work completed but held uncommitted (see Deviations); final content lands in commit `2afd2461` below.
2. **Task 2: Add verifyContinuity.test.js** — `16209aab` (test)
3. **Task 3: Register the FIRST manifest entry + regenerate inventory** — combined with Task 1's held changes into `2afd2461` (feat)

**Plan metadata:** (this commit, made after this SUMMARY)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/commands/verifyContinuity.js` - `runVerifyContinuity()`, `buildContinuityReport()`, `EXPECTED_LEGACY_DOMAIN_TABLES`, `@compat-seam id=db-continuity-legacy-backup` marker
- `apps/dgfy-migration-runner/tests/verifyContinuity.test.js` - 6-case jest suite (5 unconditional, 1 gated behind `RUN_CONTINUITY_INTEGRATION`)
- `apps/dgfy-migration-runner/src/cli.js` - new `verify-continuity` subcommand in `buildProgram()`
- `docs/architecture/compatibility-seams.json` - first manifest entry (`db-continuity-legacy-backup`)
- `docs/architecture/COMPATIBILITY_INVENTORY.md` - regenerated to include the entry (deterministic, zero drift)

## Decisions Made

- `EXPECTED_LEGACY_DOMAIN_TABLES` was defined against the legacy backup's own confirmed table names (`items`, `purchase_orders`, `job_orders`, `stock_movements`, `suppliers`, `users` — read directly from `backend/src/models/{Item,PurchaseOrder,JobOrder,StockMovement,Supplier,User}.js`'s `tableName` fields) rather than inferred loosely. These are exactly the names `dgfyCoreContract.js`'s `rejectedTables` list already documents as explicitly out-of-scope for `dgfy_core` (ADR 0029) — confirming they remain legacy-owned domains this seam must prove stay intact (05-RESEARCH.md Assumption A3).
- Report building was factored into a pure `buildContinuityReport({ existingTables, rowCountByTable, sourceDbName })` function, separate from the impure `probeSourceTables(legacy)` DB probe. This let the payload-shape test cases run without any DB connection or mock at all — only the one end-to-end test needed a fake `createSourceConnection`.
- Each `EXPECTED_LEGACY_DOMAIN_TABLES` entry is re-validated against a `SAFE_IDENTIFIER_PATTERN` (`^[a-z][a-z0-9_]*$`) immediately before being interpolated into a `COUNT(*)` query string. The allowlist is a hardcoded in-file constant, never caller/config/manifest-supplied, so this check can never actually fail against real input — it exists purely as defense-in-depth, mirroring `config/db.js`'s `createLegacyTenantSourceConnection` blank/prefix rejection pattern (T-05-06).
- Row counts (not raw rows) are reported per existing table as auxiliary information; the `ok`/continuity determination is existence-only (a legacy table with zero rows is still "intact" — CMP-01 is about domain-table survival, not data volume).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Task 1 and Task 3 commits combined due to pre-commit hook's atomic marker<->manifest reconciliation requirement**
- **Found during:** Attempting to commit Task 1 (`verifyContinuity.js` + `cli.js`) alone, per the plan's literal per-task commit sequence.
- **Issue:** `.husky/pre-commit` (built in Plan 02) triggers `npm run check:compat-seams -- --staged` whenever the staged diff contains an `@compat-seam` marker. The validator's marker<->manifest reconciliation check (`reconcileMarkersAndSeams`) runs in `--staged` mode too (only the orphan-entry direction is skipped there) — so a commit introducing the `@compat-seam id=db-continuity-legacy-backup` marker without a simultaneously-staged, complete manifest entry (all six governance fields non-empty, referenced test path existing) is rejected by design. Task 1 alone (marker, no manifest entry yet) failed with: `Code marker id "db-continuity-legacy-backup" ... has no complete active/accepted manifest entry`.
- **Fix:** Reordered the commit sequence without changing task content: (1) committed Task 2's test file alone first (touches no compat-seam surface, hook doesn't trigger, test file needs to exist on disk anyway for the manifest's `tests` path-existence check to later pass), then (2) built Task 3's manifest entry, then (3) committed Task 1's `verifyContinuity.js`/`cli.js` together with Task 3's `compatibility-seams.json`/`COMPATIBILITY_INVENTORY.md` in a single commit, since the hook structurally requires the marker and its complete manifest entry to land atomically. This is not a workaround of the gate — it is the gate working exactly as Plan 02 intended (a marker can never be committed without a reconciled entry); the plan's literal "commit each task separately" instruction could not be honored for Task 1/Task 3 without either violating that intended invariant or using `--no-verify` (explicitly prohibited).
- **Files affected:** `apps/dgfy-migration-runner/src/commands/verifyContinuity.js`, `apps/dgfy-migration-runner/src/cli.js`, `docs/architecture/compatibility-seams.json`, `docs/architecture/COMPATIBILITY_INVENTORY.md`
- **Commit:** `2afd2461`

No other deviations — Task 1, 2, and 3's technical content was executed exactly as the plan specified; only the commit grouping changed.

## Issues Encountered

None beyond the commit-sequencing deviation documented above. All three tasks' automated verify commands passed on first execution once files were written: `buildProgram()` introspection confirmed CLI wiring, `npm test -- verifyContinuity` passed 5/5 unconditional cases with the integration test cleanly skipped, and `node scripts/generate-compat-inventory.js && git diff --exit-code ... && npm run check:compat-seams` passed with zero drift and a green bidirectional reconciliation. The full runner suite (`npm test` in `apps/dgfy-migration-runner`) remained green: 302 passing, 6 gated-skipped, 0 regressions.

## User Setup Required

None - no external service configuration required. This plan is entirely local tooling (a new migration-runner command + CLI wiring + a manifest entry + a regenerated doc), consistent with Plans 01 and 02.

## Next Phase Readiness

- The compatibility-seam governance framework built across Plans 01-03 is now fully exercised end-to-end: a real code marker, a real complete manifest entry, a real CI/pre-commit acceptance gate, and a real non-destructive reference implementation all reconcile together.
- `verify-continuity` is invocable via `dgfy-migration-runner verify-continuity` (once `.env` is configured with real `SOURCE_DB_*` credentials) and via `RUN_CONTINUITY_INTEGRATION=true npm test -- verifyContinuity` for the gated real-MySQL proof — neither was run against real MySQL in this sandbox (no credentials reachable), matching the established Phase 1-4 precedent; a human UAT pass against a real legacy backup would additionally validate the seam's real-world behavior, though it is not required for CMP-01's structural/governance acceptance criteria.
- Phase 6 (CMP-04) can extend `docs/architecture/compatibility-seams.json` with additional seam entries as needed — the manifest schema, validator, and reconciliation convention are all stable.
- No blockers identified.

---
*Phase: 05-compatibility-and-backend-first-cutover-seam*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 5 created/modified files confirmed present on disk with expected content (`verifyContinuity.js`, `verifyContinuity.test.js`, `cli.js` verify-continuity wiring, manifest entry, regenerated inventory row); both task commit hashes (`16209aab`, `2afd2461`) confirmed present in git history.
