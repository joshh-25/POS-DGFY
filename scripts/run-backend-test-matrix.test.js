const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  getFastTierTestChunks,
  partitionFastTierTests,
  buildMigratedTemplateDbName,
  isMigratedTemplateDbName,
  isCoverageComplete,
  extractFailureSummary,
  prepareLandlordTestDatabase,
  SUPPORTED_LANDLORD_TEST_DATABASE_NAMES,
} = require('./run-backend-test-matrix.js');

const matrixSource = fs.readFileSync(path.join(__dirname, 'run-backend-test-matrix.js'), 'utf8');

test('migrated template database names are short, unique per run, and strictly guarded', () => {
  const previousRunId = process.env.GITHUB_RUN_ID;
  try {
    process.env.GITHUB_RUN_ID = '123456789012345678901234567890123456789';
    const name = buildMigratedTemplateDbName('a'.repeat(40));
    assert.equal(name, `test_mig_template_${'a'.repeat(10)}_${'1234567890123456789012345678901'}`);
    assert.ok(name.length <= 64);
    assert.equal(isMigratedTemplateDbName(name), true);
    for (const invalidName of [
      'test_mig_template_',
      'test_mig_template_abc;DROP_DATABASE',
      `test_mig_template_${'a'.repeat(60)}`,
      'production_template_db',
    ]) {
      assert.equal(isMigratedTemplateDbName(invalidName), false, invalidName);
    }
  } finally {
    if (previousRunId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previousRunId;
  }
});

test('failure extraction still reads Jest reporter output from stderr with JSON reporting enabled', () => {
  const extracted = extractFailureSummary({
    stdout: '',
    stderr: [
      'FAIL tests/example.test.js',
      'Test Suites: 1 failed, 1 total',
      'Tests:       2 failed, 3 passed, 5 total',
      'Time:        4.2 s'
    ].join('\n')
  });
  assert.deepEqual(extracted.failLines, ['FAIL tests/example.test.js']);
  assert.match(extracted.summary, /Test Suites: 1 failed/);
  assert.match(extracted.summary, /Tests:\s+2 failed/);
});

test('timed-out chunks mark matrix coverage incomplete', () => {
  assert.equal(isCoverageComplete(false, [{ status: 'pass' }, { status: 'fail' }]), true);
  assert.equal(isCoverageComplete(true, [{ status: 'pass' }]), false);
  assert.equal(isCoverageComplete(false, [{ status: 'timeout' }]), false);
});

test('all-tier migration completes before fast tier and schema preflight', () => {
  const migration = matrixSource.indexOf('landlordTestDb = prepareLandlordTestDatabase(evidenceRoot)');
  const fastTier = matrixSource.indexOf('const fastResult = runFastTier(fastTests, evidenceRoot)');
  const dbTier = matrixSource.indexOf('const dbResult = runDbTier(dbTests, evidenceRoot, targetSha', fastTier);
  assert.ok(migration >= 0 && fastTier > migration, 'test DB migration must precede fast tier');
  assert.ok(dbTier > fastTier, 'fast tier must finish before db tier schema preflight');
  assert.ok(matrixSource.includes('const schemaPreflight = runSchemaPreflight(evidenceRoot)', matrixSource.indexOf('function runDbTier')));
});

test('windows fast tier bounds a long Jest path list without forcing in-band execution', () => {
  const tests = Array.from({ length: 201 }, (_, index) => `tests/test-${index}.test.js`);
  const chunks = getFastTierTestChunks(tests, 'win32');

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 100);
  assert.equal(chunks[1].length, 100);
  assert.equal(chunks[2].length, 1);
  assert.equal(chunks.flat().length, tests.length);
  assert.deepEqual(chunks.flat(), tests);
});

test('non-Windows fast tier keeps Jest scheduler ownership of the full test list', () => {
  const tests = Array.from({ length: 201 }, (_, index) => `tests/test-${index}.test.js`);
  const chunks = getFastTierTestChunks(tests, 'linux');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], tests);
});

test('F&B open-handle suites are routed once to the diagnostic fast-tier run', () => {
  const fnbSuites = [
    'fnbMode.usecases.test.js',
    'posCheckoutFnbContracts.usecase.test.js',
    'storeFnbModifiers.usecases.test.js',
    'fnbModifierCondition.migration.test.js',
    'storeValidator.fnbModifiers.test.js',
  ].map((name) => path.join(__dirname, '..', 'apps/dgfy-api/tests', name));
  const ordinarySuite = path.join(__dirname, '..', 'apps/dgfy-api/tests', 'ordinary.test.js');
  const partition = partitionFastTierTests([...fnbSuites, ordinarySuite]);
  assert.deepEqual(partition.openHandleTests, fnbSuites);
  assert.deepEqual(partition.parallelFastTests, [ordinarySuite]);
  assert.equal(new Set([...partition.openHandleTests, ...partition.parallelFastTests]).size, 6);
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
