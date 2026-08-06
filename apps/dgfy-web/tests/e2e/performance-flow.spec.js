import { test, expect } from '@playwright/test';

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
    // Authenticate
    const email = process.env.VITE_TEST_USER_EMAIL || 'admin@tenant-a.com';
    const password = process.env.VITE_TEST_USER_PASSWORD || 'Admin123!';
    
    await page.goto('/login');
    
    // Set up lookup request promise before triggering blur
    const lookupPromise = page.waitForResponse(
      res => res.url().includes('/auth/lookup'),
      { timeout: 5000 }
    ).catch(() => null);
    
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('input[type="email"]').blur();
    
    await lookupPromise; // Wait for async API company token lookup
    
    const tokenInput = page.locator('input[id="companyToken"]');
    if (await tokenInput.isVisible()) {
      await tokenInput.fill('token-tenant-a');
    }
    
    await page.getByRole('button', { name: /Sign In/i }).click();
    await page.waitForURL('**/');

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
