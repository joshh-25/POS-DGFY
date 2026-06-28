const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { checkBatchInventory } = require('./check-batch-inventory');
const { validateBatchInventoryFile } = require('./validate-batch-inventory');
const silentLogger = { log() {}, warn() {}, error() {} };

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-inventory-v2-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Inventory Test']);
  write(root, 'README.md', '# base\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  git(root, ['branch', 'origin/master']);
  write(root, 'scripts/change.js', 'module.exports = true;\n');
  write(root, 'docs/releases/batches/release.json', '{}\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'release']);
  const draft = checkBatchInventory({ projectRoot: root, base: 'origin/master', head: 'HEAD', write: false, requireShip: false }, silentLogger).inventory;
  const manifest = {
    schema: 'sku-reviewed-batch-manifest/v1',
    review_status: 'reviewed',
    reviewed_by: 'owner',
    reviewed_at: '2026-06-28T00:00:00.000Z',
    source_pr: '25',
    release_slices: draft.release_slices.map((slice) => ({
      ...slice,
      implementation_summary: `Reviewed ${slice.id} implementation`,
      owner_attribution: 'owner',
      source_branch: 'feature/release',
      source_pr: '25',
      source_type: 'developer_pr',
      completed_tests: slice.required_tests.map((command) => ({ command, status: 'pass', evidence: 'https://github.com/owner/repo/actions/runs/25' })),
      can_ship_independently: true,
      promotion_eligibility: 'eligible',
      verdict: 'ship',
    })),
  };
  write(root, 'docs/releases/batches/release.json', `${JSON.stringify(manifest, null, 2)}\n`);
  git(root, ['add', '.']);
  git(root, ['commit', '--amend', '--no-edit']);
  const inventoryPath = path.join(root, '.tmp', 'batch_inventory.json');
  checkBatchInventory({ projectRoot: root, base: 'origin/master', head: 'HEAD', reviewedManifestPath: 'docs/releases/batches/release.json', inventoryPath, write: true, requireShip: true }, silentLogger);
  return { root, inventoryPath };
}

test('strict validator requires explicit base and head', () => {
  const { root, inventoryPath } = fixture();
  try {
    assert.throws(() => validateBatchInventoryFile({ projectRoot: root, inventoryPath, requireShip: true }, silentLogger), /requires --base and --head/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('strict validator accepts reviewed exact-file inventory', () => {
  const { root, inventoryPath } = fixture();
  try {
    const inventory = validateBatchInventoryFile({ projectRoot: root, inventoryPath, base: 'origin/master', head: 'HEAD', requireShip: true }, silentLogger);
    assert.equal(inventory.status, 'pass');
    assert.equal(inventory.release_slices[0].source_branch, 'feature/release');
    assert.equal(inventory.release_slices[0].source_type, 'developer_pr');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('strict validator rejects silent changed files', () => {
  const { root, inventoryPath } = fixture();
  try {
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    inventory.release_slices[0].included_files.pop();
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory));
    assert.throws(
      () => validateBatchInventoryFile({ projectRoot: root, inventoryPath, base: 'origin/master', head: 'HEAD', requireShip: true }, silentLogger),
      /changed file is not mapped/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('strict validator rejects completed-test claims without evidence', () => {
  const { root, inventoryPath } = fixture();
  try {
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    inventory.release_slices[0].completed_tests[0].evidence = 'not provided';
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory));
    assert.throws(
      () => validateBatchInventoryFile({ projectRoot: root, inventoryPath, base: 'origin/master', head: 'HEAD', requireShip: true }, silentLogger),
      /without passing evidence/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('strict validator rejects unclassified source provenance', () => {
  const { root, inventoryPath } = fixture();
  try {
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    inventory.release_slices[0].source_type = 'direct_master_without_approval';
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory));
    assert.throws(
      () => validateBatchInventoryFile({ projectRoot: root, inventoryPath, base: 'origin/master', head: 'HEAD', requireShip: true }, silentLogger),
      /invalid source_type/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
