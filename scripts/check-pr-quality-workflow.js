#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

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
const REQUIRED_PR_CHECKS_MARKERS = [
  'runner_labels_json: *runner_heavy'
];
const REQUIRED_QUALITY_MARKERS = [
  'workflow_call:',
  // #1018: the promotion-detection gate job, and its two head-prefix literals -- see
  // checkPromotionPrefixSync below, which cross-checks these against
  // check-compliance-impact.js's own PROMOTION_HEAD_PREFIX_BY_BASE so the two can't silently
  // drift apart.
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

/**
 * #1018 (RF-3, PR #1036 review): promotion-quality-gate.yml's `gate` job hand-mirrors
 * check-compliance-impact.js's PROMOTION_HEAD_PREFIX_BY_BASE literals (to-staging/, release/)
 * rather than importing the constant -- that script has no module.exports and runs to
 * completion on require(), so it can't be safely required as a module.
 *
 * A prior version of this guard only checked that both files contained the substrings
 * 'to-staging/' and 'release/' *somewhere* -- that passes even if the base<->prefix mapping is
 * swapped (staging<->to-staging and main<->release exchanged), if a literal occurs only in a
 * comment, or if one side adds a third promotion shape the other doesn't know about. This version
 * extracts the actual base->prefix pairs from PROMOTION_HEAD_PREFIX_BY_BASE's own source text and
 * asserts the gate job's shell `case` statement matches each pair specifically, in the right
 * association -- not just that the substrings exist independently.
 *
 * @param {string} complianceScriptText contents of scripts/check-compliance-impact.js
 * @param {string} qualityWorkflowText contents of .github/workflows/promotion-quality-gate.yml
 * @returns {string[]} human-readable problems found; empty when in sync
 */
function checkPromotionPrefixSync(complianceScriptText, qualityWorkflowText) {
  const problems = [];

  const prefixBlockMatch = complianceScriptText.match(
    /PROMOTION_HEAD_PREFIX_BY_BASE\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/
  );
  if (!prefixBlockMatch) {
    problems.push(
      'scripts/check-compliance-impact.js: could not find PROMOTION_HEAD_PREFIX_BY_BASE -- did the ' +
      'constant get renamed or restructured? promotion-quality-gate.yml\'s `gate` job hand-mirrors it ' +
      'and needs updating to match.'
    );
    return problems;
  }

  // Matches e.g. `staging: /^to-staging\//` -> { base: 'staging', prefix: 'to-staging' }.
  const pairs = [...prefixBlockMatch[1].matchAll(/(\w+):\s*\/\^([^/]+)\\\//g)]
    .map(([, base, prefix]) => ({ base, prefix }));
  if (pairs.length === 0) {
    problems.push(
      'scripts/check-compliance-impact.js: PROMOTION_HEAD_PREFIX_BY_BASE exists but no base->prefix ' +
      'pairs could be parsed out of it -- its literal shape changed in a way this guard\'s regex ' +
      'no longer understands; update the regex in scripts/check-pr-quality-workflow.js.'
    );
    return problems;
  }

  for (const { base, prefix } of pairs) {
    // Bounded-branch match, not "both substrings exist anywhere" and not an open-ended proximity
    // window either (an earlier version of this used `[\s\S]{0,200}?`, which is wide enough to
    // match a LATER, unrelated base's branch -- e.g. "staging)"'s window could still reach past
    // its own `;;` terminator into "main)"'s branch and find that branch's own prefix, silently
    // passing a swapped mapping). This instead extracts only the text between `<base>)` and the
    // next `;;` that closes it -- matching promotion-quality-gate.yml's actual nested-case shape
    // (outer case on $BASE_REF, inner case on $HEAD_REF, each outer branch closed by `;;`) -- and
    // checks the prefix only within that bounded slice. `<base>\)` (not `<prefix>\)`) is still
    // required as the anchor: one prefix can be a substring of another base name (e.g. "staging"
    // inside "to-staging"), but `to-staging/*)` never contains the literal `staging)` (it has
    // `staging/*)`, not `staging)`), so the anchor itself can't cross-match.
    const branchMatch = qualityWorkflowText.match(new RegExp(`${base}\\)([\\s\\S]*?);;`));
    if (!branchMatch || !branchMatch[1].includes(`${prefix}/*`)) {
      problems.push(
        `promotion-quality-gate.yml: gate job's case statement does not match base "${base}" -> ` +
        `head prefix "${prefix}/*" -- out of sync with check-compliance-impact.js's ` +
        'PROMOTION_HEAD_PREFIX_BY_BASE; update the gate job\'s case statement to match.'
      );
    }
  }

  return problems;
}

function checkRunnerCacheConsistency(prChecksText) {
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
  const problems = [];
  const runnerHeavyMatch = prChecksText.match(/RUNNER_HEAVY_JSON:\s*&runner_heavy\s*'([^']*)'/);
  const cacheFromMatch = prChecksText.match(/BUILD_CACHE_FROM:\s*&build_cache_from\s*'([^']*)'/);
  if (!runnerHeavyMatch || !cacheFromMatch) {
    problems.push('pr-checks.yml: could not find RUNNER_HEAVY_JSON/BUILD_CACHE_FROM anchors to check runner/cache consistency (#726) -- did an anchor name change?');
    return problems;
  }
  const isHosted = /ubuntu-latest|windows-latest|macos-latest/.test(runnerHeavyMatch[1]);
  const hasCache = cacheFromMatch[1].trim() !== '';
  if (!isHosted && hasCache) {
    problems.push('pr-checks.yml: RUNNER_HEAVY_JSON is self-hosted but BUILD_CACHE_FROM is non-empty -- this reproduces #726 (the Actions cache costs ~21x the build it skips on self-hosted). Flip BUILD_CACHE_FROM back to empty, or confirm the runner anchor is actually meant to be hosted.');
  }
  if (isHosted && !hasCache) {
    problems.push("pr-checks.yml: RUNNER_HEAVY_JSON is hosted but BUILD_CACHE_FROM is empty -- hosted runners are ephemeral with no local layer cache at all, so this throws away a real cache hit for nothing. Flip BUILD_CACHE_FROM back to 'type=gha'.");
  }
  return problems;
}

function checkPrQualityWorkflow({ prChecksText, complianceScriptText, qualityWorkflowText }) {
  const missing = [
    ...REQUIRED_PR_CHECKS_MARKERS.filter((marker) => !prChecksText.includes(marker)).map((marker) => `pr-checks.yml:${marker}`),
    ...REQUIRED_QUALITY_MARKERS.filter((marker) => !qualityWorkflowText.includes(marker)).map((marker) => `promotion-quality-gate.yml:${marker}`),
    ...checkPromotionPrefixSync(complianceScriptText, qualityWorkflowText),
    ...checkRunnerCacheConsistency(prChecksText)
  ];

  if (qualityWorkflowText.includes('continue-on-error')) {
    missing.push('promotion-quality-gate.yml:continue-on-error is forbidden for blocking quality gates');
  }

  return missing;
}

function main() {
  const prChecksText = read('.github/workflows/pr-checks.yml');
  const complianceScriptText = read('scripts/check-compliance-impact.js');
  // Renamed from pr-quality-checks.yml (#1018/#1008 Phase 3) once it became the promotion-time CI
  // gate instead of a workflow_dispatch-only manual run -- this checker's own path must follow.
  const qualityWorkflowText = read('.github/workflows/promotion-quality-gate.yml');

  const missing = checkPrQualityWorkflow({ prChecksText, complianceScriptText, qualityWorkflowText });

  if (missing.length > 0) {
    console.error('[pr-quality-workflow] FAILED');
    missing.forEach((entry) => console.error(` - ${entry}`));
    process.exit(1);
  }

  console.log('[pr-quality-workflow] OK. Blocking promotion quality gate contains all required gates.');
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPrQualityWorkflow,
  checkPromotionPrefixSync,
  checkRunnerCacheConsistency,
  REQUIRED_PR_CHECKS_MARKERS,
  REQUIRED_QUALITY_MARKERS
};
