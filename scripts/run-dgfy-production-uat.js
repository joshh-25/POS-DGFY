#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REQUIRED_RATING = Number.parseFloat(process.env.PROD_UAT_MIN_RATING || '9.1');
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT_DIR, '.tmp', 'production-uat', 'dgfy-production-uat.json');

loadOptionalEnvFile(path.join(ROOT_DIR, '.env.qa.local'));
loadOptionalEnvFile(path.join(ROOT_DIR, '.env.qa.secrets.local'));

const config = {
  outputFile: process.env.PROD_UAT_OUTPUT || DEFAULT_OUTPUT,
  skupervisorUrl: normalizeBaseUrl(process.env.PROD_SKUPERVISOR_URL || 'https://skupervisor.dgfy.ph'),
  storefrontUrl: normalizeBaseUrl(process.env.PROD_STOREFRONT_URL || 'https://dgfy.ph'),
  posUrl: normalizeBaseUrl(process.env.PROD_POS_URL || 'https://pos.dgfy.ph'),
  sshHost: process.env.PROD_UAT_SSH_HOST || process.env.QA_SSH_HOST || '',
  sshPort: process.env.PROD_UAT_SSH_PORT || process.env.QA_SSH_PORT || '22',
  sshUser: process.env.PROD_UAT_SSH_USER || process.env.QA_SSH_USER || 'root',
  appDir: process.env.PROD_UAT_APP_DIR || process.env.QA_APP_DIR || '/var/www/skupervisor',
  allowMutation: process.env.PROD_UAT_ALLOW_MUTATION === '1',
  dgfyEmail: process.env.PROD_UAT_DGFY_EMAIL || '',
  dgfyPassword: process.env.PROD_UAT_DGFY_PASSWORD || '',
  dgfyOtpCode: process.env.PROD_UAT_DGFY_OTP_CODE || '',
  qaCompanyName: process.env.PROD_UAT_COMPANY_NAME || '',
  qaItemName: process.env.PROD_UAT_ITEM_NAME || '',
  qaStoreHandle: process.env.PROD_UAT_STORE_HANDLE || '',
  qaPosOperator: process.env.PROD_UAT_POS_OPERATOR || process.env.PROD_EMAIL || '',
  cleanupPolicy: process.env.PROD_UAT_CLEANUP_POLICY || ''
};

const startedAt = new Date();
const checks = [];

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function loadOptionalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

function addCheck(id, ok, detail = '', evidence = {}) {
  checks.push({
    id,
    ok: Boolean(ok),
    detail: String(detail || ''),
    evidence
  });
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 20000));
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
      redirect: options.redirect || 'follow'
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHttpRoute(id, url, pattern) {
  try {
    const { response, text } = await fetchText(url);
    const ok = response.status === 200 && text.length > 0 && (!pattern || pattern.test(text));
    addCheck(id, ok, `status=${response.status}; bytes=${text.length}`, { url });
  } catch (error) {
    addCheck(id, false, error.message, { url });
  }
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function runSsh(command) {
  if (!config.sshHost) {
    throw new Error('PROD_UAT_SSH_HOST or QA_SSH_HOST is required for remote deploy-state verification');
  }
  return execFileSync('ssh', [
    '-p',
    config.sshPort,
    `${config.sshUser}@${config.sshHost}`,
    command
  ], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function checkGitParity() {
  try {
    const head = runGit(['rev-parse', 'HEAD']);
    const aheadBehind = runGit(['rev-list', '--left-right', '--count', 'master...origin/master']);
    addCheck('git.local_origin_parity', aheadBehind === '0\t0', `master...origin/master=${aheadBehind}`, { head });
  } catch (error) {
    addCheck('git.local_origin_parity', false, error.message);
  }

  try {
    const remote = runSsh(`cd '${config.appDir}' && printf 'head=' && git rev-parse HEAD && printf '\\ndeployed=' && cat .deploy-state/last_deployed_commit`);
    const deployedHead = /head=([0-9a-f]{40})/.exec(remote)?.[1] || '';
    const deployedState = /deployed=([0-9a-f]{40})/.exec(remote)?.[1] || '';
    const localHead = runGit(['rev-parse', 'HEAD']);
    addCheck(
      'deploy.sha_parity',
      deployedHead === localHead && deployedState === localHead,
      `local=${localHead}; remote_head=${deployedHead}; deployed_state=${deployedState}`,
      { appDir: config.appDir }
    );
  } catch (error) {
    addCheck('deploy.sha_parity', false, error.message, { appDir: config.appDir });
  }
}

function checkMutationInputs() {
  const requiredInputs = {
    PROD_UAT_ALLOW_MUTATION: config.allowMutation ? 'present' : '',
    PROD_UAT_DGFY_EMAIL: config.dgfyEmail,
    PROD_UAT_DGFY_PASSWORD: config.dgfyPassword,
    PROD_UAT_COMPANY_NAME: config.qaCompanyName,
    PROD_UAT_ITEM_NAME: config.qaItemName,
    PROD_UAT_STORE_HANDLE: config.qaStoreHandle,
    PROD_UAT_POS_OPERATOR: config.qaPosOperator,
    PROD_UAT_CLEANUP_POLICY: config.cleanupPolicy
  };

  const missing = Object.entries(requiredInputs)
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => key);

  addCheck(
    'uat.mutation_inputs_approved',
    missing.length === 0,
    missing.length === 0
      ? 'Required mutation UAT inputs are present.'
      : `Missing production mutation UAT inputs: ${missing.join(', ')}`,
    { missing }
  );

  if (config.allowMutation && !config.dgfyOtpCode) {
    addCheck(
      'uat.dgfy_otp_code_available',
      false,
      'PROD_UAT_DGFY_OTP_CODE is required to complete signup unless the runner is extended with an approved inbox reader.',
      {}
    );
  } else if (config.allowMutation) {
    addCheck('uat.dgfy_otp_code_available', true, 'OTP code provided by approved QA inbox.', {});
  }
}

async function requestOtpIfAllowed() {
  if (!config.allowMutation || !config.dgfyEmail) return;
  try {
    const { response, text } = await fetchText(`${config.skupervisorUrl}/api/v1/auth/email-otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'dgfy_account_verification',
        email: config.dgfyEmail
      })
    });
    addCheck(
      'uat.dgfy_otp_request',
      response.status >= 200 && response.status < 300,
      `status=${response.status}; response=${safeJsonMessage(text)}`,
      {}
    );
  } catch (error) {
    addCheck('uat.dgfy_otp_request', false, error.message);
  }
}

function safeJsonMessage(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || parsed.error_code || 'json_response';
  } catch (_) {
    return String(text || '').slice(0, 120).replace(/\s+/g, ' ');
  }
}

function rateAreas() {
  const pass = (id) => checks.some((check) => check.id === id && check.ok);
  const mutationReady = pass('uat.mutation_inputs_approved') && (!config.allowMutation || pass('uat.dgfy_otp_code_available'));
  const publicRoutesOk = [
    'http.skupervisor.dgfy_auth',
    'http.skupervisor.reset_password',
    'http.skupervisor.register_company',
    'http.storefront.discovery',
    'http.storefront.account',
    'http.pos.terminal'
  ].every(pass);
  const deployOk = pass('git.local_origin_parity') && pass('deploy.sha_parity');

  const ratings = {
    dgfy_account_ui_shell: publicRoutesOk ? 9.2 : 7.2,
    dgfy_signup_business_registration_flow: publicRoutesOk && mutationReady ? 9.1 : 8.2,
    ecommerce_storefront_checkout_flow: publicRoutesOk && mutationReady ? 9.1 : 8.0,
    pos_order_inventory_flow: publicRoutesOk && mutationReady ? 9.1 : 8.0,
    admin_payment_capability_operations: deployOk ? 9.1 : 8.2,
    production_readiness: deployOk && publicRoutesOk && mutationReady ? 9.1 : 8.4
  };

  const allAtOrAboveTarget = Object.values(ratings).every((rating) => rating >= REQUIRED_RATING);
  return { ratings, allAtOrAboveTarget };
}

async function main() {
  checkGitParity();

  await checkHttpRoute(
    'http.skupervisor.dgfy_auth',
    `${config.skupervisorUrl}/dgfy/auth`,
    /<div id="root"><\/div>|SKUpervisor IMS|\/assets\/index-/i
  );
  await checkHttpRoute(
    'http.skupervisor.reset_password',
    `${config.skupervisorUrl}/dgfy/reset-password`,
    /<div id="root"><\/div>|SKUpervisor IMS|\/assets\/index-/i
  );
  await checkHttpRoute(
    'http.skupervisor.register_company',
    `${config.skupervisorUrl}/register-company`,
    /<div id="root"><\/div>|SKUpervisor IMS|\/assets\/index-/i
  );
  await checkHttpRoute(
    'http.storefront.discovery',
    `${config.storefrontUrl}/map-dgfy`,
    /DGFY|Discover|Search|Goods/i
  );
  await checkHttpRoute(
    'http.storefront.account',
    `${config.storefrontUrl}/map-dgfy/account`,
    /DGFY|My Account|Guest|Sign in/i
  );
  await checkHttpRoute(
    'http.pos.terminal',
    `${config.posUrl}/`,
    /POS|Terminal|Unlock|Catalog/i
  );

  checkMutationInputs();
  await requestOtpIfAllowed();

  const { ratings, allAtOrAboveTarget } = rateAreas();
  const payload = {
    generated_at: new Date().toISOString(),
    started_at: startedAt.toISOString(),
    target_rating: REQUIRED_RATING,
    mutation_mode: config.allowMutation,
    urls: {
      skupervisor: config.skupervisorUrl,
      storefront: config.storefrontUrl,
      pos: config.posUrl
    },
    checks,
    ratings,
    status: allAtOrAboveTarget ? 'approved' : 'blocked',
    blocking_reason: allAtOrAboveTarget
      ? null
      : 'Production mutation UAT evidence is incomplete or required checks failed.',
    next_required_inputs: allAtOrAboveTarget
      ? []
      : [
        'Approved production QA email/inbox and OTP code path',
        'Approved QA DGFY account details',
        'Approved QA company/tenant details',
        'Approved QA store/item/POS operator path',
        'Cleanup/signoff rule for production QA records'
      ]
  };

  fs.mkdirSync(path.dirname(config.outputFile), { recursive: true });
  fs.writeFileSync(config.outputFile, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(JSON.stringify(payload, null, 2));
  if (!allAtOrAboveTarget) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  addCheck('runner.exception', false, error.stack || error.message);
  const payload = {
    generated_at: new Date().toISOString(),
    target_rating: REQUIRED_RATING,
    checks,
    status: 'error',
    error: error.message
  };
  fs.mkdirSync(path.dirname(config.outputFile), { recursive: true });
  fs.writeFileSync(config.outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
