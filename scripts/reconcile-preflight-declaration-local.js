#!/usr/bin/env node
/**
 * Local, synchronous compliance-preflight reconciliation for one or more declarations (#1694).
 *
 * Sequences the exact steps `.github/workflows/compliance-preflight-sweep.yml` already runs --
 * boot an ephemeral mysql+redis, run landlord migrations, seed a throwaway fixture tenant, boot
 * `dgfy-api`, POST each declaration to the live `/api/v1/compliance/preflight` endpoint, reconcile
 * on an all-pass, always tear down -- as one local Node script instead of 20 YAML steps glued by
 * GitHub Actions. No new preflight logic: every step below either calls the exact same script the
 * workflow already calls, or reuses that script's own exported functions directly
 * (`apps/dgfy-api/scripts/seed-preflight-fixture.js`, `scripts/mint-preflight-token.js`,
 * `scripts/build-preflight-request.js`, `scripts/parse-preflight-response.js`,
 * `scripts/reconcile-preflight-declarations.js`, `apps/dgfy-api/scripts/teardown-preflight-fixture.js`).
 * See `docs/compliance/request-time-preflight-protocol.md`'s "Reconciling one declaration locally,
 * without a CI round trip" for the doc-level framing, and
 * `.claude/plans/1694-compliance-preflight-staging-release-reconcile.md` section 1 for the design
 * record this implements.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: create a branch, commit, or open a PR. It only edits the
 * given declaration file(s) on disk, in place, when (and only when) every one of them passes.
 * Committing/pushing/PR-ing is the caller's own responsibility, through whatever review path their
 * branch already uses -- unchanged from every other file this repo tracks.
 *
 * Primary use case: a compliance-sensitive fix authored directly against `staging`/`release/*` (or
 * any branch the continuous `develop`-push sweep trigger doesn't cover), where the reconciled front
 * matter needs to land as part of that same commit/PR instead of round-tripping through a
 * `develop`-detour PR plus a sweep-handoff PR.
 *
 * Usage:
 *   node scripts/reconcile-preflight-declaration-local.js docs/compliance/impact-declarations/<file>.md [more...]
 *   npm run compliance:reconcile-local -- <file>.md
 * A bare filename (no directory prefix) is resolved under
 * docs/compliance/impact-declarations/ automatically -- same normalization
 * compliance-preflight-sweep.yml's own discover step already does. A full
 * docs/compliance/impact-declarations/... path also works.
 *
 * Requires: Docker available and running, and both `apps/dgfy-migration-runner` and `apps/dgfy-api`
 * already `npm install`-ed (this script does not install dependencies for you). Picks fixed,
 * unusual local ports -- 18081 for dgfy-api, 13307/16380 for the ephemeral mysql/redis -- distinct
 * from dev's (5000/8081-8083) and staging's (6000/9081-9083) own compose port maps, and from the CI
 * sweep's own 15000/3306/6379, since this may run on a dev machine that also has local dev
 * containers up (see `.github/workflows/compliance-preflight-sweep.yml`'s own PREFLIGHT_API_PORT
 * comment for the incident this dodges -- #1284).
 */

'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { isOutstanding } = require('./is-preflight-outstanding');
const {
  parseFrontMatter,
  classifyEndpointApplicability,
  buildRequestFromContent
} = require('./build-preflight-request');
const { parseVerdict } = require('./parse-preflight-response');
const { reconcileDeclarationFile } = require('./reconcile-preflight-declarations');

const REPO_ROOT = path.resolve(__dirname, '..');
const DECLARATIONS_DIR = 'docs/compliance/impact-declarations';

// Deliberately distinct from every deployed environment's port map and from the CI sweep's own
// 15000/3306/6379 -- see this file's header comment.
const LOCAL_API_PORT = 18081;
const LOCAL_MYSQL_PORT = 13307;
const LOCAL_REDIS_PORT = 16380;
const LOCAL_DB_NAME = 'sku_inventory_manager_preflight_local';
const LOCAL_DB_PASSWORD = 'preflightlocal';
const LOCAL_JWT_SECRET = 'preflight-local-jwt-secret-ephemeral-only';
const LOCAL_REFRESH_SECRET = 'preflight-local-refresh-secret-ephemeral-only';

const runLabel = `local-${Date.now()}`;
const MYSQL_CONTAINER = `dgfy-preflight-local-mysql-${runLabel}`;
const REDIS_CONTAINER = `dgfy-preflight-local-redis-${runLabel}`;

const HEALTH_POLL_ATTEMPTS = 24;
const HEALTH_POLL_INTERVAL_MS = 5000;
const CONTAINER_POLL_ATTEMPTS = 12;
const CONTAINER_POLL_INTERVAL_MS = 5000;

class ReconcileLocalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReconcileLocalError';
    this.code = code;
  }
}

// ---- pure / composable parts (unit-tested directly, see reconcile-preflight-declaration-local.test.js) --

/**
 * Normalizes the raw argv path list into resolvable declaration paths, mirroring
 * compliance-preflight-sweep.yml's own discover step's explicit-input handling: a bare filename
 * gets DECLARATIONS_DIR prefixed; a value that already starts with it is left alone; anything
 * absolute or containing ".." is rejected outright rather than silently mishandled.
 */
const normalizeDeclarationArgs = (rawArgs) => {
  if (!Array.isArray(rawArgs) || rawArgs.length === 0) {
    throw new ReconcileLocalError(
      'INVALID_ARGS',
      'Usage: node scripts/reconcile-preflight-declaration-local.js <declaration.md> [more...]'
    );
  }

  return rawArgs.map((rawEntry) => {
    const entry = String(rawEntry || '').trim();
    if (!entry) {
      throw new ReconcileLocalError('INVALID_ARGS', 'Empty declarations entry');
    }
    if (path.isAbsolute(entry) || entry.includes('..')) {
      throw new ReconcileLocalError(
        'INVALID_ARGS',
        `Rejected declarations entry (absolute path or path traversal): ${entry}`
      );
    }
    if (entry === DECLARATIONS_DIR || entry.startsWith(`${DECLARATIONS_DIR}/`)) {
      return entry;
    }
    return `${DECLARATIONS_DIR}/${entry}`;
  });
};

/**
 * Validates each normalized path exists and is outstanding, distinguishing "operator input error"
 * (a missing file -- fails fast) from "already reconciled" (skip + warn, not an error) -- the same
 * distinction the workflow's own discover step makes. `deps.existsSync`/`deps.readFileSync`/
 * `deps.isOutstanding`/`deps.log` are injectable for testing.
 *
 * @returns {string[]} the subset of normalizedPaths that are still outstanding
 */
const validateDeclarations = (normalizedPaths, deps = {}) => {
  const existsSync = deps.existsSync || fs.existsSync;
  const readFileSync = deps.readFileSync || ((p) => fs.readFileSync(p, 'utf8'));
  const checkOutstanding = deps.isOutstanding || isOutstanding;
  const log = deps.log || (() => {});

  const validated = [];
  for (const declarationPath of normalizedPaths) {
    if (!existsSync(declarationPath)) {
      throw new ReconcileLocalError('MISSING_FILE', `declarations entry does not exist: ${declarationPath}`);
    }
    const content = readFileSync(declarationPath);
    if (!checkOutstanding(content)) {
      log(`[reconcile-preflight-declaration-local] already reconciled, skipping: ${declarationPath}`);
      continue;
    }
    validated.push(declarationPath);
  }
  return validated;
};

/**
 * Parses seed-preflight-fixture.js's stdout into the five KEY=VALUE lines this script needs,
 * mirroring the workflow's own `grep -E '^(PREFLIGHT_HOST|...)='` step -- everything else on
 * stdout (winston/Sequelize logging under NODE_ENV=development) is noise, not a parse target.
 * Throws if any of the five expected keys never appeared, rather than silently proceeding with a
 * partial fixture.
 */
const FIXTURE_OUTPUT_KEYS = [
  'PREFLIGHT_HOST',
  'PREFLIGHT_COMPANY_TOKEN',
  'PREFLIGHT_BOT_EMAIL',
  'PREFLIGHT_BOT_PASSWORD',
  'FIXTURE_TENANT_ID'
];

const parseFixtureOutput = (stdout) => {
  const map = {};
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    if (!FIXTURE_OUTPUT_KEYS.includes(key)) continue;
    map[key] = line.slice(idx + 1);
  }
  const missing = FIXTURE_OUTPUT_KEYS.filter((key) => !(key in map));
  if (missing.length > 0) {
    throw new ReconcileLocalError(
      'FIXTURE_OUTPUT_INCOMPLETE',
      `seed-preflight-fixture.js output is missing expected key(s): ${missing.join(', ')}`
    );
  }
  return map;
};

/**
 * Builds and evaluates one declaration against the live endpoint, assembling the same
 * `{ declaration, http_code, verdict }` shape reconcile-preflight-declarations.js already expects.
 *
 * Mirrors the workflow's own per-declaration error handling: a build-time problem (no front
 * matter, or a major/regulatory declaration with no endpoint-accepted surface) is recorded as a
 * `pass: false` entry and the function returns normally -- it does NOT throw and does NOT abort
 * the batch, exactly like the workflow's own `overall_fail=1; continue` -- so one bad declaration
 * in a multi-file run doesn't prevent the others from being evaluated before the whole batch fails
 * closed in reconcileOrFailClosed. build-preflight-request.js's own `not_applicable` (minor, no
 * endpoint-accepted surface) case is the one build-time outcome that IS a pass, with no HTTP call
 * made -- handled identically to the workflow's exit-3 case.
 *
 * `deps.postPreflight` (required) is the one non-pure seam -- `(requestBody) => { httpCode,
 * responseBody }`, sync or async (always `await`-ed), injected so this function is directly
 * testable without a live endpoint. Missing it is a wiring error, not a per-declaration data
 * problem, so that alone still throws.
 */
const sweepOneDeclaration = async (declarationPath, deps = {}) => {
  const readFileSync = deps.readFileSync || ((p) => fs.readFileSync(p, 'utf8'));
  const buildRequest = deps.buildRequestFromContent || buildRequestFromContent;
  const classifyApplicability = deps.classifyEndpointApplicability || classifyEndpointApplicability;
  const parseFm = deps.parseFrontMatter || parseFrontMatter;
  const parseResponseVerdict = deps.parseVerdict || parseVerdict;
  const postPreflight = deps.postPreflight;
  const logError = deps.logError || (() => {});

  if (typeof postPreflight !== 'function') {
    throw new ReconcileLocalError('MISSING_DEP', 'sweepOneDeclaration requires deps.postPreflight');
  }

  const content = readFileSync(declarationPath);
  const frontMatter = parseFm(content);
  if (!frontMatter) {
    logError(`[reconcile-preflight-declaration-local] failed to build the preflight request body for ${declarationPath}: No YAML front matter found`);
    return {
      declaration: declarationPath,
      http_code: 'n/a',
      verdict: { pass: false, result: 'build_error', can_proceed: false, reason_code: 'NO_FRONT_MATTER' }
    };
  }

  const applicability = classifyApplicability(frontMatter);
  if (!applicability.applicable) {
    if (applicability.classification === 'minor') {
      // #1396 -- not evaluable by the live endpoint at all; recorded honestly as not_applicable,
      // no HTTP call made. Never a failure for a minor declaration.
      return {
        declaration: declarationPath,
        http_code: 'n/a',
        verdict: {
          pass: true,
          result: 'not_applicable',
          can_proceed: true,
          reason_code: applicability.reason_code,
          declared_surfaces: applicability.declared_surfaces
        }
      };
    }
    logError(
      `[reconcile-preflight-declaration-local] declaration ${declarationPath} is classification ` +
        `"${applicability.classification}" but declares no endpoint-accepted surface ` +
        '(pos|terminal|settings|payments|compliance); add the evaluable surface or reclassify -- live ' +
        'preflight cannot evaluate it and check-compliance-impact.js requires preflight_result=no_breach ' +
        'for this classification'
    );
    return {
      declaration: declarationPath,
      http_code: 'n/a',
      verdict: { pass: false, result: 'build_error', can_proceed: false, reason_code: applicability.reason_code }
    };
  }

  const requestBody = buildRequest(content, { declarationPath });
  const { httpCode, responseBody } = await postPreflight(requestBody);
  const parsedVerdict = parseResponseVerdict(responseBody);
  // A parsed body reading no_breach/can_proceed:true is only a real pass on HTTP 200 -- matches
  // the sweep contract every other caller of this endpoint already enforces (RF-1, PR #1703
  // review). A non-200 response (e.g. a 500 whose body happens to still parse as passing-looking
  // JSON) must never be treated as a pass, regardless of what the parsed body says.
  const verdict = { ...parsedVerdict, pass: String(httpCode) === '200' && parsedVerdict.pass };

  return { declaration: declarationPath, http_code: String(httpCode), verdict };
};

/**
 * Decides the fail-closed / reconcile branch over an assembled results array -- mirrors the
 * workflow's own "on any pass !== true: print the failure, do not reconcile that file, exit
 * non-zero; on all-pass: reconcile every file" behavior. A batch with any failure reconciles
 * nothing -- partial reconciliation of a mixed-result batch is never correct, since a later
 * declaration's failure says nothing about whether an earlier one's pass is still trustworthy to
 * write to disk in the same run.
 *
 * `deps.reconcileDeclarationFile` is injectable so this is testable without touching real files.
 */
const reconcileOrFailClosed = (results, { runId }, deps = {}) => {
  const reconcile = deps.reconcileDeclarationFile || reconcileDeclarationFile;
  const log = deps.log || (() => {});
  const logError = deps.logError || (() => {});

  const failures = results.filter((entry) => entry.verdict?.pass !== true);
  if (failures.length > 0) {
    for (const failure of failures) {
      logError(
        `[reconcile-preflight-declaration-local] FAILED: ${failure.declaration} -- ` +
          `result=${failure.verdict?.result ?? 'unknown'}, reason_code=${failure.verdict?.reason_code ?? 'unknown'}. ` +
          'Not reconciled -- NOT-EXECUTED-* ref left intact.'
      );
    }
    return { ok: false, reconciled: [], failed: failures.map((entry) => entry.declaration) };
  }

  const reconciled = [];
  for (const entry of results) {
    const ref = reconcile(entry.declaration, entry.verdict, { runId });
    reconciled.push({ declaration: entry.declaration, ref });
    log(`[reconcile-preflight-declaration-local] Reconciled ${entry.declaration} -> ${ref}`);
  }
  return { ok: true, reconciled, failed: [] };
};

// ---- process / Docker orchestration (not unit-tested -- see file header and plan section 1.3) ----

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

function checkPreconditions() {
  const docker = runCapture('docker', ['info']);
  if (docker.status !== 0) {
    throw new ReconcileLocalError(
      'DOCKER_UNAVAILABLE',
      'Docker is required (mysql + redis fixtures) and is not available/running. ' +
        `${docker.stderr || docker.stdout || ''}`.trim()
    );
  }

  for (const [appDir, label] of [
    ['apps/dgfy-migration-runner', 'apps/dgfy-migration-runner'],
    ['apps/dgfy-api', 'apps/dgfy-api']
  ]) {
    if (!fs.existsSync(path.join(REPO_ROOT, appDir, 'node_modules'))) {
      throw new ReconcileLocalError(
        'DEPENDENCIES_MISSING',
        `${label} has no node_modules -- run "npm install" there first (this script does not install ` +
          'dependencies for you).'
      );
    }
  }
}

async function checkPortsFree() {
  const ports = [
    ['dgfy-api', LOCAL_API_PORT],
    ['mysql fixture', LOCAL_MYSQL_PORT],
    ['redis fixture', LOCAL_REDIS_PORT]
  ];
  for (const [label, port] of ports) {
    // eslint-disable-next-line no-await-in-loop -- sequential is fine, three quick local checks
    const free = await isPortFree(port);
    if (!free) {
      throw new ReconcileLocalError(
        'PORT_IN_USE',
        `Port ${port} (${label}) is already bound -- is another instance of this script already ` +
          `running, or a leftover dgfy-preflight-local-* container? Check "docker ps" and free the ` +
          'port before retrying.'
      );
    }
  }
}

function dbEnv() {
  return {
    DB_HOST: '127.0.0.1',
    DB_PORT: String(LOCAL_MYSQL_PORT),
    DB_NAME: LOCAL_DB_NAME,
    DB_USER: 'root',
    DB_PASSWORD: LOCAL_DB_PASSWORD
  };
}

function startServiceContainers() {
  const mysql = runCapture('docker', [
    'run', '-d', '--name', MYSQL_CONTAINER,
    '-e', `MYSQL_ROOT_PASSWORD=${LOCAL_DB_PASSWORD}`,
    '-e', `MYSQL_DATABASE=${LOCAL_DB_NAME}`,
    '-p', `${LOCAL_MYSQL_PORT}:3306`,
    'mysql:8.0', '--log-bin-trust-function-creators=1'
  ]);
  if (mysql.status !== 0) {
    throw new ReconcileLocalError('DOCKER_MYSQL_START_FAILED', `docker run (mysql) failed: ${mysql.stderr}`);
  }

  const redis = runCapture('docker', [
    'run', '-d', '--name', REDIS_CONTAINER,
    '-p', `${LOCAL_REDIS_PORT}:6379`,
    'redis:7-alpine'
  ]);
  if (redis.status !== 0) {
    throw new ReconcileLocalError('DOCKER_REDIS_START_FAILED', `docker run (redis) failed: ${redis.stderr}`);
  }
}

async function waitForServiceContainers() {
  let mysqlReady = false;
  for (let i = 0; i < CONTAINER_POLL_ATTEMPTS && !mysqlReady; i += 1) {
    const result = runCapture('docker', [
      'exec', MYSQL_CONTAINER, 'mysqladmin', 'ping', '-h', '127.0.0.1', '-uroot', `-p${LOCAL_DB_PASSWORD}`
    ]);
    if (result.status === 0) { mysqlReady = true; break; }
    await sleep(CONTAINER_POLL_INTERVAL_MS);
  }
  if (!mysqlReady) throw new ReconcileLocalError('MYSQL_NOT_READY', 'mysql fixture container did not become ready in time');

  let redisReady = false;
  for (let i = 0; i < CONTAINER_POLL_ATTEMPTS && !redisReady; i += 1) {
    const result = runCapture('docker', ['exec', REDIS_CONTAINER, 'redis-cli', 'ping']);
    if (result.status === 0) { redisReady = true; break; }
    await sleep(CONTAINER_POLL_INTERVAL_MS);
  }
  if (!redisReady) throw new ReconcileLocalError('REDIS_NOT_READY', 'redis fixture container did not become ready in time');
}

function runMigrations() {
  const result = runCapture('npm', ['run', 'migrate'], {
    cwd: path.join(REPO_ROOT, 'apps/dgfy-migration-runner'),
    env: { ...process.env, ...dbEnv() }
  });
  if (result.status !== 0) {
    throw new ReconcileLocalError('MIGRATE_FAILED', `apps/dgfy-migration-runner "npm run migrate" failed:\n${result.stderr}`);
  }
}

function seedFixture() {
  const result = runCapture('node', ['scripts/seed-preflight-fixture.js'], {
    cwd: path.join(REPO_ROOT, 'apps/dgfy-api'),
    env: {
      ...process.env,
      ...dbEnv(),
      NODE_ENV: 'development',
      JWT_SECRET: LOCAL_JWT_SECRET,
      REFRESH_TOKEN_SECRET: LOCAL_REFRESH_SECRET,
      PREFLIGHT_API_PORT: String(LOCAL_API_PORT)
    }
  });
  if (result.status !== 0) {
    throw new ReconcileLocalError('SEED_FIXTURE_FAILED', `seed-preflight-fixture.js failed:\n${result.stderr}`);
  }
  return parseFixtureOutput(result.stdout);
}

/**
 * Boots dgfy-api as a background child process and polls its health endpoint, mirroring the
 * workflow's "Boot dgfy-api" step (including its own process-still-alive check between polls, so a
 * crash mid-startup fails fast instead of polling a dead port for the full timeout).
 */
function bootDgfyApi() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/server.js'], {
      cwd: path.join(REPO_ROOT, 'apps/dgfy-api'),
      env: {
        ...process.env,
        ...dbEnv(),
        NODE_ENV: 'development',
        PORT: String(LOCAL_API_PORT),
        JWT_SECRET: LOCAL_JWT_SECRET,
        REFRESH_TOKEN_SECRET: LOCAL_REFRESH_SECRET,
        REDIS_URL: `redis://127.0.0.1:${LOCAL_REDIS_PORT}`,
        // See compliance-preflight-sweep.yml's own comment on these two -- both flip
        // /api/v1/health to 503 when enabled, which would make the poll below fail even though the
        // API is genuinely up.
        BILLING_FUNNEL_AUDIT_ENABLED: 'false',
        SCHEMA_INDEX_AUDIT_ENABLED: 'false'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });

    let settled = false;
    child.once('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new ReconcileLocalError('DGFY_API_EXITED', `dgfy-api exited during startup (code ${code}):\n${log}`));
      }
    });

    (async () => {
      for (let i = 0; i < HEALTH_POLL_ATTEMPTS && !settled; i += 1) {
        // eslint-disable-next-line no-await-in-loop -- sequential polling is the point
        await sleep(HEALTH_POLL_INTERVAL_MS);
        if (settled) return;
        try {
          const response = await fetch(`http://127.0.0.1:${LOCAL_API_PORT}/api/v1/health`);
          if (response.ok) {
            settled = true;
            resolve(child);
            return;
          }
        } catch {
          // not up yet, keep polling
        }
      }
      if (!settled) {
        settled = true;
        child.kill();
        reject(new ReconcileLocalError('DGFY_API_NOT_HEALTHY', `dgfy-api did not become healthy in time:\n${log}`));
      }
    })();
  });
}

function mintToken(fixtureEnv) {
  const result = runCapture('node', ['scripts/mint-preflight-token.js'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PREFLIGHT_HOST: fixtureEnv.PREFLIGHT_HOST,
      PREFLIGHT_COMPANY_TOKEN: fixtureEnv.PREFLIGHT_COMPANY_TOKEN,
      PREFLIGHT_BOT_EMAIL: fixtureEnv.PREFLIGHT_BOT_EMAIL,
      PREFLIGHT_BOT_PASSWORD: fixtureEnv.PREFLIGHT_BOT_PASSWORD
    }
  });
  if (result.status !== 0) {
    throw new ReconcileLocalError('MINT_TOKEN_FAILED', `mint-preflight-token.js failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function postPreflightLive(requestBody, fixtureEnv) {
  const token = mintToken(fixtureEnv);
  let response;
  try {
    response = await fetch(`${fixtureEnv.PREFLIGHT_HOST}/api/v1/compliance/preflight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company-token': fixtureEnv.PREFLIGHT_COMPANY_TOKEN,
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    return { httpCode: '000', responseBody: `request failed: ${error.message}` };
  }
  const responseBody = await response.text();
  return { httpCode: response.status, responseBody };
}

function teardown({ dgfyApiChild, fixtureTenantId }) {
  if (dgfyApiChild) {
    try { dgfyApiChild.kill(); } catch { /* best-effort */ }
  }
  if (fixtureTenantId) {
    runCapture('node', ['scripts/teardown-preflight-fixture.js', fixtureTenantId], {
      cwd: path.join(REPO_ROOT, 'apps/dgfy-api'),
      env: {
        ...process.env,
        ...dbEnv(),
        NODE_ENV: 'development',
        JWT_SECRET: LOCAL_JWT_SECRET,
        REFRESH_TOKEN_SECRET: LOCAL_REFRESH_SECRET
      }
    });
  }
  runCapture('docker', ['rm', '-f', MYSQL_CONTAINER, REDIS_CONTAINER]);
}

/**
 * Full orchestration: boot -> migrate -> seed -> boot api -> sweep every declaration -> reconcile
 * or fail closed -> always tear down. Mirrors the workflow's own step sequence 1:1 (see this file's
 * header and plan section 1.1).
 */
async function orchestrateAndReconcile(declarationPaths) {
  checkPreconditions();
  await checkPortsFree();

  let dgfyApiChild = null;
  let fixtureTenantId = null;
  const teardownAndExit = () => teardown({ dgfyApiChild, fixtureTenantId });

  // Best-effort cleanup on interrupt -- mirrors the workflow's own always()-cleanup discipline
  // (plan step 9). A hard SIGKILL can't be caught here; that's an accepted gap, same as any
  // process-level cleanup handler.
  const onSignal = () => { teardownAndExit(); process.exit(1); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    startServiceContainers();
    await waitForServiceContainers();
    runMigrations();

    const fixtureEnv = seedFixture();
    fixtureTenantId = fixtureEnv.FIXTURE_TENANT_ID;

    dgfyApiChild = await bootDgfyApi();

    // Sequential, not Promise.all -- mirrors the workflow's own sweep step (a plain bash `while`
    // loop, one declaration at a time), and a fresh token is minted per call by design (see
    // mint-preflight-token.js's own header: cheap to mint, no reuse).
    const results = [];
    for (const declarationPath of declarationPaths) {
      console.log(`--- ${declarationPath} ---`);
      // eslint-disable-next-line no-await-in-loop -- deliberate: sequential, one token per call
      const entry = await sweepOneDeclaration(declarationPath, {
        postPreflight: (requestBody) => postPreflightLive(requestBody, fixtureEnv),
        logError: (msg) => console.error(msg)
      });
      results.push(entry);
    }

    const outcome = reconcileOrFailClosed(results, { runId: 'local' }, {
      log: (msg) => console.log(msg),
      logError: (msg) => console.error(msg)
    });

    return outcome;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    teardownAndExit();
  }
}

function main() {
  let normalized;
  try {
    normalized = normalizeDeclarationArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[reconcile-preflight-declaration-local] ${error.code || 'FAILED'}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let validated;
  try {
    validated = validateDeclarations(normalized, { log: (msg) => console.log(msg) });
  } catch (error) {
    console.error(`[reconcile-preflight-declaration-local] ${error.code || 'FAILED'}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (validated.length === 0) {
    console.log('[reconcile-preflight-declaration-local] Nothing outstanding to reconcile.');
    return;
  }

  orchestrateAndReconcile(validated)
    .then((outcome) => {
      if (!outcome.ok) {
        process.exitCode = 1;
        return;
      }
      console.log('');
      console.log('[reconcile-preflight-declaration-local] Reconciled:');
      for (const { declaration, ref } of outcome.reconciled) {
        console.log(`  ${declaration} -> ${ref}`);
      }
      console.log('');
      console.log(
        '[reconcile-preflight-declaration-local] File(s) modified in place -- review, `git add`, and ' +
          'commit them as part of your fix; this did not touch git.'
      );
    })
    .catch((error) => {
      console.error(`[reconcile-preflight-declaration-local] ${error.code || 'FAILED'}: ${error.message}`);
      process.exitCode = 1;
    });
}

if (require.main === module) main();

module.exports = {
  ReconcileLocalError,
  normalizeDeclarationArgs,
  validateDeclarations,
  parseFixtureOutput,
  sweepOneDeclaration,
  reconcileOrFailClosed,
  DECLARATIONS_DIR
};
