const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
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

function namedStepBlocks(workflow, stepName) {
  const lines = workflow.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== `      - name: ${stepName}`) continue;
    let end = index + 1;
    while (end < lines.length && !/^      - name: /.test(lines[end]) && !/^  [A-Za-z0-9_-]+:$/.test(lines[end])) end += 1;
    blocks.push(lines.slice(index, end).join('\n'));
  }
  return blocks;
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

test('the action forwards the sanitized S3 failure reason to its output and recorder', () => {
  const { actionText } = sourceInputs();
  assert.match(actionText, /failure_reason:\n\s+description: Sanitized S3 failure classification when fallback fails\.\n\s+value: \$\{\{ steps\.s3_fallback\.outputs\.failure_reason \}\}/);
  assert.match(actionText, /S3_FAILURE_REASON: \$\{\{ steps\.s3_fallback\.outputs\.failure_reason \}\}/);
  assert.match(actionText, /diagnose-readback-failure:\n\s+description: Run safe S3 GetObject comparisons when direct readback fails\.\n\s+required: false\n\s+default: 'false'/);
  assert.match(actionText, /S3_DIAGNOSE_READBACK_FAILURE: \$\{\{ inputs\.diagnose-readback-failure \}\}/);
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
  assert.match(semgrep, /if: always\(\) && github\.event_name == 'pull_request'/);
  assert.match(semgrep, /continue-on-error: true/);
  assert.doesNotMatch(semgrep, /s3_upload|storage_status/);
  assert.match(workflow, /if: always\(\) && steps\.s3_upload\.outputs\.storage_status == 'failed'/);
  assert.match(workflow, /diagnose-readback-failure: true/);
});

test('promotion quality evidence fails visibly through its existing per-step outcome path', () => {
  const { workflowSources } = sourceInputs();
  const workflow = workflowSources['.github/workflows/promotion-quality-gate.yml'];
  assert.equal((workflow.match(/uses: \.\/\.github\/actions\/upload-evidence/g) || []).length, 6);
  assert.equal((workflow.match(/- name: Fail on evidence storage failure/g) || []).length, 6);
  const enforcementSteps = namedStepBlocks(workflow, 'Fail on evidence storage failure');
  assert.equal(enforcementSteps.length, 6);
  for (const step of enforcementSteps) assert.match(step, /continue-on-error: true/);
  // Four jobs report through STEP_OUTCOMES; selected-DB and salvaged evidence write their
  // enforcement outcome directly to the step summary.
  assert.equal((workflow.match(/Fail on evidence storage failure\|\$\{\{ steps\.enforce_evidence_storage\.outcome \}\}/g) || []).length, 4);
  assert.equal((workflow.match(/ENFORCEMENT_OUTCOME: \$\{\{ steps\.enforce_evidence_storage\.outcome \}\}/g) || []).length, 2);
  for (const jobId of ['upload_selected_db_evidence', 'upload_test_matrix_evidence', 'upload_fnb_browser_evidence', 'upload_pos_sales_e2e_evidence', 'upload_frontend_budgets_report', 'upload_salvaged_evidence']) {
    assert.match(workflow, new RegExp(`steps\\.${jobId}\\.outputs\\.storage_status == 'failed'`));
  }
});

test('S3 uploader exposes a sanitized AWS error and preserves the failure if its output file disappears', (t) => {
  const sha256sum = spawnSync('sha256sum', ['--version'], { encoding: 'utf8' });
  if (sha256sum.error?.code === 'ENOENT') {
    t.skip('sha256sum is unavailable on this platform');
    return;
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-s3-upload-failure-'));
  const fakeBin = path.join(temporaryRoot, 'bin');
  const runnerTemp = path.join(temporaryRoot, 'runner-temp');
  fs.mkdirSync(fakeBin);
  fs.mkdirSync(runnerTemp);
  const fakeAws = path.join(fakeBin, 'aws');
  fs.writeFileSync(fakeAws, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'if [[ "${1:-}" == "--version" ]]; then',
    '  echo "aws-cli/2.0.0 Python/3.0"',
    '  exit 0',
    'fi',
    'if [[ "${REMOVE_OUTPUT_DIRECTORY:-false}" == "true" ]]; then',
    '  rm -rf "$(dirname "$GITHUB_OUTPUT")"',
    'fi',
    'echo "An error occurred (SignatureDoesNotMatch) when calling the PutObject operation: fake-secret https://private.invalid/object" >&2',
    'exit 1',
    '',
  ].join('\n'), { mode: 0o755 });

  const runUpload = (outputPath, removeOutputDirectory) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const sourcePath = path.join(temporaryRoot, 'evidence.json');
    fs.writeFileSync(sourcePath, '{"evidence":true}\n');
    return spawnSync('bash', [path.join(ROOT, 'scripts/ci-s3-upload.sh'), sourcePath, 'evidence'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        ARTIFACT_S3_ENDPOINT: 'https://s3.example.invalid',
        ARTIFACT_S3_BUCKET: 'private-bucket',
        ARTIFACT_S3_ACCESS_KEY_ID: 'fake-access-key',
        AWS_SECRET_ACCESS_KEY: 'fake-secret',
        GITHUB_OUTPUT: outputPath,
        RUNNER_TEMP: runnerTemp,
        GITHUB_REPOSITORY: 'Sieitzz/dgfy-platform',
        GITHUB_WORKFLOW: 'Failure test',
        GITHUB_RUN_ID: '42',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_JOB: 's3-upload-test',
        SOURCE_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
        REMOVE_OUTPUT_DIRECTORY: removeOutputDirectory ? 'true' : 'false',
      },
    });
  };

  try {
    const outputPath = path.join(temporaryRoot, 'outputs', 'github-output.txt');
    const result = runUpload(outputPath, false);
    assert.equal(result.status, 1, result.stderr);
    const outputs = fs.readFileSync(outputPath, 'utf8');
    const failureReason = outputs.split(/\r?\n/).find((line) => line.startsWith('failure_reason='));
    assert.equal(failureReason, 'failure_reason=S3 service error SignatureDoesNotMatch');
    assert.doesNotMatch(failureReason, /fake-secret|private\.invalid|https?:/);

    const missingOutput = runUpload(path.join(temporaryRoot, 'disappearing-outputs', 'github-output.txt'), true);
    assert.equal(missingOutput.status, 1);
    assert.match(missingOutput.stderr, /Could not write the sanitized S3 failure reason/);
    assert.match(missingOutput.stderr, /::error::S3 upload failed \(S3 service error SignatureDoesNotMatch; AWS CLI exit code 1\)/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('S3 uploader reports the AWS CLI exit code for a failed direct readback', (t) => {
  const sha256sum = spawnSync('sha256sum', ['--version'], { encoding: 'utf8' });
  if (sha256sum.error?.code === 'ENOENT') {
    t.skip('sha256sum is unavailable on this platform');
    return;
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-s3-readback-failure-'));
  const fakeBin = path.join(temporaryRoot, 'bin');
  const runnerTemp = path.join(temporaryRoot, 'runner-temp');
  fs.mkdirSync(fakeBin);
  fs.mkdirSync(runnerTemp);
  fs.writeFileSync(path.join(fakeBin, 'aws'), [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'if [[ "${1:-}" == "--version" ]]; then',
    '  echo "aws-cli/2.0.0 Python/3.0"',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "s3api" && "${2:-}" == "get-object" ]]; then',
    '  echo "An error occurred (SignatureDoesNotMatch) when calling the GetObject operation" >&2',
    '  exit 24',
    'fi',
    'if [[ "${1:-}" == "s3" && "${2:-}" == "presign" ]]; then',
    '  echo "https://s3.example.invalid/object?X-Amz-Signature=fake-bearer-token"',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "s3" && "${2:-}" == "cp" && "${3:-}" == s3://* ]]; then',
    '  echo "An error occurred (SignatureDoesNotMatch) when calling the GetObject operation" >&2',
    '  exit 23',
    'fi',
    'exit 0',
    '',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, 'curl'), [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'output_path=""',
    'while (($#)); do',
    '  if [[ "$1" == "--output" ]]; then output_path="$2"; shift 2; else shift; fi',
    'done',
    'printf evidence > "$output_path"',
    'printf 200',
    '',
  ].join('\n'), { mode: 0o755 });

  const sourcePath = path.join(temporaryRoot, 'evidence.json');
  const outputPath = path.join(temporaryRoot, 'outputs', 'github-output.txt');
  const summaryPath = path.join(temporaryRoot, 'summary.md');
  fs.mkdirSync(path.dirname(outputPath));
  fs.writeFileSync(sourcePath, 'evidence');

  try {
    const result = spawnSync('bash', [path.join(ROOT, 'scripts/ci-s3-upload.sh'), sourcePath, 'evidence'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
        ARTIFACT_S3_ENDPOINT: 'https://s3.example.invalid',
        ARTIFACT_S3_BUCKET: 'private-bucket',
        ARTIFACT_S3_ACCESS_KEY_ID: 'fake-access-key',
        AWS_SECRET_ACCESS_KEY: 'fake-secret',
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        RUNNER_TEMP: runnerTemp,
        GITHUB_REPOSITORY: 'Sieitzz/dgfy-platform',
        GITHUB_WORKFLOW: 'Readback failure test',
        GITHUB_RUN_ID: '43',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_JOB: 's3-readback-test',
        SOURCE_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
        S3_DIAGNOSE_READBACK_FAILURE: 'true',
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const logs = `${result.stdout}\n${result.stderr}`;
    assert.match(result.stderr, /S3 direct readback failed \(S3 service error SignatureDoesNotMatch; AWS CLI exit code 23\)/);
    assert.match(logs, /AWS CLI version: aws-cli\/2\.0\.0/);
    assert.match(logs, /s3api GetObject: failed \(S3 service error SignatureDoesNotMatch; exit code 24\)/);
    assert.match(logs, /Presigned GET: verified \(HTTP 200\); SHA-256/);
    assert.doesNotMatch(logs, /fake-bearer-token/);
    assert.match(fs.readFileSync(outputPath, 'utf8'), /failure_reason=S3 service error SignatureDoesNotMatch/);
    assert.doesNotMatch(fs.readFileSync(outputPath, 'utf8'), /fake-bearer-token/);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /S3 readback diagnostics/);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /`s3api GetObject`: failed \(S3 service error SignatureDoesNotMatch; exit code 24\)/);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /Presigned GET: verified \(HTTP 200\); SHA-256/);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /Presigned URL omitted/);
    assert.doesNotMatch(fs.readFileSync(summaryPath, 'utf8'), /fake-bearer-token/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
