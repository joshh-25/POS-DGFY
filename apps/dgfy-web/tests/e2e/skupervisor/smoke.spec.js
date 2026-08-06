import { test, expect } from '@playwright/test';
import { SKUPERVISOR_URL } from '../helpers/urls.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Skupervisor Smoke Tests', () => {
  test('Login Page loads successfully', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/login');
    await crashChecker.assertNoCrashes();
    
    // Check main headers/text
    await expect(page).toHaveTitle(/SKUpervisor/i);
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    
    // Check input fields
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    
    // Check Sign In button
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('Register Page loads successfully', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/register');
    await crashChecker.assertNoCrashes();
    
    await expect(page.getByRole('heading', { name: /Create Account/i })).toBeVisible();
  });
});
