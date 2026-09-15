import { test, expect } from '@playwright/test';

test.describe('Security - POS input handling', () => {
  test('Password input is masked by default', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const password = page.getByRole('textbox', { name: 'Password' });
    await expect(password).toBeVisible();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('SQL-injection-shaped credentials do not expose database details', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('#dgfy-pos-email').fill("admin'OR'1'='1'--@test.com");
    await page.locator('#dgfy-pos-password').fill('admin');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/SQL|SELECT|error in your SQL syntax/i);
    await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
  });

  test('Extremely long credential buffers do not crash the login UI', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const hugeBuffer = 'A'.repeat(5000);
    await page.locator('#dgfy-pos-email').fill(`${hugeBuffer}@test.com`);
    await page.locator('#dgfy-pos-password').fill(hugeBuffer);
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });
});
