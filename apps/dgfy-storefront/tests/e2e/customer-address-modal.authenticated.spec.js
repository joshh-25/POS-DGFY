import { expect, test } from '@playwright/test';
import { registerCrashDetection } from './helpers/assertions.js';

const DASHBOARD_ADDRESSES_PATH = '/map-dgfy/account/addresses';

const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 }
};

async function openAddresses(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(DASHBOARD_ADDRESSES_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Saved Locations' })).toBeVisible({ timeout: 30_000 });
}

async function openCreateModal(page, viewport) {
  await openAddresses(page, viewport);
  await page.getByRole('button', { name: 'Add New Address' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeWithoutChanges(page, dialog) {
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
}

async function expectGridColumnCount(locator, expectedCount) {
  await expect.poll(() => locator.evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length
  ))).toBe(expectedCount);
}

test.describe('customer address editor authenticated responsive QA @address-modal', () => {
  test('keeps create mode compact and usable on desktop and tablet', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);

    for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet]) {
      const dialog = await openCreateModal(page, viewport);
      const fields = page.getByTestId('address-editor-fields');
      const actions = page.getByTestId('address-editor-actions');

      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
      await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
      await expectGridColumnCount(fields, 2);
      await expect(page.getByTestId('address-editor-scroll-region')).toHaveCSS('overflow-y', 'auto');
      await expect(actions).toHaveCSS('flex-wrap', 'nowrap');
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Save Address' })).toBeVisible();
      await expect(page.getByText('Saved as default')).toBeVisible();

      await closeWithoutChanges(page, dialog);
    }

    await crashChecker.assertNoCrashes();
  });

  test('uses the full-width mobile sheet, equal actions, and locked background scroll', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    const dialog = await openCreateModal(page, VIEWPORTS.mobile);
    const actions = page.getByTestId('address-editor-actions');

    await expect(dialog).toHaveCSS('width', '390px');
    await expect(dialog).toHaveCSS('border-top-left-radius', '20px');
    await expectGridColumnCount(page.getByTestId('address-editor-fields'), 1);
    await expect(actions).toHaveCSS('flex-wrap', 'nowrap');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCSS('flex', '1 1 0%');
    await expect(dialog.getByRole('button', { name: 'Save Address' })).toHaveCSS('flex', '1 1 0%');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await closeWithoutChanges(page, dialog);
    await crashChecker.assertNoCrashes();
  });

  test('protects dirty create drafts and closes after explicit discard', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    const dialog = await openCreateModal(page, VIEWPORTS.mobile);

    await dialog.getByLabel('Full Delivery Address').fill('QA-only unsaved address');
    let confirmationMessage = '';
    page.once('dialog', async (browserDialog) => {
      confirmationMessage = browserDialog.message();
      await browserDialog.dismiss();
    });
    await dialog.press('Escape');
    await expect(dialog).toBeVisible();
    expect(confirmationMessage).toBe('Discard your unsaved address changes?');

    page.once('dialog', async (browserDialog) => browserDialog.accept());
    await dialog.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    await crashChecker.assertNoCrashes();
  });

  test('shows saving and inline error states without writing to the database', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.route('**/api/v1/dgfy/customer/addresses', async (route, request) => {
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'QA-only simulated save failure' })
      });
    });

    const dialog = await openCreateModal(page, VIEWPORTS.desktop);
    await dialog.getByLabel('Full Delivery Address').fill('QA-only address that is never persisted');
    await dialog.getByRole('button', { name: 'Save Address' }).click();
    await expect(dialog.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Close address editor' })).toBeDisabled();
    await expect(dialog.getByRole('alert')).toContainText('We could not save this address.', { timeout: 10_000 });

    await page.unroute('**/api/v1/dgfy/customer/addresses');
    await crashChecker.assertNoCrashes();
  });

  test('prefills edit mode and preserves the persisted default state', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await openAddresses(page, VIEWPORTS.mobile);

    const addressCards = page.getByTestId('customer-address-card');
    const firstCard = addressCards.first();
    const firstCardEditButton = firstCard.getByRole('button', { name: 'Edit' });
    await expect(firstCardEditButton, 'The authenticated E2E account must contain at least one saved address for edit-mode QA.').toBeVisible();
    await expect(firstCard).toBeVisible();

    const persistedDefault = await firstCard.getByText(/Default/, { exact: false }).count() > 0;
    await firstCardEditButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Edit Address' })).toBeVisible();
    await expect(dialog.getByLabel('Full Delivery Address')).not.toHaveValue('');
    await expect(dialog.getByRole('checkbox', { name: 'Set as default address' })).toBeChecked({ checked: persistedDefault });
    await closeWithoutChanges(page, dialog);
    await crashChecker.assertNoCrashes();
  });
});
