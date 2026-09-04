import { test, expect } from '@playwright/test';
import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers/auth.js';
import { TEST_COMPANY_TOKEN } from './helpers/urls.js';

test.describe('E2E Performance Audits', () => {
  test('Login page loads and registers timing successfully', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    
    // Wait for the Sign In button to be actionable
    await page.getByRole('button', { name: /Sign In/i }).waitFor({ state: 'attached' });
    
    const loadTime = Date.now() - startTime;
    console.log(`⏱️ Login page E2E load time: ${loadTime}ms`);
    
    // Threshold validation: Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('Page navigation transition performance is fast', async ({ page }) => {
    await page.goto('/login');
    await loginToApp(page, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
    await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();

    // Time transition to items page
    const startTime = Date.now();
    await page.goto('/items');
    await page.locator('h1, h2').first().waitFor();
    const transitionTime = Date.now() - startTime;
    console.log(`⏱️ Navigation transition time to /items: ${transitionTime}ms`);
    
    // Threshold validation: Should load within 5 seconds for cold-start local DB connection pools
    expect(transitionTime).toBeLessThan(5000);
  });
});
