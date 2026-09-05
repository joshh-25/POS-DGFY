#!/usr/bin/env node
/**
 * Workflow-shape check for #1575 (epic #1548 Wave 3, Phase 277) -- asserts deploy-api.yml,
 * deploy-migration-runner.yml, and deploy-frontend.yml each compute and emit the ADR 0081
 * `X.Y.Z[-channel]` version tag, stamp the `org.opencontainers.image.version` label, bake
 * `APP_VERSION` as a build-arg, and run the tag-immutability guard (Decision 7) -- plus that all
 * five Dockerfiles accept and expose `APP_VERSION`. Regex/text assertions against the real files,
 * same "no live GHCR push, no live docker build" bar `check-pr-quality-workflow.js` already sets
 * for this class of check (no compiler exists for `.github/workflows/*.yml` or a Dockerfile).
 *
 * Every check function below takes file text as a plain string (not a path) so tests can build
 * small synthetic fixtures, matching check-pr-quality-workflow.test.js's own pattern -- `main()` is
 * the only thing that reads real files.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const BUILDER_WORKFLOWS = Object.freeze([
  { file: '.github/workflows/deploy-api.yml', label: 'deploy-api.yml', appPathExpr: "'./apps/dgfy-api/package.json'" },
  { file: '.github/workflows/deploy-migration-runner.yml', label: 'deploy-migration-runner.yml', appPathExpr: "'./apps/dgfy-migration-runner/package.json'" },
  { file: '.github/workflows/deploy-frontend.yml', label: 'deploy-frontend.yml', appPathExpr: "'./apps/${APP}/package.json'" },
]);

const DOCKERFILES = Object.freeze([
  'infrastructure/docker/dgfy-api/Dockerfile',
  'infrastructure/docker/dgfy-migration-runner/Dockerfile',
  'infrastructure/docker/dgfy-ims/Dockerfile',
  'infrastructure/docker/dgfy-pos/Dockerfile',
  'infrastructure/docker/dgfy-storefront/Dockerfile',
]);

const ORCHESTRATOR_FILE = '.github/workflows/deployment-orchestrator.yml';

// PR #1577 review, RF-1: the orchestrator's own `*_version_tag` outputs (added alongside the
// pre-existing `*_sha_tag` ones) each read `jobs.<job>.outputs.version_tag` -- which only resolves
// to something once the called reusable workflow actually re-exports it under its own
// `on.workflow_call.outputs`, not just its inner job's `outputs:` block. This table is the
// caller-side half of that contract; checkWorkflowCallOutputsVersionTag below is the callee-side
// half.
const ORCHESTRATOR_VERSION_TAG_OUTPUTS = Object.freeze([
  ['frontend_ims_version_tag', 'frontend-ims'],
  ['frontend_pos_version_tag', 'frontend-pos'],
  ['frontend_storefront_version_tag', 'frontend-storefront'],
  ['dgfy_api_version_tag', 'dgfy-api'],
  ['migration_runner_version_tag', 'dgfy-migration-runner'],
]);

/**
 * The "Compute image tags" (`id: meta`) step must: derive a channel suffix from the three known
 * environment values (ADR 0081 Decision 1), read the app's package.json version (Decision 6 -- this
 * step only ever reads it), and emit `version_tag` to $GITHUB_OUTPUT.
 */
function checkVersionTagComputation(workflowText, { label, appPathExpr }) {
  const problems = [];

  if (!/id:\s*meta/.test(workflowText)) {
    problems.push(`${label}: no "id: meta" step found -- expected the existing "Compute image tags" step.`);
    return problems;
  }

  const requiredChannelLines = [
    [/DEV\)\s*CHANNEL_SUFFIX="-dev"/, 'DEV -> "-dev"'],
    [/STAGING\)\s*CHANNEL_SUFFIX="-staging"/, 'STAGING -> "-staging"'],
    [/PROD\)\s*CHANNEL_SUFFIX=""/, 'PROD -> "" (bare)'],
  ];
  for (const [pattern, description] of requiredChannelLines) {
    if (!pattern.test(workflowText)) {
      problems.push(`${label}: missing the ADR 0081 Decision 1 channel-suffix case-branch for ${description}.`);
    }
  }

  if (!/environment '\$ENVIRONMENT'/.test(workflowText) && !/expected DEV, STAGING, or PROD/.test(workflowText)) {
    problems.push(`${label}: the channel case statement has no fallback branch refusing an unknown environment value.`);
  }

  const versionReadPattern = new RegExp(`node -p "require\\(${appPathExpr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\.version"`);
  if (!versionReadPattern.test(workflowText)) {
    problems.push(`${label}: no "node -p \\"require(${appPathExpr}).version\\"" read -- the version must be read from package.json, never hardcoded (ADR 0081 Decision 6).`);
  }

  if (!/echo "version_tag=\$\{VERSION_TAG\}" >> "\$GITHUB_OUTPUT"/.test(workflowText)) {
    problems.push(`${label}: the meta step never writes "version_tag" to $GITHUB_OUTPUT.`);
  }

  return problems;
}

/** The job's own `outputs:` block must re-expose `steps.meta.outputs.version_tag` (issue #1575's own "output the computed version tag from each builder job" requirement), matching the existing `sha_tag` output. */
function checkJobOutputsVersionTag(workflowText, { label }) {
  const problems = [];
  if (!/version_tag:\s*\$\{\{\s*steps\.meta\.outputs\.version_tag\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: job-level "outputs:" is missing "version_tag: \${{ steps.meta.outputs.version_tag }}".`);
  }
  return problems;
}

/**
 * PR #1577 review, RF-1 (blocker): the job-level `outputs:` block (checkJobOutputsVersionTag above)
 * makes `version_tag` visible *inside* the reusable workflow, but a caller (deployment-
 * orchestrator.yml) can only read `jobs.<job>.outputs.version_tag` once the reusable workflow's own
 * `on.workflow_call.outputs` block re-exports it too -- a distinct declaration, easy to add the
 * first (inner) one and forget the second (caller-facing) one, which is exactly what happened here:
 * `sha_tag` had both, `version_tag` only got the inner one. This check is the caller-facing half;
 * pattern deliberately requires the multi-line `version_tag:\n  value: ...` shape (not the inline
 * `version_tag: ${{ ... }}` job-output shape) so it can't be satisfied by the same line
 * checkJobOutputsVersionTag already found.
 */
function checkWorkflowCallOutputsVersionTag(workflowText, { label }) {
  const problems = [];
  const pattern = /version_tag:\s*\n\s*value:\s*\$\{\{\s*jobs\.build-and-push\.outputs\.version_tag\s*\}\}/;
  if (!pattern.test(workflowText)) {
    problems.push(`${label}: "on.workflow_call.outputs" is missing "version_tag: value: \${{ jobs.build-and-push.outputs.version_tag }}" -- the caller-visible output was never declared (RF-1, PR #1577 review), so a caller's "jobs.<this>.outputs.version_tag" resolves empty even though the inner job itself emits it.`);
  }
  return problems;
}

/**
 * PR #1577 review, RF-1: the other end of the same contract, checked from deployment-
 * orchestrator.yml's side -- each of its five `*_version_tag` outputs must read
 * `jobs.<job>.outputs.version_tag`, mirroring the pre-existing `*_sha_tag` outputs' shape.
 */
function checkOrchestratorVersionTagMapping(orchestratorText) {
  const problems = [];
  for (const [outputName, jobName] of ORCHESTRATOR_VERSION_TAG_OUTPUTS) {
    const pattern = new RegExp(`${outputName}:\\s*\\n\\s*value:\\s*\\$\\{\\{\\s*jobs\\.${jobName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.outputs\\.version_tag\\s*\\}\\}`);
    if (!pattern.test(orchestratorText)) {
      problems.push(`deployment-orchestrator.yml: missing "${outputName}: value: \${{ jobs.${jobName}.outputs.version_tag }}".`);
    }
  }
  return problems;
}

// #1588 (epic #1548 Wave 4, Phase 279): the five builder jobs deployment-orchestrator.yml calls,
// each must forward candidate_source_sha straight through -- the `publish` job (calling
// publish-platform.yml, which has no such input) is deliberately excluded here.
const ORCHESTRATOR_BUILDER_JOBS = Object.freeze([
  'dgfy-api', 'dgfy-migration-runner', 'frontend-ims', 'frontend-pos', 'frontend-storefront',
]);

/**
 * ADR 0081 Decision 8 (#1588): deployment-orchestrator.yml must both declare its own
 * `candidate_source_sha` workflow_call input and forward it, unchanged, into each of the five
 * builder jobs' own `with:` block -- checked per-job by counting occurrences of the pass-through
 * line rather than a single global count, so a job silently missing it isn't masked by another job
 * having it twice.
 */
function checkOrchestratorCandidateSourceShaWiring(orchestratorText) {
  const problems = [];

  if (!/candidate_source_sha:\s*\n(?:[^\n]*\n)*?\s*type:\s*string/.test(orchestratorText)) {
    problems.push('deployment-orchestrator.yml: "on.workflow_call.inputs" is missing a "candidate_source_sha" string input.');
  }

  const jobBlocks = orchestratorText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  for (const jobName of ORCHESTRATOR_BUILDER_JOBS) {
    const block = jobBlocks.find((chunk) => chunk.startsWith(`${jobName}:\n`));
    if (!block || !/candidate_source_sha:\s*\$\{\{\s*inputs\.candidate_source_sha\s*\}\}/.test(block)) {
      problems.push(`deployment-orchestrator.yml: job "${jobName}" does not forward "candidate_source_sha: \${{ inputs.candidate_source_sha }}" to its called workflow.`);
    }
  }

  return problems;
}

// #1610 (ADR 0081 Decision 8 amendment): unlike deployment-orchestrator.yml above (STAGING/DEV),
// deploy-main.yml (PROD) rebuilds every app on every dispatch regardless of what changed -- there
// is no bare X.Y.Z tag yet to skip rebuilding -- so a single shared candidate_source_sha would
// mislabel any app a staging repair didn't touch with the candidate's LATEST identity instead of
// the earlier one its STAGING image actually carries (scripts/check-promotion-candidate.js's
// resolveCandidateSourceShaByApp() is what resolves the correct value per app). Each job below
// reads its OWN grouped input instead; dgfy-api and dgfy-migration-runner share
// candidate_source_sha_api since build_api always rebuilds them together as one paired unit.
const DEPLOY_MAIN_FILE = '.github/workflows/deploy-main.yml';

const DEPLOY_MAIN_CANDIDATE_SOURCE_SHA_INPUTS = Object.freeze([
  'candidate_source_sha_api',
  'candidate_source_sha_frontend_ims',
  'candidate_source_sha_frontend_pos',
  'candidate_source_sha_frontend_storefront',
]);

const DEPLOY_MAIN_JOB_INPUT_NAMES = Object.freeze([
  ['dgfy-api', 'candidate_source_sha_api'],
  ['dgfy-migration-runner', 'candidate_source_sha_api'],
  ['frontend-ims-prod', 'candidate_source_sha_frontend_ims'],
  ['frontend-pos-prod', 'candidate_source_sha_frontend_pos'],
  ['frontend-storefront-prod', 'candidate_source_sha_frontend_storefront'],
]);

/**
 * ADR 0081 Decision 8 amendment (#1610): deploy-main.yml must declare all four per-app-group
 * `candidate_source_sha_*` workflow_dispatch inputs, and each of its five builder jobs (not
 * `publish`) must forward its own correctly-grouped one -- checked per-job, same shape as
 * checkOrchestratorCandidateSourceShaWiring above, so one job silently missing or misrouting its
 * input isn't masked by another job having the right one.
 */
function checkDeployMainCandidateSourceShaWiring(deployMainText) {
  const problems = [];

  for (const inputName of DEPLOY_MAIN_CANDIDATE_SOURCE_SHA_INPUTS) {
    const pattern = new RegExp(`${inputName}:\\s*\\n(?:[^\\n]*\\n)*?\\s*type:\\s*string`);
    if (!pattern.test(deployMainText)) {
      problems.push(`deploy-main.yml: "on.workflow_dispatch.inputs" is missing a "${inputName}" string input.`);
    }
  }

  const jobBlocks = deployMainText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  for (const [jobName, inputName] of DEPLOY_MAIN_JOB_INPUT_NAMES) {
    const block = jobBlocks.find((chunk) => chunk.startsWith(`${jobName}:\n`));
    const forwardPattern = new RegExp(`candidate_source_sha:\\s*\\$\\{\\{\\s*inputs\\.${inputName}\\s*\\}\\}`);
    if (!block || !forwardPattern.test(block)) {
      problems.push(`deploy-main.yml: job "${jobName}" does not forward "candidate_source_sha: \${{ inputs.${inputName} }}" to its called workflow.`);
    }
  }

  return problems;
}

/** The build-push step must bake APP_VERSION as a build-arg and reference the meta step's computed
 * labels output, and must expose its digest (id: build) for the immutability-guard step to retag. */
function checkBuildStepStamping(workflowText, { label }) {
  const problems = [];

  if (!/id:\s*build\b/.test(workflowText)) {
    problems.push(`${label}: the build-push step has no "id: build" -- the immutability-guard step needs "steps.build.outputs.digest".`);
  }

  if (!/build-args:\s*\|[\s\S]{0,200}?APP_VERSION=\$\{\{\s*steps\.meta\.outputs\.version_tag\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the build-push step's "build-args:" does not bake "APP_VERSION=\${{ steps.meta.outputs.version_tag }}" (ADR 0081 Decision 4).`);
  }

  // #1588 (epic #1548 Wave 4, Phase 279): labels are computed in the meta step's own bash (so a
  // blank candidate_source_sha input can cleanly omit its label line, see
  // checkMetaStepStampsCandidateLabel below) and referenced here, not inlined as a literal `|`
  // block the way build-args still is.
  if (!/labels:\s*\$\{\{\s*steps\.meta\.outputs\.labels\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the build-push step's "labels:" does not reference "\${{ steps.meta.outputs.labels }}" -- labels must be computed in the meta step, not inlined here (ADR 0081 Decision 3, Decision 8/#1588).`);
  }

  return problems;
}

/**
 * #1588 (epic #1548 Wave 4, Phase 279), ADR 0081 Decision 8: the meta step's bash must declare a
 * `candidate_source_sha` workflow_call input, read it into the meta step's own env, compute a
 * `labels` $GITHUB_OUTPUT heredoc carrying the unchanged revision/source/version lines plus a
 * conditional candidate-source-identity line, and never stamp that label unconditionally (an empty
 * input must omit the line entirely, not publish an empty label value).
 */
function checkMetaStepStampsCandidateLabel(workflowText, { label }) {
  const problems = [];

  if (!/candidate_source_sha:\s*\n(?:[^\n]*\n)*?\s*type:\s*string/.test(workflowText)) {
    problems.push(`${label}: "on.workflow_call.inputs" is missing a "candidate_source_sha" string input (ADR 0081 Decision 8).`);
  }

  if (!/CANDIDATE_SOURCE_SHA:\s*\$\{\{\s*inputs\.candidate_source_sha\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the meta step's "env:" is missing "CANDIDATE_SOURCE_SHA: \${{ inputs.candidate_source_sha }}".`);
  }

  if (!/labels<<LABELS_EOF/.test(workflowText) || !/echo "LABELS_EOF"/.test(workflowText)) {
    problems.push(`${label}: the meta step does not compute a "labels" \$GITHUB_OUTPUT heredoc (LABELS_EOF).`);
  }

  if (!/org\.opencontainers\.image\.version=\$\{VERSION_TAG\}/.test(workflowText)) {
    problems.push(`${label}: the labels heredoc does not stamp "org.opencontainers.image.version=\${VERSION_TAG}" (ADR 0081 Decision 3).`);
  }

  if (!/if \[ -n "\$\{CANDIDATE_SOURCE_SHA:-\}" \]; then\s*\n\s*echo "org\.dgfy-platform\.candidate-source-sha=\$\{CANDIDATE_SOURCE_SHA\}"/.test(workflowText)) {
    problems.push(`${label}: the labels heredoc does not conditionally stamp "org.dgfy-platform.candidate-source-sha" only when CANDIDATE_SOURCE_SHA is non-empty (ADR 0081 Decision 8) -- an unconditional stamp would publish an empty label on every DEV/ad-hoc build.`);
  }

  return problems;
}

/** A step must exist that runs the tag-immutability guard script, wired to this build's digest, tag, and revision (ADR 0081 Decision 7, the ADR's one [binding] clause). */
function checkImmutabilityGuardStep(workflowText, { label }) {
  const problems = [];
  const guardCallPattern = /node scripts\/check-tag-immutability\.js/;
  if (!guardCallPattern.test(workflowText)) {
    problems.push(`${label}: no step calls "node scripts/check-tag-immutability.js" -- ADR 0081 Decision 7's tag-immutability guard is missing.`);
    return problems;
  }

  const requiredFlags = [
    [/--tag "\$\{\{\s*steps\.meta\.outputs\.version_tag\s*\}\}"/, '--tag wired to steps.meta.outputs.version_tag'],
    [/--revision "\$\{\{\s*github\.sha\s*\}\}"/, '--revision wired to github.sha'],
    [/--digest "\$\{\{\s*steps\.build\.outputs\.digest\s*\}\}"/, '--digest wired to steps.build.outputs.digest'],
  ];
  for (const [pattern, description] of requiredFlags) {
    if (!pattern.test(workflowText)) {
      problems.push(`${label}: the tag-immutability guard call is missing ${description}.`);
    }
  }

  return problems;
}

/** Every Dockerfile must accept and expose APP_VERSION (ADR 0081 Decision 4) -- ARG to accept the build-arg, ENV to make it readable inside the running container. */
function checkDockerfileAcceptsAppVersion(dockerfileText, { label }) {
  const problems = [];
  if (!/^ARG APP_VERSION=/m.test(dockerfileText)) {
    problems.push(`${label}: no "ARG APP_VERSION=..." declaration -- the build-arg is never accepted.`);
  }
  if (!/^ENV APP_VERSION=\$\{?APP_VERSION\}?/m.test(dockerfileText)) {
    problems.push(`${label}: no "ENV APP_VERSION=\${APP_VERSION}" -- the value is accepted but never exposed to the running container.`);
  }
  return problems;
}

function runAllChecks({ readFile = read } = {}) {
  const problems = [];

  for (const { file, label, appPathExpr } of BUILDER_WORKFLOWS) {
    const text = readFile(file);
    problems.push(...checkVersionTagComputation(text, { label, appPathExpr }));
    problems.push(...checkJobOutputsVersionTag(text, { label }));
    problems.push(...checkWorkflowCallOutputsVersionTag(text, { label }));
    problems.push(...checkBuildStepStamping(text, { label }));
    problems.push(...checkMetaStepStampsCandidateLabel(text, { label }));
    problems.push(...checkImmutabilityGuardStep(text, { label }));
  }

  for (const file of DOCKERFILES) {
    const text = readFile(file);
    problems.push(...checkDockerfileAcceptsAppVersion(text, { label: file }));
  }

  const orchestratorText = readFile(ORCHESTRATOR_FILE);
  problems.push(...checkOrchestratorVersionTagMapping(orchestratorText));
  problems.push(...checkOrchestratorCandidateSourceShaWiring(orchestratorText));

  const deployMainText = readFile(DEPLOY_MAIN_FILE);
  problems.push(...checkDeployMainCandidateSourceShaWiring(deployMainText));

  return problems;
}

function main() {
  const problems = runAllChecks();
  if (problems.length > 0) {
    console.error('[check-deploy-version-stamping-workflow] FAIL:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('[check-deploy-version-stamping-workflow] PASS -- all three builder workflows and five Dockerfiles carry the ADR 0081 version-stamping shape.');
}

if (require.main === module) {
  main();
}

module.exports = {
  BUILDER_WORKFLOWS,
  DOCKERFILES,
  ORCHESTRATOR_FILE,
  ORCHESTRATOR_VERSION_TAG_OUTPUTS,
  ORCHESTRATOR_BUILDER_JOBS,
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
  DEPLOY_MAIN_FILE,
  DEPLOY_MAIN_CANDIDATE_SOURCE_SHA_INPUTS,
  DEPLOY_MAIN_JOB_INPUT_NAMES,
  runAllChecks,
};
