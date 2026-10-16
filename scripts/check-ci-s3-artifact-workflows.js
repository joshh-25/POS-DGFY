#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const EVIDENCE_ACTION_PATH = '.github/actions/upload-evidence/action.yml';
const EVIDENCE_ACTION = './.github/actions/upload-evidence';
const S3_SCRIPTS = [
  'scripts/ci-s3-upload.sh',
  'scripts/ci-s3-set-artifact-lifecycle.sh',
];
const REQUIRED_MAPPINGS = [
  ['s3-endpoint', '${{ vars.ARTIFACT_S3_ENDPOINT }}'],
  ['s3-bucket', '${{ vars.ARTIFACT_S3_BUCKET }}'],
  ['s3-access-key-id', '${{ vars.ARTIFACT_S3_ACCESS_KEY_ID }}'],
  ['s3-secret-access-key', '${{ secrets.ARTIFACT_S3_ACCESS_KEY_SECRET }}'],
];

function getStepBlocks(workflowText) {
  const starts = [...workflowText.matchAll(/^ {6}- (?=[A-Za-z][A-Za-z0-9_-]*:)/gm)].map((match) => match.index);
  return starts.map((start, index) => workflowText.slice(start, starts[index + 1] ?? workflowText.length));
}

function checkWorkflowSources(workflowSources, scriptSources, actionText = '') {
  const problems = [];
  let callCount = 0;

  for (const [workflowPath, workflowText] of Object.entries(workflowSources)) {
    const stepBlocks = getStepBlocks(workflowText);
    for (const block of stepBlocks.filter((step) => step.includes(`uses: ${EVIDENCE_ACTION}`))) {
      callCount += 1;
      for (const [inputName, expression] of REQUIRED_MAPPINGS) {
        const expectedLine = `${inputName}: ${expression}`;
        if (!block.split('\n').some((line) => line.trim() === expectedLine)) {
          problems.push(`${workflowPath}: evidence action call is missing ${inputName} mapped from the expected GitHub configuration.`);
        }
      }
      if (/secrets\.ARTIFACT_S3_(?:ENDPOINT|BUCKET|ACCESS_KEY_ID)\b/.test(block)) {
        problems.push(`${workflowPath}: S3 endpoint, bucket, and access key ID must come from non-secret configuration.`);
      }
      if (!/retention-days: \d+/.test(block)) {
        problems.push(`${workflowPath}: evidence action call must set explicit retention-days.`);
      }
    }
  }

  if (callCount !== 11) problems.push(`Expected 11 active evidence action call sites, found ${callCount}.`);
  if (!actionText.includes('scripts/ci-s3-upload.sh')) problems.push(`${EVIDENCE_ACTION_PATH}: must call the shared S3 uploader as fallback.`);
  if (!actionText.includes("steps.github_upload.outcome == 'failure'")) {
    problems.push(`${EVIDENCE_ACTION_PATH}: S3 fallback must run only when the GitHub upload fails.`);
  }
  const actionMappings = [
    ['ARTIFACT_S3_ENDPOINT', 's3-endpoint'],
    ['ARTIFACT_S3_BUCKET', 's3-bucket'],
    ['ARTIFACT_S3_ACCESS_KEY_ID', 's3-access-key-id'],
  ];
  for (const [envName, inputName] of actionMappings) {
    if (!actionText.includes(`${envName}: \${{ inputs.${inputName} }}`)) {
      problems.push(`${EVIDENCE_ACTION_PATH}: fallback must map ${envName} from its action input.`);
    }
  }
  if (!actionText.includes('AWS_SECRET_ACCESS_KEY: ${{ inputs.s3-secret-access-key }}')) {
    problems.push(`${EVIDENCE_ACTION_PATH}: AWS_SECRET_ACCESS_KEY must come from the secret action input.`);
  }
  if (/secrets\.ARTIFACT_S3_(?:ENDPOINT|BUCKET|ACCESS_KEY_ID)\b/.test(actionText)) {
    problems.push(`${EVIDENCE_ACTION_PATH}: S3 endpoint, bucket, and access key ID must not be secret-backed.`);
  }
  if (actionText.includes('s3.patteruel.dev')) {
    problems.push(`${EVIDENCE_ACTION_PATH}: provider-specific endpoint must not be hardcoded.`);
  }

  for (const [scriptPath, scriptText] of Object.entries(scriptSources)) {
    if (scriptText.includes('s3.patteruel.dev')) {
      problems.push(`${scriptPath}: provider-specific endpoint must not be hardcoded.`);
    }
    if (!scriptText.includes('ARTIFACT_S3_ENDPOINT')) {
      problems.push(`${scriptPath}: must consume ARTIFACT_S3_ENDPOINT.`);
    }
  }

  return { callCount, problems };
}

function readInputs() {
  const workflowSources = Object.fromEntries(
    fs.readdirSync(WORKFLOW_DIR)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .map((name) => {
        const relativePath = path.posix.join('.github', 'workflows', name);
        return [relativePath, fs.readFileSync(path.join(ROOT, relativePath), 'utf8')];
      }),
  );
  const scriptSources = Object.fromEntries(
    S3_SCRIPTS.map((relativePath) => [relativePath, fs.readFileSync(path.join(ROOT, relativePath), 'utf8')]),
  );
  const actionText = fs.readFileSync(path.join(ROOT, EVIDENCE_ACTION_PATH), 'utf8');
  return { workflowSources, scriptSources, actionText };
}

function main() {
  const { workflowSources, scriptSources, actionText } = readInputs();
  const { callCount, problems } = checkWorkflowSources(workflowSources, scriptSources, actionText);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CI evidence storage configuration is valid (${callCount} call site(s)).`);
}

if (require.main === module) main();

module.exports = { checkWorkflowSources, getStepBlocks };
