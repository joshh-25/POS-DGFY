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
  assert.equal(isSelfHostedReachable(block), true);
});

test('isSelfHostedReachable: a plain delegated input is reachable regardless of the file default', () => {
  const block = '    runs-on: ${{ fromJSON(inputs.runner_labels_json) }}\n';
  assert.equal(isSelfHostedReachable(block), true);
});

// #1528 RF-1 (codex pr-reviewer finding): an earlier version of this function tried to resolve
// reachability from the input's own file-level `default:`, which missed exactly this form --
// promotion-quality-gate.yml's seven quality jobs default to ubuntu-latest but accept a
// workflow_call/workflow_dispatch override (this repo's own documented "F-5" single-dispatch-
// override pattern), so the input's default tells you nothing about what a caller can pass.
test('isSelfHostedReachable: fromJSON(inputs.runner_labels_json || <hosted literal>) is still reachable', () => {
  const block = "    runs-on: \${{ fromJSON(inputs.runner_labels_json || '[\"ubuntu-latest\"]') }}\n";
  assert.equal(isSelfHostedReachable(block), true);
});

test('isSelfHostedReachable: a hard hosted literal with no input reference is not reachable', () => {
  const block = "    runs-on: ['ubuntu-latest']\n";
  assert.equal(isSelfHostedReachable(block), false);
});

test('checkFile: a correctly guarded self-hosted job reports no problems', () => {
  const text = buildFile();
  assert.deepEqual(checkFile('fixture.yml', text), []);
});

test('checkFile: a hosted-only job needs no hygiene step at all', () => {
  const text = buildFile({ runsOn: "['ubuntu-latest']", hygiene: '', assertStep: '' });
  assert.deepEqual(checkFile('fixture.yml', text), []);
});

// #1528 RF-1 regression: the fromJSON(... || <hosted literal>) form must require guards, not be
// silently treated as hosted-only.
test('checkFile: a delegated input with an inline hosted fallback still requires guards', () => {
  const text = buildFile({ runsOn: "${{ fromJSON(inputs.runner_labels_json || '[\"ubuntu-latest\"]') }}", hygiene: '', assertStep: '' });
  const problems = checkFile('fixture.yml', text);
  assert.equal(problems.some((p) => p.includes('no "Clear stale sparse-checkout')), true);
  assert.equal(problems.some((p) => p.includes('no "Assert complete working tree')), true);
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

// #1528 RF-1 regression: drift must be caught between two sites in the SAME file, not only
// between files -- an earlier version only ever compared the first marker occurrence per file.
function buildTwoJobFile({ job1Hygiene = HYGIENE_STEP, job2Hygiene = HYGIENE_STEP } = {}) {
  return `name: Fixture

jobs:
  job-one:
    runs-on: ['sieitz-runner']
    steps:
${job1Hygiene}      - uses: actions/checkout@v4
${ASSERT_STEP}      - name: Build
        run: echo hi
  job-two:
    runs-on: ['sieitz-runner']
    steps:
${job2Hygiene}      - uses: actions/checkout@v4
${ASSERT_STEP}      - name: Build
        run: echo hi
`;
}

test('checkNoDrift: catches drift between two jobs in the SAME file', () => {
  const driftedHygiene = HYGIENE_STEP.replace('nothing to clear.', 'nothing here to clear.');
  const fileTexts = new Map([['a.yml', buildTwoJobFile({ job2Hygiene: driftedHygiene })]]);
  const problems = checkNoDrift(fileTexts);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not byte-identical/);
  assert.match(problems[0], /a\.yml:job-one/);
  assert.match(problems[0], /a\.yml:job-two/);
});

// The "advisory" shape (continue-on-error: true on every step, per promotion-quality-gate.yml's
// #1063/#1066/#1431 quality-job contract) is a structurally required difference from the "plain"
// shape used everywhere else -- it must NOT be reported as drift against plain sites, and drift
// must still be caught within the advisory bucket itself.
const ADVISORY_HYGIENE_STEP = `      - name: Clear stale sparse-checkout state (workspace-hygiene v1)
        shell: bash
        continue-on-error: true
        run: |
          set -uo pipefail
          WS="\${GITHUB_WORKSPACE:-}"
          if [ -z "$WS" ] || [ ! -e "$WS/.git" ]; then
            echo "[workspace-hygiene] no pre-existing workspace -- nothing to clear."; exit 0
          fi
`;

test('checkNoDrift: an advisory-shape (continue-on-error) site is not flagged against plain sites', () => {
  const fileTexts = new Map([
    ['plain.yml', buildFile()],
    ['advisory.yml', buildFile({ hygiene: ADVISORY_HYGIENE_STEP })]
  ]);
  assert.deepEqual(checkNoDrift(fileTexts), []);
});

test('checkNoDrift: catches drift WITHIN the advisory bucket', () => {
  const driftedAdvisory = ADVISORY_HYGIENE_STEP.replace('nothing to clear.', 'nothing here to clear.');
  const fileTexts = new Map([
    ['advisory-a.yml', buildFile({ hygiene: ADVISORY_HYGIENE_STEP })],
    ['advisory-b.yml', buildFile({ hygiene: driftedAdvisory })]
  ]);
  const problems = checkNoDrift(fileTexts);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /advisory-shape/);
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
