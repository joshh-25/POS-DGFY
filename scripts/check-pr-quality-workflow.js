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
//
// 2026-08-26 (#1066 follow-up): the job-level `continue-on-error: true` above turned out to be
// necessary but not sufficient -- confirmed live on #1066 that it doesn't change the job's own
// check-run conclusion (GitHub only spares the *workflow run's* rollup), so a genuinely-failing
// job still reported `failure` to the PR and left `mergeStateStatus: UNSTABLE`, defeating the
// whole point of #1063. Fixed in promotion-quality-gate.yml by adding `continue-on-error: true` to
// every individual step in every quality job (that's what actually keeps a step's failure from
// rolling into its job's conclusion). checkStepLevelAdvisory below enforces that every step-start
// in a quality job (and gate's own step) has a matching step-level continue-on-error line, so a
// newly-added step that's missing it fails CI instead of silently reintroducing a blocking check.
//
// 2026-08-26 (#1066 RF-2/RF-4, second pr-reviewer round on PR #1068): two more corrections.
// RF-2 -- the mysql/redis `services:` blocks on dgfy-api-quality/migration-runner-quality were
// left as a documented "accepted residual gap" (service-container provisioning happens before any
// step runs, outside continue-on-error's reach at any level) instead of actually fixed; the
// reviewer correctly refused a PR-body declaration as a substitute for fixing it. Both `services:`
// blocks are now replaced with ordinary steps (start/wait/stop), so checkStepLevelAdvisory's
// existing count-based guard already covers them -- no new check needed for that half.
// RF-4 (should-fix) -- checkStepLevelAdvisory only ever compared *counts* (step-starts vs
// continue-on-error lines), which passes even if a step's id is missing, or STEP_OUTCOMES drops or
// misspells one, or report-advisory-failures loses a needs: entry or an env: input -- silent signal
// loss, the exact failure mode this whole mechanism exists to prevent. checkAdvisoryFailureReportingShape
// below traces the full id -> STEP_OUTCOMES -> outputs.real_failures -> report-advisory-failures
// chain end to end, per quality job, to close that gap.
// Revert all three checks alongside checkStagingLegSkipShape once #1063 closes -- everything this
// comment describes goes back to nothing at the same time.
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

// 2026-08-26 (#1066 follow-up): `gate` legitimately has a different `if:` shape than the six
// quality jobs (it has none -- it's what produces is_promotion/is_staging_leg, not consumes them),
// so it stays out of QUALITY_JOB_NAMES/checkStagingLegSkipShape. But its own single step is a
// user-controllable step like any other and needed the same step-level continue-on-error fix --
// this list is checkStepLevelAdvisory's own job set, a superset of QUALITY_JOB_NAMES, kept
// separate rather than folding `gate` into the shared list and having to special-case it out of
// checkStagingLegSkipShape instead.
const ADVISORY_JOB_NAMES = [...QUALITY_JOB_NAMES, 'gate'];

// A step deliberately excluded from a job's own STEP_OUTCOMES/real_failures reporting -- teardown
// only, `|| true`-guarded so it can't meaningfully report `failure`, and reporting it would risk
// exactly the false-positive noise on #1063 this mechanism exists to avoid (a benign double-remove
// racing another cleanup path). checkAdvisoryFailureReportingShape treats this id as expected to be
// *absent* from STEP_OUTCOMES, not missing.
const REPORTING_EXCLUDED_STEP_ID = 'stop_services';
const REPORTER_JOB_NAME = 'report-advisory-failures';

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

/**
 * #1066 follow-up (2026-08-26): job-level `continue-on-error` (checked above) doesn't change a
 * job's own check-run conclusion -- only step-level `continue-on-error: true` on every step in the
 * job does (see this file's own top-of-file comment, and promotion-quality-gate.yml's, for the
 * full "why"). This asserts the shape: every step-start (`      - ` at 6-space indent) in an
 * advisory job block (the six quality jobs, plus `gate` itself -- see ADVISORY_JOB_NAMES) has
 * exactly one matching step-level `continue-on-error: true` line (`        ` at 8-space indent)
 * before the next step starts -- a mismatch means at least one step is missing it (the exact
 * regression this guard exists to catch before it ships), or, less likely, a copy/paste duplicated
 * the line inside one step.
 *
 * @param {string} qualityWorkflowText contents of .github/workflows/promotion-quality-gate.yml
 * @returns {string[]} human-readable problems found; empty when every step is covered
 */
function checkStepLevelAdvisory(qualityWorkflowText) {
  const problems = [];
  for (const name of ADVISORY_JOB_NAMES) {
    const blockMatch = qualityWorkflowText.match(
      new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z][\\w-]*:\\n|$)`)
    );
    if (!blockMatch) {
      // Already reported by checkStagingLegSkipShape above -- don't double-report the same
      // missing/renamed job block here.
      continue;
    }
    const block = blockMatch[1];
    const stepsIndex = block.indexOf('\n    steps:\n');
    if (stepsIndex === -1) {
      problems.push(`promotion-quality-gate.yml: "${name}" has no \`steps:\` block -- was it restructured?`);
      continue;
    }
    const stepsBlock = block.slice(stepsIndex);
    const stepStarts = stepsBlock.match(/^ {6}-/gm) || [];
    const stepLevelCoeLines = stepsBlock.match(/^ {8}continue-on-error: true$/gm) || [];
    if (stepStarts.length === 0) {
      problems.push(`promotion-quality-gate.yml: "${name}" has a \`steps:\` block but no steps were found -- checkStepLevelAdvisory needs updating to match.`);
      continue;
    }
    if (stepLevelCoeLines.length !== stepStarts.length) {
      problems.push(
        `promotion-quality-gate.yml: "${name}" has ${stepStarts.length} step(s) but only ` +
        `${stepLevelCoeLines.length} step-level \`continue-on-error: true\` line(s) -- #1066 requires ` +
        'every step in a quality job to carry its own, not just the job-level line (job-level alone ' +
        "doesn't keep the job's check-run conclusion green when a step fails)."
      );
    }
  }
  return problems;
}

/**
 * RF-4 (2026-08-26, pr-reviewer second round, PR #1068 should-fix): checkStepLevelAdvisory above
 * only ever compares *counts* -- a job with N steps and N step-level continue-on-error lines passes
 * even if one step's id was dropped, or STEP_OUTCOMES lists the wrong id, or
 * report-advisory-failures loses a `needs:` entry or an `env:` input for one job. Any of those is
 * silent signal loss -- the exact failure mode the id -> STEP_OUTCOMES -> outputs.real_failures ->
 * report-advisory-failures mechanism exists to prevent, and none of it would fail this check
 * before this function existed. Traces that whole chain end to end, per quality job:
 *   1. every step has an `id:`, and the job's last step is `record_outcomes` (it reads
 *      steps.<id>.outcome for every earlier step, so it must run last to see them all);
 *   2. the job declares `outputs.real_failures: ${{ steps.record_outcomes.outputs.real_failures }}`;
 *   3. STEP_OUTCOMES references `steps.<id>.outcome` exactly once for every step id except
 *      REPORTING_EXCLUDED_STEP_ID, and references no id outside that set (catches both a dropped
 *      mapping and a stale/renamed one);
 *   4. report-advisory-failures' `needs:` includes the job, its `env:` references
 *      `needs.<job>.outputs.real_failures` exactly once, and the job name appears in an
 *      `add_if_present` call (read into an env var but never actually surfaced is its own silent
 *      loss, distinct from never being read at all);
 *   5. report-advisory-failures' own step still carries `continue-on-error: true` (RF-2b) -- a
 *      `gh` hiccup there must never itself become a new blocking check.
 *
 * @param {string} qualityWorkflowText contents of .github/workflows/promotion-quality-gate.yml
 * @returns {string[]} human-readable problems found; empty when every job's reporting chain is intact
 */
function checkAdvisoryFailureReportingShape(qualityWorkflowText) {
  const problems = [];

  const reporterMatch = qualityWorkflowText.match(
    new RegExp(`\\n  ${REPORTER_JOB_NAME}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z][\\w-]*:\\n|$)`)
  );
  if (!reporterMatch) {
    problems.push(
      `promotion-quality-gate.yml: could not find the "${REPORTER_JOB_NAME}:" job block -- was it ` +
      'renamed or restructured? checkAdvisoryFailureReportingShape needs updating to match.'
    );
  } else {
    const reporterBlock = reporterMatch[1];
    const reporterStepsIndex = reporterBlock.indexOf('\n    steps:\n');
    const reporterStepsBlock = reporterStepsIndex === -1 ? '' : reporterBlock.slice(reporterStepsIndex);
    const reporterStepCoe = reporterStepsBlock.match(/^ {8}continue-on-error: true$/gm) || [];
    if (reporterStepCoe.length !== 1) {
      problems.push(
        `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}"'s single step must carry exactly one ` +
        `step-level \`continue-on-error: true\` (found ${reporterStepCoe.length}) -- a \`gh\` hiccup ` +
        'there must not itself become a new blocking check (RF-2b).'
      );
    }
  }
  const reporterBlock = reporterMatch ? reporterMatch[1] : '';

  for (const name of QUALITY_JOB_NAMES) {
    const blockMatch = qualityWorkflowText.match(
      new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z][\\w-]*:\\n|$)`)
    );
    if (!blockMatch) {
      // Already reported by checkStagingLegSkipShape above -- don't double-report.
      continue;
    }
    const block = blockMatch[1];
    const stepsIndex = block.indexOf('\n    steps:\n');
    if (stepsIndex === -1) {
      // Already reported by checkStepLevelAdvisory above -- don't double-report.
      continue;
    }
    const stepsBlock = block.slice(stepsIndex);

    // One id per step, in encounter order -- whichever line in the chunk carries `id:` (either
    // `- id: x` on the step-start line itself, or `id: x` on its own line further down).
    const stepChunks = stepsBlock.split(/\n(?= {6}- )/).slice(1);
    const ids = stepChunks.map((chunk) => {
      const idMatch = chunk.match(/\bid:\s*(\S+)/);
      return idMatch ? idMatch[1] : null;
    });

    if (ids.some((id) => id === null)) {
      problems.push(
        `promotion-quality-gate.yml: "${name}" has a step with no \`id:\` -- ` +
        'checkAdvisoryFailureReportingShape cannot trace it into STEP_OUTCOMES/outputs.real_failures ' +
        '(checkStepLevelAdvisory only checks continue-on-error counts, not ids).'
      );
      continue;
    }

    if (ids[ids.length - 1] !== 'record_outcomes') {
      problems.push(
        `promotion-quality-gate.yml: "${name}"'s last step must be \`id: record_outcomes\` (found: ` +
        `\`${ids[ids.length - 1]}\`) -- it reads steps.<id>.outcome for every earlier step, so it must ` +
        'run last to see them all.'
      );
    }

    if (!new RegExp('real_failures:\\s*\\$\\{\\{\\s*steps\\.record_outcomes\\.outputs\\.real_failures\\s*\\}\\}').test(block)) {
      problems.push(
        `promotion-quality-gate.yml: "${name}" has no ` +
        '`outputs.real_failures: ${{ steps.record_outcomes.outputs.real_failures }}` -- ' +
        `"${REPORTER_JOB_NAME}" reads it via needs.${name}.outputs.real_failures and would see nothing.`
      );
    }

    const expectedIds = ids.slice(0, -1).filter((id) => id !== REPORTING_EXCLUDED_STEP_ID);
    const stepOutcomesMatch = stepsBlock.match(/STEP_OUTCOMES: \|\n([\s\S]*?)\n {8}run: \|/);
    const stepOutcomesText = stepOutcomesMatch ? stepOutcomesMatch[1] : '';
    if (!stepOutcomesMatch) {
      problems.push(
        `promotion-quality-gate.yml: "${name}" has no \`STEP_OUTCOMES: |\` block on its ` +
        'record_outcomes step -- checkAdvisoryFailureReportingShape needs updating to match, or the ' +
        'step was restructured.'
      );
    }
    const referencedIds = [...stepOutcomesText.matchAll(/steps\.(\S+)\.outcome/g)].map((m) => m[1]);

    for (const id of expectedIds) {
      if (!referencedIds.includes(id)) {
        problems.push(
          `promotion-quality-gate.yml: "${name}"'s STEP_OUTCOMES is missing \`steps.${id}.outcome\` -- ` +
          `a failure in step "${id}" would be silently absorbed and never reported to #1063.`
        );
      }
    }
    for (const id of referencedIds) {
      if (!expectedIds.includes(id)) {
        problems.push(
          `promotion-quality-gate.yml: "${name}"'s STEP_OUTCOMES references \`steps.${id}.outcome\`, ` +
          'but no current step has that id -- stale or misspelled entry, update or remove it.'
        );
      }
    }

    if (reporterMatch) {
      const needsMatch = reporterBlock.match(/^ {4}needs:\n([\s\S]*?)\n {4}if:/m);
      const needsText = needsMatch ? needsMatch[1] : '';
      if (!new RegExp(`^ {6}- ${name}$`, 'm').test(needsText)) {
        problems.push(
          `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}"'s \`needs:\` is missing "${name}" -- its ` +
          'outputs.real_failures would not be available via needs.<job>.outputs.real_failures.'
        );
      }
      const envRefs = reporterBlock.match(
        new RegExp(`\\$\\{\\{\\s*needs\\.${name}\\.outputs\\.real_failures\\s*\\}\\}`, 'g')
      ) || [];
      if (envRefs.length !== 1) {
        problems.push(
          `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}" must reference ` +
          `\`needs.${name}.outputs.real_failures\` exactly once (found ${envRefs.length}).`
        );
      }
      if (!new RegExp(`add_if_present\\s+"${name}"`).test(reporterBlock)) {
        problems.push(
          `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}" has no \`add_if_present "${name}" ...\` ` +
          `call -- "${name}"'s failures would be read into an env var but never actually reported.`
        );
      }
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
    ...checkStagingLegSkipShape(qualityWorkflowText),
    ...checkStepLevelAdvisory(qualityWorkflowText),
    ...checkAdvisoryFailureReportingShape(qualityWorkflowText)
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

  console.log('[pr-quality-workflow] OK. Promotion quality gate contains all required gates, matches the sanctioned #1063 shape (skipped on the staging leg, advisory everywhere it runs -- including gate itself and, since #1066 RF-2, the container-start steps that replaced services:), and the id->STEP_OUTCOMES->real_failures->report-advisory-failures reporting chain is intact end to end.');
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPrQualityWorkflow,
  checkPromotionPrefixSync,
  checkRunnerCacheConsistency,
  checkStagingLegSkipShape,
  checkStepLevelAdvisory,
  checkAdvisoryFailureReportingShape,
  SANCTIONED_SKIP_STAGING_IF,
  SANCTIONED_CONTINUE_ON_ERROR,
  QUALITY_JOB_NAMES,
  ADVISORY_JOB_NAMES,
  REPORTING_EXCLUDED_STEP_ID,
  REPORTER_JOB_NAME,
  REQUIRED_PR_CHECKS_MARKERS,
  REQUIRED_QUALITY_MARKERS
};
