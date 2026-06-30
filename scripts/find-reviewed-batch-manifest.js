#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
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
if (manifests.length === 0) fail('candidate must change at least one reviewed batch manifest');
if (manifests.length === 1) {
  process.stdout.write(`${manifests[0]}\n`);
  process.exit(0);
}

const changedFiles = spawnSync('git', ['diff', '--name-only', `${mergeBase.stdout.trim()}...${head}`], { encoding: 'utf8', shell: false });
if (changedFiles.status !== 0) fail((changedFiles.stderr || changedFiles.stdout).trim());
const expectedFiles = new Set(changedFiles.stdout.split(/\r?\n/).filter(Boolean));

function manifestFiles(manifestPath) {
  const absolutePath = path.resolve(process.cwd(), manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(`reviewed batch manifest is invalid JSON: ${manifestPath}: ${error.message}`);
  }
  if (manifest.schema !== 'sku-reviewed-batch-manifest/v1') return null;
  const files = new Set();
  for (const slice of manifest.release_slices || []) {
    for (const file of slice.included_files || []) files.add(file);
  }
  return files;
}

function coversExactly(files) {
  if (!files || files.size !== expectedFiles.size) return false;
  for (const file of expectedFiles) {
    if (!files.has(file)) return false;
  }
  return true;
}

const exactCoverageManifests = manifests.filter((manifestPath) => coversExactly(manifestFiles(manifestPath)));
if (exactCoverageManifests.length !== 1) {
  fail(`candidate changed ${manifests.length} reviewed batch manifests; exactly one must cover the full candidate diff, found=${exactCoverageManifests.length}`);
}
process.stdout.write(`${exactCoverageManifests[0]}\n`);
