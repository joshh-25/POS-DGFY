#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const legacyAssetsDir = path.join(projectRoot, 'frontend', 'dist', 'assets');
const multiAppAssetsDirs = [
  path.join(projectRoot, 'dist-apps', 'skupervisor', 'assets'),
  path.join(projectRoot, 'dist-apps', 'pos', 'assets'),
  path.join(projectRoot, 'dist-apps', 'store', 'assets')
];

const fail = (message) => {
  console.error(`[frontend-budgets] FAIL: ${message}`);
  process.exit(1);
};

const existingMultiAppAssetsDirs = multiAppAssetsDirs.filter((dirPath) => fs.existsSync(dirPath));
const existingAssetsDirs = existingMultiAppAssetsDirs.length > 0
  ? existingMultiAppAssetsDirs
  : [legacyAssetsDir].filter((dirPath) => fs.existsSync(dirPath));

if (existingAssetsDirs.length === 0) {
  fail('Missing built assets. Run `npm run build:frontend` or `npm -C frontend run build:all` first.');
}

const jsFiles = existingAssetsDirs.flatMap((assetsDir) => fs.readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const fullPath = path.join(assetsDir, name);
    const stats = fs.statSync(fullPath);
    return {
      name,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      source: path.relative(projectRoot, fullPath)
    };
  }));

const routeBudgets = [
  { prefix: 'Login-', limitKb: 20 },
  // Rebased 2026-04-21 after POS/compliance/location-binding feature growth.
  // Keep strict limits with minimal headroom over observed production build output.
  // Rebased 2026-05-21 after CI/local builds put the route chunk near 52.4KiB.
  { prefix: 'POSCheckoutTerminal-', limitKb: 54 },
  { prefix: 'POSPage-', limitKb: 10 },
  // Rebased 2026-05-05 after barcode scan metadata was added to terminal flows.
  { prefix: 'TerminalPage-', limitKb: 35 },
  { prefix: 'SalesPage-', limitKb: 20 }
];

const toKb = (bytes) => Number((bytes / 1024).toFixed(2));
const errors = [];
const warnings = [];

const findByPrefix = (prefix) => {
  const matches = jsFiles
    .filter((f) => f.name.startsWith(prefix))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0];
};

for (const budget of routeBudgets) {
  const match = findByPrefix(budget.prefix);
  if (!match) {
    errors.push(`Missing expected chunk with prefix "${budget.prefix}"`);
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
  if (chunk.sizeKb > 950) {
    warnings.push(`Very large chunk detected: ${chunk.name} (${chunk.sizeKb}KB)`);
  }
}

console.log('[frontend-budgets] Route chunk budget check');
for (const budget of routeBudgets) {
  const match = findByPrefix(budget.prefix);
  if (!match) {
    console.log(`- ${budget.prefix} : missing`);
  } else {
    console.log(`- ${match.name} (${match.source}) : ${toKb(match.size)}KB / ${budget.limitKb}KB`);
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
