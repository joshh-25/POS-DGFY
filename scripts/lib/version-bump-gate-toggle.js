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
// Flip BLOCKING to true only after a human has run
// `node scripts/check-version-bump-flip-readiness.js` (or `npm run check:version-bump-flip-readiness`)
// and confirmed the ADR 0081 Decision 9 evidence threshold is met (10 qualifying develop-base PRs
// since #1560's merge commit -- PR #1562 -- or one full develop -> staging -> main promotion cycle
// green throughout). See docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md's "check:app-versions
// flip-readiness" entry and the dated 2026-09-04 Amendments entry on
// docs/ops/RELEASE_CANDIDATE_POLICY.md.
//
// Shipped `false` by #1569 -- do not flip this in the same PR that adds the readiness script, even
// if that script happens to report ready by the time this merges (as of #1569 being filed, #1560
// had only just merged with zero PRs having landed since -- it cannot possibly be ready yet). The
// flip is a separate, later, human-confirmed action, per #1569's own explicit "Explicitly out of
// scope" section.
const BLOCKING = false;

module.exports = { BLOCKING };
