const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  prepareLandlordTestDatabase,
  SUPPORTED_LANDLORD_TEST_DATABASE_NAMES,
} = require('./run-backend-test-matrix.js');

const matrixSource = fs.readFileSync(path.join(__dirname, 'run-backend-test-matrix.js'), 'utf8');

test('all-tier migration completes before fast tier and schema preflight', () => {
  const migration = matrixSource.indexOf('landlordTestDb = prepareLandlordTestDatabase(evidenceRoot)');
  const fastTier = matrixSource.indexOf('const fastResult = runFastTier(fastTests, evidenceRoot)');
  const dbTier = matrixSource.indexOf('const dbResult = runDbTier(dbTests, evidenceRoot, targetSha', fastTier);
  assert.ok(migration >= 0 && fastTier > migration, 'test DB migration must precede fast tier');
  assert.ok(dbTier > fastTier, 'fast tier must finish before db tier schema preflight');
  assert.ok(matrixSource.includes('const schemaPreflight = runSchemaPreflight(evidenceRoot)', matrixSource.indexOf('function runDbTier')));
});

test('landlord migration accepts only the repository-supported test database names', () => {
  assert.deepEqual([...SUPPORTED_LANDLORD_TEST_DATABASE_NAMES].sort(), [
    'sku_inventory_manager_test',
    'sku_test',
  ]);
});

test('supported landlord test database names reach sequelize-cli with the same database selected', () => {
  const previousDbName = process.env.DB_NAME_TEST;
  const previousCi = process.env.CI;
  const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-supported-evidence-'));
  delete process.env.CI;
  try {
    for (const databaseName of SUPPORTED_LANDLORD_TEST_DATABASE_NAMES) {
      process.env.DB_NAME_TEST = databaseName;
      let invocation;
      const result = prepareLandlordTestDatabase(evidenceDir, {
        spawn: (...args) => {
          invocation = args;
          return { status: 0, stdout: '', stderr: '' };
        },
      });

      assert.equal(result.status, 'pass');
      assert.equal(result.database, databaseName);
      assert.equal(invocation[2].env.DB_NAME_TEST, databaseName);
    }
  } finally {
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    if (previousDbName === undefined) delete process.env.DB_NAME_TEST;
    else process.env.DB_NAME_TEST = previousDbName;
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
  }
});

test('landlord migration rejects names that merely contain test before invoking sequelize-cli', () => {
  const previousDbName = process.env.DB_NAME_TEST;
  const previousCi = process.env.CI;
  const spawn = () => {
    throw new Error('sequelize-cli must not be invoked for a rejected database name');
  };
  delete process.env.CI;
  try {
    for (const databaseName of [
      'sku_inventory_manager',
      'contest',
      'sku_contest',
      'sku_inventory_manager_contest',
      'sku_testify',
      'sku_inventory_manager_test_backup',
    ]) {
      process.env.DB_NAME_TEST = databaseName;
      assert.throws(
        () => prepareLandlordTestDatabase(path.join(os.tmpdir(), 'matrix-refusal-evidence'), { spawn }),
        /Refusing backend test database migration on non-test database/
      );
    }
  } finally {
    if (previousDbName === undefined) delete process.env.DB_NAME_TEST;
    else process.env.DB_NAME_TEST = previousDbName;
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
  }
});
