import { TEST_COMPANY_TOKEN } from './urls.js';

export async function loginToApp(page, email, password, token = TEST_COMPANY_TOKEN) {
  // Set up lookup request promise before triggering blur
  const lookupPromise = page.waitForResponse(
    res => res.url().includes('/auth/lookup'),
    { timeout: 5000 }
  ).catch(() => null);
  
  const emailInput = page.locator('input[type="email"], #dgfy-pos-email').first();
  await emailInput.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await emailInput.blur();
  
  await lookupPromise; // Wait for async API company token lookup
  
  const tokenInput = page.locator('input[id="companyToken"]');
  // Wait up to 2.5 seconds for the token input to appear if lookup is slow or falls back to manual entry
  await tokenInput.waitFor({ state: 'visible', timeout: 2500 }).catch(() => null);
  
  if (await tokenInput.isVisible()) {
    await tokenInput.fill(token);
  }
  
  await page.getByRole('button', { name: /Sign In/i }).click();
}
export const TEST_USER_EMAIL = process.env.E2E_TEST_USER_EMAIL
  || process.env.VITE_TEST_USER_EMAIL
  || 'admin@tenant-a.com';
export const TEST_USER_PASSWORD = process.env.E2E_TEST_USER_PASSWORD
  || process.env.VITE_TEST_USER_PASSWORD
  || 'Admin123!';
