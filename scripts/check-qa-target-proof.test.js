const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkQaTargetProof } = require('./check-qa-target-proof');

const silentLogger = { log() {}, warn() {}, error() {} };

function makeSummary(root, sha) {
  const summaryPath = path.join(root, 'qa_deploy_summary.txt');
  fs.writeFileSync(summaryPath, `deployed_head=${sha}\nremote_head=${sha}\nexpected_commit=${sha}\n`);
  return summaryPath;
}

function baseEnv() {
  return {
    QA_SSH_HOST: 'qa.example.test',
    QA_APP_DIR: '/var/www/skupervisor-qa',
    DEPLOY_PROD_REMOTE_HOST: 'prod.example.test',
    DEPLOY_PROD_REMOTE_DIR: '/var/www/skupervisor',
    QA_RUNTIME_MARKER: 'qa-runtime',
    QA_DATABASE_MARKER: 'sku_qa',
    QA_TENANT_DATA_MARKER: 'qa-tenant-token',
    QA_DISPOSABLE_TEST_DATA: '1',
  };
}

test('passes when QA target is distinct, isolated, and summary matches target SHA', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-proof-'));
  try {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const report = checkQaTargetProof({
      targetSha: sha,
      summaryPath: makeSummary(root, sha),
      env: baseEnv(),
    }, silentLogger);

    assert.equal(report.status, 'pass');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when QA target equals production host and app dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-proof-'));
  try {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const env = {
      ...baseEnv(),
      QA_SSH_HOST: 'prod.example.test',
      QA_APP_DIR: '/var/www/skupervisor',
    };

    assert.throws(
      () => checkQaTargetProof({
        targetSha: sha,
        summaryPath: makeSummary(root, sha),
        env,
      }, silentLogger),
      /QA target proof failed closed/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when QA summary does not match candidate SHA', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-proof-'));
  try {
    const targetSha = '0123456789abcdef0123456789abcdef01234567';
    const staleSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    assert.throws(
      () => checkQaTargetProof({
        targetSha,
        summaryPath: makeSummary(root, staleSha),
        env: baseEnv(),
      }, silentLogger),
      /QA target proof failed closed/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
