import { test, expect } from '@playwright/test';
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('POS Smoke & Crash Regression Tests', () => {
  test('POS loads and has no runtime crashes', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    
    // Standalone POS keeps the terminal lock drawer on the POS route when unauthenticated.
    await page.goto('/pos');
    await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
    await crashChecker.assertNoCrashes();

    // Authenticate through the standalone POS terminal lock drawer.
    const dgfyLoginResponse = page.waitForResponse(
      (response) => /\/api\/v1\/dgfy\/auth\/login$/.test(new URL(response.url()).pathname),
      { timeout: 15_000 }
    );
    await page.locator('#dgfy-pos-email').fill(TEST_USER_EMAIL);
    await page.locator('#dgfy-pos-password').fill(TEST_USER_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    const loginResponse = await dgfyLoginResponse;
    expect(loginResponse.status()).toBe(200);

    // Navigate to POS terminal
    await page.waitForTimeout(1000); // Allow catalog to fetch and mount
    
    // Verify no React boundaries or ReferenceErrors exist
    await crashChecker.assertNoCrashes();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
