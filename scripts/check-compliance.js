#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const forwardedArgs = process.argv.slice(2);
const checks = [
  'check-compliance-impact.js',
  'check-compliance-api-contracts.js'
];

for (const check of checks) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, check), ...forwardedArgs],
    { cwd: repoRoot, stdio: 'inherit' }
  );

  if (result.error) {
    console.error(`[check:compliance] Failed to run ${check}: ${result.error.message}`);
    process.exitCode = 1;
    break;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
