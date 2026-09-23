#!/usr/bin/env node
// #438: whole-repository test cost/dependency inventory.
//
// Discovers every existing unit/component test file across the current layout
// (apps/dgfy-api, apps/dgfy-ims, apps/dgfy-pos, apps/dgfy-storefront,
// packages/web-core via the IMS Vitest invocation, plus the migration-runner's
// operational commands), classifies each by cost/dependency profile, and emits
// a deterministic manifest at docs/testing/test-cost-inventory.json.
//
// Same shape/arg conventions as scripts/audit-backend-test-inventory.js: plain
// CommonJS, node built-ins only, no node_modules required for --check, so the
// check can run in a doc-lint context without MySQL, Redis, provider
// credentials, or a browser.
//
// Backend fast/db truth is REUSED, not re-derived: scripts/backend-db-dependent-tests.js
// remains the execution source of truth (see scripts/run-backend-test-matrix.js).
// This tool maps that manifest onto per-file classifications; it never forks
// the matrix's partitioning logic.
//
// Usage:
//   node scripts/audit-test-cost-inventory.js --write   # regenerate the manifest
//   node scripts/audit-test-cost-inventory.js --check   # fail on stale/missing/undiscovered
//
// Human guide: docs/testing/test-cost-inventory.md.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_TESTS_DIR = path.join(ROOT, 'apps', 'dgfy-api', 'tests');
const IMS_DIR = path.join(ROOT, 'apps', 'dgfy-ims');
const POS_DIR = path.join(ROOT, 'apps', 'dgfy-pos');
const STOREFRONT_DIR = path.join(ROOT, 'apps', 'dgfy-storefront');
const WEB_CORE_DIR = path.join(ROOT, 'packages', 'web-core');
const OUTPUT_JSON = path.join(ROOT, 'docs', 'testing', 'test-cost-inventory.json');

const SCHEMA = 'dgfy-test-cost-inventory/v1';

// Stable classification vocabulary. Later Worker/Testing Agent sessions consume
// these values without parsing prose — do not rename without bumping SCHEMA.
const CLASS = {
  FAST_PURE: 'fast-pure',
  FAST_MOCKED: 'fast-mocked-external',
  DB_REQUIRED: 'db-required',
  REDIS_REQUIRED: 'redis-required',
  NETWORK_PROVIDER: 'network/provider-required',
  BROWSER_E2E: 'browser-e2e',
  OPT_IN_LEGACY: 'opt-in/legacy',
};

// #378: 13 pre-existing failing frontend files on the develop baseline (old
// apps/dgfy-web/src/... paths). Matched by basename so the ADR 0071 split does
// not break the cross-reference; an unmatched entry fails --check so a rename
// forces an intentional list update instead of silent drift. This records
// failure membership only — it never changes a file's cost/dependency
// classification (a failing fast test is still fast).
const BASELINE_FAILURES_378 = [
  'adminService.adminOperations.contract.test.js',
  'adminService.logout.contract.test.js',
  'browserEntrypoints.csrfSession.contract.test.js',
  'TenantManager.assistedProvisioning.integration.test.jsx',
  'TenantManager.capabilities.integration.test.jsx',
  'TenantManager.compliancePartialLoad.integration.test.jsx',
  'TenantManager.editPlan.integration.test.jsx',
  'TenantManager.forceNonCompliant.integration.test.jsx',
  'RoutingSafety.test.jsx',
  'externalProductLookup.contract.test.js',
  'posSettingsCashier.contract.test.js',
  'terminalPairing.contract.test.js',
  'terminalResponsiveScroll.contract.test.js',
];

// Timed full-file samples with provenance (see docs/testing/test-cost-inventory.md
// "Runtime buckets"). Static estimates cover every record; these samples anchor
// the buckets to wall-clock evidence. Refresh when a runner/config changes
// materially. status is "measured" or "not-executed" (never "passing").
const MEASURED_SAMPLES = [
  {
    path: 'apps/dgfy-api/tests/healthService.test.js',
    command: 'cd apps/dgfy-api && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/healthService.test.js',
    status: 'measured',
    result: '1 suite passed, 22 tests passed, Jest Time 0.188s, wall ~6s',
    environment: 'darwin arm64, Node v24.14.0',
    date: '2026-09-23',
    scope: 'full-file',
  },
  {
    path: 'packages/web-core/src/utils/__tests__/tenantCapabilityMessages.test.js',
    command: 'npm --prefix apps/dgfy-ims test -- --run ../../packages/web-core/src/utils/__tests__/tenantCapabilityMessages.test.js',
    status: 'measured',
    result: '1 file passed, 5 tests passed, Vitest Duration 463ms, wall ~3s',
    environment: 'darwin arm64, Node v24.14.0, Vitest v4.1.10',
    date: '2026-09-23',
    scope: 'full-file',
  },
  {
    path: 'apps/dgfy-storefront/src/__tests__/customerAccess.test.js',
    command: 'npm --prefix apps/dgfy-storefront test -- --run src/__tests__/customerAccess.test.js',
    status: 'measured',
    result: '1 file passed, 12 tests passed, Vitest Duration 531ms, wall ~3s',
    environment: 'darwin arm64, Node v24.14.0, Vitest v4.1.10',
    date: '2026-09-23',
    scope: 'full-file',
  },
  {
    path: 'apps/dgfy-pos/tests/unit/PosItemImageViewer.test.jsx',
    command: 'npm --prefix apps/dgfy-pos test -- --run tests/unit/PosItemImageViewer.test.jsx',
    status: 'measured',
    result: '1 file passed, 4 tests passed, Vitest Duration 6.53s, wall ~15s',
    environment: 'darwin arm64, Node v24.14.0, Vitest v4.1.10',
    date: '2026-09-23',
    scope: 'full-file',
  },
];

// --- discovery ----------------------------------------------------------------

const UNIT_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const E2E_DIR_RE = /(^|\/)tests\/e2e\//;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', '.git']);

function walkUnitFiles(rootDir, files = []) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkUnitFiles(path.join(rootDir, entry.name), files);
    } else if (entry.isFile() && UNIT_FILE_RE.test(entry.name)) {
      files.push(path.join(rootDir, entry.name));
    }
  }
  return files;
}

function toRepoPath(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function listBackendTests() {
  // Mirrors apps/dgfy-api/jest.config.cjs roots/testPathIgnorePatterns via
  // Jest's own semantics: every *.test.js under tests/ at any depth
  // (verified against `jest --listTests`, which also finds
  // tests/helpers/*.test.js that a top-level readdir misses).
  const discovered = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        discovered.push(path.relative(API_TESTS_DIR, path.join(dir, entry.name)).split(path.sep).join('/'));
      }
    }
  };
  walk(API_TESTS_DIR);
  discovered.sort();
  const active = discovered.filter((name) => !name.endsWith('.legacy.test.js'));
  const legacy = discovered.filter((name) => name.endsWith('.legacy.test.js'));
  return { active, legacy };
}

function loadDbManifest() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return new Set(require(path.join(ROOT, 'scripts', 'backend-db-dependent-tests.js')));
}

// --- static signals ------------------------------------------------------------

function countCases(text) {
  const matches = text.match(/\b(it|test)\s*\(/g);
  return matches ? matches.length : 0;
}

function hasMockSignal(text) {
  return /jest\.unstable_mockModule|jest\.mock\(|jest\.fn\(|jest\.spyOn|vi\.mock\(|vi\.spyOn|vi\.fn\(|mockResolved|mockRejected|msw|MockServiceWorker|global\.fetch\s*=|mockFetch|__mocks__|MockAdapter|axios-mock-adapter|\bnock\b|\bsinon\b|fetch-mock/.test(text);
}

function hasProviderSignal(text) {
  return /paypal|paymongo|stripe|sandbox|canary|googleapis|mapbox|openfreemap|posthog/i.test(text);
}

function hasLiveProviderCallShape(text) {
  // A provider WORD (fixture literal, disabled-contract copy, URL allowlist)
  // is not a live call. Only a real outbound-call shape counts: fetch/axios/
  // node-http invocation, provider SDK construction/import, XHR, or WebSocket.
  return /fetch\s*\(|axios\s*(\.\s*(get|post|put|delete|patch|request)|\s*\()|https?\s*\.\s*(get|request)|new\s+\w*(PayPal|PayMongo|Stripe)\w*\s*\(|@paypal|paypal-rest-sdk|XMLHttpRequest|WebSocket\s*\(/.test(text);
}

function hasUnmockedLiveProviderCall(text) {
  return hasProviderSignal(text) && hasLiveProviderCallShape(text) && !hasMockSignal(text);
}

function hasSeedSignal(text) {
  return /createTestTenant|landlordSchemaReadiness|sync\(\s*\{\s*force|seedTest|loadFixture|__fixtures__|factories\//.test(text);
}

function hasRedisSignal(text) {
  return /config\/redis|getRedisClient|initializeRedis/.test(text);
}

// --- classification ------------------------------------------------------------

function estimateRuntimeBucket(sizeBytes, caseCount) {
  // Rough static buckets with explicit provenance — machine, cache, and data
  // dependent. Not an SLA; see the guide's "Runtime buckets" section.
  if (sizeBytes < 20 * 1024 && caseCount <= 10) return 'fast (<30s full-file, static estimate)';
  if (sizeBytes < 80 * 1024 && caseCount <= 40) return 'medium (30s-2min, static estimate)';
  return 'slow (>2min or heavy, static estimate)';
}

function classifyBackend(relPath, content, dbManifest) {
  const fileName = path.basename(relPath);
  const deps = {
    db_required: false,
    redis_required: false,
    network_provider_required: false,
    browser_runtime_required: false,
    fixture_seed_required: hasSeedSignal(content),
  };
  if (/^frontend\..*\.e2e\.test\.js$/i.test(fileName) || /RUN_BROWSER_E2E/.test(content)) {
    deps.browser_runtime_required = true;
    return {
      classification: CLASS.BROWSER_E2E,
      dependencies: deps,
      default_opt_in: 'opt-in',
      runner: 'Jest (browser-gated)',
      command: `cd apps/dgfy-api && RUN_BROWSER_E2E=true npm test -- --runTestsByPath ${relPath}`,
      safe_command: 'not part of the default fast subset; run explicitly with RUN_BROWSER_E2E=true and a browser available',
      notes: 'Default assertions skip unless RUN_BROWSER_E2E=true; browser E2E is opt-in.',
    };
  }
  if (dbManifest.has(relPath) || dbManifest.has(relPath.replace(/^apps\/dgfy-api\//, ''))) {
    deps.db_required = true;
    return {
      classification: CLASS.DB_REQUIRED,
      dependencies: deps,
      default_opt_in: 'opt-in',
      runner: 'Jest (db tier)',
      command: 'npm run test:backend:db',
      safe_command: 'npm run test:backend:db (requires MySQL; see #372)',
      notes: 'Listed in scripts/backend-db-dependent-tests.js, the execution source of truth.',
    };
  }
  if (hasUnmockedLiveProviderCall(content)) {
    deps.network_provider_required = true;
    return {
      classification: CLASS.NETWORK_PROVIDER,
      dependencies: deps,
      default_opt_in: 'opt-in',
      runner: 'Jest (fast tier)',
      command: `cd apps/dgfy-api && npm test -- --runTestsByPath ${relPath}`,
      safe_command: 'opt-in: touches a live provider boundary without a mock',
      notes: 'Provider-named file with no mock signal; verify before treating as fast.',
    };
  }
  if (hasRedisSignal(content)) {
    // tests/setup.js replaces the redis client with stateful in-memory
    // semantics, so no backend file needs a real Redis (verified: the
    // db-manifest derivation explicitly keeps distributedLock.redis.test.js
    // in the fast tier for this reason).
    return {
      classification: CLASS.FAST_MOCKED,
      dependencies: deps,
      default_opt_in: 'default',
      runner: 'Jest (fast tier)',
      command: 'npm run test:backend:fast',
      safe_command: 'npm run test:backend:fast (DB_HOST/DB_PORT guarded unreachable; redis mocked by tests/setup.js)',
      notes: 'Redis boundary mocked by apps/dgfy-api/tests/setup.js; no live Redis required.',
    };
  }
  // A provider WORD without a live-call shape (fixture literal,
  // disabled-contract copy, URL allowlist) is not an external dependency —
  // those files fall through to fast-pure below.
  if (hasMockSignal(content)) {
    return {
      classification: CLASS.FAST_MOCKED,
      dependencies: deps,
      default_opt_in: 'default',
      runner: 'Jest (fast tier)',
      command: 'npm run test:backend:fast',
      safe_command: 'npm run test:backend:fast (DB_HOST/DB_PORT guarded unreachable)',
      notes: 'External boundary mocked or fixture-keyed; passes under the fast-tier unreachable-DB guard.',
    };
  }
  return {
    classification: CLASS.FAST_PURE,
    dependencies: deps,
    default_opt_in: 'default',
    runner: 'Jest (fast tier)',
    command: 'npm run test:backend:fast',
    safe_command: 'npm run test:backend:fast (DB_HOST/DB_PORT guarded unreachable)',
    notes: 'No DB/Redis/network/browser signal detected.',
  };
}

const FRONTEND_RUNNERS = {
  'apps/dgfy-ims': { workspace: 'apps/dgfy-ims', surface: 'SKUpervisor / IMS', prefix: 'apps/dgfy-ims' },
  'apps/dgfy-pos': { workspace: 'apps/dgfy-pos', surface: 'Standalone POS', prefix: 'apps/dgfy-pos' },
  'apps/dgfy-storefront': { workspace: 'apps/dgfy-storefront', surface: 'Public Storefront', prefix: 'apps/dgfy-storefront' },
  'packages/web-core': { workspace: 'apps/dgfy-ims', surface: 'Shared trunk (@sieitzz/web-core, via IMS)', prefix: 'apps/dgfy-ims' },
};

function classifyFrontend(repoPath, content, invokedFrom) {
  const deps = {
    db_required: false,
    redis_required: false,
    network_provider_required: false,
    browser_runtime_required: false,
    fixture_seed_required: hasSeedSignal(content),
  };
  const invokePath = repoPath.startsWith('packages/web-core/')
    ? repoPath
    : path.relative(invokedFrom, path.join(ROOT, repoPath)).split(path.sep).join('/');
  if (E2E_DIR_RE.test(repoPath) || /@playwright\/test|playwright/.test(content)) {
    deps.browser_runtime_required = true;
    const app = invokedFrom;
    return {
      classification: CLASS.BROWSER_E2E,
      dependencies: deps,
      default_opt_in: 'opt-in',
      runner: 'Playwright',
      command: `cd ${app} && npx playwright test ${path.relative(app, path.join(ROOT, repoPath)).split(path.sep).join('/')}`,
      safe_command: 'not part of the default fast subset; requires a browser and running dev servers',
      notes: 'Browser E2E owned by Playwright; excluded from Vitest by config (tests/e2e/**).',
    };
  }
  if (hasUnmockedLiveProviderCall(content)) {
    deps.network_provider_required = true;
    return {
      classification: CLASS.NETWORK_PROVIDER,
      dependencies: deps,
      default_opt_in: 'opt-in',
      runner: 'Vitest',
      command: `npm --prefix ${invokedFrom} test -- --run ${invokePath}`,
      safe_command: 'opt-in: touches a live provider boundary without a mock; a mocked fetch/axios test never proves live provider behavior',
      notes: 'Provider-named file with no mock signal; verify before treating as fast.',
    };
  }
  if (hasMockSignal(content)) {
    return {
      classification: CLASS.FAST_MOCKED,
      dependencies: deps,
      default_opt_in: 'default',
      runner: 'Vitest',
      command: `npm --prefix ${invokedFrom} test -- --run ${invokePath}`,
      safe_command: `npm --prefix ${invokedFrom} test -- --run ${invokePath} (no MySQL/Redis/network/browser required)`,
      notes: 'External boundary (fetch/API client/router) mocked; jsdom only.',
    };
  }
  return {
    classification: CLASS.FAST_PURE,
    dependencies: deps,
    default_opt_in: 'default',
    runner: 'Vitest',
    command: `npm --prefix ${invokedFrom} test -- --run ${invokePath}`,
    safe_command: `npm --prefix ${invokedFrom} test -- --run ${invokePath} (no MySQL/Redis/network/browser required)`,
    notes: 'No DB/Redis/network/browser signal detected.',
  };
}

// --- inventory build ------------------------------------------------------------

function buildInventory() {
  const dbManifest = loadDbManifest();
  const records = [];
  const exclusions = [];

  const { active, legacy } = listBackendTests();
  for (const name of legacy) {
    exclusions.push({
      path: `apps/dgfy-api/tests/${name}`,
      reason: 'opt-in/legacy: excluded from the Jest inventory by testPathIgnorePatterns; run only via test:legacy:payments',
    });
  }
  for (const name of active) {
    const relPath = `apps/dgfy-api/tests/${name}`;
    const content = fs.readFileSync(path.join(API_TESTS_DIR, name), 'utf8');
    const cls = classifyBackend(relPath, content, dbManifest);
    records.push({
      path: relPath,
      workspace: 'apps/dgfy-api',
      surface: 'DGFY API',
      ...cls,
      runtime_bucket: estimateRuntimeBucket(Buffer.byteLength(content), countCases(content)),
      runtime_provenance: { method: 'static-estimate', detail: 'size + case count; see manifest measurements for timed samples' },
      known_baseline_failure_378: BASELINE_FAILURES_378.includes(name),
    });
  }

  const frontendRoots = [
    { dir: IMS_DIR, key: 'apps/dgfy-ims' },
    { dir: POS_DIR, key: 'apps/dgfy-pos' },
    { dir: STOREFRONT_DIR, key: 'apps/dgfy-storefront' },
    { dir: WEB_CORE_DIR, key: 'packages/web-core' },
  ];
  for (const { dir, key } of frontendRoots) {
    const meta = FRONTEND_RUNNERS[key];
    const files = walkUnitFiles(dir).map(toRepoPath).sort();
    for (const repoPath of files) {
      const content = fs.readFileSync(path.join(ROOT, repoPath), 'utf8');
      const cls = classifyFrontend(repoPath, content, meta.prefix);
      records.push({
        path: repoPath,
        workspace: key,
        surface: meta.surface,
        invoked_from: meta.prefix,
        ...cls,
        runtime_bucket: estimateRuntimeBucket(Buffer.byteLength(content), countCases(content)),
        runtime_provenance: { method: 'static-estimate', detail: 'size + case count; see manifest measurements for timed samples' },
        known_baseline_failure_378: BASELINE_FAILURES_378.includes(path.basename(repoPath)),
      });
    }
  }

  // apps/dgfy-migration-runner ships no unit suite; its validation surface is
  // the migration/seed commands themselves (MySQL-required operational proof).
  records.push({
    path: 'apps/dgfy-migration-runner/migrations',
    workspace: 'apps/dgfy-migration-runner',
    surface: 'Migration runner',
    classification: CLASS.DB_REQUIRED,
    dependencies: {
      db_required: true, redis_required: false, network_provider_required: false,
      browser_runtime_required: false, fixture_seed_required: false,
    },
    default_opt_in: 'opt-in',
    runner: 'sequelize-cli (operational)',
    command: 'cd apps/dgfy-migration-runner && npm run migrate',
    safe_command: 'opt-in operational validation against a disposable database; never the default subset',
    runtime_bucket: 'slow (>2min or heavy, static estimate)',
    runtime_provenance: { method: 'static-estimate', detail: 'migration execution touches every pending migration' },
    known_baseline_failure_378: false,
    notes: 'No unit/spec files exist here; classified as MySQL-required operational validation, not a unit suite to invent.',
  });
  records.push({
    path: 'apps/dgfy-migration-runner/seeders',
    workspace: 'apps/dgfy-migration-runner',
    surface: 'Migration runner',
    classification: CLASS.DB_REQUIRED,
    dependencies: {
      db_required: true, redis_required: false, network_provider_required: false,
      browser_runtime_required: false, fixture_seed_required: true,
    },
    default_opt_in: 'opt-in',
    runner: 'sequelize-cli (operational)',
    command: 'cd apps/dgfy-migration-runner && npm run seed',
    safe_command: 'opt-in operational validation against a disposable database; never the default subset',
    runtime_bucket: 'slow (>2min or heavy, static estimate)',
    runtime_provenance: { method: 'static-estimate', detail: 'seed execution writes fixture data' },
    known_baseline_failure_378: false,
    notes: 'Seed data for disposable/test environments only.',
  });

  records.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const unmatched378 = BASELINE_FAILURES_378.filter(
    (base) => !records.some((r) => path.basename(r.path) === base),
  );

  const stats = {};
  for (const r of records) {
    const key = `${r.workspace} :: ${r.classification} :: ${r.default_opt_in}`;
    stats[key] = (stats[key] || 0) + 1;
  }

  return {
    schema: SCHEMA,
    generated_at: new Date().toISOString(),
    generator: 'scripts/audit-test-cost-inventory.js',
    sources: {
      backend_db_manifest: 'scripts/backend-db-dependent-tests.js',
      backend_jest_config: 'apps/dgfy-api/jest.config.cjs',
      ims_vitest_config: 'apps/dgfy-ims/vite.config.js (includes packages/web-core/**)',
      pos_vitest_config: 'apps/dgfy-pos/vite.config.js',
      storefront_vitest_config: 'apps/dgfy-storefront/vite.config.js',
      playwright_configs: 'apps/dgfy-{ims,pos,storefront}/playwright.config.js (testDir tests/e2e)',
      baseline_failures: 'issue #378 (13 files, matched by basename)',
    },
    measurements: MEASURED_SAMPLES,
    stats,
    exclusions,
    unmatched_baseline_failures_378: unmatched378,
    records,
  };
}

// --- CLI ------------------------------------------------------------------------

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    check: argv.includes('--check'),
  };
}

function semanticEqual(a, b) {
  // generated_at is provenance, not content: ignore it so --check is
  // deterministic across regenerations.
  const strip = (inv) => JSON.stringify({
    schema: inv.schema,
    sources: inv.sources,
    measurements: inv.measurements,
    stats: inv.stats,
    exclusions: inv.exclusions,
    unmatched: inv.unmatched_baseline_failures_378,
    records: inv.records,
  });
  return strip(a) === strip(b);
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.write && !args.check) {
    console.error('Usage: node scripts/audit-test-cost-inventory.js --write|--check');
    process.exit(2);
  }
  const inventory = buildInventory();
  if (args.write) {
    fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`wrote ${OUTPUT_JSON} (${inventory.records.length} records, ${inventory.exclusions.length} exclusions)`);
    if (inventory.unmatched_baseline_failures_378.length > 0) {
      console.error(`WARN: unmatched #378 basenames: ${inventory.unmatched_baseline_failures_378.join(', ')}`);
      process.exit(1);
    }
    const stale = dbManifestStaleEntries(inventory);
    if (stale.length > 0) {
      console.error(`WARN: db-manifest entries with no discovered file: ${stale.join(', ')}`);
      process.exit(1);
    }
    return;
  }
  // --check
  if (!fs.existsSync(OUTPUT_JSON)) {
    console.error(`missing manifest: ${OUTPUT_JSON} (run --write)`);
    process.exit(1);
  }
  const checkedIn = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
  const problems = [];
  if (checkedIn.schema !== SCHEMA) problems.push(`schema mismatch: ${checkedIn.schema} !== ${SCHEMA}`);
  if (!semanticEqual(checkedIn, inventory)) {
    problems.push('manifest is stale: regenerate with `npm run audit:test-cost` and commit the result');
    const checkedPaths = new Set(checkedIn.records.map((r) => r.path));
    const livePaths = new Set(inventory.records.map((r) => r.path));
    for (const p of [...livePaths].filter((p) => !checkedPaths.has(p))) problems.push(`undiscovered test file missing from manifest: ${p}`);
    for (const p of [...checkedPaths].filter((p) => !livePaths.has(p))) problems.push(`stale manifest entry (file no longer discovered): ${p}`);
  }
  if (inventory.unmatched_baseline_failures_378.length > 0) {
    problems.push(`unmatched #378 basenames: ${inventory.unmatched_baseline_failures_378.join(', ')}`);
  }
  const stale = dbManifestStaleEntries(inventory);
  if (stale.length > 0) problems.push(`db-manifest entries with no discovered file: ${stale.join(', ')}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL: ${p}`);
    process.exit(1);
  }
  console.log(`ok: ${inventory.records.length} records current, no stale/missing entries`);
}

function dbManifestStaleEntries(inventory) {
  const live = new Set(inventory.records.map((r) => r.path));
  return [...loadDbManifest()].filter((m) => !live.has(`apps/dgfy-api/${m}`));
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  SCHEMA,
  CLASS,
  BASELINE_FAILURES_378,
  MEASURED_SAMPLES,
  classifyBackend,
  classifyFrontend,
  estimateRuntimeBucket,
  countCases,
  hasMockSignal,
  hasProviderSignal,
  hasLiveProviderCallShape,
  hasUnmockedLiveProviderCall,
  hasSeedSignal,
  buildInventory,
};
