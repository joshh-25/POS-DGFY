import { test, expect } from '@playwright/test';
import { registerCrashDetection } from '../helpers/assertions.js';

const apiUrl = process.env.E2E_API_URL || 'http://localhost:5000';

test.describe('Security - POS authentication boundaries', () => {
  for (const route of ['/', '/terminal']) {
    test(`Unauthenticated request to "${route}" stays at the terminal login boundary`, async ({ page }) => {
      const crashChecker = registerCrashDetection(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
      await crashChecker.assertNoCrashes();
    });
  }

  test('Protected POS API rejects unauthenticated requests', async ({ page, request }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
    const response = await request.get(`${apiUrl}/api/v1/users/me`);
    expect(response.status()).toBe(401);
  });
});
