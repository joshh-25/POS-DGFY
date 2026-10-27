import dotenv from 'dotenv';
import path from 'node:path';
import { createRequire } from 'node:module';

dotenv.config({ path: path.resolve(process.cwd(), '../dgfy-api/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e') });

const apiRequire = createRequire(path.resolve(process.cwd(), '../dgfy-api/package.json'));
const { QueryTypes, Sequelize } = apiRequire('sequelize');
const { chromium, expect } = await import('@playwright/test');
const posBaseURL = process.env.E2E_BASE_URL || 'http://localhost:5174';

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
].filter((state) => !process.env.PHASE560_STATE || state.name === process.env.PHASE560_STATE);
const result = { tenant: 'redacted-local-tenant', original: null, states: [], cleanup: null };
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

const attachRuntimeCapture = (page) => {
  const errors = [];
  let authenticated = false;
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (authenticated && message.type() === 'error' && !message.text().includes('ERR_NETWORK_ACCESS_DENIED')) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    if (authenticated && response.status() === 401) errors.push(`HTTP 401: ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    if (!/ERR_ABORTED|ERR_NETWORK_ACCESS_DENIED/.test(failure)) {
      errors.push(`requestfailed: ${failure}: ${new URL(request.url()).pathname}`);
    }
  });
  return {
    markAuthenticated: () => { authenticated = true; },
    errors
  };
};

const selectCompanyAndStartSession = async (page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('DGFY or Cashier Email').fill(credentials.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  const company = page.getByLabel('Company');
  await expect(company).toBeVisible({ timeout: 20_000 });
  const tagName = await company.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === 'select') {
    await company.selectOption({ label: tenantName });
    await expect(company).toHaveValue(/.+/);
  } else {
    await company.click();
    await page.getByRole('option').filter({ hasText: tenantName }).first().click();
    await expect(company).toHaveAttribute('data-company-value', /.+/);
  }

  const tenantSession = page.waitForResponse(
    (response) => /\/api\/v1\/dgfy\/auth\/tenant-session$/.test(new URL(response.url()).pathname),
    { timeout: 20_000 }
  );
  await page.getByRole('button', { name: /^continue to pos$/i }).click();
  const response = await tenantSession;
  expect(response.status()).toBe(200);
};

const readPosState = async () => {
  const context = await browser.newContext({ baseURL: posBaseURL });
  const page = await context.newPage();
  const runtime = attachRuntimeCapture(page);
  const output = {};
  let step = 'start';
  try {
    step = 'select company and start session';
    await selectCompanyAndStartSession(page);
    runtime.markAuthenticated();

    const branchDialog = page.getByTestId('pos-branch-selector-dialog');
    step = 'wait for branch dialog';
    const branchOpened = await branchDialog
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (branchOpened) {
      step = 'close branch dialog';
      await branchDialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(branchDialog).toBeHidden({ timeout: 8_000 });
    }
    step = 'check branch dialog remains closed';
    await page.waitForTimeout(1_200);
    output.branchClosedAfterHydrationWait = !(await branchDialog.isVisible().catch(() => false));

    const skipShift = page.getByRole('button', { name: 'Skip for Admin', exact: true });
    step = 'skip admin shift prompt';
    if (await skipShift.isVisible().catch(() => false)) {
      await skipShift.click();
      await expect(skipShift).toBeHidden({ timeout: 8_000 });
      await expect(page.locator('[data-dialog-root="true"]')).toHaveCount(0, { timeout: 8_000 });
      await page.waitForTimeout(500);
      output.adminShiftSkipped = true;
    } else {
      output.adminShiftSkipped = false;
    }

    step = 'open POS Settings';
    await page.getByTestId('pos-nav-settings').click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 8_000 });
    step = 'open POS Setup tab';
    await page.getByRole('tab', { name: 'POS Setup', exact: true }).click();
    step = 'open Business and Receipts tab';
    await page.getByRole('tab', { name: 'Business & Receipts', exact: true }).click();
    step = 'read fiscal readiness';
    const readiness = page.getByTestId('fiscal-setup-readiness');
    await expect(readiness).toBeVisible({ timeout: 12_000 });
    output.state = await readiness.getAttribute('data-readiness-state');
    output.url = page.url();
  } catch (error) {
    output.failureStep = step;
    output.failure = error instanceof Error ? error.message.split('\n')[0] : String(error);
    output.url = page.url();
    output.visibleTabs = await page.getByRole('tab').allTextContents().catch(() => []);
    output.visibleHeadings = await page.getByRole('heading').allTextContents().catch(() => []);
    output.bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 2500);
    output.branchVisibleAtFailure = await page.getByTestId('pos-branch-selector-dialog').isVisible().catch(() => false);
  } finally {
    output.errors = [...new Set(runtime.errors)];
    await context.close();
  }
  return output;
};

try {
  await tenant.authenticate();
  result.original = await readSetting();
  if (!result.original) throw new Error('The local tenant has no pos_taxpayer_type setting row.');
  browser = await chromium.launch({ headless: true });

  for (const state of states) {
    await writeSetting(state.value);
    const persisted = await readSetting();
    const pos = await readPosState();
    result.states.push({
      name: state.name,
      persistedValue: persisted?.setting_value,
      expected: state.expected,
      pos: {
        state: pos.state,
        failure: pos.failure,
        failureStep: pos.failureStep,
        url: pos.url,
        errors: pos.errors,
        visibleTabs: pos.visibleTabs,
        visibleHeadings: pos.visibleHeadings,
        bodyText: pos.bodyText,
        branchVisibleAtFailure: pos.branchVisibleAtFailure,
        branchClosedAfterHydrationWait: pos.branchClosedAfterHydrationWait,
        adminShiftSkipped: pos.adminShiftSkipped
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
