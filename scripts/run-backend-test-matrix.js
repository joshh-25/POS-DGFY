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

// #1157/#1124: a failing chunk/tier previously left its Jest output ONLY inside the evidence-dir
// log file (uploaded as a CI artifact nobody was pulling and reading) -- the console just printed
// a one-line FAIL/status summary with no suite names. This extracts the `FAIL <path>` lines and the
// trailing `Test Suites:`/`Tests:` summary out of Jest's captured stdout+stderr so a failure is at
// least nameable from the CI job log / $GITHUB_STEP_SUMMARY directly, without downloading anything.
// Bounded (MAX_FAIL_LINES) so a mass failure can't flood the log the way an unbounded echo would.
const MAX_FAIL_LINES = 40;

function extractFailureSummary(result) {
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const failLines = [...new Set(text.split(/\r?\n/).filter((line) => /^\s*FAIL\s+\S/.test(line)).map((line) => line.trim()))];
  const summaryMatch = text.match(/Test Suites:.*\n(?:.*\n)*?Tests:.*(?:\n(?:Snapshots|Time):.*)*/);
  return {
    failLines: failLines.slice(0, MAX_FAIL_LINES),
    truncated: failLines.length > MAX_FAIL_LINES,
    totalFailLines: failLines.length,
    summary: summaryMatch ? summaryMatch[0].trim() : null,
  };
}

function printFailureSummary(label, result) {
  const { failLines, truncated, totalFailLines, summary } = extractFailureSummary(result);
  if (failLines.length === 0 && !summary) return;
  console.log(`[backend-test-matrix] ${label} failing suites:`);
  for (const line of failLines) console.log(`  ${line}`);
  if (truncated) console.log(`  ... ${totalFailLines - MAX_FAIL_LINES} more FAIL line(s) truncated -- see the uploaded log for the full list`);
  if (summary) console.log(summary.split('\n').map((line) => `  ${line}`).join('\n'));
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
    return { status: 'skipped', landlord_ready: false };
  }

  // #1015: also runs ensureLandlordTenantSchemaReady() (the same 24-column repair
  // landlordSchemaReadiness.js does per-process) once here, in the matrix's own preflight
  // subprocess, against the same landlord test database every chunk process will connect to. This
  // is what makes it honest to tell chunk processes "the landlord DB is already ready" via
  // BACKEND_TEST_MATRIX_LANDLORD_READY below, instead of just asserting it.
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
    const { ensureLandlordTenantSchemaReady } = await import('./tests/helpers/landlordSchemaReadiness.js');
    await ensureLandlordTenantSchemaReady();
    await sequelize.close();
    console.log(JSON.stringify({ database: dbName, repairs }));
  `;
  // RF-2 (PR #1638 review): clear a parent-inherited BACKEND_TEST_MATRIX_LANDLORD_READY before
  // spawning -- landlordSchemaReadiness.js short-circuits its own repair work whenever this is
  // 'true' (see its own comment), so a stale value surviving from a prior invocation's environment
  // (or a CI misconfiguration) would make THIS preflight -- the one call site whose entire job is to
  // actually run that repair -- silently skip it and still report `landlord_ready: true` downstream.
  const env = { ...process.env, NODE_ENV: 'test' };
  delete env.BACKEND_TEST_MATRIX_LANDLORD_READY;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: APP_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env,
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
    landlord_ready: true,
  };
}

// #1015: builds the shared template tenant database ONCE per matrix invocation -- the ~235s
// tenantSeq.sync({force:true}) that createTestTenant() otherwise pays per tenant (~10x per db-tier
// run). Only ever called from runDbTier(), never from runFastTier() -- that's what keeps this
// unreachable from the fast tier by construction, not by a runtime "is DB reachable" check.
// Deliberately reuses SKIP_SCHEMA_PREFLIGHT as its own escape hatch too: skipping the preflight
// means no template is built either, so every chunk falls back to today's per-tenant sync (see
// testTenantHelper.js's fallback branch) -- exactly the pre-existing behavior when this flag is set.
// RF-3/RF-5 (PR #1638 review): shared so main()'s cleanup `finally` can independently compute the
// exact same deterministic name this run would provision, before ever calling into
// provisionTemplateTenantDatabase() -- see the call site below for why that matters. RF-5: keyed
// only by SHA previously meant two concurrent `workflow_dispatch` runs against the same commit
// (each gets its own unique GITHUB_RUN_ID) could `sync({force:true})`/DROP the same template while
// the other run was still cloning from it -- GITHUB_RUN_ID is set by GitHub Actions for every run,
// including manual workflow_dispatch ones, and is absent for a local/non-CI invocation, where a
// fixed 'local' segment is fine since a local invocation is inherently single-instance.
function buildTemplateTenantDbName(targetSha) {
  const runDiscriminator = safeName(process.env.GITHUB_RUN_ID || 'local');
  return `test_tenant_template_${safeName(targetSha)}_${runDiscriminator}`;
}

function provisionTemplateTenantDatabase(evidenceDir, targetSha) {
  if (SKIP_SCHEMA_PREFLIGHT) {
    console.log('[backend-test-matrix] template_tenant_db=skipped');
    return { status: 'skipped', db_name: null };
  }

  const dbName = buildTemplateTenantDbName(targetSha);
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to provision template tenant database with non-test name: ${dbName}`);
  }

  // Delegates schema creation to getTenantModels() + sync({force:true}) -- the exact same call
  // createTestTenant() makes today -- rather than reimplementing model loading here. Runs as its
  // own child process, same pattern as runSchemaPreflight() above.
  const script = `
    process.env.NODE_ENV = 'test';
    const { Sequelize } = await import('sequelize');
    const { sequelize: landlordSequelize } = await import('./src/models/index.js');
    const { getTenantModels } = await import('./src/utils/tenantModelFactory.js');
    const dbName = ${JSON.stringify(dbName)};
    if (!/test/i.test(dbName)) {
      throw new Error('Refusing to provision template tenant database with non-test name: ' + dbName);
    }
    await landlordSequelize.query('CREATE DATABASE IF NOT EXISTS \`' + dbName + '\`');
    const tenantSeq = new Sequelize(
      dbName,
      process.env.DB_USER || 'root',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false,
        pool: { max: 3, min: 0, acquire: 10000, idle: 5000 }
      }
    );
    await tenantSeq.authenticate();
    getTenantModels(tenantSeq);
    await tenantSeq.sync({ force: true });
    await tenantSeq.close();
    await landlordSequelize.close();
    console.log(JSON.stringify({ database: dbName }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: APP_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' },
    shell: false,
  });
  const logFile = path.join(evidenceDir, 'template-tenant-db.log');
  writeLog(logFile, result);
  const relativeLog = path.relative(ROOT, logFile).replace(/\\/g, '/');
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Backend test template tenant database provisioning failed. See ${relativeLog}`);
  }
  console.log(`[backend-test-matrix] template_tenant_db=pass db=${dbName} log=${relativeLog}`);
  return {
    status: 'pass',
    db_name: dbName,
    log_file: relativeLog,
  };
}

// #1015: best-effort drop, called exactly once by the matrix runner itself after every db-tier
// chunk has finished (see the try/finally around runDbTier() in main()) -- deliberately NOT done
// from globalTeardown.cjs, which runs once per chunk's own Jest process (~5 db-tier chunk
// processes would otherwise race to DROP the same database each chunk still needs). A failure here
// is logged and swallowed, never thrown -- a leaked template DB is a cheap, nameable cleanup problem
// for a later run, not a reason to fail a CI job that otherwise passed.
function dropTemplateTenantDatabase(dbName, evidenceDir) {
  if (!dbName) return;
  const script = `
    process.env.NODE_ENV = 'test';
    const { sequelize: landlordSequelize } = await import('./src/models/index.js');
    const dbName = ${JSON.stringify(dbName)};
    if (!/test/i.test(dbName)) {
      throw new Error('Refusing to drop non-test database: ' + dbName);
    }
    await landlordSequelize.query('DROP DATABASE IF EXISTS \`' + dbName + '\`');
    await landlordSequelize.close();
    console.log(JSON.stringify({ dropped: dbName }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: APP_DIR,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' },
    shell: false,
  });
  const logFile = path.join(evidenceDir, 'template-tenant-db-teardown.log');
  writeLog(logFile, result);
  const relativeLog = path.relative(ROOT, logFile).replace(/\\/g, '/');
  if (result.status !== 0) {
    console.warn(`[backend-test-matrix] WARNING: failed to drop template tenant database ${dbName}; see ${relativeLog}`);
    return;
  }
  console.log(`[backend-test-matrix] template_tenant_db_dropped=${dbName}`);
}

function runChunk(groupName, chunkIndex, tests, evidenceDir, templateDbName, landlordReady) {
  const startedAt = new Date();
  const logFile = path.join(evidenceDir, `${safeName(groupName)}-${String(chunkIndex + 1).padStart(2, '0')}.log`);
  const args = [
    '--experimental-vm-modules',
    JEST_BIN,
    '--config',
    JEST_CONFIG,
    '--runInBand',
    '--ci',
    '--runTestsByPath',
    ...tests.map(relativeTestPath),
  ];
  const env = { ...process.env, NODE_ENV: 'test' };
  // RF-2 (PR #1638 review): explicitly clear both before conditionally re-setting below. Spreading
  // process.env alone would let either variable survive from the parent's own environment (a
  // leftover from a prior invocation in the same shell, or a CI env misconfiguration) even when
  // `templateDbName`/`landlordReady` say this chunk should get neither -- --skip-schema-preflight is
  // supposed to guarantee no template cloning and no skipped-readiness-check happens, and a stale
  // inherited value would silently violate that guarantee.
  delete env.BACKEND_TEST_MATRIX_TEMPLATE_DB;
  delete env.BACKEND_TEST_MATRIX_LANDLORD_READY;
  // #1015: propagates the shared template DB name (and whether the matrix already confirmed the
  // landlord DB is ready) into every db-tier chunk process. Absent for either reason
  // provisionTemplateTenantDatabase()/runSchemaPreflight() can report "skipped" -- --skip-schema-
  // preflight, or a provisioning failure that already threw and aborted the run before this point.
  if (templateDbName) env.BACKEND_TEST_MATRIX_TEMPLATE_DB = templateDbName;
  if (landlordReady) env.BACKEND_TEST_MATRIX_LANDLORD_READY = 'true';
  const started = Date.now();
  const result = run(process.execPath, args, {
    cwd: APP_DIR,
    timeout: DEFAULT_CHUNK_TIMEOUT_MS,
    env,
  });
  const durationMs = Date.now() - started;
  writeLog(logFile, result);
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  const shouldSummarize = !timedOut && result.status !== 0;
  if (shouldSummarize) printFailureSummary(`tier=db group=${groupName} chunk=${chunkIndex + 1}`, result);
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
    // #1157: same extraction printed to the console above, persisted here too so
    // summarize-backend-test-matrix.js can render the failing suite names on
    // $GITHUB_STEP_SUMMARY without re-parsing the raw log itself.
    failing_suites: shouldSummarize ? extractFailureSummary(result).failLines : [],
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
  // #1432: on a 2-vCPU hosted runner, Jest's own getMaxWorkers() resolves to 1, which flips
  // shouldRunInBand() to true -- the entire fast tier (616 files) then runs in one in-band
  // process whose single V8 heap accumulates every file's ESM module registry until it OOMs.
  // BACKEND_TEST_MATRIX_FAST_MAX_WORKERS>=2 (set in CI) forces real worker-process parallelism
  // instead; --workerIdleMemoryLimit bounds each worker's heap so it recycles before growing
  // unbounded across ~300 files.
  const workerMemoryArgs = process.env.BACKEND_TEST_MATRIX_FAST_WORKER_IDLE_MEMORY_LIMIT
    ? [`--workerIdleMemoryLimit=${process.env.BACKEND_TEST_MATRIX_FAST_WORKER_IDLE_MEMORY_LIMIT}`]
    : [];
  const args = [
    '--experimental-vm-modules',
    JEST_BIN,
    '--config',
    JEST_CONFIG,
    ...maxWorkersArgs,
    ...workerMemoryArgs,
    '--ci',
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
  const shouldSummarize = !timedOut && result.status !== 0;
  if (shouldSummarize) printFailureSummary('tier=fast', result);
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
    // #1157: same extraction printed to the console above, persisted here too so
    // summarize-backend-test-matrix.js can render the failing suite names on
    // $GITHUB_STEP_SUMMARY without re-parsing the raw log itself.
    failing_suites: shouldSummarize ? extractFailureSummary(result).failLines : [],
  };
}

// `onProgress` (#1124) is called after schema preflight and after every chunk completes, with the
// mutable-so-far { schemaPreflight, chunks, failed } -- the caller uses it to persist a partial
// snapshot so a job killed mid-loop (a self-hosted runner's job envelope dying, observed live) still
// leaves behind everything that finished before the kill, not nothing.
function runDbTier(dbTests, evidenceRoot, targetSha, onProgress) {
  const schemaPreflight = runSchemaPreflight(evidenceRoot);
  const templateTenantDb = provisionTemplateTenantDatabase(evidenceRoot, targetSha);
  const templateDbName = templateTenantDb.status === 'pass' ? templateTenantDb.db_name : null;
  const landlordReady = schemaPreflight.status === 'pass' && Boolean(schemaPreflight.landlord_ready);
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
  if (onProgress) onProgress({ schemaPreflight, templateTenantDb, chunks, failed });

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
      const result = runChunk(group.name, index, testChunks[index], evidenceRoot, templateDbName, landlordReady);
      chunks.push(result);
      console.log(`[backend-test-matrix] ${result.status.toUpperCase()} tier=db group=${group.name} chunk=${result.chunk_index}/${testChunks.length} tests=${result.test_count} duration_ms=${result.duration_ms} log=${result.log_file}`);
      if (onProgress) onProgress({ schemaPreflight, templateTenantDb, chunks, failed: failed || result.status !== 'pass' });
      if (result.status !== 'pass') {
        failed = true;
        if (!CONTINUE_ON_FAILURE) { earlyStopped = true; break; }
      }
    }
    if (failed && !CONTINUE_ON_FAILURE) { earlyStopped = true; break; }
  }

  return {
    schemaPreflight,
    templateTenantDb,
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
  let templateTenantDb = { status: 'not_run', db_name: null };
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
    // #1015: same tier scoping as schema_preflight above -- 'not_run' on the fast tier by
    // construction, 'skipped' when --skip-schema-preflight was passed, 'pass' with the shared
    // template DB name otherwise.
    template_tenant_db: templateTenantDb,
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
    // RF-3 (PR #1638 review): computed up front, before runDbTier() is ever called, so the cleanup
    // `finally` below still has a name to attempt dropping even when the run never got far enough to
    // report templateTenantDb's real state back to this scope -- provisionTemplateTenantDatabase()
    // throwing after its own CREATE DATABASE already succeeded (a provisioning/sync failure), or an
    // invalid --group thrown inside runDbTier() before its first onProgress callback -- both leave
    // `templateTenantDb` here stuck at its initial `not_run`/`db_name: null`. buildTemplateTenantDbName()
    // is a pure function of targetSha (+ GITHUB_RUN_ID), so this is guaranteed to match whatever name
    // provisionTemplateTenantDatabase() would actually use.
    const candidateTemplateDbName = SKIP_SCHEMA_PREFLIGHT ? null : buildTemplateTenantDbName(targetSha);
    // #1015: the matrix runner is the sole owner of the template DB's lifecycle -- built here,
    // dropped here (never from globalTeardown.cjs, which runs once per db-tier chunk process and
    // would otherwise race ~5 processes to DROP the same database other chunks still need). The
    // try/finally is the backstop for a CI job-envelope death mid-run (#1124's own precedent);
    // the drop itself is best-effort and never throws, see dropTemplateTenantDatabase() above.
    try {
      const dbResult = runDbTier(dbTests, evidenceRoot, targetSha, (progress) => {
        schemaPreflight = progress.schemaPreflight;
        templateTenantDb = progress.templateTenantDb;
        chunks = TIER === 'all' ? [chunks[0], ...progress.chunks] : [...progress.chunks];
        failed = failed || progress.failed;
        persist(true);
      });
      schemaPreflight = dbResult.schemaPreflight;
      templateTenantDb = dbResult.templateTenantDb;
      dbGroups = dbResult.groups;
      chunks = TIER === 'all' ? [chunks[0], ...dbResult.chunks] : [...dbResult.chunks];
      if (dbResult.failed) failed = true;
      if (dbResult.earlyStopped) earlyStopped = true;
    } finally {
      // RF-3: fall back to the pre-computed candidate whenever templateTenantDb never got updated
      // with a real name -- DROP DATABASE IF EXISTS (inside dropTemplateTenantDatabase()) is a safe
      // no-op if CREATE DATABASE never actually ran, so attempting the drop here is never harmful.
      const dbNameToClean = (templateTenantDb.status === 'pass' && templateTenantDb.db_name)
        ? templateTenantDb.db_name
        : candidateTemplateDbName;
      if (dbNameToClean) {
        dropTemplateTenantDatabase(dbNameToClean, evidenceRoot);
      }
    }
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
