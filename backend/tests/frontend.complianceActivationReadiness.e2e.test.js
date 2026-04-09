import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium, firefox, webkit, devices } from 'playwright';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import path from 'path';
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
const COMPANY_TOKEN = 'token-original';
const BROWSER_E2E_ENGINE = String(process.env.BROWSER_E2E_ENGINE || 'chromium').trim().toLowerCase();
const parseCsvList = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const requestedViewportProfiles = parseCsvList(process.env.BROWSER_E2E_VIEWPORTS || 'desktop,mobile');
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
const TEST_USER_SUFFIX = Date.now();
const FRONTEND_LOGIN = {
  email: `compliance.e2e.${TEST_USER_SUFFIX}@tenant.test`,
  password: 'Admin123!',
  username: `compliance_e2e_${TEST_USER_SUFFIX}`,
  companyToken: COMPANY_TOKEN
};

let backendProc;
let frontendProc;
let browser;
let backendWasAlreadyRunning = false;
let frontendWasAlreadyRunning = false;
let backendShutdownExpected = false;
let frontendShutdownExpected = false;
let actorUserId = null;

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
  return browser.newContext(contextOptions);
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

const openCompliancePage = async (page) => {
  await page.goto(`${FRONTEND_BASE}/settings?tab=compliance`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Lifecycle' }).waitFor({ timeout: 60000 });
};

beforeAll(async () => {
  if (!RUN_BROWSER_E2E) return;

  await startBackendServer();
  await ensureBrowserE2EUser();
  await startFrontendServer();
  const browserLauncher = resolveBrowserLauncher(BROWSER_E2E_ENGINE);
  browser = await browserLauncher.launch({ headless: process.env.BROWSER_E2E_HEADLESS !== 'false' });
}, 180000);

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

describe('Frontend Real Browser E2E - Compliance Activation Readiness', () => {
  maybeIt('shows blocker payload for an incomplete profile in real browser session', async () => {
    await seedComplianceReadiness();
    await setComplianceProfileField('npc.dpo_name', '');

    for (const viewportProfile of ACTIVE_VIEWPORT_PROFILES) {
      const context = await createContextForViewportProfile(viewportProfile);
      try {
        const page = await context.newPage();
        await loginViaUi(page);
        const profileResponsePromise = page.waitForResponse((response) => (
          response.url().includes('/api/v1/compliance/profile')
          && response.request().method() === 'GET'
          && response.status() === 200
        ), { timeout: 60000 });
        await openCompliancePage(page);
        const profileResponse = await profileResponsePromise;
        const profilePayload = await profileResponse.json();
        expect(profilePayload?.data?.checklist?.missing_profile_fields || []).toContain('npc.dpo_name');
        expect(profilePayload?.data?.checklist?.ready_for_compliant_activation).toBe(false);
        expect(await page.getByRole('heading', { name: 'Lifecycle' }).isVisible()).toBe(true);
      } finally {
        await context.close();
      }
    }
  }, 120000);

  maybeIt('reaches compliant active mode when checklist is ready and confirmation is submitted', async () => {
    await seedComplianceReadiness();
    await setPosTinBranchSetting('123-456-789-000');

    for (const viewportProfile of ACTIVE_VIEWPORT_PROFILES) {
      const context = await createContextForViewportProfile(viewportProfile);
      try {
        const page = await context.newPage();

        await loginViaUi(page);
        await openCompliancePage(page);

        await page.getByText('Checklist ready: Yes').waitFor({ state: 'visible', timeout: 60000 });

        const modeLine = page.locator('p', { hasText: 'Mode:' }).first();
        const modeText = (await modeLine.textContent()) || '';
        const alreadyActive = /Compliant active/i.test(modeText);

        const activateInput = page.getByPlaceholder('ACTIVATE COMPLIANT');
        const activateButton = page.getByRole('button', { name: /Activate compliant mode/i });

        if (!alreadyActive) {
          await activateInput.fill('ACTIVATE COMPLIANT');
          expect(await activateButton.isDisabled()).toBe(false);
          await activateButton.click();

          await page.waitForFunction(() => {
            const lines = Array.from(document.querySelectorAll('p'));
            return lines.some((node) => {
              const text = node.textContent || '';
              return text.includes('Mode:') && text.includes('Compliant active');
            });
          }, null, { timeout: 60000 });

          const modeAfter = (await page.locator('p', { hasText: 'Mode:' }).first().textContent()) || '';
          expect(modeAfter).toMatch(/Compliant active/i);
        } else {
          expect(modeText).toMatch(/Compliant active/i);
        }
      } finally {
        await context.close();
      }
    }
  }, 120000);
});
