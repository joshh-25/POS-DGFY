const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkWorkflowSources } = require('./check-ci-s3-artifact-workflows');

const ROOT = path.resolve(__dirname, '..');
const ACTION_PATH = '.github/actions/upload-evidence/action.yml';

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
  const actionText = fs.readFileSync(path.join(ROOT, ACTION_PATH), 'utf8');
  return { workflowSources, scriptSources, actionText };
}

test('all evidence upload call sites use non-secret S3 configuration and the secret access key', () => {
  const { workflowSources, scriptSources, actionText } = sourceInputs();
  const result = checkWorkflowSources(workflowSources, scriptSources, actionText);
  assert.deepEqual(result.problems, []);
  assert.equal(result.callCount, 11);
});

test('the workflow shape checker rejects secret-backed bucket configuration', () => {
  const { workflowSources, scriptSources, actionText } = sourceInputs();
  const workflowPath = '.github/workflows/security-scan.yml';
  workflowSources[workflowPath] = workflowSources[workflowPath].replace(
    's3-bucket: ${{ vars.ARTIFACT_S3_BUCKET }}',
    's3-bucket: ${{ secrets.ARTIFACT_S3_BUCKET }}',
  );
  const result = checkWorkflowSources(workflowSources, scriptSources, actionText);
  assert.ok(result.problems.some((problem) => problem.includes('must come from non-secret configuration')));
});

test('the workflow shape checker rejects secret-backed endpoint configuration', () => {
  const { workflowSources, scriptSources, actionText } = sourceInputs();
  const workflowPath = '.github/workflows/security-scan.yml';
  workflowSources[workflowPath] = workflowSources[workflowPath].replace(
    's3-endpoint: ${{ vars.ARTIFACT_S3_ENDPOINT }}',
    's3-endpoint: ${{ secrets.ARTIFACT_S3_ENDPOINT }}',
  );
  const result = checkWorkflowSources(workflowSources, scriptSources, actionText);
  assert.ok(result.problems.some((problem) => problem.includes('must come from non-secret configuration')));
});

test('the workflow shape checker requires the secret access key to remain a GitHub Secret', () => {
  const { workflowSources, scriptSources, actionText } = sourceInputs();
  const workflowPath = '.github/workflows/security-scan.yml';
  workflowSources[workflowPath] = workflowSources[workflowPath].replace(
    's3-secret-access-key: ${{ secrets.ARTIFACT_S3_ACCESS_KEY_SECRET }}',
    's3-secret-access-key: ${{ vars.ARTIFACT_S3_ACCESS_KEY_SECRET }}',
  );
  const result = checkWorkflowSources(workflowSources, scriptSources, actionText);
  assert.ok(result.problems.some((problem) => problem.includes('missing s3-secret-access-key')));
});

test('the action keeps its fallback endpoint configurable', () => {
  const { workflowSources, scriptSources, actionText } = sourceInputs();
  const result = checkWorkflowSources(workflowSources, scriptSources, `${actionText}\nendpoint_url="https://s3.patteruel.dev"\n`);
  assert.ok(result.problems.some((problem) => problem.includes('provider-specific endpoint must not be hardcoded')));
});

test('S3 fallback is conditional on GitHub artifact failure and not primary success', () => {
  const { workflowSources, scriptSources, actionText } = sourceInputs();
  assert.match(actionText, /if: steps\.source\.outputs\.source_status == 'ready' && steps\.github_upload\.outcome == 'failure'/);
  assert.doesNotMatch(actionText, /if: .*github_upload\.outcome == 'success'.*s3_fallback/);
  assert.deepEqual(checkWorkflowSources(workflowSources, scriptSources, actionText).problems, []);
});

test('security scanning completes both scanners before the final independent storage failure', () => {
  const { workflowSources } = sourceInputs();
  const workflow = workflowSources['.github/workflows/security-scan.yml'];
  const stepNames = [...workflow.matchAll(/^      - name: (.+)$/gm)].map((match) => match[1]);
  assert.equal(stepNames.at(-1), 'Fail on evidence storage failure');
  const gitleaks = workflow.slice(workflow.indexOf('- name: Scan PR diff with gitleaks'), workflow.indexOf('- name: Upload gitleaks report evidence'));
  const semgrep = workflow.slice(workflow.indexOf('- name: Scan with Semgrep'), workflow.indexOf('- name: Fail on evidence storage failure'));
  assert.match(gitleaks, /continue-on-error: true/);
  assert.match(semgrep, /continue-on-error: true/);
  assert.doesNotMatch(semgrep, /s3_upload|storage_status/);
  assert.match(workflow, /if: always\(\) && steps\.s3_upload\.outputs\.storage_status == 'failed'/);
});

test('promotion quality evidence fails visibly through its existing per-step outcome path', () => {
  const { workflowSources } = sourceInputs();
  const workflow = workflowSources['.github/workflows/promotion-quality-gate.yml'];
  assert.equal((workflow.match(/uses: \.\/\.github\/actions\/upload-evidence/g) || []).length, 6);
  assert.equal((workflow.match(/- name: Fail on evidence storage failure/g) || []).length, 6);
  assert.match(workflow, /Fail on evidence storage failure\|\$\{\{ steps\.enforce_evidence_storage\.outcome \}\}/);
  for (const jobId of ['upload_selected_db_evidence', 'upload_test_matrix_evidence', 'upload_fnb_browser_evidence', 'upload_pos_sales_e2e_evidence', 'upload_frontend_budgets_report', 'upload_salvaged_evidence']) {
    assert.match(workflow, new RegExp(`steps\\.${jobId}\\.outputs\\.storage_status == 'failed'`));
  }
});
