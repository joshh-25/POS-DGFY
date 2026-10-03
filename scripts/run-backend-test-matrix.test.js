const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { prepareLandlordTestDatabase } = require('./run-backend-test-matrix.js');

const matrixSource = fs.readFileSync(path.join(__dirname, 'run-backend-test-matrix.js'), 'utf8');

test('all-tier migration completes before fast tier and schema preflight', () => {
  const migration = matrixSource.indexOf('landlordTestDb = prepareLandlordTestDatabase(evidenceRoot)');
  const fastTier = matrixSource.indexOf('const fastResult = runFastTier(fastTests, evidenceRoot)');
  const dbTier = matrixSource.indexOf('const dbResult = runDbTier(dbTests, evidenceRoot, targetSha', fastTier);
  assert.ok(migration >= 0 && fastTier > migration, 'test DB migration must precede fast tier');
  assert.ok(dbTier > fastTier, 'fast tier must finish before db tier schema preflight');
  assert.ok(matrixSource.includes('const schemaPreflight = runSchemaPreflight(evidenceRoot)', matrixSource.indexOf('function runDbTier')));
});

test('landlord migration refuses a configured non-test database before spawning', () => {
  const previousDbName = process.env.DB_NAME_TEST;
  const previousCi = process.env.CI;
  process.env.DB_NAME_TEST = 'sku_inventory_manager';
  delete process.env.CI;
  try {
    assert.throws(
      () => prepareLandlordTestDatabase(path.join(os.tmpdir(), 'matrix-refusal-evidence')),
      /Refusing backend test database migration on non-test database/
    );
  } finally {
    if (previousDbName === undefined) delete process.env.DB_NAME_TEST;
    else process.env.DB_NAME_TEST = previousDbName;
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
  }
});
