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
