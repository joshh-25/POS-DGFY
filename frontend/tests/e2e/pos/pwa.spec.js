import { test, expect } from '@playwright/test';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('POS PWA Audits', () => {
  test('POS links its manifest file', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/pos');
    await crashChecker.assertNoCrashes();
    
    // POS app shell should link the PWA manifest
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', /.*manifest\.webmanifest/);
  });
});
