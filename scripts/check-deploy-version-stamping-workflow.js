#!/usr/bin/env node
/**
 * Workflow-shape check for #1575 (epic #1548 Wave 3, Phase 277) -- asserts deploy-api.yml,
 * deploy-migration-runner.yml, and deploy-frontend.yml each compute and emit the ADR 0081
 * `X.Y.Z[-channel]` version tag, stamp the `org.opencontainers.image.version` label, bake
 * `APP_VERSION` as a build-arg, and run the tag-immutability guard (Decision 7) -- plus that all
 * all seven Dockerfiles accept and expose `APP_VERSION`. Regex/text assertions against the real files,
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
  'infrastructure/docker/dgfy-opis/Dockerfile',
  'infrastructure/docker/dgfy-admin/Dockerfile',
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
  ['frontend_opis_version_tag', 'frontend-opis'],
  ['frontend_admin_version_tag', 'frontend-admin'],
  ['dgfy_api_version_tag', 'dgfy-api'],
  ['migration_runner_version_tag', 'dgfy-migration-runner'],
]);

/**
 * The "Compute image tags" (`id: meta`) step must: resolve the revision-aware version tag via
 * the central `scripts/resolve-release-tags.js` (#1977, Phase 342 -- app type and environment
 * cannot drift between workflows because only the resolver maps them to tags), read the app's
 * package.json version (Decision 6 -- this step only ever reads it), and emit `version_tag`
 * (plus `release_floor`/`release_revision`) to $GITHUB_OUTPUT. No channel suffix may be
 * derived inline here anymore -- that mapping lives in the resolver, not in workflow bash.
 */
function checkVersionTagComputation(workflowText, { label, appPathExpr }) {
  const problems = [];

  if (!/id:\s*meta/.test(workflowText)) {
    problems.push(`${label}: no "id: meta" step found -- expected the existing "Compute image tags" step.`);
    return problems;
  }

  if (!/node scripts\/resolve-release-tags\.js/.test(workflowText)) {
    problems.push(`${label}: the meta step does not call "node scripts/resolve-release-tags.js" -- tags must be resolved centrally (#1977), not derived inline per workflow.`);
  } else {
    if (!/--app\s/.test(workflowText)) {
      problems.push(`${label}: the resolve-release-tags.js call has no "--app" argument -- the resolver must know the app type to select the matrix column (#1977).`);
    }
    if (!/--environment\s/.test(workflowText)) {
      problems.push(`${label}: the resolve-release-tags.js call has no "--environment" argument -- the resolver must know the environment to select the matrix column (#1977).`);
    }
  }

  if (/CHANNEL_SUFFIX="-dev"|CHANNEL_SUFFIX="-staging"|CHANNEL_SUFFIX=""/.test(workflowText)) {
    problems.push(`${label}: the meta step still derives a CHANNEL_SUFFIX inline -- channel/revision mapping lives in scripts/resolve-release-tags.js now, not in workflow bash (#1977).`);
  }

  const versionReadPattern = /node -p/.test(workflowText) && workflowText.includes(appPathExpr) && /\.version/.test(workflowText);
  if (!versionReadPattern) {
    problems.push(`${label}: no "node -p \\"require(${appPathExpr}).version\\"" read -- the version must be read from package.json, never hardcoded (ADR 0081 Decision 6).`);
  }

  if (!/echo "version_tag=\$\{VERSION_TAG\}" >> "\$GITHUB_OUTPUT"/.test(workflowText)) {
    problems.push(`${label}: the meta step never writes "version_tag" to $GITHUB_OUTPUT.`);
  }

  return problems;
}

/**
 * #1977 (Phase 342): each builder must declare the optional `release_revision`
 * workflow_call input and map it into the meta step's env (RELEASE_RELEASE_REVISION flow:
 * `RELEASE_REVISION: ${{ inputs.release_revision }}`) -- the resolver call consumes it from
 * there, and STAGING/PROD fail closed when it is missing.
 */
function checkReleaseRevisionInput(workflowText, { label }) {
  const problems = [];

  if (!/release_revision:\s*\n(?:[^\n]*\n)*?\s*type:\s*string/.test(workflowText)) {
    problems.push(`${label}: "on.workflow_call.inputs" is missing a "release_revision" string input (#1977).`);
  }

  if (!/RELEASE_REVISION:\s*\$\{\{\s*inputs\.release_revision\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the meta step's "env:" is missing "RELEASE_REVISION: \${{ inputs.release_revision }}" (#1977).`);
  }

  for (const output of ['release_floor', 'release_revision']) {
    const pattern = new RegExp(`${output}:\\s*\\$\\{\\{\\s*steps\\.meta\\.outputs\\.${output}\\s*\\}\\}`);
    if (!pattern.test(workflowText)) {
      problems.push(`${label}: job-level "outputs:" is missing "${output}: \${{ steps.meta.outputs.${output} }}" -- the alias promotion and runtime stamping read these (#1977).`);
    }
  }

  return problems;
}

/**
 * #1977 (Phase 342): the labels heredoc must stamp `org.dgfy-platform.release-floor`
 * unconditionally (runtime consumers must not infer the floor from an alias) and
 * `org.dgfy-platform.release-revision` conditionally (DEV/ad-hoc builds carry no revision --
 * same omit-when-empty rule the candidate-source-sha label already follows).
 */
function checkMetaStepStampsFloorRevisionLabels(workflowText, { label }) {
  const problems = [];

  if (!/org\.dgfy-platform\.release-floor=\$\{RELEASE_FLOOR\}/.test(workflowText)) {
    problems.push(`${label}: the labels heredoc does not stamp "org.dgfy-platform.release-floor=\${RELEASE_FLOOR}" unconditionally (#1977).`);
  }

  if (!/if \[ -n "\$\{RELEASE_REVISION_OUT:-\}" \]; then\s*\n\s*echo "org\.dgfy-platform\.release-revision=\$\{RELEASE_REVISION_OUT\}"/.test(workflowText)) {
    problems.push(`${label}: the labels heredoc does not conditionally stamp "org.dgfy-platform.release-revision" only when the build carries a revision (#1977) -- an unconditional stamp would publish an empty label on every DEV/ad-hoc build.`);
  }

  return problems;
}

/**
 * #1977 (Phase 342): the build-push step must bake APP_RELEASE_FLOOR and
 * APP_RELEASE_REVISION as build-args (alongside the existing APP_VERSION), so the
 * Dockerfiles can expose them to the running container without re-deriving anything.
 */
function checkBuildStepFloorBuildArgs(workflowText, { label }) {
  const problems = [];

  if (!/APP_RELEASE_FLOOR=\$\{\{\s*steps\.meta\.outputs\.release_floor\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the build-push step's "build-args:" does not bake "APP_RELEASE_FLOOR=\${{ steps.meta.outputs.release_floor }}" (#1977).`);
  }
  if (!/APP_RELEASE_REVISION=\$\{\{\s*steps\.meta\.outputs\.release_revision\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the build-push step's "build-args:" does not bake "APP_RELEASE_REVISION=\${{ steps.meta.outputs.release_revision }}" (#1977).`);
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

// #1588 (epic #1548 Wave 4, Phase 279): the builder jobs deployment-orchestrator.yml calls,
// each must forward candidate_source_sha straight through -- the `publish` job (calling
// publish-platform.yml, which has no such input) is deliberately excluded here.
const ORCHESTRATOR_BUILDER_JOBS = Object.freeze([
  'dgfy-api', 'dgfy-migration-runner', 'frontend-ims', 'frontend-pos', 'frontend-storefront',
  'frontend-opis', 'frontend-admin',
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

/**
 * #2055 (Phase 346): deployment-orchestrator.yml declares the four per-app-group
 * `release_revision_*` workflow_call inputs (one for each backend, one per frontend),
 * and each of its five builder jobs forwards its own app's STAGING revision out of the
 * resolve-build-plan job's `revisions_json` map -- checked
 * per-job, same shape as checkOrchestratorCandidateSourceShaWiring, so one job silently
 * missing or misrouting its revision isn't masked by another job having the right one.
 * The single candidate-wide `release_revision` input this replaces no longer exists.
 */
const ORCHESTRATOR_RELEASE_REVISION_INPUTS = Object.freeze([
  'release_revision_api',
  'release_revision_migration_runner',
  'release_revision_frontend_ims',
  'release_revision_frontend_pos',
  'release_revision_frontend_storefront',
  'release_revision_frontend_opis',
  'release_revision_frontend_admin',
]);

const ORCHESTRATOR_JOB_REVISION_KEYS = Object.freeze([
  ['dgfy-api', 'dgfy-api'],
  ['dgfy-migration-runner', 'dgfy-migration-runner'],
  ['frontend-ims', 'dgfy-ims'],
  ['frontend-pos', 'dgfy-pos'],
  ['frontend-storefront', 'dgfy-storefront'],
  ['frontend-opis', 'dgfy-opis'],
  ['frontend-admin', 'dgfy-admin'],
]);

function checkOrchestratorReleaseRevisionWiring(orchestratorText) {
  const problems = [];

  for (const inputName of ORCHESTRATOR_RELEASE_REVISION_INPUTS) {
    const pattern = new RegExp(`${inputName}:\\s*\\n(?:[^\\n]*\\n)*?\\s*type:\\s*string`);
    if (!pattern.test(orchestratorText)) {
      problems.push(`deployment-orchestrator.yml: "on.workflow_call.inputs" is missing a "${inputName}" string input (#2055).`);
    }
  }
  // The old candidate-wide input must be gone from the orchestrator -- builders still
  // declare their own per-app `release_revision` (checked separately), but the fan-out
  // layer only speaks per-app-group now. (Matches the multi-line input-declaration shape,
  // not the single-line `with:` forwarding lines, which never carry `type: string`.)
  if (/(^|\n)\s*release_revision:\s*\n(?:[^\n]*\n)*?\s*type:\s*string/.test(orchestratorText)) {
    problems.push('deployment-orchestrator.yml: still declares the old candidate-wide "release_revision" input -- revisions are per-app-group now (#2055).');
  }

  const jobBlocks = orchestratorText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  for (const [jobName, revisionKey] of ORCHESTRATOR_JOB_REVISION_KEYS) {
    const block = jobBlocks.find((chunk) => chunk.startsWith(`${jobName}:\n`));
    const forwardPattern = new RegExp(`release_revision:\\s*\\$\\{\\{\\s*fromJSON\\(needs\\.resolve-build-plan\\.outputs\\.revisions_json\\)\\.${revisionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`);
    if (!block || !forwardPattern.test(block)) {
      problems.push(`deployment-orchestrator.yml: job "${jobName}" does not forward "release_revision: \${{ fromJSON(needs.resolve-build-plan.outputs.revisions_json).${revisionKey} }}" to its called workflow (#2055).`);
    }
  }

  if (!/id:\s*revisions/.test(orchestratorText) || !/echo \"revisions_json=\{\}\" >> \"\$GITHUB_OUTPUT\"/.test(orchestratorText)) {
    problems.push('deployment-orchestrator.yml: DEV must produce an empty release revision map; DEV artifacts have no SemVer floor or rN (#2071).');
  }

  const skipStepRegion = /- name: Resolve build-skip plan[\s\S]*?node scripts\/resolve-build-skip-plan\.js[^\n]*/.exec(orchestratorText);
  if (!skipStepRegion || !/--release-revisions-json/.test(skipStepRegion[0])) {
    problems.push('deployment-orchestrator.yml: the resolve-build-plan step does not pass "--release-revisions-json" -- the skip check would inspect legacy tags instead of each app\'s own revision-aware matrix tag (#2055).');
  }
  if (!/RELEASE_REVISION_MIGRATION_RUNNER:\s*\$\{\{\s*inputs\.release_revision_migration_runner\s*\}\}/.test(orchestratorText)
    || !/put\('dgfy-migration-runner',process\.env\.RELEASE_REVISION_MIGRATION_RUNNER\)/.test(orchestratorText)
    || !/must select dgfy-api and dgfy-migration-runner artifact revisions together/.test(orchestratorText)) {
    problems.push('deployment-orchestrator.yml: migration-runner revision must have its own input, map entry, and paired-selection guard (#2186).');
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
  'candidate_source_sha_frontend_opis',
  'candidate_source_sha_frontend_admin',
]);

const DEPLOY_MAIN_JOB_INPUT_NAMES = Object.freeze([
  ['dgfy-api', 'candidate_source_sha_api'],
  ['dgfy-migration-runner', 'candidate_source_sha_api'],
  ['frontend-ims-prod', 'candidate_source_sha_frontend_ims'],
  ['frontend-pos-prod', 'candidate_source_sha_frontend_pos'],
  ['frontend-storefront-prod', 'candidate_source_sha_frontend_storefront'],
  ['frontend-opis-prod', 'candidate_source_sha_frontend_opis'],
  ['frontend-admin-prod', 'candidate_source_sha_frontend_admin'],
]);

/**
 * ADR 0081 Decision 8 amendment (#1610): deploy-main.yml must declare all six per-app-group
 * `candidate_source_sha_*` workflow_dispatch inputs, and each of its six builder jobs (not
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

/**
 * #2055 (Phase 346): deploy-main.yml declares the four per-app-group `release_revision_*`
 * workflow_dispatch inputs (same grouping as its candidate_source_sha_* inputs -- api covers
 * both backends), forwards each of its five builder jobs' own grouped one, threads the map
 * into the resolve-build-plan step (`--release-revisions-json`, so the skip check hits each
 * app's own revision-aware matrix tag), and runs the `promote-aliases` job that creates each
 * app's bare floor alias from its own revision-tag digest.
 */
const DEPLOY_MAIN_RELEASE_REVISION_INPUTS = Object.freeze([
  'release_revision_api',
  'release_revision_migration_runner',
  'release_revision_frontend_ims',
  'release_revision_frontend_pos',
  'release_revision_frontend_storefront',
  'release_revision_frontend_opis',
  'release_revision_frontend_admin',
]);

const DEPLOY_MAIN_JOB_RELEASE_REVISION_INPUT_NAMES = Object.freeze([
  ['dgfy-api', 'release_revision_api'],
  ['dgfy-migration-runner', 'release_revision_migration_runner'],
  ['frontend-ims-prod', 'release_revision_frontend_ims'],
  ['frontend-pos-prod', 'release_revision_frontend_pos'],
  ['frontend-storefront-prod', 'release_revision_frontend_storefront'],
  ['frontend-opis-prod', 'release_revision_frontend_opis'],
  ['frontend-admin-prod', 'release_revision_frontend_admin'],
]);

function checkDeployMainReleaseRevisionWiring(deployMainText) {
  const problems = [];

  for (const inputName of DEPLOY_MAIN_RELEASE_REVISION_INPUTS) {
    const pattern = new RegExp(`${inputName}:\\s*\\n(?:[^\\n]*\\n)*?\\s*type:\\s*string`);
    if (!pattern.test(deployMainText)) {
      problems.push(`deploy-main.yml: "on.workflow_dispatch.inputs" is missing a "${inputName}" string input (#2055).`);
    }
  }

  const jobBlocks = deployMainText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  for (const [jobName, inputName] of DEPLOY_MAIN_JOB_RELEASE_REVISION_INPUT_NAMES) {
    const block = jobBlocks.find((chunk) => chunk.startsWith(`${jobName}:\n`));
    const forwardPattern = new RegExp(`release_revision:\\s*\\$\\{\\{\\s*inputs\\.${inputName}\\s*\\}\\}`);
    if (!block || !forwardPattern.test(block)) {
      problems.push(`deploy-main.yml: job "${jobName}" does not forward "release_revision: \${{ inputs.${inputName} }}" to its called workflow (#2055).`);
    }
  }

  // The flag is assembled into SKIP_ARGS on its own line (conditional on a non-empty map),
  // so match within the step region rather than on a single invocation line.
  const skipStepRegion = /- name: Resolve build-skip plan[\s\S]*?node scripts\/resolve-build-skip-plan\.js[^\n]*/.exec(deployMainText);
  if (!skipStepRegion || !/--release-revisions-json/.test(skipStepRegion[0])) {
    problems.push('deploy-main.yml: the resolve-build-plan step does not pass "--release-revisions-json" -- the skip check would hit legacy tags instead of each app\'s own revision-aware matrix tag (#2055).');
  }
  if (!skipStepRegion || !/--environment\s+PROD/.test(skipStepRegion[0])) {
    problems.push('deploy-main.yml: the resolve-build-plan step does not pass "--environment PROD" -- revision-aware PROD tags cannot be resolved without the explicit environment (#1977).');
  }
  if (!/MIGRATION_R:\s*\$\{\{\s*inputs\.release_revision_migration_runner\s*\}\}/.test(deployMainText)
    || !/put\('dgfy-migration-runner',process\.env\.MIGRATION_R\)/.test(deployMainText)
    || !/must select dgfy-api and dgfy-migration-runner artifact revisions together/.test(deployMainText)) {
    problems.push('deploy-main.yml: migration-runner revision must have its own input, build-skip map entry, and paired-selection guard (#2186).');
  }

  if (!/promote-aliases:\s*\n/.test(deployMainText)) {
    problems.push('deploy-main.yml: no "promote-aliases" job found -- every PROD revision tag needs its bare floor alias from the same digest (#1977).');
  } else {
    const block = jobBlocks.find((chunk) => chunk.startsWith('promote-aliases:\n'));
    if (!block || !/node scripts\/promote-image-alias\.js/.test(block)) {
      problems.push('deploy-main.yml: the "promote-aliases" job does not call "node scripts/promote-image-alias.js" -- aliases must be created digest-side with mismatch refusal (#1977).');
    }
    if (!block || !/node scripts\/resolve-release-tags\.js/.test(block)) {
      problems.push('deploy-main.yml: the "promote-aliases" job does not resolve tags via "node scripts/resolve-release-tags.js" -- alias sources/targets must come from the central resolver (#1977).');
    }
    if (!block || !/dgfy-migration-runner\) APP_REVISION="\$\{\{ inputs\.release_revision_migration_runner \}\}"/.test(block)) {
      problems.push('deploy-main.yml: promote-aliases must route dgfy-migration-runner through its own release revision input (#2186).');
    }
    // #2186: each image, including both backend images, reads its own input.
    for (const inputName of DEPLOY_MAIN_RELEASE_REVISION_INPUTS) {
      const pattern = new RegExp(`\\$\\{\\{\\s*inputs\\.${inputName}\\s*\\}\\}`);
      if (!pattern.test(block)) {
        problems.push(`deploy-main.yml: the "promote-aliases" job never reads "\${{ inputs.${inputName} }}" -- each app-group aliases its own allocated revision (#2055).`);
      }
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

// #1610 (ADR 0081 Decision 7 residue): each of deploy-main.yml's six builder jobs must gate its
// `if:` on its OWN `should_build_<app>` output from the new `resolve-build-plan` job -- keyed by
// job name here (not app name) since `frontend-ims-prod` etc. don't share their job name with the
// app-keyed output name the way `dgfy-api`/`dgfy-migration-runner` do.
const DEPLOY_MAIN_BUILD_SKIP_OUTPUT_NAMES = Object.freeze([
  ['dgfy-api', 'should_build_dgfy_api'],
  ['dgfy-migration-runner', 'should_build_dgfy_migration_runner'],
  ['frontend-ims-prod', 'should_build_dgfy_ims'],
  ['frontend-pos-prod', 'should_build_dgfy_pos'],
  ['frontend-storefront-prod', 'should_build_dgfy_storefront'],
  ['frontend-opis-prod', 'should_build_dgfy_opis'],
  ['frontend-admin-prod', 'should_build_dgfy_admin'],
]);

/**
 * ADR 0081 Decision 7 residue (#1610): deploy-main.yml must declare a `resolve-build-plan` job
 * (`needs: guard-branch`), and each of its six builder jobs must both list "resolve-build-plan" in
 * its own `needs:` array AND reference its own `should_build_<app>` output in its `if:` --
 * referencing `needs.resolve-build-plan` in a job's `if:` without also listing it in that job's own
 * `needs:` silently evaluates to empty in GitHub Actions (a parse-time gap, not a runtime failure),
 * so both halves are checked independently, same shape as checkDeployMainCandidateSourceShaWiring
 * above.
 */
function checkDeployMainBuildSkipPlanJob(deployMainText) {
  const problems = [];

  if (!/resolve-build-plan:\s*\n\s*needs:\s*guard-branch/.test(deployMainText)) {
    problems.push('deploy-main.yml: no "resolve-build-plan" job found with "needs: guard-branch".');
  }

  const jobBlocks = deployMainText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  for (const [jobName, outputName] of DEPLOY_MAIN_BUILD_SKIP_OUTPUT_NAMES) {
    const block = jobBlocks.find((chunk) => chunk.startsWith(`${jobName}:\n`));
    if (!block) {
      problems.push(`deploy-main.yml: job "${jobName}" not found.`);
      continue;
    }
    if (!/needs:\s*\[\s*guard-branch\s*,\s*resolve-build-plan\s*\]/.test(block)) {
      problems.push(`deploy-main.yml: job "${jobName}" does not list "[ guard-branch, resolve-build-plan ]" in its "needs:".`);
    }
    const outputPattern = new RegExp(`needs\\.resolve-build-plan\\.outputs\\.${outputName}\\s*==\\s*'true'`);
    if (!outputPattern.test(block)) {
      problems.push(`deploy-main.yml: job "${jobName}" does not gate its "if:" on "needs.resolve-build-plan.outputs.${outputName} == 'true'" (#1610).`);
    }
  }

  return problems;
}

/**
 * #1610: `publish`'s `needs:` must be extended with "guard-branch" and "resolve-build-plan" (both
 * referenced in its own `if:`), and its `if:` must no longer require "at least one build actually
 * succeeded" -- that clause could never be satisfied by a legitimate "every app is skip-eligible"
 * dispatch (every build job 'skipped', none 'success'), which is exactly the case #1610's own
 * acceptance criterion names. See deploy-main.yml's own `publish` job comment for the full argument.
 */
function checkDeployMainPublishGate(deployMainText) {
  const problems = [];

  const jobBlocks = deployMainText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  const block = jobBlocks.find((chunk) => chunk.startsWith('publish:\n'));
  if (!block) {
    problems.push('deploy-main.yml: "publish" job not found.');
    return problems;
  }

  problems.push(...checkPairedBackendPublishGate(deployMainText, 'deploy-main.yml', 'publish'));
  problems.push(...checkPairedBackendPublishGate(deployMainText, 'deploy-main.yml', 'promote-aliases'));

  if (!/needs:\s*\[\s*guard-branch\s*,\s*resolve-build-plan\s*,/.test(block)) {
    problems.push('deploy-main.yml: "publish" job\'s "needs:" does not start with "[ guard-branch, resolve-build-plan, ..." (#1610).');
  }

  if (!/needs\.guard-branch\.result == 'success'/.test(block)) {
    problems.push('deploy-main.yml: "publish" job\'s "if:" does not require "needs.guard-branch.result == \'success\'" (#1610).');
  }
  if (!/needs\.resolve-build-plan\.result == 'success'/.test(block)) {
    problems.push('deploy-main.yml: "publish" job\'s "if:" does not require "needs.resolve-build-plan.result == \'success\'" (#1610).');
  }

  if (/\.result == 'success' \|\|/.test(block)) {
    problems.push('deploy-main.yml: "publish" job\'s "if:" still contains an "at least one build succeeded" OR-clause -- #1610 requires dropping it so a legitimate "every app skip-eligible" dispatch can still publish.');
  }

  // #1977 (Phase 342): publish must wait on the promote-aliases job -- a failed alias
  // promotion (refused overwrite, missing source) must block the PROD deploy, since the
  // floor alias is part of the production contract. `!= 'failure'` (not `== 'success'`) so
  // a legacy no-revision dispatch, where promote-aliases legitimately skips, still publishes.
  if (!/promote-aliases/.test(block)) {
    problems.push('deploy-main.yml: "publish" job does not reference the "promote-aliases" job at all -- a failed floor-alias promotion must block the PROD deploy (#1977).');
  } else {
    if (!/needs\.promote-aliases\.result != 'failure'/.test(block)) {
      problems.push('deploy-main.yml: "publish" job\'s "if:" does not require "needs.promote-aliases.result != \'failure\'" -- a refused alias overwrite would otherwise deploy silently (#1977).');
    }
  }

  return problems;
}

/** OPIS and Platform Admin must participate in both production gates: aliases must wait for
 * each image and refuse failures/cancellations, and publish must do the same before updating. */
function checkDeployMainOpisPublishGates(deployMainText) {
  const problems = [];
  const jobBlocks = deployMainText.split(/\n  (?=[a-z][a-z-]*:\n)/);

  for (const [surface, job] of [['OPIS', 'frontend-opis-prod'], ['Platform Admin', 'frontend-admin-prod']]) {
    for (const jobName of ['promote-aliases', 'publish']) {
      const block = jobBlocks.find((chunk) => chunk.startsWith(`${jobName}:\n`));
      if (!block) {
        problems.push(`deploy-main.yml: no "${jobName}" job found for ${surface} production gating.`);
        continue;
      }

      const needs = /needs:\s*\[([^\]]*)\]/.exec(block)?.[1] ?? '';
      if (!new RegExp(`(^|,)\\s*${job}\\s*(,|$)`).test(needs)) {
        problems.push(`deploy-main.yml: "${jobName}" job must list "${job}" in needs: so ${surface} build results gate production.`);
      }
      for (const result of ['failure', 'cancelled']) {
        if (!new RegExp(`needs\\.${job}\\.result != '${result}'`).test(block)) {
          problems.push(`deploy-main.yml: "${jobName}" job must require "needs.${job}.result != '${result}'" to fail closed.`);
        }
      }
    }
  }

  const aliasBlock = jobBlocks.find((chunk) => chunk.startsWith('promote-aliases:\n'));
  if (aliasBlock && !/inputs\.release_revision_frontend_opis\s*!=\s*''/.test(aliasBlock)) {
    problems.push('deploy-main.yml: promote-aliases must run when "inputs.release_revision_frontend_opis" is supplied, including an OPIS-only revision dispatch.');
  }
  if (aliasBlock && !/inputs\.release_revision_frontend_admin\s*!=\s*''/.test(aliasBlock)) {
    problems.push('deploy-main.yml: promote-aliases must run when "inputs.release_revision_frontend_admin" is supplied, including an Admin-only revision dispatch.');
  }

  return problems;
}

/**
 * A paired backend operation may accept `skipped` for an explicitly unselected or
 * content-equivalent image, but must reject either backend's failed or cancelled result.
 * Requiring `success` here would break safe reuse; ignoring `cancelled` could deploy a
 * partially published pair.
 */
function checkPairedBackendPublishGate(workflowText, label, jobName) {
  const problems = [];
  const jobBlocks = workflowText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  const block = jobBlocks.find((chunk) => chunk.startsWith(`${jobName}:\n`));
  if (!block) {
    if (jobName !== 'promote-aliases') problems.push(`${label}: "${jobName}" job not found for paired backend result gating.`);
    return problems;
  }
  for (const backendJob of ['dgfy-api', 'dgfy-migration-runner']) {
    for (const terminalState of ['failure', 'cancelled']) {
      if (!new RegExp(`needs\\.${backendJob}\\.result != '${terminalState}'`).test(block)) {
        problems.push(`${label}: "${jobName}" does not reject ${backendJob} result '${terminalState}' -- both paired backend images must complete or be safely skipped before deploy.`);
      }
    }
    if (new RegExp(`needs\\.${backendJob}\\.result == 'success'`).test(block)) {
      problems.push(`${label}: "${jobName}" requires ${backendJob} to be 'success' instead of accepting an approved skip/reuse result.`);
    }
  }
  return problems;
}

function checkDeployDispatchReleaseRevisionWiring(deployText) {
  const problems = [];
  if (!/release_revision_migration_runner:\s*\n(?:[^\n]*\n)*?\s*type:\s*string/.test(deployText)) {
    problems.push('deploy.yml: workflow_dispatch is missing the release_revision_migration_runner string input (#2186).');
  }
  const jobBlocks = deployText.split(/\n  (?=[a-z][a-z-]*:\n)/);
  const block = jobBlocks.find((chunk) => chunk.startsWith('build-and-push:\n'));
  if (!block || !/release_revision_migration_runner:\s*\$\{\{\s*inputs\.release_revision_migration_runner\s*\}\}/.test(block)) {
    problems.push('deploy.yml: build-and-push does not forward release_revision_migration_runner to deployment-orchestrator.yml (#2186).');
  }
  return problems;
}

function checkOrchestratorPairedPublishGate(orchestratorText) {
  return checkPairedBackendPublishGate(orchestratorText, 'deployment-orchestrator.yml', 'publish');
}

/** #2071: DEV's resolver path is versionless and does not need a branch suffix or revision. */
function checkVersionlessDevResolver(workflowText, { label }) {
  const problems = [];
  if (!/--environment DEV/.test(workflowText)) {
    problems.push(`${label}: DEV must resolve directly to the versionless \"dev\" tag without reading a package floor or revision (#2071).`);
  }
  if (/dev_pr_ref|DEV_PR_REF|--pr-ref/.test(workflowText)) {
    problems.push(`${label}: obsolete branch-specific DEV tag inputs must be removed (#2071).`);
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

/**
 * #1977 (Phase 342): every Dockerfile must accept and expose APP_RELEASE_FLOOR and
 * APP_RELEASE_REVISION (same ARG/ENV shape as APP_VERSION above) -- the release floor and
 * revision travel as explicit metadata so runtime consumers never infer the floor from an
 * alias. Frontend Dockerfiles additionally map them into VITE_APP_RELEASE_FLOOR/
 * VITE_APP_RELEASE_REVISION for the build-stamp plugin; that mapping is covered by the
 * frontend build, not by this text check.
 */
function checkDockerfileAcceptsReleaseFloorRevision(dockerfileText, { label }) {
  const problems = [];
  if (!/^ARG APP_RELEASE_FLOOR=/m.test(dockerfileText)) {
    problems.push(`${label}: no "ARG APP_RELEASE_FLOOR=..." declaration -- the release-floor build-arg is never accepted (#1977).`);
  }
  if (!/^ENV APP_RELEASE_FLOOR=\$\{?APP_RELEASE_FLOOR\}?/m.test(dockerfileText)) {
    problems.push(`${label}: no "ENV APP_RELEASE_FLOOR=\${APP_RELEASE_FLOOR}" -- the floor is accepted but never exposed to the running container (#1977).`);
  }
  if (!/^ARG APP_RELEASE_REVISION=/m.test(dockerfileText)) {
    problems.push(`${label}: no "ARG APP_RELEASE_REVISION=..." declaration -- the release-revision build-arg is never accepted (#1977).`);
  }
  if (!/^ENV APP_RELEASE_REVISION=\$\{?APP_RELEASE_REVISION\}?/m.test(dockerfileText)) {
    problems.push(`${label}: no "ENV APP_RELEASE_REVISION=\${APP_RELEASE_REVISION}" -- the revision is accepted but never exposed to the running container (#1977).`);
  }
  return problems;
}

function runAllChecks({ readFile = read } = {}) {
  const problems = [];

  for (const { file, label, appPathExpr } of BUILDER_WORKFLOWS) {
    const text = readFile(file);
    problems.push(...checkVersionTagComputation(text, { label, appPathExpr }));
    problems.push(...checkReleaseRevisionInput(text, { label }));
    problems.push(...checkVersionlessDevResolver(text, { label }));
    problems.push(...checkJobOutputsVersionTag(text, { label }));
    problems.push(...checkWorkflowCallOutputsVersionTag(text, { label }));
    problems.push(...checkBuildStepStamping(text, { label }));
    problems.push(...checkBuildStepFloorBuildArgs(text, { label }));
    problems.push(...checkMetaStepStampsCandidateLabel(text, { label }));
    problems.push(...checkMetaStepStampsFloorRevisionLabels(text, { label }));
    problems.push(...checkImmutabilityGuardStep(text, { label }));
  }

  for (const file of DOCKERFILES) {
    const text = readFile(file);
    problems.push(...checkDockerfileAcceptsAppVersion(text, { label: file }));
    problems.push(...checkDockerfileAcceptsReleaseFloorRevision(text, { label: file }));
  }

  const orchestratorText = readFile(ORCHESTRATOR_FILE);
  problems.push(...checkDeployDispatchReleaseRevisionWiring(readFile('.github/workflows/deploy.yml')));
  problems.push(...checkOrchestratorVersionTagMapping(orchestratorText));
  problems.push(...checkOrchestratorCandidateSourceShaWiring(orchestratorText));
  problems.push(...checkOrchestratorReleaseRevisionWiring(orchestratorText));
  problems.push(...checkOrchestratorPairedPublishGate(orchestratorText));

  const deployMainText = readFile(DEPLOY_MAIN_FILE);
  problems.push(...checkDeployMainCandidateSourceShaWiring(deployMainText));
  problems.push(...checkDeployMainReleaseRevisionWiring(deployMainText));
  problems.push(...checkDeployMainBuildSkipPlanJob(deployMainText));
  problems.push(...checkDeployMainPublishGate(deployMainText));
  problems.push(...checkDeployMainOpisPublishGates(deployMainText));

  return problems;
}

function main() {
  const problems = runAllChecks();
  if (problems.length > 0) {
    console.error('[check-deploy-version-stamping-workflow] FAIL:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`[check-deploy-version-stamping-workflow] PASS -- all three builder workflows and ${DOCKERFILES.length} Dockerfiles carry the ADR 0081 version-stamping shape (incl. the #1977 release-floor/revision contract).`);
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
  ORCHESTRATOR_RELEASE_REVISION_INPUTS,
  ORCHESTRATOR_JOB_REVISION_KEYS,
  checkVersionTagComputation,
  checkReleaseRevisionInput,
  checkVersionlessDevResolver,
  checkJobOutputsVersionTag,
  checkWorkflowCallOutputsVersionTag,
  checkBuildStepStamping,
  checkBuildStepFloorBuildArgs,
  checkMetaStepStampsCandidateLabel,
  checkMetaStepStampsFloorRevisionLabels,
  checkImmutabilityGuardStep,
  checkDockerfileAcceptsAppVersion,
  checkDockerfileAcceptsReleaseFloorRevision,
  checkOrchestratorVersionTagMapping,
  checkOrchestratorCandidateSourceShaWiring,
  checkOrchestratorReleaseRevisionWiring,
  checkDeployMainCandidateSourceShaWiring,
  checkDeployMainReleaseRevisionWiring,
  checkDeployMainBuildSkipPlanJob,
  checkDeployMainPublishGate,
  checkDeployMainOpisPublishGates,
  checkDeployDispatchReleaseRevisionWiring,
  checkPairedBackendPublishGate,
  checkOrchestratorPairedPublishGate,
  DEPLOY_MAIN_FILE,
  DEPLOY_MAIN_CANDIDATE_SOURCE_SHA_INPUTS,
  DEPLOY_MAIN_JOB_INPUT_NAMES,
  DEPLOY_MAIN_RELEASE_REVISION_INPUTS,
  DEPLOY_MAIN_JOB_RELEASE_REVISION_INPUT_NAMES,
  DEPLOY_MAIN_BUILD_SKIP_OUTPUT_NAMES,
  runAllChecks,
};
