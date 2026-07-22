const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterActiveSeams,
  resolveRequiredEnv,
  findMissingEnv,
  resolveRunnerForTestPath,
  runSeam,
  SEAM_REQUIRED_ENV,
} = require('./dgfy-seam-smoke');

/**
 * 06-02: proves the generic seam-smoke runner's pure, DB-free logic —
 * active-seam filtering (D-04), the seam-id -> required-integration-env map
 * (Pitfall 1 / Open Question 3), and fail-closed semantics for both missing
 * integration env and unmapped seam owners. No live MySQL is reachable in
 * this sandbox and the real migration-runner jest suite is never spawned —
 * every assertion here exercises the pure resolvers/runSeam's early-return
 * branches directly, mirroring check-compat-seams.test.js's fixture style.
 */

function baseManifest(seams) {
  return { version: 1, seams };
}

test('active-filter returns only status:"active" seams, excluding provisioning/accepted/pending/removed', () => {
  const manifest = baseManifest([
    { id: 'active-seam', status: 'active' },
    { id: 'accepted-seam', status: 'accepted' },
    { id: 'pending-seam', status: 'pending' },
    { id: 'removed-seam', status: 'removed' },
    { id: 'provisioning-seam', status: 'provisioning' },
  ]);

  const active = filterActiveSeams(manifest);

  assert.deepEqual(active.map((seam) => seam.id), ['active-seam']);
});

test('active-filter tolerates a missing/empty seams array without throwing', () => {
  assert.deepEqual(filterActiveSeams({}), []);
  assert.deepEqual(filterActiveSeams({ seams: [] }), []);
});

test('required-env resolver returns RUN_CONTINUITY_INTEGRATION for db-continuity-legacy-backup', () => {
  const required = resolveRequiredEnv('db-continuity-legacy-backup');

  assert.ok(Array.isArray(required));
  assert.ok(required.includes('RUN_CONTINUITY_INTEGRATION'));
  // Sanity-check the map itself carries the seam id (grep-verifiable in source too).
  assert.ok(Object.prototype.hasOwnProperty.call(SEAM_REQUIRED_ENV, 'db-continuity-legacy-backup'));
});

test('required-env resolver returns null for a seam id with no registered integration requirement', () => {
  assert.equal(resolveRequiredEnv('some-unregistered-seam'), null);
});

test('findMissingEnv reports every missing var when the env is empty', () => {
  const missing = findMissingEnv('db-continuity-legacy-backup', {});

  assert.ok(Array.isArray(missing));
  assert.ok(missing.includes('RUN_CONTINUITY_INTEGRATION'));
  assert.ok(missing.includes('SOURCE_DB_HOST'));
});

test('findMissingEnv treats RUN_CONTINUITY_INTEGRATION="false" as missing (pinned-value mismatch)', () => {
  const missing = findMissingEnv('db-continuity-legacy-backup', {
    RUN_CONTINUITY_INTEGRATION: 'false',
    SOURCE_DB_HOST: 'localhost',
    SOURCE_DB_USER: 'source_user',
    SOURCE_DB_PASSWORD: 'source_pass',
    SOURCE_DB_NAME: 'sku_inventory_manager',
  });

  assert.ok(missing.includes('RUN_CONTINUITY_INTEGRATION'));
});

test('findMissingEnv returns null when every required var is present and pinned values match', () => {
  const missing = findMissingEnv('db-continuity-legacy-backup', {
    RUN_CONTINUITY_INTEGRATION: 'true',
    SOURCE_DB_HOST: 'localhost',
    SOURCE_DB_USER: 'source_user',
    SOURCE_DB_PASSWORD: 'source_pass',
    SOURCE_DB_NAME: 'sku_inventory_manager',
  });

  assert.equal(missing, null);
});

test('fail-closed: a seam with missing required integration env yields ok:false, never a pass on a skipped integration test', () => {
  const seam = {
    id: 'db-continuity-legacy-backup',
    tests: ['apps/dgfy-migration-runner/tests/verifyContinuity.test.js'],
  };

  // Empty env object — no RUN_CONTINUITY_INTEGRATION, no SOURCE_DB_* creds.
  // runSeam must short-circuit on the missing-env branch and never reach
  // (or need to spawn) the real jest test runner.
  const result = runSeam(seam, {});

  assert.equal(result.id, 'db-continuity-legacy-backup');
  assert.equal(result.ok, false);
  assert.match(result.detail, /Missing required integration env/);
  assert.match(result.detail, /RUN_CONTINUITY_INTEGRATION/);
});

test('fail-closed: an unknown seam id with no test-runner mapping resolves to ok:false, not a silent pass', () => {
  const seam = {
    id: 'some-unregistered-seam',
    tests: ['apps/some-other-package/tests/unmapped.test.js'],
  };

  // No entry in SEAM_REQUIRED_ENV, so findMissingEnv is a no-op (null) and
  // runSeam proceeds to test-path resolution, which must fail closed because
  // no TEST_PATH_RUNNERS prefix matches this path.
  const result = runSeam(seam, {});

  assert.equal(result.ok, false);
  assert.match(result.detail, /No test-runner mapping/);
});

test('resolveRunnerForTestPath returns a function for the registered migration-runner (jest) prefix', () => {
  const run = resolveRunnerForTestPath('apps/dgfy-migration-runner/tests/verifyContinuity.test.js');

  assert.equal(typeof run, 'function');
});

test('resolveRunnerForTestPath returns null for an unmapped test path (extension point, not pre-built)', () => {
  const run = resolveRunnerForTestPath('backend/tests/someBackendSeam.test.js');

  assert.equal(run, null);
});

test('a seam with an empty tests[] array fails closed rather than vacuously passing', () => {
  const result = runSeam({ id: 'db-continuity-legacy-backup', tests: [] }, {
    RUN_CONTINUITY_INTEGRATION: 'true',
    SOURCE_DB_HOST: 'localhost',
    SOURCE_DB_USER: 'source_user',
    SOURCE_DB_PASSWORD: 'source_pass',
    SOURCE_DB_NAME: 'sku_inventory_manager',
  });

  assert.equal(result.ok, false);
  assert.match(result.detail, /no tests\[\] entries/);
});
