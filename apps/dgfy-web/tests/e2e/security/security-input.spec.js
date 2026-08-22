import { test, expect } from '@playwright/test';

const configuredBaseUrl = process.env.E2E_BASE_URL || 'http://localhost:5174';
const isPosSurface = process.env.E2E_AUTH_SURFACE === 'pos' || /:5174(?:\/|$)/.test(configuredBaseUrl);

test.describe('Security - Input Sanitization & Password Constraints', () => {
  test('Password inputs are masked by default', async ({ page }) => {
    await page.goto('/login');
    const pwdInput = page.locator('input[type="password"]');
    await expect(pwdInput).toBeVisible();
    
    const inputType = await pwdInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  test('Form rejects or handles special character SQL-injection patterns gracefully', async ({ page }) => {
    await page.goto('/login');

    if (isPosSurface) {
      await page.locator('#dgfy-pos-email').fill("admin'OR'1'='1'--@test.com");
      await page.locator('#dgfy-pos-password').fill('admin');
      await page.getByRole('button', { name: /Sign In/i }).click();

      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('SQL');
      expect(bodyText).not.toContain('SELECT');
      expect(bodyText).not.toContain('error in your SQL syntax');
      await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
      return;
    }

    // Set up lookup request promise before triggering blur
    const lookupPromise = page.waitForResponse(
      res => res.url().includes('/auth/lookup'),
      { timeout: 5000 }
    ).catch(() => null);
    
    // Inject classic SQL injection string with valid email format (no spaces to pass client-side regex)
    await page.locator('input[type="email"]').fill("admin'OR'1'='1'--@test.com");
    await page.locator('input[type="password"]').fill('admin');
    await page.locator('input[type="email"]').blur();
    
    await lookupPromise; // Wait for lookup to complete and show token field
    
    const tokenInput = page.locator('input[id="companyToken"]');
    if (await tokenInput.isVisible()) {
      await tokenInput.fill("'; DROP TABLE users; --");
    }
    
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    // Form should reject without throwing unhandled exceptions or exposing private database/server stacks in error messages
    const errorMsg = page.locator('div.bg-red-50, p.text-red-700, .text-red-600');
    await expect(errorMsg.first()).toBeVisible();
    
    const text = await errorMsg.first().innerText();
    expect(text).not.toContain('SQL');
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('error in your SQL syntax');
  });

  test('Form handles extremely long buffers gracefully without crashing UI', async ({ page }) => {
    await page.goto('/login');

    const hugeBuffer = 'A'.repeat(5000);
    const emailInput = isPosSurface ? page.locator('#dgfy-pos-email') : page.locator('input[type="email"]');
    const passwordInput = isPosSurface ? page.locator('#dgfy-pos-password') : page.locator('input[type="password"]');
    await emailInput.fill(`${hugeBuffer}@test.com`);
    await passwordInput.fill(hugeBuffer);
    
    // App should not crash and should still be functional
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });
});
