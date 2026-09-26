import { expect, test } from '@playwright/test';
import { signInBackOffice } from './fixtures/login.js';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';

const testCompanyName = process.env.E2E_TEST_COMPANY_NAME?.trim();

const installRuntimeDiagnostics = (page) => {
  const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], clientErrors: [], serverErrors: [] };
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
    if (response.status() >= 400 && response.status() < 500) {
      diagnostics.clientErrors.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status()
      });
    }
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

test.describe('POS settings tab navigation', () => {
  test.skip(
    !hasTestCredentials,
    'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.'
  );

  test('switches POS Setup, Taxes, and Discounts buttons with the active underline', async ({ page }) => {
    test.setTimeout(120_000);
    const diagnostics = installRuntimeDiagnostics(page);

    await signInBackOffice(page, testCredentials, testCompanyName ? { companyName: testCompanyName } : {});
    await page.goto('/?view=reports#/backoffice/settings/pos', { waitUntil: 'domcontentloaded' });

    const posConfigurationSection = page.getByRole('tab', { name: 'POS configuration', exact: true });
    await expect(posConfigurationSection).toBeVisible();
    await expect(posConfigurationSection).toHaveAttribute('aria-selected', 'true');
    await expect(posConfigurationSection).toHaveClass(/active/);
    await expect(posConfigurationSection).toHaveCSS('border-radius', '0px');
    await expect(posConfigurationSection).toHaveCSS('border-bottom-color', 'rgb(26, 78, 141)');
    await expect(posConfigurationSection.locator('svg')).toBeVisible();
    await expect(posConfigurationSection).not.toContainText('Edit');

    const settingsSectionsViewport = page.locator('.business-admin-settings-section-list');
    const swipeHint = page.getByText('Swipe right', { exact: true });
    await expect(settingsSectionsViewport).toHaveCSS('overflow-x', 'auto');
    await expect(swipeHint).toBeVisible();
    await posConfigurationSection.click();
    await expect(swipeHint).toBeVisible();

    await settingsSectionsViewport.evaluate((element) => {
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      element.scrollLeft = Math.max(0, Math.min(120, maxScrollLeft - 1));
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(swipeHint).toBeVisible();

    const viewportBox = await settingsSectionsViewport.boundingBox();
    expect(viewportBox).toBeTruthy();
    await page.mouse.move(viewportBox.x + (viewportBox.width / 2), viewportBox.y + (viewportBox.height / 2));
    await page.mouse.down();
    await page.mouse.move(viewportBox.x - viewportBox.width, viewportBox.y + (viewportBox.height / 2), { steps: 8 });
    await expect(swipeHint).toBeHidden();
    await page.mouse.up();
    await expect.poll(() => settingsSectionsViewport.evaluate((element) => (
      Math.max(0, element.scrollWidth - element.clientWidth - element.scrollLeft)
    ))).toBeLessThanOrEqual(2);
    await expect(swipeHint).toBeHidden();

    await settingsSectionsViewport.evaluate((element) => {
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      element.scrollLeft = Math.max(0, maxScrollLeft - 120);
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(swipeHint).toBeVisible();

    await page.mouse.move(viewportBox.x + (viewportBox.width / 2), viewportBox.y + (viewportBox.height / 2));
    await page.mouse.down();
    await page.mouse.move(viewportBox.x + (viewportBox.width / 2) - 24, viewportBox.y + (viewportBox.height / 2), { steps: 3 });
    await expect(swipeHint).toBeHidden();
    await page.mouse.up();
    await expect(swipeHint).toBeVisible();

    const posSetupTab = page.getByRole('tab', { name: 'POS Setup', exact: true });
    const taxesTab = page.getByRole('tab', { name: 'Taxes', exact: true });
    const discountsTab = page.getByRole('tab', { name: 'Discounts', exact: true });

    await expect(posSetupTab).toBeVisible();
    await expect(posSetupTab).toHaveAttribute('aria-selected', 'true');
    await expect(taxesTab).toHaveAttribute('aria-selected', 'false');
    await expect(discountsTab).toHaveAttribute('aria-selected', 'false');
    await expect(posSetupTab).toHaveClass(/border-\[#1A4E8D\]/);

    await taxesTab.click();
    await expect(taxesTab).toHaveAttribute('aria-selected', 'true');
    await expect(posSetupTab).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('heading', { name: 'Taxes', exact: true })).toBeVisible();
    await expect(taxesTab).toHaveClass(/border-\[#1A4E8D\]/);

    await discountsTab.click();
    await expect(discountsTab).toHaveAttribute('aria-selected', 'true');
    await expect(taxesTab).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('heading', { name: 'Discount Management', exact: true })).toBeVisible();
    await expect(discountsTab).toHaveClass(/border-\[#1A4E8D\]/);

    await expect(page.locator('#root')).not.toBeEmpty();
    // A fresh local browser context can probe refresh-token before the explicit
    // Back Office login establishes the session. Keep that known auth bootstrap
    // response allowlisted, but fail on every other client/server error.
    const expectedRefreshTokenErrors = diagnostics.clientErrors.filter((entry) => (
      entry.method === 'POST'
        && entry.status === 400
        && /\/api\/v1\/auth\/refresh-token$/.test(entry.url)
    ));
    const unexpectedClientErrors = diagnostics.clientErrors.filter((entry) => (
      !(entry.method === 'POST'
        && entry.status === 400
        && /\/api\/v1\/auth\/refresh-token$/.test(entry.url))
    ));
    const expectedRefreshTokenConsoleErrors = diagnostics.consoleErrors.filter((message) => (
      /server responded with a status of 400 \(Bad Request\)/i.test(message)
    ));
    const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) => (
      !/server responded with a status of 400 \(Bad Request\)/i.test(message)
    ));
    expect(diagnostics.pageErrors).toEqual([]);
    expect(unexpectedClientErrors).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(expectedRefreshTokenConsoleErrors).toHaveLength(expectedRefreshTokenErrors.length);
    expect(diagnostics.failedRequests).toEqual([]);
    expect(diagnostics.serverErrors).toEqual([]);
  });
});
