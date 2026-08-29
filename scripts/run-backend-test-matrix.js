#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// dgfy-api is the source of truth (backend/ removed). Target it by default;
// override with TEST_MATRIX_APP_DIR if the suite ever needs to run elsewhere.
const APP_DIR = path.join(ROOT, process.env.TEST_MATRIX_APP_DIR || 'apps/dgfy-api');
const JEST_BIN = path.join(APP_DIR, 'node_modules', 'jest', 'bin', 'jest.js');
const JEST_CONFIG = path.join(APP_DIR, 'jest.config.cjs');
const DEFAULT_CHUNK_SIZE = Number.parseInt(process.env.BACKEND_TEST_MATRIX_CHUNK_SIZE || '8', 10);
const DEFAULT_CHUNK_TIMEOUT_MS = Number.parseInt(process.env.BACKEND_TEST_MATRIX_CHUNK_TIMEOUT_MS || '600000', 10);
// #986/#1124: the early-stop-on-first-failure default was a cost optimization from when the full
// matrix took ~19.6min (#345); #1015/#1016 cut that to ~2-4min, so the premise that "stopping early
// saves meaningful time" no longer holds, while the cost of stopping early -- every later group's
// coverage silently going unknown, exactly what hid the #1071 defect behind an unrelated failure on
// a real promotion -- is unchanged. Default flipped to continue-on-failure; `--fail-fast` /
// BACKEND_TEST_MATRIX_FAIL_FAST=true is the explicit opt-out for someone who wants the old
// fail-on-first behavior back (e.g. iterating locally on one known-broken group).
// `--continue-on-failure` / BACKEND_TEST_MATRIX_CONTINUE_ON_FAILURE=true are kept accepted as
// documented no-op aliases for back-compat with any existing caller/doc that references them.
const FAIL_FAST = process.argv.includes('--fail-fast') || process.env.BACKEND_TEST_MATRIX_FAIL_FAST === 'true';
const CONTINUE_ON_FAILURE = !FAIL_FAST;
const SKIP_SCHEMA_PREFLIGHT = process.argv.includes('--skip-schema-preflight')
  || process.env.BACKEND_TEST_MATRIX_SKIP_SCHEMA_PREFLIGHT === 'true';
// The fast tier deliberately points DB_HOST/DB_PORT nowhere reachable by default -- a permanent
// guardrail (#1015), not just a one-time classification check: a file that secretly needs MySQL
// fails loudly the moment it lands in the fast tier instead of quietly passing because some real
// database happened to be reachable. Escape hatch for debugging a fast-tier failure locally only.
const FAST_ALLOW_DB = process.env.BACKEND_TEST_MATRIX_FAST_ALLOW_DB === 'true';

const groupFilterArgIndex = process.argv.indexOf('--group');
const groupFilter = groupFilterArgIndex >= 0 ? String(process.argv[groupFilterArgIndex + 1] || '').trim() : '';
const chunkFilterArgIndex = process.argv.indexOf('--chunk');
const chunkFilterValue = chunkFilterArgIndex >= 0 ? String(process.argv[chunkFilterArgIndex + 1] || '').trim() : '';
const chunkFilter = chunkFilterValue ? Number.parseInt(chunkFilterValue, 10) : null;
const tierArgIndex = process.argv.indexOf('--tier');
// 'all' (default) runs the fast tier then the db tier, sequentially, as one aggregate command --
// this is what `npm run test:backend:matrix` invokes, so it stays a single entry point.
const TIER = tierArgIndex >= 0 ? String(process.argv[tierArgIndex + 1] || '').trim() : (process.env.BACKEND_TEST_MATRIX_TIER || 'all');

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
  ], { cwd: APP_DIR });
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
  return path.relative(APP_DIR, testPath).replace(/\\/g, '/');
}

function classify(testPath) {
  const relativePath = relativeTestPath(testPath);
  const basename = path.basename(relativePath);
  for (const group of GROUPS) {
    if (group.match.test(basename) || group.match.test(relativePath)) return group.name;
  }
  return 'platform_misc';
}

// Splits the active test list into the "fast" tier (no real DB, default) and the "db" tier
// (listed in backend-db-dependent-tests.js) -- #1015. Throws loudly if the manifest references a
// path that no longer exists, so a rename/delete can't silently go stale.
function partitionByDbManifest(activeTests) {
  const manifestList = require('./backend-db-dependent-tests.js');
  const manifestSet = new Set(manifestList);
  const activeRelPaths = new Set(activeTests.map(relativeTestPath));
  const staleEntries = manifestList.filter((entry) => !activeRelPaths.has(entry));
  if (staleEntries.length > 0) {
    throw new Error(
      `backend-db-dependent-tests.js lists ${staleEntries.length} test path(s) that no longer exist: ${staleEntries.join(', ')}`
    );
  }
  const dbTests = activeTests.filter((testPath) => manifestSet.has(relativeTestPath(testPath)));
  const fastTests = activeTests.filter((testPath) => !manifestSet.has(relativeTestPath(testPath)));
  return { dbTests, fastTests, manifestCount: manifestSet.size };
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

// #1124: persisted after every chunk/tier completes, not only once at the very end -- so a job
// killed mid-run (a self-hosted runner's job envelope dying, observed live on run 33241398956)
// still leaves a partial-but-valid backend_test_matrix.json behind for the salvage job to upload,
// instead of nothing at all. `partial` records whether this write happened before the run finished
// (only meaningful to a reader who finds this file without also finding a `verdict` they trust --
// the final write always has partial:false).
function persistMatrixState(evidenceRoot, payload, { partial }) {
  const outputFile = path.join(evidenceRoot, 'backend_test_matrix.json');
  fs.writeFileSync(outputFile, JSON.stringify({ ...payload, partial }, null, 2));
  return outputFile;
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
    cwd: APP_DIR,
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
    cwd: APP_DIR,
    timeout: DEFAULT_CHUNK_TIMEOUT_MS,
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const durationMs = Date.now() - started;
  writeLog(logFile, result);
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  return {
    tier: 'db',
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

// The fast tier: one Jest invocation covering every non-DB test, real worker parallelism (no
// --runInBand, no domain chunking -- Jest's own scheduler fans these out), no schema preflight.
// DB_HOST/DB_PORT are deliberately pointed nowhere reachable unless FAST_ALLOW_DB is set -- see
// the FAST_ALLOW_DB comment above for why this is a permanent guardrail, not a one-time check.
function runFastTier(tests, evidenceDir) {
  const startedAt = new Date();
  const logFile = path.join(evidenceDir, 'fast-tier.log');
  const maxWorkersArgs = process.env.BACKEND_TEST_MATRIX_FAST_MAX_WORKERS
    ? [`--maxWorkers=${process.env.BACKEND_TEST_MATRIX_FAST_MAX_WORKERS}`]
    : [];
  const args = [
    '--experimental-vm-modules',
    JEST_BIN,
    '--config',
    JEST_CONFIG,
    ...maxWorkersArgs,
    '--runTestsByPath',
    ...tests.map(relativeTestPath),
  ];
  const env = { ...process.env, NODE_ENV: 'test' };
  if (!FAST_ALLOW_DB) {
    env.DB_HOST = '127.0.0.1';
    env.DB_PORT = '1';
  }
  const started = Date.now();
  const result = run(process.execPath, args, {
    cwd: APP_DIR,
    timeout: DEFAULT_CHUNK_TIMEOUT_MS,
    env,
  });
  const durationMs = Date.now() - started;
  writeLog(logFile, result);
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  return {
    tier: 'fast',
    group: 'fast_tier',
    chunk_index: 1,
    test_count: tests.length,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    timeout_ms: DEFAULT_CHUNK_TIMEOUT_MS,
    status: timedOut ? 'timeout' : result.status === 0 ? 'pass' : 'fail',
    exit_status: result.status,
    signal: result.signal || null,
    db_pinned_unreachable: !FAST_ALLOW_DB,
    log_file: path.relative(ROOT, logFile).replace(/\\/g, '/'),
  };
}

// `onProgress` (#1124) is called after schema preflight and after every chunk completes, with the
// mutable-so-far { schemaPreflight, chunks, failed } -- the caller uses it to persist a partial
// snapshot so a job killed mid-loop (a self-hosted runner's job envelope dying, observed live) still
// leaves behind everything that finished before the kill, not nothing.
function runDbTier(dbTests, evidenceRoot, onProgress) {
  const schemaPreflight = runSchemaPreflight(evidenceRoot);
  const grouped = new Map(GROUPS.map((group) => [group.name, []]));
  for (const testPath of dbTests) {
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
    throw new Error(`No backend db-tier test group matched --group ${groupFilter}`);
  }

  const chunks = [];
  let failed = false;
  let earlyStopped = false;
  if (onProgress) onProgress({ schemaPreflight, chunks, failed });

  for (const group of selectedGroups) {
    const testChunks = chunk(group.tests, DEFAULT_CHUNK_SIZE);
    console.log(`[backend-test-matrix] tier=db group=${group.name} tests=${group.tests.length} chunks=${testChunks.length}`);
    if (chunkFilter !== null && chunkFilter > testChunks.length) {
      throw new Error(`Group ${group.name} has ${testChunks.length} chunks; cannot run chunk ${chunkFilter}`);
    }
    const selectedChunkIndexes = chunkFilter === null
      ? testChunks.map((_, index) => index)
      : [chunkFilter - 1];
    for (const index of selectedChunkIndexes) {
      const result = runChunk(group.name, index, testChunks[index], evidenceRoot);
      chunks.push(result);
      console.log(`[backend-test-matrix] ${result.status.toUpperCase()} tier=db group=${group.name} chunk=${result.chunk_index}/${testChunks.length} tests=${result.test_count} duration_ms=${result.duration_ms} log=${result.log_file}`);
      if (onProgress) onProgress({ schemaPreflight, chunks, failed: failed || result.status !== 'pass' });
      if (result.status !== 'pass') {
        failed = true;
        if (!CONTINUE_ON_FAILURE) { earlyStopped = true; break; }
      }
    }
    if (failed && !CONTINUE_ON_FAILURE) { earlyStopped = true; break; }
  }

  return {
    schemaPreflight,
    groups: selectedGroups.map((group) => ({
      name: group.name,
      description: group.description,
      test_count: group.tests.length,
    })),
    chunks,
    failed,
    earlyStopped,
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
  if (chunkFilter !== null && (!Number.isInteger(chunkFilter) || chunkFilter < 1)) {
    throw new Error('--chunk must be a positive 1-based integer');
  }
  if (chunkFilter !== null && !groupFilter) {
    throw new Error('--chunk requires --group so the selected chunk is deterministic');
  }
  if (!['fast', 'db', 'all'].includes(TIER)) {
    throw new Error(`--tier must be one of fast, db, all (got "${TIER}")`);
  }

  const targetSha = getTargetSha();
  // #1124/#1165: overridable so a CI job whose own workspace can die mid-run (a self-hosted
  // runner's job envelope, observed live killing this job 3s into the *next* step on
  // run 33241398956) can point this at a durable, job-external directory instead -- the salvage
  // job in promotion-quality-gate.yml uploads straight from there. Default is byte-identical to
  // before this change, so `gate:release:local` and every local/manual invocation are unaffected.
  const evidenceRootBase = process.env.RELEASE_GATES_EVIDENCE_ROOT || path.join(ROOT, '.tmp', 'release-gates');
  const evidenceRoot = path.join(evidenceRootBase, targetSha, 'backend-test-matrix');
  ensureDir(evidenceRoot);

  const activeTests = listTests();
  const { dbTests, fastTests, manifestCount } = partitionByDbManifest(activeTests);

  const startedAt = new Date();
  let chunks = [];
  let failed = false;
  let earlyStopped = false;
  let schemaPreflight = { status: 'not_run', reason: `tier=${TIER}` };
  let dbGroups = [];

  // #1124: builds the payload from current mutable state -- called after every unit of work
  // completes (not only once at the very end) so a job killed mid-run leaves a partial-but-valid
  // artifact for the salvage job to pick up, instead of nothing.
  const buildPayload = () => ({
    generated_at: new Date().toISOString(),
    started_at: startedAt.toISOString(),
    target_sha: targetSha,
    tier: TIER,
    verdict: failed ? 'fail' : 'pass',
    active_test_count: activeTests.length,
    fast_test_count: fastTests.length,
    db_test_count: dbTests.length,
    selected_group_count: dbGroups.length,
    chunk_size: DEFAULT_CHUNK_SIZE,
    selected_group: groupFilter || null,
    selected_chunk: chunkFilter,
    chunk_timeout_ms: DEFAULT_CHUNK_TIMEOUT_MS,
    fail_fast: FAIL_FAST,
    // Kept alongside fail_fast (#986/#1124: the flag this mirrors was inverted) so any existing
    // reader of this field's old meaning keeps working without a migration.
    continue_on_failure: CONTINUE_ON_FAILURE,
    // #986/#1124: lets a reader distinguish "green because everything passed" from "green because
    // an early stop meant we stopped looking" -- false whenever a fail-fast stop (chunk-loop,
    // group-loop, or the fast->db skip) cut this run short of its full scope.
    coverage_complete: !earlyStopped,
    // Only meaningful for the db tier -- the fast tier has no schema preflight by construction.
    schema_preflight: schemaPreflight,
    groups: dbGroups,
    chunks,
  });
  const persist = (partial) => persistMatrixState(evidenceRoot, buildPayload(), { partial });

  console.log(`[backend-test-matrix] tier=${TIER} active_tests=${activeTests.length} fast_tests=${fastTests.length} db_tests=${dbTests.length} (manifest=${manifestCount})`);

  if (TIER === 'fast' || TIER === 'all') {
    const fastResult = runFastTier(fastTests, evidenceRoot);
    chunks.push(fastResult);
    console.log(`[backend-test-matrix] ${fastResult.status.toUpperCase()} tier=fast tests=${fastResult.test_count} duration_ms=${fastResult.duration_ms} db_pinned_unreachable=${fastResult.db_pinned_unreachable} log=${fastResult.log_file}`);
    if (fastResult.status !== 'pass') {
      failed = true;
    }
    persist(true);
  }

  const skipDbTier = failed && !CONTINUE_ON_FAILURE && TIER === 'all';
  if (skipDbTier) earlyStopped = true;
  if ((TIER === 'db' || TIER === 'all') && !skipDbTier) {
    const dbResult = runDbTier(dbTests, evidenceRoot, (progress) => {
      schemaPreflight = progress.schemaPreflight;
      chunks = TIER === 'all' ? [chunks[0], ...progress.chunks] : [...progress.chunks];
      failed = failed || progress.failed;
      persist(true);
    });
    schemaPreflight = dbResult.schemaPreflight;
    dbGroups = dbResult.groups;
    chunks = TIER === 'all' ? [chunks[0], ...dbResult.chunks] : [...dbResult.chunks];
    if (dbResult.failed) failed = true;
    if (dbResult.earlyStopped) earlyStopped = true;
  } else if (skipDbTier) {
    console.log('[backend-test-matrix] fast tier failed; skipping db tier (--fail-fast is the opt-out flag now -- continue-on-failure is the default, see #986; drop it to run both regardless)');
  }

  const outputFile = persist(false);
  console.log(`[backend-test-matrix] artifact=${path.relative(ROOT, outputFile).replace(/\\/g, '/')}`);
  if (failed) process.exit(2);
}

try {
  main();
} catch (error) {
  console.error(`[backend-test-matrix] ${error.message}`);
  process.exit(1);
}
