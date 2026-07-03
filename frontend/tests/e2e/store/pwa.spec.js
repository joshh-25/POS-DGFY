import { test, expect } from '@playwright/test';
import { STOREFRONT_URL } from '../helpers/urls.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Storefront PWA Audits', () => {
  test('Storefront links its manifest file', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto(STOREFRONT_URL);
    await crashChecker.assertNoCrashes();
    
    // Storefront app shell should link the PWA manifest
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', /.*manifest\.webmanifest/);
  });
});
