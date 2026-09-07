const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  REACHABILITY_SCOPE_DIRS,
  ENTRY_FILE_BY_APP,
  computeAppReachableModules,
  auditReachabilitySafety,
} = require('./resolve-web-core-reachability');

// #1695, Phase 303 -- shadow-mode reachability oracle. Fixtures are plain filesystem trees (no git
// needed -- this module reads live files, never `git show`), one fresh temp dir per test so
// buildUnionGraph()'s per-repoRoot cache never leaks across tests.

function makeTempRepo(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// --- PR #1689 scenario, reconstructed as a fixture -----------------------------------------
//
// Real-repo shape (confirmed live against packages/web-core, see the module's own header comment):
// storefrontCatalogService.js is imported only by admin/catalog-authoring code reachable from
// dgfy-ims/dgfy-pos, never from dgfy-storefront's own entry chain -- so a change to the
// imageEncoding/bulk* files it pulls in should NOT obligate a dgfy-storefront bump, even though
// the old directory-level check (rightly, by its own contract) flags it.

function pr1689Fixture(root) {
  writeFiles(root, {
    // dgfy-storefront: its own entry never reaches storefrontCatalogService.js.
    'apps/dgfy-storefront/src/main.jsx': "import '../../../packages/web-core/src/components/common/ErrorBoundary.jsx';\n",

    // dgfy-ims: entry -> ItemsPage.jsx -> storefrontCatalogService.js (mirrors the real repo's
    // packages/web-core/src/features/inventory/pages/ItemsPage.jsx import).
    'apps/dgfy-ims/src/main.jsx': "import '../../../packages/web-core/src/features/inventory/pages/ItemsPage.jsx';\n",

    // dgfy-pos: entry -> TerminalOperationsWorkspace.jsx -> storefrontCatalogService.js (mirrors
    // packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx).
    'apps/dgfy-pos/src/main.jsx': "import '../../../packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx';\n",

    'packages/web-core/src/components/common/ErrorBoundary.jsx': 'export default function ErrorBoundary() {}\n',

    'packages/web-core/src/features/inventory/pages/ItemsPage.jsx':
      "import '../../../services/storefrontCatalogService.js';\nexport default function ItemsPage() {}\n",
    'packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx':
      "import '../../../services/storefrontCatalogService.js';\nexport default function TerminalOperationsWorkspace() {}\n",

    'packages/web-core/src/services/storefrontCatalogService.js':
      "import { bulkCatalogUpload } from '../utils/imageEncoding/bulkCatalogUpload.js';\nexport { bulkCatalogUpload };\n",
    'packages/web-core/src/utils/imageEncoding/bulkCatalogUpload.js':
      'export function bulkCatalogUpload() { return true; }\n',
  });
}

test('PR #1689 scenario: dgfy-storefront correctly excludes bulk*/storefrontCatalogService, dgfy-ims/dgfy-pos correctly include them', async () => {
  const root = makeTempRepo('reachability-pr1689-');
  try {
    pr1689Fixture(root);

    const catalogService = 'packages/web-core/src/services/storefrontCatalogService.js';
    const bulkUpload = 'packages/web-core/src/utils/imageEncoding/bulkCatalogUpload.js';

    const storefrontReachable = await computeAppReachableModules(root, ENTRY_FILE_BY_APP['dgfy-storefront']);
    assert.equal(storefrontReachable.has(catalogService), false);
    assert.equal(storefrontReachable.has(bulkUpload), false);

    const imsReachable = await computeAppReachableModules(root, ENTRY_FILE_BY_APP['dgfy-ims']);
    assert.equal(imsReachable.has(catalogService), true);
    assert.equal(imsReachable.has(bulkUpload), true);

    const posReachable = await computeAppReachableModules(root, ENTRY_FILE_BY_APP['dgfy-pos']);
    assert.equal(posReachable.has(catalogService), true);
    assert.equal(posReachable.has(bulkUpload), true);
  } finally {
    cleanup(root);
  }
});

test('computeAppReachableModules: the returned Set is restricted to packages/web-core and packages/shared-constants, app-level files are dropped', async () => {
  const root = makeTempRepo('reachability-scope-');
  try {
    pr1689Fixture(root);
    const imsReachable = await computeAppReachableModules(root, ENTRY_FILE_BY_APP['dgfy-ims']);
    for (const modulePath of imsReachable) {
      assert.ok(
        REACHABILITY_SCOPE_DIRS.some((dir) => modulePath.startsWith(`${dir}/`)),
        `expected every entry to be scoped under ${REACHABILITY_SCOPE_DIRS.join('/')}, got "${modulePath}"`,
      );
    }
    assert.ok(imsReachable.size > 0);
  } finally {
    cleanup(root);
  }
});

test('computeAppReachableModules: throws when the entry file does not exist on disk', async () => {
  const root = makeTempRepo('reachability-missing-entry-');
  try {
    await assert.rejects(
      () => computeAppReachableModules(root, 'apps/dgfy-storefront/src/main.jsx'),
      /does not exist under/,
    );
  } finally {
    cleanup(root);
  }
});

// --- the one new Worker pattern ------------------------------------------------------------
//
// madge's own static analysis does not follow `new Worker(new URL('./x.js', import.meta.url))` as
// a dependency edge (confirmed live against the real packages/web-core/src/utils/imageEncoding/
// index.js -- madge's parse omits encodeWorker.js from that file's dependency list entirely). This
// fixture reproduces that exact shape and asserts the synthetic-edge injection (§3.2) makes the
// worker file -- and, critically, ITS OWN further imports -- show up in the reachable Set anyway.

function workerPatternFixture(root) {
  writeFiles(root, {
    'apps/dgfy-ims/src/main.jsx': "import '../../../packages/web-core/src/utils/imageEncoding/index.js';\n",
    'packages/web-core/src/utils/imageEncoding/index.js':
      "export function startEncode() {\n  const worker = new Worker(new URL('./encodeWorker.js', import.meta.url));\n  return worker;\n}\n",
    // encodeWorker.js has its own further import -- proves the worker target was fed into madge as
    // a real entry point (so its own transitive deps are captured), not just a dead-end edge.
    'packages/web-core/src/utils/imageEncoding/encodeWorker.js':
      "import { variantManifest } from './variantManifest.js';\nself.onmessage = () => variantManifest;\n",
    'packages/web-core/src/utils/imageEncoding/variantManifest.js': 'export const variantManifest = {};\n',
  });
}

test('the new Worker(new URL(...)) pattern is folded in as a synthetic edge, including its own further imports', async () => {
  const root = makeTempRepo('reachability-worker-');
  try {
    workerPatternFixture(root);
    const reachable = await computeAppReachableModules(root, ENTRY_FILE_BY_APP['dgfy-ims']);
    assert.equal(reachable.has('packages/web-core/src/utils/imageEncoding/encodeWorker.js'), true);
    assert.equal(reachable.has('packages/web-core/src/utils/imageEncoding/variantManifest.js'), true);
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: the known-safe Worker(new URL(literal, import.meta.url)) shape alone is not flagged', () => {
  const root = makeTempRepo('reachability-worker-safe-audit-');
  try {
    workerPatternFixture(root);
    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, true);
    assert.deepEqual(audit.violations, []);
  } finally {
    cleanup(root);
  }
});

// --- synthetic safety-net-trip violation ----------------------------------------------------

test('auditReachabilitySafety: a clean fixture is safe with zero violations', () => {
  const root = makeTempRepo('reachability-clean-audit-');
  try {
    pr1689Fixture(root);
    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, true);
    assert.deepEqual(audit.violations, []);
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: a computed (non-literal) dynamic import() trips the safety net', () => {
  const root = makeTempRepo('reachability-tripped-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      // Synthetic violation: a computed specifier defeats static resolution entirely -- exactly
      // the risk class §2/§3.3 exist to catch.
      'packages/web-core/src/utils/riskyLoader.js': 'export function load(moduleName) {\n  return import(moduleName);\n}\n',
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, false);
    assert.ok(audit.violations.length > 0);
    assert.ok(audit.violations.some((v) => v.pattern === 'non-literal-dynamic-import' && v.file === 'packages/web-core/src/utils/riskyLoader.js'));
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: import.meta.glob(...) trips the safety net', () => {
  const root = makeTempRepo('reachability-glob-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      'packages/web-core/src/utils/globLoader.js': "const modules = import.meta.glob('./variants/*.js');\nexport default modules;\n",
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, false);
    assert.ok(audit.violations.some((v) => v.pattern === 'import-meta-glob'));
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: a Worker construction NOT matching the known-safe literal-URL shape trips the safety net', () => {
  const root = makeTempRepo('reachability-worker-unsafe-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      // Computed worker URL -- not the one recognized safe shape.
      'packages/web-core/src/utils/computedWorker.js': 'export function spawn(scriptPath) {\n  return new Worker(scriptPath);\n}\n',
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, false);
    assert.ok(audit.violations.some((v) => v.pattern === 'unrecognized-worker-construct' && v.file === 'packages/web-core/src/utils/computedWorker.js'));
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: patterns inside __tests__/*.test.js files are not scanned (never part of the reachability graph)', () => {
  const root = makeTempRepo('reachability-test-file-exclusion-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      'packages/web-core/src/utils/__tests__/riskyLoader.test.js': 'export function load(moduleName) {\n  return import(moduleName);\n}\n',
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, true);
    assert.deepEqual(audit.violations, []);
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: a literal-only dynamic import() call, even one that looks unusual, is not flagged', () => {
  const root = makeTempRepo('reachability-literal-import-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      'packages/web-core/src/utils/lazyLoad.js': "export function load() {\n  return import('./bulkModule.js');\n}\n",
      'packages/web-core/src/utils/bulkModule.js': 'export default {};\n',
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, true);
    assert.deepEqual(audit.violations, []);
  } finally {
    cleanup(root);
  }
});
