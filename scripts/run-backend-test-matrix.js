#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const JEST_BIN = path.join(BACKEND_DIR, 'node_modules', 'jest', 'bin', 'jest.js');
const JEST_CONFIG = path.join(BACKEND_DIR, 'jest.config.cjs');
const DEFAULT_CHUNK_SIZE = Number.parseInt(process.env.BACKEND_TEST_MATRIX_CHUNK_SIZE || '8', 10);
const DEFAULT_CHUNK_TIMEOUT_MS = Number.parseInt(process.env.BACKEND_TEST_MATRIX_CHUNK_TIMEOUT_MS || '600000', 10);
const CONTINUE_ON_FAILURE = process.argv.includes('--continue-on-failure') || process.env.BACKEND_TEST_MATRIX_CONTINUE_ON_FAILURE === 'true';
const SKIP_SCHEMA_PREFLIGHT = process.env.BACKEND_TEST_MATRIX_SKIP_SCHEMA_PREFLIGHT === 'true';

const groupFilterArgIndex = process.argv.indexOf('--group');
const groupFilter = groupFilterArgIndex >= 0 ? String(process.argv[groupFilterArgIndex + 1] || '').trim() : '';

const GROUPS = [
  {
    name: 'browser_e2e_opt_in',
    description: 'Browser E2E files in the Jest inventory; default assertions are skipped unless RUN_BROWSER_E2E=true.',
    match: /^frontend\..*\.e2e\.test\.js$/i,
  },
  {
    name: 'auth_security_session',
    description: 'Auth, session, token, CORS, security, rate-limit, and credential hardening tests.',
    match: /(^|\.)(auth|rtr|token|security|cors|rateLimiter|supertest_security|password|credential|browserSession|phoneCompletion)/i,
  },
  {
    name: 'payments_commerce_billing',
    description: 'Subscription billing, PayPal, PayMongo, commerce payment, webhook, and payment lifecycle tests.',
    match: /(payment|paypal|paymongo|commercePayment|billing|subscription)/i,
  },
  {
    name: 'compliance_pos_fiscal',
    description: 'Compliance, fiscal, POS, F&B, sales, void, dispatch, terminal, and replay tests.',
    match: /(compliance|pos|fnb|fiscal|void|sales|dispatch|terminal|operationReplay|readings)/i,
  },
  {
    name: 'tenant_storefront_modes',
    description: 'Tenant provisioning, storefront, workflow mode, onboarding, services, hospitality, and customer-access tests.',
    match: /(tenant|storefront|store|onboarding|workflow|mode|services|hospitality|customerAccess|location)/i,
  },
  {
    name: 'inventory_reporting_operations',
    description: 'Inventory, item, supplier, purchase order, stock, CSV, reports, analytics, barcode, dashboard, and operational utilities.',
    match: /(item|supplier|purchaseOrder|stock|inventory|csv|report|analytics|dashboard|jobOrder|receiveToken|metrics|barcode|fifo|valuation|cache|health|cleanup|runtimeSchema|schemaIndex|index|geoInventory)/i,
  },
  {
    name: 'ai_tools',
    description: 'AI module, tool registry, chat, confirmation, forecast, and related cost-control tests.',
    match: /(ai|toolRegistry|ToolRegistry|chat|message|Confirmation|forecast|cost_control)/i,
  },
  {
    name: 'db_integration_scripts',
    description: 'Database integration, migration, script integration, race reproduction, and TOCTOU tests.',
    match: /(integration|migration|Script|script|race|toctou|repro|reproduction|db\.integration|tenantSchemaSync)/i,
  },
  {
    name: 'platform_misc',
    description: 'Remaining backend tests not matched by a more specific group.',
    match: /.*/,
  },
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
    env: process.env,
    ...options,
  });
}

function getTargetSha() {
  if (process.env.RELEASE_TARGET_SHA) return process.env.RELEASE_TARGET_SHA.toLowerCase();
  const result = run('git', ['rev-parse', 'HEAD']);
  if (result.status === 0) return String(result.stdout || '').trim().toLowerCase();
  return 'unknown';
}

function listTests() {
  const result = run(process.execPath, [
    '--experimental-vm-modules',
    JEST_BIN,
    '--config',
    JEST_CONFIG,
    '--runInBand',
    '--listTests',
  ], { cwd: BACKEND_DIR });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error('Unable to list backend Jest tests.');
  }
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((testPath) => path.resolve(testPath));
}

function relativeTestPath(testPath) {
  return path.relative(BACKEND_DIR, testPath).replace(/\\/g, '/');
}

function classify(testPath) {
  const relativePath = relativeTestPath(testPath);
  const basename = path.basename(relativePath);
  for (const group of GROUPS) {
    if (group.match.test(basename) || group.match.test(relativePath)) return group.name;
  }
  return 'platform_misc';
}

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function writeLog(filePath, result) {
  const output = [
    `exit_status=${result.status}`,
    `signal=${result.signal || ''}`,
    `error=${result.error ? result.error.message : ''}`,
    '',
    '[stdout]',
    result.stdout || '',
    '',
    '[stderr]',
    result.stderr || '',
  ].join('\n');
  fs.writeFileSync(filePath, output);
}

function runSchemaPreflight(evidenceDir) {
  if (SKIP_SCHEMA_PREFLIGHT) {
    console.log('[backend-test-matrix] schema_preflight=skipped');
    return { status: 'skipped' };
  }

  const script = `
    process.env.NODE_ENV = 'test';
    const { DataTypes } = await import('sequelize');
    const { sequelize, DgfyLegalAcknowledgement } = await import('./src/models/index.js');
    const dbName = sequelize.getDatabaseName();
    if (!/test/i.test(String(dbName || ''))) {
      throw new Error('Refusing backend test schema preflight on non-test database: ' + dbName);
    }
    const qi = sequelize.getQueryInterface();
    const repairs = [];
    const ensureColumn = async (tableName, columnName, definition) => {
      const table = await qi.describeTable(tableName);
      if (!table[columnName]) {
        await qi.addColumn(tableName, columnName, definition);
        repairs.push(tableName + '.' + columnName);
      }
    };
    await ensureColumn('items', 'mode_item_preset', {
      type: DataTypes.STRING(64),
      allowNull: true
    });
    const itemIndexes = await qi.showIndex('items').catch(() => []);
    if (!itemIndexes.some((index) => index.name === 'idx_items_mode_item_preset')) {
      await qi.addIndex('items', ['mode_item_preset'], { name: 'idx_items_mode_item_preset' }).catch(() => null);
      repairs.push('idx_items_mode_item_preset');
    }
    await ensureColumn('dgfy_accounts', 'middle_name', {
      type: DataTypes.STRING(80),
      allowNull: true
    });
    await DgfyLegalAcknowledgement.sync();
    await sequelize.close();
    console.log(JSON.stringify({ database: dbName, repairs }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' },
    shell: false,
  });
  const logFile = path.join(evidenceDir, 'schema-preflight.log');
  writeLog(logFile, result);
  const relativeLog = path.relative(ROOT, logFile).replace(/\\/g, '/');
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Backend test schema preflight failed. See ${relativeLog}`);
  }
  console.log(`[backend-test-matrix] schema_preflight=pass log=${relativeLog}`);
  return {
    status: 'pass',
    log_file: relativeLog,
    stdout: result.stdout || '',
  };
}

function runChunk(groupName, chunkIndex, tests, evidenceDir) {
  const startedAt = new Date();
  const logFile = path.join(evidenceDir, `${safeName(groupName)}-${String(chunkIndex + 1).padStart(2, '0')}.log`);
  const args = [
    '--experimental-vm-modules',
    JEST_BIN,
    '--config',
    JEST_CONFIG,
    '--runInBand',
    '--runTestsByPath',
    ...tests.map(relativeTestPath),
  ];
  const started = Date.now();
  const result = run(process.execPath, args, {
    cwd: BACKEND_DIR,
    timeout: DEFAULT_CHUNK_TIMEOUT_MS,
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const durationMs = Date.now() - started;
  writeLog(logFile, result);
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  return {
    group: groupName,
    chunk_index: chunkIndex + 1,
    test_count: tests.length,
    tests: tests.map(relativeTestPath),
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    timeout_ms: DEFAULT_CHUNK_TIMEOUT_MS,
    status: timedOut ? 'timeout' : result.status === 0 ? 'pass' : 'fail',
    exit_status: result.status,
    signal: result.signal || null,
    log_file: path.relative(ROOT, logFile).replace(/\\/g, '/'),
  };
}

function main() {
  if (process.argv.includes('--list-groups')) {
    for (const group of GROUPS) {
      console.log(`${group.name}: ${group.description}`);
    }
    return;
  }

  if (!fs.existsSync(JEST_BIN)) {
    throw new Error(`Jest binary not found at ${JEST_BIN}`);
  }

  const targetSha = getTargetSha();
  const evidenceRoot = path.join(ROOT, '.tmp', 'release-gates', targetSha, 'backend-test-matrix');
  ensureDir(evidenceRoot);
  const schemaPreflight = runSchemaPreflight(evidenceRoot);

  const activeTests = listTests();
  const grouped = new Map(GROUPS.map((group) => [group.name, []]));
  for (const testPath of activeTests) {
    grouped.get(classify(testPath)).push(testPath);
  }

  const selectedGroups = GROUPS
    .filter((group) => !groupFilter || group.name === groupFilter)
    .map((group) => ({
      ...group,
      tests: grouped.get(group.name) || [],
    }))
    .filter((group) => group.tests.length > 0);

  if (groupFilter && selectedGroups.length === 0) {
    throw new Error(`No backend test group matched --group ${groupFilter}`);
  }

  const startedAt = new Date();
  const chunks = [];
  let failed = false;

  console.log(`[backend-test-matrix] active_tests=${activeTests.length} chunk_size=${DEFAULT_CHUNK_SIZE} timeout_ms=${DEFAULT_CHUNK_TIMEOUT_MS}`);
  for (const group of selectedGroups) {
    const testChunks = chunk(group.tests, DEFAULT_CHUNK_SIZE);
    console.log(`[backend-test-matrix] group=${group.name} tests=${group.tests.length} chunks=${testChunks.length}`);
    for (let index = 0; index < testChunks.length; index += 1) {
      const result = runChunk(group.name, index, testChunks[index], evidenceRoot);
      chunks.push(result);
      console.log(`[backend-test-matrix] ${result.status.toUpperCase()} group=${group.name} chunk=${result.chunk_index}/${testChunks.length} tests=${result.test_count} duration_ms=${result.duration_ms} log=${result.log_file}`);
      if (result.status !== 'pass') {
        failed = true;
        if (!CONTINUE_ON_FAILURE) {
          index = testChunks.length;
          break;
        }
      }
    }
    if (failed && !CONTINUE_ON_FAILURE) break;
  }

  const completedAt = new Date();
  const payload = {
    generated_at: completedAt.toISOString(),
    started_at: startedAt.toISOString(),
    target_sha: targetSha,
    verdict: failed ? 'fail' : 'pass',
    active_test_count: activeTests.length,
    selected_group_count: selectedGroups.length,
    chunk_size: DEFAULT_CHUNK_SIZE,
    chunk_timeout_ms: DEFAULT_CHUNK_TIMEOUT_MS,
    continue_on_failure: CONTINUE_ON_FAILURE,
    schema_preflight: schemaPreflight,
    groups: selectedGroups.map((group) => ({
      name: group.name,
      description: group.description,
      test_count: group.tests.length,
    })),
    chunks,
  };
  const outputFile = path.join(evidenceRoot, 'backend_test_matrix.json');
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  console.log(`[backend-test-matrix] artifact=${path.relative(ROOT, outputFile).replace(/\\/g, '/')}`);
  if (failed) process.exit(2);
}

try {
  main();
} catch (error) {
  console.error(`[backend-test-matrix] ${error.message}`);
  process.exit(1);
}
