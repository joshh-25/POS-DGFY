const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  PATH_FILTERS,
  parseArgs,
  detectComponents,
  classifyCiUnavailability,
  renderComment,
} = require('./pr-checks');

// --- anti-drift: PATH_FILTERS must stay verbatim in sync with the workflow -

test('PATH_FILTERS stay verbatim in sync with shared-changed-paths.yml', () => {
  const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'shared-changed-paths.yml');
  const workflowSource = fs.readFileSync(workflowPath, 'utf8');
  for (const [name, regex] of Object.entries(PATH_FILTERS)) {
    // JS regex literals escape "/" as "\/"; the workflow's bash single-quoted
    // strings do not. Normalize before comparing so this only fails on a
    // real semantic drift, not an escaping difference.
    const normalized = regex.source.replace(/\\\//g, '/');
    assert.ok(
      workflowSource.includes(normalized),
      `PATH_FILTERS.${name} no longer matches a pattern in shared-changed-paths.yml — the workflow's ` +
      `filter changed and scripts/pr-checks.js's ported copy needs to be updated to match.`
    );
  }
});

// --- parseArgs ---------------------------------------------------------

test('parseArgs defaults to fast tier and develop base', () => {
  const options = parseArgs([]);
  assert.equal(options.tier, 'fast');
  assert.equal(options.base, 'develop');
  assert.equal(options.post, false);
});

test('parseArgs accepts --tier full --post --pr', () => {
  const options = parseArgs(['--tier', 'full', '--post', '--pr', '724']);
  assert.equal(options.tier, 'full');
  assert.equal(options.post, true);
  assert.equal(options.pr, '724');
});

test('parseArgs rejects an invalid tier', () => {
  assert.throws(() => parseArgs(['--tier', 'medium']), /--tier must be fast or full/);
});

test('parseArgs rejects an unknown flag', () => {
  assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
});

// --- detectComponents ----------------------------------------------------

test('detectComponents flags only the components a change actually touches', () => {
  const components = detectComponents(['apps/dgfy-api/src/routes/pos.js', 'docs/README.md']);
  assert.deepEqual(components, { frontend: false, dgfy_api: true, migration_runner: false });
});

test('detectComponents flags frontend for a shared-constants change', () => {
  const components = detectComponents(['packages/shared-constants/index.js']);
  assert.equal(components.frontend, true);
  assert.equal(components.dgfy_api, true);
});

test('detectComponents flags nothing for a docs-only change', () => {
  const components = detectComponents(['docs/ops/RUNBOOK.md']);
  assert.deepEqual(components, { frontend: false, dgfy_api: false, migration_runner: false });
});

// --- classifyCiUnavailability ---------------------------------------------

test('classifyCiUnavailability returns runner_offline when every runner is non-online', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'offline' }, { status: 'offline' }] }),
      fetchCheckRuns: () => ({ check_runs: [] }),
      tryBillingFallback: () => null,
    }
  );
  assert.equal(result.reason, 'runner_offline');
});

test('classifyCiUnavailability returns queue_starvation when a check sits queued past the threshold', () => {
  const now = Date.now();
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: now },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({
        check_runs: [{ name: 'dgfy-api-build-check', status: 'queued', started_at: new Date(now - 25 * 60000).toISOString() }],
      }),
      tryBillingFallback: () => null,
    }
  );
  assert.equal(result.reason, 'queue_starvation');
});

test('classifyCiUnavailability returns queue_starvation for a cancelled-without-conclusion run', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({
        check_runs: [{ name: 'frontend-build-check', status: 'completed', conclusion: 'cancelled' }],
      }),
      tryBillingFallback: () => null,
    }
  );
  assert.equal(result.reason, 'queue_starvation');
});

test('classifyCiUnavailability does NOT flag a check that is merely still running under the threshold', () => {
  const now = Date.now();
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: now },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({
        check_runs: [{ name: 'dgfy-api-build-check', status: 'in_progress', started_at: new Date(now - 5 * 60000).toISOString() }],
      }),
      tryBillingFallback: () => null,
    }
  );
  assert.equal(result.reason, 'healthy');
});

test('classifyCiUnavailability returns billing_allocation_failure when the existing collector confirms it', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [{ name: 'x', status: 'completed', conclusion: 'success' }] }),
      tryBillingFallback: () => ({ status: 'pass', reason: 'billing_allocation_failure' }),
    }
  );
  assert.equal(result.reason, 'billing_allocation_failure');
});

test('classifyCiUnavailability returns healthy when nothing verifies unavailability', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [{ name: 'x', status: 'completed', conclusion: 'success' }] }),
      tryBillingFallback: () => null,
    }
  );
  assert.equal(result.reason, 'healthy');
});

// --- renderComment --------------------------------------------------------

test('renderComment always includes a non-empty "Not reproduced locally" section', () => {
  const comment = renderComment({
    overallResult: 'PASS',
    unavailability: { reason: 'queue_starvation', evidence: 'test evidence' },
    checks: [{ name: 'x', localEquivalent: 'y', result: 'pass' }],
    tier: 'fast',
    host: { platform: 'darwin', arch: 'arm64', nodeVersion: 'v24.0.0' },
  });
  assert.match(comment, /## Local CI — PASS/);
  assert.match(comment, /\*\*Not reproduced locally:\*\*/);
  assert.match(comment, /These are local runs, not CI runs/);
});

test('renderComment states the override was not invoked when the result is not PASS', () => {
  const comment = renderComment({
    overallResult: 'FAIL',
    unavailability: { reason: 'queue_starvation', evidence: 'test evidence' },
    checks: [{ name: 'x', localEquivalent: 'y', result: 'fail' }],
    tier: 'fast',
    host: { platform: 'darwin', arch: 'arm64', nodeVersion: 'v24.0.0' },
  });
  assert.match(comment, /not invoked/);
});
