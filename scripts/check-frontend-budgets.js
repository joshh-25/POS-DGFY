#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const assetsDir = path.join(projectRoot, 'frontend', 'dist', 'assets');

const fail = (message) => {
  console.error(`[frontend-budgets] FAIL: ${message}`);
  process.exit(1);
};

if (!fs.existsSync(assetsDir)) {
  fail('Missing frontend/dist/assets. Run `npm run build:frontend` first.');
}

const jsFiles = fs.readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const fullPath = path.join(assetsDir, name);
    const size = fs.statSync(fullPath).size;
    return { name, size };
  });

const routeBudgets = [
  { prefix: 'Login-', limitKb: 20 },
  { prefix: 'POSCheckoutTerminal-', limitKb: 35 },
  { prefix: 'POSPage-', limitKb: 10 },
  { prefix: 'TerminalPage-', limitKb: 15 },
  { prefix: 'SalesPage-', limitKb: 20 }
];

const toKb = (bytes) => Number((bytes / 1024).toFixed(2));
const errors = [];
const warnings = [];

const findByPrefix = (prefix) => jsFiles.find((f) => f.name.startsWith(prefix));

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
  if (chunk.sizeKb > 450) {
    warnings.push(`Very large chunk detected: ${chunk.name} (${chunk.sizeKb}KB)`);
  }
}

console.log('[frontend-budgets] Route chunk budget check');
for (const budget of routeBudgets) {
  const match = findByPrefix(budget.prefix);
  if (!match) {
    console.log(`- ${budget.prefix} : missing`);
  } else {
    console.log(`- ${match.name} : ${toKb(match.size)}KB / ${budget.limitKb}KB`);
  }
}

console.log('[frontend-budgets] Largest chunks');
largestChunks.forEach((chunk) => {
  console.log(`- ${chunk.name} : ${chunk.sizeKb}KB`);
});

if (warnings.length > 0) {
  warnings.forEach((line) => console.warn(`[frontend-budgets] WARN: ${line}`));
}

if (errors.length > 0) {
  errors.forEach((line) => console.error(`[frontend-budgets] ERROR: ${line}`));
  process.exit(1);
}

console.log('[frontend-budgets] PASS');
