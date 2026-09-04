const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  BudgetGateError,
  checkFrontendBudgets,
  parseArgs,
} = require('./check-frontend-budgets');

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-budget-gate-'));
}

// Matches REQUIRED_APP_ASSET_DIRS in check-frontend-budgets.js (issue #322
// Phase 6 -- each app builds inside its own standalone package now).
const APP_DIR = {
  skupervisor: 'apps/dgfy-ims',
  pos: 'apps/dgfy-pos',
  store: 'apps/dgfy-storefront',
};

function writeAsset(projectRoot, app, name, sizeBytes, mtime = new Date()) {
  const dir = path.join(projectRoot, APP_DIR[app], 'dist', 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, Buffer.alloc(sizeBytes, 1));
  fs.utimesSync(filePath, mtime, mtime);
  return filePath;
}

function writePassingAssets(projectRoot, mtime = new Date()) {
  writeAsset(projectRoot, 'skupervisor', 'Login-test.js', 9 * 1024, mtime);
  writeAsset(projectRoot, 'skupervisor', 'SkupervisorPOSCheckoutTerminal-test.js', 60 * 1024, mtime);
  writeAsset(projectRoot, 'skupervisor', 'SkupervisorPOSPage-test.js', 50 * 1024, mtime);
  writeAsset(projectRoot, 'skupervisor', 'TerminalPage-test.js', 30 * 1024, mtime);
  writeAsset(projectRoot, 'skupervisor', 'SalesPage-test.js', 10 * 1024, mtime);
  writeAsset(projectRoot, 'pos', 'POSCheckoutTerminal-test.js', 60 * 1024, mtime);
  writeAsset(projectRoot, 'store', 'vendor-maplibre-test.js', 100 * 1024, mtime);
}

test('prebuilt mode requires an explicit freshness timestamp', () => {
  assert.throws(
    () => parseArgs(['--skip-build']),
    (error) => error instanceof BudgetGateError && error.code === 'PREBUILT_FRESHNESS_REQUIRED'
  );
});

test('fails before budget verdict when required multi-app assets are missing', async () => {
  const projectRoot = makeTempProject();
  try {
    writeAsset(projectRoot, 'skupervisor', 'Login-test.js', 9 * 1024);
    await assert.rejects(
      () => checkFrontendBudgets({
        projectRoot,
        skipBuild: true,
        builtAfterMs: Date.now() - 5000,
        logger: silentLogger,
      }),
      (error) => error instanceof BudgetGateError && error.code === 'MISSING_ASSETS'
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('rejects stale prebuilt route chunks with a clear freshness failure', async () => {
  const projectRoot = makeTempProject();
  try {
    const staleMtime = new Date('2026-01-01T00:00:00.000Z');
    writePassingAssets(projectRoot, staleMtime);
    await assert.rejects(
      () => checkFrontendBudgets({
        projectRoot,
        skipBuild: true,
        builtAfterMs: Date.parse('2026-06-01T00:00:00.000Z'),
        logger: silentLogger,
      }),
      (error) => error instanceof BudgetGateError
        && error.code === 'BUDGETS_FAILED'
        && error.errors.some((message) => message.includes('is stale'))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('passes fresh prebuilt assets and writes a reusable budget report', async () => {
  const projectRoot = makeTempProject();
  try {
    const freshMtime = new Date();
    writePassingAssets(projectRoot, freshMtime);
    const report = await checkFrontendBudgets({
      projectRoot,
      skipBuild: true,
      builtAfterMs: freshMtime.getTime() - 5000,
      reportPath: path.join('.tmp', 'release-gates', 'test-sha', 'frontend-budgets', 'frontend_budget_report.json'),
      logger: silentLogger,
    });

    const reportPath = path.join(projectRoot, report.report_path);
    const persisted = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.status, 'pass');
    assert.equal(persisted.status, 'pass');
    assert.equal(persisted.mode, 'prebuilt');
    assert.equal(persisted.budgets.length, 6);
    assert.equal(persisted.required_asset_dirs.length, 3);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
