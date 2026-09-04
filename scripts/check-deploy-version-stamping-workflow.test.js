const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkVersionTagComputation,
  checkJobOutputsVersionTag,
  checkWorkflowCallOutputsVersionTag,
  checkBuildStepStamping,
  checkImmutabilityGuardStep,
  checkDockerfileAcceptsAppVersion,
  checkOrchestratorVersionTagMapping,
  ORCHESTRATOR_VERSION_TAG_OUTPUTS,
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

const VALID_BUILD_STEP = `
      - name: Build and push api image
        id: build
        uses: docker/build-push-action@v6
        with:
          build-args: |
            APP_VERSION=\${{ steps.meta.outputs.version_tag }}
          labels: |
            org.opencontainers.image.revision=\${{ github.sha }}
            org.opencontainers.image.version=\${{ steps.meta.outputs.version_tag }}
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

test('checkBuildStepStamping: missing the org.opencontainers.image.version label is caught', () => {
  const text = VALID_BUILD_STEP.replace('            org.opencontainers.image.version=${{ steps.meta.outputs.version_tag }}\n', '');
  const problems = checkBuildStepStamping(text, { label: 'fixture.yml' });
  assert.equal(problems.filter((p) => /does not stamp "org\.opencontainers\.image\.version"/.test(p)).length, 1);
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
