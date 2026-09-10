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
  resolveAppReachabilityVerdict,
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

// --- RF-2 (PR #1708 review): self-referential alias resolution -----------------------------
//
// Before this fix, `@/...`/`@sieitzz/...` alias specifiers were invisible to madge's plain static
// import analysis -- computeAppReachableModules() silently under-counted (returned 0
// packages/shared-constants modules for a package the app actually imports directly via an
// alias) while auditReachabilitySafety() still reported safe:true. Confirmed live against the
// real repo before this fix: packages/web-core/src/features/settings/modeItemTaxonomy.js reaches
// packages/shared-constants/src/workflowModes.js ONLY via
// `@sieitzz/shared-constants/workflowModes` -- dgfy-ims's reachable set went from 302 to 462
// modules once this was fixed.

test('computeAppReachableModules: a packages/shared-constants file reached ONLY via a `@sieitzz/shared-constants` alias import is reachable', async () => {
  const root = makeTempRepo('reachability-alias-shared-constants-');
  try {
    // RF-2's own example: the APP's own entry imports the alias directly, not just web-core's
    // self-referential code -- this is the scenario that was silently missed.
    writeFiles(root, {
      'apps/dgfy-ims/src/main.jsx': "import '@sieitzz/shared-constants/workflowModes';\n",
      'packages/shared-constants/src/workflowModes.js': 'export const WORKFLOW_MODES = {};\n',
    });

    const reachable = await computeAppReachableModules(root, ENTRY_FILE_BY_APP['dgfy-ims']);
    assert.equal(reachable.has('packages/shared-constants/src/workflowModes.js'), true);
  } finally {
    cleanup(root);
  }
});

test('computeAppReachableModules: a `@/...` alias-only edge inside packages/web-core is followed, including further imports of the alias target', async () => {
  const root = makeTempRepo('reachability-alias-web-core-');
  try {
    writeFiles(root, {
      'apps/dgfy-pos/src/main.jsx': "import '../../../packages/web-core/src/features/pos/entry.js';\n",
      'packages/web-core/src/features/pos/entry.js': "import { useThing } from '@/hooks/useThing.js';\nexport { useThing };\n",
      'packages/web-core/src/hooks/useThing.js':
        "import { normalizeWorkflowMode } from '@sieitzz/shared-constants/workflowModes';\nexport function useThing() { return normalizeWorkflowMode; }\n",
      'packages/shared-constants/src/workflowModes.js': 'export function normalizeWorkflowMode() {}\n',
    });

    const reachable = await computeAppReachableModules(root, ENTRY_FILE_BY_APP['dgfy-pos']);
    assert.equal(reachable.has('packages/web-core/src/hooks/useThing.js'), true);
    // Proves the alias target was fed into madge as a real entry point (its OWN further alias
    // import is followed too), not just a dead-end synthetic edge.
    assert.equal(reachable.has('packages/shared-constants/src/workflowModes.js'), true);
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: an unrecognized `@/...` alias (no known mapping) trips the safety net', () => {
  const root = makeTempRepo('reachability-alias-unknown-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      'packages/web-core/src/utils/badAlias.js': "import '@/nonexistent/thing.js';\n",
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, false);
    assert.ok(audit.violations.some((v) => v.pattern === 'unresolved-internal-alias' && v.file === 'packages/web-core/src/utils/badAlias.js'));
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: a known alias whose target file does not exist on disk trips the safety net', () => {
  const root = makeTempRepo('reachability-alias-missing-target-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      // '@/hooks' IS a known alias -- but useMissing.js was never actually created.
      'packages/web-core/src/utils/badAlias.js': "import '@/hooks/useMissing.js';\n",
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, false);
    assert.ok(audit.violations.some((v) => v.pattern === 'unresolved-internal-alias' && v.file === 'packages/web-core/src/utils/badAlias.js'));
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: a `@sieitzz/shared-constants` subpath alias import is not flagged when its target exists', () => {
  const root = makeTempRepo('reachability-alias-clean-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      'packages/web-core/src/utils/usesConstants.js': "import { normalizeWorkflowMode } from '@sieitzz/shared-constants/workflowModes';\nexport { normalizeWorkflowMode };\n",
      'packages/shared-constants/src/workflowModes.js': 'export function normalizeWorkflowMode() {}\n',
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, true);
    assert.deepEqual(audit.violations, []);
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: dgfy-ims\'s bare `@` app-root fallback (e.g. `@/utils.js`) is never flagged -- it can never target REACHABILITY_SCOPE_DIRS', () => {
  const root = makeTempRepo('reachability-alias-app-root-fallback-audit-');
  try {
    pr1689Fixture(root);
    // Reproduces the real, live pattern found in packages/web-core/Components/items/ItemCard.jsx:
    // a web-core file importing an app-root-relative file only dgfy-ims's own bare `@` fallback
    // (not part of SELF_REFERENTIAL_ALIASES) can resolve.
    writeFiles(root, {
      'packages/web-core/src/utils/usesAppRoot.js': "import { createPageUrl } from '@/utils.js';\nexport { createPageUrl };\n",
      // The real repo (apps/dgfy-ims/utils.js) has this file for real -- without it existing
      // under SOME app's root, this specifier would correctly be "unresolved", not ignored.
      'apps/dgfy-ims/utils.js': 'export function createPageUrl() {}\n',
    });

    const audit = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(audit.safe, true);
    assert.deepEqual(audit.violations, []);
  } finally {
    cleanup(root);
  }
});

test('auditReachabilitySafety: aliasScanDirs also covers an unresolved alias in the app\'s own source tree, not just packages/web-core', () => {
  const root = makeTempRepo('reachability-alias-app-scan-audit-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      // RF-2's own scenario: the unresolved alias lives in the APP's source, not web-core's.
      'apps/dgfy-ims/src/badAlias.js': "import '@/nonexistent/thing.js';\n",
    });

    // Omitting aliasScanDirs (defaults to packageDirs) never sees the app's own tree -- safe:true.
    const auditWithoutAppScan = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS);
    assert.equal(auditWithoutAppScan.safe, true);

    // Passing the app's dir in aliasScanDirs (as check-app-version-bump.js's call site now does)
    // catches it -- safe:false.
    const auditWithAppScan = auditReachabilitySafety(root, REACHABILITY_SCOPE_DIRS, [...REACHABILITY_SCOPE_DIRS, 'apps/dgfy-ims']);
    assert.equal(auditWithAppScan.safe, false);
    assert.ok(auditWithAppScan.violations.some((v) => v.pattern === 'unresolved-internal-alias' && v.file === 'apps/dgfy-ims/src/badAlias.js'));
  } finally {
    cleanup(root);
  }
});

// --- #1809 (Phase 324): resolveAppReachabilityVerdict() -- the shared, GATING oracle -----------
//
// Supersedes check-app-version-bump.js's old shadow-mode-only computeReachabilityShadowVerdict
// (removed). Its own dedicated fixture below reproduces the concrete multi-scope-package bug this
// issue fixes: computeReachabilityShadowVerdict derived `relevantChangedFiles` from ONE dependency
// package (`entry.reason.slice('fan-out:'.length)`, itself set by detectChangedApps()'s
// `depPackages.find()` picking whichever package had a changed file FIRST in package.json key
// order) -- a real changed file under the OTHER scoped package was silently dropped from
// consideration entirely. resolveAppReachabilityVerdict() takes an app's FULL changed-file list and
// scopes internally against the whole REACHABILITY_SCOPE_DIRS union, so this can no longer happen.

function alwaysExists() {
  return true;
}

function neverExists() {
  return false;
}

test('resolveAppReachabilityVerdict (#1809 regression): a reachable file under packages/shared-constants is still found even when an unreachable packages/web-core file changed in the same diff', async () => {
  const root = makeTempRepo('reachability-multi-scope-package-');
  try {
    writeFiles(root, {
      // dgfy-ims's entry reaches a shared-constants file, but never the web-core file below --
      // mirrors the real repo's package.json key order (pos-receipt, shared-constants, web-core),
      // where a naive `depPackages.find()` pick would have landed on packages/web-core here, since
      // it's a real dependency too and this fixture puts a changed file under both.
      'apps/dgfy-ims/src/main.jsx': "import '../../../packages/shared-constants/src/reachableFromIms.js';\n",
      'packages/shared-constants/src/reachableFromIms.js': 'export default {};\n',
      'packages/web-core/src/unreachableFromIms.js': 'export default {};\n',
    });

    const changedFiles = [
      'packages/web-core/src/unreachableFromIms.js',
      'packages/shared-constants/src/reachableFromIms.js',
    ];

    const verdict = await resolveAppReachabilityVerdict(root, 'dgfy-ims', changedFiles, { fileExistsAtRef: alwaysExists });
    assert.equal(verdict.applicable, true);
    assert.equal(verdict.safetyNetPassed, true);
    // Both scoped files must have been considered -- not just whichever package a naive
    // single-package scope would have picked.
    assert.deepEqual(
      [...verdict.relevantChangedFiles].sort(),
      ['packages/shared-constants/src/reachableFromIms.js', 'packages/web-core/src/unreachableFromIms.js'],
    );
    assert.equal(verdict.changed, true);
    assert.equal(verdict.code, 'reachable');
    assert.deepEqual(verdict.hitFiles, ['packages/shared-constants/src/reachableFromIms.js']);
  } finally {
    cleanup(root);
  }
});

test('resolveAppReachabilityVerdict: not applicable when no changed file falls under packages/web-core or packages/shared-constants', async () => {
  const root = makeTempRepo('reachability-verdict-no-scope-change-');
  try {
    pr1689Fixture(root);
    const verdict = await resolveAppReachabilityVerdict(root, 'dgfy-ims', ['apps/dgfy-ims/src/main.jsx'], { fileExistsAtRef: alwaysExists });
    assert.equal(verdict.applicable, false);
  } finally {
    cleanup(root);
  }
});

test('resolveAppReachabilityVerdict: not applicable for a backend app (no known bundler entry)', async () => {
  const root = makeTempRepo('reachability-verdict-backend-');
  try {
    pr1689Fixture(root);
    const verdict = await resolveAppReachabilityVerdict(root, 'dgfy-api', ['packages/shared-constants/index.js'], { fileExistsAtRef: alwaysExists });
    assert.equal(verdict.applicable, false);
    assert.match(verdict.reason, /no known bundler entry/);
  } finally {
    cleanup(root);
  }
});

test('resolveAppReachabilityVerdict: a genuinely unreachable changed file resolves "not-reachable" (the PR #1689 shape)', async () => {
  const root = makeTempRepo('reachability-verdict-not-reachable-');
  try {
    pr1689Fixture(root);
    const changedFiles = ['packages/web-core/src/services/storefrontCatalogService.js'];
    const verdict = await resolveAppReachabilityVerdict(root, 'dgfy-storefront', changedFiles, { fileExistsAtRef: alwaysExists });
    assert.equal(verdict.applicable, true);
    assert.equal(verdict.safetyNetPassed, true);
    assert.equal(verdict.changed, false);
    assert.equal(verdict.code, 'not-reachable');
  } finally {
    cleanup(root);
  }
});

test('resolveAppReachabilityVerdict: a changed file that no longer exists at the head ref is conservatively counted as changed (deletion fail-closed)', async () => {
  const root = makeTempRepo('reachability-verdict-deleted-');
  try {
    pr1689Fixture(root);
    // The file is deleted from the working tree between base and head -- fileExistsAtRef mirrors
    // that by reporting it as absent at headGitRef, exactly what a real deletion looks like from
    // this module's caller-injected git-ref check.
    const changedFiles = ['packages/web-core/src/services/storefrontCatalogService.js'];
    fs.rmSync(path.join(root, changedFiles[0]));

    const verdict = await resolveAppReachabilityVerdict(root, 'dgfy-storefront', changedFiles, { fileExistsAtRef: neverExists });
    assert.equal(verdict.applicable, true);
    assert.equal(verdict.changed, true);
    assert.equal(verdict.code, 'deleted-file-fail-closed');
    assert.deepEqual(verdict.hitFiles, changedFiles);
  } finally {
    cleanup(root);
  }
});

test('resolveAppReachabilityVerdict: a safety-net violation falls back to conservative "changed"', async () => {
  const root = makeTempRepo('reachability-verdict-safety-net-');
  try {
    pr1689Fixture(root);
    writeFiles(root, {
      'packages/web-core/src/riskyLoader.js': 'export function load(name) {\n  return import(name);\n}\n',
    });
    const changedFiles = ['packages/web-core/src/services/storefrontCatalogService.js'];
    const verdict = await resolveAppReachabilityVerdict(root, 'dgfy-storefront', changedFiles, { fileExistsAtRef: alwaysExists });
    assert.equal(verdict.applicable, true);
    assert.equal(verdict.safetyNetPassed, false);
    assert.equal(verdict.changed, true);
    assert.equal(verdict.code, 'safety-net-tripped');
    assert.ok(verdict.violations.length > 0);
  } finally {
    cleanup(root);
  }
});

test('resolveAppReachabilityVerdict: an unexpected error (e.g. a missing entry file) is caught and degrades to conservative "changed", never throws', async () => {
  const root = makeTempRepo('reachability-verdict-error-fail-closed-');
  try {
    // No apps/dgfy-ims/src/main.jsx written at all -- computeAppReachableModules() throws for a
    // missing entry file; resolveAppReachabilityVerdict() must catch that and fail closed, not
    // propagate it, matching the removed computeReachabilityShadowVerdict's own "never throws"
    // contract (now centralized here so every consumer gets it for free).
    writeFiles(root, { 'packages/web-core/src/reachable.js': 'export default {};\n' });
    const verdict = await resolveAppReachabilityVerdict(root, 'dgfy-ims', ['packages/web-core/src/reachable.js'], { fileExistsAtRef: alwaysExists });
    assert.equal(verdict.applicable, true);
    assert.equal(verdict.changed, true);
    assert.equal(verdict.code, 'reachability-error-fail-closed');
    assert.equal(verdict.safetyNetPassed, false);
  } finally {
    cleanup(root);
  }
});

test('resolveAppReachabilityVerdict: throws immediately when fileExistsAtRef is not a function (caller-programming-error, not a runtime data condition)', async () => {
  const root = makeTempRepo('reachability-verdict-missing-callback-');
  try {
    pr1689Fixture(root);
    await assert.rejects(
      () => resolveAppReachabilityVerdict(root, 'dgfy-ims', ['packages/web-core/src/services/storefrontCatalogService.js'], {}),
      /fileExistsAtRef is required/,
    );
  } finally {
    cleanup(root);
  }
});
