import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/login.js';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';

const testCompanyName = process.env.E2E_TEST_COMPANY_NAME?.trim();

test.describe('Business Admin settings ownership', () => {
  test.skip(
    !hasTestCredentials || !testCompanyName,
    'E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD, and E2E_TEST_COMPANY_NAME are required.'
  );

  test('keeps terminal-local controls in POS while registry policy stays in Back Office', async ({ page }) => {
    test.setTimeout(120_000);

    await signIn(page, testCredentials, { companyName: testCompanyName });
    const terminalSetupNav = page.getByTestId('pos-nav-terminal-setup');
    await expect(terminalSetupNav).toBeVisible();
    await terminalSetupNav.click();
    await expect(page.getByText('Terminal Setup', { exact: true })).toBeVisible();
    await expect(page.getByText('Terminal-only controls', { exact: true })).toBeVisible();
    await expect(page.getByText('Terminal Registry Mode', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Strict Shift Location Binding', { exact: true })).toHaveCount(0);

    const businessAdminPage = await page.context().newPage();
    let originalMode = null;
    try {
      await businessAdminPage.goto('/?view=reports#/backoffice/settings/registers', { waitUntil: 'domcontentloaded' });
      await expect(businessAdminPage.getByText('Terminal Registry Mode', { exact: true })).toBeVisible();

      const branchContext = businessAdminPage.getByLabel('Branch context');
      await expect(branchContext).toHaveValue(/.+/);
      await expect(branchContext.locator('option:checked')).toHaveText(testCompanyName);

      const adminRegistryMode = businessAdminPage.locator('select:has(option[value="enforce"])').first();
      await expect(adminRegistryMode).toBeVisible();
      originalMode = await adminRegistryMode.inputValue();
      expect(['warn', 'enforce']).toContain(originalMode);
      const nextMode = originalMode === 'enforce' ? 'warn' : 'enforce';
      await adminRegistryMode.selectOption(nextMode);
      await businessAdminPage.getByRole('button', { name: /^Save$/ }).click();
      await expect(businessAdminPage.getByText('Terminal registry saved.', { exact: true })).toBeVisible();
      await expect(adminRegistryMode).toHaveValue(nextMode);
    } finally {
      if (!businessAdminPage.isClosed()) {
        const adminRegistryMode = businessAdminPage.locator('select:has(option[value="enforce"])').first();
        if (await adminRegistryMode.isVisible().catch(() => false)) {
          const currentMode = await adminRegistryMode.inputValue().catch(() => originalMode);
          if (originalMode && currentMode !== originalMode) {
            await adminRegistryMode.selectOption(originalMode);
            await businessAdminPage.getByRole('button', { name: /^Save$/ }).click();
            await expect(businessAdminPage.getByText('Terminal registry saved.', { exact: true })).toBeVisible();
          }
        }
        await businessAdminPage.close();
      }
    }
  });
});
