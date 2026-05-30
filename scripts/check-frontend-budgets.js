#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const legacyAssetsDir = path.join(projectRoot, 'frontend', 'dist', 'assets');
const multiAppAssetsDirs = [
  { app: 'skupervisor', dir: path.join(projectRoot, 'dist-apps', 'skupervisor', 'assets') },
  { app: 'pos', dir: path.join(projectRoot, 'dist-apps', 'pos', 'assets') },
  { app: 'store', dir: path.join(projectRoot, 'dist-apps', 'store', 'assets') }
];

const fail = (message) => {
  console.error(`[frontend-budgets] FAIL: ${message}`);
  process.exit(1);
};

const existingMultiAppAssetsDirs = multiAppAssetsDirs.filter(({ dir }) => fs.existsSync(dir));
const existingAssetsDirs = existingMultiAppAssetsDirs.length > 0
  ? existingMultiAppAssetsDirs
  : [{ app: 'legacy', dir: legacyAssetsDir }].filter(({ dir }) => fs.existsSync(dir));

if (existingAssetsDirs.length === 0) {
  fail('Missing built assets. Run `npm run build:frontend` or `npm -C frontend run build:all` first.');
}

const jsFiles = existingAssetsDirs.flatMap(({ app, dir: assetsDir }) => fs.readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const fullPath = path.join(assetsDir, name);
    const stats = fs.statSync(fullPath);
    return {
      name,
      app,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      source: path.relative(projectRoot, fullPath)
    };
  }));

const routeBudgets = [
  { app: 'skupervisor', prefix: 'Login-', limitKb: 20 },
  // Rebased 2026-05-30 after PR #11 split the POS surfaces and the shared checkout
  // terminal settled at 62.2KiB in the SKUpervisor production build.
  { app: 'skupervisor', prefix: 'POSCheckoutTerminal-', limitKb: 64 },
  // Standalone POS owns the cashier terminal route after PR #11. Keep it separately
  // budgeted so the split app cannot drift behind the admin-only surface.
  { app: 'pos', prefix: 'POSCheckoutTerminal-', limitKb: 67 },
  // PR #11 renamed the admin POS route chunk from POSPage-* to SkupervisorPOSPage-*.
  { app: 'skupervisor', prefix: 'SkupervisorPOSPage-', limitKb: 58 },
  // Rebased 2026-05-05 after barcode scan metadata was added to terminal flows.
  { app: 'skupervisor', prefix: 'TerminalPage-', limitKb: 35 },
  { app: 'skupervisor', prefix: 'SalesPage-', limitKb: 20 }
];

const toKb = (bytes) => Number((bytes / 1024).toFixed(2));
const errors = [];
const warnings = [];

const formatBudgetName = (budget) => `${budget.app}:${budget.prefix}`;

const findByBudget = (budget) => {
  const matches = jsFiles
    .filter((f) => f.name.startsWith(budget.prefix) && f.app === budget.app)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0];
};

for (const budget of routeBudgets) {
  const match = findByBudget(budget);
  if (!match) {
    errors.push(`Missing expected chunk "${formatBudgetName(budget)}"`);
    continue;
  }

  const sizeKb = toKb(match.size);
  if (sizeKb > budget.limitKb) {
    errors.push(`${match.name} is ${sizeKb}KB (limit ${budget.limitKb}KB)`);
  }
}

const largestChunks = [...jsFiles]
  .sort((a, b) => b.size - a.size)
  .slice(0, 3)
  .map((f) => ({ ...f, sizeKb: toKb(f.size) }));

for (const chunk of largestChunks) {
  if (chunk.name.startsWith('vendor-maplibre-') && chunk.sizeKb <= 1100) {
    continue;
  }
  if (chunk.name.startsWith('MapPinPicker-') && chunk.sizeKb <= 1100) {
    continue;
  }
  if (chunk.sizeKb > 950) {
    warnings.push(`Very large chunk detected: ${chunk.name} (${chunk.sizeKb}KB)`);
  }
}

console.log('[frontend-budgets] Route chunk budget check');
for (const budget of routeBudgets) {
  const match = findByBudget(budget);
  if (!match) {
    console.log(`- ${formatBudgetName(budget)} : missing`);
  } else {
    console.log(`- ${formatBudgetName(budget)} -> ${match.name} (${match.source}) : ${toKb(match.size)}KB / ${budget.limitKb}KB`);
  }
}

console.log('[frontend-budgets] Largest chunks');
largestChunks.forEach((chunk) => {
  console.log(`- ${chunk.name} (${chunk.source}) : ${chunk.sizeKb}KB`);
});

if (warnings.length > 0) {
  warnings.forEach((line) => console.warn(`[frontend-budgets] WARN: ${line}`));
}

if (errors.length > 0) {
  errors.forEach((line) => console.error(`[frontend-budgets] ERROR: ${line}`));
  process.exit(1);
}

console.log('[frontend-budgets] PASS');
