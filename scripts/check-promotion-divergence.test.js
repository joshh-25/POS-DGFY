const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  checkPromotionDivergence,
  parseArgs,
  PromotionDivergenceError,
} = require('./check-promotion-divergence');

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};

function makeTempProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-divergence-'));
  git(projectRoot, ['init', '-b', 'develop']);
  git(projectRoot, ['config', 'user.email', 'promotion-divergence@example.test']);
  git(projectRoot, ['config', 'user.name', 'Promotion Divergence Test']);
  return projectRoot;
}

function git(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
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

// Builds a "Merge pull request #N from Sieitzz/<branch>" merge commit onto `into`,
// merging `branch`, mirroring GitHub's own standard merge-commit subject format that
// auditProvenance()'s MERGE_SUBJECT_RE parses.
function mergeAsPr(projectRoot, into, branch, prNumber) {
  git(projectRoot, ['switch', into]);
  git(projectRoot, [
    'merge', '--no-ff', branch,
    '-m', `Merge pull request #${prNumber} from Sieitzz/${branch}`,
  ]);
}

test('parses required refs and optional report argument', () => {
  const options = parseArgs(['--base', 'origin/staging', '--head', 'origin/develop', '--report', '.tmp/report.json']);
  assert.equal(options.base, 'origin/staging');
  assert.equal(options.head, 'origin/develop');
  assert.equal(options.reportPath, '.tmp/report.json');
});

test('parseArgs throws on missing --base/--head', () => {
  assert.throws(() => parseArgs(['--head', 'origin/develop']), PromotionDivergenceError);
  assert.throws(() => parseArgs(['--base', 'origin/staging']), PromotionDivergenceError);
});

test('clean merge, no unique-to-base commits -> pass, empty everything', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'staging']);
    git(projectRoot, ['switch', 'develop']);

    const report = checkPromotionDivergence({
      projectRoot,
      base: 'staging',
      head: 'develop',
    }, silentLogger);

    assert.equal(report.status, 'pass');
    assert.equal(report.mergeable, true);
    assert.deepEqual(report.conflicted_files, []);
    assert.deepEqual(report.unattributed_merges, []);
    assert.deepEqual(report.non_pr_merges, []);
    assert.deepEqual(report.direct_staging_commits, []);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('clean merge, one unique-to-base commit on an allowed-pattern merge -> pass (still)', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'staging']);

    git(projectRoot, ['switch', '-c', 'to-staging/2026-09-07-01']);
    writeFile(projectRoot, 'candidate.txt', 'candidate content\n');
    commitAll(projectRoot, 'ship candidate');
    mergeAsPr(projectRoot, 'staging', 'to-staging/2026-09-07-01', 1700);

    git(projectRoot, ['switch', 'develop']);

    const report = checkPromotionDivergence({
      projectRoot,
      base: 'staging',
      head: 'develop',
    }, silentLogger);

    assert.equal(report.status, 'pass');
    assert.equal(report.mergeable, true);
    assert.deepEqual(report.unattributed_merges, []);
    assert.deepEqual(report.non_pr_merges, []);
    assert.deepEqual(report.direct_staging_commits, []);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('clean merge, one unique-to-base commit on a disallowed/non-PR merge -> warn', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'staging']);

    // Disallowed branch pattern, but still a GitHub-shaped PR merge subject.
    git(projectRoot, ['switch', '-c', 'random-branch']);
    writeFile(projectRoot, 'random.txt', 'random content\n');
    commitAll(projectRoot, 'random change');
    mergeAsPr(projectRoot, 'staging', 'random-branch', 1701);

    // A hand-resolved, non-PR-shaped merge commit.
    git(projectRoot, ['switch', '-c', 'manual-fix']);
    writeFile(projectRoot, 'manual.txt', 'manual content\n');
    commitAll(projectRoot, 'manual change');
    git(projectRoot, ['switch', 'staging']);
    git(projectRoot, ['merge', '--no-ff', 'manual-fix', '-m', 'Manually resolved conflict merge']);

    git(projectRoot, ['switch', 'develop']);

    const report = checkPromotionDivergence({
      projectRoot,
      base: 'staging',
      head: 'develop',
    }, silentLogger);

    assert.equal(report.status, 'warn');
    assert.equal(report.mergeable, true);
    assert.equal(report.unattributed_merges.length, 1);
    assert.equal(report.unattributed_merges[0].branch, 'random-branch');
    assert.equal(report.unattributed_merges[0].pr_number, 1701);
    assert.equal(report.non_pr_merges.length, 1);
    assert.equal(report.non_pr_merges[0].subject, 'Manually resolved conflict merge');
    assert.deepEqual(report.direct_staging_commits, []);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('clean merge, one direct single-parent commit made straight on staging -> warn (RF-1)', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);
    git(projectRoot, ['switch', '-c', 'staging']);

    // A direct commit made straight on staging -- no merge, no branch to attribute.
    // This is exactly the case `--first-parent --merges` silently drops (pr-reviewer,
    // PR #1704 RF-1): reproduced live as `status: pass` with no warning before the fix.
    writeFile(projectRoot, 'hotfix.txt', 'direct staging edit\n');
    commitAll(projectRoot, 'direct edit straight on staging');

    git(projectRoot, ['switch', 'develop']);

    const report = checkPromotionDivergence({
      projectRoot,
      base: 'staging',
      head: 'develop',
    }, silentLogger);

    assert.equal(report.status, 'warn');
    assert.equal(report.mergeable, true);
    assert.deepEqual(report.unattributed_merges, []);
    assert.deepEqual(report.non_pr_merges, []);
    assert.equal(report.direct_staging_commits.length, 1);
    assert.equal(report.direct_staging_commits[0].subject, 'direct edit straight on staging');
    assert.ok(report.direct_staging_commits[0].sha);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('real conflict -> fail, exit non-zero via status, conflicted_files has the one path', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);

    git(projectRoot, ['switch', '-c', 'staging']);
    writeFile(projectRoot, 'shared.txt', 'staging change\n');
    commitAll(projectRoot, 'staging edits shared.txt');

    git(projectRoot, ['switch', 'develop']);
    writeFile(projectRoot, 'shared.txt', 'develop change\n');
    commitAll(projectRoot, 'develop edits shared.txt');

    const report = checkPromotionDivergence({
      projectRoot,
      base: 'staging',
      head: 'develop',
    }, silentLogger);

    assert.equal(report.status, 'fail');
    assert.equal(report.mergeable, false);
    assert.equal(report.conflicted_files.length, 1);
    assert.equal(report.conflicted_files[0].path, 'shared.txt');
    assert.ok(report.conflicted_files[0].base_last_commit);
    assert.ok(report.conflicted_files[0].head_last_commit);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('a bad ref throws with git stderr surfaced, never silently "clean"', () => {
  const projectRoot = makeTempProject();
  try {
    initBase(projectRoot);

    assert.throws(
      () => checkPromotionDivergence({
        projectRoot,
        base: 'staging',
        head: 'does-not-exist',
      }, silentLogger),
      PromotionDivergenceError,
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
