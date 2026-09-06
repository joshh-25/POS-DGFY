const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkVersionTagComputation,
  checkJobOutputsVersionTag,
  checkWorkflowCallOutputsVersionTag,
  checkBuildStepStamping,
  checkMetaStepStampsCandidateLabel,
  checkImmutabilityGuardStep,
  checkDockerfileAcceptsAppVersion,
  checkOrchestratorVersionTagMapping,
  checkOrchestratorCandidateSourceShaWiring,
  checkDeployMainCandidateSourceShaWiring,
  checkDeployMainBuildSkipPlanJob,
  checkDeployMainPublishGate,
  ORCHESTRATOR_VERSION_TAG_OUTPUTS,
  ORCHESTRATOR_BUILDER_JOBS,
  DEPLOY_MAIN_CANDIDATE_SOURCE_SHA_INPUTS,
  DEPLOY_MAIN_JOB_INPUT_NAMES,
  DEPLOY_MAIN_BUILD_SKIP_OUTPUT_NAMES,
  runAllChecks,
} = require('./check-deploy-version-stamping-workflow');

// #1575 (epic #1548 Wave 3, Phase 277) -- workflow-shape coverage for the ADR 0081 version-tag
// stamping steps. Every test builds a small synthetic fixture (mirroring
// check-pr-quality-workflow.test.js's own pattern) rather than depending on the real files' exact
// text, so a valid unrelated edit to deploy-api.yml/etc. can't spuriously break these.

const VALID_META_STEP = `
      - name: Compute image tags
        id: meta
        shell: bash
        env:
          ENVIRONMENT: \${{ inputs.environment }}
        run: |
          set -euo pipefail
          SHA_TAG="sha-\${GITHUB_SHA::7}"
          echo "sha_tag=\${SHA_TAG}" >> "$GITHUB_OUTPUT"
          case "$ENVIRONMENT" in
            DEV) CHANNEL_SUFFIX="-dev" ;;
            STAGING) CHANNEL_SUFFIX="-staging" ;;
            PROD) CHANNEL_SUFFIX="" ;;
            *) echo "::error::Unknown environment '$ENVIRONMENT' -- expected DEV, STAGING, or PROD." >&2; exit 1 ;;
          esac
          APP_PKG_VERSION="$(node -p "require('./apps/dgfy-api/package.json').version")"
          VERSION_TAG="\${APP_PKG_VERSION}\${CHANNEL_SUFFIX}"
          echo "version_tag=\${VERSION_TAG}" >> "$GITHUB_OUTPUT"
`;

const FIXTURE = { label: 'fixture.yml', appPathExpr: "'./apps/dgfy-api/package.json'" };

test('checkVersionTagComputation: a correctly-shaped meta step reports no problems', () => {
  assert.deepEqual(checkVersionTagComputation(VALID_META_STEP, FIXTURE), []);
});

test('checkVersionTagComputation: missing "id: meta" entirely is caught', () => {
  const problems = checkVersionTagComputation('no meta step here at all', FIXTURE);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no "id: meta" step found/);
});

test('checkVersionTagComputation: a missing channel branch (e.g. PROD) is caught', () => {
  const text = VALID_META_STEP.replace('PROD) CHANNEL_SUFFIX="" ;;\n            ', '');
  const problems = checkVersionTagComputation(text, FIXTURE);
  assert.equal(problems.filter((p) => /PROD -> "" \(bare\)/.test(p)).length, 1);
});

test('checkVersionTagComputation: a missing DEV/STAGING branch is caught independently', () => {
  const text = VALID_META_STEP.replace('DEV) CHANNEL_SUFFIX="-dev" ;;\n            ', '');
  const problems = checkVersionTagComputation(text, FIXTURE);
  assert.equal(problems.filter((p) => /DEV -> "-dev"/.test(p)).length, 1);
  assert.equal(problems.filter((p) => /STAGING -> "-staging"/.test(p)).length, 0);
});

test('checkVersionTagComputation: no fallback branch for an unknown environment is caught', () => {
  const text = VALID_META_STEP.replace(/\*\) echo "::error::Unknown environment.*\n/, '');
  const problems = checkVersionTagComputation(text, FIXTURE);
  assert.equal(problems.filter((p) => /no fallback branch/.test(p)).length, 1);
});

test('checkVersionTagComputation: the version is not read from the expected package.json path is caught', () => {
  const text = VALID_META_STEP.replace("'./apps/dgfy-api/package.json'", "'./apps/dgfy-pos/package.json'");
  const problems = checkVersionTagComputation(text, FIXTURE);
  assert.equal(problems.filter((p) => /never hardcoded/.test(p)).length, 1);
});

test('checkVersionTagComputation: version_tag never written to $GITHUB_OUTPUT is caught', () => {
  const text = VALID_META_STEP.replace('echo "version_tag=${VERSION_TAG}" >> "$GITHUB_OUTPUT"\n', '');
  const problems = checkVersionTagComputation(text, FIXTURE);
  assert.equal(problems.filter((p) => /never writes "version_tag"/.test(p)).length, 1);
});

test('checkVersionTagComputation: the ${APP} frontend variant of the package.json path is also matched', () => {
  const text = VALID_META_STEP.replace("'./apps/dgfy-api/package.json'", "'./apps/${APP}/package.json'");
  const problems = checkVersionTagComputation(text, { label: 'deploy-frontend.yml', appPathExpr: "'./apps/${APP}/package.json'" });
  assert.deepEqual(problems, []);
});

test('checkJobOutputsVersionTag: present reports no problems, absent is caught', () => {
  const withOutput = 'outputs:\n  version_tag: ${{ steps.meta.outputs.version_tag }}\n';
  assert.deepEqual(checkJobOutputsVersionTag(withOutput, { label: 'fixture.yml' }), []);

  const withoutOutput = 'outputs:\n  sha_tag: ${{ steps.meta.outputs.sha_tag }}\n';
  const problems = checkJobOutputsVersionTag(withoutOutput, { label: 'fixture.yml' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /missing "version_tag/);
});

// PR #1577 review, RF-1 (blocker): the job-level `outputs:` block above (checkJobOutputsVersionTag)
// is not the same contract as the reusable workflow's caller-visible `on.workflow_call.outputs`
// block (checkWorkflowCallOutputsVersionTag) -- the real bug was having the first without the
// second. These fixtures deliberately use the exact two-line `value:`-wrapped shape a caller reads.

const VALID_WORKFLOW_CALL_OUTPUTS = `
on:
  workflow_call:
    outputs:
      sha_tag:
        value: \${{ jobs.build-and-push.outputs.sha_tag }}
      version_tag:
        value: \${{ jobs.build-and-push.outputs.version_tag }}
`;

test('checkWorkflowCallOutputsVersionTag: the caller-visible output present reports no problems', () => {
  assert.deepEqual(checkWorkflowCallOutputsVersionTag(VALID_WORKFLOW_CALL_OUTPUTS, { label: 'fixture.yml' }), []);
});

test('checkWorkflowCallOutputsVersionTag: RF-1 regression -- version_tag declared only on the job, never on workflow_call.outputs, is caught', () => {
  const rf1Shape = `
on:
  workflow_call:
    outputs:
      sha_tag:
        value: \${{ jobs.build-and-push.outputs.sha_tag }}

jobs:
  build-and-push:
    outputs:
      sha_tag: \${{ steps.meta.outputs.sha_tag }}
      version_tag: \${{ steps.meta.outputs.version_tag }}
`;
  const problems = checkWorkflowCallOutputsVersionTag(rf1Shape, { label: 'fixture.yml' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /caller-visible output was never declared \(RF-1/);
});

test('checkWorkflowCallOutputsVersionTag: a version_tag entry pointing at the wrong job is caught', () => {
  const wrongJob = VALID_WORKFLOW_CALL_OUTPUTS.replace('jobs.build-and-push.outputs.version_tag', 'jobs.some-other-job.outputs.version_tag');
  const problems = checkWorkflowCallOutputsVersionTag(wrongJob, { label: 'fixture.yml' });
  assert.equal(problems.length, 1);
});

const VALID_ORCHESTRATOR_OUTPUTS = `
    outputs:
${ORCHESTRATOR_VERSION_TAG_OUTPUTS.map(([outputName, jobName]) => `      ${outputName}:\n        value: \${{ jobs.${jobName}.outputs.version_tag }}`).join('\n')}
`;

test('checkOrchestratorVersionTagMapping: all five mappings present reports no problems', () => {
  assert.deepEqual(checkOrchestratorVersionTagMapping(VALID_ORCHESTRATOR_OUTPUTS), []);
});

test('checkOrchestratorVersionTagMapping: one missing mapping (e.g. dgfy_api_version_tag) is caught, others unaffected', () => {
  const text = VALID_ORCHESTRATOR_OUTPUTS.replace(/\s*dgfy_api_version_tag:\n\s*value: \$\{\{ jobs\.dgfy-api\.outputs\.version_tag \}\}/, '');
  const problems = checkOrchestratorVersionTagMapping(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /dgfy_api_version_tag/);
});

test('checkOrchestratorVersionTagMapping: every mapping missing is caught, one problem per output', () => {
  const problems = checkOrchestratorVersionTagMapping('    outputs:\n      dgfy_api_sha_tag:\n        value: ${{ jobs.dgfy-api.outputs.sha_tag }}\n');
  assert.equal(problems.length, ORCHESTRATOR_VERSION_TAG_OUTPUTS.length);
});

// checkOrchestratorCandidateSourceShaWiring -- ADR 0081 Decision 8 (#1588): every builder job (not
// `publish`, which calls publish-platform.yml and has no such input) must forward
// candidate_source_sha unchanged.

function orchestratorFixture({ withInput = true, jobs = ORCHESTRATOR_BUILDER_JOBS } = {}) {
  const inputBlock = withInput
    ? "on:\n  workflow_call:\n    inputs:\n      candidate_source_sha:\n        required: false\n        type: string\n        default: ''\n\n"
    : '';
  const jobBlocks = jobs.map((name) => `  ${name}:\n    uses: ./.github/workflows/some-workflow.yml\n    with:\n      environment: PROD\n      candidate_source_sha: \${{ inputs.candidate_source_sha }}\n    secrets: inherit\n`).join('\n');
  return `${inputBlock}jobs:\n${jobBlocks}  publish:\n    uses: ./.github/workflows/publish-platform.yml\n    with:\n      environment: PROD\n    secrets: inherit\n`;
}

test('checkOrchestratorCandidateSourceShaWiring: every builder job wired, publish excluded -> no problems', () => {
  assert.deepEqual(checkOrchestratorCandidateSourceShaWiring(orchestratorFixture()), []);
});

test('checkOrchestratorCandidateSourceShaWiring: missing the workflow_call input declaration is caught', () => {
  const problems = checkOrchestratorCandidateSourceShaWiring(orchestratorFixture({ withInput: false }));
  assert.equal(problems.filter((p) => /missing a "candidate_source_sha" string input/.test(p)).length, 1);
});

test('checkOrchestratorCandidateSourceShaWiring: one builder job missing the pass-through is caught by name, others unaffected', () => {
  const text = orchestratorFixture().replace(
    '  dgfy-api:\n    uses: ./.github/workflows/some-workflow.yml\n    with:\n      environment: PROD\n      candidate_source_sha: ${{ inputs.candidate_source_sha }}\n    secrets: inherit\n',
    '  dgfy-api:\n    uses: ./.github/workflows/some-workflow.yml\n    with:\n      environment: PROD\n    secrets: inherit\n',
  );
  const problems = checkOrchestratorCandidateSourceShaWiring(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /job "dgfy-api" does not forward/);
});

// checkDeployMainCandidateSourceShaWiring -- #1610 (ADR 0081 Decision 8 amendment): unlike the
// orchestrator above, deploy-main.yml groups candidate_source_sha per app (dgfy-api and
// dgfy-migration-runner share candidate_source_sha_api; each frontend gets its own), since PROD
// rebuilds every app unconditionally and a single shared value would mislabel an app a staging
// repair never touched.

function deployMainFixture({ missingInputs = [], jobInputOverrides = {} } = {}) {
  const inputLines = DEPLOY_MAIN_CANDIDATE_SOURCE_SHA_INPUTS
    .filter((name) => !missingInputs.includes(name))
    .map((name) => `      ${name}:\n        required: false\n        type: string\n        default: ''`)
    .join('\n');
  const inputBlock = `on:\n  workflow_dispatch:\n    inputs:\n${inputLines}\n\n`;
  const jobBlocks = DEPLOY_MAIN_JOB_INPUT_NAMES
    .map(([jobName, defaultInputName]) => {
      const inputName = jobInputOverrides[jobName] ?? defaultInputName;
      return `  ${jobName}:\n    uses: ./.github/workflows/some-workflow.yml\n    with:\n      environment: PROD\n      candidate_source_sha: \${{ inputs.${inputName} }}\n    secrets: inherit\n`;
    })
    .join('\n');
  return `${inputBlock}jobs:\n${jobBlocks}  publish:\n    uses: ./.github/workflows/publish-platform.yml\n    with:\n      environment: PROD\n    secrets: inherit\n`;
}

test('checkDeployMainCandidateSourceShaWiring: every job forwards its own correctly-grouped input -> no problems', () => {
  assert.deepEqual(checkDeployMainCandidateSourceShaWiring(deployMainFixture()), []);
});

test('checkDeployMainCandidateSourceShaWiring: a missing workflow_dispatch input is caught by name', () => {
  const problems = checkDeployMainCandidateSourceShaWiring(deployMainFixture({ missingInputs: ['candidate_source_sha_frontend_pos'] }));
  assert.equal(problems.filter((p) => /missing a "candidate_source_sha_frontend_pos" string input/.test(p)).length, 1);
});

test('checkDeployMainCandidateSourceShaWiring: dgfy-migration-runner forwarding the wrong (frontend) input is caught, not silently accepted', () => {
  const text = deployMainFixture({ jobInputOverrides: { 'dgfy-migration-runner': 'candidate_source_sha_frontend_ims' } });
  const problems = checkDeployMainCandidateSourceShaWiring(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /job "dgfy-migration-runner" does not forward "candidate_source_sha: \$\{\{ inputs\.candidate_source_sha_api \}\}"/);
});

test('checkDeployMainCandidateSourceShaWiring: dgfy-api and dgfy-migration-runner sharing candidate_source_sha_api is the expected (not flagged) shape', () => {
  // The default fixture already has both pointing at candidate_source_sha_api -- this test exists
  // to name that as deliberate (the paired-build reality), not an oversight a future reviewer
  // "fixes" into two separate inputs.
  const problems = checkDeployMainCandidateSourceShaWiring(deployMainFixture());
  assert.equal(problems.length, 0);
});

test('checkDeployMainCandidateSourceShaWiring: real deploy-main.yml passes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const text = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/deploy-main.yml'), 'utf8');
  assert.deepEqual(checkDeployMainCandidateSourceShaWiring(text), []);
});

// checkDeployMainBuildSkipPlanJob / checkDeployMainPublishGate -- #1610 (ADR 0081 Decision 7
// residue): deploy-main.yml gains a `resolve-build-plan` job, each of the five builder jobs gates
// its `if:` on its own `should_build_<app>` output (and lists `resolve-build-plan` in its own
// `needs:`), and `publish`'s `needs:`/`if:` both change (§5 -- no more "at least one success").

function deployMainBuildSkipFixture({
  missingResolveJob = false,
  jobNeedsOverrides = {},
  jobOutputOverrides = {},
  publishNeeds = '[ guard-branch, resolve-build-plan, dgfy-api, dgfy-migration-runner, frontend-ims-prod, frontend-pos-prod, frontend-storefront-prod ]',
  publishIf = "inputs.deploy && !cancelled() &&\n      needs.guard-branch.result == 'success' &&\n      needs.resolve-build-plan.result == 'success' &&\n      needs.dgfy-api.result != 'failure'",
} = {}) {
  const resolveJobBlock = missingResolveJob ? '' : '  resolve-build-plan:\n    needs: guard-branch\n    if: needs.guard-branch.result == \'success\'\n    runs-on: ubuntu-latest\n\n';

  const jobBlocks = DEPLOY_MAIN_BUILD_SKIP_OUTPUT_NAMES
    .map(([jobName, defaultOutputName]) => {
      const needs = jobNeedsOverrides[jobName] ?? '[ guard-branch, resolve-build-plan ]';
      const outputName = jobOutputOverrides[jobName] ?? defaultOutputName;
      return `  ${jobName}:\n    needs: ${needs}\n    if: >-\n      needs.guard-branch.result == 'success' && needs.resolve-build-plan.result == 'success' &&\n      inputs.build_x && needs.resolve-build-plan.outputs.${outputName} == 'true'\n    uses: ./.github/workflows/some-workflow.yml\n\n`;
    })
    .join('');

  const publishBlock = `  publish:\n    needs: ${publishNeeds}\n    if: >-\n      ${publishIf}\n    uses: ./.github/workflows/publish-platform.yml\n`;

  return `jobs:\n${resolveJobBlock}${jobBlocks}${publishBlock}`;
}

test('checkDeployMainBuildSkipPlanJob: a correctly-shaped fixture reports no problems', () => {
  assert.deepEqual(checkDeployMainBuildSkipPlanJob(deployMainBuildSkipFixture()), []);
});

test('checkDeployMainBuildSkipPlanJob: the resolve-build-plan job missing entirely is caught', () => {
  const problems = checkDeployMainBuildSkipPlanJob(deployMainBuildSkipFixture({ missingResolveJob: true }));
  assert.equal(problems.filter((p) => /no "resolve-build-plan" job found/.test(p)).length, 1);
});

test('checkDeployMainBuildSkipPlanJob: a build job missing resolve-build-plan in its own needs: is caught', () => {
  const problems = checkDeployMainBuildSkipPlanJob(deployMainBuildSkipFixture({ jobNeedsOverrides: { 'dgfy-api': 'guard-branch' } }));
  assert.equal(problems.filter((p) => /job "dgfy-api" does not list "\[ guard-branch, resolve-build-plan \]"/.test(p)).length, 1);
});

test('checkDeployMainBuildSkipPlanJob: a build job referencing the WRONG app\'s should_build output is caught', () => {
  const problems = checkDeployMainBuildSkipPlanJob(deployMainBuildSkipFixture({ jobOutputOverrides: { 'dgfy-migration-runner': 'should_build_dgfy_api' } }));
  assert.equal(problems.filter((p) => /job "dgfy-migration-runner" does not gate its "if:" on "needs\.resolve-build-plan\.outputs\.should_build_dgfy_migration_runner/.test(p)).length, 1);
});

test('checkDeployMainBuildSkipPlanJob: real deploy-main.yml passes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const text = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/deploy-main.yml'), 'utf8');
  assert.deepEqual(checkDeployMainBuildSkipPlanJob(text), []);
});

test('checkDeployMainPublishGate: a correctly-shaped fixture reports no problems', () => {
  assert.deepEqual(checkDeployMainPublishGate(deployMainBuildSkipFixture()), []);
});

test('checkDeployMainPublishGate: publish job not found is caught', () => {
  const text = deployMainBuildSkipFixture().replace(/  publish:[\s\S]*/, '');
  const problems = checkDeployMainPublishGate(text);
  assert.equal(problems.filter((p) => /"publish" job not found/.test(p)).length, 1);
});

test('checkDeployMainPublishGate: needs: missing guard-branch/resolve-build-plan is caught', () => {
  const problems = checkDeployMainPublishGate(deployMainBuildSkipFixture({
    publishNeeds: '[ dgfy-api, dgfy-migration-runner, frontend-ims-prod, frontend-pos-prod, frontend-storefront-prod ]',
  }));
  assert.equal(problems.filter((p) => /"needs:" does not start with "\[ guard-branch, resolve-build-plan, \.\.\."/.test(p)).length, 1);
});

test('checkDeployMainPublishGate: if: missing needs.resolve-build-plan.result == \'success\' is caught', () => {
  const problems = checkDeployMainPublishGate(deployMainBuildSkipFixture({
    publishIf: "inputs.deploy && !cancelled() &&\n      needs.guard-branch.result == 'success' &&\n      needs.dgfy-api.result != 'failure'",
  }));
  assert.equal(problems.filter((p) => /does not require "needs\.resolve-build-plan\.result == 'success'"/.test(p)).length, 1);
});

test('checkDeployMainPublishGate: RF-1 regression -- the old "at least one build succeeded" OR-clause is caught, not silently accepted', () => {
  const problems = checkDeployMainPublishGate(deployMainBuildSkipFixture({
    publishIf: "inputs.deploy && !cancelled() &&\n      needs.guard-branch.result == 'success' &&\n      needs.resolve-build-plan.result == 'success' &&\n      needs.dgfy-api.result != 'failure' &&\n      (needs.dgfy-api.result == 'success' || needs.dgfy-migration-runner.result == 'success')",
  }));
  assert.equal(problems.filter((p) => /still contains an "at least one build succeeded" OR-clause/.test(p)).length, 1);
});

test('checkDeployMainPublishGate: real deploy-main.yml passes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const text = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/deploy-main.yml'), 'utf8');
  assert.deepEqual(checkDeployMainPublishGate(text), []);
});

// #1588 (epic #1548 Wave 4, Phase 279): labels moved from a literal `|` block inline in the
// build-push step to a reference to the meta step's own computed output, so a blank
// candidate_source_sha input can cleanly omit its label line (see the checkMetaStepStampsCandidateLabel
// fixture below for that shape).
const VALID_BUILD_STEP = `
      - name: Build and push api image
        id: build
        uses: docker/build-push-action@v6
        with:
          build-args: |
            APP_VERSION=\${{ steps.meta.outputs.version_tag }}
          labels: \${{ steps.meta.outputs.labels }}
`;

test('checkBuildStepStamping: a correctly-shaped build step reports no problems', () => {
  assert.deepEqual(checkBuildStepStamping(VALID_BUILD_STEP, { label: 'fixture.yml' }), []);
});

test('checkBuildStepStamping: missing "id: build" is caught', () => {
  const text = VALID_BUILD_STEP.replace('        id: build\n', '');
  const problems = checkBuildStepStamping(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /no "id: build"/.test(p)).length, 1);
});

test('checkBuildStepStamping: missing the APP_VERSION build-arg is caught', () => {
  const text = VALID_BUILD_STEP.replace('          build-args: |\n            APP_VERSION=${{ steps.meta.outputs.version_tag }}\n', '');
  const problems = checkBuildStepStamping(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /does not bake "APP_VERSION/.test(p)).length, 1);
});

test('checkBuildStepStamping: a literal inline labels: | block (the pre-#1588 shape) is caught, not silently accepted', () => {
  const text = VALID_BUILD_STEP.replace(
    'labels: ${{ steps.meta.outputs.labels }}',
    'labels: |\n            org.opencontainers.image.version=${{ steps.meta.outputs.version_tag }}',
  );
  const problems = checkBuildStepStamping(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /does not reference "\$\{\{ steps\.meta\.outputs\.labels \}\}"/.test(p)).length, 1);
});

// checkMetaStepStampsCandidateLabel -- ADR 0081 Decision 8 (#1588): the meta step declares the
// candidate_source_sha input, reads it into its own env, and computes the labels heredoc with the
// candidate-source-sha line conditional on a non-empty value.

const VALID_CANDIDATE_LABEL_WORKFLOW = `
on:
  workflow_call:
    inputs:
      candidate_source_sha:
        description: ADR 0081 Decision 8 candidate source identity.
        required: false
        type: string
        default: ''

jobs:
  build-and-push:
    steps:
      - name: Compute image tags
        id: meta
        shell: bash
        env:
          ENVIRONMENT: \${{ inputs.environment }}
          CANDIDATE_SOURCE_SHA: \${{ inputs.candidate_source_sha }}
        run: |
          set -euo pipefail
          {
            echo "labels<<LABELS_EOF"
            echo "org.opencontainers.image.revision=\${GITHUB_SHA}"
            echo "org.opencontainers.image.version=\${VERSION_TAG}"
            if [ -n "\${CANDIDATE_SOURCE_SHA:-}" ]; then
              echo "org.dgfy-platform.candidate-source-sha=\${CANDIDATE_SOURCE_SHA}"
            fi
            echo "LABELS_EOF"
          } >> "$GITHUB_OUTPUT"
`;

test('checkMetaStepStampsCandidateLabel: a correctly-shaped workflow reports no problems', () => {
  assert.deepEqual(checkMetaStepStampsCandidateLabel(VALID_CANDIDATE_LABEL_WORKFLOW, { label: 'fixture.yml' }), []);
});

test('checkMetaStepStampsCandidateLabel: missing the candidate_source_sha workflow_call input is caught', () => {
  const text = VALID_CANDIDATE_LABEL_WORKFLOW.replace(
    /\s*candidate_source_sha:\n(?:.*\n)*?\s*default: ''\n/,
    '\n',
  );
  const problems = checkMetaStepStampsCandidateLabel(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /missing a "candidate_source_sha" string input/.test(p)).length, 1);
});

test('checkMetaStepStampsCandidateLabel: missing CANDIDATE_SOURCE_SHA in the meta step env is caught', () => {
  const text = VALID_CANDIDATE_LABEL_WORKFLOW.replace('          CANDIDATE_SOURCE_SHA: ${{ inputs.candidate_source_sha }}\n', '');
  const problems = checkMetaStepStampsCandidateLabel(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /missing "CANDIDATE_SOURCE_SHA: \$\{\{ inputs\.candidate_source_sha \}\}"/.test(p)).length, 1);
});

test('checkMetaStepStampsCandidateLabel: missing the labels heredoc entirely is caught', () => {
  const text = VALID_CANDIDATE_LABEL_WORKFLOW.replace(/echo "labels<<LABELS_EOF"[\s\S]*?echo "LABELS_EOF"\n/, '');
  const problems = checkMetaStepStampsCandidateLabel(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /does not compute a "labels" \$GITHUB_OUTPUT heredoc/.test(p)).length, 1);
});

test('checkMetaStepStampsCandidateLabel: missing org.opencontainers.image.version inside the heredoc is caught', () => {
  const text = VALID_CANDIDATE_LABEL_WORKFLOW.replace('            echo "org.opencontainers.image.version=${VERSION_TAG}"\n', '');
  const problems = checkMetaStepStampsCandidateLabel(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /does not stamp "org\.opencontainers\.image\.version=\$\{VERSION_TAG\}"/.test(p)).length, 1);
});

test('checkMetaStepStampsCandidateLabel: an unconditional candidate-source-sha stamp (no "if -n" guard) is caught, not silently accepted', () => {
  const text = VALID_CANDIDATE_LABEL_WORKFLOW.replace(
    '            if [ -n "${CANDIDATE_SOURCE_SHA:-}" ]; then\n              echo "org.dgfy-platform.candidate-source-sha=${CANDIDATE_SOURCE_SHA}"\n            fi\n',
    '            echo "org.dgfy-platform.candidate-source-sha=${CANDIDATE_SOURCE_SHA}"\n',
  );
  const problems = checkMetaStepStampsCandidateLabel(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /does not conditionally stamp "org\.dgfy-platform\.candidate-source-sha"/.test(p)).length, 1);
});

const VALID_GUARD_STEP = `
      - name: Publish version tag, refusing a different-revision overwrite (ADR 0081 Decision 7)
        shell: bash
        run: |
          node scripts/check-tag-immutability.js \\
            --image "\${IMAGE_NAME}" \\
            --tag "\${{ steps.meta.outputs.version_tag }}" \\
            --revision "\${{ github.sha }}" \\
            --digest "\${{ steps.build.outputs.digest }}"
`;

test('checkImmutabilityGuardStep: a correctly-wired guard step reports no problems', () => {
  assert.deepEqual(checkImmutabilityGuardStep(VALID_GUARD_STEP, { label: 'fixture.yml' }), []);
});

test('checkImmutabilityGuardStep: the guard call missing entirely is caught', () => {
  const problems = checkImmutabilityGuardStep('no guard step here', { label: 'fixture.yml' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ADR 0081 Decision 7's tag-immutability guard is missing/);
});

test('checkImmutabilityGuardStep: --digest not wired to steps.build.outputs.digest is caught', () => {
  const text = VALID_GUARD_STEP.replace('--digest "${{ steps.build.outputs.digest }}"', '--digest "some-other-value"');
  const problems = checkImmutabilityGuardStep(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /--digest wired to steps\.build\.outputs\.digest/.test(p)).length, 1);
});

test('checkImmutabilityGuardStep: --revision not wired to github.sha is caught', () => {
  const text = VALID_GUARD_STEP.replace('--revision "${{ github.sha }}"', '--revision "$SOME_VAR"');
  const problems = checkImmutabilityGuardStep(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /--revision wired to github\.sha/.test(p)).length, 1);
});

test('checkDockerfileAcceptsAppVersion: ARG + ENV present reports no problems', () => {
  const text = 'FROM node:22-alpine AS runtime\nARG APP_VERSION=""\nENV APP_VERSION=${APP_VERSION}\n';
  assert.deepEqual(checkDockerfileAcceptsAppVersion(text, { label: 'fixture/Dockerfile' }), []);
});

test('checkDockerfileAcceptsAppVersion: missing ARG is caught', () => {
  const text = 'FROM node:22-alpine AS runtime\nENV APP_VERSION=${APP_VERSION}\n';
  const problems = checkDockerfileAcceptsAppVersion(text, { label: 'fixture/Dockerfile' });
  assert.equal(problems.filter((p) => /never accepted/.test(p)).length, 1);
});

test('checkDockerfileAcceptsAppVersion: missing ENV is caught', () => {
  const text = 'FROM node:22-alpine AS runtime\nARG APP_VERSION=""\n';
  const problems = checkDockerfileAcceptsAppVersion(text, { label: 'fixture/Dockerfile' });
  assert.equal(problems.filter((p) => /never exposed to the running container/.test(p)).length, 1);
});

test('checkDockerfileAcceptsAppVersion: unbraced ENV form ($APP_VERSION, no braces) is also accepted', () => {
  const text = 'FROM node:22-alpine AS runtime\nARG APP_VERSION=""\nENV APP_VERSION=$APP_VERSION\n';
  assert.deepEqual(checkDockerfileAcceptsAppVersion(text, { label: 'fixture/Dockerfile' }), []);
});

test('runAllChecks: the real repo files (3 builder workflows + 5 Dockerfiles + deployment-orchestrator.yml) report no problems', () => {
  assert.deepEqual(runAllChecks(), []);
});
