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
  checkActiveClassMatchesExpected,
  checkNoHostedLiteral,
  extractJobBlocks,
  findActiveSites,
  isHosted,
  NON_HOSTED_FILES,
  VERIFY_DEPLOYMENT_FILE
} = require('./check-runner-routing');
const { EXPECTED_ACTIVE_CLASS } = require('./lib/runner-routing-state');

function readRealFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

function readRealWorkflowInputs() {
  const deployMainText = readRealFile('.github/workflows/deploy-main.yml');
  const qualityGateText = readRealFile('.github/workflows/promotion-quality-gate.yml');
  const nonHostedFilesText = {};
  for (const file of NON_HOSTED_FILES) {
    nonHostedFilesText[file] = readRealFile(`.github/workflows/${file}`);
  }
  const verifyDeploymentText = readRealFile(`.github/workflows/${VERIFY_DEPLOYMENT_FILE}`);
  return { deployMainText, qualityGateText, nonHostedFilesText, verifyDeploymentText };
}

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
  assert.deepEqual(checkInputDefaultSite('promotion-quality-gate.yml', text), []);
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
  const problems = checkInputDefaultSite('promotion-quality-gate.yml', text);
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
test('checkRunnerRouting: the real workflow files pass with zero problems (EXPECTED_ACTIVE_CLASS === self-hosted)', () => {
  const problems = checkRunnerRouting(readRealWorkflowInputs());
  assert.deepEqual(problems, []);
});

// --- Phase 234 (#1365) Wave 1: Assertion 6 (F-1, AC-6) -- active class must equal EXPECTED_ACTIVE_CLASS ---
// Issue #1810: EXPECTED_ACTIVE_CLASS flipped back to 'self-hosted' (GHA billing exhausted)

test('checkActiveClassMatchesExpected: EXPECTED_ACTIVE_CLASS is self-hosted', () => {
  assert.equal(EXPECTED_ACTIVE_CLASS, 'self-hosted');
});

test('checkActiveClassMatchesExpected: every site matching the constant reports no problems', () => {
  const jobClassesByFile = new Map([
    ['deploy-main.yml', new Map([['job-a', false], ['guard-branch', false]])],
    ['promotion-quality-gate.yml', new Map([['dgfy-api-quality', false], ['gate', false]])]
  ]);
  assert.deepEqual(checkActiveClassMatchesExpected(jobClassesByFile), []);
});

test('checkActiveClassMatchesExpected: a non-exempt hosted site is a problem naming the constant and both files', () => {
  const jobClassesByFile = new Map([
    ['deploy-main.yml', new Map([['job-a', true]])],
    ['promotion-quality-gate.yml', new Map()]
  ]);
  const problems = checkActiveClassMatchesExpected(jobClassesByFile);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /EXPECTED_ACTIVE_CLASS/);
  assert.match(problems[0], /deploy-main\.yml\/promotion-quality-gate\.yml/);
});

test('checkActiveClassMatchesExpected: an exempt (anchor-allowlist) site is never flagged even if self-hosted', () => {
  const jobClassesByFile = new Map([
    ['deploy-main.yml', new Map([['guard-branch', false]])], // anchor exceptions stay self-hosted by design
    ['promotion-quality-gate.yml', new Map()]
  ]);
  assert.deepEqual(checkActiveClassMatchesExpected(jobClassesByFile), []);
});

// F-1's three proven-silent inversion cases, reproduced against the real checkRunnerRouting entry
// point (not just checkActiveClassMatchesExpected in isolation) -- these are the tests that, before
// Assertion 6 existed, passed with zero problems, which is exactly #1365's AC-6 gap.

// Builds a syntactically valid commented-above-active pair block for a given job name and active class.
function pairJobBlock(name, activeHosted) {
  return activeHosted
    ? `\n  ${name}:\n    # runner_labels_json: '["sieitz-runner"]'\n    runner_labels_json: '["ubuntu-latest"]'\n`
    : `\n  ${name}:\n    # runner_labels_json: '["ubuntu-latest"]'\n    runner_labels_json: '["sieitz-runner"]'\n`;
}

const GUARD_BRANCH_BLOCK = `
  # Phase 233 (#1365) anchor exception, deliberate, not an omission: stays self-hosted.
  guard-branch:
    runs-on: ['sieitz-runner']  # #923: generic, either box
`;

const GATE_BLOCK = `
  # Phase 233 (#1365) anchor exception, deliberate, not an omission: stays self-hosted.
  gate:
    runs-on: ['sieitz-runner']
`;

function inputDefaultBlock(hosted) {
  return hosted
    ? `
  workflow_call:
    inputs: &runner_labels_input
      runner_labels_json:
        description: test
        required: false
        type: string
        # default: '["sieitz-lg"]'
        default: '["ubuntu-latest"]'
`
    : `
  workflow_call:
    inputs: &runner_labels_input
      runner_labels_json:
        description: test
        required: false
        type: string
        # default: '["ubuntu-latest"]'
        default: '["sieitz-lg"]'
`;
}

function buildFixture({ jobAHosted, jobBHosted, apiQualityHosted, salvageHosted, inputDefaultHosted }) {
  // deploy-main.yml now carries its own runner_labels_json input default site too (Phase 234
  // Wave 3, F-5) -- checkInputDefaultSite is called against both files unconditionally, so every
  // fixture needs one, same as qualityGateText already did. job-a/job-b keep their own literal
  // pair (not the delegated-to-input shape) -- these fixtures are about Assertion 6/pairing, not
  // about the delegation pattern, which has its own dedicated tests below.
  const deployMainText = `jobs:${inputDefaultBlock(inputDefaultHosted)}${GUARD_BRANCH_BLOCK}${pairJobBlock('job-a', jobAHosted)}${pairJobBlock('job-b', jobBHosted)}`;
  const qualityGateText = `jobs:${inputDefaultBlock(inputDefaultHosted)}${GATE_BLOCK}${pairJobBlock('dgfy-api-quality', apiQualityHosted)}${pairJobBlock('salvage-api-evidence', salvageHosted)}`;
  return { deployMainText, qualityGateText };
}

// Issue #1810: EXPECTED_ACTIVE_CLASS is now 'self-hosted' -- baseline fixture is self-hosted-active
const BASELINE_FIXTURE_ARGS = {
  jobAHosted: false, jobBHosted: false, apiQualityHosted: false, salvageHosted: false, inputDefaultHosted: false
};

test('F-1 baseline fixture (all self-hosted active, matching EXPECTED_ACTIVE_CLASS): checkRunnerRouting reports zero problems', () => {
  const problems = checkRunnerRouting(buildFixture(BASELINE_FIXTURE_ARGS));
  assert.deepEqual(problems, []);
});

test('F-1 full inversion (every non-exempt site hosted-active): Assertion 6 now catches what used to pass silently', () => {
  const problems = checkRunnerRouting(buildFixture({
    jobAHosted: true, jobBHosted: true, apiQualityHosted: true, salvageHosted: true, inputDefaultHosted: true
  }));
  // Co-location (F-2) and pairing (Assertions 1-3) still pass -- every flipped site is still
  // correctly paired with an opposite-class commented alternate, and dgfy-api-quality/
  // salvage-api-evidence still match each other. Only Assertion 6 fires, once per non-exempt site.
  assert.equal(problems.length, 4);
  for (const problem of problems) assert.match(problem, /EXPECTED_ACTIVE_CLASS/);
});

test('F-1 single-site inversion (only job-a flipped to hosted): Assertion 6 catches the one silently-inverted site', () => {
  const problems = checkRunnerRouting(buildFixture({
    ...BASELINE_FIXTURE_ARGS, jobAHosted: true
  }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"job-a"/);
  assert.match(problems[0], /EXPECTED_ACTIVE_CLASS/);
});

test('F-1 anchor untouched: everything else inverted, guard-branch/gate stay self-hosted and are never flagged', () => {
  const problems = checkRunnerRouting(buildFixture({
    jobAHosted: true, jobBHosted: true, apiQualityHosted: true, salvageHosted: true, inputDefaultHosted: true
  }));
  assert.ok(problems.length > 0);
  for (const problem of problems) {
    assert.doesNotMatch(problem, /"guard-branch"/);
    assert.doesNotMatch(problem, /"gate"/);
  }
});

// --- Phase 234 (#1365) Wave 1: Assertion 7 (AC-1 regression) -- NON_HOSTED_FILES / verify-deployment.yml ---

test('checkNoHostedLiteral: a file with no hosted literal anywhere reports no problems', () => {
  const text = `
jobs:
  build:
    runs-on: ['sieitz-runner']
`;
  assert.deepEqual(checkNoHostedLiteral('deploy.yml', text), []);
});

test('checkNoHostedLiteral: an active hosted literal is a problem', () => {
  const text = `
jobs:
  build:
    runs-on: ['ubuntu-latest']
`;
  const problems = checkNoHostedLiteral('deploy.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /hosted runner literal/);
});

test('checkNoHostedLiteral: a COMMENTED hosted literal is also a problem -- these files never carry one at all', () => {
  const text = `
jobs:
  build:
    # runs-on: ['ubuntu-latest']
    runs-on: ['sieitz-runner']
`;
  const problems = checkNoHostedLiteral('deploy.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /hosted runner literal/);
});

test('NON_HOSTED_FILES: names the six expected files, excluding the documented Android exception', () => {
  assert.deepEqual(NON_HOSTED_FILES, [
    'deploy.yml',
    'deployment-orchestrator.yml',
    'pr-checks.yml',
    'pr-dgfy-api-build-checks.yml',
    'pr-frontend-build-checks.yml',
    'pr-migration-runner-build-checks.yml'
  ]);
  assert.ok(!NON_HOSTED_FILES.includes('pr-android-build-checks.yml'));
  assert.ok(!NON_HOSTED_FILES.includes('build-android-manual.yml'));
});

// --- #1529: pr-checks.yml joins NON_HOSTED_FILES with one narrow, legitimate exception ---

test('checkNoHostedLiteral: a hosted literal inside a run: shell script (not at a runner_labels_json:/runs-on: key) is not flagged (#1529 route-build-checks pattern)', () => {
  const text = `
jobs:
  route-build-checks:
    runs-on: ['sieitz-runner']
    steps:
      - id: check
        run: |
          HOSTED_JSON='["ubuntu-latest"]'
          echo "light=$HOSTED_JSON" >> "$GITHUB_OUTPUT"
`;
  assert.deepEqual(checkNoHostedLiteral('pr-checks.yml', text), []);
});

test('checkRunnerRouting: an accidental unconditional hosted literal in pr-checks.yml is still reported (#1529)', () => {
  const { deployMainText, qualityGateText, nonHostedFilesText, verifyDeploymentText } = readRealWorkflowInputs();
  const polluted = { ...nonHostedFilesText, 'pr-checks.yml': "runner_labels_json: '[\"ubuntu-latest\"]'\n" };
  const problems = checkRunnerRouting({
    deployMainText, qualityGateText, nonHostedFilesText: polluted, verifyDeploymentText
  });
  assert.ok(problems.some((p) => /pr-checks\.yml/.test(p) && /hosted runner literal/.test(p)));
});

test('checkRunnerRouting: a hosted literal in a NON_HOSTED_FILES entry is reported', () => {
  const { deployMainText, qualityGateText, nonHostedFilesText, verifyDeploymentText } = readRealWorkflowInputs();
  const polluted = { ...nonHostedFilesText, 'deploy.yml': "runs-on: ['ubuntu-latest']\n" };
  const problems = checkRunnerRouting({
    deployMainText, qualityGateText, nonHostedFilesText: polluted, verifyDeploymentText
  });
  assert.ok(problems.some((p) => /deploy\.yml/.test(p) && /hosted runner literal/.test(p)));
});

test('checkRunnerRouting: a hosted literal in verify-deployment.yml is reported', () => {
  const { deployMainText, qualityGateText, nonHostedFilesText } = readRealWorkflowInputs();
  const problems = checkRunnerRouting({
    deployMainText, qualityGateText, nonHostedFilesText, verifyDeploymentText: "runs-on: ['ubuntu-latest']\n"
  });
  assert.ok(problems.some((p) => /verify-deployment\.yml/.test(p) && /hosted runner literal/.test(p)));
});

// --- Phase 234 Wave 3 (#1365, F-5): a job delegating to the file's own runner_labels_json input ---

const DELEGATED_INPUT_DEFAULT_HOSTED = `
  workflow_dispatch:
    inputs:
      runner_labels_json:
        description: test
        required: false
        type: string
        # default: '["sieitz-runner"]'
        default: '["ubuntu-latest"]'
`;

test('checkFile: a job delegating to the file input resolves its class from the input default, no local pair required', () => {
  const text = `jobs:${DELEGATED_INPUT_DEFAULT_HOSTED}  some-job:\n    runner_labels_json: \${{ inputs.runner_labels_json }}\n`;
  const { problems, jobClasses } = checkFile('deploy-main.yml', text);
  assert.deepEqual(problems, []);
  assert.equal(jobClasses.get('some-job'), true);
});

test('checkFile: a delegating job with no input default site anywhere in the file is a problem', () => {
  const text = `jobs:\n  some-job:\n    runner_labels_json: \${{ inputs.runner_labels_json }}\n`;
  const { problems } = checkFile('deploy-main.yml', text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"some-job"/);
  assert.match(problems[0], /delegates its runner class/);
});

test('checkRunnerRouting: deploy-main.yml\'s real 6 build/publish jobs all delegate to its own runner_labels_json input and resolve self-hosted', () => {
  const { deployMainText } = readRealWorkflowInputs();
  const { jobClasses } = checkFile('deploy-main.yml', deployMainText);
  for (const job of ['dgfy-api', 'dgfy-migration-runner', 'frontend-ims-prod', 'frontend-pos-prod', 'frontend-storefront-prod', 'publish']) {
    assert.equal(jobClasses.get(job), false, `${job} should resolve self-hosted via the delegated input`);
  }
});
