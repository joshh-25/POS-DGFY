---
phase: 05-compatibility-and-backend-first-cutover-seam
fixed_at: 2026-07-12T04:49:46Z
review_path: .planning/phases/05-compatibility-and-backend-first-cutover-seam/05-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-07-12T04:49:46Z
**Source review:** .planning/phases/05-compatibility-and-backend-first-cutover-seam/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (fix_scope: critical_warning — CR-* and WR-* findings; IN-01/IN-02 out of scope)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: `apps/dgfy-migration-runner` has zero CI test execution — the phase's own reference compat seam is unverified in automation

**Files modified:** `.github/workflows/ci.yml`
**Commit:** 902715f2
**Applied fix:** Added a new `test-dgfy-migration-runner` job (checkout, Node 24 setup with npm cache keyed on the package's lockfile, `npm ci`, `npm test`) matching the pattern used by the sibling `test-dgfy-api` job. Added `test-dgfy-migration-runner` to the `needs:` list of `journey-e2e-release-gate` so a red build blocks the release gate, mirroring `test-backend`/`test-frontend`. Verified with `actionlint` (no errors) and confirmed the package's `package-lock.json` exists for the cache-dependency-path.

### CR-02: `scripts/check-compat-seams.test.js` — the validator's own regression suite — is never executed anywhere

**Files modified:** `package.json`, `.github/workflows/ci.yml`
**Commit:** e1f78695
**Applied fix:** Added `"test:compat-seams": "node --test scripts/check-compat-seams.test.js"` to root `package.json` (alongside the existing `check:compat-seams` / `generate:compat-inventory` entries), and added a "Run compat-seams regression suite" step to the existing `batch-inventory` CI job (runs after `npm ci`, before batch-inventory generation). Verified by running `node --test scripts/check-compat-seams.test.js` directly — all 12 tests pass — and `actionlint` on the workflow file (no errors).

### CR-03: `backend/scripts/check-architecture-guardrails.compat.test.js` — proof of this phase's core guardrail extension (D-05a/D-05b) — is never executed anywhere

**Files modified:** `backend/package.json`, `.github/workflows/ci.yml`
**Commit:** 82072acc
**Applied fix:** Added `"test:architecture-guardrails-compat": "node --test scripts/check-architecture-guardrails.compat.test.js"` to `backend/package.json`, and added a "Run architecture-guardrails regression suite" step to the `test-backend` CI job immediately after "Enforce modular architecture guardrails". Verified by running `node --test scripts/check-architecture-guardrails.compat.test.js` from `backend/` directly — all 3 tests pass — and `actionlint` on the workflow file (no errors).

### WR-01: ADR-0035's "two independent mechanisms" claim for CMP-03 is only one mechanism in CI

**Files modified:** `.github/workflows/ci.yml`
**Commit:** 2d72f073
**Applied fix:** Added a "Run lint" step (`npm run lint`) to the `test-dgfy-api` CI job, between the architecture-guardrails step and the test step, so the ESLint `no-restricted-imports` mechanism ADR-0035 claims is now continuously enforced in CI, not just locally. Verified by running `npm run lint` in `apps/dgfy-api` from the main working tree (dependencies installed there) — 10 pre-existing warnings, 0 errors, exit code 0 — confirming this addition will not break the build. Also verified with `actionlint` (no errors).

### WR-02: Generated compatibility inventory doc has no CI drift check despite the generator's own stated guarantee

**Files modified:** `.github/workflows/ci.yml`
**Commit:** a752bcd8
**Applied fix:** Added a "Verify compatibility inventory doc matches manifest" step to the `lint-docs` CI job that runs `npm run generate:compat-inventory` and then `git diff --exit-code` against `docs/architecture/COMPATIBILITY_INVENTORY.md`, failing with a clear message if the generated doc drifts from the manifest. Confirmed `scripts/generate-compat-inventory.js` has no external dependencies (uses only `fs`/`path`), so no `npm ci` step is required before running it in this job. Verified locally by running the generator against the current manifest — zero diff, confirming the doc is currently in sync and this gate will not immediately fail. Verified with `actionlint` (no errors).

### WR-03: `finally { await legacy.close(); }` can mask the real probe error

**Files modified:** `apps/dgfy-migration-runner/src/commands/verifyContinuity.js`
**Commit:** e27147ea
**Applied fix:** Wrapped `await legacy.close()` in the `finally` block with its own `try/catch`, logging a `console.error` warning on close failure instead of letting it silently replace the original probe error — exactly as suggested in the review. Verified with `node --check` (syntax OK) and by running the existing Jest suite (`tests/verifyContinuity.test.js`) via a temporary `node_modules` symlink into the main repo's installed dependencies — all 5 non-skipped tests pass (1 integration test skipped as expected, requires live SOURCE_DB credentials). Symlink was removed before committing; only the source file was modified.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-07-12T04:49:46Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
