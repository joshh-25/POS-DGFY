#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const prChecks = read('.github/workflows/pr-checks.yml');
const qualityWorkflow = read('.github/workflows/pr-quality-checks.yml');

const requiredPrChecks = [
  'quality-checks:',
  'uses: ./.github/workflows/pr-quality-checks.yml',
  'runner_labels_json: *runner_heavy'
];
const requiredQualityMarkers = [
  'workflow_call:',
  'dgfy-api-quality:',
  'migration-runner-quality:',
  'frontend-quality:',
  'repository-quality:',
  'node scripts/run-backend-test-matrix.js',
  '--detectOpenHandles',
  'npm run audit:indexes',
  'npm run lint:docs',
  'npm run check:compat-seams',
  'npx vitest run',
  'fnbMode.contract.test.js',
  'posFnbModifierManager.session.test.jsx',
  'npm run build:all',
  'npx playwright install --with-deps chromium',
  'npm run test:e2e:fnb-contract',
  'fnb-playwright-contract-',
  'git diff --check'
];

const missing = [
  ...requiredPrChecks.filter((marker) => !prChecks.includes(marker)).map((marker) => `pr-checks.yml:${marker}`),
  ...requiredQualityMarkers.filter((marker) => !qualityWorkflow.includes(marker)).map((marker) => `pr-quality-checks.yml:${marker}`)
];

if (qualityWorkflow.includes('continue-on-error')) {
  missing.push('pr-quality-checks.yml:continue-on-error is forbidden for blocking quality gates');
}

if (missing.length > 0) {
  console.error('[pr-quality-workflow] FAILED');
  missing.forEach((entry) => console.error(` - ${entry}`));
  process.exit(1);
}

console.log('[pr-quality-workflow] OK. Blocking PR quality workflow contains all required gates.');
