#!/usr/bin/env node
/**
 * check:app-versions flip-readiness gate -- #1569, epic #1548 Wave 2 ("Enforce"), ADR 0081
 * Decision 9.
 *
 * ADR 0081 Decision 9: the PR-time version-bump check (scripts/check-app-version-bump.js, shipped
 * advisory by #1560/PR #1562) "lands advisory first and flips to blocking only in a later,
 * dedicated phase, once enough clean-run evidence exists." This script MEASURES that evidence --
 * it never flips anything itself. The flip is a separate, later, human-confirmed edit to
 * scripts/lib/version-bump-gate-toggle.js's BLOCKING constant (see that file's own header).
 *
 * The evidence bar (ADR 0081 Decision 9 / #1548's own bar, restated in the
 * IMPLEMENTATION_PHASE_LEDGER.md Phase 276 entry) is met by EITHER:
 *   (a) >= 10 merged develop-base PRs, since #1560's merge commit, that ran check:app-versions
 *       (any mode -- "develop-base" always means mode "any-increase") with a pass/warn (not a
 *       script crash) recorded, OR
 *   (b) one full develop -> staging -> main promotion cycle (a to-staging/<id> -> staging leg and
 *       a release/<id>[-rN] -> main leg sharing the same candidate id) completing with the check
 *       green (an actual PASS, not merely "didn't crash") on both legs.
 *
 * "#1560's merge commit": #1560 is a tracking issue with no PR of its own (`gh pr view 1560`
 * 404s -- confirmed live). The PR that actually shipped check:app-versions advisory is #1562
 * ("ci(scripts): add check:app-versions per-app SemVer bump check, advisory"), whose own body says
 * "Refs #1560"; its merge commit into develop is ANCHOR_MERGE_SHA below. That is what #1569's own
 * issue body means by "#1560's merge commit".
 *
 * Why this reads job LOGS, not just check-run conclusions (a real constraint, not a design
 * preference): check:app-versions runs as one step inside the "changes / detect" job (the reusable
 * shared-changed-paths.yml workflow, called by pr-checks.yml's `changes:` job), with its own
 * step-level `continue-on-error: true`. Per promotion-quality-gate.yml's own #1066 finding (cited
 * in docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md too): a step-level continue-on-error makes BOTH the
 * job's own check-run conclusion AND the Actions Jobs API's `steps[].conclusion` report "success"
 * regardless of what the step actually did -- `steps[].conclusion` is the *post-override* value.
 * Only `steps.<id>.outcome` (the pre-override raw result) survives continue-on-error, and that
 * value only exists as a live expression-context value during the run itself -- nothing captures
 * it here today (unlike promotion-quality-gate.yml's quality jobs, which have a dedicated "Record
 * real per-step outcomes" step; shared-changed-paths.yml does not). Confirmed live against this
 * repo's own PR #1562 head commit (2026-09-04): its "changes / detect" check-run's `output.summary`
 * /`output.text` are both null and its one annotation is an unrelated Node-20-deprecation warning
 * -- neither the Checks API's structured output nor its annotations carry check:app-versions' own
 * verdict. What DOES carry it: the job's raw log, fetchable via `gh api
 * repos/:repo/actions/jobs/{id}/logs` (the check-run `id` returned by the commits/{sha}/check-runs
 * endpoint IS the Actions Jobs API job id for an Actions-created check -- confirmed live the same
 * way), which contains check-app-version-bump.js's own printCheckResult()/printFloorResult() lines
 * verbatim (`[check:app-versions] PASS. ...` / `[check:app-versions] FAIL. ...` / the two "skipped"
 * strings). Grepping those markers out of the log is therefore the only way to recover this
 * script's own signal from "GitHub's own check-run history via gh api" as #1569 requires, without
 * inventing a separate local counter file and without instrumenting check-app-version-bump.js
 * itself (out of this issue's scope) to emit `::notice::`/`::warning::` annotations instead.
 *
 * Deliberately Node, not bash -- mirrors scripts/ci-runner-preflight.js's runCapture/deps
 * dependency-injection shape (every real gh/git call sits behind a small, individually overridable
 * `deps.<fetchX>` function) so this file's own tests never touch the network, matching this repo's
 * pure/fast-test convention.
 *
 * CLI: `node scripts/check-version-bump-flip-readiness.js` -- exits 0 (ready), 1 (not ready), or 2
 * (could not measure -- a `gh pr list` call itself failed, e.g. an unsupported --json field, an
 * auth problem, or a rate limit; see pr-reviewer PR #1572 review RF-1). Exit 1 is informational
 * only: this script is not wired into any CI gate and never fails a build by itself. Exit 2 is
 * deliberately distinct from exit 1 -- a failed history query must never be silently read as "zero
 * evidence found" (that was RF-1's own bug: `captureJson()` swallowing a failed `gh pr list` into
 * `null`, which downstream code then defaulted to `[]` -- indistinguishable from a real, successful
 * "nothing merged yet" answer). A human runs this by hand (or via `npm run
 * check:version-bump-flip-readiness`) before deciding whether to flip
 * scripts/lib/version-bump-gate-toggle.js's BLOCKING constant.
 */

const { spawnSync } = require('node:child_process');

const REPO_SLUG = 'Sieitzz/dgfy-platform';

// PR #1562 ("ci(scripts): add check:app-versions per-app SemVer bump check, advisory"), merged
// into develop 2026-09-04T08:21:48Z. See this file's own header for why this, not #1560 itself,
// is the anchor.
const ANCHOR_MERGE_SHA = '5eb17c3426251990d364544e3ad5fbb1a839a35e';

// The check-run name GitHub assigns to a job called via `uses:` from a reusable workflow is
// "<caller job id> / <called job id>" -- pr-checks.yml's caller job is `changes:`, and
// shared-changed-paths.yml's own job is `detect:`. Confirmed live against PR #1562's head commit's
// check-runs (2026-09-04): exactly this string, `conclusion: "success"`.
const TARGET_CHECK_RUN_NAME = 'changes / detect';

const PR_EVIDENCE_THRESHOLD = 10;

// Generous headroom over PR_EVIDENCE_THRESHOLD -- `gh pr list` has no "merged after this commit"
// filter, so this script over-fetches and filters by ancestry (below) instead. Tunable via
// --limit; 50 is far more than 10 could ever need in one run without this script itself becoming
// due for a re-run.
const DEFAULT_FETCH_LIMIT = 50;

// Verbatim substrings from check-app-version-bump.js's own printCheckResult()/printFloorResult().
// If that file's message text changes, these must change with them -- this file's own test asserts
// each marker still appears verbatim in check-app-version-bump.js, the same anti-drift shape
// pr-checks.test.js already uses for shared-changed-paths.yml's PATH_FILTERS.
const MARKERS = Object.freeze({
    pass: '[check:app-versions] PASS.',
    warn: '[check:app-versions] FAIL.',
    skipNoBaseRef: '[check:app-versions] No base ref resolvable',
    skipNoAppChanged: '[check:app-versions] No changed-app version-bump requirements apply',
});

// --- low-level gh/git plumbing -------------------------------------------------------------------

function defaultRunCapture(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8', shell: false, maxBuffer: 1024 * 1024 * 64 });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function captureJson(command, args, runCapture) {
    const result = runCapture(command, args);
    if (result.status !== 0) return null;
    try {
        return JSON.parse(result.stdout);
    } catch {
        return null;
    }
}

// PR #1572 review RF-1: a failed `gh pr list` call (wrong field name, auth problem, rate limit)
// must never be read as "zero PRs merged" -- captureJson()'s null-on-failure is fine for a
// per-commit lookup (resolveCommitOutcome already treats "couldn't confirm" as a conservative
// "crash", by design), but at the *list* level it previously masked the entire mechanism silently
// reporting zero evidence forever, regardless of real history. GhPrListError makes that loud.
class GhPrListError extends Error {
    constructor(args, result) {
        super(`gh ${args.join(' ')} failed (exit ${result.status}): ${(result.stderr || result.stdout || '(no output)').trim()}`);
        this.name = 'GhPrListError';
    }
}

// `gh pr list --json` has no "mergeCommitOid" field (confirmed live -- it exits 1 with "Unknown
// JSON field", the exact RF-1 bug) -- the supported fields are `mergeCommit` (an object; `.oid` is
// the merge SHA) and `headRefOid` (the PR branch tip, which is what actually carries check-runs --
// see RF-2 / resolveCommitOutcome's own call sites below). This fetches and normalizes both into a
// flat shape the rest of this file already expects, and throws (via GhPrListError) rather than
// returning an empty array on any failure -- a caller must not be able to mistake "the query
// itself broke" for "the query succeeded and found nothing".
function fetchGhPrList(args, deps) {
    const result = deps.runCapture('gh', args);
    if (result.status !== 0) throw new GhPrListError(args, result);

    let parsed;
    try {
        parsed = JSON.parse(result.stdout);
    } catch (error) {
        throw new GhPrListError(args, { status: result.status, stdout: '', stderr: `unparseable JSON: ${error.message}` });
    }
    if (!Array.isArray(parsed)) throw new GhPrListError(args, { status: result.status, stdout: '', stderr: 'response was not a JSON array' });

    return parsed.map((pr) => ({
        number: pr.number,
        mergedAt: pr.mergedAt,
        headRefName: pr.headRefName,
        // Ancestry/dedup identity -- the actual commit that landed on the base branch.
        mergeCommitOid: pr.mergeCommit && pr.mergeCommit.oid ? pr.mergeCommit.oid : null,
        // What actually carries the PR-time "changes / detect" check run (RF-2) -- GitHub Actions'
        // pull_request trigger runs checks against the PR's head SHA, never the resulting merge
        // commit on the base branch. Confirmed live for PR #1562: head e61ec0e7 has 7 check runs
        // including "changes / detect"; merge commit 5eb17c34 has 0.
        headRefOid: pr.headRefOid || null,
    }));
}

// --- pure classification --------------------------------------------------------------------------

/**
 * Classifies one job log's text against check-app-version-bump.js's own printed markers. Pure --
 * no I/O -- so it's directly unit-testable against the exact strings fetched live from a real run.
 * "crash" covers everything else: an uncaught exception before printCheckResult()/printFloorResult()
 * ever runs, a missing check run, a truncated/unfetchable log -- anything that means this script
 * cannot confirm a clean pass/warn, which per #1569's own spec must NOT count toward the threshold.
 */
function classifyLogOutcome(logText) {
    const text = String(logText || '');
    if (text.includes(MARKERS.pass)) return 'pass';
    if (text.includes(MARKERS.warn)) return 'warn';
    if (text.includes(MARKERS.skipNoBaseRef) || text.includes(MARKERS.skipNoAppChanged)) return 'skip';
    return 'crash';
}

// "to-staging/<candidate_id>" (RELEASE_CANDIDATE_POLICY.md's naming convention).
function extractCandidateIdFromToStaging(branchName) {
    const match = /^to-staging\/(.+)$/.exec(String(branchName || ''));
    return match ? match[1] : null;
}

// "release/<candidate_id>-rN" or, for a #1007-expedited exception, "release/<label>" with no -rN
// suffix at all -- strip a trailing -rN if present, otherwise the whole label is the id.
function extractCandidateIdFromRelease(branchName) {
    const match = /^release\/(.+?)(?:-r\d+)?$/.exec(String(branchName || ''));
    return match ? match[1] : null;
}

// --- gh/git-backed lookups (each individually overridable via deps) --------------------------------

// Ancestry, not a timestamp comparison -- robust to clock skew and to a merge commit's own
// mergedAt not lining up exactly with topological order. Local git, not another gh api round trip:
// this repo's checkouts carry full history (fetch-depth: 0 in CI; an ordinary developer clone has
// it too), and an ancestry query is a stateless fact about the repo's own DAG, not a maintained
// counter that could drift the way #1569's own issue body warns against.
function isDescendantOfAnchor(sha, deps) {
    if (deps.isDescendantOfAnchor) return deps.isDescendantOfAnchor(sha);
    if (!sha || sha === ANCHOR_MERGE_SHA) return false;
    const result = deps.runCapture('git', ['merge-base', '--is-ancestor', ANCHOR_MERGE_SHA, sha]);
    return result.status === 0;
}

function fetchCheckRunsForCommit(sha, deps) {
    if (deps.fetchCheckRuns) return deps.fetchCheckRuns(sha);
    return captureJson('gh', ['api', `repos/${REPO_SLUG}/commits/${sha}/check-runs`], deps.runCapture);
}

function fetchJobLog(checkRunId, deps) {
    if (deps.fetchJobLog) return deps.fetchJobLog(checkRunId);
    // --allow-escape-sequences: gh api otherwise refuses to print raw Actions logs (they carry
    // ANSI color codes) -- confirmed live, "the response contains terminal escape sequences".
    const result = deps.runCapture('gh', ['api', '--allow-escape-sequences', `repos/${REPO_SLUG}/actions/jobs/${checkRunId}/logs`]);
    return result.status === 0 ? result.stdout : '';
}

/**
 * Resolves one commit's check:app-versions outcome. deps.fetchCommitOutcome, if supplied, bypasses
 * the check-runs+log-fetch machinery entirely -- the level tests inject at (see this file's own
 * test file) so a test fixture never needs to fabricate a realistic Checks API + raw-log payload.
 */
function resolveCommitOutcome(sha, deps) {
    if (deps.fetchCommitOutcome) return deps.fetchCommitOutcome(sha);

    const payload = fetchCheckRunsForCommit(sha, deps);
    const run = payload && Array.isArray(payload.check_runs)
        ? payload.check_runs.find((entry) => entry.name === TARGET_CHECK_RUN_NAME)
        : null;

    if (!run || run.status !== 'completed') {
        return {
            outcome: 'crash',
            detail: run
                ? `"${TARGET_CHECK_RUN_NAME}" check run for ${sha} is not completed (status=${run.status})`
                : `no "${TARGET_CHECK_RUN_NAME}" check run found for ${sha}`,
        };
    }

    const logText = fetchJobLog(run.id, deps);
    const outcome = classifyLogOutcome(logText);
    return { outcome, detail: `check run ${run.id} (${TARGET_CHECK_RUN_NAME}) for ${sha} classified as "${outcome}"` };
}

// `gh pr list --json` fields, corrected per RF-1: `mergeCommit` (object, `.oid` is the merge SHA),
// not the nonexistent `mergeCommitOid`; `headRefOid` added for RF-2 (see fetchGhPrList's own
// comment for why both are needed and what each is used for).
const PR_LIST_JSON_FIELDS = 'number,mergedAt,mergeCommit,headRefName,headRefOid';

function listDevelopMerges(deps, limit) {
    if (deps.fetchDevelopMerges) return deps.fetchDevelopMerges();
    return fetchGhPrList(
        ['pr', 'list', '--repo', REPO_SLUG, '--state', 'merged', '--base', 'develop', '--limit', String(limit), '--json', PR_LIST_JSON_FIELDS],
        deps,
    );
}

function listPromotionMerges(base, deps, limit) {
    if (deps.fetchPromotionMerges) return deps.fetchPromotionMerges(base);
    return fetchGhPrList(
        ['pr', 'list', '--repo', REPO_SLUG, '--state', 'merged', '--base', base, '--limit', String(limit), '--json', PR_LIST_JSON_FIELDS],
        deps,
    );
}

// --- evidence paths --------------------------------------------------------------------------------

/**
 * Path (a): >= 10 merged develop-base PRs since the anchor, each with a pass/warn (not crash)
 * check:app-versions outcome recorded. "develop-base" already implies mode "any-increase" (see
 * check-app-version-bump.js's resolveMode()) -- no separate mode filter is needed here.
 */
function evaluatePrCountEvidence(deps, { limit = DEFAULT_FETCH_LIMIT } = {}) {
    // Ancestry stays keyed on the merge commit -- that's the actual commit that landed on
    // develop, so it's the right identity for "is this since the anchor". RF-2: the check-run
    // lookup below deliberately uses headRefOid instead -- see resolveCommitOutcome's own call
    // site comment and fetchGhPrList's header for why the merge commit itself carries none.
    const sinceAnchor = listDevelopMerges(deps, limit)
        .filter((pr) => pr.mergeCommitOid && isDescendantOfAnchor(pr.mergeCommitOid, deps));

    const evaluated = sinceAnchor.map((pr) => ({ ...pr, ...resolveCommitOutcome(pr.headRefOid, deps) }));
    const counted = evaluated.filter((entry) => entry.outcome === 'pass' || entry.outcome === 'warn');

    return { evaluated, counted, count: counted.length, met: counted.length >= PR_EVIDENCE_THRESHOLD };
}

/**
 * Path (b): one to-staging/<id> -> staging leg and one release/<id>[-rN] -> main leg, same
 * candidate id, both since the anchor, both an actual PASS (not merely "ran without crashing") --
 * "green throughout" is a stricter bar than path (a)'s "pass/warn", deliberately: a promotion leg
 * that logged a version-bump FAIL is a real advisory finding on that leg, not a clean cycle.
 */
function evaluatePromotionCycleEvidence(deps, { limit = DEFAULT_FETCH_LIMIT } = {}) {
    // Same split as evaluatePrCountEvidence above: ancestry on the merge commit, check-run lookup
    // on headRefOid (RF-2).
    const stagingLegs = listPromotionMerges('staging', deps, limit)
        .filter((pr) => /^to-staging\//.test(pr.headRefName || '') && pr.mergeCommitOid && isDescendantOfAnchor(pr.mergeCommitOid, deps))
        .map((pr) => ({ ...pr, candidateId: extractCandidateIdFromToStaging(pr.headRefName), ...resolveCommitOutcome(pr.headRefOid, deps) }));

    const mainLegs = listPromotionMerges('main', deps, limit)
        .filter((pr) => /^release\//.test(pr.headRefName || '') && pr.mergeCommitOid && isDescendantOfAnchor(pr.mergeCommitOid, deps))
        .map((pr) => ({ ...pr, candidateId: extractCandidateIdFromRelease(pr.headRefName), ...resolveCommitOutcome(pr.headRefOid, deps) }));

    const completedCycles = [];
    for (const stagingLeg of stagingLegs) {
        if (stagingLeg.outcome !== 'pass' || !stagingLeg.candidateId) continue;
        const mainLeg = mainLegs.find((entry) => entry.candidateId === stagingLeg.candidateId && entry.outcome === 'pass');
        if (mainLeg) completedCycles.push({ candidateId: stagingLeg.candidateId, stagingLeg, mainLeg });
    }

    return { stagingLegs, mainLegs, completedCycles, met: completedCycles.length > 0 };
}

function evaluateReadiness(deps = {}, options = {}) {
    const resolvedDeps = { runCapture: defaultRunCapture, ...deps };
    const prCountEvidence = evaluatePrCountEvidence(resolvedDeps, options);
    const promotionEvidence = evaluatePromotionCycleEvidence(resolvedDeps, options);
    return { ready: prCountEvidence.met || promotionEvidence.met, prCountEvidence, promotionEvidence };
}

// --- CLI ---------------------------------------------------------------------------------------

function formatPrCountTable(prCountEvidence) {
    if (prCountEvidence.evaluated.length === 0) return '(no develop-base PRs found since the anchor commit)';
    const rows = prCountEvidence.evaluated.map((entry, index) => (
        `| ${index + 1} | #${entry.number} | ${String(entry.mergeCommitOid || '').slice(0, 7)} | ${entry.outcome} |`
    ));
    return ['| # | PR | SHA | Outcome |', '|---|----|-----|---------|', ...rows].join('\n');
}

function formatPromotionCycleSummary(promotionEvidence) {
    if (promotionEvidence.completedCycles.length > 0) {
        return promotionEvidence.completedCycles.map((cycle) => (
            `candidate "${cycle.candidateId}": to-staging PR #${cycle.stagingLeg.number} (PASS) -> release PR #${cycle.mainLeg.number} (PASS)`
        )).join('; ');
    }
    return 'none yet';
}

function main() {
    let result;
    try {
        result = evaluateReadiness();
    } catch (error) {
        // RF-1: a failed gh pr list call must be loud, never silently read as "zero evidence".
        // Exit 2, distinct from both 0 (ready) and 1 (not ready) -- this state means "could not
        // measure", not "measured and found nothing".
        console.error(`[check-version-bump-flip-readiness] COULD NOT MEASURE. ${error.message}`);
        process.exitCode = 2;
        return;
    }

    const { prCountEvidence, promotionEvidence } = result;

    console.log(`[check-version-bump-flip-readiness] ADR 0081 Decision 9 evidence threshold, since ${ANCHOR_MERGE_SHA.slice(0, 7)} (PR #1562, Refs #1560):`);
    console.log('');
    console.log(`PR-count evidence: ${prCountEvidence.count} of ${PR_EVIDENCE_THRESHOLD} qualifying develop-base PRs.`);
    console.log(formatPrCountTable(prCountEvidence));
    console.log('');
    console.log(`Promotion-cycle evidence: ${formatPromotionCycleSummary(promotionEvidence)}`);
    console.log('');

    if (result.ready) {
        console.log('[check-version-bump-flip-readiness] READY -- the ADR 0081 Decision 9 evidence threshold is met.');
        console.log('This script never flips anything itself. A human confirms this output, then flips');
        console.log('scripts/lib/version-bump-gate-toggle.js\'s BLOCKING constant to true in its own PR.');
        process.exitCode = 0;
    } else {
        console.log(`[check-version-bump-flip-readiness] NOT READY. ${prCountEvidence.count} of ${PR_EVIDENCE_THRESHOLD} PRs counted, promotion-cycle evidence: ${formatPromotionCycleSummary(promotionEvidence)}.`);
        // Exit 1 is informational only -- this script is not wired into any CI gate (see this
        // file's own header) and must never fail a build by itself.
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    REPO_SLUG,
    ANCHOR_MERGE_SHA,
    TARGET_CHECK_RUN_NAME,
    PR_EVIDENCE_THRESHOLD,
    PR_LIST_JSON_FIELDS,
    MARKERS,
    GhPrListError,
    fetchGhPrList,
    classifyLogOutcome,
    extractCandidateIdFromToStaging,
    extractCandidateIdFromRelease,
    isDescendantOfAnchor,
    resolveCommitOutcome,
    listDevelopMerges,
    listPromotionMerges,
    evaluatePrCountEvidence,
    evaluatePromotionCycleEvidence,
    evaluateReadiness,
    formatPrCountTable,
    formatPromotionCycleSummary,
};
