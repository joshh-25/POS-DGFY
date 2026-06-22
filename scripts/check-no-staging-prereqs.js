#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    return '';
  }
  return (result.stdout || '').trim();
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const args = [command];
  const result = spawnSync(checker, args, {
    stdio: 'ignore',
    shell: false,
  });
  return result.status === 0;
}

function addCheck(checks, name, ok, detail) {
  checks.push({ name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name} :: ${detail}`);
}

function isQaPromotionEnabled(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return normalized !== 'off' && normalized !== '0';
}

function normalizeRemotePath(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isPlaceholderQaToken(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/^<.*>$/.test(normalized)) {
    return true;
  }
  return [
    'changeme',
    'change-me',
    'dummy',
    'example',
    'placeholder',
    'qa_company_token',
    'token',
    'token-original',
    'todo',
  ].includes(normalized);
}

function runPreflight(env = process.env, options = {}) {
  const gateEnabled = env.DEPLOY_ENFORCE_NO_STAGING_GATE === '1';
  if (!gateEnabled) {
    console.log(
      '[PASS] no_staging_gate.preflight_skipped :: DEPLOY_ENFORCE_NO_STAGING_GATE is not 1'
    );
    return { skipped: true, checks: [] };
  }

  const targetSha = (env.RELEASE_TARGET_SHA || runCapture('git', ['rev-parse', 'HEAD'])).toLowerCase();
  const qaBaseUrl = (env.QA_BASE_URL || '').trim();
  const qaCompanyToken = (env.QA_COMPANY_TOKEN || '').trim();
  const qaSshHost = (env.QA_SSH_HOST || '').trim();
  const qaSshPort = (env.QA_SSH_PORT || '').trim();
  const qaAppDir = (env.QA_APP_DIR || '/var/www/skupervisor').trim();
  const qaPromotionMode = (env.DEPLOY_PROMOTE_QA_BEFORE_PROD || 'auto').trim();
  const prodRemoteHost = (env.DEPLOY_PROD_REMOTE_HOST || '').trim();
  const prodRemoteDir = (env.DEPLOY_PROD_REMOTE_DIR || '').trim();
  const qaPromotionEnabled = isQaPromotionEnabled(qaPromotionMode);
  const qaSummaryFile =
    (env.QA_DEPLOY_SUMMARY_FILE || '').trim() ||
    path.join('.tmp', 'release-gates', targetSha, 'qa_deploy_summary.txt');
  const skipRuntimeCommands = options.skipRuntimeCommands === true;

  const checks = [];
  addCheck(checks, 'release.target_sha', Boolean(targetSha), `target_sha=${targetSha || '<missing>'}`);
  addCheck(
    checks,
    'qa.promotion.mode',
    true,
    `DEPLOY_PROMOTE_QA_BEFORE_PROD=${qaPromotionMode || 'auto'}`
  );
  addCheck(
    checks,
    'qa.base_url.configured',
    qaBaseUrl.length > 0,
    qaBaseUrl.length > 0 ? qaBaseUrl : 'Missing QA_BASE_URL'
  );
  addCheck(
    checks,
    'qa.company_token.configured',
    !isPlaceholderQaToken(qaCompanyToken),
    !isPlaceholderQaToken(qaCompanyToken)
      ? 'QA_COMPANY_TOKEN configured'
      : 'Missing or placeholder QA_COMPANY_TOKEN'
  );
  addCheck(
    checks,
    'qa.ssh_host.configured',
    qaSshHost.length > 0,
    qaSshHost.length > 0 ? qaSshHost : 'Missing QA_SSH_HOST'
  );
  if (qaSshPort.length > 0) {
    addCheck(
      checks,
      'qa.ssh_port.valid',
      /^[0-9]+$/.test(qaSshPort),
      /^[0-9]+$/.test(qaSshPort) ? `QA_SSH_PORT=${qaSshPort}` : `Invalid QA_SSH_PORT=${qaSshPort}`
    );
  }
  if (qaPromotionEnabled && prodRemoteHost.length > 0 && prodRemoteDir.length > 0) {
    const sameHost = qaSshHost.toLowerCase() === prodRemoteHost.toLowerCase();
    const sameDir = normalizeRemotePath(qaAppDir) === normalizeRemotePath(prodRemoteDir);
    addCheck(
      checks,
      'qa.promotion.target_distinct_from_production',
      !(sameHost && sameDir),
      sameHost && sameDir
        ? 'Configured QA target is production; set a distinct QA host/app dir or DEPLOY_PROMOTE_QA_BEFORE_PROD=off'
        : `QA target ${qaSshHost || '<missing>'}:${normalizeRemotePath(qaAppDir)} is distinct from production`
    );
  } else if (qaPromotionEnabled) {
    addCheck(
      checks,
      'qa.promotion.target_distinct_from_production',
      true,
      'production target not supplied to preflight; deploy wrapper supplies DEPLOY_PROD_REMOTE_HOST and DEPLOY_PROD_REMOTE_DIR'
    );
  }

  if (!skipRuntimeCommands) {
    const hasSsh = commandExists('ssh');
    addCheck(checks, 'runtime.ssh.command', hasSsh, hasSsh ? 'ssh available' : 'ssh not found');

    const hasPowerShell = commandExists('powershell') || commandExists('pwsh');
    addCheck(
      checks,
      'runtime.powershell.command',
      hasPowerShell,
      hasPowerShell ? 'powershell/pwsh available' : 'powershell/pwsh not found'
    );
  }

  if (fs.existsSync(qaSummaryFile)) {
    addCheck(checks, 'qa.deploy.summary.source', true, `found local evidence at ${qaSummaryFile}`);
  } else if (qaSshHost.length > 0) {
    addCheck(
      checks,
      'qa.deploy.summary.source',
      true,
      `will fetch over SSH into ${qaSummaryFile}`
    );
  } else {
    addCheck(
      checks,
      'qa.deploy.summary.source',
      false,
      `Missing ${qaSummaryFile} and QA_SSH_HOST not configured for fetch`
    );
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    return { ok: false, checks, failed };
  }
  return { ok: true, checks, failed: [] };
}

function main() {
  const result = runPreflight();
  if (result.ok === false) {
    console.error(
      '\nNo-staging gate preflight failed. Configure missing QA inputs before deploy-remote push.'
    );
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  isQaPromotionEnabled,
  isPlaceholderQaToken,
  runPreflight,
};
