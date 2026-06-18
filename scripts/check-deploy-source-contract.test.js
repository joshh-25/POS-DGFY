const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  DeploySourceContractError,
  checkDeploySourceContract,
  parseArgs,
} = require('./check-deploy-source-contract');

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return (result.stdout || '').trim();
}

function writeFile(projectRoot, relativePath, content) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeRepo() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-source-contract-'));
  runGit(projectRoot, ['init']);
  runGit(projectRoot, ['config', 'user.email', 'test@example.com']);
  runGit(projectRoot, ['config', 'user.name', 'Deploy Source Contract Test']);
  writeFile(projectRoot, 'README.md', '# Test\n');
  runGit(projectRoot, ['add', 'README.md']);
  runGit(projectRoot, ['commit', '-m', 'initial']);
  const head = runGit(projectRoot, ['rev-parse', 'HEAD']);
  return { projectRoot, head };
}

test('parses target and remote match options', () => {
  const options = parseArgs([
    '--target-sha',
    'abc123',
    '--remote-ref',
    'origin/master',
    '--require-remote-match',
    '--report',
    '.tmp/source.json',
  ]);

  assert.equal(options.targetSha, 'abc123');
  assert.equal(options.remoteRef, 'origin/master');
  assert.equal(options.requireRemoteMatch, true);
  assert.equal(options.reportPath, '.tmp/source.json');
});

test('passes for clean committed HEAD', () => {
  const { projectRoot, head } = makeRepo();
  try {
    const report = checkDeploySourceContract(
      {
        projectRoot,
        targetSha: head,
        remoteRef: '',
        requireClean: true,
        requireRemoteMatch: false,
      },
      silentLogger
    );

    assert.equal(report.ok, true);
    assert.equal(report.dirty_files.length, 0);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails when working tree has modified files', () => {
  const { projectRoot, head } = makeRepo();
  try {
    writeFile(projectRoot, 'README.md', '# Changed\n');
    assert.throws(
      () => checkDeploySourceContract(
        {
          projectRoot,
          targetSha: head,
          remoteRef: '',
          requireClean: true,
          requireRemoteMatch: false,
        },
        silentLogger
      ),
      (error) => error instanceof DeploySourceContractError && error.code === 'SOURCE_CONTRACT_FAILED'
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails when working tree has untracked files', () => {
  const { projectRoot, head } = makeRepo();
  try {
    writeFile(projectRoot, 'new-file.txt', 'local only\n');
    assert.throws(
      () => checkDeploySourceContract(
        {
          projectRoot,
          targetSha: head,
          remoteRef: '',
          requireClean: true,
          requireRemoteMatch: false,
        },
        silentLogger
      ),
      /Working tree is dirty/
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails when remote ref is required but does not match target', () => {
  const { projectRoot, head } = makeRepo();
  try {
    runGit(projectRoot, ['branch', 'origin/master']);
    writeFile(projectRoot, 'README.md', '# New Commit\n');
    runGit(projectRoot, ['add', 'README.md']);
    runGit(projectRoot, ['commit', '-m', 'second']);
    const secondHead = runGit(projectRoot, ['rev-parse', 'HEAD']);

    assert.throws(
      () => checkDeploySourceContract(
        {
          projectRoot,
          targetSha: secondHead,
          remoteRef: 'origin/master',
          requireClean: true,
          requireRemoteMatch: true,
        },
        silentLogger
      ),
      (error) => error.message.includes(head.slice(0, 12)) && error.message.includes(secondHead.slice(0, 12))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
