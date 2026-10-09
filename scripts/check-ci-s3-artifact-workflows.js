#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const S3_SCRIPTS = [
  'scripts/ci-s3-upload.sh',
  'scripts/ci-s3-set-artifact-lifecycle.sh',
];
const REQUIRED_MAPPINGS = [
  ['ARTIFACT_S3_ENDPOINT', '${{ vars.ARTIFACT_S3_ENDPOINT }}'],
  ['ARTIFACT_S3_BUCKET', '${{ vars.ARTIFACT_S3_BUCKET }}'],
  ['ARTIFACT_S3_ACCESS_KEY_ID', '${{ vars.ARTIFACT_S3_ACCESS_KEY_ID }}'],
  ['AWS_SECRET_ACCESS_KEY', '${{ secrets.ARTIFACT_S3_ACCESS_KEY_SECRET }}'],
];

function getStepBlocks(workflowText) {
  const starts = [...workflowText.matchAll(/^ {6}- (?=[A-Za-z][A-Za-z0-9_-]*:)/gm)].map((match) => match.index);
  return starts.map((start, index) => workflowText.slice(start, starts[index + 1] ?? workflowText.length));
}

function checkWorkflowSources(workflowSources, scriptSources) {
  const problems = [];
  let callCount = 0;

  for (const [workflowPath, workflowText] of Object.entries(workflowSources)) {
    const stepBlocks = getStepBlocks(workflowText);
    for (const scriptPath of S3_SCRIPTS) {
      for (const block of stepBlocks.filter((step) => step.includes(scriptPath))) {
        callCount += 1;
        for (const [environmentName, expression] of REQUIRED_MAPPINGS) {
          const expectedLine = `${environmentName}: ${expression}`;
          if (!block.split('\n').some((line) => line.trim() === expectedLine)) {
            problems.push(`${workflowPath}: S3 step is missing ${environmentName} mapped from the expected GitHub configuration.`);
          }
        }
        if (/secrets\.ARTIFACT_S3_(?:ENDPOINT|BUCKET|ACCESS_KEY_ID)\b/.test(block)) {
          problems.push(`${workflowPath}: S3 endpoint, bucket, and access key ID must come from non-secret configuration.`);
        }
      }
    }
  }

  if (callCount === 0) problems.push('No active workflow calls either CI S3 script.');

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
  return { workflowSources, scriptSources };
}

function main() {
  const { workflowSources, scriptSources } = readInputs();
  const { callCount, problems } = checkWorkflowSources(workflowSources, scriptSources);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CI S3 workflow configuration is valid (${callCount} S3 script call(s)).`);
}

if (require.main === module) main();

module.exports = { checkWorkflowSources };
