import { test, expect } from '@playwright/test';
import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { TEST_COMPANY_TOKEN } from '../helpers/urls.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Skupervisor Navigation and Layout Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await loginToApp(page, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
    await page.waitForURL('**/');
  });

  test('Navigate to Items page', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/items');
    await crashChecker.assertNoCrashes();
    await expect(page.locator('h1:has-text("Items")').first()).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Navigate to Settings page', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/settings');
    await crashChecker.assertNoCrashes();
    await expect(page.locator('h1:has-text("Settings")').first()).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Navigate to Sales page', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/sales');
    await crashChecker.assertNoCrashes();
    await expect(page.getByRole('heading', { name: /Sales/i }).or(page.locator('h1, h2'))).toBeVisible();
  });

  test('Navigate to Terminal Page', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/terminal');
    await crashChecker.assertNoCrashes();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
