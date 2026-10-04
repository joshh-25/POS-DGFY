const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  checkPrQualityWorkflow,
  checkOperatorDispatchShape,
  checkAllStepsAdvisory,
  checkQualityReporterShape,
  checkQualityJobFailureWiring,
} = require('./check-pr-quality-workflow');
const { buildComment } = require('./post-quality-suite-evidence');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const realWorkflow = read('.github/workflows/promotion-quality-gate.yml');

test('operator dispatch shape permits only workflow_dispatch', () => {
  assert.deepEqual(checkOperatorDispatchShape(realWorkflow), []);
});

test('operator dispatch shape rejects pull_request and workflow_call triggers', () => {
  assert.match(checkOperatorDispatchShape(realWorkflow.replace('  workflow_dispatch:', '  pull_request:\n    branches: [main]\n  workflow_dispatch:')).join('\n'), /automatic pull_request/);
  assert.match(checkOperatorDispatchShape(realWorkflow.replace('  workflow_dispatch:', '  workflow_call:\n  workflow_dispatch:')).join('\n'), /workflow_call/);
});

test('all workflow steps carry exactly one advisory continuation', () => {
  assert.deepEqual(checkAllStepsAdvisory(realWorkflow), []);
});

test('all-step guard catches a new step without continue-on-error', () => {
  const changed = realWorkflow.replace('      - name: Start service containers\n        continue-on-error: true\n', '      - name: Start service containers\n');
  assert.match(checkAllStepsAdvisory(changed).join('\n'), /every step must carry exactly one/);
});

test('reporter posts evidence after advisory jobs and has narrow API permissions', () => {
  assert.deepEqual(checkQualityReporterShape(realWorkflow), []);
  const reporterJob = realWorkflow.split('\n  report-quality-evidence:\n')[1].split('\n  salvage-api-evidence:\n')[0];
  assert.ok(reporterJob, 'report-quality-evidence job must exist');
  const installIndex = reporterJob.indexOf('run: npm ci --ignore-scripts');
  const reportIndex = reporterJob.indexOf('run: node scripts/post-quality-suite-evidence.js');
  assert.notEqual(installIndex, -1, 'reporter must install root locked dependencies');
  assert.notEqual(reportIndex, -1, 'reporter must invoke the evidence script');
  assert.ok(
    installIndex < reportIndex,
    'reporter must install root locked dependencies before invoking the evidence script'
  );
  const missingPermissions = realWorkflow.replace('      pull-requests: write\n', '');
  assert.match(checkQualityReporterShape(missingPermissions).join('\n'), /PR comment and Actions read permissions/);
});

test('quality evidence keeps advisory step failures visible even when the job conclusion is success', () => {
  const comment = buildComment({
    run: {
      head_sha: 'a'.repeat(40),
      head_branch: 'release/2026-10-03-01',
      html_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/1',
    },
    jobs: [{ name: 'dgfy-api-quality', conclusion: 'success' }],
    pr: { head: { sha: 'a'.repeat(40) } },
    failuresByJob: { 'dgfy-api-quality': 'Run API lint' },
  });
  assert.match(comment, /advisory failures: Run API lint/);
  assert.match(comment, /Current PR head/);
  assert.match(comment, /1 job\(s\) reported advisory failures/);
});

test('quality job failure evidence remains wired from every step through the reporter', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/promotion-quality-gate.yml'), 'utf8');
  assert.deepEqual(checkQualityJobFailureWiring(source), []);
  const withoutOutcome = source.replace('Run API lint|${{ steps.run_api_lint.outcome }}', 'Run API lint|success');
  assert.ok(checkQualityJobFailureWiring(withoutOutcome).some((problem) => problem.includes('dgfy-api-quality does not report step run_api_lint')));
});

test('repository promotion quality contract remains internally consistent', () => {
  assert.deepEqual(checkPrQualityWorkflow({
    prChecksText: read('.github/workflows/pr-checks.yml'),
    complianceScriptText: read('scripts/check-compliance-impact.js'),
    qualityWorkflowText: realWorkflow,
  }), []);
});
