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
// 2026-08-26 (#1063), temporary: a deliberate relaxation now exists, checked by
// checkStagingLegSkipShape below rather than the old blanket forbid: every quality job must carry
// `continue-on-error: true` -- advisory (never blocking) on every leg it runs on. Net effect,
// stated plainly: no leg currently has a blocking run of this workflow. This keeps the #1003-class
// guard intact in spirit (a job missing this, or carrying some other `continue-on-error` form,
// still fails this check) -- it does not mean "anything goes."
//
// 2026-08-29 (#1124/#1165): the staging-leg *skip* half of the original relaxation (every quality
// job's `if:` additionally excluding `to-staging/*->staging` entirely) was retired for a few days --
// that leg ran every job too, advisory-only, same as every other leg.
//
// 2026-08-31 (#1253): reverted, Pat's call -- the develop->staging leg is meant to be the quick
// soak/QA leg, not the one that runs quality checks; that's `staging->main`'s job. Back to skipping
// every quality job entirely on the staging leg. checkStagingLegSkipShape's own comment has the
// full "why" and the current sanctioned `if:` shape; not restated here.
//
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
//
// 2026-09-02 (#1431 Phase 1, PR-A): correction to the paragraph above -- checkStepLevelAdvisory no
// longer reverts to nothing when #1063 closes for 8 named steps (BLOCKING_STEP_IDS). Those steps
// are deliberately, permanently blocking now (a real failure must red out the job), so
// checkStepLevelAdvisory's job is to keep asserting that shape going forward, not to be deleted
// alongside checkStagingLegSkipShape. checkAdvisoryFailureReportingShape and
// checkReporterHasNoShellBinaryDependency are unaffected by this and still revert as described
// above once #1063 closes.
//
// 2026-09-02 (#1431 Phase 2, P2-1): the same pattern, for two more of the 8 remaining
// `gate:release:local`-covered steps -- `run_production_env_fixtures` (repository-quality, gate 7)
// and `run_scroll_contracts` (frontend-ims-quality, gate 17) join BLOCKING_STEP_IDS as blocking
// from their first PR (no prerequisite, no flake surface, no external dependency). The other 4
// gates this PR adds -- `run_dependency_audit_prod`/`run_dependency_audit_full`/
// `run_compliance_contracts` (repository-quality, gates 2/3/6) and the renamed
// `run_shared_fnb_contract_tests` step now running `npm run test:frontend:contracts` (frontend-ims-
// quality, gate 14) -- stay advisory pending real-promotion evidence (P2-3), same as every other
// still-advisory step here.
// #1529: route-build-checks routes pr-checks.yml's build-check jobs to GitHub-hosted runners for a
// release/*|hotfix/* PR into main; these three markers replace the old
// 'runner_labels_json: *runner_heavy' marker (which lived in the 3 frontend build-check jobs'
// with: blocks and no longer does -- that alias usage relocated into route-build-checks's own
// env: block under this change) and additionally guard the new job/condition from silent removal.
const REQUIRED_PR_CHECKS_MARKERS = [
  'RUNNER_HEAVY_JSON: *runner_heavy',
  'route-build-checks:',
  'release/*|hotfix/*'
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
  // #1431 Phase 2 (2026-09-02), P2-1: replaces the old hand-picked 7-file marker pair
  // ('fnbMode.contract.test.js' / 'posFnbModifierManager.session.test.jsx') now that
  // frontend-ims-quality's contract-tests step runs the local gate's own 107-file pattern
  // (gate 14) instead. 'scrollKeyControls.behavior.test.js' anchors gate 17's own new step (the
  // one file genuinely outside gate 14's pattern -- see that step's comment in the workflow).
  'npm run test:frontend:contracts',
  'scrollKeyControls.behavior.test.js',
  // #1431 Phase 2 (2026-09-02), P2-1: gates 2/3/6/7 (repository-quality).
  'npm run audit:dependencies:prod',
  'npm run audit:dependencies',
  'npm run check:compliance',
  'npm run check:production-env',
  'npm run build',
  'npx playwright install --with-deps chromium',
  'npm run test:e2e:fnb-contract',
  'fnb-playwright-contract-',
  'git diff --check',
  // #1124/#1165: the reporter must stay Node-based (actions/github-script), never shell out to a
  // binary this repo has already confirmed is absent from these self-hosted runners (`gh`, see
  // checkForbiddenReporterShellout below for the full story).
  'actions/github-script@v7',
  // #1124: the step-summary channel that makes the test-matrix step's own result visible even if a
  // *later* step kills the job -- must not be silently dropped from the matrix step's `run:`.
  'node scripts/summarize-backend-test-matrix.js',
  // #1124: pins the matrix script's own evidence directory to the same SHA the artifact upload's
  // `path:` uses -- previously these only coincided by construction, not by a shared value.
  'RELEASE_TARGET_SHA: ${{ github.sha }}',
  // #1124: promotion evidence now retained 30 days (was 5) -- purely additive, no prior marker
  // asserted the old value, so this only guards against silently reverting the extension.
  'retention-days: 30'
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

// #1063 (2026-08-26), temporary: every quality job must carry exactly these two lines -- skipped
// entirely on the develop->staging soak leg, unconditionally advisory everywhere else it runs.
//
// 2026-08-29 (#1124/#1165): the staging-leg *skip* half of this was retired for a few days -- the
// `to-staging/*->staging` soak leg skipped every quality job entirely (`&&
// needs.gate.outputs.is_staging_leg != 'true'`), producing zero signal on 25 of the last 30
// workflow runs, so it was made to run every job advisory-only instead, same as `release/*->main`.
//
// 2026-08-31 (#1253), Pat's call: reverted. The `develop->staging` leg was never meant to carry
// this gate at all -- it's the quick soak/QA leg, deliberately contrasted with `staging->main`
// (and default `develop->main`) where quality checks belong before shipping to production. Back to
// skipping entirely on the staging leg, accepting the zero-signal trade-off #1124/#1165 tried to
// avoid -- that leg optimizes for speed, not signal.
const SANCTIONED_SKIP_STAGING_IF = "if: needs.gate.outputs.is_promotion == 'true' && needs.gate.outputs.is_staging_leg != 'true'";
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
  'repository-quality',
  // #1431 Phase 2 (2026-09-02), P2-2: gate 16 (frontend.budgets) -- see this job's own header
  // comment in promotion-quality-gate.yml for why it needs to be its own job.
  'frontend-budgets-quality'
];

// 2026-08-26 (#1066 follow-up): `gate` legitimately has a different `if:` shape than the six
// quality jobs (it has none -- it's what produces is_promotion/is_staging_leg, not consumes them),
// so it stays out of QUALITY_JOB_NAMES/checkStagingLegSkipShape. But its own single step is a
// user-controllable step like any other and needed the same step-level continue-on-error fix --
// this list is checkStepLevelAdvisory's own job set, a superset of QUALITY_JOB_NAMES, kept
// separate rather than folding `gate` into the shared list and having to special-case it out of
// checkStagingLegSkipShape instead.
// #1124/#1165: `salvage-api-evidence` joins this list, not QUALITY_JOB_NAMES/
// checkStagingLegSkipShape -- same reasoning as `gate` above. Its `if:` legitimately differs (it
// additionally gates on `needs.dgfy-api-quality.result != 'success'`, which none of the six
// quality jobs' `if:` shapes do), and it has no STEP_OUTCOMES/record_outcomes chain of its own for
// checkAdvisoryFailureReportingShape to trace -- it isn't part of the real_failures reporting
// pipeline, it salvages evidence for a job that's already in it. It still needs the step-level
// continue-on-error guarantee checkStepLevelAdvisory enforces, which is the only thing this list
// is for.
const ADVISORY_JOB_NAMES = [...QUALITY_JOB_NAMES, 'gate', 'salvage-api-evidence'];

// A step deliberately excluded from a job's own STEP_OUTCOMES/real_failures reporting -- teardown
// only, `|| true`-guarded so it can't meaningfully report `failure`, and reporting it would risk
// exactly the false-positive noise on #1063 this mechanism exists to avoid (a benign double-remove
// racing another cleanup path). checkAdvisoryFailureReportingShape treats this id as expected to be
// *absent* from STEP_OUTCOMES, not missing.
const REPORTING_EXCLUDED_STEP_ID = 'stop_services';
const REPORTER_JOB_NAME = 'report-advisory-failures';

// #1431 Phase 1 (2026-09-02), PR-A: 7 of the 8 `gate:release:local`-covered steps are now blocking
// on the `release/*->main` leg (and workflow_dispatch/workflow_call) -- step-level
// `continue-on-error: true` removed from exactly these step ids, per job. `backend.test_matrix`
// (`run_test_matrix`) stays advisory (confirmed still failing for real, #10, deferred to a follow-up
// track gated on #1015) and so does `run_web_core_lint` (separate lint-debt issue, no local gate
// covers packages/web-core yet) -- neither appears here. Kept as an explicit per-job id map rather
// than adjusting checkStepLevelAdvisory's old count comparison, so a future edit that silently
// blocks the wrong step (or un-blocks one of these 8) still fails this check even when the totals
// happen to still line up.
//
// #1431 Phase 2 (2026-09-02), P2-1: two more of the 8 remaining gates land blocking on their first
// PR rather than an advisory round first -- `run_production_env_fixtures` (gate 7,
// production.env.fixtures: a pure function over checked-in constants, no prerequisite, no flake
// surface) and `run_scroll_contracts` (gate 17, scroll.contracts: 2 files, ~1s, green, no external
// dependency). The other 4 gates landed this PR (2, 3, 6, 14 -- `run_dependency_audit_prod`,
// `run_dependency_audit_full`, `run_compliance_contracts`, `run_shared_fnb_contract_tests`) stay
// advisory until P2-3 shows them green on a real release/*->main promotion.
//
// #1431 Phase C (2026-09-03): P2-3's real-promotion evidence pass (workflow_dispatch faults +
// one throwaway PR-context run, see docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md for run IDs) confirms
// 5 more of the remaining advisory steps genuinely red-on-fault / green-on-clean:
// `run_dependency_audit_prod`, `run_compliance_contracts`, `run_runtime_doctor`,
// `run_shared_fnb_contract_tests`, `check_frontend_budgets`. All 5 flip blocking here, bringing the
// total to 16. `run_dependency_audit_full` (registry-dependent, findings never ship) stays advisory
// permanently -- not a P2-3 pending case any more, a settled decision (Pat's call). `run_web_core_lint`
// and `run_test_matrix` are the only two steps still advisory-by-design; `run_test_matrix` is
// deliberately delegated (gate-release-local.js's ADVISORY_CI_ENFORCED_GATES equivalent) rather than
// locally required, pending #1015/#925/fixture-rot.
const BLOCKING_STEP_IDS = {
  'dgfy-api-quality': ['enforce_arch_guardrails', 'enforce_controller_boundaries', 'run_api_lint', 'run_runtime_doctor'],
  'frontend-ims-quality': ['run_ims_lint', 'run_scroll_contracts', 'run_shared_fnb_contract_tests'],
  'frontend-pos-quality': ['run_pos_lint'],
  'frontend-storefront-quality': ['run_storefront_lint', 'run_storefront_vitest'],
  // 2026-09-04 (#1550/#1551 triage): validate_pr_quality_workflow/validate_runner_routing/
  // validate_workspace_hygiene/validate_compliance_sweep added -- pure, deterministic contract
  // checks over checked-in files, no registry/network/DB dependency. First recorded blocking-flip
  // disposition for these four; see docs/ops/RELEASE_CANDIDATE_POLICY.md's 2026-09-04 amendment.
  // 2026-09-04 (#1552): check_whitespace added too -- same class of check (pure, deterministic,
  // git-native), root cause fixed via a new .husky/pre-commit guard in the same PR. Its sibling
  // gate, audit_indexes (dgfy-api-quality), deliberately does NOT join this map in the same PR --
  // see that step's own comment in promotion-quality-gate.yml for why the disposition differs.
  'repository-quality': ['run_docs_lint', 'run_production_env_fixtures', 'run_dependency_audit_prod', 'run_compliance_contracts', 'validate_pr_quality_workflow', 'validate_runner_routing', 'validate_workspace_hygiene', 'validate_compliance_sweep', 'check_whitespace'],
  'frontend-budgets-quality': ['check_frontend_budgets']
};

// #1431 Phase C/D (2026-09-03): two of the 16 gates in gate-release-local.js's CI_ENFORCED_GATES
// (Phase D delegates all 16 -- required-locally is now zero) are delegated to CI but deliberately
// NEVER blocking there, so checkCiEnforcedGatesAreBlocking's normal "every delegated step must
// appear in BLOCKING_STEP_IDS" rule would otherwise fail loudly on both of these, permanently:
//   - 'dependencies.audit.full' -- registry-dependent (npm audit --include=dev); a fresh advisory
//     can flip it red with zero code change in this repo, and its findings never ship. Settled
//     permanently advisory (Pat's call, #1431 Phase 2 exception 2), not pending further evidence.
//   - 'backend.test_matrix' -- confirmed still failing for real (fixture rot + hosted-runner OOM,
//     pre-existing) on every #1431 Phase A/C evidence run. #1015 (fast/DB tier split), #925
//     (hanging beforeAll), and the fixture rot itself are its prerequisites before it can flip
//     blocking -- tracked by #1469, filed alongside this change.
// 2026-09-06 (#1278 PR 2, Phase 297): a third name, for a different reason than either of the two
// above -- 'release.notes' (ADR 0082 Decision 8) is advisory not because of a prerequisite or a
// flake surface, but by deliberate rollout design: it ships advisory on first landing and flips
// blocking only once a later, dedicated phase finds clean-run evidence (ADR 0082 Follow-up 1),
// mirroring check:app-versions' own advisory-to-blocking rollout (ADR 0081 Decision 9). Unlike
// check:app-versions, this gate's CI destination lives inside promotion-quality-gate.yml (the
// `run_release_notes` step, repository-quality job), which is exactly what this allowlist and
// CI_ENFORCED_GATES both track -- so it is registered here rather than left to its own separate
// toggle mechanism the way check:app-versions was.
//
// This is a three-name allowlist, not a bypass: every OTHER CI_ENFORCED_GATES entry must still
// have real BLOCKING_STEP_IDS coverage, and checkCiEnforcedGatesAreBlocking still fails loudly if
// one doesn't.
const ADVISORY_CI_ENFORCED_GATES = new Set(['dependencies.audit.full', 'backend.test_matrix', 'release.notes']);

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
 * job's own check-run conclusion -- only step-level `continue-on-error: true` on every advisory
 * step in the job does (see this file's own top-of-file comment, and promotion-quality-gate.yml's,
 * for the full "why"). This asserts the shape per step-start (`      - ` at 6-space indent) in an
 * advisory job block (the six quality jobs, plus `gate` itself -- see ADVISORY_JOB_NAMES):
 *
 * #1431 Phase 1 (2026-09-02), PR-A, replaces the original "every step must carry it" count
 * comparison: 8 named steps (BLOCKING_STEP_IDS, keyed by job) are now deliberately blocking and
 * must carry **zero** step-level `continue-on-error: true` lines; every other step in these job
 * blocks must still carry **exactly one**, unchanged from before. Both directions matter -- a
 * blocking step silently regaining `continue-on-error` is the exact regression #1066 fixed, and an
 * unlisted step silently losing it would make it blocking without anyone deciding that.
 *
 * @param {string} qualityWorkflowText contents of .github/workflows/promotion-quality-gate.yml
 * @returns {string[]} human-readable problems found; empty when every step's blocking/advisory shape matches
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
    const stepChunks = stepsBlock.split(/\n(?= {6}- )/).slice(1);
    if (stepChunks.length === 0) {
      problems.push(`promotion-quality-gate.yml: "${name}" has a \`steps:\` block but no steps were found -- checkStepLevelAdvisory needs updating to match.`);
      continue;
    }

    const blockingIds = BLOCKING_STEP_IDS[name] || [];
    const seenBlockingIds = new Set();

    for (const chunk of stepChunks) {
      const idMatch = chunk.match(/\bid:\s*(\S+)/);
      const id = idMatch ? idMatch[1] : null;
      const coeCount = (chunk.match(/^ {8}continue-on-error: true$/gm) || []).length;
      const isBlocking = id !== null && blockingIds.includes(id);

      if (isBlocking) {
        seenBlockingIds.add(id);
        if (coeCount !== 0) {
          problems.push(
            `promotion-quality-gate.yml: "${name}"'s "${id}" step is listed in BLOCKING_STEP_IDS ` +
            `but still carries ${coeCount} step-level \`continue-on-error: true\` line(s) -- #1431 ` +
            'Phase 1 requires this step to have none, so a real failure actually reds out the job.'
          );
        }
      } else if (coeCount !== 1) {
        const label = id ? `"${id}"` : '(no id)';
        problems.push(
          `promotion-quality-gate.yml: "${name}"'s ${label} step has ${coeCount} step-level ` +
          '`continue-on-error: true` line(s), expected exactly 1 -- #1066 requires every advisory ' +
          "step to carry its own (job-level alone doesn't keep the job's check-run conclusion green " +
          'when a step fails), and it is not one of the 8 steps #1431 Phase 1 made blocking.'
        );
      }
    }

    for (const id of blockingIds) {
      if (!seenBlockingIds.has(id)) {
        problems.push(
          `promotion-quality-gate.yml: "${name}" is expected to have a blocking step with id ` +
          `"${id}" (BLOCKING_STEP_IDS) but no step with that id was found -- was it renamed or removed?`
        );
      }
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
 *      `addIfPresent(...)` call (read into an env var but never actually surfaced is its own silent
 *      loss, distinct from never being read at all -- form updated 2026-08-29 #1124 when the
 *      reporter moved from a shell `add_if_present` call to this JS one, see that check-site's own
 *      comment);
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
    // #1066 RF-5 (2026-08-26, pr-reviewer third round): counted via `.includes()` before this,
    // which only asks "does this id appear at least once" -- a duplicated reference (e.g. a
    // copy/paste that lists steps.run_api_lint.outcome twice and never adds the newer step's id) is
    // structurally the same shape of bug as a missing one, and reads exactly as harmless in a diff.
    // Count occurrences per id instead of a boolean presence check.
    const referencedIds = [...stepOutcomesText.matchAll(/steps\.(\S+)\.outcome/g)].map((m) => m[1]);
    const referencedCounts = referencedIds.reduce((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});

    for (const id of expectedIds) {
      const count = referencedCounts[id] || 0;
      if (count === 0) {
        problems.push(
          `promotion-quality-gate.yml: "${name}"'s STEP_OUTCOMES is missing \`steps.${id}.outcome\` -- ` +
          `a failure in step "${id}" would be silently absorbed and never reported to #1063.`
        );
      } else if (count > 1) {
        problems.push(
          `promotion-quality-gate.yml: "${name}"'s STEP_OUTCOMES references \`steps.${id}.outcome\` ` +
          `${count} times -- exactly one line per step id is expected; a duplicate usually means ` +
          'another step\'s id was never added.'
        );
      }
    }
    for (const id of Object.keys(referencedCounts)) {
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

      // The env var this job's needs.<job>.outputs.real_failures is actually assigned to (e.g.
      // `DGFY_API_FAILURES: ${{ needs.dgfy-api-quality.outputs.real_failures }}` -> "DGFY_API_FAILURES").
      const envVarMatch = reporterBlock.match(
        new RegExp(`(\\w+):\\s*\\$\\{\\{\\s*needs\\.${name}\\.outputs\\.real_failures\\s*\\}\\}`)
      );
      const envRefs = envVarMatch
        ? reporterBlock.match(new RegExp(`\\$\\{\\{\\s*needs\\.${name}\\.outputs\\.real_failures\\s*\\}\\}`, 'g')) || []
        : [];
      if (!envVarMatch || envRefs.length !== 1) {
        problems.push(
          `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}" must reference ` +
          `\`needs.${name}.outputs.real_failures\` exactly once, assigned to an env var (found ${envRefs.length}).`
        );
      }

      // #1066 RF-5, form updated 2026-08-29 (#1124/#1165) when the reporter moved from a shell
      // `add_if_present "<job>" "$VAR"` call to a JS `addIfPresent('<job>', process.env.VAR, ...)`
      // call (actions/github-script@v7 replacing the `gh` shell-out -- see that job's own comment).
      // Same invariant as before: the prior version only checked that SOME call for this job
      // existed, not that its argument is the SAME env var this job's real_failures output was
      // assigned to above. A swapped or misspelled variable there -- e.g. reading dgfy-api-quality's
      // failures into DGFY_API_FAILURES but passing process.env.POS_FAILURES into
      // addIfPresent('dgfy-api-quality', ...) -- reported no problem before this fix. This check is
      // now MORE important than the RF-5 comment it replaces used to argue, not less: the old shell
      // form ran under `set -uo pipefail`, so a swapped/misspelled var name aborted the whole
      // reporter step loudly (dropping every job's failures, but visibly); the new JS form has no
      // such abort -- a typo'd `process.env.TYPO` is simply `undefined`, and the entry is dropped
      // with zero signal at all. A stale "why this matters" rationale is exactly how the original
      // `gh`-not-installed bug survived undetected -- fixing the code without also fixing the
      // reasoning here would reproduce that pattern.
      const addIfPresentMatch = reporterBlock.match(
        new RegExp(`addIfPresent\\(\\s*'${name}'\\s*,\\s*process\\.env\\.(\\w+)\\s*[,)]`)
      );
      if (!addIfPresentMatch) {
        problems.push(
          `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}" has no \`addIfPresent('${name}', ...)\` ` +
          `call -- "${name}"'s failures would be read into an env var but never actually reported.`
        );
      } else if (envVarMatch && addIfPresentMatch[1] !== envVarMatch[1]) {
        problems.push(
          `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}"'s \`addIfPresent('${name}', ` +
          `process.env.${addIfPresentMatch[1]}, ...)\` does not match the env var ` +
          `needs.${name}.outputs.real_failures is actually assigned to (${envVarMatch[1]}) -- a ` +
          'swapped or misspelled variable here silently drops this job\'s real failures instead of ' +
          'surfacing them.'
        );
      }
    }
  }

  return problems;
}

/**
 * #1124/#1165: the regression guard that would have caught the original bug -- `gh` is not
 * installed on these self-hosted runners (`gh: command not found`, exit 127, confirmed live), and
 * `report-advisory-failures`' shell-out to it failed 100% silently under `set -uo pipefail` (no
 * `-e`) for as long as that job existed. Fixed by moving the reporter to `actions/github-script@v7`
 * (see that job's own comment); this check is what stops a future edit from reintroducing a `gh`
 * shell command there without anyone noticing until the next silent-failure investigation. Scoped
 * to the reporter job's own block, not the whole file -- a `gh` reference inside a comment
 * elsewhere (e.g. this file's header, which cites `gh api .../actions/runners` as evidence) is not
 * itself a problem.
 *
 * @param {string} qualityWorkflowText contents of .github/workflows/promotion-quality-gate.yml
 * @returns {string[]} human-readable problems found; empty when the reporter shells out to no `gh` command
 */
function checkReporterHasNoShellBinaryDependency(qualityWorkflowText) {
  const problems = [];
  const reporterMatch = qualityWorkflowText.match(
    new RegExp(`\\n  ${REPORTER_JOB_NAME}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z][\\w-]*:\\n|$)`)
  );
  if (!reporterMatch) {
    // Already reported by checkAdvisoryFailureReportingShape above -- don't double-report.
    return problems;
  }
  if (/\bgh\s+(issue|api|pr|run|workflow)\b/.test(reporterMatch[1])) {
    problems.push(
      `promotion-quality-gate.yml: "${REPORTER_JOB_NAME}" shells out to a \`gh\` subcommand -- ` +
      '`gh` is not installed on these self-hosted runners (confirmed live, exit 127) and this is ' +
      'exactly the bug #1124/#1165 fixed by moving to actions/github-script@v7; do not reintroduce it.'
    );
  }
  return problems;
}

// 2026-08-31 (#1253, pr-reviewer RF-1/RF-2/RF-4 on PR #1257): the six-quality-job revert alone
// wasn't the full #1124/#1165 item 4 undo -- two more jobs also lost the `is_staging_leg`
// exclusion in that same commit and needed it restored too: `report-advisory-failures` (has
// nothing to report when every job it depends on was itself skipped) and `salvage-api-evidence`
// (added by that same commit, never carried the exclusion, and without it burns a runner slot
// "salvaging" evidence for a dgfy-api-quality run that never happened). Neither job shares the six
// quality jobs' exact `if:` shape (both carry `always()` and other clauses SANCTIONED_SKIP_STAGING_IF
// doesn't), so this is a substring check against each job's own `if:` line rather than an exact-match
// reuse of checkStagingLegSkipShape -- RF-4's own point was that an exact-shape check on the wrong
// job set is precisely why RF-1 slipped through unnoticed in both the original change and the first
// revert attempt.
const STAGING_LEG_RESPECTING_JOBS = [REPORTER_JOB_NAME, 'salvage-api-evidence'];

/**
 * @param {string} qualityWorkflowText contents of .github/workflows/promotion-quality-gate.yml
 * @returns {string[]} human-readable problems found; empty when both jobs' `if:` excludes the staging leg
 */
function checkReportingJobsRespectStagingLeg(qualityWorkflowText) {
  const problems = [];
  for (const name of STAGING_LEG_RESPECTING_JOBS) {
    const blockMatch = qualityWorkflowText.match(
      new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z][\\w-]*:\\n|$)`)
    );
    if (!blockMatch) {
      problems.push(
        `promotion-quality-gate.yml: could not find the "${name}:" job block -- was it renamed or ` +
        'restructured? checkReportingJobsRespectStagingLeg needs updating to match.'
      );
      continue;
    }
    const ifLines = blockMatch[1].match(/^ {4}if:.*$/gm) || [];
    if (ifLines.length !== 1) {
      problems.push(
        `promotion-quality-gate.yml: "${name}" must have exactly one job-level \`if:\` line ` +
        `(found: ${ifLines.length}) -- checkReportingJobsRespectStagingLeg needs updating to match.`
      );
      continue;
    }
    if (!ifLines[0].includes("needs.gate.outputs.is_staging_leg != 'true'")) {
      problems.push(
        `promotion-quality-gate.yml: "${name}"'s \`if:\` (${ifLines[0].trim()}) does not exclude ` +
        "the staging leg (`needs.gate.outputs.is_staging_leg != 'true'`) -- #1253 requires this job " +
        'to also be skipped entirely on the develop->staging soak leg, not just the six quality jobs.'
      );
    }
  }
  return problems;
}

// 2026-09-0X (#1431 Phase 1, PR-B): the compensating control for gate-release-local.js's new
// delegation mechanism. Once a gate stops running locally (CI_ENFORCED_GATES,
// gate-release-local.js), CI is its only remaining signal -- nothing before this check stopped a
// future edit from re-adding `continue-on-error: true` (or renaming/removing a step id) for one of
// these steps and silently reopening a coverage hole on both sides at once: not enforced in CI
// *and* not run locally. Requiring `./gate-release-local` is safe here -- that module is guarded by
// `if (require.main === module)` and exports no side effects on require.
//
// @param {Map} [ciEnforcedGates] defaults to gate-release-local.js's real CI_ENFORCED_GATES;
// injectable so tests can assert the failure path without editing the real script.
// @returns {string[]} human-readable problems found; empty when every CI_ENFORCED_GATES step id is
// still present in BLOCKING_STEP_IDS for its named job.
function checkCiEnforcedGatesAreBlocking(ciEnforcedGates) {
  const problems = [];
  const gates = ciEnforcedGates || require('./gate-release-local').CI_ENFORCED_GATES;
  for (const [gateName, enforcement] of gates) {
    const blockingIds = BLOCKING_STEP_IDS[enforcement.job];
    if (!blockingIds) {
      problems.push(
        `gate-release-local.js: CI_ENFORCED_GATES["${gateName}"] names job "${enforcement.job}", ` +
        'which has no entry in BLOCKING_STEP_IDS -- was the job renamed, or does ' +
        'BLOCKING_STEP_IDS need a new entry for it?'
      );
      continue;
    }
    if (ADVISORY_CI_ENFORCED_GATES.has(gateName)) {
      // Deliberately, permanently or temporarily advisory in CI -- see this file's own comment on
      // ADVISORY_CI_ENFORCED_GATES for why each of the two names in that set is exempt.
      continue;
    }
    for (const stepId of enforcement.steps) {
      if (!blockingIds.includes(stepId)) {
        problems.push(
          `gate-release-local.js: CI_ENFORCED_GATES["${gateName}"] names step "${stepId}" in job ` +
          `"${enforcement.job}", but that step id is missing from BLOCKING_STEP_IDS["${enforcement.job}"] ` +
          '-- it may have regained continue-on-error in promotion-quality-gate.yml, been renamed, ' +
          'or been removed. A gate delegated locally must stay genuinely blocking in CI.'
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
    ...checkAdvisoryFailureReportingShape(qualityWorkflowText),
    ...checkReporterHasNoShellBinaryDependency(qualityWorkflowText),
    ...checkReportingJobsRespectStagingLeg(qualityWorkflowText),
    ...checkCiEnforcedGatesAreBlocking()
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

  console.log('[pr-quality-workflow] OK. Promotion quality gate contains all required gates, matches the sanctioned #1063 shape (skipped entirely on the develop->staging soak leg per #1253, advisory on every other leg it runs -- including gate itself and, since #1066 RF-2, the container-start steps that replaced services:), the reporter has no `gh` shell dependency, and the id->STEP_OUTCOMES->real_failures->report-advisory-failures reporting chain is intact end to end.');
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
  checkReporterHasNoShellBinaryDependency,
  checkReportingJobsRespectStagingLeg,
  checkCiEnforcedGatesAreBlocking,
  BLOCKING_STEP_IDS,
  ADVISORY_CI_ENFORCED_GATES,
  STAGING_LEG_RESPECTING_JOBS,
  SANCTIONED_SKIP_STAGING_IF,
  SANCTIONED_CONTINUE_ON_ERROR,
  QUALITY_JOB_NAMES,
  ADVISORY_JOB_NAMES,
  REPORTING_EXCLUDED_STEP_ID,
  REPORTER_JOB_NAME,
  REQUIRED_PR_CHECKS_MARKERS,
  REQUIRED_QUALITY_MARKERS
};
