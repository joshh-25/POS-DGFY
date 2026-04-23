#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    return '';
  }
  return (result.stdout || '').trim();
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  const result = spawnSync(checker, args, {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function addCheck(checks, name, ok, detail) {
  checks.push({ name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name} :: ${detail}`);
}

function main() {
  const gateEnabled = process.env.DEPLOY_ENFORCE_NO_STAGING_GATE === '1';
  if (!gateEnabled) {
    console.log(
      '[PASS] no_staging_gate.preflight_skipped :: DEPLOY_ENFORCE_NO_STAGING_GATE is not 1'
    );
    return;
  }

  const targetSha = (process.env.RELEASE_TARGET_SHA || runCapture('git', ['rev-parse', 'HEAD'])).toLowerCase();
  const qaBaseUrl = (process.env.QA_BASE_URL || '').trim();
  const qaSshHost = (process.env.QA_SSH_HOST || '').trim();
  const qaSummaryFile =
    (process.env.QA_DEPLOY_SUMMARY_FILE || '').trim() ||
    path.join('.tmp', 'release-gates', targetSha, 'qa_deploy_summary.txt');

  const checks = [];
  addCheck(checks, 'release.target_sha', Boolean(targetSha), `target_sha=${targetSha || '<missing>'}`);
  addCheck(
    checks,
    'qa.base_url.configured',
    qaBaseUrl.length > 0,
    qaBaseUrl.length > 0 ? qaBaseUrl : 'Missing QA_BASE_URL'
  );
  addCheck(
    checks,
    'qa.ssh_host.configured',
    qaSshHost.length > 0,
    qaSshHost.length > 0 ? qaSshHost : 'Missing QA_SSH_HOST'
  );
  addCheck(checks, 'runtime.ssh.command', commandExists('ssh'), commandExists('ssh') ? 'ssh available' : 'ssh not found');

  const hasPowerShell = commandExists('powershell') || commandExists('pwsh');
  addCheck(
    checks,
    'runtime.powershell.command',
    hasPowerShell,
    hasPowerShell ? 'powershell/pwsh available' : 'powershell/pwsh not found'
  );

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
    console.error(
      '\nNo-staging gate preflight failed. Configure missing QA inputs before deploy-remote push.'
    );
    process.exit(2);
  }
}

main();
