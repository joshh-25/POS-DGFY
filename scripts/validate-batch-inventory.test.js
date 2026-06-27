const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { checkBatchInventory } = require('./check-batch-inventory');
const { validateBatchInventoryFile } = require('./validate-batch-inventory');

const silentLogger = { log() {}, warn() {}, error() {} };

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return (result.stdout || '').trim();
}

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-batch-inventory-'));
  runGit(root, ['init']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Batch Inventory Validator Test']);
  writeFile(root, 'README.md', '# Test\n');
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-m', 'base']);
  runGit(root, ['branch', 'origin/master']);
  return root;
}

test('fails closed when inventory artifact is missing', () => {
  const root = makeRepo();
  try {
    assert.throws(
      () => validateBatchInventoryFile({
        projectRoot: root,
        inventoryPath: '.tmp/release-gates/missing/batch_inventory.json',
        requireShip: true,
      }, silentLogger),
      /Batch inventory is missing/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validates exact changed-file coverage', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'scripts/release-example.js', 'console.log("ok");\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'release script']);

    const inventoryPath = path.join(root, '.tmp/release-gates/test/batch_inventory.json');
    checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      inventoryPath,
      write: true,
      requireApprovedPayments: false,
      requireShip: true,
    }, silentLogger);

    const inventory = validateBatchInventoryFile({
      projectRoot: root,
      inventoryPath,
      base: 'origin/master',
      head: 'HEAD',
      requireShip: true,
    }, silentLogger);

    assert.equal(inventory.status, 'pass');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects slice inventories that omit a changed file', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'docs/ops/a.md', '# A\n');
    writeFile(root, 'docs/ops/b.md', '# B\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'docs']);

    const inventoryPath = path.join(root, '.tmp/release-gates/test/batch_inventory.json');
    const { inventory } = checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      write: false,
      requireApprovedPayments: false,
      requireShip: true,
    }, silentLogger);
    inventory.release_slices[0].included_files = ['docs/ops/a.md'];
    fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));

    assert.throws(
      () => validateBatchInventoryFile({
        projectRoot: root,
        inventoryPath,
        base: 'origin/master',
        head: 'HEAD',
        requireShip: true,
      }, silentLogger),
      /changed file is not mapped/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
