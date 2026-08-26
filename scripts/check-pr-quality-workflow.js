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
// gate and, until 2026-08-25 (#1003), was required to never be
// continue-on-error at all, whether invoked automatically (a real promotion
// PR), manually (workflow_dispatch), or via a workflow_call caller.
//
// 2026-08-26 (#1063), temporary: two deliberate relaxations now exist, checked by
// checkStagingLegSkipShape below rather than the old blanket forbid:
//   - every quality job's `if:` must additionally exclude the staging leg
//     (`&& needs.gate.outputs.is_staging_leg != 'true'`) -- skipped entirely there.
//   - every quality job must carry `continue-on-error: true` -- advisory (never blocking) on
//     every leg it does run on (release/*->main, and any workflow_dispatch/workflow_call).
// Net effect, stated plainly: no leg currently has a blocking run of this workflow. This keeps
// the #1003-class guard intact in spirit (a job missing either piece, or carrying some other
// `if`/`continue-on-error` form, still fails this check) -- it does not mean "anything goes."
// Revert `checkStagingLegSkipShape` to the original blanket forbid once #1063 closes.
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
  'is_staging_leg',
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

// #1063 (2026-08-26), temporary: every quality job must carry exactly these two lines --
// skipped entirely on the staging soak leg, unconditionally advisory everywhere it does run.
const SANCTIONED_SKIP_STAGING_IF =
  "if: needs.gate.outputs.is_promotion == 'true' && needs.gate.outputs.is_staging_leg != 'true'";
const SANCTIONED_CONTINUE_ON_ERROR = 'continue-on-error: true';

// The six jobs promotion-quality-gate.yml actually gates -- kept as its own list (rather than
// filtering REQUIRED_QUALITY_MARKERS, which also holds non-job-name strings) so this function
// reads as "here are the jobs" rather than "here's a marker list that happens to include them."
const QUALITY_JOB_NAMES = [
  'dgfy-api-quality',
  'migration-runner-quality',
  'frontend-ims-quality',
  'frontend-pos-quality',
  'frontend-storefront-quality',
  'repository-quality'
];

/**
 * #1063 (2026-08-26), temporary: replaces the old blanket "continue-on-error anywhere in this
 * file is forbidden" check. That blanket form is what #1003 needed (a `quality-checks:` job had
 * been re-added unconditional and unfiltered -- any continue-on-error at all was suspect). Now
 * that a deliberate, on-purpose relaxation exists -- skip entirely on the develop->staging leg,
 * advisory (continue-on-error) on every leg it does run on -- forbidding the substring outright
 * would just fail on the legitimate case, so this checks the *shape* instead: every quality job
 * must carry both the staging-skip `if:` and an unconditional `continue-on-error: true`, exactly.
 * A job missing either line, carrying more than one of either, or using some other `if`/
 * `continue-on-error` form all still fail this check -- that's what keeps a further, undocumented
 * drift (e.g. someone re-narrowing the skip to only some jobs, or reintroducing a blocking job by
 * accident) from slipping back in unnoticed. Revert this back to the original blanket forbid once
 * #1063 closes and both lines are removed from every job.
 *
 * @param {string} qualityWorkflowText contents of .github/workflows/promotion-quality-gate.yml
 * @returns {string[]} human-readable problems found; empty when every quality job's shape is sanctioned
 */
function checkStagingLegSkipShape(qualityWorkflowText) {
  const problems = [];
  for (const name of QUALITY_JOB_NAMES) {
    // Job block = from "  <name>:\n" up to (not including) the next top-level (2-space-indented)
    // job header, or end of file. Mirrors checkPromotionPrefixSync's own "bounded slice, not an
    // open-ended proximity window" reasoning above.
    const blockMatch = qualityWorkflowText.match(
      new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z][\\w-]*:\\n|$)`)
    );
    if (!blockMatch) {
      problems.push(
        `promotion-quality-gate.yml: could not find the "${name}:" job block -- was it renamed or ` +
        'restructured? checkStagingLegSkipShape needs updating to match.'
      );
      continue;
    }
    const block = blockMatch[1];

    // Anchored to exactly 4-space (job-level) indentation, not `\s*` -- a quality job's steps
    // legitimately carry their own step-level `if:`/`continue-on-error:` lines at deeper
    // indentation (e.g. `if: always()` on an upload-artifact step, or the whitespace-check step's
    // `if: github.event_name == 'pull_request'`), which must not be mistaken for the job-level one.
    const ifLines = block.match(/^ {4}if:.*$/gm) || [];
    if (ifLines.length !== 1 || ifLines[0].trim() !== SANCTIONED_SKIP_STAGING_IF) {
      problems.push(
        `promotion-quality-gate.yml: "${name}"'s \`if:\` must be exactly ` +
        `\`${SANCTIONED_SKIP_STAGING_IF}\` (found: ${ifLines.length === 0 ? 'none' : ifLines.map((l) => `\`${l.trim()}\``).join(', ')}) ` +
        '-- #1063 requires every quality job to skip entirely on the develop->staging soak leg.'
      );
    }

    const coeLines = block.match(/^ {4}continue-on-error:.*$/gm) || [];
    if (coeLines.length !== 1 || coeLines[0].trim() !== SANCTIONED_CONTINUE_ON_ERROR) {
      problems.push(
        `promotion-quality-gate.yml: "${name}"'s \`continue-on-error:\` must be exactly ` +
        `\`${SANCTIONED_CONTINUE_ON_ERROR}\` (found: ${coeLines.length === 0 ? 'none' : coeLines.map((l) => `\`${l.trim()}\``).join(', ')}) ` +
        '-- #1063 requires every quality job to be unconditionally advisory on every leg it runs on.'
      );
    }
  }
  return problems;
}

function checkPrQualityWorkflow({ prChecksText, complianceScriptText, qualityWorkflowText }) {
  const missing = [
    ...REQUIRED_PR_CHECKS_MARKERS.filter((marker) => !prChecksText.includes(marker)).map((marker) => `pr-checks.yml:${marker}`),
    ...REQUIRED_QUALITY_MARKERS.filter((marker) => !qualityWorkflowText.includes(marker)).map((marker) => `promotion-quality-gate.yml:${marker}`),
    ...checkPromotionPrefixSync(complianceScriptText, qualityWorkflowText),
    ...checkRunnerCacheConsistency(prChecksText),
    ...checkStagingLegSkipShape(qualityWorkflowText)
  ];

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

  console.log('[pr-quality-workflow] OK. Promotion quality gate contains all required gates and matches the sanctioned #1063 shape (skipped on the staging leg, advisory everywhere it runs).');
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPrQualityWorkflow,
  checkPromotionPrefixSync,
  checkRunnerCacheConsistency,
  checkStagingLegSkipShape,
  SANCTIONED_SKIP_STAGING_IF,
  SANCTIONED_CONTINUE_ON_ERROR,
  QUALITY_JOB_NAMES,
  REQUIRED_PR_CHECKS_MARKERS,
  REQUIRED_QUALITY_MARKERS
};
