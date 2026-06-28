#!/usr/bin/env node

const { spawnSync } = require('child_process');

function fail(message) {
  console.error(`[reviewed-batch-manifest] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let base = process.env.BATCH_INVENTORY_BASE || '';
let head = process.env.BATCH_INVENTORY_HEAD || process.env.RELEASE_TARGET_SHA || '';
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--base') base = args[++index] || '';
  else if (args[index] === '--head') head = args[++index] || '';
  else fail(`unknown argument: ${args[index]}`);
}
if (!base || !head) fail('--base and --head are required');

const mergeBase = spawnSync('git', ['merge-base', base, head], { encoding: 'utf8', shell: false });
if (mergeBase.status !== 0) fail((mergeBase.stderr || mergeBase.stdout).trim());
const diff = spawnSync('git', ['diff', '--name-only', `${mergeBase.stdout.trim()}...${head}`, '--', 'docs/releases/batches/*.json'], { encoding: 'utf8', shell: false });
if (diff.status !== 0) fail((diff.stderr || diff.stdout).trim());
const manifests = diff.stdout.split(/\r?\n/).filter(Boolean);
if (manifests.length !== 1) fail(`candidate must change exactly one reviewed batch manifest; found=${manifests.length}`);
process.stdout.write(`${manifests[0]}\n`);
