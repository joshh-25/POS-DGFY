#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const prChecks = read('.github/workflows/pr-checks.yml');
const complianceScript = read('scripts/check-compliance-impact.js');
// Renamed from pr-quality-checks.yml (#1018/#1008 Phase 3) once it became the promotion-time CI
// gate instead of a workflow_dispatch-only manual run -- this checker's own path must follow.
const qualityWorkflow = read('.github/workflows/promotion-quality-gate.yml');

// Originally also required `quality-checks:` / `uses: ./.github/workflows/
// pr-quality-checks.yml` to exist in pr-checks.yml -- i.e. that this
// workflow stay wired into the PR pipeline, even while disabled via
// `if: false`. That job was removed outright 2026-08-14 (#416): a job
// that's permanently skipped is still a row in every PR's Checks tab
// asserting nothing, and Pat asked to stop showing it rather than keep it
// wired-but-disabled. Dropped that half of the assertion accordingly.
// `requiredQualityMarkers` below is the half that actually matters and
// stays fully enforced: promotion-quality-gate.yml itself must keep every real
// gate and must never be continue-on-error, whether it's invoked
// automatically (a real promotion PR), manually (workflow_dispatch), or via
// a workflow_call caller.
const requiredPrChecks = [
  'runner_labels_json: *runner_heavy'
];
const requiredQualityMarkers = [
  'workflow_call:',
  // #1018: the promotion-detection gate job, and its two head-prefix literals -- see the
  // sync guard below, which cross-checks these against check-compliance-impact.js's own
  // PROMOTION_HEAD_PREFIX_BY_BASE so the two can't silently drift apart.
  'gate:',
  'is_promotion',
  'to-staging/*',
  'release/*',
  'needs: gate',
  "if: needs.gate.outputs.is_promotion == 'true'",
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
  ...requiredQualityMarkers.filter((marker) => !qualityWorkflow.includes(marker)).map((marker) => `promotion-quality-gate.yml:${marker}`)
];

// #1018: promotion-quality-gate.yml's `gate` job hand-mirrors
// check-compliance-impact.js's PROMOTION_HEAD_PREFIX_BY_BASE literals (to-staging/, release/)
// rather than importing the constant -- that script has no module.exports and runs to
// completion on require(), so it can't be safely required as a module. Best-effort sync guard:
// if either file's copy of these literals goes missing, something changed one side without the
// other and this should fail loudly instead of the two definitions drifting apart silently.
if (!complianceScript.includes('to-staging/') || !complianceScript.includes('release/')) {
  missing.push(
    'scripts/check-compliance-impact.js: no longer contains the to-staging// release/ prefix ' +
    'literals promotion-quality-gate.yml\'s `gate` job mirrors -- PROMOTION_HEAD_PREFIX_BY_BASE ' +
    'may have changed; update the gate job\'s case statement to match.'
  );
}

// #726: RUNNER_HEAVY_JSON and BUILD_CACHE_FROM are a paired flip, not two independent anchors --
// the cache backend's viability depends on which runner tier is active (empty/no-cache on
// self-hosted, 'type=gha' on hosted; see docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md). A half-flip
// silently reproduces either #726's outage (self-hosted + network cache back on) or throws away a
// real cache hit for nothing (hosted + no cache). Checked here, not just documented, because a
// documented-only invariant is exactly the kind of thing a fast anchor edit skips reading first.
//
// #923 (2026-08-23): RUNNER_HEAVY_JSON no longer carries the literal 'self-hosted' label --
// self-hosted is implicit for a runner that carries any custom label (sieitz-lg/sieitz-runner;
// hosted runners can't be assigned custom labels at all), so the array now reads e.g.
// '["sieitz-lg"]' rather than '["self-hosted", "sieitz-lg"]'. Detect hosted-vs-self-hosted by the
// presence of a GitHub-hosted runner image name instead of the (now absent) 'self-hosted' string --
// this is also what the documented revert-to-hosted procedure actually swaps in (e.g.
// '["ubuntu-latest"]'), so it's the real signal, not a proxy for it.
const runnerHeavyMatch = prChecks.match(/RUNNER_HEAVY_JSON:\s*&runner_heavy\s*'([^']*)'/);
const cacheFromMatch = prChecks.match(/BUILD_CACHE_FROM:\s*&build_cache_from\s*'([^']*)'/);
if (!runnerHeavyMatch || !cacheFromMatch) {
  missing.push('pr-checks.yml: could not find RUNNER_HEAVY_JSON/BUILD_CACHE_FROM anchors to check runner/cache consistency (#726) -- did an anchor name change?');
} else {
  const isHosted = /ubuntu-latest|windows-latest|macos-latest/.test(runnerHeavyMatch[1]);
  const hasCache = cacheFromMatch[1].trim() !== '';
  if (!isHosted && hasCache) {
    missing.push('pr-checks.yml: RUNNER_HEAVY_JSON is self-hosted but BUILD_CACHE_FROM is non-empty -- this reproduces #726 (the Actions cache costs ~21x the build it skips on self-hosted). Flip BUILD_CACHE_FROM back to empty, or confirm the runner anchor is actually meant to be hosted.');
  }
  if (isHosted && !hasCache) {
    missing.push("pr-checks.yml: RUNNER_HEAVY_JSON is hosted but BUILD_CACHE_FROM is empty -- hosted runners are ephemeral with no local layer cache at all, so this throws away a real cache hit for nothing. Flip BUILD_CACHE_FROM back to 'type=gha'.");
  }
}

if (qualityWorkflow.includes('continue-on-error')) {
  missing.push('promotion-quality-gate.yml:continue-on-error is forbidden for blocking quality gates');
}

if (missing.length > 0) {
  console.error('[pr-quality-workflow] FAILED');
  missing.forEach((entry) => console.error(` - ${entry}`));
  process.exit(1);
}

console.log('[pr-quality-workflow] OK. Blocking promotion quality gate contains all required gates.');
