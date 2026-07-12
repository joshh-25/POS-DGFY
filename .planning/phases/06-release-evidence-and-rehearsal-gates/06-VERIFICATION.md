---
phase: 06-release-evidence-and-rehearsal-gates
verified: 2026-07-12T06:57:49Z
status: human_needed
score: 2/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Decide whether apps/dgfy-migration-runner/ counts as a 'backend or API boundary' for SC1's architecture-checks claim, and if so, either add a migration-runner architecture-guardrail target to check:architecture or drop apps/dgfy-migration-runner/ from BOUNDARY_PREFIXES in scripts/gate-release-dgfy-evidence.js (WR-04)."
    expected: "Either (a) a migration-runner-only diff runs a check:architecture chain that actually inspects apps/dgfy-migration-runner/ code, giving a meaningful pass/fail, or (b) BOUNDARY_PREFIXES no longer claims migration-runner-only changes are architecture-gated, so the gate's stated coverage matches its actual coverage."
    why_human: "This is a judgment call on scope/intent (does 'backend or API boundary' in SC1 include the migration-runner CLI tool, which is neither backend/ nor apps/dgfy-api/?) rather than a pure code-correctness question — the code review (06-REVIEW.md WR-04) flagged it and the fix was explicitly deferred by the user's own scoping instruction in the follow-up pass (06-REVIEW-FIX.md), so a maintainer decision is needed on whether to accept the current scope-mismatch or require a follow-up fix before Phase 7 relies on this gate."
---

# Phase 06: Release Evidence and Rehearsal Gates Verification Report

**Phase Goal:** Release readiness is backed by architecture, migration, drift, and compatibility evidence instead of health checks alone.
**Verified:** 2026-07-12T06:57:49Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Release evidence includes passing architecture checks for any changed backend or API boundary. | ? UNCERTAIN | `scripts/gate-release-dgfy-evidence.js` correctly runs `npm run check:architecture` when `apps/dgfy-api/` or `backend/src/modules/` changes, and records a passed not-applicable gate otherwise (verified live: `RELEASE_TARGET_SHA=verifytest01 node scripts/gate-release-dgfy-evidence.js` → `architecture.dgfy: PASS :: not applicable — no backend/API boundary change`). **However** `BOUNDARY_PREFIXES` also includes `apps/dgfy-migration-runner/`, and the root `check:architecture` script (`package.json:79`) only chains `backend`/`check:architecture-guardrails`, `check:controller-boundaries`, and `check:architecture:dgfy-api` — none of which inspect `apps/dgfy-migration-runner/` at all (confirmed by reading both `package.json:79-80` and the chain's targets). A migration-runner-only diff flips `boundaryChanged=true`, runs `check:architecture`, and reports a pass/fail that is entirely disconnected from the changed code — a false-assurance gap for one of the gate's three declared boundaries. This is documented, known, and un-fixed (06-REVIEW.md WR-04; explicitly left unfixed in 06-REVIEW-FIX.md by user scope selection). Routed to human verification below. |
| 2 | Migration verification and tenant drift checks produce reviewable reports for all targeted `dgfy_*` schemas. | ✓ VERIFIED | `apps/dgfy-migration-runner/src/commands/releaseEvidence.js` discovers active tenants from `business_database_registry JOIN businesses`, gates on TTY, and for each operator-selected tenant produces two independently-sourced reports (`tenant_drift` via `checkContractSchema`, `migration_verification` via `checkMigrationMetadata` against the `dgfy_migration_meta` ledger). CR-01 (orchestrator could never locate the real hyphen-suffixed report filenames, making these gates structurally always-fail) is confirmed fixed in current source (`scripts/gate-release-dgfy-evidence.js:190-191` reads `'migration-verification'`/`'tenant-drift'`, matching `buildReportFileName`'s sanitizer). CR-02 (stale evidence dir masking failures) is confirmed fixed: `resetDir()` (`:78-81`) is called at the top of `main()` before any evidence-generating command runs, and the seam-smoke command's exit code is now captured into `seamSmokeCommandOk` and fails closed on non-zero. Live end-to-end run (`RELEASE_TARGET_SHA=verifytest01 node scripts/gate-release-dgfy-evidence.js`, no real DB creds available in this sandbox) confirms `migration.verification`/`tenant.drift` correctly fail closed on a real connection error rather than silently passing, and the full `apps/dgfy-migration-runner` jest suite (23/23 non-DB suites, 308/315 tests) passes including `releaseEvidence.test.js`'s fail-closed-TTY, no-secrets-report-shape, and CLI-registration tests. |
| 3 | Targeted smoke or contract checks prove any touched compatibility seams still preserve current behavior. | ✓ VERIFIED | `scripts/dgfy-seam-smoke.js` reuses `loadManifest` from `check-compat-seams.js`, filters `status === 'active'` from `docs/architecture/compatibility-seams.json` (currently one seam: `db-continuity-legacy-backup`), and fails closed when required integration env (`RUN_CONTINUITY_INTEGRATION` + `SOURCE_DB_*`) is absent — confirmed both by source read and live run (`db-continuity-legacy-backup: FAIL :: Missing required integration env ...`). `node --test scripts/dgfy-seam-smoke.test.js` passes 12/12 (active-filter, env-map, fail-closed, unknown-seam). Orchestrator wiring confirmed: `gate-release-dgfy-evidence.js` shells out to this script and reads `seam_smoke.json` with correct fail-closed handling on absent/stale/non-zero-exit cases (CR-02). |

**Score:** 2/3 truths verified (1 uncertain, routed to human decision)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/dgfy-migration-runner/src/commands/releaseEvidence.js` | Interactive release-evidence command | ✓ VERIFIED | Exports `runReleaseEvidence`, imports `checkbox` from `@inquirer/prompts`, `checkContractSchema`+`checkMigrationMetadata` from `./verify.js`; TTY guard before prompt; connections closed in `finally`; no-secrets report payload. |
| `apps/dgfy-migration-runner/tests/releaseEvidence.test.js` | DB-free jest coverage | ✓ VERIFIED | 6 passing, 1 skipped (gated behind `RUN_RELEASE_EVIDENCE_INTEGRATION`, correct per plan). Covers fail-closed TTY, no-secrets shape, zero-tenant path, CLI registration. |
| `apps/dgfy-migration-runner/src/commands/verify.js` | `export`ed `checkContractSchema` + `checkMigrationMetadata` | ✓ VERIFIED | Both exported and imported by `releaseEvidence.js`; no behavior change to internal call sites. |
| `apps/dgfy-migration-runner/src/cli.js` | `release-evidence` subcommand registered | ✓ VERIFIED | `.command('release-evidence')` with `--evidence-dir` wired to `runReleaseEvidence`; confirmed via grep and jest `cliContract`/`releaseEvidence` tests. |
| `scripts/dgfy-seam-smoke.js` | Generic manifest-driven seam-smoke runner | ✓ VERIFIED | Reuses `loadManifest`; active-filter; env-gated fail-closed dispatch; exports pure helpers guarded behind `require.main === module`; writes `seam_smoke.json`. |
| `scripts/dgfy-seam-smoke.test.js` | `node --test` coverage | ✓ VERIFIED | 12/12 passing. **Not wired into any npm script or CI job** (WR-03, deferred) — runs only via direct invocation; does not block functional verification. |
| `scripts/gate-release-dgfy-evidence.js` | On-demand orchestrator producing verdict artifact | ✓ VERIFIED | Aggregates `release.target_sha`, `architecture.dgfy`, `migration.verification`, `tenant.drift`, `compat.seam.smoke.*` gates; writes `dgfy_release_evidence.json`; self-validates via `verify-release-verdict.js`. Live-run-confirmed end to end. |
| `scripts/gate-release-dgfy-evidence.test.js` | `node --test` coverage of verdict contract | ✓ VERIFIED | 13/13 passing, including the CR-01 regression test (`readLatestReport: finds a report written with the real sanitized (hyphenated) filename convention`). |
| `package.json` scripts | `gate:release:dgfy-evidence`, `check:dgfy-seam-smoke`, `test:dgfy-release-evidence` | ✓ VERIFIED | All three present; no existing script values changed (confirmed `.github/workflows/ci.yml` is unmodified by this phase's commit history — D-05). |
| `dgfy_release_evidence.json` (runtime artifact) | verdict-shaped artifact under `.tmp/release-gates/<sha>/` | ✓ VERIFIED (live-generated) | Produced by a real invocation in this verification pass; conforms to `verify-release-verdict.js` contract (`generated_at`, `target_sha` string, `verdict` ∈ {pass,fail,bypassed}, non-empty `gates[]`); self-validation printed `OK`. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `cli.js` | `releaseEvidence.js` | `.command('release-evidence')` → `runReleaseEvidence()` | ✓ WIRED | Confirmed by grep + passing `cliContract`/`releaseEvidence` jest tests. |
| `releaseEvidence.js` | `verify.js` | `import { checkContractSchema, checkMigrationMetadata } from './verify.js'` | ✓ WIRED | Both engines imported and called per selected tenant, independently try/caught so a failure in one never masquerades as the other. |
| `dgfy-seam-smoke.js` | `check-compat-seams.js` | `require('./check-compat-seams.js').loadManifest` | ✓ WIRED | No duplicate manifest parser; confirmed by source read. |
| `gate-release-dgfy-evidence.js` | `apps/dgfy-migration-runner/src/cli.js release-evidence` | `spawnSync('node', [...])` + `readLatestReport` on hyphenated suffixes | ✓ WIRED (CR-01 fixed) | Previously broken (underscore vs. hyphen filename mismatch); confirmed fixed in current source and by a passing regression test + live smoke run. |
| `gate-release-dgfy-evidence.js` | `scripts/dgfy-seam-smoke.js` | `spawnSync` + `seam_smoke.json` read, exit-code captured | ✓ WIRED (CR-02 fixed) | `seamSmokeCommandOk` now captured and fails closed on non-zero exit regardless of stale file contents; `resetDir()` clears the evidence dir before each run. |
| `gate-release-dgfy-evidence.js` | `scripts/verify-release-verdict.js` | self-validation `spawnSync` after artifact write | ✓ WIRED | Confirmed live: self-validation printed `OK` against the freshly written artifact. |
| `gate-release-dgfy-evidence.js` | `check:architecture` (npm script) | conditional `runCommand` on `boundaryChanged` | ⚠️ PARTIAL (scope mismatch) | Wired and functional for `apps/dgfy-api/`/`backend/src/modules/`; `apps/dgfy-migration-runner/` is included in the trigger condition (`BOUNDARY_PREFIXES`) but `check:architecture`'s command chain never actually inspects that directory (WR-04). See Truth 1 / Human Verification. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CMP-04 | 06-01, 06-02, 06-03 | Release evidence includes architecture checks, migration verification, tenant drift checks, and targeted smoke/contract checks for touched compatibility seams. | ✓ SATISFIED (with WR-04 caveat) | All three plans declare `requirements: [CMP-04]`; matches `REQUIREMENTS.md:72` and the coverage table (`REQUIREMENTS.md:135` marks it "Complete"). Functionally all four evidence types (architecture, migration verification, tenant drift, seam smoke) are produced and aggregated into a single contract-valid verdict artifact. The architecture-check component has a scope-accuracy gap for the migration-runner boundary (see Truth 1). |

No orphaned requirements found — `REQUIREMENTS.md` maps only CMP-04 to Phase 6, and all three plans claim it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 5 core files modified/created this phase (`releaseEvidence.js`, `cli.js`, `verify.js`, `dgfy-seam-smoke.js`, `gate-release-dgfy-evidence.js`). | — | — |
| `apps/dgfy-migration-runner/src/commands/verify.js` | whole file | `runVerify()`/`checkLegacyNonMutation()` never close Sequelize connections they open (WR-01, pre-existing, not introduced this phase — `releaseEvidence.js` itself correctly closes all connections in `finally`). | ⚠️ Warning (deferred, out of scope for this pass per explicit user selection) | Connection-pool leak risk on every `verify` invocation; more consequential now that `verify.js`'s engines are reused, but does not affect `release-evidence`'s own correctness. |
| `apps/dgfy-migration-runner/tests/cliContract.test.js` | 11-17 | "`--help` lists all seven commands" test still enumerates only 6 names, never asserts `release-evidence` (WR-02, deferred). | ⚠️ Warning (deferred) | No regression protection for the exact command this phase registered — could silently regress in a future refactor without test failure. |
| `scripts/dgfy-seam-smoke.test.js` / `package.json` | whole file | 12-test suite has no npm script / CI wiring (WR-03, deferred). | ⚠️ Warning (deferred) | Tests only run via direct `node --test` invocation; no automated regression protection. |
| `scripts/gate-release-dgfy-evidence.js:36`, `package.json:79` | — | `BOUNDARY_PREFIXES` includes `apps/dgfy-migration-runner/` but `check:architecture` never inspects it (WR-04, deferred). | ⚠️ Warning → routed to human decision (see Truth 1) | False assurance for the migration-runner boundary in the SC1 architecture-checks claim. |
| `apps/dgfy-migration-runner/src/cli.js:33` | — | `.version('1.0.0')` hardcoded, duplicating `package.json` (IN-01, deferred). | ℹ️ Info | Cosmetic drift risk. |
| `apps/dgfy-migration-runner/src/commands/verify.js` | several | Several `catch` blocks swallow `error.message` without surfacing it (IN-02, deferred). | ℹ️ Info | Debuggability only. |

None of the deferred warnings/info items involve unreferenced debt markers (`TBD`/`FIXME`/`XXX`) — they are documented findings in `06-REVIEW.md`/`06-REVIEW-FIX.md`, which constitutes formal follow-up tracking, so the debt-marker gate does not apply.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full `apps/dgfy-migration-runner` jest suite passes (no regressions from exports/new command) | `npm --prefix apps/dgfy-migration-runner test` | 23/23 non-DB suites, 308/315 tests passed (7 skipped, integration-gated) | ✓ PASS |
| `dgfy-seam-smoke.js` unit suite passes | `node --test scripts/dgfy-seam-smoke.test.js` | 12/12 passed | ✓ PASS |
| `gate-release-dgfy-evidence.js` unit suite passes, including CR-01 regression test | `node --test scripts/gate-release-dgfy-evidence.test.js` | 13/13 passed | ✓ PASS |
| Orchestrator produces a contract-valid verdict artifact end-to-end, failing closed with no real DB creds | `RELEASE_TARGET_SHA=verifytest01 node scripts/gate-release-dgfy-evidence.js` | 5 gates recorded, `verdict:"fail"` (correctly, due to real DB auth failure), self-validation printed `OK` against `verify-release-verdict.js`'s contract | ✓ PASS |
| `.github/workflows/ci.yml` unmodified by this phase | `git log --oneline -- .github/workflows/ci.yml` (no phase-06 commits touching it) | No phase-06 commits found touching this path | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist in this repository and neither PLAN nor SUMMARY documents reference a probe-based verification mechanism for this phase. Step 7c: SKIPPED (no probes declared or discovered).

### Human Verification Required

### 1. WR-04 — architecture-boundary scope mismatch for `apps/dgfy-migration-runner/`

**Test:** Decide whether `apps/dgfy-migration-runner/` should count as a "backend or API boundary" for SC1's architecture-checks claim.
**Expected:** Either (a) `check:architecture` gains a migration-runner architecture-guardrail target (mirroring `check:architecture:dgfy-api`) so a migration-runner-only diff is genuinely inspected, or (b) `apps/dgfy-migration-runner/` is dropped from `BOUNDARY_PREFIXES` in `scripts/gate-release-dgfy-evidence.js:36` so the gate's claimed coverage matches what it actually checks.
**Why human:** This is a scope/intent judgment call (is a CLI migration tool a "backend/API boundary"?), not a code-correctness bug — the underlying code review finding (06-REVIEW.md WR-04) was seen and explicitly deferred by the user's own scope instruction during the fix pass (06-REVIEW-FIX.md fixed CR-01/CR-02 only). A maintainer decision is needed on whether Phase 7's cutover decision can rely on this gate's "architecture.dgfy: PASS" claim for migration-runner-only changes, or whether a follow-up fix is required first.

### Gaps Summary

No must-have truth, artifact, or key link was found MISSING, STUB, or NOT_WIRED. The two Critical findings from code review (CR-01: filename-suffix mismatch that made `migration.verification`/`tenant.drift` structurally always-fail; CR-02: stale evidence directory that could mask real failures as passes) were verified fixed by reading the current source (not just trusting the fix report), confirmed by their regression tests, and confirmed again with a live end-to-end run of the orchestrator in this sandbox.

One item — WR-04 — was explicitly assessed against Success Criterion 1 per this verification's instructions and found to be a genuine, if narrow, gap: `scripts/gate-release-dgfy-evidence.js`'s `BOUNDARY_PREFIXES` claims `apps/dgfy-migration-runner/` as a guarded architecture boundary, but the `check:architecture` command it runs never actually inspects that directory. This does not make the architecture gate non-functional (it correctly runs/skips for `apps/dgfy-api/` and `backend/src/modules/`, and never produces an empty `gates[]`), but it does mean a migration-runner-only release can show `architecture.dgfy: PASS` without that pass meaning anything about the changed code. This is routed to human verification rather than marked FAILED, since it is a scope/intent question the user already explicitly chose to defer past the CR-01/CR-02 fix pass, and does not block the phase's core evidence-generation and aggregation machinery from working.

The remaining deferred findings (WR-01 connection leak in pre-existing `verify.js` code, WR-02 stale "seven commands" test assertion, WR-03 unwired seam-smoke test script, IN-01 version-string duplication, IN-02 swallowed error messages) are robustness/regression-protection gaps, not functional gaps in the delivered evidence pipeline, and are already fully documented with rationale in `06-REVIEW.md`/`06-REVIEW-FIX.md` for a possible later pass.

---

_Verified: 2026-07-12T06:57:49Z_
_Verifier: Claude (gsd-verifier)_
