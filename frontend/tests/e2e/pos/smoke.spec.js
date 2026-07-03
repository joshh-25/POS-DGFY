import { test, expect } from '@playwright/test';
import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { TEST_COMPANY_TOKEN } from '../helpers/urls.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('POS Smoke & Crash Regression Tests', () => {
  test('POS loads and has no runtime crashes', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    
    // Redirects to login when unauthenticated
    await page.goto('/pos');
    await page.waitForURL('**/login');
    await crashChecker.assertNoCrashes();

    // Authenticate
    await loginToApp(page, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
    await page.waitForURL('**/');
    
    // Navigate to POS terminal
    await page.goto('/pos');
    await page.waitForTimeout(1000); // Allow catalog to fetch and mount
    
    // Verify no React boundaries or ReferenceErrors exist
    await crashChecker.assertNoCrashes();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
