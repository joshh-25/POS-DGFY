const test = require('node:test');
const assert = require('node:assert/strict');

const { StagingObservationError, validateStagingObservation } = require('./check-staging-candidate-observation');

const sha = (char) => char.repeat(40);
const candidate = {
  schema: 'sku-release-candidate/v1',
  candidate_id: '2026-09-04-01',
  status: 'staging_soak',
  source_develop_sha: sha('a'),
  current_staging_sha: sha('a'),
  revisions: [{ kind: 'initial', sha: sha('a'), parent_sha: null, branch: 'to-staging/2026-09-04-01' }],
  release_revision: { revision: 1, source_staging_sha: sha('a'), branch: 'release/2026-09-04-01-r1', pr: 12 },
};

const passing = () => ({
  schema: 'sku-staging-observation/v1', candidate_id: candidate.candidate_id,
  candidate_sha: sha('a'), runtime_sha: sha('a'), result: 'pass', operational_mutation: false,
  checks: { health: { status: 'pass' }, migration: { status: 'pass' }, api: { status: 'pass' }, ui: { status: 'pass' } },
});

test('accepts an exact-SHA, read-only staging observation', () => {
  assert.deepEqual(validateStagingObservation(passing(), candidate).checks, ['health', 'migration', 'api', 'ui']);
});

test('rejects stale runtime evidence', () => {
  const observation = passing();
  observation.runtime_sha = sha('b');
  assert.throws(() => validateStagingObservation(observation, candidate), (error) => error instanceof StagingObservationError && error.code === 'RUNTIME_SHA_MISMATCH');
});

test('rejects failed checks and operational mutation', () => {
  const observation = passing();
  observation.checks.api.status = 'fail';
  assert.throws(() => validateStagingObservation(observation, candidate), /Staging observation check failed: api/);
  const mutated = passing();
  mutated.operational_mutation = true;
  assert.throws(() => validateStagingObservation(mutated, candidate), /must not perform operational mutations/);
});
