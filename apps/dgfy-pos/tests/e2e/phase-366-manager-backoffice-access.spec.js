import { test, expect } from '@playwright/test';
import { signIn } from './fixtures/login.js';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';

const LOCK_KEY = 'pos_terminal_locked_v1';
const LOCK_REASON_KEY = 'pos_terminal_lock_reason_v1';

const installRuntimeDiagnostics = (page) => {
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    serverErrors: []
  };

  page.on('pageerror', (error) => diagnostics.pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown request failure'
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      diagnostics.serverErrors.push({ method: response.request().method(), url: response.url(), status: response.status() });
    }
  });

  return diagnostics;
};

const assertHealthy = async (page, diagnostics, checkpoint) => {
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText(/Something went wrong|Application error|Unexpected error/i)).toHaveCount(0);
  expect(diagnostics.pageErrors, `${checkpoint}: page errors`).toEqual([]);
  expect(diagnostics.consoleErrors, `${checkpoint}: console errors`).toEqual([]);
  const unexpectedFailedRequests = diagnostics.failedRequests.filter((request) => (
    !(request.method === 'GET'
      && request.failure === 'net::ERR_ABORTED'
      && /\/api\/v1\/pos\/catalog\/events$/.test(request.url))
  ));
  expect(unexpectedFailedRequests, `${checkpoint}: failed requests`).toEqual([]);
  expect(diagnostics.serverErrors, `${checkpoint}: server errors`).toEqual([]);
};

const runManagerBackOfficeFlow = async (page) => {
  const diagnostics = installRuntimeDiagnostics(page);

  await signIn(page, testCredentials);
  await assertHealthy(page, diagnostics, 'authenticated POS');
  await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();

  // Apply the locked manager state after authentication. Applying it before
  // sign-in is intentionally ineffective: the admin login flow clears stale
  // terminal-lock state when it establishes the tenant session.
  await page.evaluate(({ lockKey, lockReasonKey }) => {
    window.localStorage.setItem(lockKey, '1');
    window.localStorage.setItem(lockReasonKey, 'shift_start_required');
  }, { lockKey: LOCK_KEY, lockReasonKey: LOCK_REASON_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();

  const managerEntryCandidates = [
    page.getByTestId('pos-shift-opening-open-backoffice'),
    page.getByTestId('pos-lock-drawer-open-business-admin'),
    page.getByTestId('pos-nav-business-admin')
  ];
  const findVisibleManagerEntry = async () => {
    for (const candidate of managerEntryCandidates) {
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    return null;
  };
  await expect.poll(async () => Boolean(await findVisibleManagerEntry())).toBe(true);
  const unlockSurfaceButton = await findVisibleManagerEntry();
  await expect(unlockSurfaceButton).toBeVisible();
  await expect(unlockSurfaceButton).toBeEnabled();

  const originalUrl = page.url();
  await unlockSurfaceButton.click();
  await expect(page.getByRole('heading', { name: 'Open Business Admin?' })).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open Business Admin', exact: true }).last().click();
  const backOffice = await popupPromise;
  const popupDiagnostics = installRuntimeDiagnostics(backOffice);
  try {
    await backOffice.waitForURL(/#/business-admin\/overview\?view=reports$/, { timeout: 30_000 });
    await backOffice.waitForLoadState('domcontentloaded');
    const backOfficeUrl = new URL(backOffice.url());
    expect(backOfficeUrl.pathname).toBe('/');
    expect(backOfficeUrl.origin).toBe(new URL(originalUrl).origin);
    expect(backOfficeUrl.search).toBe('');
    expect(backOfficeUrl.hash).toBe('#/business-admin/overview?view=reports');
    const backOfficeBrandLabels = backOffice.getByText('Business administration', { exact: true });
    await expect.poll(async () => {
      const labelCount = await backOfficeBrandLabels.count();
      for (let index = 0; index < labelCount; index += 1) {
        if (await backOfficeBrandLabels.nth(index).isVisible().catch(() => false)) return true;
      }
      return false;
    }).toBe(true);
    await assertHealthy(backOffice, popupDiagnostics, 'Business Admin popup');
  } finally {
    await backOffice.close();
  }

  expect(page.url()).toBe(originalUrl);
  await expect(page.getByTestId('pos-terminal-lock-backdrop')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Terminal Login Required|Open Shift|Resume Shift/ })).toBeVisible();
  await assertHealthy(page, diagnostics, 'locked POS after popup');
};

test.describe('Phase 366 manager Business Admin access', () => {
  test.describe.configure({ timeout: 120_000 });

  test('opens an independent Business Admin page from the locked manager unlock surface', async ({ page }) => {
    test.skip(!hasTestCredentials, 'Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD for the authenticated local flow.');
    await runManagerBackOfficeFlow(page);
  });
});

test.describe('Phase 366 mobile manager Business Admin access', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  test.describe.configure({ timeout: 120_000 });

  test('opens Business Admin from the mobile locked manager surface', async ({ page }) => {
    test.skip(!hasTestCredentials, 'Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD for the authenticated local flow.');
    await runManagerBackOfficeFlow(page);
  });
});
