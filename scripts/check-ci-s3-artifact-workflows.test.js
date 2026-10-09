const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkWorkflowSources } = require('./check-ci-s3-artifact-workflows');

const ROOT = path.resolve(__dirname, '..');

function sourceInputs() {
  const workflowDir = path.join(ROOT, '.github', 'workflows');
  const workflowSources = Object.fromEntries(
    fs.readdirSync(workflowDir)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .map((name) => {
        const relativePath = path.posix.join('.github', 'workflows', name);
        return [relativePath, fs.readFileSync(path.join(ROOT, relativePath), 'utf8')];
      }),
  );
  const scriptPaths = ['scripts/ci-s3-upload.sh', 'scripts/ci-s3-set-artifact-lifecycle.sh'];
  const scriptSources = Object.fromEntries(scriptPaths.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
  ]));
  return { workflowSources, scriptSources };
}

test('all active CI S3 workflow steps use non-secret configuration and the secret access key', () => {
  const { workflowSources, scriptSources } = sourceInputs();
  const result = checkWorkflowSources(workflowSources, scriptSources);
  assert.deepEqual(result.problems, []);
  assert.ok(result.callCount >= 1);
});

test('the workflow shape checker rejects secret-backed bucket configuration', () => {
  const { workflowSources, scriptSources } = sourceInputs();
  const workflowPath = '.github/workflows/security-scan.yml';
  workflowSources[workflowPath] = workflowSources[workflowPath].replace(
    'ARTIFACT_S3_BUCKET: ${{ vars.ARTIFACT_S3_BUCKET }}',
    'ARTIFACT_S3_BUCKET: ${{ secrets.ARTIFACT_S3_BUCKET }}',
  );
  const result = checkWorkflowSources(workflowSources, scriptSources);
  assert.ok(result.problems.some((problem) => problem.includes('must come from non-secret configuration')));
});

test('the workflow shape checker requires the secret access key to remain a GitHub Secret', () => {
  const { workflowSources, scriptSources } = sourceInputs();
  const workflowPath = '.github/workflows/security-scan.yml';
  workflowSources[workflowPath] = workflowSources[workflowPath].replace(
    'AWS_SECRET_ACCESS_KEY: ${{ secrets.ARTIFACT_S3_ACCESS_KEY_SECRET }}',
    'AWS_SECRET_ACCESS_KEY: ${{ vars.ARTIFACT_S3_ACCESS_KEY_SECRET }}',
  );
  const result = checkWorkflowSources(workflowSources, scriptSources);
  assert.ok(result.problems.some((problem) => problem.includes('missing AWS_SECRET_ACCESS_KEY')));
});

test('the workflow shape checker rejects a hardcoded provider endpoint in an S3 script', () => {
  const { workflowSources, scriptSources } = sourceInputs();
  scriptSources['scripts/ci-s3-upload.sh'] += '\nendpoint_url="https://s3.patteruel.dev"\n';
  const result = checkWorkflowSources(workflowSources, scriptSources);
  assert.ok(result.problems.some((problem) => problem.includes('provider-specific endpoint must not be hardcoded')));
});
