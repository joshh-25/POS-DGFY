import { expect } from '@playwright/test';

export async function signIn(page, credentials, options = {}) {
  const authResponses = [];
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (/\/api\/v1\/(auth|dgfy\/(auth|account)|settings|pos\/)/i.test(pathname)) {
      authResponses.push(`${response.status()} ${pathname}`);
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
  await page.getByLabel('DGFY or Cashier Email').fill(credentials.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);

  await page.getByRole('button', { name: /^sign in$/i }).click();
  const companySelect = page.getByLabel('Company');
  const catalogHeading = page.getByRole('heading', { name: 'POS Catalog' });
  const loginHeading = page.getByRole('heading', { name: 'Terminal Login Required' });
  const waitForTenantStep = async (timeout) => {
    try {
      await expect.poll(async () => (
        await companySelect.isVisible().catch(() => false)
        || !(await loginHeading.isVisible().catch(() => false))
      ), { timeout }).toBe(true);
      return true;
    } catch {
      return false;
    }
  };
  let tenantStepReady = await waitForTenantStep(20_000);
  if (!tenantStepReady && await page.getByRole('button', { name: /^sign in$/i }).isVisible().catch(() => false)) {
    await page.getByLabel('DGFY or Cashier Email').fill(credentials.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    tenantStepReady = await waitForTenantStep(10_000);
  }
  if (!tenantStepReady) {
    throw new Error(`POS login did not reach company selection or POS. API responses: ${authResponses.slice(-30).join(' | ')}`);
  }

  if (await companySelect.isVisible().catch(() => false)) {
    await expect(companySelect).toBeEnabled();
    const requestedCompany = options.companyName?.trim() || process.env.E2E_TEST_COMPANY_NAME?.trim();
    if (requestedCompany) {
      await companySelect.selectOption({ label: requestedCompany });
    } else {
      await companySelect.selectOption({ index: 1 });
    }
    await expect(companySelect).toHaveValue(/.+/);
    const tenantSessionResponse = page.waitForResponse(
      (response) => /\/api\/v1\/dgfy\/auth\/tenant-session$/.test(new URL(response.url()).pathname),
      { timeout: 20_000 }
    );
    await page.getByRole('button', { name: /^continue to pos$/i }).click();
    const sessionResponse = await tenantSessionResponse;
    expect(sessionResponse.status(), `tenant session failed with HTTP ${sessionResponse.status()}`).toBe(200);
  } else {
    await expect(catalogHeading).toBeVisible();
  }
  const openShiftHeading = page.getByRole('heading', { name: 'Open Shift', exact: true });
  if (await loginHeading.isVisible().catch(() => false)) {
    const continueButton = page.getByRole('button', { name: /^continue to pos$/i });
    if (await continueButton.isVisible().catch(() => false) && await continueButton.isEnabled().catch(() => false)) {
      await continueButton.click();
    }
  }
  // Admin and cashier sessions can legitimately land on the authenticated POS
  // workspace with the Open Shift dialog still visible. Treat that dialog as
  // proof that tenant-session completed instead of misclassifying a stale
  // login heading in the background as an auth failure.
  if (await loginHeading.isVisible().catch(() => false)) {
    try {
      await expect.poll(async () => (
        await openShiftHeading.isVisible().catch(() => false)
        || !(await loginHeading.isVisible().catch(() => false))
      ), { timeout: 20_000 }).toBe(true);
    } catch {
      throw new Error(`POS login drawer remained open after authentication. API responses: ${authResponses.slice(-30).join(' | ')}`);
    }
  }
  await expect(catalogHeading).toBeVisible();
}

export async function signInBackOffice(page, credentials, options = {}) {
  const requestedCompany = options.companyName?.trim() || process.env.E2E_TEST_COMPANY_NAME?.trim();
  const currentUrl = page.url();
  if (!/#\/backoffice\/login(?:[?]|$)/.test(currentUrl)) {
    await page.goto('/?view=reports#/backoffice/overview', { waitUntil: 'domcontentloaded' });
  }

  await expect(page.getByRole('heading', { name: 'Back Office sign in' })).toBeVisible();
  await page.getByLabel('DGFY account email').fill(credentials.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to Back Office', exact: true }).click();

  await expect(page.getByLabel('Business')).toBeVisible({ timeout: 20_000 });
  const businessSelect = page.getByLabel('Business');
  if (requestedCompany) {
    await businessSelect.selectOption({ label: requestedCompany });
  }
  await page.getByRole('button', { name: 'Open Back Office', exact: true }).click();
  await expect(page.getByText('Business back office', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
}
