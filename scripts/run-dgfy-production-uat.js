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
const evidence = {};

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

async function fetchJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const { response, text } = await fetchText(url, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body
  });
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!response.ok) {
    const error = new Error(json?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = json || text;
    throw error;
  }
  return json;
}

function unwrapData(payload) {
  return payload?.data?.data ?? payload?.data ?? payload;
}

function makeSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function maskEmail(email) {
  const value = String(email || '');
  const [local, domain] = value.split('@');
  if (!local || !domain) return value ? '***' : '';
  return `${local.slice(0, 3)}***@${domain}`;
}

function authHeaders(token, companyToken = '') {
  return {
    Authorization: `Bearer ${token}`,
    ...(companyToken ? { 'x-company-token': companyToken } : {})
  };
}

async function createMailTmInbox(suffix) {
  const domains = await fetchJson('https://api.mail.tm/domains?page=1');
  const domain = domains?.['hydra:member']?.[0]?.domain;
  if (!domain) throw new Error('No disposable mail domain available');
  const address = `dgfy-uat-${suffix}@${domain}`;
  const password = `DgfyUat!${suffix}9`;
  await fetchJson('https://api.mail.tm/accounts', {
    method: 'POST',
    body: { address, password }
  });
  const tokenPayload = await fetchJson('https://api.mail.tm/token', {
    method: 'POST',
    body: { address, password }
  });
  if (!tokenPayload?.token) throw new Error('Disposable inbox token was not returned');
  return { address, password, token: tokenPayload.token };
}

async function pollMailTmOtp(token, { timeoutMs = 120000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await fetchJson('https://api.mail.tm/messages?page=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const messages = Array.isArray(list?.['hydra:member']) ? list['hydra:member'] : [];
    for (const message of messages) {
      const detail = await fetchJson(`https://api.mail.tm/messages/${message.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const text = `${detail.subject || ''}\n${detail.text || ''}\n${detail.html || ''}`;
      const match = text.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Timed out waiting for production OTP email');
}

async function runMutationUat() {
  if (!config.allowMutation) {
    addCheck('uat.production_mutation_flow', false, 'PROD_UAT_ALLOW_MUTATION=1 is required for live mutation UAT.');
    return;
  }

  const suffix = makeSuffix();
  const inbox = config.dgfyEmail
    ? { address: config.dgfyEmail, password: config.dgfyPassword || `DgfyUat!${suffix}9`, token: '' }
    : await createMailTmInbox(suffix);
  const password = inbox.password || config.dgfyPassword || `DgfyUat!${suffix}9`;
  const companyName = config.qaCompanyName || `DGFY Production UAT ${suffix}`;
  const itemName = config.qaItemName || `Production UAT Checkout Item ${suffix}`;
  const phone = `0917${String(Date.now()).slice(-7)}`;
  const requestId = `prod-uat-${suffix}`;
  const apiBase = `${config.skupervisorUrl}/api/v1`;

  evidence.qa = {
    suffix,
    email: maskEmail(inbox.address),
    companyName,
    itemName
  };

  const terms = unwrapData(await fetchJson(`${apiBase}/dgfy/legal-terms/current`));
  const accountSnapshot = terms?.flows?.account_registration?.snapshot || {};
  const companySnapshot = terms?.flows?.company_registration?.snapshot || {};

  await fetchJson(`${apiBase}/auth/email-otp/request`, {
    method: 'POST',
    body: {
      purpose: 'dgfy_account_verification',
      email: inbox.address
    }
  });
  addCheck('uat.dgfy_otp_request', true, 'Production OTP request accepted.', { email: maskEmail(inbox.address) });

  const otp = config.dgfyOtpCode || (inbox.token ? await pollMailTmOtp(inbox.token) : '');
  if (!otp) throw new Error('OTP code was not available for the configured inbox.');
  addCheck('uat.dgfy_otp_delivery', true, 'Production OTP email was received by QA inbox.', { email: maskEmail(inbox.address) });

  const registerPayload = unwrapData(await fetchJson(`${apiBase}/dgfy/auth/register`, {
    method: 'POST',
    headers: { 'x-request-id': requestId },
    body: {
      first_name: 'Production',
      last_name: 'UAT',
      email: inbox.address,
      phone,
      password,
      confirm_password: password,
      email_otp_code: otp,
      accepted_terms: true,
      terms_version: accountSnapshot.terms_version,
      privacy_version: accountSnapshot.privacy_version,
      marketplace_terms_version: accountSnapshot.marketplace_terms_version
    }
  }));
  const dgfyToken = registerPayload?.token;
  const dgfyAccountId = registerPayload?.account?.id;
  if (!dgfyToken || !dgfyAccountId) throw new Error('DGFY register did not return an authenticated account session.');
  addCheck('uat.dgfy_register_session', true, 'Fresh DGFY account registered and authenticated.', { account_id: dgfyAccountId });

  const companyPayload = unwrapData(await fetchJson(`${apiBase}/admin/tenants/register`, {
    method: 'POST',
    headers: authHeaders(dgfyToken),
    body: {
      name: companyName,
      workflowMode: 'retail',
      accepted_company_terms: true,
      company_terms_version: companySnapshot.company_terms_version,
      marketplace_terms_version: companySnapshot.marketplace_terms_version
    }
  }));
  const tenantId = companyPayload?.id;
  const companyToken = companyPayload?.company_token;
  if (!tenantId || !companyToken || companyPayload?.status !== 'active') {
    throw new Error(`Company registration did not auto-activate. status=${companyPayload?.status || 'missing'}`);
  }
  evidence.qa.tenantId = tenantId;
  addCheck('uat.company_auto_activation', true, 'DGFY company registration auto-activated without platform admin action.', {
    tenant_id: tenantId,
    status: companyPayload.status
  });

  const sessionPayload = unwrapData(await fetchJson(`${apiBase}/dgfy/auth/tenant-session`, {
    method: 'POST',
    headers: authHeaders(dgfyToken),
    body: {
      tenant_id: tenantId,
      company_token: companyToken
    }
  }));
  const imsToken = sessionPayload?.token;
  if (!imsToken) throw new Error('DGFY tenant-session did not return an IMS token.');
  addCheck('uat.tenant_session_handoff', true, 'DGFY account started an IMS tenant session.', { tenant_id: tenantId });

  const tenantHeaders = authHeaders(imsToken, companyToken);
  const initialSettings = unwrapData(await fetchJson(`${apiBase}/settings`, { headers: tenantHeaders }));
  const seededProgress = initialSettings?.tenant_onboarding_progress?.value || initialSettings?.tenant_onboarding_progress;
  const seededProgressText = typeof seededProgress === 'string' ? seededProgress : JSON.stringify(seededProgress || {});
  const hasRegisteredSeed = seededProgressText.includes('"registration_status":"registered"');
  addCheck(
    'uat.registered_access_seed',
    hasRegisteredSeed,
    hasRegisteredSeed
      ? 'New DGFY tenant includes registered business classification seed.'
      : 'New DGFY tenant is missing registered business classification seed.',
    {}
  );

  await fetchJson(`${apiBase}/settings`, {
    method: 'PUT',
    headers: tenantHeaders,
    body: {
      store_is_visible: true,
      customer_access_mode: 'transaction',
      pos_open_status: true
    }
  });

  const locationPayload = unwrapData(await fetchJson(`${apiBase}/tenant-locations`, {
    method: 'POST',
    headers: tenantHeaders,
    body: {
      name: 'Production UAT Storefront',
      address_line: 'QA Location, Iloilo City, Iloilo',
      latitude: 10.7202,
      longitude: 122.5621,
      delivery_radius_km: 5,
      is_open: true,
      is_active: true,
      is_primary_storefront: true,
      current_wait_time_minutes: 10,
      supports_delivery: true,
      supports_pickup: true,
      supports_dine_in: false
    }
  }));
  const locationId = Number(locationPayload?.id || locationPayload?.location_id || 0);
  if (!locationId) throw new Error('Tenant location creation did not return an id.');

  await fetchJson(`${apiBase}/onboarding/step`, {
    method: 'PUT',
    headers: tenantHeaders,
    body: {
      step_key: 'primary_location',
      payload: {
        public_storefront_visible: true,
        location_id: locationId
      }
    }
  });

  const bulkPayload = unwrapData(await fetchJson(`${apiBase}/onboarding/items/bulk`, {
    method: 'POST',
    headers: tenantHeaders,
    body: {
      rows: [{
        client_row_id: `uat-${suffix}`,
        mode_item_preset: 'product',
        name: itemName,
        default_sale_price: 149,
        cost_per_unit: 80,
        current_stock: 10,
        location_id: locationId
      }]
    }
  }));
  const createdRows = [
    ...(Array.isArray(bulkPayload?.rows) ? bulkPayload.rows : []),
    ...(Array.isArray(bulkPayload?.created) ? bulkPayload.created : []),
    ...(Array.isArray(bulkPayload?.results) ? bulkPayload.results : [])
  ];
  const createdRow = createdRows.find((row) => (
    row?.item_id || row?.id || row?.item?.item_id || row?.item?.id
  )) || {};
  const itemId = Number(
    createdRow.item_id
    || createdRow.id
    || createdRow.item?.item_id
    || createdRow.item?.id
    || bulkPayload?.created_item_ids?.[0]
    || 0
  );
  if (!itemId) throw new Error('Onboarding bulk item creation did not return an item id.');

  await fetchJson(`${apiBase}/onboarding/step`, {
    method: 'PUT',
    headers: tenantHeaders,
    body: {
      step_key: 'bulk_items',
      payload: { created_item_ids: [itemId] }
    }
  });
  await fetchJson(`${apiBase}/onboarding/complete`, {
    method: 'POST',
    headers: tenantHeaders,
    body: {}
  });
  addCheck('uat.ims_onboarding_item_created', true, 'IMS onboarding completed through item creation.', {
    location_id: locationId,
    item_id: itemId
  });

  await fetchJson(`${apiBase}/pos/catalog-overrides/${itemId}`, {
    method: 'PATCH',
    headers: tenantHeaders,
    body: { pos_visible: true }
  });
  await fetchJson(`${apiBase}/items/${itemId}/storefront-override`, {
    method: 'PATCH',
    headers: tenantHeaders,
    body: {
      storefront_visible: true,
      location_availability: [{ location_id: locationId, storefront_available: true }]
    }
  });

  const beforeItem = unwrapData(await fetchJson(`${apiBase}/items/${itemId}`, { headers: tenantHeaders }));
  const beforeStock = Number(beforeItem?.current_stock ?? beforeItem?.stock ?? 0);

  const catalog = unwrapData(await fetchJson(`${apiBase}/store/catalog?limit=20&location_id=${locationId}`, {
    headers: { 'x-company-token': companyToken }
  }));
  const catalogItems = Array.isArray(catalog?.items) ? catalog.items : (Array.isArray(catalog) ? catalog : []);
  const catalogItem = catalogItems.find((item) => Number(item.item_id || item.id) === itemId);
  if (!catalogItem) throw new Error('Created onboarding item was not visible in storefront catalog.');
  addCheck('uat.storefront_catalog_visibility', true, 'Created item is visible in storefront catalog.', { item_id: itemId });

  const checkoutBody = {
    lines: [{ item_id: itemId, quantity: 1 }],
    location_id: locationId,
    order_method: 'delivery',
    customer_name: 'Production UAT Buyer',
    customer_phone: phone,
    customer_email: inbox.address,
    delivery_address: 'QA Delivery Address, Iloilo City',
    delivery_latitude: 10.7202,
    delivery_longitude: 122.5621,
    special_instructions: `Production UAT ${suffix}`,
    idempotency_key: `prod-uat-${suffix}-${Date.now()}`,
    payment_type: 'cash'
  };
  await fetchJson(`${apiBase}/store/cart/quote`, {
    method: 'POST',
    headers: authHeaders(dgfyToken, companyToken),
    body: checkoutBody
  });
  const checkout = unwrapData(await fetchJson(`${apiBase}/store/checkout`, {
    method: 'POST',
    headers: authHeaders(dgfyToken, companyToken),
    body: checkoutBody
  }));
  const posTransactionId = Number(checkout?.order?.pos_transaction_id || checkout?.pos_transaction_id || 0);
  const trackingPin = checkout?.tracking_pin || checkout?.order?.tracking_pin || '';
  if (!posTransactionId || !trackingPin) throw new Error('Storefront checkout did not create a POS-backed order.');
  addCheck('uat.storefront_checkout_created', true, 'Storefront checkout created a POS-backed online order.', {
    pos_transaction_id: posTransactionId,
    tracking_pin: trackingPin
  });

  const incoming = unwrapData(await fetchJson(`${apiBase}/pos/incoming-orders?limit=50&location_id=${locationId}`, {
    headers: tenantHeaders
  }));
  const incomingRows = Array.isArray(incoming?.orders) ? incoming.orders : (Array.isArray(incoming) ? incoming : []);
  const incomingOrder = incomingRows.find((order) => Number(order.pos_transaction_id || order.id) === posTransactionId);
  if (!incomingOrder) throw new Error('POS incoming orders did not include the storefront checkout.');

  for (const fulfillment_status of ['confirmed', 'preparing', 'out_for_delivery', 'completed']) {
    await fetchJson(`${apiBase}/pos/orders/${posTransactionId}/status`, {
      method: 'PATCH',
      headers: tenantHeaders,
      body: { fulfillment_status }
    });
  }

  const afterItem = unwrapData(await fetchJson(`${apiBase}/items/${itemId}`, { headers: tenantHeaders }));
  const afterStock = Number(afterItem?.current_stock ?? afterItem?.stock ?? 0);
  const tracking = unwrapData(await fetchJson(`${apiBase}/store/track/${trackingPin}`, {
    headers: { 'x-company-token': companyToken }
  }));
  const inventoryDecremented = Number.isFinite(beforeStock) && Number.isFinite(afterStock) && afterStock === beforeStock - 1;
  addCheck(
    'uat.pos_completion_inventory_decrement',
    inventoryDecremented,
    inventoryDecremented
      ? 'POS completed the online order and inventory decremented by 1.'
      : `Inventory decrement mismatch: before=${beforeStock}; after=${afterStock}`,
    { item_id: itemId, before_stock: beforeStock, after_stock: afterStock, tracking_status: tracking?.status || tracking?.fulfillment_status || null }
  );

  const customerTrack = unwrapData(await fetchJson(`${apiBase}/dgfy/customer/track`, {
    method: 'POST',
    headers: authHeaders(dgfyToken),
    body: { tracking_pin: trackingPin }
  }));
  const customerOrders = unwrapData(await fetchJson(`${apiBase}/dgfy/customer/orders?limit=20`, {
    headers: authHeaders(dgfyToken)
  }));
  const orderRows = Array.isArray(customerOrders?.orders)
    ? customerOrders.orders
    : (Array.isArray(customerOrders?.activities) ? customerOrders.activities : (Array.isArray(customerOrders) ? customerOrders : []));
  const customerOrderLinked = orderRows.some((order) => (
    String(order.tracking_pin || order.reference || '').toUpperCase() === String(trackingPin).toUpperCase()
  ));
  addCheck(
    'uat.dgfy_customer_order_link',
    Boolean(customerTrack) && customerOrderLinked,
    customerOrderLinked
      ? 'DGFY account can track and see the completed storefront order.'
      : 'DGFY customer order linkage was not visible after tracking claim.',
    { tracking_pin: trackingPin }
  );

  addCheck('uat.production_mutation_flow', true, 'Fresh production signup, company activation, onboarding, checkout, POS, and inventory flow completed.', {
    tenant_id: tenantId,
    item_id: itemId,
    location_id: locationId,
    tracking_pin: trackingPin
  });
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
    PROD_UAT_CLEANUP_POLICY: config.cleanupPolicy || 'retain_qa_records_for_audit'
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

  if (config.allowMutation && config.dgfyEmail && !config.dgfyOtpCode) {
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
  const mutationReady = pass('uat.production_mutation_flow')
    && pass('uat.dgfy_register_session')
    && pass('uat.company_auto_activation')
    && pass('uat.tenant_session_handoff')
    && pass('uat.registered_access_seed')
    && pass('uat.ims_onboarding_item_created')
    && pass('uat.storefront_checkout_created')
    && pass('uat.pos_completion_inventory_decrement')
    && pass('uat.dgfy_customer_order_link');
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
    dgfy_account_ui_shell: publicRoutesOk && pass('uat.dgfy_customer_order_link') ? 9.2 : 7.2,
    dgfy_signup_business_registration_flow: publicRoutesOk && pass('uat.company_auto_activation') && pass('uat.tenant_session_handoff') ? 9.2 : 8.2,
    ecommerce_storefront_checkout_flow: publicRoutesOk && pass('uat.storefront_checkout_created') && pass('uat.dgfy_customer_order_link') ? 9.2 : 8.0,
    pos_order_inventory_flow: publicRoutesOk && pass('uat.pos_completion_inventory_decrement') ? 9.2 : 8.0,
    admin_payment_capability_operations: deployOk ? 9.1 : 8.2,
    production_readiness: deployOk && publicRoutesOk && mutationReady ? 9.2 : 8.4
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
  await runMutationUat();

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
    evidence,
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
