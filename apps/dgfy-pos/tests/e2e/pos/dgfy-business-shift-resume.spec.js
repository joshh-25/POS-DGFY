import { expect, test } from '@playwright/test';
import { hasTestCredentials, testCredentials } from '../fixtures/test-credentials.js';

const storefrontUrl = process.env.STOREFRONT_URL || 'http://localhost:5175';
const companyName = String(process.env.E2E_TEST_COMPANY_NAME || '').trim();

test.use({ serviceWorkers: 'block' });

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function registerRuntimeDiagnostics(page, diagnostics) {
  page.on('pageerror', (error) => diagnostics.push({ type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.push({
        type: 'console.error',
        message: message.text(),
        url: message.location().url || null
      });
    }
  });
  page.on('requestfailed', (request) => diagnostics.push({
    type: 'requestfailed',
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText || 'unknown request failure'
  }));
  page.on('response', (response) => {
    if (response.status() >= 500 || (
      response.status() === 401
      && new URL(response.url()).pathname.endsWith('/api/v1/pos/device/status')
    )) {
      diagnostics.push({
        type: 'http',
        status: response.status(),
        method: response.request().method(),
        url: response.url()
      });
    }
  });
}

test.describe('DGFY Business active-shift handoff', () => {
  test('returns the same cashier to Resume Shift instead of Open Shift', async ({ context, page }, testInfo) => {
    test.skip(!hasTestCredentials, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');
    test.skip(!companyName, 'E2E_TEST_COMPANY_NAME is required.');

    const diagnostics = [];
    registerRuntimeDiagnostics(page, diagnostics);

    try {
      const accountPath = '/map-dgfy/account';
      await page.goto(`${storefrontUrl}/login?return_to=${encodeURIComponent(accountPath)}`, {
        waitUntil: 'domcontentloaded'
      });
      await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible();
      await page.locator('#dgfyLoginEmail').fill(testCredentials.email);
      await page.locator('#dgfyLoginPassword').fill(testCredentials.password);
      const loginResponsePromise = page.waitForResponse((response) => (
        new URL(response.url()).pathname === '/api/v1/dgfy/auth/login'
        && response.request().method() === 'POST'
      ));
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      const loginResponse = await loginResponsePromise;
      expect(loginResponse.status()).toBe(200);
      await page.goto(`${storefrontUrl}${accountPath}`, { waitUntil: 'domcontentloaded' });

      const companiesResponse = await page.request.get('/api/v1/dgfy/account/companies');
      expect(companiesResponse.status()).toBe(200);
      const companiesPayload = await readJson(companiesResponse);
      const company = (companiesPayload?.data?.companies || [])
        .find((entry) => String(entry?.company_name || '').trim() === companyName);
      expect(company, `DGFY account cannot access ${companyName}.`).toBeTruthy();

      const activeTerminal = {
        terminal_id: 'COUNTER-01',
        location_id: 1,
        is_active: true,
        is_default: true
      };

      const cashierUserPayload = {
        success: true,
        data: {
          user_id: Number(company?.tenant_user_id || 1),
          username: testCredentials.email.split('@')[0],
          email: testCredentials.email,
          role: 'cashier',
          is_master_admin: false,
          permissions: ['pos:view', 'pos:transact', 'pos:shift_open', 'pos:shift_close'],
          company: {
            id: company.tenant_id,
            name: companyName
          }
        },
        message: 'User profile retrieved successfully'
      };
      const settingsPayload = {
        success: true,
        data: {
          settings: {
            pos_terminal_registry: { value: [activeTerminal] },
            pos_terminal_registry_mode: { value: 'enforce' }
          }
        }
      };
      const activeShiftPayload = {
        success: true,
        data: {
          shift: {
            pos_terminal_shift_id: 987654321,
            cashier_id: Number(company?.tenant_user_id || 1),
            terminal_id: activeTerminal.terminal_id,
            location_id: Number(activeTerminal.location_id),
            status: 'open'
          },
          cash_summary: null
        }
      };
      const businessHeading = page.getByRole('heading', { name: 'Your businesses', exact: true });
      if (!(await businessHeading.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: /Business/ }).click();
      }
      await expect(businessHeading).toBeVisible();

      const companyCard = page.locator('article').filter({
        has: page.getByRole('heading', { name: companyName, exact: true })
      });
      await expect(companyCard).toBeVisible();
      await companyCard.getByRole('button', { name: 'Go to POS', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Open DGFY POS?' })).toBeVisible();
      diagnostics.length = 0;
      await context.route('**/api/v1/users/me*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(cashierUserPayload)
      }));
      await context.route('**/api/v1/mobile-pos/bootstrap/settings*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settingsPayload)
      }));
      await context.route('**/api/v1/pos/terminal/shifts/current*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activeShiftPayload)
      }));

      context.on('page', (openedPage) => registerRuntimeDiagnostics(openedPage, diagnostics));
      const newPosPagePromise = context.waitForEvent('page');
      await page.getByRole('button', { name: 'Open POS in new tab', exact: true }).click();
      const newPosPage = await newPosPagePromise;
      await newPosPage.waitForLoadState('domcontentloaded');

      await expect(newPosPage.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();
      await expect(newPosPage.getByRole('heading', { name: 'Resume Shift', exact: true })).toBeVisible();
      await expect(newPosPage.getByRole('heading', { name: 'Open Shift', exact: true })).toHaveCount(0);
      await expect(newPosPage.getByText(
        'Your active shift was found. Resume the same terminal, cart, totals, and cashier session.',
        { exact: true }
      )).toBeVisible();
    } finally {
      await testInfo.attach('dgfy-business-shift-resume-diagnostics.json', {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: 'application/json'
      });
      const deviceStatusUnauthorized = diagnostics.some((entry) => (
        entry.type === 'http'
        && entry.status === 401
        && new URL(entry.url).pathname.endsWith('/api/v1/pos/device/status')
      ));
      const unexpectedDiagnostics = diagnostics.filter((entry) => !(
        entry.type === 'http'
        && entry.status === 401
        && new URL(entry.url).pathname.endsWith('/api/v1/pos/device/status')
      ) && !(
        deviceStatusUnauthorized
        && entry.type === 'console.error'
        && entry.message === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
      ) && !(
        entry.type === 'requestfailed'
        && entry.method === 'GET'
        && entry.error === 'net::ERR_ABORTED'
        && [
          '/api/v1/pos/catalog/events',
          '/api/v1/items/folders',
          '/api/v1/storefront/discovery',
          '/api/v1/dgfy/customer/events'
        ].includes(new URL(entry.url).pathname)
      ) && !(
        entry.type === 'requestfailed'
        && entry.method === 'GET'
        && entry.error === 'net::ERR_BLOCKED_BY_ORB'
        && new URL(entry.url).pathname.startsWith('/uploads/storefront-assets/')
      ) && !(
        entry.type === 'console.error'
        && entry.message === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
        && entry.url
        && [
          '/uploads/storefront-assets/',
          '/uploads/storefront-catalog/'
        ].some((pathPrefix) => new URL(entry.url).pathname.startsWith(pathPrefix))
      ));
      expect(
        unexpectedDiagnostics,
        `runtime diagnostics detected: ${JSON.stringify(unexpectedDiagnostics)}`
      ).toEqual([]);
    }
  });
});
