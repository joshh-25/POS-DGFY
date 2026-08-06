const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { checkBatchInventory } = require('./check-batch-inventory');
const { checkRegressionRisk } = require('./check-regression-risk');

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regression-risk-'));
  runGit(root, ['init']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Regression Risk Test']);
  writeFile(root, 'README.md', '# Test\n');
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-m', 'base']);
  runGit(root, ['branch', 'origin/master']);
  return root;
}

test('generates JSON and markdown regression risk notice artifacts', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'apps/dgfy-web/apps/store/src/discoveryMap.js', 'export const ok = true;\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'storefront discovery']);

    const inventoryPath = path.join(root, '.tmp/release-gates/test/batch_inventory.json');
    const outputPath = path.join(root, '.tmp/release-gates/test/regression_risk_notice.json');
    const markdownPath = path.join(root, '.tmp/release-gates/test/regression_risk_notice.md');

    checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      inventoryPath,
      write: true,
      requireShip: false,
    }, silentLogger);

    const { notice, markdown } = checkRegressionRisk({
      projectRoot: root,
      inventoryPath,
      outputPath,
      markdownPath,
    }, silentLogger);

    assert.equal(notice.status, 'pass');
    assert.equal(notice.highest_regression_risk_level, 'high');
    assert.equal(fs.existsSync(outputPath), true);
    assert.equal(fs.existsSync(markdownPath), true);
    assert.match(markdown, /Regression Risk Notice/);
    assert.match(markdown, /Storefront discovery/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('renders structured evidence entries in markdown without object placeholders', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'scripts/deploy.js', 'console.log("deploy");\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'deploy']);

    const inventoryPath = path.join(root, '.tmp/release-gates/test/batch_inventory.json');
    const { inventory } = checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      write: false,
      requireShip: false,
    }, silentLogger);

    inventory.release_slices[0].evidence_covering_regression_risk = [
      {
        command: 'npm run test:release-controller',
        status: 'pass',
        evidence: 'controller fail-closed tests passed',
      },
    ];

    fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));

    const { markdown } = checkRegressionRisk({
      projectRoot: root,
      inventoryPath,
      outputPath: path.join(root, '.tmp/release-gates/test/regression_risk_notice.json'),
      markdownPath: path.join(root, '.tmp/release-gates/test/regression_risk_notice.md'),
    }, silentLogger);

    assert.doesNotMatch(markdown, /\[object Object\]/);
    assert.match(markdown, /command: npm run test:release-controller; status: pass; evidence: controller fail-closed tests passed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('renders mixed notice lists deterministically', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'scripts/release-note.js', 'console.log("release");\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'release note']);

    const inventoryPath = path.join(root, '.tmp/release-gates/test/batch_inventory.json');
    const { inventory } = checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      write: false,
      requireShip: false,
    }, silentLogger);

    inventory.release_slices[0].evidence_covering_regression_risk = [
      ['nested evidence', { name: 'fallback', detail: 'rendered safely' }],
      { unexpected: 'shape', still: 'json' },
    ];
    inventory.release_slices[0].evidence_gaps = [
      { name: 'qa', detail: 'isolated QA is separate from Markdown rendering' },
    ];
    inventory.release_slices[0].rollback_or_monitoring_notes = [
      ['regenerate notice', 'scan Markdown'],
    ];

    fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));

    const { markdown } = checkRegressionRisk({
      projectRoot: root,
      inventoryPath,
      outputPath: path.join(root, '.tmp/release-gates/test/regression_risk_notice.json'),
      markdownPath: path.join(root, '.tmp/release-gates/test/regression_risk_notice.md'),
    }, silentLogger);

    assert.doesNotMatch(markdown, /\[object Object\]/);
    assert.match(markdown, /nested evidence; name: fallback; detail: rendered safely/);
    assert.match(markdown, /\{"unexpected":"shape","still":"json"\}/);
    assert.match(markdown, /name: qa; detail: isolated QA is separate from Markdown rendering/);
    assert.match(markdown, /regenerate notice; scan Markdown/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed when a slice omits required regression risk fields', () => {
  const root = makeRepo();
  try {
    writeFile(root, 'docs/ops/example.md', '# Example\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'docs']);

    const inventoryPath = path.join(root, '.tmp/release-gates/test/batch_inventory.json');
    const { inventory } = checkBatchInventory({
      projectRoot: root,
      base: 'origin/master',
      head: 'HEAD',
      write: false,
      requireShip: false,
    }, silentLogger);

    delete inventory.release_slices[0].regression_warning_summary;
    fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));

    assert.throws(
      () => checkRegressionRisk({
        projectRoot: root,
        inventoryPath,
        outputPath: path.join(root, '.tmp/release-gates/test/regression_risk_notice.json'),
      }, silentLogger),
      /regression_warning_summary/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
