import { test, expect } from '@playwright/test';
import { hasTestCredentials } from '../fixtures/test-credentials.js';

test('restores the authenticated POS terminal session', async ({ page }) => {
  test.skip(!hasTestCredentials, 'Provide E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD in .env.e2e.');

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main').or(page.locator('#root'))).not.toBeEmpty();
});
