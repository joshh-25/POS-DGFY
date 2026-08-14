import { test, expect } from '@playwright/test';
import { hasTestCredentials, testCredentials } from '../fixtures/test-credentials.js';
import { signIn } from '../fixtures/login.js';

test.describe('authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signs in to the POS terminal with environment credentials', async ({ page }) => {
    test.skip(!hasTestCredentials, 'Provide E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD in .env.e2e.');
    await signIn(page, testCredentials);
    await expect(page.getByText('Shared Account Profile')).toBeVisible();
  });
});
