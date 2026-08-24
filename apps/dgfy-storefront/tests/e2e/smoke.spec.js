import { test, expect } from '@playwright/test';
import { STOREFRONT_URL } from './helpers/urls.js';
import { registerCrashDetection } from './helpers/assertions.js';

test.describe('Storefront Smoke & Crash Tests', () => {
  test('Storefront landing page loads successfully without crash', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto(STOREFRONT_URL);
    await crashChecker.assertNoCrashes();

    // Verify page container is visible and has body content
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
