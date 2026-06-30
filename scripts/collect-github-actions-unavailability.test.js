const test = require('node:test');
const assert = require('node:assert/strict');

const { ActionsUnavailabilityError, collect } = require('./collect-github-actions-unavailability');

const SHA = '0123456789abcdef0123456789abcdef01234567';

function runnerFor({ steps = [], runnerId = 0, annotation = 'The job was not started because recent account payments have failed or your spending limit needs to be increased.' } = {}) {
  return (_command, args) => {
    const endpoint = args.at(-1);
    if (endpoint.includes('/commits/')) return JSON.stringify({ check_runs: [{ id: 42, name: 'staging-qualification', conclusion: 'failure', details_url: 'https://github.com/owner/repo/actions/runs/7/job/42', app: { slug: 'github-actions' } }] });
    if (endpoint.includes('/actions/jobs/')) return JSON.stringify({ id: 42, run_id: 7, runner_id: runnerId, runner_name: runnerId ? 'runner' : '', steps });
    return JSON.stringify([{ message: annotation }]);
  };
}

test('collects exact zero-runner billing allocation evidence', () => {
  const report = collect({ repository: 'owner/repo', targetSha: SHA, requiredChecks: ['staging-qualification'] }, runnerFor());
  assert.equal(report.status, 'pass');
  assert.equal(report.reason, 'billing_allocation_failure');
  assert.equal(report.required_checks[0].steps, 0);
});

test('rejects a job that executed any step', () => {
  assert.throws(
    () => collect({ repository: 'owner/repo', targetSha: SHA, requiredChecks: ['staging-qualification'] }, runnerFor({ steps: [{ name: 'checkout' }] })),
    (error) => error instanceof ActionsUnavailabilityError && error.code === 'NOT_BILLING_UNAVAILABLE'
  );
});

test('rejects a generic runner failure without the billing annotation', () => {
  assert.throws(
    () => collect({ repository: 'owner/repo', targetSha: SHA, requiredChecks: ['staging-qualification'] }, runnerFor({ annotation: 'Runner disconnected' })),
    (error) => error.code === 'NOT_BILLING_UNAVAILABLE'
  );
});
