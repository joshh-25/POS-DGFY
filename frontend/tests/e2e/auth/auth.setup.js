import { test } from '@playwright/test';
import { hasTestCredentials, testCredentials } from '../fixtures/test-credentials.js';
import { signIn } from '../fixtures/login.js';

test('authenticate reusable E2E session', async ({ page }) => {
  if (!hasTestCredentials) {
    await page.context().storageState({ path: 'playwright/.auth/user.json' });
    test.skip(true, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');
  }

  await signIn(page, testCredentials);
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
