const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkQaTargetProof } = require('./check-qa-target-proof');
const silentLogger = { log() {}, warn() {}, error() {} };

function baseEnv() {
  return {
    QA_SSH_HOST: 'qa.example.test',
    QA_APP_DIR: '/srv/skupervisor-qa/app',
    QA_UNIX_USER: 'skupervisor-qa',
    QA_RUNTIME_MARKER: 'qa-runtime-1',
    QA_DATABASE_MARKER: 'qa-database-marker',
    QA_DATABASE_NAME: 'skupervisor_qa',
    QA_DB_CREDENTIAL_ID: 'qa-db-user-v1',
    QA_TENANT_DATA_MARKER: 'qa-disposable-tenant',
    QA_UPLOADS_DIR: '/srv/skupervisor-qa/uploads',
    QA_PM2_NAMES: 'sku-qa-backend,sku-qa-ims,sku-qa-pos,sku-qa-store',
    QA_DISPOSABLE_TEST_DATA: '1',
    QA_PRODUCTION_DATA_ACCESS: 'denied',
    DEPLOY_PROD_REMOTE_HOST: 'prod.example.test',
    DEPLOY_PROD_REMOTE_DIR: '/var/www/skupervisor',
    DEPLOY_PROD_REMOTE_USER: 'skupervisor-release',
    PROD_DATABASE_NAME: 'skupervisor_prod',
    PROD_DB_CREDENTIAL_ID: 'prod-db-user-v1',
    PROD_UPLOADS_DIR: '/var/www/skupervisor/uploads',
    PROD_PM2_NAMES: 'sku-backend,sku-frontend,sku-pos-frontend,sku-store-frontend',
  };
}

function makeSummary(root, sha, env = baseEnv()) {
  const summaryPath = path.join(root, 'qa_deploy_summary.txt');
  fs.writeFileSync(summaryPath, [
    `deployed_head=${sha}`,
    `remote_head=${sha}`,
    `expected_commit=${sha}`,
    `runtime_marker=${env.QA_RUNTIME_MARKER}`,
    `database_marker=${env.QA_DATABASE_MARKER}`,
    `unix_user=${env.QA_UNIX_USER}`,
    `app_dir=${env.QA_APP_DIR}`,
    `database_name=${env.QA_DATABASE_NAME}`,
    `uploads_dir=${env.QA_UPLOADS_DIR}`,
    `pm2_names=${env.QA_PM2_NAMES}`,
    '',
  ].join('\n'));
  return summaryPath;
}

test('passes exact-SHA fully isolated QA proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-proof-v2-'));
  try {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const env = baseEnv();
    const report = checkQaTargetProof({ targetSha: sha, summaryPath: makeSummary(root, sha, env), env }, silentLogger);
    assert.equal(report.status, 'pass');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed for production-as-QA', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-proof-v2-'));
  try {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const env = { ...baseEnv(), QA_SSH_HOST: 'prod.example.test', QA_APP_DIR: '/var/www/skupervisor' };
    assert.throws(() => checkQaTargetProof({ targetSha: sha, summaryPath: makeSummary(root, sha, env), env }, silentLogger), /failed closed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed for stale QA summary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-proof-v2-'));
  try {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    assert.throws(() => checkQaTargetProof({ targetSha: sha, summaryPath: makeSummary(root, 'a'.repeat(40)), env: baseEnv() }, silentLogger), /failed closed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when QA database credential identity is absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-proof-v2-'));
  try {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const env = { ...baseEnv(), QA_DB_CREDENTIAL_ID: '' };
    assert.throws(() => checkQaTargetProof({ targetSha: sha, summaryPath: makeSummary(root, sha, env), env }, silentLogger), /failed closed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
