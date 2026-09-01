#!/usr/bin/env node
// Phase 233 (#1365), Wave 2: a *pre-dispatch*, class-specific runner-availability preflight --
// "right now, before I dispatch, is the hosted class actually able to run a job? Is the
// self-hosted fallback able to?" -- distinct from scripts/pr-checks.js's classifyCiUnavailability()
// (F-4 in the Phase 233 plan), which answers a *post-hoc*, SHA-bound question ("did CI fail in a
// way that justifies the local-CI merge carve-out"). Reuses the same four-way reason-code taxonomy
// and as much extracted machinery as possible (scripts/lib/runner-availability.js) rather than
// re-implementing it -- #1365's own "no duplicate implementation" acceptance criterion.
//
// Deliberately Node, not bash -- mirrors scripts/pr-checks.js's/scripts/gate-release-local.js's
// runCommand/captureJson/JSON-artifact shape.
//
// This script never flips a runner_labels_json:/runs-on: value itself, on any exit code --
// per Wave 2 Sec 2.5's rejected-design note, an operator flip is always comment/uncomment, always
// logged, never automatic. This script only tells the operator which file:line pair to flip.
//
// Intended entrypoint: `npm run preflight:runner -- --target-sha <sha> [--class
// hosted|self-hosted|both] [--canary] [--output <path>] [--threshold-minutes 20]`.
//
// Wave 2 Sec 2.3, "Known today": the org billing-minutes API
// (`gh api /orgs/Sieitzz/settings/billing/actions`) returns 404 at this session's and the policy
// doc's current token scope -- no `admin:org`. On 404/403 this NEVER classifies as `healthy` --
// silence is not availability. It classifies `indeterminate`, reason `billing_scope_unavailable`.
// The `--canary` path (opt-in, off by default -- it costs a real, if tiny, hosted-minutes dispatch)
// is the practical default until a fine-grained "Organization plan: read" token exists (Wave 2
// Sec 2.3, Q-5 in the Phase 233 plan).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REASON_CODES, evaluateSelfHostedPool, evaluateGithubStatusOutage } = require('./lib/runner-availability');

const REPO_SLUG = 'Sieitzz/dgfy-platform';
const ORG_SLUG = 'Sieitzz';
const PROBE_WORKFLOW = 'runner-probe.yml';

class RunnerPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunnerPreflightError';
    this.code = code;
  }
}

function defaultRunCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function captureJson(command, args, runCapture) {
  const result = runCapture(command, args);
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const options = {
    targetSha: '',
    targetClass: 'both',
    canary: false,
    output: '',
    thresholdMinutes: 20
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target-sha') options.targetSha = argv[++i] || '';
    else if (arg === '--class') options.targetClass = argv[++i] || '';
    else if (arg === '--canary') options.canary = true;
    else if (arg === '--output') options.output = argv[++i] || '';
    else if (arg === '--threshold-minutes') options.thresholdMinutes = Number(argv[++i]);
    else throw new RunnerPreflightError('INVALID_ARGS', `Unknown argument: ${arg}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(options.targetSha)) {
    throw new RunnerPreflightError('INVALID_ARGS', '--target-sha <40-hex-char SHA> is required');
  }
  if (!['hosted', 'self-hosted', 'both'].includes(options.targetClass)) {
    throw new RunnerPreflightError('INVALID_ARGS', '--class must be one of: hosted, self-hosted, both');
  }
  if (!Number.isFinite(options.thresholdMinutes) || options.thresholdMinutes <= 0) {
    throw new RunnerPreflightError('INVALID_ARGS', '--threshold-minutes must be a positive number');
  }
  return options;
}

// --- hosted-availability probe ----------------------------------------------------------------

/**
 * Probe 1: org billing-minutes API. Per this file's own header comment, 404/403 is NEVER
 * `healthy` -- it's `indeterminate`, reason `billing_scope_unavailable`. On a real 200, classify
 * on included_minutes vs total_minutes_used, and whether paid overage is enabled (an org with
 * overage enabled is never blocked by the included-minutes ceiling alone).
 */
function probeBillingApi(deps) {
  const fetchBilling = deps.fetchBilling || (() => {
    const result = deps.runCapture('gh', ['api', `orgs/${ORG_SLUG}/settings/billing/actions`]);
    return result;
  });
  const result = fetchBilling();
  if (!result || result.status !== 0) {
    return {
      status: 'indeterminate',
      reason: 'billing_scope_unavailable',
      evidence: 'gh api orgs/:org/settings/billing/actions did not return 200 (404/403 at current token scope, ' +
        'known as of Phase 233 -- needs a fine-grained token with Organization plan: read, see Wave 2 Sec 2.3/Q-5)'
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return {
      status: 'indeterminate',
      reason: 'billing_scope_unavailable',
      evidence: 'gh api orgs/:org/settings/billing/actions returned unparseable JSON'
    };
  }
  const included = Number(parsed.included_minutes ?? 0);
  const used = Number(parsed.total_minutes_used ?? 0);
  if (used < included) {
    return {
      status: 'available',
      reason: REASON_CODES.HEALTHY,
      evidence: `billing API reports ${used}/${included} included minutes used`
    };
  }
  // Over the included-minutes ceiling: still available if the org has paid overage enabled;
  // otherwise this is exactly the billing_allocation_failure shape.
  if (parsed.included_minutes_hard_limit === false || parsed.total_paid_minutes_used > 0) {
    return {
      status: 'available',
      reason: REASON_CODES.HEALTHY,
      evidence: `billing API reports ${used}/${included} included minutes used, paid overage active`
    };
  }
  return {
    status: 'unavailable',
    reason: REASON_CODES.BILLING_ALLOCATION_FAILURE,
    evidence: `billing API reports ${used}/${included} included minutes used, no paid overage`
  };
}

/** Probe 2: githubstatus.com Actions component, reusing the same interpretation helper
 * classifyCiUnavailability uses -- but unlike that SHA-bound RF-1 gate, a preflight has no
 * check-runs/check-suites for a not-yet-dispatched run to gate on, so this is called directly. */
function probeGithubStatus(deps) {
  const fetchGithubStatus = deps.fetchGithubStatus || (() => captureJson(
    'curl', ['-s', '--max-time', '5', 'https://www.githubstatus.com/api/v2/summary.json'], deps.runCapture
  ));
  const statusSummary = fetchGithubStatus();
  const outage = evaluateGithubStatusOutage(statusSummary, deps.targetSha);
  if (outage) {
    return { status: 'unavailable', reason: outage.reason, evidence: outage.evidence };
  }
  return null;
}

/**
 * Probe 3 (opt-in): dispatch runner-probe.yml, poll until the job reports a non-empty
 * `runner_name` (or a terminal failure/timeout), then cancel it -- this script never leaves a
 * dispatched run hanging. Classification per Wave 2 Sec 2.3:
 *   - fails in <10s with a BILLING_MESSAGE annotation -> billing_allocation_failure
 *   - still queued past --threshold-minutes -> queue_starvation
 *   - reaches in_progress with a real runner_name -> available
 */
function probeCanary(deps, thresholdMinutes) {
  const { BILLING_MESSAGE } = require('./lib/runner-availability');
  const dispatch = deps.dispatchProbe || (() => deps.runCapture('gh', [
    'workflow', 'run', PROBE_WORKFLOW, '--repo', REPO_SLUG
  ]));
  const dispatchResult = dispatch();
  if (!dispatchResult || dispatchResult.status !== 0) {
    return {
      status: 'indeterminate',
      reason: 'canary_dispatch_failed',
      evidence: `gh workflow run ${PROBE_WORKFLOW} did not exit 0: ${(dispatchResult && dispatchResult.stderr) || 'no output'}`
    };
  }

  const pollForRun = deps.pollForRun || (() => captureJson('gh', [
    'run', 'list', `--workflow=${PROBE_WORKFLOW}`, '--repo', REPO_SLUG, '-L1',
    '--json', 'databaseId,status,conclusion'
  ], deps.runCapture));
  const startMs = deps.nowMs ? deps.nowMs() : Date.now();
  const pollIntervalMs = deps.pollIntervalMs ?? 5000;
  const sleep = deps.sleep || ((ms) => { const end = Date.now() + ms; while (Date.now() < end); });

  let elapsedMinutes = 0;
  // Bounded by --threshold-minutes -- this loop is what actually enforces queue_starvation rather
  // than polling forever.
  while (elapsedMinutes < thresholdMinutes) {
    const runs = pollForRun();
    const run = Array.isArray(runs) ? runs[0] : null;
    if (run) {
      if (run.status === 'in_progress' || run.status === 'completed') {
        const jobsResult = deps.fetchJobs
          ? deps.fetchJobs(run.databaseId)
          : captureJson('gh', ['run', 'view', String(run.databaseId), '--repo', REPO_SLUG, '--json', 'jobs'], deps.runCapture);
        const job = jobsResult && Array.isArray(jobsResult.jobs) ? jobsResult.jobs[0] : null;
        if (job && job.runner_name) {
          const cancel = deps.cancelRun || (() => deps.runCapture('gh', ['run', 'cancel', String(run.databaseId), '--repo', REPO_SLUG]));
          if (run.status !== 'completed') cancel();
          return {
            status: 'available',
            reason: REASON_CODES.HEALTHY,
            evidence: `runner-probe.yml run ${run.databaseId} was picked up by runner "${job.runner_name}"`
          };
        }
        if (run.status === 'completed' && run.conclusion === 'failure') {
          const elapsedSec = ((deps.nowMs ? deps.nowMs() : Date.now()) - startMs) / 1000;
          const annotations = deps.fetchAnnotations ? deps.fetchAnnotations(run.databaseId) : [];
          const billingAnnotation = Array.isArray(annotations)
            ? annotations.find((item) => BILLING_MESSAGE.test(item.message || ''))
            : null;
          if (elapsedSec < 10 && billingAnnotation) {
            return {
              status: 'unavailable',
              reason: REASON_CODES.BILLING_ALLOCATION_FAILURE,
              evidence: `runner-probe.yml run ${run.databaseId} failed in ${elapsedSec.toFixed(1)}s with a billing-allocation annotation`
            };
          }
        }
      }
    }
    sleep(pollIntervalMs);
    elapsedMinutes = ((deps.nowMs ? deps.nowMs() : Date.now()) - startMs) / 60000;
  }
  return {
    status: 'unavailable',
    reason: REASON_CODES.QUEUE_STARVATION,
    evidence: `runner-probe.yml did not reach in_progress with a runner_name within ${thresholdMinutes}min`
  };
}

function probeHostedAvailability(deps, { canary, thresholdMinutes }) {
  const billing = probeBillingApi(deps);
  if (billing.status === 'unavailable' || billing.status === 'available') return billing;

  const outage = probeGithubStatus(deps);
  if (outage) return outage;

  if (canary) return probeCanary(deps, thresholdMinutes);

  // Neither probe produced a verified answer, and the empirical canary wasn't requested --
  // indeterminate, never a guessed 'available' (per this file's own header: silence is not
  // availability).
  return billing;
}

// --- self-hosted-availability probe -----------------------------------------------------------

function probeSelfHostedAvailability(deps, { thresholdMinutes }) {
  const fetchRunners = deps.fetchRunners || (() => captureJson(
    'gh', ['api', `repos/${REPO_SLUG}/actions/runners`], deps.runCapture
  ));
  const offline = evaluateSelfHostedPool(fetchRunners());
  if (offline) {
    return { status: 'unavailable', reason: offline.reason, evidence: offline.evidence };
  }

  const fetchCheckRuns = deps.fetchCheckRuns || (() => captureJson('gh', [
    'api', '-H', 'Accept: application/vnd.github+json',
    `repos/${REPO_SLUG}/commits/${deps.targetSha}/check-runs?per_page=100`
  ], deps.runCapture));
  const checkRunsResponse = fetchCheckRuns();
  const checkRuns = checkRunsResponse && Array.isArray(checkRunsResponse.check_runs) ? checkRunsResponse.check_runs : [];
  const now = deps.nowMs ? deps.nowMs() : Date.now();
  const starved = checkRuns.filter((run) => {
    if (run.status === 'queued' || run.status === 'in_progress') {
      const startedAtMs = run.started_at ? Date.parse(run.started_at) : null;
      if (!startedAtMs) return false;
      return (now - startedAtMs) / 60000 >= thresholdMinutes;
    }
    return run.status === 'completed' && run.conclusion === 'cancelled';
  });
  if (starved.length > 0) {
    return {
      status: 'unavailable',
      reason: REASON_CODES.QUEUE_STARVATION,
      evidence: `${starved.length} check run(s) for ${deps.targetSha} queued/in_progress past ${thresholdMinutes}min or cancelled without a conclusion`
    };
  }

  return { status: 'available', reason: REASON_CODES.HEALTHY, evidence: 'self-hosted pool online, no starved check runs for target SHA' };
}

// --- top-level assembly -------------------------------------------------------------------------

/**
 * @param {{targetSha: string, targetClass: 'hosted'|'self-hosted'|'both', canary: boolean, thresholdMinutes: number, activeRouting: 'self-hosted'|'hosted'}} options
 * @param {object} deps injectable fetch/dispatch/sleep functions, defaulting to real gh/curl calls
 * @returns {object} sku-ci-runner-preflight/v1 report
 */
function runPreflight(options, deps = {}) {
  const runCapture = deps.runCapture || defaultRunCapture;
  const mergedDeps = { ...deps, runCapture, targetSha: options.targetSha };

  const hosted = options.targetClass === 'self-hosted'
    ? { status: 'indeterminate', reason: 'not_probed', evidence: '--class self-hosted: hosted probe skipped' }
    : probeHostedAvailability(mergedDeps, { canary: options.canary, thresholdMinutes: options.thresholdMinutes });

  const selfHosted = options.targetClass === 'hosted'
    ? { status: 'indeterminate', reason: 'not_probed', evidence: '--class hosted: self-hosted probe skipped' }
    : probeSelfHostedAvailability(mergedDeps, { thresholdMinutes: options.thresholdMinutes });

  const activeRouting = options.activeRouting || 'self-hosted';
  const activeStatus = activeRouting === 'hosted' ? hosted.status : selfHosted.status;

  // Recommend the currently-active class unless it's verifiably unavailable and the other class
  // is verifiably available -- never recommend a flip on an indeterminate reading either side (per
  // Wave 2 Sec 2.5: never a silent, undocumented flip, and never a flip on a guess).
  let recommendedRouting = activeRouting;
  let flipRequired = false;
  if (activeStatus === 'unavailable') {
    const other = activeRouting === 'hosted' ? selfHosted : hosted;
    if (other.status === 'available') {
      recommendedRouting = activeRouting === 'hosted' ? 'self-hosted' : 'hosted';
      flipRequired = true;
    }
  }

  return {
    schema: 'sku-ci-runner-preflight/v1',
    target_sha: options.targetSha,
    captured_at: new Date().toISOString(),
    hosted,
    self_hosted: selfHosted,
    active_routing: activeRouting,
    recommended_routing: recommendedRouting,
    flip_required: flipRequired
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    options.activeRouting = 'self-hosted'; // Phase 233 scaffold: every site's active class today.
    const report = runPreflight(options);

    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify(report, null, 2));

    const activeStatus = report.active_routing === 'hosted' ? report.hosted.status : report.self_hosted.status;
    if (report.flip_required) {
      console.error(
        `[ci-runner-preflight] FLIP REQUIRED: active routing (${report.active_routing}) is unavailable, ` +
        `${report.recommended_routing} is available. Comment/uncomment the documented alternate lines in ` +
        'deploy-main.yml / promotion-quality-gate.yml (see docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md) -- ' +
        'this script never flips a routing value itself.'
      );
      process.exit(3);
    }
    if (activeStatus === 'indeterminate' || activeStatus === 'unavailable') {
      console.error(`[ci-runner-preflight] active routing (${report.active_routing}) status is "${activeStatus}" and no documented flip is available -- could not confirm availability.`);
      process.exit(1);
    }
    console.log(`[ci-runner-preflight] OK. Active routing (${report.active_routing}) is available.`);
  } catch (error) {
    console.error(`[ci-runner-preflight] ${error.code || 'FAILED'}: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  RunnerPreflightError,
  parseArgs,
  probeBillingApi,
  probeGithubStatus,
  probeCanary,
  probeHostedAvailability,
  probeSelfHostedAvailability,
  runPreflight,
  REPO_SLUG,
  ORG_SLUG,
  PROBE_WORKFLOW
};
