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

/** The build-push step must bake APP_VERSION as a build-arg and stamp org.opencontainers.image.version, and must expose its digest (id: build) for the immutability-guard step to retag. */
function checkBuildStepStamping(workflowText, { label }) {
  const problems = [];

  if (!/id:\s*build\b/.test(workflowText)) {
    problems.push(`${label}: the build-push step has no "id: build" -- the immutability-guard step needs "steps.build.outputs.digest".`);
  }

  if (!/build-args:\s*\|[\s\S]{0,200}?APP_VERSION=\$\{\{\s*steps\.meta\.outputs\.version_tag\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the build-push step's "build-args:" does not bake "APP_VERSION=\${{ steps.meta.outputs.version_tag }}" (ADR 0081 Decision 4).`);
  }

  if (!/labels:\s*\|[\s\S]{0,400}?org\.opencontainers\.image\.version=\$\{\{\s*steps\.meta\.outputs\.version_tag\s*\}\}/.test(workflowText)) {
    problems.push(`${label}: the build-push step's "labels:" does not stamp "org.opencontainers.image.version" (ADR 0081 Decision 3).`);
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
    problems.push(...checkBuildStepStamping(text, { label }));
    problems.push(...checkImmutabilityGuardStep(text, { label }));
  }

  for (const file of DOCKERFILES) {
    const text = readFile(file);
    problems.push(...checkDockerfileAcceptsAppVersion(text, { label: file }));
  }

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
  checkVersionTagComputation,
  checkJobOutputsVersionTag,
  checkBuildStepStamping,
  checkImmutabilityGuardStep,
  checkDockerfileAcceptsAppVersion,
  runAllChecks,
};
