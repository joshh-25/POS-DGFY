import dotenv from 'dotenv';
import path from 'node:path';
import { createRequire } from 'node:module';

dotenv.config({ path: path.resolve(process.cwd(), '../dgfy-api/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e') });

const apiRequire = createRequire(path.resolve(process.cwd(), '../dgfy-api/package.json'));
const { QueryTypes, Sequelize } = apiRequire('sequelize');
const { chromium, expect } = await import('@playwright/test');

const dbOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  logging: false
};
const landlord = new Sequelize(
  process.env.DB_NAME || 'sku_inventory_manager',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  dbOptions
);
const tenantName = process.env.E2E_TEST_COMPANY_NAME?.trim();
const credentials = {
  email: process.env.E2E_TEST_USER_EMAIL?.trim(),
  password: process.env.E2E_TEST_USER_PASSWORD
};
if (!tenantName || !credentials.email || !credentials.password) {
  throw new Error('Local E2E company and credentials must be available through apps/dgfy-pos/.env.e2e.');
}

const tenantRows = await landlord.query(
  'SELECT db_name FROM tenants WHERE name = :tenantName AND status = \'active\' LIMIT 1',
  { replacements: { tenantName }, type: QueryTypes.SELECT }
);
if (tenantRows.length !== 1 || !tenantRows[0].db_name) {
  throw new Error('The configured local E2E company did not resolve to one active tenant database.');
}

const tenant = new Sequelize(
  tenantRows[0].db_name,
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  dbOptions
);
const states = [
  { name: 'blank', value: '', expected: 'not_configured' },
  { name: 'vat_registered', value: 'VAT_REGISTERED', expected: 'configured' },
  { name: 'unknown', value: 'legacy_unknown', expected: 'needs_review' }
];
const result = { tenant: 'redacted-local-tenant', original: null, states: [], cleanup: null };
const opisBaseURL = process.env.PHASE560_OPIS_BASE_URL || 'http://127.0.0.1:5176';
let browser;

const readSetting = async () => {
  const rows = await tenant.query(
    "SELECT setting_value, data_type FROM system_settings WHERE setting_key = 'pos_taxpayer_type' LIMIT 1",
    { type: QueryTypes.SELECT }
  );
  return rows[0] || null;
};

const writeSetting = async (value) => {
  await tenant.query(
    "UPDATE system_settings SET setting_value = :value WHERE setting_key = 'pos_taxpayer_type'",
    { replacements: { value } }
  );
};

const readOpisProjection = async () => {
  const context = await browser.newContext({ baseURL: opisBaseURL });
  const page = await context.newPage();
  const errors = [];
  let authenticated = false;
  let tenantRequestHeaders = null;
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (authenticated && message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500 || (authenticated && response.status() >= 400)) {
      errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    }
  });
  page.on('request', (request) => {
    if (!/\/api\/v1\//.test(new URL(request.url()).pathname)) return;
    const headers = request.headers();
    if (headers.authorization && headers['x-company-token']) {
      tenantRequestHeaders = {
        authorization: headers.authorization,
        'x-company-token': headers['x-company-token'],
        'x-dgfy-app-surface': headers['x-dgfy-app-surface'] || 'opis'
      };
    }
  });

  try {
    await page.goto('/dgfy/auth', { waitUntil: 'domcontentloaded' });
    await page.locator('#dgfyLoginEmail').fill(credentials.email);
    await page.locator('#dgfyLoginPassword').fill(credentials.password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/dgfy\/companies|\/$/, { timeout: 20_000 });

    if (new URL(page.url()).pathname === '/dgfy/companies') {
      const companyButton = page.getByRole('button').filter({ hasText: tenantName }).first();
      await expect(companyButton).toBeVisible({ timeout: 20_000 });
      const tenantSession = page.waitForResponse(
        (response) => /\/api\/v1\/dgfy\/auth\/tenant-session$/.test(new URL(response.url()).pathname),
        { timeout: 20_000 }
      );
      await companyButton.click();
      const response = await tenantSession;
      expect(response.status()).toBe(200);
    }

    await expect(page).not.toHaveURL(/\/dgfy\/auth|\/dgfy\/companies/, { timeout: 20_000 });
    authenticated = true;
    if (!tenantRequestHeaders) throw new Error('OPIS did not dispatch an authenticated tenant request.');
    const settingsResponse = await page.evaluate(async (headers) => {
      const response = await fetch('/api/v1/settings', { credentials: 'include', headers });
      const payload = await response.json().catch(() => ({}));
      const data = payload?.data || {};
      return {
        status: response.status,
        raw: data?.pos_taxpayer_type?.value ?? null,
        resolved: data?.pos_taxpayer_type_resolved?.value ?? null,
        readiness: data?.pos_fiscal_setup_readiness?.value || null
      };
    }, tenantRequestHeaders);
    expect(settingsResponse.status).toBe(200);
    return {
      projection: settingsResponse,
      errors: [...new Set(errors)],
      url: page.url()
    };
  } finally {
    await context.close();
  }
};

try {
  await tenant.authenticate();
  result.original = await readSetting();
  if (!result.original) throw new Error('The local tenant has no pos_taxpayer_type setting row.');
  browser = await chromium.launch({ headless: true });

  for (const state of states) {
    await writeSetting(state.value);
    const persisted = await readSetting();
    const opis = await readOpisProjection();
    result.states.push({
      name: state.name,
      persistedValue: persisted?.setting_value,
      expected: state.expected,
      opis: {
        projection: opis.projection,
        errors: opis.errors,
        url: opis.url
      }
    });
  }
} finally {
  try {
    if (result.original) {
      await writeSetting(result.original.setting_value);
      const restored = await readSetting();
      result.cleanup = {
        restoredValue: restored?.setting_value,
        restoredDataType: restored?.data_type,
        matchesOriginal: restored?.setting_value === result.original.setting_value
      };
    }
  } finally {
    if (browser) await browser.close();
    await tenant.close();
    await landlord.close();
  }
}

console.log(JSON.stringify(result));
