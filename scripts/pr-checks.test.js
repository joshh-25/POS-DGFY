const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  PATH_FILTERS,
  BACKEND_TEST_INVENTORY_FILTER,
  parseArgs,
  detectComponents,
  classifyCiUnavailability,
  renderComment,
  findLatestLocalCiComment,
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
  assert.deepEqual(components, {
    frontend_ims: false,
    frontend_pos: false,
    frontend_storefront: false,
    dgfy_api: true,
    migration_runner: false,
  });
});

test('detectComponents flags all three frontend apps for a shared-constants change', () => {
  const components = detectComponents(['packages/shared-constants/index.js']);
  assert.equal(components.frontend_ims, true);
  assert.equal(components.frontend_pos, true);
  assert.equal(components.frontend_storefront, true);
  assert.equal(components.dgfy_api, true);
});

test('detectComponents flags only dgfy-ims and dgfy-pos, not storefront, for a pos-receipt change', () => {
  const components = detectComponents(['packages/pos-receipt/index.js']);
  assert.equal(components.frontend_ims, true);
  assert.equal(components.frontend_pos, true);
  assert.equal(components.frontend_storefront, false);
});

test('detectComponents flags nothing for a docs-only change', () => {
  const components = detectComponents(['docs/ops/RUNBOOK.md']);
  assert.deepEqual(components, {
    frontend_ims: false,
    frontend_pos: false,
    frontend_storefront: false,
    dgfy_api: false,
    migration_runner: false,
  });
});

// --- #1454: backend-test-inventory freshness trigger -----------------------
// Narrower than PATH_FILTERS.dgfy_api by design (only the audit's own inputs and
// outputs), and deliberately NOT a PATH_FILTERS entry -- see the constant's own comment.

test('BACKEND_TEST_INVENTORY_FILTER fires for a change under apps/dgfy-api/tests/', () => {
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('apps/dgfy-api/tests/example.supertest.test.js'), true);
});

test('BACKEND_TEST_INVENTORY_FILTER fires for the audit tool and its two data inputs', () => {
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('scripts/audit-backend-test-inventory.js'), true);
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('scripts/backend-test-audit-overrides.js'), true);
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('scripts/backend-db-dependent-tests.js'), true);
});

test('BACKEND_TEST_INVENTORY_FILTER fires when the committed inventory outputs change', () => {
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('docs/testing/backend-test-suite-inventory.json'), true);
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('docs/testing/backend-test-suite-value-audit.md'), true);
});

test('BACKEND_TEST_INVENTORY_FILTER does NOT fire for an ordinary apps/dgfy-api/src change', () => {
  const file = 'apps/dgfy-api/src/routes/pos.js';
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test(file), false);
  // The property #1454 actually needs: narrower than the dgfy_api component filter,
  // not just "narrower in spirit".
  assert.equal(detectComponents([file]).dgfy_api, true);
});

test('BACKEND_TEST_INVENTORY_FILTER does NOT fire for an unrelated docs or scripts change', () => {
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('docs/ops/RUNBOOK.md'), false);
  assert.equal(BACKEND_TEST_INVENTORY_FILTER.test('scripts/pr-checks.js'), false);
});

test('BACKEND_TEST_INVENTORY_FILTER is deliberately not a PATH_FILTERS entry', () => {
  // Guards the shared-changed-paths.yml anti-drift test at the top of this file against
  // a future fold-in -- this filter has no workflow counterpart and would fail it.
  assert.ok(
    !Object.values(PATH_FILTERS).some((r) => r.source === BACKEND_TEST_INVENTORY_FILTER.source),
    'BACKEND_TEST_INVENTORY_FILTER must stay a separate constant, never merged into PATH_FILTERS'
  );
});

test('root package.json still defines the audit:backend-tests:check script this check invokes', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(typeof pkg.scripts['audit:backend-tests:check'], 'string');
  assert.ok(pkg.scripts['audit:backend-tests:check'].length > 0);
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
        check_runs: [{ name: 'frontend-ims-build-check', status: 'completed', conclusion: 'cancelled' }],
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
      fetchGithubStatus: () => ({ components: [{ name: 'Actions', status: 'operational' }], incidents: [] }),
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
      fetchGithubStatus: () => ({ components: [{ name: 'Actions', status: 'operational' }], incidents: [] }),
    }
  );
  assert.equal(result.reason, 'healthy');
});

test('classifyCiUnavailability returns github_platform_outage when GitHub Status reports Actions non-operational (#1077)', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [] }),
      tryBillingFallback: () => null,
      fetchCheckSuites: () => ({ total_count: 0 }),
      fetchGithubStatus: () => ({
        components: [{ id: 'actions-id', name: 'Actions', status: 'major_outage' }],
        incidents: [{ name: 'Actions and Pages Incident', status: 'investigating', components: [{ id: 'actions-id' }] }],
      }),
    }
  );
  assert.equal(result.reason, 'github_platform_outage');
  assert.match(result.evidence, /major_outage/);
  assert.match(result.evidence, /Actions and Pages Incident/);
});

test('classifyCiUnavailability falls through to healthy when GitHub Status reports Actions operational', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [] }),
      tryBillingFallback: () => null,
      fetchCheckSuites: () => ({ total_count: 0 }),
      fetchGithubStatus: () => ({ components: [{ name: 'Actions', status: 'operational' }], incidents: [] }),
    }
  );
  assert.equal(result.reason, 'healthy');
});

test('classifyCiUnavailability falls through to healthy (not a crash) when the status fetch itself fails', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [] }),
      tryBillingFallback: () => null,
      fetchCheckSuites: () => ({ total_count: 0 }),
      fetchGithubStatus: () => null,
    }
  );
  assert.equal(result.reason, 'healthy');
});

// RF-1 (PR #1078 review): a global GitHub Status incident on Actions must not
// override actual target-SHA evidence that checks ran fine. A completed
// check run for this SHA is proof CI was not absent, regardless of what
// githubstatus.com says about Actions elsewhere.
test('classifyCiUnavailability does NOT report github_platform_outage when the target SHA already has a completed check run (RF-1)', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [{ name: 'dgfy-api-build-check', status: 'completed', conclusion: 'success' }] }),
      tryBillingFallback: () => null,
      fetchGithubStatus: () => ({ components: [{ name: 'Actions', status: 'degraded_performance' }], incidents: [] }),
    }
  );
  assert.equal(result.reason, 'healthy');
});

// RF-1: zero check-*runs* alone isn't proof nothing was created for this SHA
// -- a check-suite can exist with no runs yet. The gate requires zero
// check-suites too before consulting global status.
test('classifyCiUnavailability does NOT report github_platform_outage when a check-suite exists for the SHA even with zero check-runs (RF-1)', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [] }),
      tryBillingFallback: () => null,
      fetchCheckSuites: () => ({ total_count: 1 }),
      fetchGithubStatus: () => ({ components: [{ name: 'Actions', status: 'major_outage' }], incidents: [] }),
    }
  );
  assert.equal(result.reason, 'healthy');
});

// RF-1: an unconfirmed check-suites fetch (network failure) must fail safe,
// not silently satisfy the zero-suites gate.
test('classifyCiUnavailability does NOT report github_platform_outage when the check-suites fetch itself fails (RF-1)', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [] }),
      tryBillingFallback: () => null,
      fetchCheckSuites: () => null,
      fetchGithubStatus: () => ({ components: [{ name: 'Actions', status: 'major_outage' }], incidents: [] }),
    }
  );
  assert.equal(result.reason, 'healthy');
});

// RF-1: incidents[] can list incidents unrelated to the Actions component
// (Pages, Packages, ...) -- only cite one that actually names Actions among
// its affected components, and omit the note rather than guess.
test('classifyCiUnavailability only cites an incident that actually lists the Actions component (RF-1)', () => {
  const result = classifyCiUnavailability(
    { headSha: 'abc123', thresholdMinutes: 20, nowMs: Date.now() },
    {
      fetchRunners: () => ({ runners: [{ status: 'online' }] }),
      fetchCheckRuns: () => ({ check_runs: [] }),
      tryBillingFallback: () => null,
      fetchCheckSuites: () => ({ total_count: 0 }),
      fetchGithubStatus: () => ({
        components: [{ id: 'actions-id', name: 'Actions', status: 'major_outage' }],
        incidents: [{ name: 'Unrelated Packages Incident', status: 'investigating', components: [{ id: 'packages-id' }] }],
      }),
    }
  );
  assert.equal(result.reason, 'github_platform_outage');
  assert.doesNotMatch(result.evidence, /incident:/);
});

// --- renderComment --------------------------------------------------------

test('renderComment always includes a non-empty "Not reproduced locally" section', () => {
  const comment = renderComment({
    overallResult: 'PASS',
    unavailability: { reason: 'queue_starvation', evidence: 'test evidence' },
    checks: [{ name: 'x', localEquivalent: 'y', result: 'pass' }],
    tier: 'fast',
    host: { platform: 'darwin', arch: 'arm64', nodeVersion: 'v24.0.0' },
    headSha: 'abc123def456',
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
    headSha: 'abc123def456',
  });
  assert.match(comment, /not invoked/);
});

// PR #725 RF-2: the comment must name the commit it is evidence for, so a
// reviewer can catch a stale comment (posted for an earlier commit) rather
// than treating it as valid merge evidence for the PR's current head.
test('renderComment states the commit SHA it is evidence for', () => {
  const comment = renderComment({
    overallResult: 'PASS',
    unavailability: { reason: 'runner_offline', evidence: 'test evidence' },
    checks: [{ name: 'x', localEquivalent: 'y', result: 'pass' }],
    tier: 'fast',
    host: { platform: 'darwin', arch: 'arm64', nodeVersion: 'v24.0.0' },
    headSha: 'deadbeef1234',
  });
  assert.match(comment, /Commit: deadbeef1234/);
  assert.match(comment, /evidence for commit `deadbeef1234` only/);
});

// --- findLatestLocalCiComment ---------------------------------------------
// PR #725 RF-1: gh pr comment --edit-last edits the last comment by the
// *authenticated user*, not the last `## Local CI` comment -- unsafe on a
// repo where every role shares one identity. This is the replacement that
// scopes the edit to a comment this tool itself owns.

test('findLatestLocalCiComment returns null when no comment matches the prefix', () => {
  const found = findLatestLocalCiComment(1, () => [
    { id: 1, body: '## Review — APPROVE\n...' },
    { id: 2, body: 'just a regular comment' },
  ]);
  assert.equal(found, null);
});

test('findLatestLocalCiComment ignores comments from other tools, like a pr-reviewer verdict', () => {
  const found = findLatestLocalCiComment(1, () => [
    { id: 1, body: '## Local CI — PASS\nCommit: aaa' },
    { id: 2, body: '## Review — BLOCK\n...' },
  ]);
  assert.equal(found.id, 1);
});

test('findLatestLocalCiComment returns the most recent Local CI comment when several exist', () => {
  const found = findLatestLocalCiComment(1, () => [
    { id: 1, body: '## Local CI — FAIL\nCommit: aaa' },
    { id: 2, body: '## Review — COMMENT\n...' },
    { id: 3, body: '## Local CI — PASS\nCommit: bbb' },
  ]);
  assert.equal(found.id, 3);
});

test('findLatestLocalCiComment tolerates a non-array response', () => {
  const found = findLatestLocalCiComment(1, () => null);
  assert.equal(found, null);
});
