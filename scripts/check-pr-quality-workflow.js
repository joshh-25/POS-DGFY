#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const prChecks = read('.github/workflows/pr-checks.yml');
const qualityWorkflow = read('.github/workflows/pr-quality-checks.yml');

// Originally also required `quality-checks:` / `uses: ./.github/workflows/
// pr-quality-checks.yml` to exist in pr-checks.yml -- i.e. that this
// workflow stay wired into the PR pipeline, even while disabled via
// `if: false`. That job was removed outright 2026-08-14 (#416): a job
// that's permanently skipped is still a row in every PR's Checks tab
// asserting nothing, and Pat asked to stop showing it rather than keep it
// wired-but-disabled. Dropped that half of the assertion accordingly.
// `requiredQualityMarkers` below is the half that actually matters and
// stays fully enforced: pr-quality-checks.yml itself must keep every real
// gate and must never be continue-on-error, whether it's invoked
// automatically, manually (workflow_dispatch), or re-wired into a caller
// again later.
const requiredPrChecks = [
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
