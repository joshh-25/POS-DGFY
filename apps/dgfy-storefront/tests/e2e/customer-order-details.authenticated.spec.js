import { expect, test } from '@playwright/test';
import { registerCrashDetection } from './helpers/assertions.js';

const DASHBOARD_ORDERS_PATH = '/map-dgfy/account/orders';

const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 }
};

async function openOrders(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(DASHBOARD_ORDERS_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 30_000 });
}

test.describe('customer order details authenticated responsive QA @order-details', () => {
  test('loads complete order details from the API and renders the responsive modal', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);

    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      await openOrders(page, viewport);
      const orderCard = page.getByTestId('customer-order-card').first();
      await expect(
        orderCard,
        `The authenticated E2E account must contain at least one order for ${viewportName} QA.`
      ).toBeVisible();

      const detailsResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === 'GET'
          && /^\/api\/v1\/dgfy\/customer\/orders\/[^/]+$/.test(url.pathname);
      });

      await orderCard.getByRole('button', { name: 'View Order' }).click();
      const detailsResponse = await detailsResponsePromise;
      expect(detailsResponse.status()).toBe(200);

      const responseBody = await detailsResponse.json();
      expect(responseBody.success).toBe(true);
      expect(responseBody.data?.order?.reference).toBeTruthy();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Order details' })).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Order information' })).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Items' })).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Payment summary' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();

      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
    }

    await crashChecker.assertNoCrashes();
  });
});
