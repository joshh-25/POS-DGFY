import { expect, test as setup } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const DASHBOARD_ADDRESSES_PATH = '/map-dgfy/account/addresses';
const storefrontURL = process.env.E2E_BASE_URL || 'http://localhost:5175';
const AUTH_STORAGE_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json');
const testEmail = String(process.env.E2E_TEST_USER_EMAIL || process.env.TEST_EMAIL || '').trim();
const testPassword = String(process.env.E2E_TEST_USER_PASSWORD || process.env.TEST_PASSWORD || '');

async function assertAuthenticatedAddressPage(page) {
  await page.goto(new URL(DASHBOARD_ADDRESSES_PATH, storefrontURL).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Saved Locations' })).toBeVisible({ timeout: 30_000 });
}

setup('establishes a real customer session for address QA', async ({ page, browser }) => {
  if (existsSync(AUTH_STORAGE_STATE_PATH)) {
    const storedContext = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH });
    try {
      const storedPage = await storedContext.newPage();
      await assertAuthenticatedAddressPage(storedPage);
    } finally {
      await storedContext.close();
    }
    return;
  }

  if (!testEmail || !testPassword) {
    throw new Error(
      'Authenticated address QA requires a local session or credentials. Add E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD to the ignored apps/dgfy-storefront/.env.e2e file, then rerun this project.'
    );
  }

  await page.goto(new URL(`/login?return_to=${encodeURIComponent(DASHBOARD_ADDRESSES_PATH)}`, storefrontURL).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible({ timeout: 30_000 });
  await page.locator('#dgfyLoginEmail').fill(testEmail);
  await page.locator('#dgfyLoginPassword').fill(testPassword);

  const loginResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/dgfy/auth/login',
    { timeout: 20_000 }
  );
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  if (loginResponse.status() !== 200) {
    throw new Error(`DGFY login failed with HTTP ${loginResponse.status()}. Check the local E2E account and API.`);
  }

  await assertAuthenticatedAddressPage(page);
  await mkdir(path.dirname(AUTH_STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STORAGE_STATE_PATH });
});
