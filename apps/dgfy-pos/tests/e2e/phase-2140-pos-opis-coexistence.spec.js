import { test, expect } from '@playwright/test';

const opisBaseUrl = process.env.E2E_OPIS_URL || 'http://localhost:5176';

const assertUnauthenticatedSurface = async (page, expectedUrl) => {
  await expect(page.getByRole('heading', { name: /Back Office (sign-in required|access denied)/ })).toBeVisible();
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(page.url()).toBe(expectedUrl);
  await expect(page.getByText(/Something went wrong|Application error|Unexpected error/i)).toHaveCount(0);
};

const verifyCoexistenceRoutes = async (page) => {
  const posBase = process.env.E2E_BASE_URL || 'http://localhost:5174';
  const posUrl = new URL('/#/backoffice/orders?branch_id=3', posBase).toString();
  await page.goto(posUrl, { waitUntil: 'domcontentloaded' });
  await assertUnauthenticatedSurface(page, posUrl);
  expect(new URL(page.url()).origin).toBe(new URL(posBase).origin);

  const opisUrl = new URL('/sales', opisBaseUrl).toString();
  await page.goto(opisUrl, { waitUntil: 'domcontentloaded' });
  await assertUnauthenticatedSurface(page, opisUrl);
  expect(new URL(page.url()).origin).toBe(new URL(opisBaseUrl).origin);
};

test.describe('Issue 2140 POS and OPIS route coexistence', () => {
  test('keeps the POS prefixed route local and OPIS root routes available on desktop', async ({ page }) => {
    await verifyCoexistenceRoutes(page);
  });
});

test.describe('Issue 2140 mobile POS and OPIS route coexistence', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('keeps the POS prefixed route local and OPIS root routes available on mobile', async ({ page }) => {
    await verifyCoexistenceRoutes(page);
  });
});
