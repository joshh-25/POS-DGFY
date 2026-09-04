const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REASON_CODES,
  BILLING_MESSAGE,
  evaluateSelfHostedPool,
  evaluateGithubStatusOutage
} = require('./runner-availability');

// Phase 233 (#1365), F-4 refactor: direct unit coverage for the two extracted interpretation
// helpers, independent of scripts/pr-checks.test.js's own classifyCiUnavailability coverage (which
// already exercises both indirectly through pr-checks.js's unchanged dependency-injection surface
// -- this file is the regression net for the extracted module itself, not a duplicate of that
// suite).

test('REASON_CODES: the four unavailability reasons plus healthy, matching AGENTS.md\'s taxonomy', () => {
  assert.deepEqual(REASON_CODES, {
    RUNNER_OFFLINE: 'runner_offline',
    QUEUE_STARVATION: 'queue_starvation',
    BILLING_ALLOCATION_FAILURE: 'billing_allocation_failure',
    GITHUB_PLATFORM_OUTAGE: 'github_platform_outage',
    HEALTHY: 'healthy'
  });
});

test('BILLING_MESSAGE: re-exported from collect-github-actions-unavailability.js, not duplicated', () => {
  const { BILLING_MESSAGE: original } = require('../collect-github-actions-unavailability');
  assert.equal(BILLING_MESSAGE, original);
});

test('evaluateSelfHostedPool: returns runner_offline when every runner is non-online', () => {
  const result = evaluateSelfHostedPool({ runners: [{ status: 'offline' }, { status: 'offline' }] });
  assert.equal(result.reason, REASON_CODES.RUNNER_OFFLINE);
  assert.match(result.evidence, /all 2 runner\(s\)/);
});

test('evaluateSelfHostedPool: returns null when at least one runner is online', () => {
  const result = evaluateSelfHostedPool({ runners: [{ status: 'online' }, { status: 'offline' }] });
  assert.equal(result, null);
});

test('evaluateSelfHostedPool: returns null (not a crash) on an empty or unparseable response', () => {
  assert.equal(evaluateSelfHostedPool(null), null);
  assert.equal(evaluateSelfHostedPool({}), null);
  assert.equal(evaluateSelfHostedPool({ runners: [] }), null);
});

test('evaluateGithubStatusOutage: returns github_platform_outage when Actions is non-operational, citing the matching incident', () => {
  const statusSummary = {
    components: [{ id: 'comp-actions', name: 'Actions', status: 'major_outage' }],
    incidents: [
      { name: 'Unrelated Pages incident', status: 'investigating', components: [{ id: 'comp-pages' }] },
      { name: 'Actions degraded', status: 'identified', components: [{ id: 'comp-actions' }] }
    ]
  };
  const result = evaluateGithubStatusOutage(statusSummary, 'a'.repeat(40));
  assert.equal(result.reason, REASON_CODES.GITHUB_PLATFORM_OUTAGE);
  assert.match(result.evidence, /major_outage/);
  assert.match(result.evidence, /Actions degraded/);
  assert.doesNotMatch(result.evidence, /Unrelated Pages incident/);
});

test('evaluateGithubStatusOutage: returns null when Actions is operational', () => {
  const statusSummary = { components: [{ id: 'comp-actions', name: 'Actions', status: 'operational' }] };
  assert.equal(evaluateGithubStatusOutage(statusSummary, 'a'.repeat(40)), null);
});

test('evaluateGithubStatusOutage: returns null (not a crash) when the fetch failed or was unparseable', () => {
  assert.equal(evaluateGithubStatusOutage(null, 'a'.repeat(40)), null);
  assert.equal(evaluateGithubStatusOutage({}, 'a'.repeat(40)), null);
});
