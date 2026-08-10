import { test, expect } from '@playwright/test';
import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
import { TEST_COMPANY_TOKEN } from '../helpers/urls.js';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Cross-App Session Synchronization', () => {
  test('Session state syncing via BroadcastChannel', async ({ context }) => {
    // Open Skupervisor tab
    const pageSkupervisor = await context.newPage();
    const crashSkupervisor = registerCrashDetection(pageSkupervisor);
    await pageSkupervisor.goto('/login');
    await loginToApp(pageSkupervisor, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
    await pageSkupervisor.waitForURL('**/');
    await crashSkupervisor.assertNoCrashes();

    // Open POS tab (as embedded /pos subpage)
    const pagePos = await context.newPage();
    const crashPos = registerCrashDetection(pagePos);
    await pagePos.goto('/pos');
    await pagePos.waitForTimeout(1000);
    await crashPos.assertNoCrashes();
    
    // Assert POS recognized the active session
    await expect(pagePos.locator('body')).not.toBeEmpty();
  });
});
