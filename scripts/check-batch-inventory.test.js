const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  BatchInventoryError,
  checkBatchInventory,
} = require('./check-batch-inventory');

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-inventory-'));
  runGit(root, ['init']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Batch Inventory Test']);
  writeFile(root, 'README.md', '# Test\n');
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-m', 'base']);
  runGit(root, ['branch', 'origin/master']);
  return root;
}

test('generates a ship-ready inventory for non-payment changes', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'docs/ops/example.md', '# Example\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'docs']);

    const { inventory, markdown } = checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      write: false,
      requireApprovedPayments: false,
      requireShip: true,
    }, silentLogger);

    assert.equal(inventory.status, 'pass');
    assert.equal(inventory.batches[0].verdict, 'ship');
    assert.match(markdown, /Batch Inventory/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('blocks payment-sensitive changes without explicit approval', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'docs/features/PAYMONGO_QRPH_COMMERCE_PAYMENTS.md', '# PayMongo\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'payment']);

    assert.throws(
      () => checkBatchInventory({
        projectRoot: root,
        base: 'origin/master',
        head: 'HEAD',
        write: false,
        requireApprovedPayments: false,
        requireShip: true,
      }, silentLogger),
      (error) => error instanceof BatchInventoryError && /payment-sensitive/.test(error.message)
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('writes inventory and markdown artifacts', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'scripts/example.js', 'console.log("ok");\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'script']);

    const inventoryPath = path.join(root, '.tmp/release-gates/inventory.json');
    const markdownPath = path.join(root, '.tmp/release-gates/inventory.md');
    checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      inventoryPath,
      markdownPath,
      write: true,
      requireApprovedPayments: false,
      requireShip: true,
    }, silentLogger);

    assert.equal(fs.existsSync(inventoryPath), true);
    assert.equal(fs.existsSync(markdownPath), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
