import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/login.js';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';

const testCompanyName = process.env.E2E_TEST_COMPANY_NAME?.trim();

const expectVisibleExactText = async (page, text) => {
  const matches = page.getByText(text, { exact: true });
  await expect.poll(async () => {
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      if (await matches.nth(index).isVisible()) return true;
    }
    return false;
  }).toBe(true);
};

const installRuntimeDiagnostics = (page) => {
  const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] };
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
      diagnostics.serverErrors.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status()
      });
    }
  });
  return diagnostics;
};

const assertHealthy = async (page, diagnostics, checkpoint, { allowExpectedConsoleErrors = false } = {}) => {
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText(/Something went wrong|Application error|Unexpected error/i)).toHaveCount(0);
  expect(diagnostics.pageErrors, `${checkpoint}: page errors`).toEqual([]);
  const unexpectedConsoleErrors = allowExpectedConsoleErrors
    ? diagnostics.consoleErrors.filter((message) => !/status of 403/i.test(message))
    : diagnostics.consoleErrors;
  expect(unexpectedConsoleErrors, `${checkpoint}: console errors`).toEqual([]);
  expect(diagnostics.failedRequests, `${checkpoint}: failed requests`).toEqual([]);
  expect(diagnostics.serverErrors, `${checkpoint}: server errors`).toEqual([]);
};

test.describe('Phase 368 settings access acceptance', () => {
  test.skip(
    !hasTestCredentials,
    'Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD for the authenticated local flow.'
  );
  test.describe.configure({ timeout: 120_000 });

  test('preserves branch context across refresh and protects unsaved settings', async ({ page }) => {
    const diagnostics = installRuntimeDiagnostics(page);
    await signIn(page, testCredentials, { companyName: testCompanyName });

    await page.goto('/?view=reports#/business-admin/settings/registers', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Terminal Registry Mode', { exact: true })).toBeVisible();
    const branchContext = page.getByLabel('Branch context');
    await expect(branchContext).toHaveValue(/.+/);
    const branchValues = await branchContext.locator('option').evaluateAll((options) => options.map((option) => option.value));
    const currentBranchId = await branchContext.inputValue();
    const nextBranchId = branchValues.find((value) => value !== currentBranchId) || currentBranchId;
    if (nextBranchId !== currentBranchId) {
      await branchContext.selectOption(nextBranchId);
    } else {
      await page.goto(`/?view=reports#/business-admin/settings/registers?branch_id=${encodeURIComponent(currentBranchId)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Terminal Registry Mode', { exact: true })).toBeVisible();
    }
    const selectedBranchId = await branchContext.inputValue();
    const settingsUrl = new URL(page.url());
    expect(settingsUrl.hash).toContain(`branch_id=${selectedBranchId}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Terminal Registry Mode', { exact: true })).toBeVisible();
    await expect(branchContext).toHaveValue(selectedBranchId);

    const registryMode = page.locator('select:has(option[value="enforce"])').first();
    await expect(registryMode).toBeEnabled();
    const originalMode = await registryMode.inputValue();
    const nextMode = originalMode === 'enforce' ? 'warn' : 'enforce';
    await registryMode.selectOption(nextMode);

    const dialogMessages = [];
    let dialogAction = 'dismiss';
    page.on('dialog', async (dialog) => {
      dialogMessages.push(dialog.message());
      if (dialogAction === 'accept') await dialog.accept();
      else await dialog.dismiss();
    });
    const refreshButton = page.getByRole('button', { name: 'Refresh', exact: true }).first();
    await expect(refreshButton).toBeEnabled();
    if (branchValues.some((value) => value !== selectedBranchId)) {
      await branchContext.selectOption(branchValues.find((value) => value !== selectedBranchId));
      await expect.poll(() => dialogMessages).toContain('You have unsaved settings changes. Change branch and discard them?');
      await expect(branchContext).toHaveValue(selectedBranchId);
    }
    await refreshButton.click();
    await expect.poll(() => dialogMessages).toContain('You have unsaved settings changes. Refresh and discard them?');
    await expect(registryMode).toHaveValue(nextMode);

    dialogAction = 'accept';
    await expect(refreshButton).toBeEnabled();
    await refreshButton.click();
    await expect(registryMode).toHaveValue(originalMode);

    await assertHealthy(page, diagnostics, 'settings refresh and dirty-draft guard');
  });

  test('renders explicit session-invalidated and company-switched states without a blank page', async ({ page }) => {
    const diagnostics = installRuntimeDiagnostics(page);
    await signIn(page, testCredentials, { companyName: testCompanyName });
    await page.goto('/?view=reports#/business-admin/overview', { waitUntil: 'domcontentloaded' });
    await expectVisibleExactText(page, 'Business back office');

    await page.evaluate(() => window.dispatchEvent(new Event('auth:session-expired')));
    await expect(page.getByTestId('business-admin-session-required')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open POS sign-in/i })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectVisibleExactText(page, 'Business back office');
    await page.evaluate(() => window.dispatchEvent(new Event('auth:logout')));
    await expect(page.getByTestId('business-admin-session-required')).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectVisibleExactText(page, 'Business back office');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('auth:tenant-switched')));
    await expect(page.getByTestId('business-admin-session-required')).toContainText('company changed in another window');

    await assertHealthy(page, diagnostics, 'session and company invalidation');
  });

  test('shows an explicit denied state when the server rejects Back Office bootstrap', async ({ page }) => {
    const diagnostics = installRuntimeDiagnostics(page);
    await signIn(page, testCredentials, { companyName: testCompanyName });
    await page.route('**/api/v1/business-admin/bootstrap', (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: 'Insufficient Back Office permissions.' })
    }));

    await page.goto('/?view=reports#/business-admin/overview', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('business-admin-access-denied')).toBeVisible();
    await expect(page.getByText('Your account is authenticated but is not authorized to open Back Office.')).toBeVisible();
    await assertHealthy(page, diagnostics, 'server denied Back Office bootstrap', { allowExpectedConsoleErrors: true });
  });
});
