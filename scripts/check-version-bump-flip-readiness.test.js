const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
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

// --- fetchGhPrList / listDevelopMerges / listPromotionMerges (RF-1: PR #1572 review) -----------
//
// RF-1: `gh pr list --json mergeCommitOid` is not a real field -- confirmed live, it exits 1 with
// "Unknown JSON field". The real fields are `mergeCommit` (an object; `.oid` is the merge SHA) and
// `headRefOid`. These tests cover the real response shape AND the failure path -- a failed query
// must throw (GhPrListError), never silently normalize to an empty array.

// Exact shape `gh pr list --json number,mergedAt,mergeCommit,headRefName,headRefOid` returns,
// fetched live 2026-09-04 (trimmed to one entry, PR #1562 itself) -- not fabricated.
const REAL_PR_LIST_ENTRY = {
    number: 1562,
    mergedAt: '2026-09-04T08:21:48Z',
    headRefName: 'pat/conduct-1560-checkscript',
    headRefOid: 'e61ec0e74f69cee7471b353948330cdd628c0644',
    mergeCommit: { oid: '5eb17c3426251990d364544e3ad5fbb1a839a35e' },
};

test('fetchGhPrList: normalizes the real gh pr list --json response shape (nested mergeCommit.oid, top-level headRefOid)', () => {
    const deps = { runCapture: () => ({ status: 0, stdout: JSON.stringify([REAL_PR_LIST_ENTRY]), stderr: '' }) };
    const result = fetchGhPrList(['pr', 'list'], deps);
    assert.deepEqual(result, [{
        number: 1562,
        mergedAt: '2026-09-04T08:21:48Z',
        headRefName: 'pat/conduct-1560-checkscript',
        mergeCommitOid: '5eb17c3426251990d364544e3ad5fbb1a839a35e',
        headRefOid: 'e61ec0e74f69cee7471b353948330cdd628c0644',
    }]);
});

test('fetchGhPrList: a non-zero gh exit (e.g. "Unknown JSON field") throws GhPrListError, never an empty array', () => {
    const deps = { runCapture: () => ({ status: 1, stdout: '', stderr: 'Unknown JSON field: "mergeCommitOid"\nAvailable fields:\n  ...' }) };
    assert.throws(() => fetchGhPrList(['pr', 'list', '--json', 'mergeCommitOid'], deps), GhPrListError);
    assert.throws(() => fetchGhPrList(['pr', 'list'], deps), /Unknown JSON field/);
});

test('fetchGhPrList: unparseable JSON throws GhPrListError', () => {
    const deps = { runCapture: () => ({ status: 0, stdout: 'not json', stderr: '' }) };
    assert.throws(() => fetchGhPrList(['pr', 'list'], deps), GhPrListError);
});

test('fetchGhPrList: a non-array JSON payload throws GhPrListError', () => {
    const deps = { runCapture: () => ({ status: 0, stdout: '{"not":"an array"}', stderr: '' }) };
    assert.throws(() => fetchGhPrList(['pr', 'list'], deps), GhPrListError);
});

test('listDevelopMerges: requests the real PR_LIST_JSON_FIELDS (mergeCommit + headRefOid, not mergeCommitOid)', () => {
    const calls = [];
    const deps = {
        runCapture: (cmd, args) => {
            calls.push([cmd, ...args]);
            return { status: 0, stdout: '[]', stderr: '' };
        },
    };
    listDevelopMerges(deps, 50);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes(PR_LIST_JSON_FIELDS));
    assert.ok(!PR_LIST_JSON_FIELDS.includes('mergeCommitOid'), 'PR_LIST_JSON_FIELDS must not request the nonexistent field RF-1 found');
    assert.ok(calls[0].includes('develop'));
    assert.ok(calls[0].includes(REPO_SLUG));
});

test('listDevelopMerges: a failed gh call propagates as a thrown error, never a silent empty list', () => {
    const deps = { runCapture: () => ({ status: 1, stdout: '', stderr: 'Unknown JSON field: "mergeCommitOid"' }) };
    assert.throws(() => listDevelopMerges(deps, 50), GhPrListError);
});

test('listPromotionMerges: requests the given base branch and the real JSON fields', () => {
    const calls = [];
    const deps = {
        runCapture: (cmd, args) => {
            calls.push([cmd, ...args]);
            return { status: 0, stdout: '[]', stderr: '' };
        },
    };
    listPromotionMerges('staging', deps, 50);
    assert.ok(calls[0].includes('staging'));
    assert.ok(calls[0].includes(PR_LIST_JSON_FIELDS));
});

test('listPromotionMerges: a failed gh call propagates as a thrown error, never a silent empty list', () => {
    const deps = { runCapture: () => ({ status: 1, stdout: '', stderr: 'rate limited' }) };
    assert.throws(() => listPromotionMerges('main', deps, 50), GhPrListError);
});

test('evaluatePrCountEvidence: a failed gh pr list query propagates -- RF-1\'s own failure mode, not silently read as zero evidence', () => {
    const deps = { runCapture: () => ({ status: 1, stdout: '', stderr: 'Unknown JSON field: "mergeCommitOid"' }) };
    assert.throws(() => evaluatePrCountEvidence(deps), GhPrListError);
});

test('evaluateReadiness: a failed gh pr list query propagates all the way up, not swallowed into "not ready"', () => {
    const deps = { runCapture: () => ({ status: 1, stdout: '', stderr: 'Unknown JSON field: "mergeCommitOid"' }) };
    assert.throws(() => evaluateReadiness(deps), GhPrListError);
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

// RF-2: mergeCommitOid and headRefOid are deliberately DIFFERENT values in every fixture below --
// the whole point is proving the ancestry filter still uses the merge SHA while the check-run
// lookup uses the head SHA, not that the two happen to collide the way a lazier fixture might hide.
function makeDevelopMerges(count) {
    return Array.from({ length: count }, (_, index) => ({
        number: 2000 + index,
        mergeCommitOid: `merge-sha-${index}`,
        headRefOid: `head-sha-${index}`,
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
        // head-sha-0 and head-sha-1 crashed (e.g. an uncaught exception in
        // check-app-version-bump.js) -- only 8 of the 10 fetched PRs actually recorded a pass/warn.
        fetchCommitOutcome: (sha) => ({ outcome: (sha === 'head-sha-0' || sha === 'head-sha-1') ? 'crash' : 'pass', detail: 'stub' }),
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
        fetchCommitOutcome: (sha) => ({ outcome: sha === 'head-sha-0' ? 'skip' : 'pass', detail: 'stub' }),
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
        // Ancestry is keyed on the merge SHA (merge-sha-0), not the head SHA -- RF-2.
        isDescendantOfAnchor: (sha) => sha !== 'merge-sha-0',
        fetchCommitOutcome: (sha) => {
            assert.notEqual(sha, 'head-sha-0', 'should never classify a PR that failed the ancestry filter');
            return { outcome: 'pass', detail: 'stub' };
        },
    };
    const result = evaluatePrCountEvidence(deps);
    assert.equal(result.evaluated.length, 9);
});

// RF-2's own explicit ask: prove the HEAD sha is what's passed to resolveCommitOutcome(), not the
// merge sha -- via a spy that records every sha it was actually called with, distinct fixture
// values for each (a fixture where the two accidentally matched would hide this exact bug).
test('evaluatePrCountEvidence: passes each PR\'s headRefOid (not mergeCommitOid) to the outcome resolver', () => {
    const seenShas = [];
    const deps = {
        fetchDevelopMerges: () => [
            { number: 42, mergeCommitOid: 'the-merge-commit-sha', headRefOid: 'the-head-ref-sha', headRefName: 'feature/x' },
        ],
        isDescendantOfAnchor: (sha) => {
            assert.equal(sha, 'the-merge-commit-sha', 'ancestry filter must use the merge SHA');
            return true;
        },
        fetchCommitOutcome: (sha) => {
            seenShas.push(sha);
            return { outcome: 'pass', detail: 'stub' };
        },
    };
    evaluatePrCountEvidence(deps);
    assert.deepEqual(seenShas, ['the-head-ref-sha']);
});

// --- evaluatePromotionCycleEvidence --------------------------------------------------------------

// RF-2: mergeCommitOid and headRefOid deliberately differ in every fixture below, same reasoning
// as makeDevelopMerges above.
function stagingLegFixture(overrides = {}) {
    return { number: 10, mergeCommitOid: 'staging-merge-sha', headRefOid: 'staging-head-sha', headRefName: 'to-staging/2026-09-10-01', ...overrides };
}
function mainLegFixture(overrides = {}) {
    return { number: 11, mergeCommitOid: 'main-merge-sha', headRefOid: 'main-head-sha', headRefName: 'release/2026-09-10-01-r1', ...overrides };
}

test('evaluatePromotionCycleEvidence: a matching to-staging + release pair, both PASS, is one completed cycle', () => {
    const deps = {
        fetchPromotionMerges: (base) => (base === 'staging' ? [stagingLegFixture()] : [mainLegFixture()]),
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
            ? [stagingLegFixture()]
            : [mainLegFixture({ headRefName: 'release/2026-09-11-02-r1' })]),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: () => ({ outcome: 'pass', detail: 'stub' }),
    };
    const result = evaluatePromotionCycleEvidence(deps);
    assert.equal(result.met, false);
    assert.equal(result.completedCycles.length, 0);
});

test('evaluatePromotionCycleEvidence: a staging leg that only warned (not a clean PASS) does not qualify', () => {
    const deps = {
        fetchPromotionMerges: (base) => (base === 'staging' ? [stagingLegFixture()] : [mainLegFixture()]),
        isDescendantOfAnchor: () => true,
        fetchCommitOutcome: (sha) => ({ outcome: sha === 'staging-head-sha' ? 'warn' : 'pass', detail: 'stub' }),
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

// RF-2's own explicit ask, applied to the promotion-cycle path too: prove the HEAD sha is what's
// passed to resolveCommitOutcome() for both legs, not the merge sha.
test('evaluatePromotionCycleEvidence: passes each leg\'s headRefOid (not mergeCommitOid) to the outcome resolver', () => {
    const seenShas = [];
    const deps = {
        fetchPromotionMerges: (base) => (base === 'staging' ? [stagingLegFixture()] : [mainLegFixture()]),
        isDescendantOfAnchor: (sha) => {
            assert.ok(sha === 'staging-merge-sha' || sha === 'main-merge-sha', `ancestry filter must use a merge SHA, got ${sha}`);
            return true;
        },
        fetchCommitOutcome: (sha) => {
            seenShas.push(sha);
            return { outcome: 'pass', detail: 'stub' };
        },
    };
    evaluatePromotionCycleEvidence(deps);
    assert.deepEqual(seenShas.sort(), ['main-head-sha', 'staging-head-sha']);
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
        fetchPromotionMerges: (base) => (base === 'staging' ? [stagingLegFixture()] : [mainLegFixture()]),
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
        fetchCommitOutcome: (sha) => ({ outcome: sha === 'head-sha-0' ? 'crash' : 'pass', detail: 'stub' }),
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
