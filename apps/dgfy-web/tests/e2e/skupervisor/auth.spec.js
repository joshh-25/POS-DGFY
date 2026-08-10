import { test, expect } from '@playwright/test';
import { SKUPERVISOR_URL, TEST_COMPANY_TOKEN } from '../helpers/urls.js';
import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Skupervisor Authentication Tests', () => {
  test('Empty inputs validation shows errors', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/login');
    await crashChecker.assertNoCrashes();
    
    // Attempt submitting without email
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    // HTML5 validation or message check
    const emailInput = page.locator('input[type="email"]');
    const isRequired = await emailInput.getAttribute('required');
    expect(isRequired).not.toBeNull();
  });

  test('Invalid login shows safe error message', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/login');
    await crashChecker.assertNoCrashes();
    
    await loginToApp(page, 'wronguser@test.com', 'WrongPassword123!', TEST_COMPANY_TOKEN);
    
    // Validate custom error message is visible and safe (no raw DB trace/info)
    const errorBanner = page.locator('div.bg-red-50, p.text-red-700, .text-red-600');
    await expect(errorBanner.first()).toBeVisible();
    const errorText = await errorBanner.first().innerText();
    expect(errorText).not.toContain('SQL');
    expect(errorText).not.toContain('database');
    expect(errorText).not.toContain('Index');
  });

  test('Successful login and redirect path', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/login');
    await crashChecker.assertNoCrashes();
    
    await loginToApp(page, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
    
    // Should login successfully and navigate to Dashboard page /
    await page.waitForURL('**/');
    await expect(page).toHaveURL(/.*\//);
  });
});
