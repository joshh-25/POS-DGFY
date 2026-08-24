import { expect, test } from '@playwright/test';

const storefrontOrigin = 'http://192.168.1.42:5176';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`Simple catalog and Retail storefront render without overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${storefrontOrigin}/store/len2-sari-sari-store-8d824c`, { waitUntil: 'domcontentloaded' });
    const acceptCookies = page.getByRole('button', { name: 'Accept' });
    if (await acceptCookies.isVisible().catch(() => false)) await acceptCookies.click();
    if (viewport.name === 'mobile') {
      await expect(page.getByText('Browse by Category', { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'Everyday Products' })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Add to Cart' }).first()).toBeVisible();
    await expect(page.getByText(/Showing 1-8 of 18 items/)).toBeVisible();
    const simpleMetrics = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(simpleMetrics.documentWidth).toBeLessThanOrEqual(simpleMetrics.viewportWidth + 1);

    await page.goto(`${storefrontOrigin}/store/tinda-han-d589e5`, { waitUntil: 'domcontentloaded' });
    if (viewport.name === 'mobile') {
      await expect(page.getByText('Browse by Category', { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'What are you looking for?' })).toBeVisible();
    }
    const retailMetrics = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(retailMetrics.documentWidth).toBeLessThanOrEqual(retailMetrics.viewportWidth + 1);

    await page.goto(`${storefrontOrigin}/store/space-bar-8ddb33`, { waitUntil: 'domcontentloaded' });
    if (viewport.name === 'mobile') {
      await expect(page.getByText('Browse by Category', { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /All Prices/ })).toBeVisible();
    }
    const fnbMetrics = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(fnbMetrics.documentWidth).toBeLessThanOrEqual(fnbMetrics.viewportWidth + 1);
  });
}
