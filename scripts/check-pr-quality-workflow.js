#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const REQUIRED_PR_CHECKS_MARKERS = [
  "      - 'epic/**'",
  "      - 'feature/**'",
  'RUNNER_HEAVY_JSON: *runner_heavy',
  'route-build-checks:',
  'release/*|hotfix/*',
  'frontend-ims-lint-check',
  'frontend-pos-lint-check',
  'frontend-storefront-lint-check',
  'frontend-opis-lint-check',
  'frontend-admin-lint-check',
];

const REQUIRED_QUALITY_MARKERS = [
  'workflow_dispatch:',
  'dgfy-api-quality:',
  'migration-runner-quality:',
  'web-core-quality:',
  'frontend-pos-quality:',
  'frontend-storefront-quality:',
  'frontend-opis-quality:',
  'frontend-admin-quality:',
  'repository-dependency-quality:',
  'repository-ci-contracts-quality:',
  'repository-docs-quality:',
  'pos-sales-e2e-quality:',
  'report-quality-evidence:',
  'node scripts/post-quality-suite-evidence.js --run-id',
  'npm run test:quality-evidence',
  'node scripts/run-backend-test-matrix.js',
  'npm run audit:indexes',
  'npm run lint:docs',
  'npm run check:compat-seams',
  'npm run report:frontend-split-sync:post-merge',
  'npx vitest run',
  'npm run test:frontend:contracts',
  'npm run audit:dependencies:prod',
  'npm run audit:dependencies',
  'npm run check:compliance',
  'npm run check:production-env',
  'npm run build',
  'npx playwright install --with-deps chromium',
  'npm run test:e2e:fnb-contract',
  'git diff --check',
];

const DEVELOP_PR_LINT_JOB_BY_APP = Object.freeze({
  'dgfy-ims': { job: 'frontend-ims-lint-check', changedOutput: 'frontend_ims' },
  'dgfy-pos': { job: 'frontend-pos-lint-check', changedOutput: 'frontend_pos' },
  'dgfy-storefront': { job: 'frontend-storefront-lint-check', changedOutput: 'frontend_storefront' },
  'dgfy-opis': { job: 'frontend-opis-lint-check', changedOutput: 'frontend_opis' },
  'dgfy-admin': { job: 'frontend-admin-lint-check', changedOutput: 'frontend_admin' },
});
const QUALITY_JOBS = [
  'dgfy-api-quality',
  'migration-runner-quality',
  'web-core-quality',
  'frontend-pos-quality',
  'frontend-storefront-quality',
  'frontend-opis-quality',
  'frontend-admin-quality',
  'repository-dependency-quality',
  'repository-ci-contracts-quality',
  'repository-docs-quality',
  'frontend-budgets-quality',
  'pos-sales-e2e-quality',
];

function findJobBlock(workflowText, jobName) {
  const marker = `\n  ${jobName}:\n`;
  const start = workflowText.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + marker.length;
  const next = workflowText.slice(contentStart).search(/\n  [A-Za-z0-9_-]+:\n/);
  return workflowText.slice(contentStart, next < 0 ? undefined : contentStart + next);
}

function checkDevelopPrLintJobMapping(prChecksText) {
  const problems = [];
  for (const [app, { job, changedOutput }] of Object.entries(DEVELOP_PR_LINT_JOB_BY_APP)) {
    const block = findJobBlock(prChecksText, job);
    if (!block) {
      problems.push(`pr-checks.yml: missing ${job} job`);
      continue;
    }
    if (!block.includes('uses: ./.github/workflows/pr-frontend-lint-checks.yml')) problems.push(`pr-checks.yml: ${job} must call the shared frontend lint workflow`);
    const appLines = block.match(/^ {6}app:.*$/gm) || [];
    if (appLines.length !== 1 || appLines[0].trim() !== `app: ${app}`) problems.push(`pr-checks.yml: ${job} must pass exactly app: ${app}`);
    if (!block.includes(`needs.changes.outputs.${changedOutput} == 'true'`)) problems.push(`pr-checks.yml: ${job} must gate on its ${changedOutput} changed-path output`);
    if (!block.includes('needs.route-build-checks.outputs.light')) problems.push(`pr-checks.yml: ${job} must use light-runner routing`);
    if (/continue-on-error/.test(block)) problems.push(`pr-checks.yml: ${job} must remain blocking`);
  }
  return problems;
}

function checkRunnerCacheConsistency(prChecksText) {
  const runner = prChecksText.match(/RUNNER_HEAVY_JSON:\s*&runner_heavy\s*'([^']*)'/);
  const cache = prChecksText.match(/BUILD_CACHE_FROM:\s*&build_cache_from\s*'([^']*)'/);
  if (!runner || !cache) return ['pr-checks.yml: missing runner/cache anchors (#726)'];
  const hosted = /ubuntu-latest|windows-latest|macos-latest/.test(runner[1]);
  const hasCache = cache[1].trim() !== '';
  if (!hosted && hasCache) return ['pr-checks.yml: self-hosted heavy runners must keep BUILD_CACHE_FROM empty'];
  if (hosted && !hasCache) return ["pr-checks.yml: hosted heavy runners must use BUILD_CACHE_FROM: 'type=gha'"];
  return [];
}

function checkOperatorDispatchShape(qualityWorkflowText) {
  const problems = [];
  const triggerBlock = qualityWorkflowText.match(/^on:\n([\s\S]*?)(?=^concurrency:|^jobs:)/m)?.[1] || '';
  if (!triggerBlock.includes('workflow_dispatch:')) problems.push('promotion-quality-gate.yml: must support operator workflow_dispatch');
  if (/^\s*(pull_request|workflow_call):/m.test(triggerBlock)) problems.push('promotion-quality-gate.yml: automatic pull_request and reusable workflow_call triggers are not allowed');
  const activeLines = qualityWorkflowText.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
  if (/is_staging_leg|needs\.gate|^  gate:/m.test(activeLines)) problems.push('promotion-quality-gate.yml: obsolete promotion detection and staging-leg gating must be removed');
  return problems;
}

function checkSelectiveDispatchShape(qualityWorkflowText) {
  const problems = [];
  const dispatch = qualityWorkflowText.match(/^on:\n([\s\S]*?)(?=^concurrency:|^jobs:)/m)?.[1] || '';
  const selection = dispatch.match(/^      test_selection:\n([\s\S]*?)(?=^      [A-Za-z0-9_-]+:|$(?![\s\S]))/m)?.[1] || '';
  if (!selection.includes('type: choice') || !/^        default: full\s*$/m.test(selection)) {
    problems.push('promotion-quality-gate.yml: test_selection must default to the full quality suite');
  }
  if (!/^          - full\s*$/m.test(selection) || !/^          - api_db_chunks\s*$/m.test(selection)) {
    problems.push('promotion-quality-gate.yml: test_selection must offer full and api_db_chunks modes');
  }
  const runner = dispatch.match(/^      api_db_runner:\n([\s\S]*?)(?=^      [A-Za-z0-9_-]+:|$(?![\s\S]))/m)?.[1] || '';
  if (!runner.includes('type: choice') || !/^        default: sieitz-lg\s*$/m.test(runner)
    || !/^          - sieitz-lg\s*$/m.test(runner) || !/^          - sieitz-runner\s*$/m.test(runner)) {
    problems.push('promotion-quality-gate.yml: api_db_runner must default to and allow only self-hosted runners');
  }
  if (!dispatch.includes('api_db_targets:')) {
    problems.push('promotion-quality-gate.yml: api_db_targets input is required for selective DB dispatch');
  }

  const targetJob = findJobBlock(qualityWorkflowText, 'dgfy-api-selected-db-tests');
  if (!targetJob) {
    problems.push('promotion-quality-gate.yml: dgfy-api-selected-db-tests job is required');
  } else {
    if (!targetJob.includes("if: ${{ inputs.test_selection == 'api_db_chunks' }}")) {
      problems.push('promotion-quality-gate.yml: selected DB job must run only for api_db_chunks');
    }
    if (!targetJob.includes("runs-on: ${{ inputs.api_db_runner || 'sieitz-lg' }}")) {
      problems.push('promotion-quality-gate.yml: selected DB job must default to a self-hosted runner');
    }
    if (!targetJob.includes('node scripts/run-backend-test-matrix.js')
      || !targetJob.includes('--tier db --group')
      || !targetJob.includes('args+=(--chunk "$chunk")')) {
      problems.push('promotion-quality-gate.yml: selected DB job must run validated DB group/chunk targets');
    }
    if (!targetJob.includes('vmstat 1') || !targetJob.includes('free -h')
      || !targetJob.includes('uses: ./.github/actions/upload-evidence')
      || !targetJob.includes("tee -a \"$GITHUB_STEP_SUMMARY\"")
      || !targetJob.includes('backend_test_matrix_${group}_${chunk_label}.json')
      || !targetJob.includes('results.testResults')) {
      problems.push('promotion-quality-gate.yml: selected DB job must capture runner telemetry, preserve each selected matrix, report every suite, and store evidence through the shared upload action');
    }
  }

  for (const jobName of QUALITY_JOBS) {
    const block = findJobBlock(qualityWorkflowText, jobName);
    if (block && !block.includes("if: ${{ inputs.test_selection == 'full' }}")) {
      problems.push(`promotion-quality-gate.yml: ${jobName} must be limited to the full selection`);
    }
  }
  for (const jobName of ['report-quality-evidence', 'salvage-api-evidence']) {
    const block = findJobBlock(qualityWorkflowText, jobName);
    if (!block || !block.includes("inputs.test_selection == 'full'")) {
      problems.push(`promotion-quality-gate.yml: ${jobName} must be limited to the full selection`);
    }
  }
  return problems;
}

function checkAllStepsAdvisory(qualityWorkflowText) {
  const lines = qualityWorkflowText.split('\n');
  const problems = [];
  let inSteps = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^    steps:\s*$/.test(lines[i])) {
      inSteps = true;
      continue;
    }
    if (inSteps && /^    [A-Za-z0-9_-]+:/.test(lines[i])) inSteps = false;
    if (!inSteps) continue;
    if (!lines[i].startsWith('      - ')) continue;
    let end = i + 1;
    while (end < lines.length && !lines[end].startsWith('      - ') && !/^    [A-Za-z0-9_-]+:/.test(lines[end])) end += 1;
    const entries = lines.slice(i + 1, end).filter((line) => /^\s+continue-on-error:/.test(line));
    if (entries.length !== 1 || entries[0].trim() !== 'continue-on-error: true') {
      problems.push(`promotion-quality-gate.yml:${i + 1}: every step must carry exactly one \`continue-on-error: true\``);
    }
  }
  return problems;
}

function checkQualityReporterShape(qualityWorkflowText) {
  const block = findJobBlock(qualityWorkflowText, 'report-quality-evidence');
  const problems = [];
  if (!block) return ['promotion-quality-gate.yml: report-quality-evidence job is required'];
  if (!block.includes('if: always()')) problems.push('promotion-quality-gate.yml: report-quality-evidence must run after failed advisory jobs');
  if (!block.includes('scripts/post-quality-suite-evidence.js')) problems.push('promotion-quality-gate.yml: report-quality-evidence must call the evidence reporter');
  if (!block.includes('pull-requests: write') || !block.includes('actions: read')) problems.push('promotion-quality-gate.yml: reporter needs PR comment and Actions read permissions');

  const setupIndex = block.indexOf('id: setup_reporter_node');
  const installIndex = block.indexOf('id: install_reporter_dependencies');
  const reportIndex = block.indexOf('id: post_quality_evidence');
  const setupStep = setupIndex < 0 ? '' : block.slice(block.lastIndexOf('      - ', setupIndex), block.indexOf('\n      - ', setupIndex));
  if (setupIndex < 0) {
    problems.push('promotion-quality-gate.yml: reporter must configure Node before installing root dependencies');
  } else {
    if (!setupStep.includes('uses: actions/setup-node@v4')) problems.push('promotion-quality-gate.yml: reporter Node setup must use actions/setup-node@v4');
    if (!/^ {10}node-version: ['"]?24['"]?\s*$/m.test(setupStep)) problems.push('promotion-quality-gate.yml: reporter Node setup must use Node 24');
    if (!/^ {10}cache: npm\s*$/m.test(setupStep)) problems.push('promotion-quality-gate.yml: reporter Node setup must cache npm');
    if (!/^ {10}cache-dependency-path: package-lock\.json\s*$/m.test(setupStep)) problems.push('promotion-quality-gate.yml: reporter npm cache must use the root package-lock.json');
  }
  if (installIndex < 0 || reportIndex < 0 || !(setupIndex < installIndex && installIndex < reportIndex)) {
    problems.push('promotion-quality-gate.yml: reporter must configure Node, install root locked dependencies, then invoke the evidence reporter');
  }
  if (!block.includes('run: npm ci --ignore-scripts')) problems.push('promotion-quality-gate.yml: reporter must retain npm ci --ignore-scripts for root dependencies');

  for (const job of QUALITY_JOBS) {
    if (!block.includes(`needs.${job}.outputs.real_failures`)) {
      problems.push(`promotion-quality-gate.yml: reporter must preserve step failures from ${job}`);
    }
  }
  return problems;
}

function checkQualityJobFailureWiring(qualityWorkflowText) {
  const problems = [];
  for (const jobName of QUALITY_JOBS) {
    const block = findJobBlock(qualityWorkflowText, jobName);
    if (!block) continue;
    if (!block.includes('real_failures: ${{ steps.record_outcomes.outputs.real_failures }}')) {
      problems.push(`promotion-quality-gate.yml: ${jobName} must export the captured real step outcomes`);
    }
    const stepStarts = [...block.matchAll(/^      - /gm)].length;
    const stepIds = [
      ...[...block.matchAll(/^      - id: ([A-Za-z0-9_-]+)\s*$/gm)].map((match) => match[1]),
      ...[...block.matchAll(/^        id: ([A-Za-z0-9_-]+)\s*$/gm)].map((match) => match[1]),
    ];
    if (stepIds.length !== stepStarts) {
      problems.push(`promotion-quality-gate.yml: every step in ${jobName} must have an id for evidence reporting`);
    }
    const outcomeStep = block.match(/^      - name: Record real per-step outcomes[\s\S]*?(?=^      - |^  [A-Za-z0-9_-]+:|(?![\s\S]))/m)?.[0] || '';
    if (!outcomeStep.includes('id: record_outcomes') || !outcomeStep.includes('STEP_OUTCOMES: |')) {
      problems.push(`promotion-quality-gate.yml: ${jobName} must record step outcomes`);
      continue;
    }
    const reportedIds = new Set([...outcomeStep.matchAll(/steps\.([A-Za-z0-9_-]+)\.outcome/g)].map((match) => match[1]));
    for (const stepId of stepIds) {
      if (!['record_outcomes', 'stop_services'].includes(stepId) && !reportedIds.has(stepId)) {
        problems.push(`promotion-quality-gate.yml: ${jobName} does not report step ${stepId}`);
      }
    }
  }
  return problems;
}

function checkBackendMatrixResourceGuards(qualityWorkflowText) {
  const job = findJobBlock(qualityWorkflowText, 'dgfy-api-quality');
  if (!job) return ['promotion-quality-gate.yml: missing dgfy-api-quality job'];
  const stepsStart = job.indexOf('\n    steps:\n');
  const steps = stepsStart < 0 ? '' : job.slice(stepsStart);
  const chunks = steps.split(/\n(?= {6}- )/).slice(1);
  const matrix = chunks.find((chunk) => /\bid:\s*run_test_matrix\b/.test(chunk));
  if (!matrix) return ['promotion-quality-gate.yml: missing run_test_matrix step'];
  const problems = [];
  const nodeOptions = matrix.match(/^ {10}NODE_OPTIONS:\s*(.*)$/m)?.[1] || '';
  const heap = nodeOptions.match(/--max-old-space-size=(\d+)/);
  if (!heap || Number(heap[1]) < 1 || Number(heap[1]) > 4096) problems.push('promotion-quality-gate.yml: run_test_matrix must bound NODE_OPTIONS heap to 1–4096 MiB');
  const workers = matrix.match(/^ {10}BACKEND_TEST_MATRIX_FAST_MAX_WORKERS:\s*(\d+)\s*$/m)?.[1];
  if (!workers || Number(workers) < 2) problems.push('promotion-quality-gate.yml: run_test_matrix must set at least two fast-tier workers');
  const memory = matrix.match(/^ {10}BACKEND_TEST_MATRIX_FAST_WORKER_IDLE_MEMORY_LIMIT:\s*(\S+)\s*$/m)?.[1];
  if (!memory || !/^\d+(?:\.\d+)?[KMG]$/.test(memory)) problems.push('promotion-quality-gate.yml: run_test_matrix must set a worker idle memory limit');
  if (!matrix.includes('RELEASE_TARGET_SHA: ${{ github.sha }}')) problems.push('promotion-quality-gate.yml: run_test_matrix must bind evidence to github.sha');
  return problems;
}

function checkPrQualityWorkflow({ prChecksText, qualityWorkflowText, backendMatrixScriptText }) {
  return [
    ...REQUIRED_PR_CHECKS_MARKERS.filter((marker) => !prChecksText.includes(marker)).map((marker) => `pr-checks.yml:${marker}`),
    ...REQUIRED_QUALITY_MARKERS.filter((marker) => !qualityWorkflowText.includes(marker)).map((marker) => `promotion-quality-gate.yml:${marker}`),
    ...(!backendMatrixScriptText.includes('--detectOpenHandles')
      ? ['scripts/run-backend-test-matrix.js must retain --detectOpenHandles coverage']
      : []),
    ...checkRunnerCacheConsistency(prChecksText),
    ...checkDevelopPrLintJobMapping(prChecksText),
    ...checkOperatorDispatchShape(qualityWorkflowText),
    ...checkSelectiveDispatchShape(qualityWorkflowText),
    ...checkBackendMatrixResourceGuards(qualityWorkflowText),
    ...checkAllStepsAdvisory(qualityWorkflowText),
    ...checkQualityReporterShape(qualityWorkflowText),
    ...checkQualityJobFailureWiring(qualityWorkflowText),
  ];
}

function main() {
  const problems = checkPrQualityWorkflow({
    prChecksText: read('.github/workflows/pr-checks.yml'),
    qualityWorkflowText: read('.github/workflows/promotion-quality-gate.yml'),
    backendMatrixScriptText: read('scripts/run-backend-test-matrix.js'),
  });
  if (problems.length) {
    console.error('[pr-quality-workflow] FAILED');
    problems.forEach((problem) => console.error(` - ${problem}`));
    process.exit(1);
  }
  console.log('[pr-quality-workflow] OK. Promotion quality suite is operator-dispatched, has no automatic PR trigger, and every workflow step is advisory with PR evidence reporting.');
}

if (require.main === module) main();

module.exports = {
  checkPrQualityWorkflow,
  checkOperatorDispatchShape,
  checkSelectiveDispatchShape,
  checkAllStepsAdvisory,
  checkQualityReporterShape,
  checkQualityJobFailureWiring,
  checkRunnerCacheConsistency,
  checkDevelopPrLintJobMapping,
  checkBackendMatrixResourceGuards,
  DEVELOP_PR_LINT_JOB_BY_APP,
  QUALITY_JOBS,
};
