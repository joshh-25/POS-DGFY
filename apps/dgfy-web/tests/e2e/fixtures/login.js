import { expect } from '@playwright/test';

export async function signIn(page, credentials) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
  await page.getByLabel('DGFY or Cashier Email').fill(credentials.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);

  await page.getByRole('button', { name: /^sign in$/i }).click();
  const companySelect = page.getByLabel('Company');
  await expect(companySelect).toBeVisible();
  await companySelect.selectOption({ index: 1 });
  await page.getByRole('button', { name: /^continue to pos$/i }).click();
  await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();
}
