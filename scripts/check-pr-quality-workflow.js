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
  'frontend-ims-quality:',
  'frontend-pos-quality:',
  'frontend-storefront-quality:',
  'repository-quality:',
  'node scripts/run-backend-test-matrix.js',
  '--detectOpenHandles',
  'npm run audit:indexes',
  'npm run lint:docs',
  'npm run check:compat-seams',
  'npm run report:frontend-split-sync:post-merge',
  'npx vitest run',
  'fnbMode.contract.test.js',
  'posFnbModifierManager.session.test.jsx',
  'npm run build',
  'npx playwright install --with-deps chromium',
  'npm run test:e2e:fnb-contract',
  'fnb-playwright-contract-',
  'git diff --check'
];

const missing = [
  ...requiredPrChecks.filter((marker) => !prChecks.includes(marker)).map((marker) => `pr-checks.yml:${marker}`),
  ...requiredQualityMarkers.filter((marker) => !qualityWorkflow.includes(marker)).map((marker) => `pr-quality-checks.yml:${marker}`)
];

// #726: RUNNER_HEAVY_JSON and BUILD_CACHE_FROM are a paired flip, not two independent anchors --
// the cache backend's viability depends on which runner tier is active (empty/no-cache on
// self-hosted, 'type=gha' on hosted; see docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md). A half-flip
// silently reproduces either #726's outage (self-hosted + network cache back on) or throws away a
// real cache hit for nothing (hosted + no cache). Checked here, not just documented, because a
// documented-only invariant is exactly the kind of thing a fast anchor edit skips reading first.
const runnerHeavyMatch = prChecks.match(/RUNNER_HEAVY_JSON:\s*&runner_heavy\s*'([^']*)'/);
const cacheFromMatch = prChecks.match(/BUILD_CACHE_FROM:\s*&build_cache_from\s*'([^']*)'/);
if (!runnerHeavyMatch || !cacheFromMatch) {
  missing.push('pr-checks.yml: could not find RUNNER_HEAVY_JSON/BUILD_CACHE_FROM anchors to check runner/cache consistency (#726) -- did an anchor name change?');
} else {
  const isSelfHosted = runnerHeavyMatch[1].includes('self-hosted');
  const hasCache = cacheFromMatch[1].trim() !== '';
  if (isSelfHosted && hasCache) {
    missing.push('pr-checks.yml: RUNNER_HEAVY_JSON is self-hosted but BUILD_CACHE_FROM is non-empty -- this reproduces #726 (the Actions cache costs ~21x the build it skips on self-hosted). Flip BUILD_CACHE_FROM back to empty, or confirm the runner anchor is actually meant to be hosted.');
  }
  if (!isSelfHosted && !hasCache) {
    missing.push("pr-checks.yml: RUNNER_HEAVY_JSON is hosted but BUILD_CACHE_FROM is empty -- hosted runners are ephemeral with no local layer cache at all, so this throws away a real cache hit for nothing. Flip BUILD_CACHE_FROM back to 'type=gha'.");
  }
}

if (qualityWorkflow.includes('continue-on-error')) {
  missing.push('pr-quality-checks.yml:continue-on-error is forbidden for blocking quality gates');
}

if (missing.length > 0) {
  console.error('[pr-quality-workflow] FAILED');
  missing.forEach((entry) => console.error(` - ${entry}`));
  process.exit(1);
}

console.log('[pr-quality-workflow] OK. Blocking PR quality workflow contains all required gates.');
