const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  probeBillingApi,
  probeGithubStatus,
  probeCanary,
  probeHostedAvailability,
  probeSelfHostedAvailability,
  runPreflight,
  resolveActiveRouting
} = require('./ci-runner-preflight');

const SHA = 'a'.repeat(40);

// --- parseArgs ---------------------------------------------------------------------------------

test('parseArgs: requires --target-sha as a 40-hex-char SHA', () => {
  assert.throws(() => parseArgs([]), /--target-sha/);
  assert.throws(() => parseArgs(['--target-sha', 'not-a-sha']), /--target-sha/);
  const options = parseArgs(['--target-sha', SHA]);
  assert.equal(options.targetSha, SHA);
  assert.equal(options.targetClass, 'both');
  assert.equal(options.canary, false);
  assert.equal(options.thresholdMinutes, 20);
});

test('parseArgs: accepts --class, --canary, --output, --threshold-minutes', () => {
  const options = parseArgs([
    '--target-sha', SHA, '--class', 'hosted', '--canary', '--output', 'out.json', '--threshold-minutes', '5'
  ]);
  assert.equal(options.targetClass, 'hosted');
  assert.equal(options.canary, true);
  assert.equal(options.output, 'out.json');
  assert.equal(options.thresholdMinutes, 5);
});

test('parseArgs: rejects an invalid --class value', () => {
  assert.throws(() => parseArgs(['--target-sha', SHA, '--class', 'quantum']), /--class must be one of/);
});

test('parseArgs: rejects an unknown flag', () => {
  assert.throws(() => parseArgs(['--target-sha', SHA, '--bogus']), /Unknown argument/);
});

// --- probeBillingApi -----------------------------------------------------------------------------

test('probeBillingApi: a 404/non-zero exit is indeterminate, never healthy (silence is not availability)', () => {
  const result = probeBillingApi({ runCapture: () => ({ status: 1, stdout: '', stderr: 'HTTP 404' }) });
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.reason, 'billing_scope_unavailable');
});

test('probeBillingApi: minutes under the included ceiling is available', () => {
  const result = probeBillingApi({
    runCapture: () => ({ status: 0, stdout: JSON.stringify({ included_minutes: 3000, total_minutes_used: 100 }), stderr: '' })
  });
  assert.equal(result.status, 'available');
});

test('probeBillingApi: minutes at/over the ceiling with no paid overage is unavailable (billing_allocation_failure)', () => {
  const result = probeBillingApi({
    runCapture: () => ({ status: 0, stdout: JSON.stringify({ included_minutes: 3000, total_minutes_used: 3000, total_paid_minutes_used: 0 }), stderr: '' })
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'billing_allocation_failure');
});

test('probeBillingApi: minutes over the ceiling with paid overage active is still available', () => {
  const result = probeBillingApi({
    runCapture: () => ({ status: 0, stdout: JSON.stringify({ included_minutes: 3000, total_minutes_used: 3200, total_paid_minutes_used: 200 }), stderr: '' })
  });
  assert.equal(result.status, 'available');
});

test('probeBillingApi: unparseable JSON on a 0 exit is indeterminate, not a crash', () => {
  const result = probeBillingApi({ runCapture: () => ({ status: 0, stdout: 'not json', stderr: '' }) });
  assert.equal(result.status, 'indeterminate');
});

// --- probeGithubStatus ---------------------------------------------------------------------------

test('probeGithubStatus: Actions non-operational returns unavailable/github_platform_outage', () => {
  const statusSummary = { components: [{ id: 'a', name: 'Actions', status: 'major_outage' }] };
  const result = probeGithubStatus({
    targetSha: SHA,
    fetchGithubStatus: () => statusSummary
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'github_platform_outage');
});

test('probeGithubStatus: Actions operational returns null (no finding)', () => {
  const statusSummary = { components: [{ id: 'a', name: 'Actions', status: 'operational' }] };
  const result = probeGithubStatus({ targetSha: SHA, fetchGithubStatus: () => statusSummary });
  assert.equal(result, null);
});

// --- probeCanary ---------------------------------------------------------------------------------

test('probeCanary: dispatch failure is indeterminate', () => {
  const result = probeCanary({
    runCapture: () => ({ status: 1, stdout: '', stderr: 'dispatch failed' })
  }, 20);
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.reason, 'canary_dispatch_failed');
});

test('probeCanary: run picked up by a runner (real runner_name) is available', () => {
  let cancelled = false;
  const result = probeCanary({
    runCapture: () => ({ status: 0, stdout: '', stderr: '' }),
    dispatchProbe: () => ({ status: 0, stdout: '', stderr: '' }),
    pollForRun: () => [{ databaseId: 123, status: 'in_progress', conclusion: null }],
    fetchJobs: () => ({ jobs: [{ runner_name: 'ghrunner-abc' }] }),
    cancelRun: () => { cancelled = true; return { status: 0 }; },
    sleep: () => {},
    nowMs: () => 0
  }, 20);
  assert.equal(result.status, 'available');
  assert.equal(cancelled, true);
});

test('probeCanary: fails fast (<10s) with a billing annotation is unavailable/billing_allocation_failure', () => {
  let clock = 0;
  const result = probeCanary({
    runCapture: () => ({ status: 0, stdout: '', stderr: '' }),
    dispatchProbe: () => ({ status: 0, stdout: '', stderr: '' }),
    pollForRun: () => [{ databaseId: 123, status: 'completed', conclusion: 'failure' }],
    fetchJobs: () => ({ jobs: [{ runner_name: null }] }),
    fetchAnnotations: () => [{ message: 'job was not started because recent account payments have failed or your spending limit needs to be increased' }],
    sleep: () => {},
    nowMs: () => { clock += 2000; return clock; } // 2s elapsed by the time it's checked
  }, 20);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'billing_allocation_failure');
});

test('probeCanary: stays queued past --threshold-minutes is unavailable/queue_starvation', () => {
  let clock = 0;
  const result = probeCanary({
    runCapture: () => ({ status: 0, stdout: '', stderr: '' }),
    dispatchProbe: () => ({ status: 0, stdout: '', stderr: '' }),
    pollForRun: () => [{ databaseId: 123, status: 'queued', conclusion: null }],
    sleep: () => { clock += 6 * 60000; }, // 6 minutes per poll tick
    nowMs: () => clock
  }, 10); // threshold 10 minutes -> loop exits after ~2 ticks
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'queue_starvation');
});

// --- probeHostedAvailability / probeSelfHostedAvailability -----------------------------------------

test('probeHostedAvailability: billing available short-circuits before githubstatus/canary', () => {
  let githubStatusCalled = false;
  const result = probeHostedAvailability({
    targetSha: SHA,
    runCapture: () => ({ status: 0, stdout: JSON.stringify({ included_minutes: 3000, total_minutes_used: 0 }), stderr: '' }),
    fetchGithubStatus: () => { githubStatusCalled = true; return null; }
  }, { canary: false, thresholdMinutes: 20 });
  assert.equal(result.status, 'available');
  assert.equal(githubStatusCalled, false);
});

test('probeHostedAvailability: billing indeterminate falls through to githubstatus outage', () => {
  const result = probeHostedAvailability({
    targetSha: SHA,
    runCapture: () => ({ status: 1, stdout: '', stderr: '404' }),
    fetchGithubStatus: () => ({ components: [{ id: 'a', name: 'Actions', status: 'major_outage' }] })
  }, { canary: false, thresholdMinutes: 20 });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'github_platform_outage');
});

test('probeHostedAvailability: both indeterminate and no --canary returns indeterminate, never healthy', () => {
  const result = probeHostedAvailability({
    targetSha: SHA,
    runCapture: () => ({ status: 1, stdout: '', stderr: '404' }),
    fetchGithubStatus: () => ({ components: [{ id: 'a', name: 'Actions', status: 'operational' }] })
  }, { canary: false, thresholdMinutes: 20 });
  assert.equal(result.status, 'indeterminate');
});

test('probeSelfHostedAvailability: offline pool is unavailable/runner_offline', () => {
  const result = probeSelfHostedAvailability({
    targetSha: SHA,
    fetchRunners: () => ({ runners: [{ status: 'offline' }] })
  }, { thresholdMinutes: 20 });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'runner_offline');
});

test('probeSelfHostedAvailability: online pool with no starved checks is available', () => {
  const result = probeSelfHostedAvailability({
    targetSha: SHA,
    fetchRunners: () => ({ runners: [{ status: 'online' }] }),
    fetchCheckRuns: () => ({ check_runs: [] })
  }, { thresholdMinutes: 20 });
  assert.equal(result.status, 'available');
});

test('probeSelfHostedAvailability: online pool with a starved check is unavailable/queue_starvation', () => {
  const result = probeSelfHostedAvailability({
    targetSha: SHA,
    fetchRunners: () => ({ runners: [{ status: 'online' }] }),
    fetchCheckRuns: () => ({ check_runs: [{ status: 'queued', started_at: new Date(60000).toISOString() }] }),
    nowMs: () => 60000 + 30 * 60000 // 30 minutes after start -> past the 20min threshold
  }, { thresholdMinutes: 20 });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'queue_starvation');
});

// --- runPreflight (top-level assembly) --------------------------------------------------------

test('runPreflight: active self-hosted routing available -> exit-code-0 shape, no flip required', () => {
  const report = runPreflight({
    targetSha: SHA, targetClass: 'both', canary: false, thresholdMinutes: 20, activeRouting: 'self-hosted'
  }, {
    runCapture: () => ({ status: 1, stdout: '', stderr: '404' }), // hosted: indeterminate
    fetchGithubStatus: () => ({ components: [{ id: 'a', name: 'Actions', status: 'operational' }] }),
    fetchRunners: () => ({ runners: [{ status: 'online' }] }),
    fetchCheckRuns: () => ({ check_runs: [] })
  });
  assert.equal(report.schema, 'sku-ci-runner-preflight/v1');
  assert.equal(report.active_routing, 'self-hosted');
  assert.equal(report.self_hosted.status, 'available');
  assert.equal(report.flip_required, false);
  assert.equal(report.recommended_routing, 'self-hosted');
});

test('runPreflight: active self-hosted unavailable, hosted available -> flip_required true, recommends hosted', () => {
  const report = runPreflight({
    targetSha: SHA, targetClass: 'both', canary: false, thresholdMinutes: 20, activeRouting: 'self-hosted'
  }, {
    runCapture: () => ({ status: 0, stdout: JSON.stringify({ included_minutes: 3000, total_minutes_used: 0 }), stderr: '' }),
    fetchRunners: () => ({ runners: [{ status: 'offline' }] })
  });
  assert.equal(report.self_hosted.status, 'unavailable');
  assert.equal(report.hosted.status, 'available');
  assert.equal(report.flip_required, true);
  assert.equal(report.recommended_routing, 'hosted');
});

test('runPreflight: active unavailable but the other class is also not available -> no flip recommended (never a guess)', () => {
  const report = runPreflight({
    targetSha: SHA, targetClass: 'both', canary: false, thresholdMinutes: 20, activeRouting: 'self-hosted'
  }, {
    runCapture: () => ({ status: 1, stdout: '', stderr: '404' }), // hosted: indeterminate
    fetchGithubStatus: () => ({ components: [{ id: 'a', name: 'Actions', status: 'operational' }] }),
    fetchRunners: () => ({ runners: [{ status: 'offline' }] })
  });
  assert.equal(report.self_hosted.status, 'unavailable');
  assert.equal(report.hosted.status, 'indeterminate');
  assert.equal(report.flip_required, false);
  assert.equal(report.recommended_routing, 'self-hosted');
});

test('runPreflight: --class self-hosted skips the hosted probe entirely', () => {
  const report = runPreflight({
    targetSha: SHA, targetClass: 'self-hosted', canary: false, thresholdMinutes: 20, activeRouting: 'self-hosted'
  }, {
    fetchRunners: () => ({ runners: [{ status: 'online' }] }),
    fetchCheckRuns: () => ({ check_runs: [] })
  });
  assert.equal(report.hosted.reason, 'not_probed');
});

// --- Phase 234 (#1365) Wave 1 (F-4): resolveActiveRouting -- replaces the Phase 233 hardcoded ------
// 'self-hosted' literal with a derived read of the two PROD-facing workflow files themselves. -------

function pairJobBlock(name, activeHosted) {
  return activeHosted
    ? `\n  ${name}:\n    # runner_labels_json: '["sieitz-runner"]'\n    runner_labels_json: '["ubuntu-latest"]'\n`
    : `\n  ${name}:\n    # runner_labels_json: '["ubuntu-latest"]'\n    runner_labels_json: '["sieitz-runner"]'\n`;
}

test('resolveActiveRouting: derives self-hosted from an all-self-hosted-active tree', () => {
  const deployMainText = `jobs:${pairJobBlock('job-a', false)}`;
  const qualityGateText = `jobs:${pairJobBlock('job-b', false)}`;
  assert.equal(resolveActiveRouting({ deployMainText, qualityGateText }), 'self-hosted');
});

test('resolveActiveRouting: derives hosted from an all-hosted-active tree (post-flip shape)', () => {
  const deployMainText = `jobs:${pairJobBlock('job-a', true)}`;
  const qualityGateText = `jobs:${pairJobBlock('job-b', true)}`;
  assert.equal(resolveActiveRouting({ deployMainText, qualityGateText }), 'hosted');
});

test('resolveActiveRouting: derives mixed when non-exempt sites disagree (inconsistent tree)', () => {
  const deployMainText = `jobs:${pairJobBlock('job-a', true)}`;
  const qualityGateText = `jobs:${pairJobBlock('job-b', false)}`;
  assert.equal(resolveActiveRouting({ deployMainText, qualityGateText }), 'mixed');
});

test('resolveActiveRouting: defaults to reading the two real workflow files off disk when no text is injected', () => {
  // Phase 234 Wave 3 (live cutover) -- the real tree now derives hosted, matching EXPECTED_ACTIVE_CLASS.
  assert.equal(resolveActiveRouting(), 'hosted');
});

test('runPreflight with a mixed-derived activeRouting is never asked to run -- main() must exit 1 before calling it', () => {
  // resolveActiveRouting's 'mixed' result is handled by main() (process.exit(1) with an explicit
  // "routing inconsistent" message) before runPreflight is ever invoked -- runPreflight itself has
  // no 'mixed' branch and isn't expected to grow one; this test documents that boundary rather than
  // exercising unreachable code inside runPreflight.
  const deployMainText = `jobs:${pairJobBlock('job-a', true)}`;
  const qualityGateText = `jobs:${pairJobBlock('job-b', false)}`;
  assert.equal(resolveActiveRouting({ deployMainText, qualityGateText }), 'mixed');
});
