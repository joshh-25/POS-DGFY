import { expect } from '@playwright/test';

export async function signIn(page, credentials, options = {}) {
  const expectedPostcondition = options.expectedPostcondition;
  if (!['branch-selection', 'pos-catalog'].includes(expectedPostcondition)) {
    throw new Error('POS sign-in requires an explicit expectedPostcondition: branch-selection or pos-catalog.');
  }

  const authResponses = [];
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (/\/api\/v1\/(auth|dgfy\/(auth|account)|settings|pos\/|onboarding\/status)/i.test(pathname)) {
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
  const branchSelectionHeading = page.getByRole('heading', { name: /^(Choose|Confirm) your branch$/ });
  const branchSelectionDialog = page.getByTestId('pos-branch-selector-dialog');
  const loginDrawer = page.locator('.dgfy-pos-terminal-lock-drawer');
  const waitForTenantStep = async (timeout) => {
    try {
      await expect.poll(async () => (
        await companySelect.isVisible().catch(() => false)
        || (
          await catalogHeading.isVisible().catch(() => false)
          && !await loginHeading.isVisible().catch(() => false)
        )
        || await branchSelectionHeading.isVisible().catch(() => false)
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
    const tagName = await companySelect.evaluate((element) => element.tagName.toLowerCase());
    if (tagName === 'select') {
      if (requestedCompany) {
        await companySelect.selectOption({ label: requestedCompany });
      } else {
        await companySelect.selectOption({ index: 1 });
      }
    } else if (!await companySelect.getAttribute('data-company-value')) {
      await companySelect.click();
      const companies = page.getByRole('option').filter({ hasNotText: 'Select accessible company' });
      if (requestedCompany) {
        await companies.filter({ hasText: requestedCompany }).first().click();
      } else {
        await companies.first().click();
      }
    }
    if (tagName === 'select') await expect(companySelect).toHaveValue(/.+/);
    else await expect(companySelect).toHaveAttribute('data-company-value', /.+/);
    const tenantSessionResponse = page.waitForResponse(
      (response) => /\/api\/v1\/dgfy\/auth\/tenant-session$/.test(new URL(response.url()).pathname),
      { timeout: 20_000 }
    );
    await page.getByRole('button', { name: /^continue to pos$/i }).click();
    const sessionResponse = await tenantSessionResponse;
    expect(sessionResponse.status(), `tenant session failed with HTTP ${sessionResponse.status()}`).toBe(200);
  }

  if (expectedPostcondition === 'branch-selection') {
    await expect(branchSelectionDialog).toBeVisible();
    await expect(branchSelectionHeading).toBeVisible();
    return {
      postcondition: 'branch-selection',
      routeStatuses: authResponses
    };
  }

  await expect(branchSelectionDialog).toBeHidden();
  await expect(catalogHeading).toBeVisible();
  const openShiftHeading = page.getByRole('heading', { name: 'Open Shift', exact: true });
  // The drawer stays mounted when closed, so `isVisible()` on its heading does
  // not prove it is open: the off-screen transform leaves that check true.
  // Confirm the drawer closed or an Open Shift dialog appeared after the
  // tenant-session response before treating login as complete.
  try {
    await expect.poll(async () => (
      String(await loginDrawer.getAttribute('class').catch(() => '') || '').includes('translate-x-full')
      || await openShiftHeading.isVisible().catch(() => false)
    ), { timeout: 20_000 }).toBe(true);
  } catch {
    throw new Error(`POS login drawer remained open after authentication. API responses: ${authResponses.slice(-30).join(' | ')}`);
  }
  await expect(catalogHeading).toBeVisible();
  return {
    postcondition: 'pos-catalog',
    routeStatuses: authResponses
  };
}
