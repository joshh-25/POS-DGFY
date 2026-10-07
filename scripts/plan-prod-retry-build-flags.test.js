'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, candidateApps, parseArgs, priorOutcome, renderPlan } = require('./plan-prod-retry-build-flags');

const manifest = {
  revisions: [{ apps_touched: ['dgfy-api', 'dgfy-migration-runner', 'dgfy-pos'] }],
  release_revision: { apps: { 'dgfy-api': {}, 'dgfy-migration-runner': {}, 'dgfy-pos': {}, 'dgfy-opis': {} } },
};

test('parses required manifest and positive run ID', () => {
  assert.deepEqual(parseArgs(['--manifest', 'candidate.json', '--run-id', '123']), { manifest: 'candidate.json', runId: '123' });
  assert.throws(() => parseArgs(['--manifest', 'candidate.json', '--run-id', '0']), /positive numeric/);
  assert.throws(() => parseArgs(['--run-id', '123']), /--manifest/);
});

test('candidate scope is the union of touched and selected release apps', () => {
  assert.deepEqual([...candidateApps(manifest)].sort(), ['dgfy-api', 'dgfy-migration-runner', 'dgfy-opis', 'dgfy-pos']);
});

test('failed or absent app jobs rebuild; successful jobs reuse immutable artifacts', () => {
  const plan = buildPlan(manifest, [
    { name: 'dgfy-api / build-and-push', conclusion: 'success' },
    { name: 'dgfy-migration-runner', conclusion: 'failure' },
    { name: 'frontend-pos-prod', conclusion: 'cancelled' },
  ]);
  assert.equal(plan.flagValues.build_api, 'true');
  assert.equal(plan.flagValues.build_frontend_pos, 'true');
  assert.equal(plan.flagValues.build_frontend_opis, 'true');
  assert.equal(plan.flagValues.build_frontend_ims, 'false');
  assert.equal(plan.flagValues.build_frontend_admin, 'false');
});

test('a candidate app excluded from jobs is fail-closed and out-of-scope apps are explicit', () => {
  assert.equal(priorOutcome([], 'dgfy-opis'), 'absent-from-run');
  const output = renderPlan(buildPlan(manifest, []));
  assert.match(output, /not in this candidate/);
  assert.match(output, /-f build_frontend_admin=false/);
  assert.match(output, /cannot see live CI runner or registry state/);
  for (const flag of ['build_api', 'build_frontend_ims', 'build_frontend_pos', 'build_frontend_storefront', 'build_frontend_opis', 'build_frontend_admin']) {
    assert.match(output, new RegExp(`-f ${flag}=(true|false)`));
  }
});

test('skipped jobs rebuild and non-terminal jobs stop retry planning', () => {
  assert.equal(priorOutcome([{ name: 'frontend-ims-prod', conclusion: 'skipped' }], 'dgfy-ims'), 'skipped');
  assert.throws(() => priorOutcome([{ name: 'dgfy-api', status: 'in_progress', conclusion: null }], 'dgfy-api'), /non-terminal/);
});
