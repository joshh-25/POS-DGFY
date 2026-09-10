// #1569 (epic #1548 Wave 2, ADR 0081 Decision 9): the single declared source of truth for whether
// check:app-versions (scripts/check-app-version-bump.js) blocks a PR or stays advisory-only.
//
// Both consuming surfaces derive `resolveBlocking(base, head)` from here directly -- there is
// nothing else to edit and nothing to keep in sync by hand:
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
// having zero develop-base PRs landed since the anchor at filing time). Flipped `true` **globally**
// by #1592 (epic #1548, Phase 283) once the PR-count evidence path reported 10 of 10 qualifying
// develop-base PRs, re-confirmed live at PR-open time rather than reusing #1592's own filing-time
// snapshot.
//
// #1592 also found and fixed a latent bug this header's "nothing else to edit" claim above did not
// anticipate: scripts/pr-checks.js's own addCheck() call for this check hardcoded its `result` to
// `'pass'`/`'warn'` regardless of the `blocking` argument, so flipping BLOCKING alone never actually
// produced a `'fail'` result there -- computeOverallResult() only escalates to FAIL on
// `blocking && result === 'fail'`, and a `'warn'` can only ever degrade PASS to PARTIAL, never FAIL.
// scripts/pr-checks.js now derives the result severity from the same toggle too (see
// resolveAppVersionsCheckResult() there) -- confirmed live before this flip shipped, not assumed.
// The `.github/workflows/shared-changed-paths.yml` surface had no equivalent bug: its
// `continue-on-error:` expression already read the toggle output directly as a boolean, with no
// intermediate severity string to get out of sync.
//
// #1774 (epic #1548, 2026-09-10): #1592's global flip was itself a bug, not a full fix. Pat's call
// (quoted in #1774): a `develop`-base PR should not be blocked on this check -- `develop -> staging`'s
// own minor-floor bump requirement (ADR 0081 Decision 6) supersedes whatever an individual `develop`
// PR did or didn't bump, so blocking it there enforces a requirement that becomes irrelevant at
// promotion time while needlessly blocking contributors (PR #1773 hit exactly this: three apps
// unbumped on a develop-base PR, blocked from merging). Decision 6's own mode table already treats
// `develop` as the least-restrictive tier ("non-blocking by design") -- Decision 9's blocking flag
// never carried that same base split forward, which is the bug this reverts, base-aware rather than
// wholesale.
//
// Both consumers now call `resolveBlocking(base, head)` instead of reading the flat `BLOCKING`
// constant directly. `BLOCKING` itself stays exported as a single global kill switch -- flipping it
// to `false` still forces every base advisory in one edit, same emergency-off shape #1569 designed --
// but the per-base decision now lives in `resolveBlocking()`.
//
// Deliberately NOT derived from scripts/check-app-version-bump.js's resolveMode(base, head): a
// `release/*` head into `main` resolves to mode `'any-increase'` -- the *same* mode value `develop`
// gets -- so `resolveMode(...) !== 'any-increase'` reads `false` (advisory) for exactly the case
// #1774 requires to stay blocking. Using that proxy would silently un-block the release-to-main leg
// while trying to fix a different leg. Separately, importing `resolveMode` would mean requiring
// check-app-version-bump.js here, which transitively requires the root devDependency `madge` (see
// that script's own header, and #1695/PR #1708) -- shared-changed-paths.yml's toggle-load step
// deliberately runs *before* its later "Install root dependencies" step specifically to stay
// dependency-free (see that workflow's own step comments); importing that module here would break
// that property.
//
// The actual rule #1774 needs doesn't require head-pattern classification at all -- every listed
// blocking case (`to-staging/* -> staging`, `fix/staging/* -> staging`, `release/* -> main`, a
// `main` hotfix) reduces to "base is `staging` or `main`." No regex is needed for the *blocking*
// decision (only for the *level* decision, Decision 6's mode table, which this change does not
// touch). This avoids both the false-advisory bug above and the cross-import/`madge` hazard.
const BLOCKING = true;

const BLOCKING_BASE_BRANCHES = Object.freeze(['staging', 'main']);

// headBranchName is accepted only for interface symmetry with check-app-version-bump.js's own
// resolveMode(base, head) -- it does not affect the result. Every real promotion head shape this
// repo uses into staging/main (to-staging/*, fix/staging/*, release/*, or a bare hotfix branch) must
// stay blocking regardless of head; there is no legitimate staging/main-base PR that should fall
// back to advisory. So this collapses to "blocking iff BLOCKING is on and base is not develop" (an
// unrecognized base defaults to advisory, matching resolveMode()'s own least-restrictive-default
// philosophy for an unrecognized base).
function resolveBlocking(baseBranchName, _headBranchName) {
    const base = String(baseBranchName || '').trim();
    return BLOCKING && BLOCKING_BASE_BRANCHES.includes(base);
}

module.exports = { BLOCKING, resolveBlocking };
