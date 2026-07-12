import { test, expect } from '@playwright/test';

test('DGFY POS terminal is accessible', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveTitle('DGFY POS');
  await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
  await expect(page.getByLabel('DGFY or Cashier Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
});
