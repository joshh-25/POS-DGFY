---
phase: 06-release-evidence-and-rehearsal-gates
reviewed: 2026-07-12T06:37:31Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - apps/dgfy-migration-runner/package.json
  - apps/dgfy-migration-runner/src/cli.js
  - apps/dgfy-migration-runner/src/commands/releaseEvidence.js
  - apps/dgfy-migration-runner/src/commands/verify.js
  - apps/dgfy-migration-runner/tests/cliContract.test.js
  - apps/dgfy-migration-runner/tests/releaseEvidence.test.js
  - scripts/dgfy-seam-smoke.js
  - scripts/dgfy-seam-smoke.test.js
  - scripts/gate-release-dgfy-evidence.js
  - scripts/gate-release-dgfy-evidence.test.js
  - package.json
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-07-12T06:37:31Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the 06-01/06-02/06-03 release-evidence and rehearsal-gate deliverables: the `release-evidence` migration-runner subcommand, the generic seam-smoke runner, and the DGFY release-evidence orchestrator gate, plus their tests and CLI/package wiring.

The interactive `release-evidence` command itself (06-01) is solid — fail-closed TTY guard, correct connection lifecycle management (`finally` block closes every connection it opens), and no-secrets report payloads, all backed by decent tests. The seam-smoke runner (06-02) is also sound and well fail-closed at the unit level.

However, the orchestrator gate (06-03) — the component that is supposed to turn all of this into a trustworthy pass/fail release verdict — has a **critical filename-matching bug that makes it structurally unable to ever read the migration-verification/tenant-drift evidence it just generated**, plus a related stale-artifact design flaw that can silently mask real failures as passes. Neither is caught by `gate-release-dgfy-evidence.test.js`, which only unit-tests the two pure helper functions and never exercises `readLatestReport`/`addEvidenceGate` against real report filenames. There is also an unrelated connection-leak regression risk in `verify.js` (now more consequential because `release-evidence` reuses its engines) and a couple of test/wiring gaps.

## Critical Issues

### CR-01: `gate-release-dgfy-evidence.js` can never find the migration-verification/tenant-drift reports it just generated — the gate is structurally broken whenever real evidence exists

**File:** `scripts/gate-release-dgfy-evidence.js:88-96` (`readLatestReport`) and `:175-202` (`addEvidenceGate` call sites), cross-referenced with `apps/dgfy-migration-runner/src/reports/reportWriter.js:18-22` (`buildReportFileName`)

**Issue:**

`releaseEvidence.js` writes its two evidence reports via:
```js
await writeJsonReport(reportDir, 'tenant_drift', tenantDriftReport);
await writeJsonReport(reportDir, 'migration_verification', migrationVerificationReport);
```
`writeJsonReport` → `buildReportFileName` sanitizes the command name with:
```js
const safeCommand = String(command).replace(/[^a-z0-9-]+/gi, '-');
```
This regex's allowed set is `[a-z0-9-]` — **underscore is not in it**, so every underscore in the command name is rewritten to a hyphen. Verified directly:
```
'migration_verification' -> 'migration-verification'
'tenant_drift'           -> 'tenant-drift'
```
So the actual files on disk are named `{timestamp}-migration-verification.json` and `{timestamp}-tenant-drift.json`.

But `gate-release-dgfy-evidence.js` looks them up with the **underscore** variant:
```js
const migrationVerificationReport = readLatestReport(evidenceDir, 'migration_verification');
const tenantDriftReport = readLatestReport(evidenceDir, 'tenant_drift');
```
and `readLatestReport` matches via `file.endsWith(\`-${commandSuffix}.json\`)`, i.e. it looks for files ending in `-migration_verification.json` / `-tenant_drift.json` (underscore). Those never exist — the real files end in `-migration-verification.json` / `-tenant-drift.json` (hyphen). Confirmed with a direct repro:
```
'2026-x-migration-verification.json'.endsWith('-migration_verification.json') // false
'2026-x-tenant-drift.json'.endsWith('-tenant_drift.json')                     // false
```
As a result, whenever `release-evidence` actually finds active tenants (`noTargets === false`) and `migrationCommandOk === true`, `readLatestReport` always returns `null`, `addEvidenceGate` always hits the `!report || !report.summary` branch, and both `migration.verification` and `tenant.drift` gates are unconditionally reported `ok:false` with `"report file absent (fail-closed)"` — **even when the underlying checks genuinely passed**. The gate can only ever pass in the vacuous `no_targets` case. This defeats the entire purpose of SC2 (the primary evidence this phase set out to gate on) and is not caught by any test — `gate-release-dgfy-evidence.test.js` only unit-tests `buildVerdictPayload`/`isBoundaryChanged`, never `readLatestReport`/`addEvidenceGate` against real filenames.

**Fix:** Use the same sanitized command string on both sides, e.g. read with the hyphenated names:
```js
const migrationVerificationReport = readLatestReport(evidenceDir, 'migration-verification');
const tenantDriftReport = readLatestReport(evidenceDir, 'tenant-drift');
```
and add a regression test that writes a real file via `writeJsonReport`-equivalent naming and asserts `readLatestReport` finds it (the current test suite never does this).

### CR-02: Stale evidence artifacts in the reused evidence directory can mask real gate failures (fail-open), contradicting the script's own fail-closed design intent

**File:** `scripts/gate-release-dgfy-evidence.js:138-140` (evidence dir never cleared), `:175-192` (`noTargets` derivation), `:209-226` (`compat.seam.smoke`)

**Issue:** `evidenceDir` is `.tmp/release-gates/{targetSha}` and is only ever created (`ensureDir` → `mkdirSync(..., {recursive:true})`), never cleared, before each run. Report files from `release-evidence` are timestamped (never overwritten) while `seam_smoke.json` is a **fixed filename** only rewritten on a clean completion. Two concrete fail-open paths follow from this, for anyone re-running the gate against the same SHA (a normal local-iteration/debugging workflow in this repo, given the other `gate:release:*`/drill scripts are explicitly designed for repeated local runs):

1. **`noTargets` staleness:** `noTargets` is computed from `readLatestReport(evidenceDir, 'release-evidence')` — the file `release-evidence.js` only writes in its zero-active-tenants branch. If an earlier run in the same evidence dir had zero tenants (writing a `no_targets:true` report) and a *later* run in the same dir now has tenants (writing real `tenant_drift`/`migration_verification` reports instead — it never writes a `release-evidence.json` again), `readLatestReport` still finds the **old** `no_targets:true` file, so `noTargets` evaluates `true` and `addEvidenceGate` short-circuits both `migration.verification` and `tenant.drift` to `ok:true, "not applicable"` — silently ignoring the fresh evidence, even if that fresh evidence shows real drift/migration failures.
2. **`compat.seam.smoke` staleness + uncaptured exit code:** `runCommand(nodeCmd, ['scripts/dgfy-seam-smoke.js', ...])` at line 209 discards its return value entirely (no `xxxOk` capture, unlike the migration-evidence step). If `dgfy-seam-smoke.js` crashes before reaching its final `fs.writeFileSync` (e.g. a malformed manifest), the fixed `seam_smoke.json` from an **earlier successful run** is left in place and silently read as if it were current, again reporting a stale pass.

**Fix:** Clear/recreate `evidenceDir` (or at minimum the specific report-name globs) at the start of each gate run instead of reusing it across invocations, and capture+check the seam-smoke command's exit status the same way `migrationCommandOk` is captured for the evidence step (treat a non-zero exit as fail-closed regardless of what `seam_smoke.json` currently contains).

## Warnings

### WR-01: `verify.js` never closes any Sequelize connection it opens, unlike its sibling command modules

**File:** `apps/dgfy-migration-runner/src/commands/verify.js` (whole file — `runVerify`, lines 321-542, plus `checkLegacyNonMutation`, lines 225-265)

**Issue:** `runVerify()` creates `targetSequelize` (line 329), `metaSequelize` (line 330), and one `businessSequelize` per configured business target (line 368) — and `checkLegacyNonMutation()` (called from `runVerify`) opens an additional `sourceSequelize` (line 244) on every invocation. None of these are ever `.close()`d, not even in a `finally`/error path. Contrast with `releaseEvidence.js` (this same phase), which is careful to open every connection inside a `try` and close all of them in a `finally` block, and with `verifyContinuity.js`, which also closes its connection (`await legacy.close()`). Since `verify.js`'s `checkContractSchema`/`checkMigrationMetadata` are now exported and reused as the core engines for `release-evidence`, this inconsistency is worth resolving now rather than later — every `verify` invocation leaks pooled DB connections and needlessly delays (or, depending on Sequelize/mysql2 pool + keep-alive behavior, can prevent) clean process exit.

**Fix:** Wrap connection creation/usage in `runVerify()` and `checkLegacyNonMutation()` in a `try/finally` that closes `targetSequelize`, `metaSequelize`, every `businessSequelize`, and the `sourceSequelize` opened for the legacy-non-mutation check — mirroring `releaseEvidence.js`'s pattern.

### WR-02: `cliContract.test.js`'s "--help lists all seven commands" test was touched this phase but still doesn't assert the new `release-evidence` command

**File:** `apps/dgfy-migration-runner/tests/cliContract.test.js:11-17`

**Issue:** This file was modified in this phase (mocks for `resolveTargetKind`, `checkContractSchema`, `checkMigrationMetadata` were added), but the pre-existing test:
```js
test('--help stdout lists all seven commands', () => {
  const stdout = execFileSync('node', [CLI_PATH, '--help'], { encoding: 'utf8' });
  ['schema', 'data', 'verify', 'status', 'rollback-plan', 'activate-tenant'].forEach((command) => {
    expect(stdout).toContain(command);
  });
});
```
still only lists 6 command names and was never updated to include `release-evidence` (or `verify-continuity`, which also predates this phase but is likewise never asserted). The CLI now exposes 8 top-level command groups. The test name overstates its own coverage ("all seven") and, more importantly, provides zero regression protection for the exact command this phase registered.

**Fix:**
```js
['schema', 'data', 'verify', 'verify-continuity', 'status', 'rollback-plan', 'activate-tenant', 'release-evidence'].forEach((command) => {
  expect(stdout).toContain(command);
});
```

### WR-03: `scripts/dgfy-seam-smoke.test.js` is never wired into any npm script or CI job

**File:** `scripts/dgfy-seam-smoke.test.js` (whole file), `package.json`

**Issue:** `scripts/gate-release-dgfy-evidence.test.js` was correctly wired up with `"test:dgfy-release-evidence": "node --test scripts/gate-release-dgfy-evidence.test.js"` in `package.json`. Its sibling, `scripts/dgfy-seam-smoke.test.js` (11 tests covering the active-seam filter, required-env resolution, and fail-closed semantics), has **no equivalent script** — `grep -n "dgfy-seam-smoke"` on `package.json` only turns up `check:dgfy-seam-smoke` (which runs the runner itself, not its tests). There is also no reference to this test file anywhere under `.github/`. These 11 tests currently only run if a developer manually invokes `node --test scripts/dgfy-seam-smoke.test.js`.

**Fix:** Add a script, e.g. `"test:dgfy-seam-smoke": "node --test scripts/dgfy-seam-smoke.js.test.js"` (or fold it into `test:dgfy-release-evidence`/a new umbrella target), and ensure it's invoked wherever `test:dgfy-release-evidence` is invoked in CI.

### WR-04: The architecture-boundary gate treats `apps/dgfy-migration-runner/` as guarded, but `check:architecture` never actually checks it

**File:** `scripts/gate-release-dgfy-evidence.js:36` (`BOUNDARY_PREFIXES`), `package.json:79` (`check:architecture`)

**Issue:** `BOUNDARY_PREFIXES` includes `'apps/dgfy-migration-runner/'`, so any migration-runner-only diff flips `boundaryChanged` to `true` and runs `npm run check:architecture` as the `architecture.dgfy` gate. But the root `check:architecture` script is:
```
"check:architecture": "cd backend && npm run check:architecture-guardrails && npm run check:controller-boundaries && cd .. && npm run check:architecture:dgfy-api"
```
— it only runs guardrails for `backend/` and `apps/dgfy-api/`; nothing in this chain inspects `apps/dgfy-migration-runner/` at all. A migration-runner-only change will trigger `architecture.dgfy` to run and report pass/fail based entirely on unrelated backend/dgfy-api code, giving a false sense that the changed boundary was actually checked.

**Fix:** Either add a migration-runner architecture-guardrail target to `check:architecture` (mirroring the `check:architecture:dgfy-api` pattern) and include it in the chain, or drop `apps/dgfy-migration-runner/` from `BOUNDARY_PREFIXES` until such a check exists, so the gate's claimed coverage matches its actual coverage.

## Info

### IN-01: CLI version string duplicated instead of sourced from `package.json`

**File:** `apps/dgfy-migration-runner/src/cli.js:33`

**Issue:** `.version('1.0.0')` is a hardcoded literal duplicating `apps/dgfy-migration-runner/package.json`'s `"version": "1.0.0"`. The two will silently drift the next time one is bumped without the other.

**Fix:** Read the version from `package.json` (e.g. via `createRequire` + `require('../package.json').version`) instead of a literal.

### IN-02: Several `catch` blocks in `verify.js` swallow the actual error without logging or surfacing it in the report

**File:** `apps/dgfy-migration-runner/src/commands/verify.js:334-337` (`metadataSchemaOk`), `:341-344` (`targetDbReachable`), `:481-483` (`executionId`), `:535-538` (`recordCommandComplete`), `:187-215` (`checkTenantCoverage`'s `registryAvailable` catch)

**Issue:** These catch blocks set a boolean flag (or silently no-op) but never capture `error.message` anywhere the report or logs would show it, e.g.:
```js
try {
  await ensureMetadataSchema(metaSequelize);
} catch (error) {
  metadataSchemaOk = false;
}
```
An operator seeing `metadata_schema_ok: false` or `target_db_reachable: false` in the report has no way to learn *why* without re-running with extra instrumentation — unlike the sibling `coreSchema`/`businessSchemas`/`migrationMetadata` catch blocks in the same file, which do thread `error.message` through via `failedSchemaResult`/inline objects.

**Fix:** At minimum `console.error` the caught error, or add an `*_error` field alongside the boolean in `report.summary`, for consistency with the rest of the file's error-reporting style.

---

_Reviewed: 2026-07-12T06:37:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
