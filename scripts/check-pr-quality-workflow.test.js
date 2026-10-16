const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  checkPrQualityWorkflow,
  checkOperatorDispatchShape,
  checkSelectiveDispatchShape,
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

test('targeted API DB dispatch is opt-in and the default still selects the full suite', () => {
  assert.deepEqual(checkSelectiveDispatchShape(realWorkflow), []);
  assert.match(
    checkSelectiveDispatchShape(realWorkflow.replace('        default: full\n      api_db_runner:', '        default: api_db_chunks\n      api_db_runner:')).join('\n'),
    /must default to the full quality suite/
  );
  assert.match(
    checkSelectiveDispatchShape(realWorkflow.replace("if: ${{ inputs.test_selection == 'full' }}", 'if: true')).join('\n'),
    /must be limited to the full selection/
  );
  assert.match(
    checkSelectiveDispatchShape(realWorkflow.replace('          - sieitz-runner\n        default: sieitz-lg', '          - ubuntu-latest\n        default: ubuntu-latest')).join('\n'),
    /must default to and allow only self-hosted runners/
  );
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
  const setupIndex = reporterJob.indexOf('id: setup_reporter_node');
  const installIndex = reporterJob.indexOf('run: npm ci --ignore-scripts');
  const reportIndex = reporterJob.indexOf('run: node scripts/post-quality-suite-evidence.js');
  assert.notEqual(setupIndex, -1, 'reporter must configure Node.js');
  assert.notEqual(installIndex, -1, 'reporter must install root locked dependencies');
  assert.notEqual(reportIndex, -1, 'reporter must invoke the evidence script');
  assert.ok(
    setupIndex < installIndex && installIndex < reportIndex,
    'reporter must configure Node, install root dependencies, then invoke the evidence script'
  );
  assert.match(reporterJob, /uses: actions\/setup-node@v4[\s\S]*?node-version: '24'[\s\S]*?cache: npm[\s\S]*?cache-dependency-path: package-lock\.json/);
  const missingPermissions = realWorkflow.replace('      pull-requests: write\n', '');
  assert.match(checkQualityReporterShape(missingPermissions).join('\n'), /PR comment and Actions read permissions/);
});

test('reporter contract rejects missing or misordered Node setup and a non-root npm cache key', () => {
  const withoutSetup = realWorkflow.replace(/      - name: Setup Node\.js\n        continue-on-error: true\n        id: setup_reporter_node[\s\S]*?cache-dependency-path: package-lock\.json\n/, '');
  assert.match(checkQualityReporterShape(withoutSetup).join('\n'), /configure Node before installing root dependencies/);

  const setupAfterInstall = realWorkflow.replace(
    /      - name: Setup Node\.js\n        continue-on-error: true\n        id: setup_reporter_node[\s\S]*?cache-dependency-path: package-lock\.json\n/,
    ''
  ).replace('      - name: Post advisory quality evidence to the associated PR', "      - name: Setup Node.js\n        continue-on-error: true\n        id: setup_reporter_node\n        uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n          cache: npm\n          cache-dependency-path: package-lock.json\n      - name: Post advisory quality evidence to the associated PR");
  assert.match(checkQualityReporterShape(setupAfterInstall).join('\n'), /configure Node, install root locked dependencies, then invoke/);

  const wrongCachePath = realWorkflow.replace(
    'id: setup_reporter_node\n        uses: actions/setup-node@v4\n        timeout-minutes: 5\n        with:\n          node-version: \'24\'\n          cache: npm\n          cache-dependency-path: package-lock.json',
    'id: setup_reporter_node\n        uses: actions/setup-node@v4\n        timeout-minutes: 5\n        with:\n          node-version: \'24\'\n          cache: npm\n          cache-dependency-path: apps/dgfy-api/package-lock.json'
  );
  assert.match(checkQualityReporterShape(wrongCachePath).join('\n'), /root package-lock\.json/);
});

test('quality evidence keeps advisory step failures visible even when the job conclusion is success', () => {
  const successfulQualityJobs = [
    'dgfy-api-quality', 'migration-runner-quality', 'web-core-quality', 'frontend-pos-quality',
    'frontend-storefront-quality', 'frontend-opis-quality', 'frontend-admin-quality',
    'repository-dependency-quality', 'repository-ci-contracts-quality', 'repository-docs-quality',
    'frontend-budgets-quality', 'pos-sales-e2e-quality',
  ].map((name) => ({ name, conclusion: 'success' }));
  const comment = buildComment({
    run: {
      head_sha: 'a'.repeat(40),
      head_branch: 'release/2026-10-03-01',
      html_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/1',
    },
    jobs: successfulQualityJobs,
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

test('POS sales E2E writes and uploads staged JSON, HTML, and SHA-bound run evidence', () => {
  const job = realWorkflow.split('\n  pos-sales-e2e-quality:\n')[1].split('\n  frontend-budgets-quality:\n')[0];
  const playwrightConfig = read('apps/dgfy-pos/playwright.config.js');

  assert.ok(job, 'pos-sales-e2e-quality job must exist');
  assert.match(playwrightConfig, /\['html', \{ outputFolder: 'playwright-report', open: 'never' \}\]/);
  assert.match(playwrightConfig, /if \(process\.env\.PLAYWRIGHT_JSON_OUTPUT_FILE\) reporters\.push\(\['json'\]\)/);
  assert.match(job, /PLAYWRIGHT_JSON_OUTPUT_FILE: test-results\/pos-sales-results\.json/);
  assert.match(job, /echo "exit_status=\$status" >> "\$GITHUB_OUTPUT"/);
  assert.match(job, /stage_dir="\$RUNNER_TEMP\/pos-sales-evidence"/);
  assert.match(job, /sha: process\.env\.POS_SALES_EVIDENCE_SHA/);
  assert.match(job, /run_outcome: process\.env\.POS_SALES_RUN_OUTCOME/);
  assert.match(job, /exit_status: exitStatus/);
  assert.match(job, /test-results\/pos-sales-results\.json/);
  assert.match(job, /run outcome=\$\{POS_SALES_RUN_OUTCOME:-unknown\}, exit status=\$\{POS_SALES_EXIT_STATUS:-unknown\}/);
  assert.match(job, /path: \$\{\{ runner\.temp \}\}\/pos-sales-evidence/);
  assert.doesNotMatch(job, /path: apps\/dgfy-pos\/test-results/);
});

test('repository promotion quality contract remains internally consistent', () => {
  assert.deepEqual(checkPrQualityWorkflow({
    prChecksText: read('.github/workflows/pr-checks.yml'),
    complianceScriptText: read('scripts/check-compliance-impact.js'),
    qualityWorkflowText: realWorkflow,
    backendMatrixScriptText: read('scripts/run-backend-test-matrix.js'),
  }), []);
});
