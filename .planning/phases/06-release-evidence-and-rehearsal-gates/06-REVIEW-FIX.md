---
phase: 06-release-evidence-and-rehearsal-gates
fixed_at: 2026-07-12T06:52:09Z
review_path: .planning/phases/06-release-evidence-and-rehearsal-gates/06-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 6
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-07-12T06:52:09Z
**Source review:** .planning/phases/06-release-evidence-and-rehearsal-gates/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (explicit user selection: CR-01, CR-02 only): 2
- Fixed: 2
- Skipped (out of scope for this pass, per explicit user instruction): 6

This pass fixed only the 2 Critical findings the user explicitly selected. The 4 Warning and 2 Info findings were intentionally left untouched for a possible later pass, per explicit scope instruction — they were not evaluated for fixability, just left alone.

## Fixed Issues

### CR-01: `gate-release-dgfy-evidence.js` can never find the migration-verification/tenant-drift reports it just generated

**Files modified:** `scripts/gate-release-dgfy-evidence.js`, `scripts/gate-release-dgfy-evidence.test.js`
**Commit:** `c025b96b`
**Applied fix:**
- Changed the two `readLatestReport` call sites in `main()` from the underscore suffixes (`'migration_verification'`, `'tenant_drift'`) to the hyphenated suffixes (`'migration-verification'`, `'tenant-drift'`) that actually match what `buildReportFileName`'s sanitizer (`/[^a-z0-9-]+/gi` → `-`) produces on disk.
- Exported `readLatestReport` from `gate-release-dgfy-evidence.js` so it can be exercised directly in tests without spawning the real gate.
- Added a regression test, `readLatestReport: finds a report written with the real sanitized (hyphenated) filename convention`, in `gate-release-dgfy-evidence.test.js`. It writes files using the actual real-world naming convention (`{timestamp}-migration-verification.json` / `{timestamp}-tenant-drift.json`), asserts `readLatestReport` finds them with the hyphenated suffix, and asserts it returns `null` for the old (buggy) underscore suffix — directly proving the fix and pinning the sanitizer's underscore→hyphen behavior.

**Verification:**
- `node -c scripts/gate-release-dgfy-evidence.js` — syntax OK.
- `node --test scripts/gate-release-dgfy-evidence.test.js` — 13/13 passing (12 pre-existing + 1 new regression test).
- Confirmed the new test would have failed the underscore-suffix assertion against the pre-fix argument strings (verified by directly calling `readLatestReport(evidenceDir, 'migration_verification')` / `'tenant_drift'` against real hyphenated files — both correctly return `null`, i.e. the old lookup never matches).
- Manual smoke check: wrote reports via the real `writeJsonReport`/`buildReportFileName` functions from `apps/dgfy-migration-runner/src/reports/reportWriter.js` (e.g. `writeJsonReport(dir, 'migration_verification', ...)` → actual file `2026-07-12T06-49-48-185Z-migration-verification.json`), then confirmed `readLatestReport(dir, 'migration-verification')` and `readLatestReport(dir, 'tenant-drift')` now find them (previously always returned `null` in this exact scenario), and that the old underscore-suffix lookup still returns `null` against those same real files — precisely reproducing and resolving the bug described in the review.

### CR-02: Stale evidence artifacts in the reused evidence directory can mask real gate failures (fail-open)

**Files modified:** `scripts/gate-release-dgfy-evidence.js`
**Commit:** `ac4c8e60`
**Applied fix:**
1. Replaced `ensureDir(evidenceDir)` (create-if-missing, never clears) with a new `resetDir(evidenceDir)` helper that does `fs.rmSync(dirPath, { recursive: true, force: true })` followed by `fs.mkdirSync(dirPath, { recursive: true })`, called at the very start of `main()` before any evidence-generating command executes. This guarantees stale timestamped report files (`*-migration-verification.json`, `*-tenant-drift.json`, `*-release-evidence.json`) and the fixed-filename `seam_smoke.json` from a prior run against the same SHA can never be read as current evidence. `ensureDir` (now unused) was removed; both `dgfy-seam-smoke.js` and the migration-runner's `release-evidence` command already recreate the directory themselves via their own `mkdirSync(..., { recursive: true })` calls, so nothing depends on the directory pre-existing with content.
2. Captured the `compat.seam.smoke` step's exit code into `seamSmokeCommandOk` (mirroring the existing `migrationCommandOk` pattern for the migration-evidence step), and added a fail-closed branch: if the seam-smoke command exits non-zero, the gate immediately reports `compat.seam.smoke: ok=false` with detail `"... — command failed (fail-closed)"`, regardless of whatever `seam_smoke.json` currently contains on disk (stale or otherwise). This check now runs before the existing "file absent" / "empty seams[]" / "per-seam" branches.

**Verification:**
- `node -c scripts/gate-release-dgfy-evidence.js` — syntax OK.
- `node --test scripts/gate-release-dgfy-evidence.test.js` — 13/13 passing (no regressions from the CR-01 fix/test).
- `node --test scripts/dgfy-seam-smoke.test.js` — 12/12 passing (unaffected, as expected — this fix only changed how the orchestrator gate consumes the seam-smoke command's exit code, not the seam-smoke runner itself).
- Manual smoke check of `resetDir`'s semantics: created a temp dir seeded with a stale `stale-seam_smoke.json` and a stale `2020-01-01-migration-verification.json`, ran the reset logic, confirmed both files were gone and the directory was empty afterward (i.e. a fresh run can no longer observe a prior run's leftovers).
- No changes were made under `apps/dgfy-migration-runner/`, so the migration-runner test suite was not required to be re-run per the fix-task instructions (confirmed via `git diff <base>..HEAD --stat -- apps/dgfy-migration-runner/` showing no output).

## Skipped Issues

The following 6 findings were **not evaluated for fixability** — they are explicitly out of scope for this pass per the user's instruction to fix only CR-01 and CR-02. They remain fully documented in `06-REVIEW.md` for a possible later pass.

### WR-01: `verify.js` never closes any Sequelize connection it opens

**File:** `apps/dgfy-migration-runner/src/commands/verify.js` (whole file)
**Reason:** skipped (out of scope for this pass)

### WR-02: `cliContract.test.js`'s "--help lists all seven commands" test doesn't assert the new `release-evidence` command

**File:** `apps/dgfy-migration-runner/tests/cliContract.test.js:11-17`
**Reason:** skipped (out of scope for this pass)

### WR-03: `scripts/dgfy-seam-smoke.test.js` is never wired into any npm script or CI job

**File:** `scripts/dgfy-seam-smoke.test.js`, `package.json`
**Reason:** skipped (out of scope for this pass)

### WR-04: The architecture-boundary gate treats `apps/dgfy-migration-runner/` as guarded, but `check:architecture` never actually checks it

**File:** `scripts/gate-release-dgfy-evidence.js:36`, `package.json:79`
**Reason:** skipped (out of scope for this pass)

### IN-01: CLI version string duplicated instead of sourced from `package.json`

**File:** `apps/dgfy-migration-runner/src/cli.js:33`
**Reason:** skipped (out of scope for this pass)

### IN-02: Several `catch` blocks in `verify.js` swallow the actual error without logging or surfacing it in the report

**File:** `apps/dgfy-migration-runner/src/commands/verify.js` (multiple locations)
**Reason:** skipped (out of scope for this pass)

---

_Fixed: 2026-07-12T06:52:09Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
