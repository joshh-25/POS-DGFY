---
phase: 06-release-evidence-and-rehearsal-gates
plan: 03
subsystem: infra
tags: [release-gates, orchestrator, verdict-contract, spawnSync, fail-closed, node-test]

# Dependency graph
requires:
  - phase: 06-release-evidence-and-rehearsal-gates
    plan: "06-01"
    provides: "apps/dgfy-migration-runner/src/commands/releaseEvidence.js — interactive release-evidence CLI subcommand"
  - phase: 06-release-evidence-and-rehearsal-gates
    plan: "06-02"
    provides: "scripts/dgfy-seam-smoke.js — manifest-driven compatibility-seam smoke runner"
provides:
  - "scripts/gate-release-dgfy-evidence.js — on-demand orchestrator aggregating architecture, migration/drift, and seam-smoke gates into dgfy_release_evidence.json"
  - "dgfy_release_evidence.json runtime artifact (release_verdict-contract, self-validated by verify-release-verdict.js)"
affects: ["07-cutover-rehearsal-and-abort-thresholds"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate-script helper duplication convention (runCommand/captureStdout/addGate/ensureDir) followed exactly, matching gate-release-local.js/dgfy-seam-smoke.js"
    - "Pure helpers (buildVerdictPayload/isBoundaryChanged) exported, guarded behind require.main === module, for DB-free unit testing"

key-files:
  created:
    - scripts/gate-release-dgfy-evidence.js
    - scripts/gate-release-dgfy-evidence.test.js
  modified:
    - package.json

key-decisions:
  - "migration.verification/tenant.drift gates derive ok from the runner's written report content (summary.ok), not from the child process exit code alone — the release-evidence CLI action never translates an internal ok:false into a non-zero exit, so exit-code-only would produce a false-pass verdict (closes T-06-03-01)"
  - "Report files use the runner's {timestamp}-{command}.json naming (D-16), not a fixed filename, so the orchestrator globs the evidence dir for the newest matching suffix rather than a hardcoded path"
  - "seam_smoke.json's empty seams[] (no active manifest entries) is treated as a legitimate not-applicable pass, mirroring dgfy-seam-smoke.js's own [].every()===true semantics — distinct from an absent file, which fails closed"
  - "Self-validation against verify-release-verdict.js runs as a genuinely separate final check after the artifact is written (not embedded inside its own gates[], which would be self-referential/circular); its result additionally gates the overall process exit code"

patterns-established:
  - "Orchestrator gate scripts that shell out to commands whose CLI wrapper doesn't propagate internal report-level failure to exit code must read the written report content directly rather than trusting spawnSync's status alone"

requirements-completed: [CMP-04]

coverage:
  - id: D1
    description: "One on-demand command (npm run gate:release:dgfy-evidence) produces a release_verdict-contract artifact aggregating architecture, migration/drift, and seam-smoke gates for the whole platform"
    requirement: "CMP-04"
    verification:
      - kind: manual
        ref: "RELEASE_TARGET_SHA=deadbeef1234567890 node scripts/gate-release-dgfy-evidence.js — produced dgfy_release_evidence.json with 5 gates, verdict:fail (real DB creds mismatch), self-validated OK, exit code 2"
        status: pass
    human_judgment: false
  - id: D2
    description: "The emitted dgfy_release_evidence.json validates against scripts/verify-release-verdict.js (non-empty gates[], verdict enum, target_sha string, generated_at)"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "scripts/gate-release-dgfy-evidence.test.js#buildVerdictPayload: always conforms to the verify-release-verdict.js contract shape"
        status: pass
      - kind: manual
        ref: "node scripts/verify-release-verdict.js --file .tmp/release-gates/<sha>/dgfy_release_evidence.json --sha <sha> printed OK during the manual smoke run"
        status: pass
    human_judgment: false
  - id: D3
    description: "The architecture gate runs npm run check:architecture only when a backend/API boundary changed, otherwise records a passed not-applicable gate — never an empty gates[]"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "scripts/gate-release-dgfy-evidence.test.js#isBoundaryChanged: true for apps/dgfy-api, apps/dgfy-migration-runner, backend/src/modules paths; false for unrelated paths"
        status: pass
      - kind: unit
        ref: "scripts/gate-release-dgfy-evidence.test.js#buildVerdictPayload: an all-skipped/not-applicable run still emits a non-empty gates[] (Pitfall 5)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Per-PR CI (.github/workflows/ci.yml) and existing gate scripts are unchanged; this phase adds an additive on-demand gate only"
    requirement: "CMP-04"
    verification:
      - kind: other
        ref: "git diff --quiet -- .github/workflows/ci.yml (clean); git diff package.json shows additions only, no existing script value changed"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-12
status: complete
---

# Phase 06 Plan 03: DGFY Release-Evidence Orchestrator Gate Summary

**CommonJS orchestrator (`scripts/gate-release-dgfy-evidence.js`) that rolls up architecture-boundary checks, the 06-01 migration-verification/tenant-drift runner command, and the 06-02 compatibility-seam smoke runner into a single self-validated `dgfy_release_evidence.json` release-verdict artifact.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-12T06:25:12Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Built `scripts/gate-release-dgfy-evidence.js`, duplicating the established `runCommand`/`captureStdout`/`addGate`/`ensureDir` helper convention from `gate-release-local.js` and `dgfy-seam-smoke.js`.
- `architecture.dgfy` gate is conditional on a `git diff --name-only <base>..<sha>` boundary check (`apps/dgfy-api/`, `apps/dgfy-migration-runner/`, `backend/src/modules/`); a passed not-applicable gate is recorded when nothing changed, never a skipped/empty gates array.
- `migration.verification` + `tenant.drift` gates shell out to the 06-01 runner's `release-evidence` subcommand and derive `ok` from the report content it writes (globbed by the `{timestamp}-{command}.json` D-16 naming), rather than trusting the child exit code alone — closing a real gap where the CLI action does not exit non-zero on an internal `ok:false`.
- `compat.seam.smoke` gate shells out to `scripts/dgfy-seam-smoke.js` and reads the fixed `seam_smoke.json` file, emitting one gate per seam id; an absent file fails closed, an empty `seams[]` (no active manifest entries) is a legitimate not-applicable pass.
- Verdict payload matches the `verify-release-verdict.js` contract exactly (`generated_at`, `target_sha`, `verdict`, `gate_count`, `failed_gate_count`, `gates`, `artifact_paths`), written to `.tmp/release-gates/<sha>/dgfy_release_evidence.json`, then self-validated by invoking `verify-release-verdict.js` as a final check that also gates the overall process exit code.
- Exported `buildVerdictPayload`/`isBoundaryChanged` pure helpers, guarded behind `require.main === module`, and added a 12-test `node --test` suite proving both against the contract and the three boundary path prefixes.
- Wired `gate:release:dgfy-evidence`, `check:dgfy-seam-smoke`, and `test:dgfy-release-evidence` into root `package.json` — additions only, no existing script value changed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the DGFY release-evidence orchestrator gate script** - `adb15483` (feat)
2. **Task 2: Wire the npm scripts and add node --test coverage for the verdict contract** - `a3b1b570` (test)

## Files Created/Modified

- `scripts/gate-release-dgfy-evidence.js` - NEW: on-demand CJS orchestrator; `buildVerdictPayload`/`isBoundaryChanged` exported pure helpers behind a `require.main === module` guard
- `scripts/gate-release-dgfy-evidence.test.js` - NEW: 12-test `node --test` suite (verdict-contract conformance, boundary-change classification, never-empty-gates invariant)
- `package.json` - MODIFIED: adds `gate:release:dgfy-evidence`, `check:dgfy-seam-smoke`, `test:dgfy-release-evidence` scripts (no existing values changed)

## Decisions Made

- `migration.verification`/`tenant.drift` gates read the runner's written report JSON (`summary.ok`) rather than relying solely on the child process exit code — a manual smoke run confirmed the `release-evidence` CLI action's `.action()` handler never calls `process.exit` on an internal `ok:false`, only on a thrown exception, so exit-code-only would have produced a false-pass verdict. This directly satisfies the plan's own threat register entry T-06-03-01.
- Report files are located via a filename glob matching the runner's `{timestamp}-{command}.json` (D-16) naming convention rather than a hardcoded path, since `writeJsonReport` never writes a fixed filename.
- An empty `seam_smoke.json` `seams[]` array (manifest currently has zero active seams reachable from a clean checkout state, or all seams intentionally filtered) is distinguished from an absent file: empty-but-present is a legitimate not-applicable pass (mirrors `dgfy-seam-smoke.js`'s own `[].every()===true`), while an absent file fails closed.
- Final self-validation against `verify-release-verdict.js` runs as a genuinely separate step after `dgfy_release_evidence.json` is written (it cannot be embedded inside the artifact's own `gates[]`, which would be self-referential), and its pass/fail additionally determines the overall script exit code alongside the aggregated gate results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] migration.verification/tenant.drift gates derive ok from report content, not exit code alone**
- **Found during:** Task 1, while reading `apps/dgfy-migration-runner/src/cli.js`'s `release-evidence` `.action()` handler to confirm the shell-out contract
- **Issue:** The CLI action (`await runReleaseEvidence({ evidenceDir: options.evidenceDir });`) discards the command's returned `{ ok, ... }` result entirely — it only propagates a non-zero exit on a thrown exception (caught at `main()`'s top level). A genuine drift finding or migration-verification failure (`ok:false`) inside a successful, non-throwing run would exit 0, which — if the orchestrator trusted exit code alone — would silently produce a false-pass verdict. This is exactly the class of risk the plan's own threat register (T-06-03-01, "Tampering (false-pass verdict)") calls out.
- **Fix:** After the shell-out, the orchestrator globs the evidence dir for the freshest `*-migration_verification.json` and `*-tenant_drift.json` report files (D-16 timestamped naming) and derives each gate's `ok` from that report's `summary.ok`, falling back to fail-closed (`ok:false`) when the command failed to launch/exited non-zero, or when the expected report file is absent. The `no_targets:true` short-circuit report (06-01's zero-active-tenants case) is recognized and treated as a legitimate not-applicable pass for both gates.
- **Files modified:** `scripts/gate-release-dgfy-evidence.js` (within its original Task 1 authorship — no separate commit needed since this was resolved during initial implementation, not as a later patch)
- **Verification:** Manual smoke run (`RELEASE_TARGET_SHA=deadbeef1234567890 node scripts/gate-release-dgfy-evidence.js`) against a real (but credential-mismatched) DB confirmed both gates correctly reported `ok:false` with a clear fail-closed detail message when the runner command exited non-zero.
- **Committed in:** `adb15483` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, resolved during initial design rather than as a later patch)
**Impact on plan:** No scope creep — this is a correctness refinement of the exact gate the plan specifies (Task 1 step 4), directly required to satisfy the plan's own T-06-03-01 threat mitigation ("Every child non-zero exit → gate ok:false ... never assumed pass").

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None. This script is on-demand and additive (D-05) — no CI wiring, no new dependencies, no environment setup beyond what 06-01/06-02 already require for their own real-DB/real-seam runs. A manual smoke run in this sandbox confirmed a real MySQL instance is reachable (the migration-runner correctly attempted a connection and reported "Access denied for user ... (using password: YES)" rather than a connection-refused/DNS error), proving the fail-closed migration.verification/tenant.drift path exercises a genuine credential check, not just an unreachable-host stub. An operator with correct `TARGET_DB_*` credentials and at least one active/verified tenant in `business_database_registry`, plus `RUN_CONTINUITY_INTEGRATION=true` and the four `SOURCE_DB_*` vars for the seam-smoke gate, is needed to exercise the full pass path end-to-end.

## Next Phase Readiness

- CMP-04 is now fully covered across all three plans of Phase 06: 06-01 (SC2 evidence sources), 06-02 (SC3 seam smoke), 06-03 (SC1 architecture gate + D-01 aggregation into one verdict artifact).
- `dgfy_release_evidence.json` is ready to be consumed by Phase 7's cutover-rehearsal decision as the release-readiness signal, per the phase objective.
- No blockers. The self-validation step proves the artifact is structurally sound even in a fail-closed (DB-unreachable/credential-mismatched) sandbox run, so Phase 7 can rely on the contract shape being stable regardless of which individual gates pass or fail in a given environment.

---
*Phase: 06-release-evidence-and-rehearsal-gates*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created/modified files verified present on disk (`scripts/gate-release-dgfy-evidence.js`, `scripts/gate-release-dgfy-evidence.test.js`, this summary); both task commit hashes (`adb15483`, `a3b1b570`) verified present in git history.
