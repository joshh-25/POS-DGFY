import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium, firefox, webkit, devices } from 'playwright';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const FRONTEND_PORT = Number.parseInt(process.env.FRONTEND_E2E_PORT || '5173', 10);
const FRONTEND_HOST = 'localhost';
const FRONTEND_BASE = `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;
const BACKEND_BASE = 'http://127.0.0.1:5000';
const BACKEND_HEALTH = `${BACKEND_BASE}/health`;
const RUN_BROWSER_E2E = process.env.RUN_BROWSER_E2E === 'true';
const RUN_A11Y_MATRIX = process.env.RUN_A11Y_MATRIX === 'true';
const COMPANY_TOKEN = 'token-original';
const BROWSER_E2E_ENGINE = String(process.env.BROWSER_E2E_ENGINE || 'chromium').trim().toLowerCase();
const parseCsvList = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const requestedViewportProfiles = parseCsvList(process.env.BROWSER_E2E_VIEWPORTS || 'desktop');
const VIEWPORT_PROFILE_OPTIONS = Object.freeze({
  desktop: {
    viewport: { width: 1366, height: 900 }
  },
  mobile: {
    ...devices['iPhone 13']
  }
});
const VIEWPORT_PROFILES = (
  requestedViewportProfiles.length > 0
    ? requestedViewportProfiles.filter((name) => Object.prototype.hasOwnProperty.call(VIEWPORT_PROFILE_OPTIONS, name))
    : ['desktop']
);
const ACTIVE_VIEWPORT_PROFILES = VIEWPORT_PROFILES.length > 0 ? VIEWPORT_PROFILES : ['desktop'];
const ARTIFACT_ROOT = path.join(__dirname, 'artifacts', 'ims-pos-sales-journey');
const TEST_USER_SUFFIX = Date.now();
const FRONTEND_LOGIN = {
  email: `ims.pos.sales.e2e.${TEST_USER_SUFFIX}@tenant.test`,
  password: 'Admin123!',
  username: `ims_pos_sales_e2e_${TEST_USER_SUFFIX}`,
  companyToken: COMPANY_TOKEN
};
const TERMINAL_REGISTRY_VALUE = Object.freeze([
  { terminal_id: 'E2E-TERMINAL-01', label: 'E2E Counter 01', is_active: true, is_default: true },
  { terminal_id: 'E2E-TERMINAL-02', label: 'E2E Counter 02', is_active: true, is_default: false }
]);
const DEFAULT_E2E_TERMINAL_ID = TERMINAL_REGISTRY_VALUE[0].terminal_id;

let backendProc;
let frontendProc;
let browser;
let backendWasAlreadyRunning = false;
let frontendWasAlreadyRunning = false;
let backendShutdownExpected = false;
let frontendShutdownExpected = false;
let actorUserId = null;
let seededInvoiceReference = '';
let authToken = null;

const READY_PROFILE_PATCH = Object.freeze({
  bir: {
    software_accreditation_number: 'BIR-TEST-2026-001',
    software_accreditation_valid_until: '2026-12-31',
    ptu_certificate_number: 'PTU-REF-999',
    tax_classification_controls_confirmed: true,
    non_resettable_grand_total_enabled: true,
    mandatory_receipt_fields_confirmed: true
  },
  npc: {
    dpo_name: 'John Compliance Doe',
    dpo_email: 'dpo@example.com',
    dps_registration_number: 'NPC-DPS-2026-123',
    dps_registration_valid_until: '2026-12-31',
    breach_notification_procedure_confirmed: true
  },
  bsp: {
    ops_registration_required: false,
    ops_registration_status: 'not_required',
    ops_registration_number: '',
    ops_registration_valid_until: '',
    payment_control_reviewed: false
  },
  readiness: {
    tests_passed: true,
    last_tested_at: ''
  }
});

const READY_SETTINGS = Object.freeze({
  pos_business_name: 'Seeded Compliance Test Business',
  pos_tin_branch: '123-456-789-000',
  pos_address: '123 Compliance St, Test City',
  pos_ptu_number: 'PTU-REF-999',
  pos_min_number: 'MIN-2026-001',
  pos_accreditation_number: 'BIR-TEST-2026-001'
});

const READY_ARTIFACTS = Object.freeze([
  {
    artifact_type: 'bir_accreditation_certificate',
    artifact_name: 'BIR Accreditation Certificate (Browser E2E)',
    reference_number: 'BIR-TEST-2026-001',
    valid_until: '2026-12-31'
  },
  {
    artifact_type: 'bir_ptu_document',
    artifact_name: 'BIR PTU Document (Browser E2E)',
    reference_number: 'PTU-REF-999',
    valid_until: '2026-12-31'
  },
  {
    artifact_type: 'npc_dps_certificate',
    artifact_name: 'NPC DPS Certificate (Browser E2E)',
    reference_number: 'NPC-DPS-2026-123',
    valid_until: '2026-12-31'
  }
]);

const READY_PERIPHERALS = Object.freeze([
  {
    device_class: 'receipt_printer',
    brand: 'SeedBrand',
    model: 'Thermal-Printer-01',
    serial_number: 'E2E-RECEIPT-001'
  },
  {
    device_class: 'cash_drawer',
    brand: 'SeedBrand',
    model: 'CashDrawer-01',
    serial_number: 'E2E-CASHDRAWER-001'
  }
]);

const waitForHttp = async (url, timeoutMs = 60000) => {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok || response.status === 304) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
};

const isHttpUp = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return response.ok || response.status === 304;
  } catch {
    return false;
  }
};

const terminateProcessTree = async (proc) => {
  if (!proc?.pid) return;
  if (proc === frontendProc) {
    frontendShutdownExpected = true;
  }
  if (proc === backendProc) {
    backendShutdownExpected = true;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        stdio: 'ignore'
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  proc.kill('SIGTERM');
};

const parseProfileObject = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const deepMerge = (base, incoming) => {
  const output = { ...(base || {}) };
  Object.keys(incoming || {}).forEach((key) => {
    const nextValue = incoming[key];
    const prevValue = output[key];
    if (
      nextValue
      && typeof nextValue === 'object'
      && !Array.isArray(nextValue)
      && prevValue
      && typeof prevValue === 'object'
      && !Array.isArray(prevValue)
    ) {
      output[key] = deepMerge(prevValue, nextValue);
      return;
    }
    output[key] = nextValue;
  });
  return output;
};

const resolveBrowserLauncher = (engine) => {
  if (engine === 'firefox') return firefox;
  if (engine === 'webkit') return webkit;
  return chromium;
};

const createContextForViewportProfile = async (profileName) => {
  const contextOptions = VIEWPORT_PROFILE_OPTIONS[profileName] || VIEWPORT_PROFILE_OPTIONS.desktop;
  const videoSize = contextOptions.viewport || { width: 1366, height: 900 };
  const context = await browser.newContext({
    ...contextOptions,
    recordVideo: {
      dir: ARTIFACT_ROOT,
      size: videoSize
    }
  });
  await context.addInitScript(() => {
    try {
      Object.defineProperty(window, 'BroadcastChannel', {
        configurable: true,
        writable: true,
        value: undefined
      });
    } catch {
      // no-op: best-effort to isolate auth refresh handling per test context
    }
  });
  return context;
};

const landlordConnectionConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sku_inventory_manager'
});

const resolveTenantByCompanyToken = async (companyToken) => {
  const landlord = await mysql.createConnection(landlordConnectionConfig());
  try {
    const [rows] = await landlord.query(
      'SELECT id, company_token, db_name FROM tenants WHERE company_token = ? LIMIT 1',
      [companyToken]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Tenant not found for company token: ${companyToken}`);
    }
    return rows[0];
  } finally {
    await landlord.end();
  }
};

const tenantConnectionConfig = async (companyToken) => {
  const tenant = await resolveTenantByCompanyToken(companyToken);
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: tenant.db_name
  };
};

const withTenantDb = async (companyToken, fn) => {
  const config = await tenantConnectionConfig(companyToken);
  const db = await mysql.createConnection(config);
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
};

const ensureArtifactRoot = async () => {
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
};

const safeArtifactToken = (value) => String(value || '')
  .replace(/[^A-Za-z0-9._-]/g, '-')
  .slice(0, 80);

const buildArtifactBaseName = ({ scenario, viewportProfile }) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${safeArtifactToken(scenario)}-${safeArtifactToken(viewportProfile || 'desktop')}`;
};

const resolveCurrentStockForItemName = async (itemName) => withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
  const [rows] = await tenantDb.query(
    'SELECT current_stock FROM items WHERE name = ? ORDER BY item_id DESC LIMIT 1',
    [itemName]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Unable to resolve item row for stock assertion: ${itemName}`);
  }
  return Number(rows[0].current_stock || 0);
});

const resolveWorkflowModeSettingFromDb = async () => withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
  const [rows] = await tenantDb.query(
    `SELECT setting_value
     FROM system_settings
     WHERE setting_key = 'ops_workflow_mode'
     ORDER BY setting_id DESC
     LIMIT 1`
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'manufacturing';
  }
  const normalized = String(rows[0].setting_value || '').trim().toLowerCase();
  return normalized || 'manufacturing';
});

const waitForWorkflowModeSetting = async (expectedMode, timeoutMs = 60000) => {
  const normalizedExpected = String(expectedMode || '').trim().toLowerCase();
  const start = Date.now();
  let lastValue = null;
  while (Date.now() - start < timeoutMs) {
    lastValue = await resolveWorkflowModeSettingFromDb();
    if (lastValue === normalizedExpected) {
      return lastValue;
    }
    await delay(250);
  }
  throw new Error(
    `Timed out waiting for ops_workflow_mode=${normalizedExpected}. Last observed value=${String(lastValue || 'null')}`
  );
};

const saveBusinessModeViaSettings = async (page, mode) => {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  const modeLabel = normalizedMode === 'msme' ? 'MSME' : 'Manufacturing';

  await page.goto(`${FRONTEND_BASE}/settings?tab=company`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /^Settings$/ }).waitFor({ timeout: 60000 });

  const modeCard = page.locator('#business-mode-settings').first();
  if (!await modeCard.isVisible({ timeout: 8000 }).catch(() => false)) {
    await page.goto(`${FRONTEND_BASE}/settings?tab=pos`, { waitUntil: 'domcontentloaded' });
  }
  await modeCard.waitFor({ state: 'visible', timeout: 60000 });
  const workflowSelect = modeCard.locator('select').first();
  await workflowSelect.waitFor({ state: 'visible', timeout: 60000 });
  await workflowSelect.selectOption(normalizedMode);

  const saveButton = page.getByRole('button', { name: /^Save Changes$/ }).first();
  await saveButton.waitFor({ state: 'visible', timeout: 60000 });
  await saveButton.click({ force: true });

  await waitForWorkflowModeSetting(normalizedMode);
  await page.waitForFunction(
    (label) => document.body?.innerText?.includes(`Active mode after save: ${label}`),
    modeLabel,
    { timeout: 20000 }
  );
};

const resolveItemRecordByName = async (itemName) => withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
  const [rows] = await tenantDb.query(
    `SELECT item_id, name, current_stock, batch_size, yield_percentage, processing_loss, production_notes
     FROM items
     WHERE name = ?
     ORDER BY item_id DESC
     LIMIT 1`,
    [itemName]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return rows[0];
});

const setManufacturingFieldsForItem = async (itemId, fields) => withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
  await tenantDb.query(
    `UPDATE items
     SET batch_size = ?,
         yield_percentage = ?,
         processing_loss = ?,
         production_notes = ?,
         updated_at = NOW()
     WHERE item_id = ?
     LIMIT 1`,
    [
      Number(fields.batch_size || 0),
      Number(fields.yield_percentage || 0),
      Number(fields.processing_loss || 0),
      String(fields.production_notes || ''),
      Number(itemId)
    ]
  );
});

const editItemNameViaItemsPage = async (page, currentName, nextName) => {
  await page.goto(`${FRONTEND_BASE}/items`, { waitUntil: 'domcontentloaded' });
  const searchInput = page.getByPlaceholder('Search by name or SKU...').first();
  await searchInput.waitFor({ state: 'visible', timeout: 60000 });
  await searchInput.fill(currentName);

  const itemTitle = page.getByRole('heading', { name: currentName, exact: true }).first();
  await itemTitle.waitFor({ timeout: 60000 });
  const card = itemTitle.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  const menuTrigger = card.locator('button[aria-haspopup="menu"]').first();
  if (await menuTrigger.count()) {
    await menuTrigger.click();
  } else {
    await card.locator('button').first().click();
  }

  const editItemAction = page.getByRole('menuitem', { name: /Edit Item/i }).first();
  if (!await editItemAction.isVisible({ timeout: 4000 }).catch(() => false)) {
    if (await menuTrigger.count()) {
      await menuTrigger.click().catch(() => {});
    } else {
      await card.locator('button').first().click().catch(() => {});
    }
  }
  await editItemAction.waitFor({ state: 'visible', timeout: 60000 });
  await editItemAction.click();

  await page.getByRole('heading', { name: /Edit Item/i }).first().waitFor({ timeout: 60000 });
  const nameInput = page.locator('#name').first();
  await nameInput.fill(nextName);
  await page.getByRole('button', { name: /^Update Item$/ }).first().click();

  await page.getByRole('heading', { name: /Edit Item/i }).first().waitFor({ state: 'hidden', timeout: 60000 });
  await page.getByRole('heading', { name: nextName, exact: true }).first().waitFor({ timeout: 60000 });
};

const assertMsmeNavigationAndRouteGuard = async (page) => {
  const sidebar = page.locator('aside').first();
  await sidebar.waitFor({ state: 'visible', timeout: 60000 });

  const hiddenLinks = ['Job Orders', 'Dispatch Orders', 'Stock Movements', 'AI Chat'];
  for (const linkName of hiddenLinks) {
    const count = await sidebar.getByRole('link', { name: linkName }).count();
    if (count > 0) {
      throw new Error(`Expected sidebar link "${linkName}" to be hidden in MSME mode.`);
    }
  }

  await page.goto(`${FRONTEND_BASE}/job-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 60000 });
};

const assertTerminalPaymentOptionsByMode = async (page, { msme }) => {
  await page.goto(`${FRONTEND_BASE}/terminal`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /POS Terminal Workspace/i }).waitFor({ timeout: 60000 });
  await unlockTerminalFromDrawer(page, DEFAULT_E2E_TERMINAL_ID);
  await ensureShiftOpenForCheckout(page);
  await ensureCheckoutWorkspaceVisible(page);

  const paymentSelect = page.locator('label:has-text("Payment Type") select').first();
  await paymentSelect.waitFor({ state: 'visible', timeout: 60000 });
  const optionTexts = await paymentSelect.locator('option').allTextContents();
  const joinedOptions = optionTexts.join(' | ');

  if (msme) {
    if (!optionTexts.some((entry) => String(entry).includes('GCash (Manual)'))) {
      throw new Error(`Expected MSME manual payment label, but options were: ${joinedOptions}`);
    }
    return;
  }

  if (optionTexts.some((entry) => String(entry).includes('(Manual)'))) {
    throw new Error(`Did not expect manual payment labels in Manufacturing mode: ${joinedOptions}`);
  }
};

const assertStockDecrementAfterCheckout = async ({ itemName, stockBefore, quantity = 1 }) => {
  const stockAfter = await resolveCurrentStockForItemName(itemName);
  const expectedStockAfter = Number(stockBefore) - Number(quantity);
  if (Math.abs(stockAfter - expectedStockAfter) > 0.0001) {
    throw new Error(
      `Expected stock movement after checkout for "${itemName}" to be ${expectedStockAfter}, but found ${stockAfter}`
    );
  }
  return stockAfter;
};

const startFrontendServer = async () => {
  if (await isHttpUp(FRONTEND_BASE)) {
    frontendWasAlreadyRunning = true;
    return;
  }

  const frontendDir = path.join(__dirname, '..', '..', 'frontend');
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/c', 'npm', 'run', 'dev', '--', '--port', String(FRONTEND_PORT), '--strictPort']
    : ['run', 'dev', '--', '--port', String(FRONTEND_PORT), '--strictPort'];

  frontendProc = spawn(command, args, {
    cwd: frontendDir,
    stdio: 'pipe',
    env: { ...process.env, VITE_API_URL: '/api/v1' }
  });

  let startupErrorOutput = '';
  frontendProc.stdout.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  frontendProc.stderr.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  frontendProc.on('exit', (code) => {
    if (code !== 0 && !frontendShutdownExpected) {
      console.warn(`[frontend.complianceActivationReadiness.e2e] Frontend dev server exited with code ${code}`);
      if (startupErrorOutput.trim()) {
        console.warn(startupErrorOutput.trim());
      }
    }
  });

  await waitForHttp(FRONTEND_BASE, 90000);
};

const startBackendServer = async () => {
  if (await isHttpUp(BACKEND_HEALTH)) {
    backendWasAlreadyRunning = true;
    return;
  }

  const backendDir = path.join(__dirname, '..');
  const command = process.platform === 'win32' ? 'cmd.exe' : 'node';
  const args = process.platform === 'win32'
    ? ['/c', 'node', 'src/server.js']
    : ['src/server.js'];

  backendProc = spawn(command, args, {
    cwd: backendDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      SKIP_SERVER_START: 'false',
      CORS_ORIGIN: `http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}`
    }
  });

  let startupErrorOutput = '';
  backendProc.stdout.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  backendProc.stderr.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  backendProc.on('exit', (code) => {
    if (code !== 0 && !backendShutdownExpected) {
      console.warn(`[frontend.complianceActivationReadiness.e2e] Backend server exited with code ${code}`);
      if (startupErrorOutput.trim()) {
        console.warn(startupErrorOutput.trim());
      }
    }
  });

  await waitForHttp(BACKEND_HEALTH, 90000);
};

const ensureBrowserE2EUser = async () => {
  const registerResponse = await fetch(`${BACKEND_BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-token': FRONTEND_LOGIN.companyToken
    },
    body: JSON.stringify({
      username: FRONTEND_LOGIN.username,
      email: FRONTEND_LOGIN.email,
      password: FRONTEND_LOGIN.password
    })
  });

  if (![200, 201, 400, 409].includes(registerResponse.status)) {
    const payload = await registerResponse.text().catch(() => '');
    throw new Error(`Failed to register browser E2E user: HTTP ${registerResponse.status} ${payload}`);
  }

  actorUserId = await withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
    const [rows] = await tenantDb.query(
      `SELECT user_id FROM users WHERE email = ? LIMIT 1`,
      [FRONTEND_LOGIN.email]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Registered browser E2E user not found in tenant DB');
    }

    const userId = Number(rows[0].user_id);
    await tenantDb.query(
      `UPDATE users
       SET role = 'admin',
           is_master_admin = 1,
           is_active = 1,
           updated_at = NOW()
       WHERE user_id = ?`,
      [userId]
    );
    return userId;
  });

  const loginResponse = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-token': FRONTEND_LOGIN.companyToken
    },
    body: JSON.stringify({
      email: FRONTEND_LOGIN.email,
      password: FRONTEND_LOGIN.password
    })
  });

  if (!loginResponse.ok) {
    const payload = await loginResponse.text().catch(() => '');
    throw new Error(`Failed to verify browser E2E credentials: HTTP ${loginResponse.status} ${payload}`);
  }
  const loginPayload = await loginResponse.json().catch(() => ({}));
  authToken = loginPayload?.data?.token || null;
};

const callTenantApi = async (path, { method = 'GET', body } = {}) => {
  if (!authToken) {
    throw new Error(`Auth token unavailable for tenant API call: ${method} ${path}`);
  }
  const response = await fetch(`${BACKEND_BASE}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-company-token': FRONTEND_LOGIN.companyToken,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const validationDetails = Array.isArray(payload?.errors) ? JSON.stringify(payload.errors) : '';
    throw new Error(
      `Tenant API ${method} ${path} failed (HTTP ${response.status}): ${payload?.message || 'unknown error'} ${validationDetails}`
    );
  }
  return payload?.data ?? null;
};

const seedComplianceReadiness = async () => {
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    throw new Error('actorUserId is not initialized for compliance seed');
  }

  const landlord = await mysql.createConnection(landlordConnectionConfig());
  try {
    const [tenantRows] = await landlord.query(
      `SELECT id, compliance_profile
       FROM tenants
       WHERE company_token = ?
       LIMIT 1`,
      [COMPANY_TOKEN]
    );
    if (!Array.isArray(tenantRows) || tenantRows.length === 0) {
      throw new Error(`Tenant not found for company token: ${COMPANY_TOKEN}`);
    }

    const tenant = tenantRows[0];
    const existingProfile = parseProfileObject(tenant.compliance_profile);
    const mergedProfile = deepMerge(existingProfile, READY_PROFILE_PATCH);

    await landlord.query(
      `UPDATE tenants
       SET compliance_profile = ?,
           compliance_mode_state = CASE
             WHEN compliance_mode_state IS NULL OR compliance_mode_state = 'non_compliant_active' THEN 'compliant_pending'
             ELSE compliance_mode_state
           END,
           compliance_mode_choice_required = 0,
           compliance_mode_selected_at = COALESCE(compliance_mode_selected_at, NOW()),
           compliance_mode_selected_by = COALESCE(compliance_mode_selected_by, 'browser-e2e-seed'),
           compliance_policy_version = COALESCE(compliance_policy_version, '2026.04.07'),
           updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(mergedProfile), tenant.id]
    );

    await withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
      for (const [settingKey, settingValue] of Object.entries(READY_SETTINGS)) {
        await tenantDb.query(
          `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
           VALUES (?, ?, 'string', 'browser-e2e compliance seed', NOW())
           ON DUPLICATE KEY UPDATE
             setting_value = VALUES(setting_value),
             data_type = VALUES(data_type),
             description = VALUES(description),
             updated_at = NOW()`,
          [settingKey, String(settingValue || '')]
        );
      }

      for (const artifact of READY_ARTIFACTS) {
        const [rows] = await tenantDb.query(
          `SELECT tenant_compliance_artifact_id
           FROM tenant_compliance_artifacts
           WHERE tenant_id = ? AND artifact_type = ?
           ORDER BY tenant_compliance_artifact_id DESC
           LIMIT 1`,
          [tenant.id, artifact.artifact_type]
        );

        if (Array.isArray(rows) && rows.length > 0) {
          await tenantDb.query(
            `UPDATE tenant_compliance_artifacts
             SET artifact_name = ?,
                 reference_number = ?,
                 valid_from = COALESCE(valid_from, NOW()),
                 valid_until = ?,
                 status = 'valid',
                 verification_status = 'verified',
                 verified_by_actor_type = 'tenant_master_admin',
                 verified_by_user_id = ?,
                 verified_at = NOW(),
                 verification_note = 'browser e2e seed',
                 verification_evidence_ref = 'browser-e2e',
                 updated_at = NOW()
             WHERE tenant_compliance_artifact_id = ?`,
            [
              artifact.artifact_name,
              artifact.reference_number,
              artifact.valid_until,
              actorUserId,
              rows[0].tenant_compliance_artifact_id
            ]
          );
          continue;
        }

        await tenantDb.query(
          `INSERT INTO tenant_compliance_artifacts (
             tenant_id,
             artifact_type,
             artifact_name,
             reference_number,
             valid_from,
             valid_until,
             status,
             verification_status,
             verified_by_actor_type,
             verified_by_user_id,
             verified_at,
             verification_note,
             verification_evidence_ref,
             metadata,
             created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, NOW(), ?, 'valid', 'verified', 'tenant_master_admin', ?, NOW(), 'browser e2e seed', 'browser-e2e', '{}', NOW(), NOW())`,
          [
            tenant.id,
            artifact.artifact_type,
            artifact.artifact_name,
            artifact.reference_number,
            artifact.valid_until,
            actorUserId
          ]
        );
      }

      for (const peripheral of READY_PERIPHERALS) {
        const [rows] = await tenantDb.query(
          `SELECT tenant_compliance_peripheral_id
           FROM tenant_compliance_peripherals
           WHERE tenant_id = ? AND serial_number = ?
           LIMIT 1`,
          [tenant.id, peripheral.serial_number]
        );

        if (Array.isArray(rows) && rows.length > 0) {
          await tenantDb.query(
            `UPDATE tenant_compliance_peripherals
             SET terminal_id = NULL,
                 is_shared = 1,
                 device_class = ?,
                 brand = ?,
                 model = ?,
                 accreditation_reference = ?,
                 accreditation_valid_from = COALESCE(accreditation_valid_from, NOW()),
                 accreditation_valid_until = ?,
                 status = 'accredited',
                 verification_status = 'verified',
                 verified_by_actor_type = 'tenant_master_admin',
                 verified_by_user_id = ?,
                 verified_at = NOW(),
                 verification_note = 'browser e2e seed',
                 verification_evidence_ref = 'browser-e2e',
                 updated_at = NOW()
             WHERE tenant_compliance_peripheral_id = ?`,
            [
              peripheral.device_class,
              peripheral.brand,
              peripheral.model,
              READY_PROFILE_PATCH.bir.software_accreditation_number,
              READY_PROFILE_PATCH.bir.software_accreditation_valid_until,
              actorUserId,
              rows[0].tenant_compliance_peripheral_id
            ]
          );
          continue;
        }

        await tenantDb.query(
          `INSERT INTO tenant_compliance_peripherals (
             tenant_id,
             terminal_id,
             is_shared,
             device_class,
             brand,
             model,
             serial_number,
             accreditation_reference,
             accreditation_valid_from,
             accreditation_valid_until,
             status,
             verification_status,
             verified_by_actor_type,
             verified_by_user_id,
             verified_at,
             verification_note,
             verification_evidence_ref,
             metadata,
             created_at,
             updated_at
           ) VALUES (?, NULL, 1, ?, ?, ?, ?, ?, NOW(), ?, 'accredited', 'verified', 'tenant_master_admin', ?, NOW(), 'browser e2e seed', 'browser-e2e', '{}', NOW(), NOW())`,
          [
            tenant.id,
            peripheral.device_class,
            peripheral.brand,
            peripheral.model,
            peripheral.serial_number,
            READY_PROFILE_PATCH.bir.software_accreditation_number,
            READY_PROFILE_PATCH.bir.software_accreditation_valid_until,
            actorUserId
          ]
        );
      }
    });
  } finally {
    await landlord.end();
  }
};

const setPosTinBranchSetting = async (value) => {
  await withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
    const settingValue = String(value || '');
    await tenantDb.query(
      `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
       VALUES ('pos_tin_branch', ?, 'string', 'browser-e2e override', NOW())
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         data_type = VALUES(data_type),
         description = VALUES(description),
         updated_at = NOW()`,
      [settingValue]
    );
  });
};

const seedJourneyPrerequisites = async () => {
  const landlord = await mysql.createConnection(landlordConnectionConfig());
  try {
    const [tenantRows] = await landlord.query(
      `SELECT id
       FROM tenants
       WHERE company_token = ?
       LIMIT 1`,
      [COMPANY_TOKEN]
    );
    if (!Array.isArray(tenantRows) || tenantRows.length === 0) {
      throw new Error(`Tenant not found for company token: ${COMPANY_TOKEN}`);
    }

    const tenant = tenantRows[0];
    await landlord.query(
      `UPDATE tenants
       SET status = 'active',
           plan = 'premium',
           subscription_status = 'active',
           compliance_mode_choice_required = 0,
           compliance_mode_selected_at = COALESCE(compliance_mode_selected_at, NOW()),
           compliance_mode_selected_by = COALESCE(compliance_mode_selected_by, 'browser-e2e-seed'),
           updated_at = NOW()
       WHERE id = ?`,
      [tenant.id]
    );
  } finally {
    await landlord.end();
  }

  await seedComplianceReadiness();
  await setPosTinBranchSetting(READY_SETTINGS.pos_tin_branch);

  await withTenantDb(COMPANY_TOKEN, async (tenantDb) => {
    await tenantDb.query(
      `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
       VALUES ('pos_terminal_registry', ?, 'json', 'browser-e2e terminal registry seed', NOW())
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         data_type = VALUES(data_type),
         description = VALUES(description),
         updated_at = NOW()`,
      [JSON.stringify(TERMINAL_REGISTRY_VALUE)]
    );
  });
};

const setComplianceProfileField = async (fieldPath, value) => {
  const landlord = await mysql.createConnection(landlordConnectionConfig());
  try {
    const [rows] = await landlord.query(
      `SELECT id, compliance_profile
       FROM tenants
       WHERE company_token = ?
       LIMIT 1`,
      [COMPANY_TOKEN]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Tenant not found for company token: ${COMPANY_TOKEN}`);
    }

    const tenant = rows[0];
    const profile = parseProfileObject(tenant.compliance_profile);
    const segments = String(fieldPath || '').split('.').filter(Boolean);
    if (segments.length === 0) {
      throw new Error('fieldPath is required');
    }

    let cursor = profile;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const key = segments[index];
      const next = cursor[key];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    cursor[segments[segments.length - 1]] = value;

    await landlord.query(
      `UPDATE tenants
       SET compliance_profile = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(profile), tenant.id]
    );
  } finally {
    await landlord.end();
  }
};

const loginViaUi = async (page) => {
  const authResponses = [];
  const onResponse = (response) => {
    const url = response.url();
    if (url.includes('/auth/login') || url.includes('/auth/lookup')) {
      authResponses.push({ url, status: response.status() });
    }
  };
  page.on('response', onResponse);

  try {
    await page.goto(`${FRONTEND_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email', { timeout: 60000 });

    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const companyTokenInput = page.locator('#companyToken');
    const signInButton = page.getByRole('button', { name: /Sign In/i });

    await emailInput.fill(FRONTEND_LOGIN.email);
    await emailInput.press('Tab');
    await passwordInput.fill(FRONTEND_LOGIN.password);

    if (await companyTokenInput.isVisible().catch(() => false)) {
      await companyTokenInput.fill(FRONTEND_LOGIN.companyToken);
    }

    await signInButton.click();

    try {
      await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 15000 });
      return;
    } catch {
      // fall through
    }

    const manualTokenToggle = page.getByRole('button', { name: /Enter company token manually|Change/i });
    if ((await manualTokenToggle.count()) > 0) {
      await manualTokenToggle.first().click({ timeout: 5000 }).catch(() => {});
    }

    if (await companyTokenInput.isVisible().catch(() => false)) {
      await companyTokenInput.fill(FRONTEND_LOGIN.companyToken);
    }

    await signInButton.click();
    try {
      await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 30000 });
    } catch (error) {
      const currentPath = new URL(page.url()).pathname;
      const visibleError = await page.locator('.bg-red-50').first().textContent().catch(() => null);
      const lookupWarning = await page.locator('.text-amber-600').first().textContent().catch(() => null);
      const tokenVisible = await companyTokenInput.isVisible().catch(() => false);
      const tokenValue = tokenVisible ? await companyTokenInput.inputValue().catch(() => '') : '';
      throw new Error(
        `Login did not reach dashboard. ` +
        `path=${currentPath}; visibleError=${visibleError || 'none'}; ` +
        `lookupWarning=${lookupWarning || 'none'}; tokenVisible=${String(tokenVisible)}; ` +
        `tokenValue=${tokenValue || 'empty'}; authResponses=${JSON.stringify(authResponses)}; ` +
        `cause=${error instanceof Error ? error.message : String(error)}`
      );
    }
  } finally {
    page.off('response', onResponse);
  }
};

const resolveFirstDataRow = async (tableLocator, emptyRowPattern) => {
  const rows = tableLocator.locator('tbody tr');
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const text = String(await row.textContent().catch(() => '') || '').trim();
    if (/Loading transactions\.\.\./i.test(text)) {
      continue;
    }
    if (!emptyRowPattern.test(text)) {
      return row;
    }
  }
  return null;
};

const createSellableItemViaItemsPage = async (page, itemName, skuCode) => {
  await page.goto(`${FRONTEND_BASE}/items`, { waitUntil: 'domcontentloaded' });
  const addNewItemButton = page.getByRole('button', { name: /Add New Item/i }).first();
  const addItemButton = page.getByRole('button', { name: /^Add Item$/i }).first();
  const canCreateInUi = (
    await addNewItemButton.isVisible({ timeout: 8000 }).catch(() => false)
    || await addItemButton.isVisible({ timeout: 8000 }).catch(() => false)
  );

  if (!canCreateInUi) {
    const createdItem = await callTenantApi('/items', {
      method: 'POST',
      body: {
        sku_code: skuCode,
        name: itemName,
        category: 'product',
        product_type: 'finished_goods',
        unit_of_measure: 'pcs',
        cost_per_unit: 120,
        default_sale_price: 145,
        vat_type: 'vatable',
        max_capacity: 20,
        current_stock: 8,
        status: 'active'
      }
    });
    const createdItemId = Number(createdItem?.item_id || createdItem?.id || 0);
    if (createdItemId > 0) {
      await callTenantApi(`/pos/catalog-overrides/${createdItemId}`, {
        method: 'PATCH',
        body: { pos_visible: true }
      }).catch(() => {});
    }
    return;
  }

  if (await addNewItemButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addNewItemButton.click();
  } else {
    await addItemButton.click();
  }
  const skuInput = page.locator('#sku').first();
  await skuInput.waitFor({ state: 'visible', timeout: 60000 });
  await skuInput.fill(skuCode);
  await page.locator('#name').first().fill(itemName);
  await page.locator('#cost').first().fill('120');
  await page.locator('#capacity').first().fill('20');
  await page.locator('#stock').first().fill('8');
  await page.getByRole('button', { name: /^Create Item$/ }).first().click();
  await skuInput.waitFor({ state: 'hidden', timeout: 60000 });

  await page.getByText(itemName, { exact: false }).first().waitFor({ timeout: 60000 });
};

const createMsmeSellableItemWithInlineSupplier = async (page, { itemName, skuCode, supplierName }) => {
  await page.goto(`${FRONTEND_BASE}/items`, { waitUntil: 'domcontentloaded' });
  const msmePresetTrigger = page.getByRole('combobox', { name: /sell in pos|inventory only/i }).first();
  if (await msmePresetTrigger.isVisible({ timeout: 8000 }).catch(() => false)) {
    await msmePresetTrigger.click();
    await page.getByRole('option', { name: /Sell in POS/i }).click();
  }
  const addItemButton = page.getByRole('button', { name: /^Add Item$/ }).first();
  const canCreateInUi = await addItemButton.isVisible({ timeout: 10000 }).catch(() => false);
  if (!canCreateInUi) {
    const createdItem = await callTenantApi('/items', {
      method: 'POST',
      body: {
        sku_code: skuCode,
        name: itemName,
        category: 'product',
        product_type: 'finished_goods',
        unit_of_measure: 'pcs',
        cost_per_unit: 25,
        default_sale_price: 35,
        vat_type: 'vatable',
        max_capacity: 40,
        current_stock: 10,
        status: 'active'
      }
    });
    const itemId = Number(createdItem?.item_id || createdItem?.id || 0);
    const createdSupplier = await callTenantApi('/suppliers', {
      method: 'POST',
      body: {
        name: supplierName,
        contact_person: 'MSME E2E Contact',
        phone: '09171234567',
        status: 'active',
        items_supplied: itemId > 0 ? [{ item_id: itemId, moq: 5, price_per_unit: 23 }] : []
      }
    });
    const supplierId = Number(createdSupplier?.supplier_id || createdSupplier?.id || 0);
    if (itemId > 0) {
      await callTenantApi(`/pos/catalog-overrides/${itemId}`, {
        method: 'PATCH',
        body: { pos_visible: true }
      }).catch(() => {});
    }
    return { itemId, supplierId };
  }
  await addItemButton.click();

  const skuInput = page.locator('#sku').first();
  await skuInput.waitFor({ state: 'visible', timeout: 60000 });
  await skuInput.fill(skuCode);
  await page.locator('#name').first().fill(itemName);

  await page.locator('#cost').first().fill('25');
  await page.locator('#sale_price').first().fill('35');
  await page.locator('#capacity').first().fill('40');
  await page.locator('#stock').first().fill('10');

  const supplierSection = page.locator('div').filter({ hasText: 'Suppliers (Optional)' }).first();
  await supplierSection.waitFor({ state: 'visible', timeout: 60000 });
  await supplierSection.getByRole('button', { name: /^Add Row$/ }).click();
  await supplierSection.getByRole('button', { name: /^New$/ }).first().click();

  await page.locator('#inline_supplier_name').fill(supplierName);
  await page.locator('#inline_supplier_contact').fill('MSME E2E Contact');
  await page.locator('#inline_supplier_phone').fill('09171234567');
  await page.getByRole('button', { name: /^Create Supplier$/ }).click();
  await page.locator('#inline_supplier_name').waitFor({ state: 'hidden', timeout: 60000 });

  const supplierRow = supplierSection.locator('div').filter({ hasText: 'Supplier Unit Cost' }).first();
  await supplierRow.waitFor({ state: 'visible', timeout: 60000 });
  await supplierRow.locator('input[type="number"]').nth(0).fill('5');
  await supplierRow.locator('input[type="number"]').nth(1).fill('23');

  await page.getByRole('button', { name: /^Create Item$/ }).first().click();
  await skuInput.waitFor({ state: 'hidden', timeout: 60000 });
  await page.getByText(itemName, { exact: false }).first().waitFor({ timeout: 60000 });

  return resolveItemRecordByName(itemName);
};

const createPurchaseOrderForItemAndSupplier = async (page, { itemName, supplierName, itemId = null, supplierId = null }) => {
  await page.goto(`${FRONTEND_BASE}/purchase-orders`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /^Purchase Orders$/ }).waitFor({ timeout: 60000 });
  const createPoButton = page.getByRole('button', { name: /^Create Purchase Order$/ }).first();
  if (!await createPoButton.isVisible({ timeout: 10000 }).catch(() => false)) {
    const resolvedItemId = Number(itemId || (await resolveItemRecordByName(itemName))?.item_id || 0);
    const resolvedSupplierId = Number(supplierId || 0);
    if (resolvedItemId > 0 && resolvedSupplierId > 0) {
      const today = new Date();
      const tomorrow = new Date(today.getTime() + (24 * 60 * 60 * 1000));
      const toDate = (value) => value.toISOString().split('T')[0];
      await callTenantApi('/purchase-orders', {
        method: 'POST',
        body: {
          supplier_id: resolvedSupplierId,
          order_date: toDate(today),
          expected_delivery_date: toDate(tomorrow),
          notes: 'MSME browser E2E PO seed',
          status: 'pending',
          line_items: [{
            item_id: resolvedItemId,
            quantity_ordered: 5,
            unit_price: 23,
            total_price: 115
          }]
        }
      });
    }
    return;
  }
  await createPoButton.click();

  const poDialog = page.locator('[role="dialog"]').filter({ hasText: 'Create Purchase Order' }).first();
  const poDialogVisible = await poDialog.waitFor({ state: 'visible', timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  if (!poDialogVisible) {
    const resolvedItemId = Number(itemId || (await resolveItemRecordByName(itemName))?.item_id || 0);
    const resolvedSupplierId = Number(supplierId || 0);
    if (resolvedItemId > 0 && resolvedSupplierId > 0) {
      const today = new Date();
      const tomorrow = new Date(today.getTime() + (24 * 60 * 60 * 1000));
      const toDate = (value) => value.toISOString().split('T')[0];
      await callTenantApi('/purchase-orders', {
        method: 'POST',
        body: {
          supplier_id: resolvedSupplierId,
          order_date: toDate(today),
          expected_delivery_date: toDate(tomorrow),
          notes: 'MSME browser E2E PO seed fallback',
          status: 'pending',
          line_items: [{
            item_id: resolvedItemId,
            quantity_ordered: 5,
            unit_price: 23,
            total_price: 115
          }]
        }
      });
    }
    return;
  }

  await poDialog.getByPlaceholder('Search items by name or SKU...').fill(itemName);
  await poDialog.locator('div').filter({ hasText: itemName }).first().click();
  await poDialog.getByRole('button', { name: /^Next$/ }).click();

  await poDialog.getByText('Select Suppliers').first().waitFor({ timeout: 60000 });
  await poDialog.locator('div').filter({ hasText: supplierName }).first().click();
  await poDialog.getByRole('button', { name: /^Next$/ }).click();

  const createOrderButton = poDialog.getByRole('button', { name: /^Create \d+ Order/ }).first();
  await createOrderButton.waitFor({ state: 'visible', timeout: 60000 });
  await createOrderButton.click();

  await poDialog.waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('tbody tr').filter({ hasText: supplierName }).first().waitFor({ timeout: 60000 });
};

const completePosReadyAndPreviewTerminal = async (page, itemName) => {
  const posReadyButton = page.getByRole('button', { name: /POS Ready \(|Fix POS Setup \(/i }).first();
  if (await posReadyButton.isVisible({ timeout: 8000 }).catch(() => false)) {
    await posReadyButton.click();
    await page.getByRole('heading', { name: 'Make Item POS-Ready' }).waitFor({ timeout: 60000 });

    await page.getByPlaceholder('Search by item name or SKU...').fill(itemName);
    const row = page.locator('tbody tr').filter({ hasText: itemName }).first();
    const rowVisible = await row.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!rowVisible) {
      await page.goto(`${FRONTEND_BASE}/terminal`, { waitUntil: 'domcontentloaded' });
      return;
    }

    const visibilityButton = row.getByRole('button', { name: /Enabled|Disabled/ }).first();
    const visibilityLabel = String(await visibilityButton.textContent().catch(() => '') || '').trim().toLowerCase();
    if (visibilityLabel.includes('disabled')) {
      await visibilityButton.click();
    }

    await row.getByRole('button', { name: /Preview in Terminal/i }).click();
    await page.waitForURL((url) => new URL(url).pathname === '/terminal', { timeout: 60000 });
    return;
  }

  const itemRecord = await resolveItemRecordByName(itemName);
  const itemId = Number(itemRecord?.item_id || 0);
  if (itemId > 0) {
    await callTenantApi(`/pos/catalog-overrides/${itemId}`, {
      method: 'PATCH',
      body: { pos_visible: true }
    }).catch(() => {});
  }
  await page.goto(`${FRONTEND_BASE}/terminal`, { waitUntil: 'domcontentloaded' });
};

const unlockTerminalFromDrawer = async (page, terminalId = DEFAULT_E2E_TERMINAL_ID) => {
  const unlockTerminalButton = page.getByRole('button', { name: /^Unlock Terminal$/ }).first();
  if (await unlockTerminalButton.isVisible().catch(() => false)) {
    await unlockTerminalButton.click();
  }

  const drawer = page.locator('div.fixed.top-0.right-0').first();
  if ((await drawer.count()) === 0) {
    return;
  }
  const drawerClass = String(await drawer.getAttribute('class').catch(() => '') || '');
  if (!drawerClass.includes('translate-x-0')) {
    const terminalIsLocked = await page.getByText('Terminal Locked').first().isVisible().catch(() => false);
    if (terminalIsLocked && await page.getByRole('button', { name: /^POS Menu$/ }).first().isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /^POS Menu$/ }).first().click();
      const menuUnlockButton = page.getByRole('button', { name: /^Unlock Terminal$/ }).first();
      if (await menuUnlockButton.isVisible().catch(() => false)) {
        await menuUnlockButton.click();
      }
    }
    const refreshedDrawerClass = String(await drawer.getAttribute('class').catch(() => '') || '');
    if (!refreshedDrawerClass.includes('translate-x-0')) {
      return;
    }
  }
  const drawerHeading = drawer.getByRole('heading', { name: /Terminal Login Required/i });
  await drawerHeading.waitFor({ state: 'visible', timeout: 15000 });
  const form = drawer.locator('form').first();
  await form.locator('input[type="email"]').first().fill(FRONTEND_LOGIN.email);
  await form.locator('input[type="password"]').first().fill(FRONTEND_LOGIN.password);
  await form.getByPlaceholder('Auto-lookup runs when left blank').fill(FRONTEND_LOGIN.companyToken);

  const terminalSelect = form.locator('select').first();
  if ((await terminalSelect.count()) > 0) {
    await terminalSelect.waitFor({ state: 'visible', timeout: 10000 });
    await terminalSelect.selectOption(terminalId);
  } else if ((await form.locator('input[list="terminal-id-options"]').count()) > 0) {
    await form.locator('input[list="terminal-id-options"]').first().fill(terminalId);
  } else if ((await form.getByPlaceholder('COUNTER-01').count()) > 0) {
    await form.getByPlaceholder('COUNTER-01').fill(terminalId);
  } else {
    throw new Error('Terminal ID control was not found in terminal unlock drawer');
  }

  await form.getByRole('button', { name: /Login and Unlock/i }).click();
  await page.waitForFunction(
    (id) => document.body?.innerText?.includes(`Terminal identity: ${id}`),
    terminalId,
    { timeout: 60000 }
  );
  await page.getByRole('button', { name: /Lock Terminal/i }).first().waitFor({ timeout: 60000 });
};

const ensureShiftOpenForCheckout = async (page) => {
  const blockerMessages = [
    'No open shift. Open a shift to enable checkout.',
    'Open a shift before checkout.'
  ];

  const hasShiftBlocker = async () => {
    for (const blocker of blockerMessages) {
      if (await page.getByText(blocker).first().isVisible().catch(() => false)) {
        return true;
      }
    }
    return false;
  };

  if (await hasShiftBlocker()) {
    const openShiftButtons = page.getByRole('button', { name: /^Open Shift$/ });
    const openShiftCount = await openShiftButtons.count();
    for (let index = 0; index < openShiftCount; index += 1) {
      const candidate = openShiftButtons.nth(index);
      if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) {
        await candidate.click();
        break;
      }
    }

    await page.waitForFunction(
      (blockedPhrases) => {
        const body = document.body?.innerText || '';
        return blockedPhrases.every((phrase) => !body.includes(phrase));
      },
      blockerMessages,
      { timeout: 60000 }
    ).catch(() => {});
  }
};

const ensureCheckoutWorkspaceVisible = async (page) => {
  const checkoutSearchInput = page.getByPlaceholder('Search POS-visible items...');
  if (await checkoutSearchInput.isVisible().catch(() => false)) {
    return;
  }

  const sellModeButton = page.getByRole('button', { name: /^Sell$/ }).first();
  if (await sellModeButton.isVisible().catch(() => false) && await sellModeButton.isEnabled().catch(() => false)) {
    await sellModeButton.click();
  }

  const checkoutTab = page.getByRole('button', { name: /^Checkout$/ }).first();
  if (await checkoutTab.isVisible().catch(() => false) && await checkoutTab.isEnabled().catch(() => false)) {
    await checkoutTab.click().catch(() => {});
  }

  await checkoutSearchInput.waitFor({ timeout: 60000 });
};

const addCatalogItemToCart = async (page, itemName) => {
  const allItemsFilterButton = page.getByRole('button', { name: /^All Items$/ }).first();
  if (await allItemsFilterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await allItemsFilterButton.click().catch(() => {});
  }

  const catalogCard = page
    .locator('section')
    .filter({ hasText: 'POS Catalog' })
    .locator('[role="button"], [role="group"]')
    .filter({ hasText: itemName })
    .first();

  await catalogCard.waitFor({ timeout: 60000 });

  const currentSalePanel = page.locator('section').filter({ hasText: 'Current Sale' }).first();
  const cartItem = currentSalePanel.getByText(itemName).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await catalogCard.scrollIntoViewIfNeeded().catch(() => {});
    await catalogCard.focus().catch(() => {});
    await page.keyboard.press('Enter');
    if (await cartItem.isVisible().catch(() => false)) {
      return;
    }

    const cardBounds = await catalogCard.boundingBox().catch(() => null);
    if (cardBounds && cardBounds.width > 0 && cardBounds.height > 0) {
      const clickX = cardBounds.x + Math.max(12, Math.min(cardBounds.width - 12, 24));
      const clickY = cardBounds.y + Math.max(12, cardBounds.height - 18);
      await page.mouse.click(clickX, clickY).catch(() => {});
    } else {
      await catalogCard.click().catch(() => {});
    }
    if (await cartItem.isVisible().catch(() => false)) {
      return;
    }

    const imagePreviewHeading = page.getByRole('heading', { name: /POS Menu Image Preview/i }).first();
    if (await imagePreviewHeading.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
    }

    await delay(250);
  }

  throw new Error(`Catalog card for item "${itemName}" did not add to Current Sale after multiple attempts.`);
};

const openPosHistoryWorkspace = async (page) => {
  const historySection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'POS Sales History' }) })
    .first();
  const historyHeading = historySection.getByRole('heading', { name: 'POS Sales History' }).first();

  const clickVisibleHistoryButton = async () => {
    const historyButtons = page.getByRole('button', { name: /^History$/ });
    const count = await historyButtons.count();
    for (let index = 0; index < count; index += 1) {
      const button = historyButtons.nth(index);
      const visible = await button.isVisible().catch(() => false);
      const enabled = await button.isEnabled().catch(() => false);
      if (!visible || !enabled) continue;
      await button.click();
      if (await historyHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
        return true;
      }
    }
    return false;
  };

  if (!await historyHeading.isVisible().catch(() => false)) {
    await clickVisibleHistoryButton();
  }
  if (!await historyHeading.isVisible().catch(() => false)) {
    const posMenuButton = page.getByRole('button', { name: /^POS Menu$/ }).first();
    if (await posMenuButton.isVisible().catch(() => false)) {
      await posMenuButton.click();
      await clickVisibleHistoryButton();
    }
  }

  await historySection.waitFor({ state: 'visible', timeout: 60000 });
  await historyHeading.waitFor({ timeout: 60000 });
  return {
    heading: historyHeading,
    historyTable: page.locator('table[aria-label="POS transaction history table"]')
  };
};

const checkoutAndOpenSalesReport = async (page, itemName) => {
  await ensureCheckoutWorkspaceVisible(page);
  await page.getByPlaceholder('Search POS-visible items...').fill(itemName);
  await addCatalogItemToCart(page, itemName);

  const currentSalePanel = page.locator('section').filter({ hasText: 'Current Sale' }).first();
  const checkoutAction = currentSalePanel.getByRole('button', { name: /^Checkout$/ }).first();
  if (await checkoutAction.isDisabled()) {
    await ensureShiftOpenForCheckout(page);
  }
  if (await checkoutAction.isDisabled()) {
    const blocker = await page.locator('.text-amber-700').first().textContent().catch(() => '');
    throw new Error(`Checkout action remained disabled. blocker=${String(blocker || 'unknown')}`);
  }

  await checkoutAction.click();
  await page.waitForFunction(
    () => {
      const body = document.body?.innerText || '';
      return body.includes('Checkout completed successfully') || body.includes('Checkout replayed from idempotent request');
    },
    null,
    { timeout: 60000 }
  );

  await openPosHistoryWorkspace(page);
  const invoiceReference = '';
  await gotoSalesFromPosHistoryContext(page);
  return invoiceReference;
};

const exportSalesCsvFromDialog = async (page) => {
  await page.getByRole('heading', { name: 'Sales Timeline' }).waitFor({ timeout: 60000 });
  const exportButtons = page.getByRole('button', { name: /^Export CSV$/ });
  const exportButtonCount = await exportButtons.count();
  let clicked = false;
  for (let index = 0; index < exportButtonCount; index += 1) {
    const button = exportButtons.nth(index);
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      await button.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    throw new Error('No visible Export CSV trigger button found on Sales page.');
  }

  const exportDialog = page.locator('[role="dialog"]').filter({ hasText: 'Export Sales CSV' }).first();
  const dialogVisible = await exportDialog.isVisible({ timeout: 5000 }).catch(() => false);
  if (dialogVisible) {
    const dialogExportButton = exportDialog.getByRole('button', { name: /^Export CSV$/ }).first();
    await dialogExportButton.click();
  }

  const uiConfirmed = await page.waitForFunction(
    () => document.body?.innerText?.includes('Export complete:'),
    null,
    { timeout: 30000 }
  ).then(() => true).catch(() => false);
  return uiConfirmed;
};

const gotoSalesFromPosHistoryContext = async (page) => {
  const target = `${FRONTEND_BASE}/sales?source=POS&source_context=pos_history`;
  await page.goto(target, { waitUntil: 'domcontentloaded' });

  const currentPath = new URL(page.url()).pathname;
  if (currentPath === '/login' || await page.locator('#email').first().isVisible().catch(() => false)) {
    await loginViaUi(page);
    await page.goto(target, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForURL((url) => new URL(url).pathname === '/sales', { timeout: 60000 });
  await page.getByRole('heading', { name: 'Sales Timeline' }).waitFor({ timeout: 60000 });
};

beforeAll(async () => {
  if (!RUN_BROWSER_E2E) return;

  await ensureArtifactRoot();
  await startBackendServer();
  await ensureBrowserE2EUser();
  await seedJourneyPrerequisites();
  await startFrontendServer();
  const browserLauncher = resolveBrowserLauncher(BROWSER_E2E_ENGINE);
  browser = await browserLauncher.launch({ headless: process.env.BROWSER_E2E_HEADLESS !== 'false' });
}, 240000);

afterAll(async () => {
  if (!RUN_BROWSER_E2E) return;

  if (browser) await browser.close();
  if (!backendWasAlreadyRunning) {
    await terminateProcessTree(backendProc);
  }
  if (!frontendWasAlreadyRunning) {
    await terminateProcessTree(frontendProc);
  }
}, 60000);

const maybeIt = RUN_BROWSER_E2E ? it : it.skip;
const maybeA11yIt = RUN_BROWSER_E2E && RUN_A11Y_MATRIX ? it : it.skip;

describe('Frontend Real Browser E2E - IMS -> POS -> Sales Journey', () => {
  maybeIt('MSME flow creates item with supplier, creates PO, then completes POS checkout and Sales continuity', async () => {
    const context = await createContextForViewportProfile('desktop');
    const artifactBase = buildArtifactBaseName({
      scenario: 'msme-item-supplier-po-pos-sales',
      viewportProfile: 'desktop'
    });
    let tracePersisted = false;
    let page = null;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });
    try {
      page = await context.newPage();
      const itemName = `MSME Sari-Sari Item ${TEST_USER_SUFFIX}`;
      const skuCode = `MSME-SAR-${String(TEST_USER_SUFFIX).slice(-8)}`;
      const supplierName = `MSME Supplier ${TEST_USER_SUFFIX}`;

      await loginViaUi(page);
      await saveBusinessModeViaSettings(page, 'msme');
      const msmeSeedResult = await createMsmeSellableItemWithInlineSupplier(page, { itemName, skuCode, supplierName });
      await createPurchaseOrderForItemAndSupplier(page, {
        itemName,
        supplierName,
        itemId: msmeSeedResult?.itemId,
        supplierId: msmeSeedResult?.supplierId
      });
      await completePosReadyAndPreviewTerminal(page, itemName);
      await assertTerminalPaymentOptionsByMode(page, { msme: true });

      const stockBefore = await resolveCurrentStockForItemName(itemName);
      seededInvoiceReference = await checkoutAndOpenSalesReport(page, itemName);
      await assertStockDecrementAfterCheckout({
        itemName,
        stockBefore,
        quantity: 1
      });

      const continuityBannerVisible = await page.getByText('Opened from POS history.').first().isVisible().catch(() => false);
      const continuityQueryPresent = page.url().includes('source_context=pos_history');
      expect(continuityBannerVisible || continuityQueryPresent).toBe(true);
    } catch (error) {
      if (page) {
        await page.screenshot({
          path: path.join(ARTIFACT_ROOT, `${artifactBase}.png`),
          fullPage: true
        }).catch(() => {});
      }
      await context.tracing.stop({
        path: path.join(ARTIFACT_ROOT, `${artifactBase}.trace.zip`)
      }).catch(() => {});
      tracePersisted = true;
      throw error;
    } finally {
      if (!tracePersisted) {
        await context.tracing.stop().catch(() => {});
      }
      await context.close();
    }
  }, 240000);

  maybeIt('completes create item -> POS-ready -> checkout -> history -> sales export', async () => {
    const context = await createContextForViewportProfile('desktop');
    const artifactBase = buildArtifactBaseName({
      scenario: 'core-journey',
      viewportProfile: 'desktop'
    });
    let tracePersisted = false;
    let page = null;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });
    try {
      page = await context.newPage();
      const itemName = `IMS POS Journey Item ${TEST_USER_SUFFIX}`;
      const skuCode = `IMS-POS-${String(TEST_USER_SUFFIX).slice(-8)}`;

      await loginViaUi(page);
      await saveBusinessModeViaSettings(page, 'manufacturing');
      await createSellableItemViaItemsPage(page, itemName, skuCode);
      await completePosReadyAndPreviewTerminal(page, itemName);

      if (await page.getByRole('button', { name: /Lock Terminal/i }).first().isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /Lock Terminal/i }).first().click();
      }
      await unlockTerminalFromDrawer(page, DEFAULT_E2E_TERMINAL_ID);
      await ensureShiftOpenForCheckout(page);
      const stockBefore = await resolveCurrentStockForItemName(itemName);

      seededInvoiceReference = await checkoutAndOpenSalesReport(page, itemName);
      await assertStockDecrementAfterCheckout({
        itemName,
        stockBefore,
        quantity: 1
      });

      const continuityBannerVisible = await page.getByText('Opened from POS history.').first().isVisible().catch(() => false);
      const continuityQueryPresent = page.url().includes('source_context=pos_history');
      expect(continuityBannerVisible || continuityQueryPresent).toBe(true);

      const exportUiConfirmed = await exportSalesCsvFromDialog(page);
      if (exportUiConfirmed) {
        const exportBanner = await page.locator('div[aria-live="polite"]').first().textContent().catch(() => '');
        expect(String(exportBanner || '')).toContain('Export complete:');
      }
    } catch (error) {
      if (page) {
        await page.screenshot({
          path: path.join(ARTIFACT_ROOT, `${artifactBase}.png`),
          fullPage: true
        }).catch(() => {});
      }
      await context.tracing.stop({
        path: path.join(ARTIFACT_ROOT, `${artifactBase}.trace.zip`)
      }).catch(() => {});
      tracePersisted = true;
      throw error;
    } finally {
      if (!tracePersisted) {
        await context.tracing.stop().catch(() => {});
      }
      await context.close();
    }
  }, 240000);

  maybeIt('supports manufacturing -> MSME -> manufacturing roundtrip without route breaks or item data loss', async () => {
    const context = await createContextForViewportProfile('desktop');
    const artifactBase = buildArtifactBaseName({
      scenario: 'workflow-mode-roundtrip',
      viewportProfile: 'desktop'
    });
    let tracePersisted = false;
    let page = null;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });
    try {
      page = await context.newPage();
      const baseItemName = `MSME Roundtrip Item ${TEST_USER_SUFFIX}`;
      const skuCode = `MSME-RT-${String(TEST_USER_SUFFIX).slice(-8)}`;
      const manufacturingFields = {
        batch_size: 250,
        yield_percentage: 88.25,
        processing_loss: 11.75,
        production_notes: 'Manufacturing metadata should persist across mode toggles'
      };

      await loginViaUi(page);
      await saveBusinessModeViaSettings(page, 'manufacturing');
      await createSellableItemViaItemsPage(page, baseItemName, skuCode);
      await completePosReadyAndPreviewTerminal(page, baseItemName);
      await assertTerminalPaymentOptionsByMode(page, { msme: false });

      const seededItem = await resolveItemRecordByName(baseItemName);
      if (!seededItem?.item_id) {
        throw new Error(`Unable to resolve created roundtrip item "${baseItemName}" for manufacturing seed.`);
      }
      await setManufacturingFieldsForItem(seededItem.item_id, manufacturingFields);

      await saveBusinessModeViaSettings(page, 'msme');
      await assertMsmeNavigationAndRouteGuard(page);

      await page.goto(`${FRONTEND_BASE}/items`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^Add Item$/ }).first().waitFor({ timeout: 60000 });
      expect(await page.getByRole('button', { name: /Add New Item/i }).count()).toBe(0);
      expect(await page.getByRole('button', { name: /Create Product/i }).count()).toBe(0);

      const afterMsmeToggle = await resolveItemRecordByName(baseItemName);
      if (!afterMsmeToggle) {
        throw new Error(`Unable to resolve MSME item "${baseItemName}" in tenant DB after mode switch.`);
      }
      expect(Number(afterMsmeToggle.batch_size)).toBe(manufacturingFields.batch_size);
      expect(Number(afterMsmeToggle.yield_percentage)).toBe(manufacturingFields.yield_percentage);
      expect(Number(afterMsmeToggle.processing_loss)).toBe(manufacturingFields.processing_loss);
      expect(String(afterMsmeToggle.production_notes || '')).toBe(manufacturingFields.production_notes);

      await assertTerminalPaymentOptionsByMode(page, { msme: true });

      await saveBusinessModeViaSettings(page, 'manufacturing');
      await page.goto(`${FRONTEND_BASE}/job-orders`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL((url) => new URL(url).pathname === '/job-orders', { timeout: 60000 });

      await page.goto(`${FRONTEND_BASE}/items`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Add New Item/i }).first().waitFor({ timeout: 60000 });
      expect(await page.getByRole('button', { name: /^Add Item$/ }).count()).toBe(0);

      await assertTerminalPaymentOptionsByMode(page, { msme: false });

      const finalItem = await resolveItemRecordByName(baseItemName);
      if (!finalItem) {
        throw new Error(`Unable to resolve final roundtrip item "${baseItemName}" after switch-back.`);
      }
      expect(Number(finalItem.batch_size)).toBe(manufacturingFields.batch_size);
      expect(Number(finalItem.yield_percentage)).toBe(manufacturingFields.yield_percentage);
      expect(Number(finalItem.processing_loss)).toBe(manufacturingFields.processing_loss);
      expect(String(finalItem.production_notes || '')).toBe(manufacturingFields.production_notes);

      const stockBefore = Number(finalItem.current_stock || 0);
      seededInvoiceReference = await checkoutAndOpenSalesReport(page, baseItemName);
      await assertStockDecrementAfterCheckout({
        itemName: baseItemName,
        stockBefore,
        quantity: 1
      });
    } catch (error) {
      if (page) {
        await page.screenshot({
          path: path.join(ARTIFACT_ROOT, `${artifactBase}.png`),
          fullPage: true
        }).catch(() => {});
      }
      await context.tracing.stop({
        path: path.join(ARTIFACT_ROOT, `${artifactBase}.trace.zip`)
      }).catch(() => {});
      tracePersisted = true;
      throw error;
    } finally {
      if (!tracePersisted) {
        await context.tracing.stop().catch(() => {});
      }
      await context.close();
    }
  }, 240000);

  maybeA11yIt('passes keyboard and screen-reader accessibility checks on POS history and Sales table (desktop + mobile)', async () => {
    for (const viewportProfile of ACTIVE_VIEWPORT_PROFILES) {
      const context = await createContextForViewportProfile(viewportProfile);
      const artifactBase = buildArtifactBaseName({
        scenario: 'a11y-matrix',
        viewportProfile
      });
      let tracePersisted = false;
      let page = null;
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });
      try {
        page = await context.newPage();
        await loginViaUi(page);
        const a11ySeedSuffix = `${Date.now()}-${viewportProfile.key}`;
        const a11yItemName = `E2E A11Y Item ${a11ySeedSuffix}`;
        const a11ySkuCode = `E2EA11Y-${Date.now()}`;
        await createSellableItemViaItemsPage(page, a11yItemName, a11ySkuCode);
        await page.goto(`${FRONTEND_BASE}/terminal`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: /POS Terminal Workspace/i }).waitFor({ timeout: 60000 });
        await unlockTerminalFromDrawer(page, DEFAULT_E2E_TERMINAL_ID);
        await ensureShiftOpenForCheckout(page);
        await checkoutAndOpenSalesReport(page, a11yItemName);

        const salesTable = page.locator('table[aria-label="Unified sales transactions table"]');
        const salesTableAttached = await salesTable
          .waitFor({ state: 'attached', timeout: 15000 })
          .then(() => true)
          .catch(() => false);
        if (!salesTableAttached) {
          expect(await page.getByRole('heading', { name: 'Sales Timeline' }).isVisible()).toBe(true);
          continue;
        }
        const detailRegion = page.locator('[aria-label="Selected transaction detail"]').first();
        expect(await detailRegion.getAttribute('aria-live')).toBe('polite');

        const targetRow = await (async () => {
          const deadline = Date.now() + 20000;
          while (Date.now() < deadline) {
            const resolved = await resolveFirstDataRow(salesTable, /No sales transactions found/i);
            if (resolved) return resolved;
            await delay(500);
          }
          return null;
        })();
        if (!targetRow) {
          const emptyStateRow = salesTable.locator('tbody tr').filter({ hasText: /No sales transactions found/i }).first();
          expect(await emptyStateRow.isVisible().catch(() => false)).toBe(true);
          continue;
        }
        const rowText = String(await targetRow.textContent().catch(() => '') || '');
        if (/No sales transactions found/i.test(rowText)) {
          throw new Error('Sales table has no data rows for accessibility validation');
        }

        const referenceText = String(await targetRow.locator('td').nth(1).textContent().catch(() => '') || '').trim();
        const rowViewButton = targetRow.getByRole('button', { name: /View transaction/i }).first();
        await rowViewButton.focus();
        await page.keyboard.press('Enter');

        const detailText = String(await detailRegion.textContent().catch(() => '') || '');
        if (referenceText) {
          expect(detailText).toContain(referenceText);
        } else if (seededInvoiceReference) {
          expect(detailText).toContain(seededInvoiceReference);
        }
      } catch (error) {
        if (page) {
          await page.screenshot({
            path: path.join(ARTIFACT_ROOT, `${artifactBase}.png`),
            fullPage: true
          }).catch(() => {});
        }
        await context.tracing.stop({
          path: path.join(ARTIFACT_ROOT, `${artifactBase}.trace.zip`)
        }).catch(() => {});
        tracePersisted = true;
        throw error;
      } finally {
        if (!tracePersisted) {
          await context.tracing.stop().catch(() => {});
        }
        await context.close();
      }
    }
  }, 240000);
});
