const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    ANCHOR_MERGE_SHA,
    TARGET_CHECK_RUN_NAME,
    PR_EVIDENCE_THRESHOLD,
    MARKERS,
    classifyLogOutcome,
    extractCandidateIdFromToStaging,
    extractCandidateIdFromRelease,
    isDescendantOfAnchor,
    resolveCommitOutcome,
    evaluatePrCountEvidence,
    evaluatePromotionCycleEvidence,
    evaluateReadiness,
    formatPrCountTable,
    formatPromotionCycleSummary,
} = require('./check-version-bump-flip-readiness');

// Exact lines fetched live (2026-09-04) from `gh api --allow-escape-sequences
// repos/Sieitzz/dgfy-platform/actions/jobs/100929997500/logs` against PR #1562's own head commit --
// not fabricated, so classifyLogOutcome is proven against a real run's actual text shape.
const REAL_SKIP_LINE = '2026-09-04T06:12:23.2522191Z [check:app-versions] No changed-app version-bump requirements apply (no apps/* or fan-out package changes).';
const REAL_PASS_LINE = '2026-09-04T06:12:23.2522191Z [check:app-versions] PASS. All changed apps satisfy mode "any-increase".';
const REAL_WARN_LINE = '2026-09-04T06:12:23.2522191Z [check:app-versions] FAIL. One or more changed apps do not satisfy mode "any-increase".';

// --- classifyLogOutcome ----------------------------------------------------------------------

test('classifyLogOutcome: recognizes a real PASS log line', () => {
    assert.equal(classifyLogOutcome(`##[group]Run node scripts/check-app-version-bump.js\n${REAL_PASS_LINE}\n`), 'pass');
});

test('classifyLogOutcome: recognizes a real FAIL (advisory warn) log line', () => {
    assert.equal(classifyLogOutcome(REAL_WARN_LINE), 'warn');
});

test('classifyLogOutcome: recognizes both real skip log lines', () => {
    assert.equal(classifyLogOutcome(REAL_SKIP_LINE), 'skip');
    assert.equal(classifyLogOutcome('[check:app-versions] No base ref resolvable -- skipping (not a PR context).'), 'skip');
});

test('classifyLogOutcome: an uncaught exception (no PASS/FAIL/skip marker at all) is a crash, not a pass', () => {
    assert.equal(classifyLogOutcome('##[group]Run node scripts/check-app-version-bump.js\nTypeError: Cannot read properties of undefined\n    at Object.<anonymous>\n##[error]Process completed with exit code 1.'), 'crash');
});

test('classifyLogOutcome: empty/missing log is a crash', () => {
    assert.equal(classifyLogOutcome(''), 'crash');
    assert.equal(classifyLogOutcome(undefined), 'crash');
});

test('MARKERS stay verbatim in sync with check-app-version-bump.js', () => {
    const source = fs.readFileSync(path.join(__dirname, 'check-app-version-bump.js'), 'utf8');
    // check-app-version-bump.js builds these via template literals (`[check:app-versions] ${label}`,
    // etc.) rather than printing the exact PASS/FAIL sentence as one literal string -- assert each
    // marker's own fixed prefix/suffix fragments appear verbatim instead of the whole sentence.
    assert.match(source, /\[check:app-versions\] PASS\./);
    assert.match(source, /\[check:app-versions\] FAIL\./);
    assert.match(source, /No base ref resolvable/);
    assert.match(source, /No changed-app version-bump requirements apply/);
});

// --- candidate id extraction ------------------------------------------------------------------

test('extractCandidateIdFromToStaging', () => {
    assert.equal(extractCandidateIdFromToStaging('to-staging/2026-09-10-01'), '2026-09-10-01');
    assert.equal(extractCandidateIdFromToStaging('feature/unrelated'), null);
    assert.equal(extractCandidateIdFromToStaging(''), null);
});

test('extractCandidateIdFromRelease strips a trailing -rN', () => {
    assert.equal(extractCandidateIdFromRelease('release/2026-09-10-01-r1'), '2026-09-10-01');
    assert.equal(extractCandidateIdFromRelease('release/2026-09-10-01-r12'), '2026-09-10-01');
});

test('extractCandidateIdFromRelease keeps the whole label when there is no -rN suffix (#1007 exception shape)', () => {
    assert.equal(extractCandidateIdFromRelease('release/2026-09-10-hotfix'), '2026-09-10-hotfix');
    assert.equal(extractCandidateIdFromRelease('hotfix/unrelated'), null);
});

// --- isDescendantOfAnchor ---------------------------------------------------------------------

test('isDescendantOfAnchor: the anchor itself is never its own descendant', () => {
    const deps = { runCapture: () => assert.fail('should not shell out for the anchor SHA itself') };
    assert.equal(isDescendantOfAnchor(ANCHOR_MERGE_SHA, deps), false);
});

test('isDescendantOfAnchor: falls back to `git merge-base --is-ancestor` via runCapture', () => {
    const calls = [];
    const deps = {
        runCapture: (cmd, args) => {
            calls.push([cmd, ...args]);
            return { status: 0, stdout: '', stderr: '' };
        },
    };
    assert.equal(isDescendantOfAnchor('deadbeef', deps), true);
    assert.deepEqual(calls, [['git', 'merge-base', '--is-ancestor', ANCHOR_MERGE_SHA, 'deadbeef']]);
});

test('isDescendantOfAnchor: a non-ancestor SHA (git exits non-zero) is false', () => {
    const deps = { runCapture: () => ({ status: 1, stdout: '', stderr: '' }) };
    assert.equal(isDescendantOfAnchor('notadescendant', deps), false);
});

test('isDescendantOfAnchor: deps.isDescendantOfAnchor override bypasses git entirely', () => {
    const deps = {
        runCapture: () => assert.fail('should not shell out when an override is supplied'),
        isDescendantOfAnchor: (sha) => sha === 'aaa',
    };
    assert.equal(isDescendantOfAnchor('aaa', deps), true);
    assert.equal(isDescendantOfAnchor('bbb', deps), false);
});

// --- resolveCommitOutcome (check-runs + job-log wiring, without a network call) ----------------

test('resolveCommitOutcome: finds the target check run and classifies its fetched log', () => {
    const deps = {
        fetchCheckRuns: (sha) => {
            assert.equal(sha, 'sha1');
            return { check_runs: [{ id: 42, name: TARGET_CHECK_RUN_NAME, status: 'completed' }] };
        },
        fetchJobLog: (id) => {
            assert.equal(id, 42);
            return REAL_PASS_LINE;
        },
    };
    const result = resolveCommitOutcome('sha1', deps);
    assert.equal(result.outcome, 'pass');
});

test('resolveCommitOutcome: no matching check run is a crash', () => {
    const deps = {
        fetchCheckRuns: () => ({ check_runs: [{ id: 1, name: 'some-other-job / build', status: 'completed' }] }),
        fetchJobLog: () => assert.fail('should not fetch a log with no matching check run'),
    };
    assert.equal(resolveCommitOutcome('sha2', deps).outcome, 'crash');
});

test('resolveCommitOutcome: a check run that never completed (still queued/in_progress) is a crash', () => {
    const deps = {
        fetchCheckRuns: () => ({ check_runs: [{ id: 7, name: TARGET_CHECK_RUN_NAME, status: 'in_progress' }] }),
        fetchJobLog: () => assert.fail('should not fetch a log for an incomplete check run'),
    };
    assert.equal(resolveCommitOutcome('sha3', deps).outcome, 'crash');
});

test('resolveCommitOutcome: deps.fetchCommitOutcome overrides the check-runs/log machinery entirely', () => {
    const deps = { fetchCommitOutcome: (sha) => ({ outcome: sha === 'x' ? 'pass' : 'crash', detail: 'stub' }) };
    assert.equal(resolveCommitOutcome('x', deps).outcome, 'pass');
});

// --- evaluatePrCountEvidence --------------------------------------------------------------------

function makeDevelopMerges(count, { crashIndexes = [] } = {}) {
    return Array.from({ length: count }, (_, index) => ({
        number: 2000 + index,
        mergeCommitOid: `sha-${index}`,
        headRefName: `feature/x-${index}`,
    }));
}

test('evaluatePrCountEvidence: threshold met at exactly 10 qualifying (pass/warn) PRs', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(PR_EVIDENCE_THRESHOLD),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: (sha) => ({ outcome: sha.endsWith('-3') ? 'warn' : 'pass', detail: 'stub' }),
    };
    const result = evaluatePrCountEvidence(deps);
    assert.equal(result.count, PR_EVIDENCE_THRESHOLD);
    assert.equal(result.met, true);
});

test('evaluatePrCountEvidence: fewer than 10 qualifying PRs is not met', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(3),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => ({ outcome: 'pass', detail: 'stub' }),
    };
    const result = evaluatePrCountEvidence(deps);
    assert.equal(result.count, 3);
    assert.equal(result.met, false);
});

test('evaluatePrCountEvidence: a crashed check run does not count toward the 10', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(10),
        isDescendantOfAnchor: () => true,
        // sha-0 and sha-1 crashed (e.g. an uncaught exception in check-app-version-bump.js) --
        // only 8 of the 10 fetched PRs actually recorded a pass/warn.
        fetchCommitOutcome: (sha) => ({ outcome: (sha === 'sha-0' || sha === 'sha-1') ? 'crash' : 'pass', detail: 'stub' }),
    };
    const result = evaluatePrCountEvidence(deps);
    assert.equal(result.count, 8);
    assert.equal(result.met, false);
    assert.equal(result.evaluated.length, 10, 'every fetched PR is still reported, crashed ones included');
});

test('evaluatePrCountEvidence: a skipped (no apps/* touched) run neither counts nor crashes', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(10),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: (sha) => ({ outcome: sha === 'sha-0' ? 'skip' : 'pass', detail: 'stub' }),
    };
    const result = evaluatePrCountEvidence(deps);
    assert.equal(result.count, 9);
    assert.equal(result.met, false);
});

test('evaluatePrCountEvidence: PRs at or before the anchor are excluded entirely', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(10),
        isDescendantOfAnchor: () => false,
        fetchCommitOutcome: () => assert.fail('should never classify a PR that failed the ancestry filter'),
    };
    const result = evaluatePrCountEvidence(deps);
    assert.equal(result.evaluated.length, 0);
});

test('evaluatePrCountEvidence: only PRs past the anchor are classified, the rest excluded', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(10),
        isDescendantOfAnchor: (sha) => sha !== 'sha-0',
        fetchCommitOutcome: (sha) => {
            assert.notEqual(sha, 'sha-0', 'should never classify a PR that failed the ancestry filter');
            return { outcome: 'pass', detail: 'stub' };
        },
    };
    const result = evaluatePrCountEvidence(deps);
    assert.equal(result.evaluated.length, 9);
});

// --- evaluatePromotionCycleEvidence --------------------------------------------------------------

test('evaluatePromotionCycleEvidence: a matching to-staging + release pair, both PASS, is one completed cycle', () => {
    const deps = {
        fetchPromotionMerges: (base) => (base === 'staging'
            ? [{ number: 10, mergeCommitOid: 'staging-sha', headRefName: 'to-staging/2026-09-10-01' }]
            : [{ number: 11, mergeCommitOid: 'main-sha', headRefName: 'release/2026-09-10-01-r1' }]),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => ({ outcome: 'pass', detail: 'stub' }),
    };
    const result = evaluatePromotionCycleEvidence(deps);
    assert.equal(result.met, true);
    assert.equal(result.completedCycles.length, 1);
    assert.equal(result.completedCycles[0].candidateId, '2026-09-10-01');
});

test('evaluatePromotionCycleEvidence: mismatched candidate ids do not form a cycle', () => {
    const deps = {
        fetchPromotionMerges: (base) => (base === 'staging'
            ? [{ number: 10, mergeCommitOid: 'staging-sha', headRefName: 'to-staging/2026-09-10-01' }]
            : [{ number: 11, mergeCommitOid: 'main-sha', headRefName: 'release/2026-09-11-02-r1' }]),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => ({ outcome: 'pass', detail: 'stub' }),
    };
    const result = evaluatePromotionCycleEvidence(deps);
    assert.equal(result.met, false);
    assert.equal(result.completedCycles.length, 0);
});

test('evaluatePromotionCycleEvidence: a staging leg that only warned (not a clean PASS) does not qualify', () => {
    const deps = {
        fetchPromotionMerges: (base) => (base === 'staging'
            ? [{ number: 10, mergeCommitOid: 'staging-sha', headRefName: 'to-staging/2026-09-10-01' }]
            : [{ number: 11, mergeCommitOid: 'main-sha', headRefName: 'release/2026-09-10-01-r1' }]),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: (sha) => ({ outcome: sha === 'staging-sha' ? 'warn' : 'pass', detail: 'stub' }),
    };
    const result = evaluatePromotionCycleEvidence(deps);
    assert.equal(result.met, false);
});

test('evaluatePromotionCycleEvidence: no promotion legs at all is not met', () => {
    const deps = {
        fetchPromotionMerges: () => [],
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => assert.fail('nothing to classify'),
    };
    const result = evaluatePromotionCycleEvidence(deps);
    assert.equal(result.met, false);
    assert.equal(result.completedCycles.length, 0);
});

// --- evaluateReadiness (the four cases #1569 asks this file's tests to cover) -------------------

test('evaluateReadiness: threshold met via PR count alone', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(PR_EVIDENCE_THRESHOLD),
        fetchPromotionMerges: () => [],
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => ({ outcome: 'pass', detail: 'stub' }),
    };
    const result = evaluateReadiness(deps);
    assert.equal(result.ready, true);
    assert.equal(result.prCountEvidence.met, true);
    assert.equal(result.promotionEvidence.met, false);
});

test('evaluateReadiness: threshold met via one promotion cycle alone', () => {
    const deps = {
        fetchDevelopMerges: () => [],
        fetchPromotionMerges: (base) => (base === 'staging'
            ? [{ number: 10, mergeCommitOid: 'staging-sha', headRefName: 'to-staging/2026-09-10-01' }]
            : [{ number: 11, mergeCommitOid: 'main-sha', headRefName: 'release/2026-09-10-01-r1' }]),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => ({ outcome: 'pass', detail: 'stub' }),
    };
    const result = evaluateReadiness(deps);
    assert.equal(result.ready, true);
    assert.equal(result.prCountEvidence.met, false);
    assert.equal(result.promotionEvidence.met, true);
});

test('evaluateReadiness: not met via either path', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(2),
        fetchPromotionMerges: () => [],
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => ({ outcome: 'pass', detail: 'stub' }),
    };
    const result = evaluateReadiness(deps);
    assert.equal(result.ready, false);
});

test('evaluateReadiness: exactly the #1569 "live dry run" shape -- zero PRs and zero promotions since the anchor is not ready', () => {
    // Mirrors reality as of #1569 being filed: #1560 had only just merged, nothing since.
    const deps = {
        fetchDevelopMerges: () => [],
        fetchPromotionMerges: () => [],
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => assert.fail('nothing to classify with zero merges'),
    };
    const result = evaluateReadiness(deps);
    assert.equal(result.ready, false);
    assert.equal(result.prCountEvidence.count, 0);
    assert.equal(result.promotionEvidence.completedCycles.length, 0);
});

test('evaluateReadiness: a crashed check-run keeps an otherwise-10-PR batch from reading ready', () => {
    const deps = {
        fetchDevelopMerges: () => makeDevelopMerges(10),
        fetchPromotionMerges: () => [],
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: (sha) => ({ outcome: sha === 'sha-0' ? 'crash' : 'pass', detail: 'stub' }),
    };
    const result = evaluateReadiness(deps);
    assert.equal(result.ready, false);
    assert.equal(result.prCountEvidence.count, 9);
});

// --- formatting smoke tests -----------------------------------------------------------------

test('formatPrCountTable: renders a row per evaluated PR and a placeholder when empty', () => {
    assert.match(formatPrCountTable({ evaluated: [] }), /no develop-base PRs found/);
    const table = formatPrCountTable({ evaluated: [{ number: 5, mergeCommitOid: 'abcdefabcdef', outcome: 'pass' }] });
    assert.match(table, /#5/);
    assert.match(table, /abcdefa/);
    assert.match(table, /pass/);
});

test('formatPromotionCycleSummary: "none yet" when empty, names the candidate when a cycle completed', () => {
    assert.equal(formatPromotionCycleSummary({ completedCycles: [] }), 'none yet');
    const summary = formatPromotionCycleSummary({
        completedCycles: [{ candidateId: '2026-09-10-01', stagingLeg: { number: 10 }, mainLeg: { number: 11 } }],
    });
    assert.match(summary, /2026-09-10-01/);
    assert.match(summary, /#10/);
    assert.match(summary, /#11/);
});
