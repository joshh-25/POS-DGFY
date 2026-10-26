'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  slugFromTitle,
  validateSlug,
  readMarkerLines,
  hasPullRequestBasePattern,
  assertCiTriggers,
  executeEpicBranch,
} = require('./epic-branch');

const SHA = 'a'.repeat(40);
const PR_WORKFLOW = `on:\n  pull_request:\n    branches:\n      - develop\n      - 'epic/**'\n      - 'feature/**'\n    types:\n      - opened\n`;
const SECURITY_WORKFLOW = `on:\n  pull_request:\n    branches: [develop, 'epic/**', 'feature/**']\n    types: [opened]\n  workflow_dispatch:\n`;
const WORKFLOWS = {
  '.github/workflows/pr-checks.yml': PR_WORKFLOW,
  '.github/workflows/security-scan.yml': SECURITY_WORKFLOW,
};

function makeIssue(overrides = {}) {
  return {
    number: 2737,
    title: 'Optional Reserved-name Integration Branches',
    state: 'open',
    labels: [{ name: 'epic' }],
    comments: [],
    ...overrides,
  };
}

function makeDeps({ issue = makeIssue(), remoteBranches = [], workflows = WORKFLOWS } = {}) {
  const events = [];
  let currentIssue = issue;
  let currentRemotes = remoteBranches;
  const deps = {
    getIssue: (number) => {
      assert.equal(number, 2737);
      return currentIssue;
    },
    listRemoteBranches: () => currentRemotes,
    fetchDevelop: () => { events.push(['fetch']); return SHA; },
    readWorkflow: (_sha, file) => workflows[file],
    pushBranch: (sha, name) => {
      events.push(['push', sha, name]);
      currentRemotes = [...currentRemotes, { name, sha }];
    },
    postMarker: (number, name) => {
      events.push(['comment', number, name]);
      currentIssue = { ...currentIssue, comments: [...currentIssue.comments, { body: `Integration branch: ${name}\n` }] };
    },
  };
  return { deps, events, getIssue: () => currentIssue, getRemotes: () => currentRemotes };
}

const options = (patch = {}) => ({
  issueNumber: 2737,
  prefix: 'epic',
  slug: 'policy',
  slugExplicit: true,
  prefixExplicit: false,
  dryRun: false,
  ...patch,
});

test('CLI accepts an issue, optional prefix and slug, or a dry run', () => {
  assert.deepEqual(parseArgs(['2737']), {
    issueNumber: 2737, prefix: 'epic', slug: null, dryRun: false, prefixExplicit: false, slugExplicit: false,
  });
  assert.deepEqual(parseArgs(['2737', '--prefix', 'feature', '--slug', 'delivery-flow', '--dry-run']), {
    issueNumber: 2737, prefix: 'feature', slug: 'delivery-flow', dryRun: true, prefixExplicit: true, slugExplicit: true,
  });
  assert.throws(() => parseArgs(['0']), /positive integer/);
  assert.throws(() => parseArgs(['2737', '--prefix', 'feat']), /epic or feature/);
  assert.throws(() => parseArgs(['2737', '--wat']), /Unknown argument/);
});

test('issue-title slug is sanitized and capped; explicit slugs must already be valid', () => {
  const slug = slugFromTitle('A Very Long Feature: Cross-Store & POS Updates Beyond One Iteration!');
  assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(slug.length <= 40);
  assert.equal(validateSlug('delivery-flow-2'), 'delivery-flow-2');
  assert.throws(() => validateSlug('Delivery Flow'), /lowercase letters/);
  assert.throws(() => validateSlug('a'.repeat(41)), /at most 40/);
});

test('marker parsing requires the exact line and rejects malformed marker-like lines', () => {
  assert.deepEqual(readMarkerLines([{ body: 'Notes\nIntegration branch: epic/2737-policy\n' }]), {
    markers: ['epic/2737-policy'], malformed: [],
  });
  assert.deepEqual(readMarkerLines([{ body: 'Integration branch:   epic/2737-policy\n' }]), {
    markers: [], malformed: ['Integration branch:   epic/2737-policy'],
  });
});

test('CI preflight checks both workflow triggers for both reserved prefixes', () => {
  assert.equal(hasPullRequestBasePattern(PR_WORKFLOW, 'epic'), true);
  assert.equal(hasPullRequestBasePattern(SECURITY_WORKFLOW, 'feature'), true);
  assertCiTriggers(WORKFLOWS);
  assert.throws(() => assertCiTriggers({
    ...WORKFLOWS,
    '.github/workflows/security-scan.yml': SECURITY_WORKFLOW.replace("'feature/**'", "'feat/**'"),
  }), /security-scan.yml for feature\/\*\* bases/);
});

test('closed and non-epic issues fail before any branch or comment action', () => {
  for (const issue of [makeIssue({ state: 'closed' }), makeIssue({ labels: [{ name: 'area:infra' }] })]) {
    const state = makeDeps({ issue });
    assert.throws(() => executeEpicBranch(options(), state.deps), /must be open|must carry the epic label/);
    assert.deepEqual(state.events, []);
  }
});

test('valid epic creates a reserved branch from fresh develop and posts one exact marker', () => {
  const state = makeDeps();
  const result = executeEpicBranch(options(), state.deps);
  assert.deepEqual(result, { action: 'created', branch: 'epic/2737-policy', developSha: SHA, issueNumber: 2737 });
  assert.deepEqual(state.events, [
    ['fetch'],
    ['push', SHA, 'epic/2737-policy'],
    ['comment', 2737, 'epic/2737-policy'],
  ]);
  assert.deepEqual(state.getIssue().comments, [{ body: 'Integration branch: epic/2737-policy\n' }]);
});

test('a second run is a no-op when the registered remote branch exists', () => {
  const issue = makeIssue({ comments: [{ body: 'Integration branch: epic/2737-policy\n' }] });
  const state = makeDeps({ issue, remoteBranches: [{ name: 'epic/2737-policy', sha: SHA }] });
  const result = executeEpicBranch(options(), state.deps);
  assert.deepEqual(result, { action: 'already-registered', branch: 'epic/2737-policy', issueNumber: 2737 });
  assert.deepEqual(state.events, []);
});

test('a registered marker with a deleted remote ref recreates the same name without another comment', () => {
  const issue = makeIssue({ comments: [{ body: 'Integration branch: feature/2737-policy\n' }] });
  const state = makeDeps({ issue, remoteBranches: [] });
  const result = executeEpicBranch(options(), state.deps);
  assert.deepEqual(result, { action: 'recreated', branch: 'feature/2737-policy', developSha: SHA, issueNumber: 2737 });
  assert.deepEqual(state.events, [['fetch'], ['push', SHA, 'feature/2737-policy']]);
});

test('helper refuses unregistered remote collisions and multiple registrations', () => {
  const existing = makeDeps({ remoteBranches: [{ name: 'epic/2737-policy', sha: SHA }] });
  assert.throws(() => executeEpicBranch(options(), existing.deps), /exists without its registration marker/);

  const conflict = makeDeps({ issue: makeIssue({ comments: [
    { body: 'Integration branch: epic/2737-one\n' },
    { body: 'Integration branch: feature/2737-two\n' },
  ] }) });
  assert.throws(() => executeEpicBranch(options(), conflict.deps), /multiple integration branch markers/);
});

test('helper refuses to cut a branch before both CI workflows cover reserved bases', () => {
  const workflows = { ...WORKFLOWS, '.github/workflows/pr-checks.yml': PR_WORKFLOW.replace("'epic/**'", "'feat/**'") };
  const state = makeDeps({ workflows });
  assert.throws(() => executeEpicBranch(options(), state.deps), /pr-checks.yml for epic\/\*\* bases/);
  assert.deepEqual(state.events, [['fetch']]);
});

test('dry-run validates the target and workflow gate without pushing or commenting', () => {
  const state = makeDeps();
  const result = executeEpicBranch(options({ dryRun: true }), state.deps);
  assert.deepEqual(result, { action: 'would-create', branch: 'epic/2737-policy', developSha: SHA, issueNumber: 2737 });
  assert.deepEqual(state.events, [['fetch']]);
});
