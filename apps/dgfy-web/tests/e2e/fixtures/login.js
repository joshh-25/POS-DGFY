import { expect } from '@playwright/test';

export async function signIn(page, credentials) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
  await page.getByLabel('DGFY or Cashier Email').fill(credentials.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);

  await page.getByRole('button', { name: /^sign in$/i }).click();
  const companySelect = page.getByLabel('Company');
  await expect(companySelect).toBeVisible();
  const requestedCompany = process.env.E2E_TEST_COMPANY_NAME?.trim();
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
  await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();
}
