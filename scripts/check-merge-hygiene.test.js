const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  MergeHygieneError,
  checkMergeHygiene,
  parseArgs,
} = require('./check-merge-hygiene');

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};

function makeTempProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-hygiene-'));
  git(projectRoot, ['init', '-b', 'main']);
  git(projectRoot, ['config', 'user.email', 'merge-hygiene@example.test']);
  git(projectRoot, ['config', 'user.name', 'Merge Hygiene Test']);
  return projectRoot;
}

function git(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function writeFile(projectRoot, relativePath, content) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function removeFile(projectRoot, relativePath) {
  fs.rmSync(path.join(projectRoot, relativePath), { force: true });
}

function commitAll(projectRoot, message) {
  git(projectRoot, ['add', '-A']);
  git(projectRoot, ['commit', '-m', message]);
  return git(projectRoot, ['rev-parse', 'HEAD']);
}

function initBase(projectRoot) {
  writeFile(projectRoot, 'README.md', '# Project\n');
  writeFile(projectRoot, 'shared.txt', 'base\n');
  return commitAll(projectRoot, 'base');
}

test('parses required refs and optional report/justification arguments', () => {
  const options = parseArgs([
    '--base',
    'origin/master',
    '--head',
    'HEAD',
    '--target',
    'origin/staging',
    '--report',
    '.tmp/report.json',
    '--justification',
    'docs/release/merge-hygiene/test.json',
  ]);
  assert.equal(options.base, 'origin/master');
  assert.equal(options.head, 'HEAD');
  assert.equal(options.target, 'origin/staging');
  assert.equal(options.reportPath, '.tmp/report.json');
  assert.equal(options.justificationPath, 'docs/release/merge-hygiene/test.json');
});

test('passes for a simple low-risk additive change without requiring a full manifest', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'docs/reference/example.md', 'Example\n');
    commitAll(projectRoot, 'add reference doc');

    const report = checkMergeHygiene({
      projectRoot,
      base: 'main',
      head: 'feature',
    }, silentLogger);

    assert.equal(report.status, 'pass');
    assert.deepEqual(report.added_files.map((entry) => entry.path), ['docs/reference/example.md']);
    assert.equal(report.errors.length, 0);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('reads batched git blobs when a changed path contains spaces', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'Standalone POS/README.md', 'POS notes\n');
    commitAll(projectRoot, 'add path with spaces');

    const report = checkMergeHygiene({
      projectRoot,
      base: 'main',
      head: 'feature',
    }, silentLogger);

    assert.equal(report.status, 'pass');
    assert.deepEqual(report.added_files.map((entry) => entry.path), ['Standalone POS/README.md']);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('reads target-side batched git blobs when a changed path contains spaces', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    writeFile(projectRoot, 'Target Notes/release plan.md', 'base\n');
    commitAll(projectRoot, 'add spaced target path');

    git(projectRoot, ['switch', '-c', 'target']);
    writeFile(projectRoot, 'Target Notes/release plan.md', 'target\n');
    commitAll(projectRoot, 'update spaced target path');

    git(projectRoot, ['switch', 'main']);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'Target Notes/release plan.md', 'target\n');
    commitAll(projectRoot, 'preserve spaced target path');

    const report = checkMergeHygiene({
      projectRoot,
      base: 'main',
      head: 'feature',
      target: 'target',
    }, silentLogger);

    assert.equal(report.status, 'pass');
    assert.deepEqual(
      report.target_changes_preserved.map((entry) => entry.path),
      ['Target Notes/release plan.md'],
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('passes when no target drift exists', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'target']);
    git(projectRoot, ['switch', 'main']);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'notes.txt', 'feature\n');
    commitAll(projectRoot, 'add notes');

    const report = checkMergeHygiene({
      projectRoot,
      base: 'main',
      head: 'feature',
      target: 'target',
    }, silentLogger);

    assert.equal(report.status, 'pass');
    assert.deepEqual(report.suspicious_reversions, []);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails when a branch-added file disappears without explanation', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'src/transient.js', 'export const value = 1;\n');
    commitAll(projectRoot, 'add transient file');
    removeFile(projectRoot, 'src/transient.js');
    commitAll(projectRoot, 'drop transient file');

    assert.throws(
      () => checkMergeHygiene({ projectRoot, base: 'main', head: 'feature' }, silentLogger),
      (error) => error instanceof MergeHygieneError
        && error.errors.some((message) => message.includes('src/transient.js'))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails when target-side changes are clearly reverted to merge-base content', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'target']);
    writeFile(projectRoot, 'shared.txt', 'target update\n');
    commitAll(projectRoot, 'target updates shared file');
    git(projectRoot, ['switch', 'main']);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'feature.txt', 'feature\n');
    commitAll(projectRoot, 'feature work');

    assert.throws(
      () => checkMergeHygiene({
        projectRoot,
        base: 'main',
        head: 'feature',
        target: 'target',
      }, silentLogger),
      (error) => error instanceof MergeHygieneError
        && error.errors.some((message) => message.includes('shared.txt'))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('detects target-side reversion in a merge-result commit', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'feature.txt', 'feature\n');
    commitAll(projectRoot, 'feature work');
    git(projectRoot, ['switch', 'main']);
    writeFile(projectRoot, 'shared.txt', 'target update\n');
    const targetSha = commitAll(projectRoot, 'target updates shared file');
    git(projectRoot, ['switch', 'feature']);
    git(projectRoot, ['merge', '--no-commit', 'main']);
    writeFile(projectRoot, 'shared.txt', 'base\n');
    commitAll(projectRoot, 'bad merge result drops target change');

    assert.throws(
      () => checkMergeHygiene({
        projectRoot,
        base: targetSha,
        head: 'feature',
        target: targetSha,
      }, silentLogger),
      (error) => error instanceof MergeHygieneError
        && error.errors.some((message) => message.includes('shared.txt'))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('allows intentional deletion when an approved reason is supplied', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    writeFile(projectRoot, 'docs/obsolete.md', 'obsolete\n');
    commitAll(projectRoot, 'add obsolete doc');
    git(projectRoot, ['switch', '-c', 'feature']);
    removeFile(projectRoot, 'docs/obsolete.md');
    commitAll(projectRoot, 'remove obsolete doc');
    writeFile(
      projectRoot,
      'docs/release/merge-hygiene/feature.json',
      JSON.stringify({
        version: 1,
        intentional_deletions: [
          {
            path: 'docs/obsolete.md',
            decision: 'reject',
            reason: 'The doc is superseded by the governed release workflow document.',
          },
        ],
      }, null, 2)
    );

    const report = checkMergeHygiene({
      projectRoot,
      base: 'main',
      head: 'feature',
      justificationPath: 'docs/release/merge-hygiene/feature.json',
    }, silentLogger);

    assert.equal(report.status, 'pass');
    assert.deepEqual(report.suspicious_deletions, []);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('writes a report artifact', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'docs/reference/report.md', 'Report\n');
    commitAll(projectRoot, 'add report fixture');

    const report = checkMergeHygiene({
      projectRoot,
      base: 'main',
      head: 'feature',
      reportPath: '.tmp/release-gates/test/merge_hygiene_report.json',
    }, silentLogger);

    const persisted = JSON.parse(fs.readFileSync(path.join(projectRoot, '.tmp/release-gates/test/merge_hygiene_report.json'), 'utf8'));
    assert.equal(report.status, 'pass');
    assert.equal(persisted.status, 'pass');
    assert.equal(persisted.merge_base.length, 40);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handles unresolved refs with a clear error', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    assert.throws(
      () => checkMergeHygiene({ projectRoot, base: 'missing-ref', head: 'HEAD' }, silentLogger),
      (error) => error instanceof MergeHygieneError && error.code === 'REF_NOT_FOUND'
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails when unresolved conflict markers remain', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'feature']);
    writeFile(projectRoot, 'src/conflicted.js', '<<<<<<< HEAD\ncurrent\n=======\nincoming\n>>>>>>> branch\n');
    commitAll(projectRoot, 'add conflicted file');

    assert.throws(
      () => checkMergeHygiene({ projectRoot, base: 'main', head: 'feature' }, silentLogger),
      (error) => error instanceof MergeHygieneError
        && error.errors.some((message) => message.includes('conflict marker'))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
