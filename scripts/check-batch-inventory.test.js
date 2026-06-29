const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { BatchInventoryError, checkBatchInventory } = require('./check-batch-inventory');
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-inventory-v2-'));
  runGit(root, ['init']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Batch Inventory Test']);
  writeFile(root, 'README.md', '# Test\n');
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-m', 'base']);
  runGit(root, ['branch', 'origin/master']);
  return root;
}

function createReviewedManifest(root, mutate = (manifest) => manifest) {
  const manifestPath = 'docs/releases/batches/test-release.json';
  writeFile(root, manifestPath, '{}\n');
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '--amend', '--no-edit']);
  const { inventory: draft } = checkBatchInventory({ projectRoot: root, base: 'origin/master', head: 'HEAD', write: false, requireShip: false }, silentLogger);
  const manifest = mutate({
    schema: 'sku-reviewed-batch-manifest/v1',
    review_status: 'reviewed',
    reviewed_by: 'release-owner',
    reviewed_at: '2026-06-28T00:00:00.000Z',
    source_pr: '24',
    release_slices: draft.release_slices.map((slice) => ({
      ...slice,
      implementation_summary: `Reviewed implementation for ${slice.id}`,
      owner_attribution: 'release-owner',
      source_branch: 'feature/test',
      source_pr: '24',
      source_type: 'developer_pr',
      completed_tests: slice.required_tests.map((command) => ({ command, status: 'pass', evidence: `https://github.com/owner/repo/actions/runs/123#${encodeURIComponent(command)}` })),
      can_ship_independently: true,
      promotion_eligibility: 'eligible',
      verdict: 'ship',
    })),
  });
  writeFile(root, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '--amend', '--no-edit']);
  return manifestPath;
}

test('draft generation never claims review or completed tests', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'scripts/change.js', 'module.exports = true;\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'change']);
    const { inventory } = checkBatchInventory({ projectRoot: root, base: 'origin/master', head: 'HEAD', write: false, requireShip: false }, silentLogger);
    assert.equal(inventory.version, 2);
    assert.equal(inventory.review_status, 'draft');
    assert.equal(inventory.status, 'blocked');
    assert.deepEqual(inventory.release_slices[0].completed_tests, []);
    assert.equal(inventory.release_slices[0].regression_risk_level, 'medium');
    assert.equal(inventory.release_slices[0].regression_warning_required, true);
    assert.match(inventory.release_slices[0].regression_warning_summary, /may regress/);
    assert.equal(Array.isArray(inventory.release_slices[0].evidence_covering_regression_risk), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('strict generation consumes a reviewed manifest with exact file coverage', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'scripts/change.js', 'module.exports = true;\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'change']);
    const reviewedManifestPath = createReviewedManifest(root);
    const { inventory } = checkBatchInventory({ projectRoot: root, base: 'origin/master', head: 'HEAD', reviewedManifestPath, write: false, requireShip: true }, silentLogger);
    assert.equal(inventory.status, 'pass');
    assert.equal(inventory.review_status, 'reviewed');
    assert.equal(inventory.release_slices.every((slice) => slice.regression_warning_summary), true);
    assert.equal(new Set(inventory.release_slices.flatMap((slice) => slice.included_files)).size, inventory.changed_file_count);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects generated placeholder summaries', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'scripts/change.js', 'module.exports = true;\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'change']);
    const reviewedManifestPath = createReviewedManifest(root, (manifest) => {
      manifest.release_slices[0].implementation_summary = 'Generated placeholder summary';
      return manifest;
    });
    assert.throws(
      () => checkBatchInventory({ projectRoot: root, base: 'origin/master', head: 'HEAD', reviewedManifestPath, write: false, requireShip: true }, silentLogger),
      (error) => error instanceof BatchInventoryError && /reviewed implementation_summary/.test(error.message)
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('payment-sensitive inventory remains flagged for separate controller authorization', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'backend/src/modules/payments/example.js', 'module.exports = true;\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'payment']);
    const reviewedManifestPath = createReviewedManifest(root);
    const { inventory } = checkBatchInventory({ projectRoot: root, base: 'origin/master', head: 'HEAD', reviewedManifestPath, write: false, requireShip: true }, silentLogger);
    assert.equal(inventory.payment_sensitive, true);
    assert.equal(inventory.payment_authorization_required, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

module.exports = { makeRepo, createReviewedManifest, writeFile, runGit, silentLogger };
