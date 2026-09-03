const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  checkWorkspaceHygiene,
  checkFile,
  checkNoDrift,
  isSelfHostedReachable,
  listWorkflowFiles
} = require('./check-workspace-hygiene');

const HYGIENE_STEP = `      - name: Clear stale sparse-checkout state (workspace-hygiene v1)
        shell: bash
        run: |
          set -uo pipefail
          WS="\${GITHUB_WORKSPACE:-}"
          if [ -z "$WS" ] || [ ! -e "$WS/.git" ]; then
            echo "[workspace-hygiene] no pre-existing workspace -- nothing to clear."; exit 0
          fi
`;

const ASSERT_STEP = `      - name: Assert complete working tree (workspace-hygiene v1)
        shell: bash
        run: |
          set -euo pipefail
          echo "[workspace-hygiene] tree complete."
`;

function buildFile({ runsOn = "['sieitz-runner']", hygiene = HYGIENE_STEP, checkoutLine = '      - uses: actions/checkout@v4\n', assertStep = ASSERT_STEP } = {}) {
  return `name: Fixture

jobs:
  build-check:
    runs-on: ${runsOn}
    steps:
${hygiene}${checkoutLine}${assertStep}      - name: Build
        run: echo hi
`;
}

test('isSelfHostedReachable: detects a direct sieitz label', () => {
  const block = "    runs-on: ['sieitz-runner']\n    steps:\n";
  assert.equal(isSelfHostedReachable(block, block), true);
});

test('isSelfHostedReachable: excludes a genuine hosted default via delegated input', () => {
  const fileText = `
    inputs:
      runner_labels_json:
        default: '["ubuntu-latest"]'
`;
  const block = '    runs-on: ${{ fromJSON(inputs.runner_labels_json) }}\n';
  assert.equal(isSelfHostedReachable(block, fileText), false);
});

test('isSelfHostedReachable: includes a self-hosted default via delegated input', () => {
  const fileText = `
    inputs:
      runner_labels_json:
        default: '["sieitz-runner"]'
`;
  const block = '    runs-on: ${{ fromJSON(inputs.runner_labels_json) }}\n';
  assert.equal(isSelfHostedReachable(block, fileText), true);
});

test('checkFile: a correctly guarded self-hosted job reports no problems', () => {
  const text = buildFile();
  assert.deepEqual(checkFile('fixture.yml', text), []);
});

test('checkFile: a hosted-only job needs no hygiene step at all', () => {
  const text = buildFile({ runsOn: "['ubuntu-latest']", hygiene: '', assertStep: '' });
  assert.deepEqual(checkFile('fixture.yml', text), []);
});

test('checkFile: reintroducing sparse-checkout is forbidden', () => {
  const text = `name: Fixture
jobs:
  build-check:
    runs-on: ['sieitz-runner']
    steps:
      - uses: actions/checkout@v4
        with:
          sparse-checkout: |
            scripts
`;
  const problems = checkFile('fixture.yml', text);
  assert.equal(problems.length >= 1, true);
  assert.match(problems[0], /sparse-checkout/);
  assert.match(problems[0], /SPARSE_ALLOWLIST/);
});

test('checkFile: missing hygiene-clear step is flagged', () => {
  const text = buildFile({ hygiene: '' });
  const problems = checkFile('fixture.yml', text);
  assert.equal(problems.some((p) => p.includes('no "Clear stale sparse-checkout')), true);
});

test('checkFile: missing assert step is flagged', () => {
  const text = buildFile({ assertStep: '' });
  const problems = checkFile('fixture.yml', text);
  assert.equal(problems.some((p) => p.includes('no "Assert complete working tree')), true);
});

test('checkFile: hygiene-clear step ordered AFTER checkout is flagged', () => {
  const text = `name: Fixture
jobs:
  build-check:
    runs-on: ['sieitz-runner']
    steps:
      - uses: actions/checkout@v4
${HYGIENE_STEP}${ASSERT_STEP}`;
  const problems = checkFile('fixture.yml', text);
  assert.equal(problems.some((p) => p.includes('must run BEFORE actions/checkout')), true);
});

test('checkFile: assert step ordered BEFORE checkout is flagged', () => {
  const text = `name: Fixture
jobs:
  build-check:
    runs-on: ['sieitz-runner']
    steps:
${HYGIENE_STEP}${ASSERT_STEP}      - uses: actions/checkout@v4
`;
  const problems = checkFile('fixture.yml', text);
  assert.equal(problems.some((p) => p.includes('must run AFTER actions/checkout')), true);
});

test('checkNoDrift: identical bodies across two files report no problems', () => {
  const fileTexts = new Map([
    ['a.yml', buildFile()],
    ['b.yml', buildFile()]
  ]);
  assert.deepEqual(checkNoDrift(fileTexts), []);
});

test('checkNoDrift: a drifted assert body is flagged', () => {
  const driftedAssert = `      - name: Assert complete working tree (workspace-hygiene v1)
        shell: bash
        run: |
          set -euo pipefail
          echo "[workspace-hygiene] tree complete." # drifted extra comment differs
`;
  const fileTexts = new Map([
    ['a.yml', buildFile()],
    ['b.yml', buildFile({ assertStep: driftedAssert })]
  ]);
  const problems = checkNoDrift(fileTexts);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not byte-identical/);
  assert.match(problems[0], /a\.yml/);
  assert.match(problems[0], /b\.yml/);
});

test('checkWorkspaceHygiene: combines per-file and drift checks', () => {
  const fileTexts = new Map([
    ['ok.yml', buildFile()],
    ['broken.yml', buildFile({ hygiene: '' })]
  ]);
  const problems = checkWorkspaceHygiene(fileTexts);
  assert.equal(problems.some((p) => p.includes('broken.yml')), true);
});

// Live check: every real workflow in this repo must currently pass -- this is the actual
// regression guard, not just fixture coverage. If this fails after a workflow edit, the fix is
// almost always adding/aligning the workspace-hygiene steps in that file, not loosening the check.
test('live: every real workflow file passes the workspace-hygiene contract', () => {
  const workflowsDir = path.resolve(__dirname, '..', '.github', 'workflows');
  const fileTexts = new Map();
  for (const file of listWorkflowFiles()) {
    fileTexts.set(file, fs.readFileSync(path.join(workflowsDir, file), 'utf8'));
  }
  const problems = checkWorkspaceHygiene(fileTexts);
  assert.deepEqual(problems, []);
});
