import { expect } from '@playwright/test';

export async function signIn(page, credentials, options = {}) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
  await page.getByLabel('DGFY or Cashier Email').fill(credentials.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);

  await page.getByRole('button', { name: /^sign in$/i }).click();
  const companySelect = page.getByRole('button', { name: 'Company' });
  await expect(companySelect).toBeVisible();
  const requestedCompany = options.companyName?.trim() || process.env.E2E_TEST_COMPANY_NAME?.trim();
  await companySelect.click();
  if (requestedCompany) {
    await page.getByRole('option', { name: requestedCompany, exact: true }).click();
  } else {
    await page.getByRole('option').nth(1).click();
  }
  await expect(companySelect).toHaveAttribute('data-company-value', /.+/);
  const tenantSessionResponse = page.waitForResponse(
    (response) => /\/api\/v1\/dgfy\/auth\/tenant-session$/.test(new URL(response.url()).pathname),
    { timeout: 20_000 }
  );
  await page.getByRole('button', { name: /^continue to pos$/i }).click();
  const sessionResponse = await tenantSessionResponse;
  expect(sessionResponse.status(), `tenant session failed with HTTP ${sessionResponse.status()}`).toBe(200);
  await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();
}
