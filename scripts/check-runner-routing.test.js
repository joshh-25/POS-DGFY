const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  checkRunnerRouting,
  checkFile,
  checkPair,
  checkInputDefaultSite,
  checkCoLocation,
  checkNoDevStagingTarget,
  extractJobBlocks,
  findActiveSites,
  isHosted
} = require('./check-runner-routing');

// Phase 233 (#1365): regression coverage for check-runner-routing.js's actual job -- catching a
// future edit that drops a commented alternate, leaves both lines on the same class, silently
// removes an anchor exception's own explanation, breaks the salvage-api-evidence/dgfy-api-quality
// co-location invariant (F-2), or reintroduces a hosted DEV/STAGING target (Wave 1 Sec 1.5).

test('isHosted: detects the three hosted image literals, not self-hosted labels', () => {
  assert.equal(isHosted("runner_labels_json: '[\"ubuntu-latest\"]'"), true);
  assert.equal(isHosted("runs-on: ['windows-latest']"), true);
  assert.equal(isHosted("runner_labels_json: '[\"macos-latest\"]'"), true);
  assert.equal(isHosted("runner_labels_json: '[\"sieitz-runner\"]'"), false);
  assert.equal(isHosted("runs-on: ${{ fromJSON(inputs.runner_labels_json || '[\"sieitz-lg\"]') }}"), false);
});

const VALID_JOB = `
  some-job:
    needs: gate
    # Phase 233 (#1365) scaffold, INERT: hosted is the intended class.
    # runner_labels_json: '["ubuntu-latest"]'
    runner_labels_json: '["sieitz-runner"]'  # #923: PROD, either box
    secrets: inherit
`;

test('checkFile: a correctly paired site reports no problems', () => {
  const { problems, jobClasses } = checkFile('deploy-main.yml', VALID_JOB);
  assert.deepEqual(problems, []);
  assert.equal(jobClasses.get('some-job'), false);
});

test('checkFile: a site with no commented alternate at all is a problem', () => {
  const text = `
  some-job:
    needs: gate
    runner_labels_json: '["sieitz-runner"]'  # #923: PROD, either box
`;
  const { problems } = checkFile('deploy-main.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no commented alternate line immediately above/);
});

test('checkFile: a commented alternate of the same class (not opposite) is a problem', () => {
  const text = `
  some-job:
    needs: gate
    # runner_labels_json: '["sieitz-runner"]'
    runner_labels_json: '["sieitz-lg"]'
`;
  const { problems } = checkFile('deploy-main.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /both self-hosted/);
});

test('checkFile: an unrelated comment directly above (not the same key) is a problem', () => {
  const text = `
  some-job:
    needs: gate
    # this comment is not a commented alternate
    runner_labels_json: '["sieitz-runner"]'
`;
  const { problems } = checkFile('deploy-main.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not itself start with/);
});

test('checkFile: guard-branch (anchor allowlist) with its own explanation and no alternate passes', () => {
  const text = `
  # Phase 233 (#1365) anchor exception, deliberate, not an omission: stays self-hosted.
  guard-branch:
    runs-on: ['sieitz-runner']  # #923: generic, either box
`;
  const { problems, jobClasses } = checkFile('deploy-main.yml', text);
  assert.deepEqual(problems, []);
  assert.equal(jobClasses.get('guard-branch'), false);
});

test('checkFile: guard-branch missing its own explanation is a problem', () => {
  const text = `
  guard-branch:
    runs-on: ['sieitz-runner']  # #923: generic, either box
`;
  const { problems } = checkFile('deploy-main.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no comment explaining why/);
});

test('checkFile: guard-branch carrying a commented hosted alternate anyway is a problem', () => {
  const text = `
  # Phase 233 (#1365) anchor exception, deliberate, not an omission.
  guard-branch:
    # runs-on: ['ubuntu-latest']
    runs-on: ['sieitz-runner']  # #923: generic, either box
`;
  const { problems } = checkFile('deploy-main.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /carries a commented .* alternate anyway/);
});

test('checkPair: valid opposite-class pair reports no problems', () => {
  const problems = checkPair(
    'deploy-main.yml',
    'some-job',
    "    runner_labels_json: '[\"sieitz-runner\"]'",
    "    # runner_labels_json: '[\"ubuntu-latest\"]'",
    'runner_labels_json:'
  );
  assert.deepEqual(problems, []);
});

test('checkCoLocation: matching classes report no problems', () => {
  const jobClassesByFile = new Map([
    ['promotion-quality-gate.yml', new Map([['dgfy-api-quality', false], ['salvage-api-evidence', false]])]
  ]);
  assert.deepEqual(checkCoLocation(jobClassesByFile), []);
});

test('checkCoLocation: mismatched classes is a problem (F-2)', () => {
  const jobClassesByFile = new Map([
    ['promotion-quality-gate.yml', new Map([['dgfy-api-quality', true], ['salvage-api-evidence', false]])]
  ]);
  const problems = checkCoLocation(jobClassesByFile);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /must always match/);
});

test('checkNoDevStagingTarget: PROD-only text reports no problems', () => {
  assert.deepEqual(checkNoDevStagingTarget('deploy-main.yml', 'environment: PROD\n'), []);
});

test('checkNoDevStagingTarget: a DEV/STAGING target is a problem', () => {
  const problems = checkNoDevStagingTarget('deploy-main.yml', 'environment: STAGING\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /environment: STAGING/);
});

test('checkInputDefaultSite: valid paired default reports no problems', () => {
  const text = `
  workflow_call:
    inputs: &runner_labels_input
      runner_labels_json:
        description: test
        required: false
        type: string
        # default: '["ubuntu-latest"]'
        default: '["sieitz-lg"]'
`;
  assert.deepEqual(checkInputDefaultSite(text), []);
});

test('checkInputDefaultSite: missing commented alternate is a problem', () => {
  const text = `
  workflow_call:
    inputs: &runner_labels_input
      runner_labels_json:
        description: test
        required: false
        type: string
        default: '["sieitz-lg"]'
`;
  const problems = checkInputDefaultSite(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no commented alternate/);
});

test('extractJobBlocks/findActiveSites: locate exactly one active site per job in a small multi-job fixture', () => {
  const text = `
jobs:
  job-a:
    # runner_labels_json: '["ubuntu-latest"]'
    runner_labels_json: '["sieitz-runner"]'

  job-b:
    runs-on: ['sieitz-runner']
`;
  const blocks = extractJobBlocks(text);
  assert.deepEqual([...blocks.keys()], ['job-a', 'job-b']);
  assert.equal(findActiveSites(blocks.get('job-a').block).length, 1);
  assert.equal(findActiveSites(blocks.get('job-b').block).length, 1);
});

// Integration: the real workflow files, as they exist on disk, must pass end to end. This is the
// test that actually catches a future edit silently inverting or degrading the scaffold -- the
// fixture-based tests above only prove the checker's own logic is sound.
test('checkRunnerRouting: the real deploy-main.yml and promotion-quality-gate.yml pass with zero problems', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const deployMainText = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/deploy-main.yml'), 'utf8'
  );
  const qualityGateText = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/promotion-quality-gate.yml'), 'utf8'
  );
  const problems = checkRunnerRouting({ deployMainText, qualityGateText });
  assert.deepEqual(problems, []);
});
