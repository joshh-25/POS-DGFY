#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class QaTargetProofError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'QaTargetProofError';
    this.code = options.code || 'QA_TARGET_PROOF_FAILED';
    this.report = options.report || null;
  }
}

function normalizePath(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function parseSummary(filePath) {
  const values = {};
  if (!filePath || !fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function parseArgs(argv) {
  const options = {
    targetSha: process.env.RELEASE_TARGET_SHA || process.env.GITHUB_SHA || '',
    reportPath: process.env.QA_TARGET_PROOF_REPORT || '',
    summaryPath: process.env.QA_DEPLOY_SUMMARY_FILE || '',
    allowMissingSummary: false,
    env: process.env,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target-sha') {
      options.targetSha = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--report') {
      options.reportPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--summary') {
      options.summaryPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--allow-missing-summary') {
      options.allowMissingSummary = true;
    } else {
      throw new QaTargetProofError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  return options;
}

function addCheck(checks, name, ok, detail) {
  checks.push({ name, ok, detail });
}

function checkQaTargetProof(options, logger = console) {
  const env = options.env || process.env;
  const targetSha = String(options.targetSha || '').trim().toLowerCase();
  const qaSshHost = String(env.QA_SSH_HOST || '').trim();
  const qaAppDir = String(env.QA_APP_DIR || '').trim();
  const prodHost = String(env.DEPLOY_PROD_REMOTE_HOST || env.PROD_SSH_HOST || '').trim();
  const prodAppDir = String(env.DEPLOY_PROD_REMOTE_DIR || env.PROD_APP_DIR || '').trim();
  const qaRuntimeMarker = String(env.QA_RUNTIME_MARKER || env.QA_ENVIRONMENT_MARKER || '').trim();
  const qaDatabaseMarker = String(env.QA_DATABASE_MARKER || env.QA_DB_NAME || '').trim();
  const qaTenantMarker = String(env.QA_TENANT_DATA_MARKER || env.QA_COMPANY_TOKEN || '').trim();
  const disposableData = isTruthy(env.QA_DISPOSABLE_TEST_DATA || env.QA_USES_DISPOSABLE_DATA);
  const summaryPath = options.summaryPath || (targetSha ? path.join('.tmp', 'release-gates', targetSha, 'qa_deploy_summary.txt') : '');
  const summary = parseSummary(summaryPath);

  const checks = [];
  addCheck(checks, 'qa.ssh_host.exists', qaSshHost.length > 0, qaSshHost || 'Missing QA_SSH_HOST');
  addCheck(checks, 'qa.app_dir.exists', qaAppDir.length > 0, qaAppDir || 'Missing QA_APP_DIR');
  if (qaSshHost && qaAppDir && prodHost && prodAppDir) {
    const sameHost = qaSshHost.toLowerCase() === prodHost.toLowerCase();
    const sameDir = normalizePath(qaAppDir) === normalizePath(prodAppDir);
    addCheck(
      checks,
      'qa.target.not_production',
      !(sameHost && sameDir),
      sameHost && sameDir ? 'QA host/app dir equals production' : 'QA target differs from production host/app dir'
    );
  } else {
    addCheck(checks, 'qa.target.not_production', false, 'Production host/app dir inputs are required for proof');
  }
  addCheck(checks, 'qa.runtime.marker.isolated', qaRuntimeMarker.length > 0 && !/prod/i.test(qaRuntimeMarker), qaRuntimeMarker || 'Missing QA runtime marker');
  addCheck(checks, 'qa.database.marker.isolated', qaDatabaseMarker.length > 0 && !/prod/i.test(qaDatabaseMarker), qaDatabaseMarker || 'Missing QA database marker');
  addCheck(checks, 'qa.tenant_data.disposable', qaTenantMarker.length > 0 && disposableData, disposableData ? 'Disposable QA data declared' : 'QA_DISPOSABLE_TEST_DATA=1 is required');
  if (options.allowMissingSummary) {
    addCheck(checks, 'qa.deploy.summary.present', true, 'summary allowed to be missing in dry-run proof mode');
  } else {
    addCheck(checks, 'qa.deploy.summary.present', fs.existsSync(summaryPath), summaryPath || 'Missing QA summary path');
    addCheck(
      checks,
      'qa.deploy.summary.sha_match',
      Boolean(targetSha) && String(summary.deployed_head || '').toLowerCase() === targetSha,
      `deployed_head=${summary.deployed_head || '<missing>'}; target_sha=${targetSha || '<missing>'}`
    );
  }

  const failed = checks.filter((check) => !check.ok);
  const report = {
    version: 1,
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    status: failed.length === 0 ? 'pass' : 'fail',
    summary_path: summaryPath,
    checks,
  };

  if (options.reportPath) {
    fs.mkdirSync(path.dirname(path.resolve(options.reportPath)), { recursive: true });
    fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2));
  }

  for (const check of checks) {
    logger.log(`[qa-target-proof] ${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
  }

  if (failed.length > 0) {
    throw new QaTargetProofError('QA target proof failed closed.', {
      report,
      code: 'QA_TARGET_PROOF_FAILED',
    });
  }

  return report;
}

function main() {
  try {
    checkQaTargetProof(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof QaTargetProofError) {
      console.error(`[qa-target-proof] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  QaTargetProofError,
  parseArgs,
  checkQaTargetProof,
};
