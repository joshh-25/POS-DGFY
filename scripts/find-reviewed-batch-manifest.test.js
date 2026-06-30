const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.resolve(__dirname, 'find-reviewed-batch-manifest.js');

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return (result.stdout || '').trim();
}

function git(cwd, args) {
  return run(cwd, 'git', args);
}

function write(root, relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewed-manifest-finder-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Reviewed Manifest Test']);
  write(root, 'README.md', '# Test\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  git(root, ['branch', 'origin/master']);
  return root;
}

function manifest(files) {
  return `${JSON.stringify({
    schema: 'sku-reviewed-batch-manifest/v1',
    review_status: 'reviewed',
    reviewed_by: 'release reviewer',
    reviewed_at: '2026-06-30T00:00:00.000Z',
    source_pr: 'test',
    release_slices: [{
      id: 'test',
      slice_name: 'Test slice',
      included_files: files,
    }],
  }, null, 2)}\n`;
}

test('returns a single changed reviewed manifest', () => {
  const root = makeRepo();
  try {
    write(root, 'docs/releases/batches/one.json', manifest(['docs/releases/batches/one.json']));
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'one manifest']);
    const output = run(root, process.execPath, [scriptPath, '--base', 'origin/master', '--head', 'HEAD']);
    assert.equal(output, 'docs/releases/batches/one.json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selects the aggregate manifest when multiple manifests changed', () => {
  const root = makeRepo();
  try {
    write(root, 'scripts/change.js', 'module.exports = true;\n');
    write(root, 'docs/releases/batches/source.json', manifest(['docs/releases/batches/source.json']));
    write(root, 'docs/releases/batches/aggregate.json', manifest([
      'docs/releases/batches/aggregate.json',
      'docs/releases/batches/source.json',
      'scripts/change.js',
    ]));
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'aggregate manifest']);
    const output = run(root, process.execPath, [scriptPath, '--base', 'origin/master', '--head', 'HEAD']);
    assert.equal(output, 'docs/releases/batches/aggregate.json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when multiple manifests changed and none covers the full diff', () => {
  const root = makeRepo();
  try {
    write(root, 'scripts/change.js', 'module.exports = true;\n');
    write(root, 'docs/releases/batches/source.json', manifest(['docs/releases/batches/source.json']));
    write(root, 'docs/releases/batches/other.json', manifest(['docs/releases/batches/other.json']));
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'ambiguous manifests']);
    const result = spawnSync(process.execPath, [scriptPath, '--base', 'origin/master', '--head', 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly one must cover the full candidate diff/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
