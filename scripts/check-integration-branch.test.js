'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  classifyPr,
  checkIntegrationBranch,
  checkDevSoak,
  definitionOfDoneState,
  exitCodeForResult,
  mergeHygieneArgs,
  parseArgs,
} = require('./check-integration-branch');

const BRANCH = 'epic/2634-delivery-flow';
const DEV_RUN_URL = 'https://github.com/Sieitzz/dgfy-platform/actions/runs/123456';
const ISSUE_BODY = '## Definition of done\n- [x] Child work is integrated\n- [x] Verification is recorded\n';
const PR_BODY = `## DEV soak evidence\nDEV soak from deploy.yml: [successful run](${DEV_RUN_URL})\n`;

function epicIssue(overrides = {}) {
  return {
    state: 'open',
    labels: [{ name: 'epic' }],
    comments: [{ body: `Reserved branch recorded.\nIntegration branch: ${BRANCH}\n` }],
    body: ISSUE_BODY,
    ...overrides,
  };
}

function lookups(overrides = {}) {
  return {
    getIssue: () => epicIssue(),
    getStalenessDays: () => 0,
    getBehindBy: () => 0,
    getWorkflowRun: () => ({
      path: '.github/workflows/deploy.yml',
      conclusion: 'success',
      event: 'workflow_dispatch',
      headSha: 'soak-sha',
    }),
    isAncestor: () => true,
    getFirstParentCommitsAfter: () => [],
    checkMergeHygiene: () => true,
    getOpenPullRequestsForBase: () => [],
    ...overrides,
  };
}

function classify(base, head, overrides = {}, extra = {}) {
  return classifyPr({ base, head, isDraft: false, lookups: lookups(overrides), ...extra });
}

function findingCodes(result) {
  return result.findings.map((finding) => finding.code);
}

test('merge hygiene forwards a registered branch justification when present', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-branch-hygiene-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const directory = path.join(repoRoot, 'docs', 'release', 'merge-hygiene');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'epic-2696.json'), '{}');

  assert.deepEqual(
    mergeHygieneArgs('epic/2696-admin-tenant-management-ux', 'head-sha', { repoRoot }),
    ['run', 'check:merge-hygiene', '--', '--base', 'origin/develop', '--head', 'head-sha', '--justification', 'docs/release/merge-hygiene/epic-2696.json'],
  );
  assert.deepEqual(
    mergeHygieneArgs(BRANCH, 'head-sha', { repoRoot }),
    ['run', 'check:merge-hygiene', '--', '--base', 'origin/develop', '--head', 'head-sha'],
  );
});

test('ordinary PRs remain ordinary and registered ordinary child PRs target reserved bases', () => {
  const ordinary = classify('develop', 'feat/2737-policy');
  assert.equal(ordinary.kind, 'ordinary');
  assert.deepEqual(ordinary.findings, []);

  const child = classify(BRANCH, 'fix/2737-small-correction');
  assert.equal(child.kind, 'child');
  assert.deepEqual(child.findings, []);
});

test('registered child branches warn when the reserved base is more than 14 days behind develop', () => {
  const child = classify(BRANCH, 'fix/2737-small-correction', { getStalenessDays: () => 15.8 });
  assert.equal(child.kind, 'child');
  assert.deepEqual(findingCodes(child), ['integration-branch-stale']);
  assert.equal(child.findings[0].severity, 'warning');
});

test('a reserved base must match the name pattern and be bound to an open epic marker', () => {
  const malformed = classify('feature/not-a-registered-name', 'fix/2737-correction');
  assert.equal(malformed.kind, 'blocked');
  assert.deepEqual(findingCodes(malformed), ['malformed-reserved-name']);

  const closed = classify(BRANCH, 'fix/2737-correction', { getIssue: () => epicIssue({ state: 'closed' }) });
  assert.deepEqual(findingCodes(closed), ['epic-not-open']);

  const notEpic = classify(BRANCH, 'fix/2737-correction', { getIssue: () => epicIssue({ labels: [{ name: 'area:infra' }] }) });
  assert.deepEqual(findingCodes(notEpic), ['issue-not-epic']);

  const noMarker = classify(BRANCH, 'fix/2737-correction', { getIssue: () => epicIssue({ comments: [] }) });
  assert.deepEqual(findingCodes(noMarker), ['registration-marker-missing']);

  const noIssue = classify(BRANCH, 'fix/2737-correction', { getIssue: () => null });
  assert.deepEqual(findingCodes(noIssue), ['epic-lookup-failed']);
});

test('reserved final heads into develop require registration; nesting is blocked', () => {
  const final = classify('develop', BRANCH);
  assert.equal(final.kind, 'final');
  assert.deepEqual(final.findings, []);
  assert.equal(final.autoMergeAllowed, false, 'first integration merge is not recorded');

  const unregistered = classify('develop', 'feature/2634-delivery-flow', { getIssue: () => epicIssue({ comments: [] }) });
  assert.equal(unregistered.kind, 'blocked');
  assert.deepEqual(findingCodes(unregistered), ['registration-marker-missing']);

  const malformed = classify('develop', 'epic/not-a-branch');
  assert.deepEqual(findingCodes(malformed), ['malformed-reserved-name']);

  const nested = classify(BRANCH, 'feature/2737-policy');
  assert.equal(nested.kind, 'blocked');
  assert.deepEqual(findingCodes(nested), ['nested-integration-branch']);

  assert.equal(classify('staging', BRANCH).kind, 'ordinary');
});

test('non-draft final PRs require behind_by zero; drafts defer that check', () => {
  const behind = classify('develop', BRANCH, { getBehindBy: () => 2 });
  assert.deepEqual(findingCodes(behind), ['final-branch-behind-develop']);
  assert.equal(behind.findings[0].severity, 'warning', 'the reservation check is advisory during rollout');
  assert.equal(exitCodeForResult(behind), 0);
  assert.equal(exitCodeForResult(behind, true), 1);

  const unavailable = classify('develop', BRANCH, { getBehindBy: () => null });
  assert.deepEqual(findingCodes(unavailable), ['final-behind-by-unavailable']);
  assert.equal(unavailable.findings[0].severity, 'warning');

  let checked = false;
  const draft = classifyPr({
    base: 'develop', head: BRANCH, isDraft: true,
    lookups: lookups({ getBehindBy: () => { checked = true; return 2; } }),
  });
  assert.equal(checked, false);
  assert.deepEqual(draft.findings, []);
  assert.equal(draft.autoMergeAllowed, false);
});

test('definition-of-done parser requires at least one checklist item and all items checked', () => {
  assert.equal(definitionOfDoneState('## Definition of done\nSome prose only.'), 'missing');
  assert.equal(definitionOfDoneState('## Definition of done\n- [x] First\n- [ ] Second\n'), 'incomplete');
  assert.equal(definitionOfDoneState('## Definition of done\n- [x] First\n- [X] Second\n'), 'complete');
  assert.equal(definitionOfDoneState('## Other\n- [x] Not the DoD\n'), 'missing');
});

function readinessResult(overrides = {}) {
  return checkIntegrationBranch({
    base: 'develop',
    head: BRANCH,
    isDraft: false,
    readiness: true,
    headSha: 'final-head',
    prBody: PR_BODY,
    lookups: lookups({
      getIssue: () => epicIssue(),
      isAncestor: () => true,
      getFirstParentCommitsAfter: () => [],
      ...overrides,
    }),
  });
}

test('final readiness passes when the branch is current, DoD is done, DEV soak is valid, hygiene is clean, and no child PR remains', () => {
  const result = readinessResult();
  assert.equal(result.kind, 'final');
  assert.deepEqual(result.findings, []);
  assert.equal(result.autoMergeAllowed, false, 'the first final merge remains report-only');
});

test('final readiness reports each remaining audit blocker', () => {
  const notCurrent = readinessResult({ isAncestor: (ancestor) => ancestor !== 'origin/develop' });
  assert.ok(findingCodes(notCurrent).includes('develop-sync-unverified'));

  const missingDod = readinessResult({ getIssue: () => epicIssue({ body: '' }) });
  assert.ok(findingCodes(missingDod).includes('definition-of-done-missing'));
  const incompleteDod = readinessResult({ getIssue: () => epicIssue({ body: '## Definition of done\n- [ ] unfinished\n' }) });
  assert.ok(findingCodes(incompleteDod).includes('definition-of-done-incomplete'));

  const noSoak = checkIntegrationBranch({
    base: 'develop', head: BRANCH, isDraft: false, readiness: true,
    headSha: 'final-head', prBody: '', lookups: lookups(),
  });
  assert.ok(findingCodes(noSoak).includes('dev-soak-evidence-missing'));

  const wrongWorkflow = readinessResult({ getWorkflowRun: () => ({ path: '.github/workflows/security-scan.yml', conclusion: 'success', event: 'workflow_dispatch', headSha: 'soak-sha' }) });
  assert.ok(findingCodes(wrongWorkflow).includes('dev-soak-run-not-deploy'));
  const failedRun = readinessResult({ getWorkflowRun: () => ({ path: '.github/workflows/deploy.yml', conclusion: 'failure', event: 'workflow_dispatch', headSha: 'soak-sha' }) });
  assert.ok(findingCodes(failedRun).includes('dev-soak-run-not-successful'));
  const staleSoak = readinessResult({ isAncestor: (ancestor) => ancestor !== 'soak-sha' });
  assert.ok(findingCodes(staleSoak).includes('dev-soak-sha-not-ancestor'));
  const noSyncProof = readinessResult({
    getFirstParentCommitsAfter: () => [{ sha: 'child-merge', parents: ['soak-sha', 'child-head'] }],
    isAncestor: (ancestor, descendant) => !(ancestor === 'child-head' && descendant === 'origin/develop'),
  });
  assert.ok(findingCodes(noSyncProof).includes('dev-soak-branch-changed-after-run'));

  const hygiene = readinessResult({ checkMergeHygiene: () => false });
  assert.ok(findingCodes(hygiene).includes('merge-hygiene-failed'));
  const openChildren = readinessResult({ getOpenPullRequestsForBase: () => [{ number: 2738 }, { number: 2739 }] });
  assert.ok(findingCodes(openChildren).includes('open-child-pull-requests'));
  const unknownChildren = readinessResult({ getOpenPullRequestsForBase: () => null });
  assert.ok(findingCodes(unknownChildren).includes('open-pull-requests-unavailable'));
});

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || '').trim();
}

function commit(cwd, file, contents, message) {
  fs.writeFileSync(path.join(cwd, file), contents);
  git(cwd, ['add', file]);
  git(cwd, ['commit', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

test('DEV soak ancestry allows develop sync merges and rejects later direct commits', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-soak-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q', '-b', 'develop']);
  git(root, ['config', 'user.email', 'integration-test@example.invalid']);
  git(root, ['config', 'user.name', 'Integration Branch Test']);
  const initial = commit(root, 'base.txt', 'base\n', 'develop base');
  git(root, ['switch', '-c', 'integration']);
  const soakSha = commit(root, 'feature.txt', 'soaked\n', 'soak deployed');
  git(root, ['switch', 'develop']);
  const developTip = commit(root, 'develop.txt', 'new develop work\n', 'develop sync source');
  git(root, ['switch', 'integration']);
  git(root, ['merge', '--no-ff', 'develop', '-m', 'sync develop']);
  const syncHead = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/develop', developTip]);

  const realGitLookups = {
    getWorkflowRun: () => ({ path: '.github/workflows/deploy.yml', conclusion: 'success', event: 'workflow_dispatch', headSha: soakSha }),
    isAncestor: (ancestor, descendant) => spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root }).status === 0,
    getFirstParentCommitsAfter: (ancestor, descendant) => {
      const history = git(root, ['rev-list', '--first-parent', '--reverse', `${ancestor}..${descendant}`]);
      return history ? history.split(/\r?\n/).map((sha) => ({
        sha,
        parents: git(root, ['rev-list', '--parents', '-n', '1', sha]).split(/\s+/).slice(1),
      })) : [];
    },
  };
  const valid = checkDevSoak({ branch: 'epic/2634-delivery-flow', headSha: syncHead, prBody: PR_BODY, lookups: realGitLookups });
  assert.deepEqual(valid, []);

  const directHead = commit(root, 'unreviewed.txt', 'direct change\n', 'direct commit after soak');
  const invalid = checkDevSoak({ branch: 'epic/2634-delivery-flow', headSha: directHead, prBody: PR_BODY, lookups: realGitLookups });
  assert.deepEqual(findingCodes({ findings: invalid }), ['dev-soak-branch-changed-after-run']);
  assert.notEqual(initial, soakSha);
});

test('CLI accepts either a PR or explicit base/head and rejects unknown flags', () => {
  assert.deepEqual(parseArgs(['--pr', '2737', '--json', '--readiness']), {
    pr: '2737', base: null, head: null, json: true, readiness: true,
  });
  assert.deepEqual(parseArgs(['--base', 'develop', '--head', BRANCH]), {
    pr: null, base: 'develop', head: BRANCH, json: false, readiness: false,
  });
  assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
});
