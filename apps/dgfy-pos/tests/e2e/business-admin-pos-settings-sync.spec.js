import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/login.js';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';

const testCompanyName = process.env.E2E_TEST_COMPANY_NAME?.trim();

test.describe('Business Admin to POS settings sync', () => {
  test.skip(
    !hasTestCredentials || !testCompanyName,
    'E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD, and E2E_TEST_COMPANY_NAME are required.'
  );

  test('updates an open POS terminal setup after a Business Admin save', async ({ page }) => {
    test.setTimeout(120_000);

    await signIn(page, testCredentials, { companyName: testCompanyName });
    await page.goto('/?view=terminal_setup#/terminal', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Terminal Setup Context', { exact: true })).toBeVisible();

    const posRegistryMode = page.locator('select:has(option[value="enforce"])').first();
    await expect(posRegistryMode).toBeVisible();
    const originalMode = await posRegistryMode.inputValue();
    expect(['warn', 'enforce']).toContain(originalMode);
    const nextMode = originalMode === 'enforce' ? 'warn' : 'enforce';

    const businessAdminPage = await page.context().newPage();
    try {
      await businessAdminPage.goto('/?view=reports#/backoffice/settings/registers', { waitUntil: 'domcontentloaded' });
      await expect(businessAdminPage.getByText('Terminal Registry Mode', { exact: true })).toBeVisible();

      const branchContext = businessAdminPage.getByLabel('Branch context');
      await expect(branchContext).toHaveValue(/.+/);
      await expect(branchContext.locator('option:checked')).toHaveText(testCompanyName);

      const adminRegistryMode = businessAdminPage.locator('select:has(option[value="enforce"])').first();
      await expect(adminRegistryMode).toBeVisible();
      await expect(adminRegistryMode).toHaveValue(originalMode);

      await adminRegistryMode.selectOption(nextMode);
      await businessAdminPage.getByRole('button', { name: /^Save$/ }).click();
      await expect(businessAdminPage.getByText('Terminal registry saved.', { exact: true })).toBeVisible();

      await expect(posRegistryMode).toHaveValue(nextMode, { timeout: 10_000 });
    } finally {
      if (!businessAdminPage.isClosed()) {
        const adminRegistryMode = businessAdminPage.locator('select:has(option[value="enforce"])').first();
        if (await adminRegistryMode.isVisible().catch(() => false)) {
          const currentMode = await adminRegistryMode.inputValue().catch(() => originalMode);
          if (currentMode !== originalMode) {
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
