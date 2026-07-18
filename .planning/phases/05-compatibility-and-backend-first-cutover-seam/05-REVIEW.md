---
phase: 05-compatibility-and-backend-first-cutover-seam
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .github/workflows/ci.yml
  - apps/dgfy-api/eslint.config.mjs
  - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
  - apps/dgfy-migration-runner/src/cli.js
  - apps/dgfy-migration-runner/src/commands/verifyContinuity.js
  - apps/dgfy-migration-runner/tests/verifyContinuity.test.js
  - backend/scripts/check-architecture-guardrails.compat.test.js
  - backend/scripts/check-architecture-guardrails.js
  - docs/architecture/adr/0035-compatibility-seam-governance.md
  - docs/architecture/ARCHITECTURE_GOVERNANCE.md
  - docs/architecture/COMPATIBILITY_INVENTORY.md
  - docs/architecture/compatibility-seams.json
  - scripts/check-compat-seams.js
  - scripts/check-compat-seams.test.js
  - scripts/generate-compat-inventory.js
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

The manifest schema/completeness validator (`scripts/check-compat-seams.js`), the manifest
itself, the generated inventory doc, ADR-0035, and the guardrail-script extension for
`entities/`-layer compat imports are all internally consistent and reasonably well tested at the
unit level (pure-logic branches, path-traversal defenses, staged-vs-full-tree scan behavior).

However, cross-referencing the reviewed files against the actual CI wiring in `.github/workflows/ci.yml`
and the root/package-level `npm run test:*` scripts surfaces a systemic gap: **none of the three new
automated test files this phase introduces are ever executed by CI or any test aggregator**, and
**the entire `apps/dgfy-migration-runner` package — which owns the phase's one reference compatibility
seam (D-02) — has no CI job at all.** The manifest's own completeness gate only verifies that a
`tests` path *exists on disk* (`fs.existsSync`), not that it is ever run. Combined, this means the
phase's central claim — "acceptance is mechanical rather than reviewer-discretionary" (ADR-0035) —
is not actually backed by continuous verification for the one seam this phase ships. A regression in
`verifyContinuity.js`, the compat-seams validator itself, or the new `domainCompatLeak` guardrail logic
would currently go undetected indefinitely.

A secondary, related gap: ADR-0035 states the domain layer is "guarded by two independent mechanisms
(guardrail script + ESLint)," but the ESLint mechanism (`apps/dgfy-api/eslint.config.mjs`) is never
invoked in CI — only the guardrail script is.

## Critical Issues

### CR-01: `apps/dgfy-migration-runner` has zero CI test execution — the phase's own reference compat seam is unverified in automation

**File:** `.github/workflows/ci.yml` (whole file), `apps/dgfy-migration-runner/tests/verifyContinuity.test.js` (whole file)
**Issue:**
`apps/dgfy-migration-runner` is a standalone npm package (`apps/dgfy-migration-runner/package.json`,
`"test": "node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand"`)
with 26 Jest test files, including `verifyContinuity.test.js` — the test that proves D-02, the ONE
concrete reference compatibility seam this phase delivers, and the exact path the manifest's
`tests` field points to (`docs/architecture/compatibility-seams.json`).

There is no `test-dgfy-migration-runner` (or equivalent) job in `.github/workflows/ci.yml`, and
`grep -rl "dgfy-migration-runner" .github/workflows/*.yml` returns zero matches across every
workflow file in the repo. No root `package.json` script (`test`, `test:backend`, `test:frontend`,
or any `test:*` aggregate) invokes `apps/dgfy-migration-runner`'s test suite either. Compare this to
the sibling `apps/dgfy-api` package, which *does* get a dedicated `test-dgfy-api` job (lines 240-268)
running both the architecture guardrail and `npm test`.

`scripts/check-compat-seams.js`'s `validateSeamTestPaths` (lines 192-228) only confirms the
`tests` path is repo-relative, traversal-free, and exists via `fs.existsSync` — it never executes the
referenced test. So the manifest's CMP-02 "mechanical acceptance" completeness gate is satisfied by
the mere presence of a test file on disk, regardless of whether that file is ever run, or whether it
currently passes.

Net effect: the reference compatibility seam this phase exists to demonstrate — and all 25 other
tests in that package, including the destructive-migration safety gates (`safetyGates.test.js`) — can
regress or break silently with no CI signal.

**Fix:**
```yaml
  test-dgfy-migration-runner:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: ./apps/dgfy-migration-runner
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: apps/dgfy-migration-runner/package-lock.json
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
```
Add `test-dgfy-migration-runner` to the `needs:` list of `journey-e2e-release-gate` (or any release
gate) so a red build actually blocks merges, mirroring how `test-dgfy-api` and `test-backend` are wired.

---

### CR-02: `scripts/check-compat-seams.test.js` — the validator's own regression suite — is never executed anywhere

**File:** `scripts/check-compat-seams.test.js` (whole file)
**Issue:**
This repo's established convention for `scripts/*.test.js` files (Node's built-in `node:test` runner,
not Jest) is explicit registration in an `npm run test:*` aggregate — see
`test:deploy-contract`, `test:merge-adoption`, `test:development-to-production`, and
`test:release-controller` in root `package.json` (each lists its `.test.js` files individually; there
is no automatic glob discovery). `scripts/check-compat-seams.test.js` was never added to any of these
lists, nor referenced directly in any CI workflow or `.husky/pre-commit` step.

This is the test suite covering the exact mechanism this phase relies on for enforcement — schema
validation, completeness gating, path-traversal defenses, and bidirectional marker reconciliation
(including the `--staged` pre-commit mode). None of it runs automatically. A regression in
`scripts/check-compat-seams.js` (e.g., accidentally weakening `validateSeamTestPaths`'s traversal
checks, or breaking the `--staged` marker scan) would not be caught by CI.

**Fix:** Add a `test:compat-seams` script to root `package.json` and wire it into an existing CI job
(e.g., `batch-inventory` or a new lightweight `scripts-tests` job):
```json
"test:compat-seams": "node --test scripts/check-compat-seams.test.js"
```
and a corresponding CI step: `run: npm run test:compat-seams`.

---

### CR-03: `backend/scripts/check-architecture-guardrails.compat.test.js` — proof of this phase's core guardrail extension (D-05a/D-05b) — is never executed anywhere

**File:** `backend/scripts/check-architecture-guardrails.compat.test.js` (whole file), `backend/jest.config.cjs:11`
**Issue:**
This test uses Node's built-in `node:test` runner (`import { test } from 'node:test'`). `backend/jest.config.cjs`
sets `roots: ['<rootDir>/tests']` (line 11), so Jest never discovers files under `backend/scripts/`
even if it wanted to (and would error trying to load `node:test`-based files as Jest specs regardless).
No `node --test backend/scripts/*.test.js` invocation exists in `backend/package.json`, root
`package.json`, `.github/workflows/ci.yml`, or `.husky/pre-commit`.

This is the ONLY test that exercises the specific new behavior this phase adds to
`check-architecture-guardrails.js`: the `entities/`-directory `domainCompatLeak` scan (previously only
`usecases/` was scanned — see the file's own "RESEARCH Pitfall 3" comment). Right now, if a future edit
to `check-architecture-guardrails.js` silently reintroduces the "entities/ unscanned" gap this phase
was written to close, nothing will catch it.

**Fix:** Add to `backend/package.json`:
```json
"test:architecture-guardrails-compat": "node --test scripts/check-architecture-guardrails.compat.test.js"
```
and invoke it from the `test-backend` CI job, alongside the existing
"Enforce modular architecture guardrails" step:
```yaml
      - name: Run architecture-guardrails regression suite
        run: npm run test:architecture-guardrails-compat
```

## Warnings

### WR-01: ADR-0035's "two independent mechanisms" claim for CMP-03 is only one mechanism in CI

**File:** `apps/dgfy-api/eslint.config.mjs:36-51`, `.github/workflows/ci.yml:240-268`
**Issue:** ADR-0035 (`docs/architecture/adr/0035-compatibility-seam-governance.md`, Consequences §3)
states: "The dgfy-api domain layer (`entities/` and `usecases/`) is guarded against compat/continuity
imports by two independent mechanisms (guardrail script + ESLint)." `apps/dgfy-api/package.json`
defines `"lint": "eslint src"`, which would exercise the `no-restricted-imports` rule added in
`eslint.config.mjs`. But the `test-dgfy-api` CI job only runs "Enforce architecture guardrails"
(`npm run check:architecture:dgfy-api`) and "Run tests" (`npm test`) — it never runs `npm run lint`.
Only `test-frontend` runs `npm run lint` in this CI file. In practice, only one of the two claimed
independent mechanisms is continuously enforced; the ESLint rule only fires if a developer manually
runs `npm run lint` locally.
**Fix:** Add a lint step to the `test-dgfy-api` job:
```yaml
      - name: Run lint
        run: npm run lint
```

### WR-02: Generated compatibility inventory doc has no CI drift check despite the generator's own stated guarantee

**File:** `scripts/generate-compat-inventory.js:9-10`, `.github/workflows/ci.yml` (whole file), `.husky/pre-commit`
**Issue:** The file's header comment states: "The render is a pure function of the manifest contents
... so `generate -> git diff --exit-code` proves the doc never drifts from its source of truth." No
such `generate -> git diff --exit-code` step exists anywhere — not in `ci.yml`, not in
`.husky/pre-commit` (which only re-runs the *validator*, `check-compat-seams.js`, when compat-seam
surface files are staged; it never re-runs the *generator* and diffs the output). A developer can edit
`docs/architecture/compatibility-seams.json` and forget to run `npm run generate:compat-inventory`,
leaving `docs/architecture/COMPATIBILITY_INVENTORY.md` stale, with nothing in CI or pre-commit
catching it.
**Fix:** Add a CI step (e.g., in the `lint-docs` job) or a pre-commit hook triggered on
`compatibility-seams.json` changes:
```bash
npm run generate:compat-inventory
git diff --exit-code -- docs/architecture/COMPATIBILITY_INVENTORY.md || {
  echo "COMPATIBILITY_INVENTORY.md is stale — run npm run generate:compat-inventory and commit the result."
  exit 1
}
```

### WR-03: `finally { await legacy.close(); }` can mask the real probe error

**File:** `apps/dgfy-migration-runner/src/commands/verifyContinuity.js:144-157`
**Issue:** If `probeSourceTables(legacy)` throws (e.g., a transient MySQL error mid-`SHOW TABLES`/
`COUNT(*)`), and then `legacy.close()` in the `finally` block also throws (e.g., the connection is
already broken), the `close()` exception silently replaces the original probe error per standard JS
try/finally semantics — the operator loses the actual root cause in their error output/logs.
**Fix:**
```js
} finally {
  try {
    await legacy.close();
  } catch (closeError) {
    console.error(`[verify-continuity] warning: failed to close SOURCE_DB connection: ${closeError.message}`);
  }
}
```

## Info

### IN-01: `--staged` mode silently treats a `git diff` failure the same as "no staged files"

**File:** `scripts/check-compat-seams.js:55-62, 256-263`
**Issue:** `runCommand(..., { allowFail: true })` swallows any error from
`git diff --cached --name-only` and returns `''`, which `resolveStagedCodeFiles` then treats as "zero
staged files." If `git` itself fails for a reason other than "nothing staged" (missing binary,
corrupted `.git`, running outside a repo), the `--staged` pre-commit gate would pass with a false
"no staged compat markers" result instead of failing loudly. Low risk in practice because the CI job
always runs the non-`--staged`, full-tree variant as a backstop, but worth distinguishing "empty
output" from "command errored" for the pre-commit-only code path.
**Fix:** Only pass `allowFail: true` for the specific "not in a git work tree" case, or check
`error.status`/`error.stderr` before deciding to swallow vs. rethrow.

### IN-02: Redundant `.toLowerCase()` calls in `buildContinuityReport`

**File:** `apps/dgfy-migration-runner/src/commands/verifyContinuity.js:72-78`
**Issue:** `EXPECTED_LEGACY_DOMAIN_TABLES` (lines 24-31) is a hardcoded, already-lowercase constant
array (`'items'`, `'purchase_orders'`, etc.), so `table.toLowerCase()` in the `findings` map is dead
defensive code — harmless, but slightly misleading (implies the constant might not be lowercase).
**Fix:** Either drop the `.toLowerCase()` call, or add a one-time assertion/test that
`EXPECTED_LEGACY_DOMAIN_TABLES` entries are already lowercase so the call's intent is clear.

---

_Reviewed: 2026-07-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
