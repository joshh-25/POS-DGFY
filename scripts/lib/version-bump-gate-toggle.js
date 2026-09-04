// #1569 (epic #1548 Wave 2, ADR 0081 Decision 9): the single declared source of truth for whether
// check:app-versions (scripts/check-app-version-bump.js) blocks a PR or stays advisory-only.
//
// Both consuming surfaces derive BLOCKING from here directly -- there is nothing else to edit and
// nothing to keep in sync by hand:
//   - .github/workflows/shared-changed-paths.yml's "Load check:app-versions gate toggle" step reads
//     this module (via `node -e "require(...)"`) and exposes it as a step output that the "Enforce
//     per-app version bump on source changes" step's own `continue-on-error:` expression reads.
//   - scripts/pr-checks.js requires this module directly for the same check's `blocking` argument
//     to addCheck().
//
// This is a genuine runtime read, not scripts/lib/runner-routing-state.js's declared-constant-plus-
// checker pattern (that file's own header explains why it needs a second, cross-checking script:
// a workflow's `runs-on:` site can't be computed from a JS module at parse time, so that toggle is
// two hand-edited surfaces kept in sync by a validator instead of one surface read at runtime). A
// step's `continue-on-error:` CAN take a `${{ }}` runtime expression, so there's no equivalent
// constraint here -- one module, read directly, nothing to drift.
//
// Flipped to true only after a human ran
// `node scripts/check-version-bump-flip-readiness.js` (or `npm run check:version-bump-flip-readiness`)
// and confirmed the ADR 0081 Decision 9 evidence threshold was met. See
// docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md's "check:app-versions flip-readiness" entry and the
// dated 2026-09-05 Amendments entry on docs/ops/RELEASE_CANDIDATE_POLICY.md for the re-confirmed,
// live-at-implementation-time evidence.
//
// Shipped `false` by #1569 (do not flip in the same PR that adds the readiness script -- that
// issue's own "Explicitly out of scope" section; #1569 itself could not possibly have been ready,
// having zero develop-base PRs landed since the anchor at filing time). Flipped `true` by #1592
// (epic #1548, Phase 283) once the PR-count evidence path reported 10 of 10 qualifying
// develop-base PRs, re-confirmed live at PR-open time rather than reusing #1592's own filing-time
// snapshot.
//
// #1592 also found and fixed a latent bug this header's "nothing else to edit" claim above did not
// anticipate: scripts/pr-checks.js's own addCheck() call for this check hardcoded its `result` to
// `'pass'`/`'warn'` regardless of the `blocking` argument, so flipping BLOCKING alone never actually
// produced a `'fail'` result there -- computeOverallResult() only escalates to FAIL on
// `blocking && result === 'fail'`, and a `'warn'` can only ever degrade PASS to PARTIAL, never FAIL.
// scripts/pr-checks.js now derives the result severity from the same BLOCKING toggle too (see
// resolveAppVersionsCheckResult() there) -- confirmed live before this flip shipped, not assumed.
// The `.github/workflows/shared-changed-paths.yml` surface had no equivalent bug: its
// `continue-on-error:` expression already read the toggle output directly as a boolean, with no
// intermediate severity string to get out of sync.
const BLOCKING = true;

module.exports = { BLOCKING };
