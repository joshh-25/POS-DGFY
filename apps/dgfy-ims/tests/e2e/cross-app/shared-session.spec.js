import { test, expect } from '@playwright/test';
import { hasTestCredentials, loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { POS_URL, SKUPERVISOR_URL, TEST_COMPANY_TOKEN } from '../helpers/urls.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Cross-App Session Synchronization', () => {
  test('shared authenticated session is recognized across SKUpervisor and POS origins', async ({ context }) => {
    test.skip(!hasTestCredentials, 'Provide E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD in .env.e2e.');
    // BroadcastChannel is origin-scoped. This test proves the cross-origin session
    // contract through the shared HttpOnly cookie and each app's bootstrap path.
    const pageSkupervisor = await context.newPage();
    const crashSkupervisor = registerCrashDetection(pageSkupervisor);
    await pageSkupervisor.goto(`${SKUPERVISOR_URL}/login`);
    await loginToApp(pageSkupervisor, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
    await pageSkupervisor.waitForURL(`${SKUPERVISOR_URL}/**`);
    await crashSkupervisor.assertNoCrashes();

    // Open the standalone POS app on its own origin.
    const pagePos = await context.newPage();
    const crashPos = registerCrashDetection(pagePos);
    await pagePos.goto(`${POS_URL}/pos`);
    await expect(pagePos.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
    await crashPos.assertNoCrashes();
    
  });
});
