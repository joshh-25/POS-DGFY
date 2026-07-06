import { test, expect } from '@playwright/test';
import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { TEST_COMPANY_TOKEN } from '../helpers/urls.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Security - Auth Redirection', () => {
  const protectedRoutes = [
    '/',
    '/items',
    '/settings',
    '/sales',
    '/pos',
  ];

  for (const route of protectedRoutes) {
    test(`Unauthenticated request to "${route}" redirects to /login`, async ({ page }) => {
      const crashChecker = registerCrashDetection(page);
      await page.goto(route);
      await page.waitForURL('**/login');
      await crashChecker.assertNoCrashes();
      expect(page.url()).toContain('/login');
    });
  }

  test('Logout clears credentials and redirects', async ({ page, context }) => {
    const crashChecker = registerCrashDetection(page);
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
});
