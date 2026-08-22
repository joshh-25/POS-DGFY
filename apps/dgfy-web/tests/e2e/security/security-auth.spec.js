import { test, expect } from '@playwright/test';
import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { TEST_COMPANY_TOKEN } from '../helpers/urls.js';
import { signIn } from '../fixtures/login.js';
import { registerCrashDetection } from '../helpers/assertions.js';

const configuredBaseUrl = process.env.E2E_BASE_URL || 'http://localhost:5174';
const isPosSurface = process.env.E2E_AUTH_SURFACE === 'pos' || /:5174(?:\/|$)/.test(configuredBaseUrl);

test.describe('Security - Auth Boundaries', () => {
  const protectedRoutes = [
    '/',
    '/items',
    '/settings',
    '/sales',
    '/pos',
  ];

  for (const route of protectedRoutes) {
    test(`Unauthenticated request to "${route}" stays within the protected-surface boundary`, async ({ page }) => {
      const crashChecker = registerCrashDetection(page);
      await page.goto(route);
      await crashChecker.assertNoCrashes();
      if (isPosSurface) {
        await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
        return;
      }
      await page.waitForURL('**/login');
      expect(page.url()).toContain('/login');
    });
  }

  test('Session cleanup returns the surface to its unauthenticated boundary', async ({ page, context }) => {
    const crashChecker = registerCrashDetection(page);
    if (isPosSurface) {
      await signIn(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
      await page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
      await context.clearCookies();
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
      await crashChecker.assertNoCrashes();
      return;
    }

    await page.goto('/login');
    await loginToApp(page, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
    await page.waitForURL('**/');
    await crashChecker.assertNoCrashes();
 
    // Clear cookies to simulate actual session deletion (destroying refresh token cookie)
    await context.clearCookies();
    
    // Trigger logout locally by visiting /login which runs the cleanup logic.
    await page.goto('/login');
    
    // Wait for the login page to fully mount and execute React cleanup
    await page.locator('input[type="email"]').waitFor({ state: 'visible' });
    
    // Attempting to visit / after visiting /login should redirect to /login
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('Protected POS API rejects unauthenticated requests', async ({ page, request }) => {
    test.skip(!isPosSurface, 'This assertion belongs to the standalone POS surface.');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
    const response = await request.get(`${process.env.E2E_API_URL || 'http://localhost:5000'}/api/v1/users/me`);
    expect(response.status()).toBe(401);
  });
});
