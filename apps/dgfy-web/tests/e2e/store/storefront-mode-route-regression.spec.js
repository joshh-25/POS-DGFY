import { expect, test } from '@playwright/test';
import { registerCrashDetection } from '../helpers/assertions.js';
import { STOREFRONT_URL } from '../helpers/urls.js';

const storefrontOrigin = STOREFRONT_URL.replace(/\/$/, '');
const routePrefix = String(process.env.STOREFRONT_TEST_ROUTE_PREFIX || '/store')
  .replace(/^\/?/, '/')
  .replace(/\/+$/, '');

const storefrontModes = [
  {
    envKey: 'RETAIL_STOREFRONT_TEST_SLUG',
    name: 'Retail',
    slug: process.env.RETAIL_STOREFRONT_TEST_SLUG || 'tinda-han-d589e5'
  },
  {
    envKey: 'FNB_STOREFRONT_TEST_SLUG',
    name: 'F&B',
    slug: process.env.FNB_STOREFRONT_TEST_SLUG
  },
  {
    envKey: 'SIMPLE_STOREFRONT_TEST_SLUG',
    name: 'Simple MSME',
    slug: process.env.SIMPLE_STOREFRONT_TEST_SLUG
  }
];

const viewports = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 }
];

function storefrontPath(slug) {
  return `${routePrefix}/${encodeURIComponent(String(slug).trim())}`;
}

async function waitForCatalogReady(page) {
  const catalogItems = page.locator('#storefront-catalog-section article');
  await expect.poll(
    () => catalogItems.count(),
    { timeout: 30_000, intervals: [250, 500, 1_000] }
  ).toBeGreaterThan(0);
  await expect(catalogItems.first()).toBeVisible({ timeout: 30_000 });
  return catalogItems.first();
}

async function dismissCookieBanner(page) {
  const acceptCookies = page.getByRole('button', { name: 'Accept' });
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click();
  }
}

async function clickProductDetails(firstCard) {
  const explicitTrigger = firstCard.locator('[data-product-detail-trigger="true"]');
  if (await explicitTrigger.count()) {
    await explicitTrigger.first().click();
    return;
  }

  const productImage = firstCard.locator('img').first();
  if (await productImage.count() && await productImage.isVisible().catch(() => false)) {
    await productImage.click();
    return;
  }

  // Image-less cards still keep their details click target on the first media wrapper.
  await firstCard.locator('div').first().click();
}

for (const mode of storefrontModes) {
  test.describe(`${mode.name} storefront route regression @route-regression`, () => {
    test.skip(!mode.slug, `Set ${mode.envKey} to run the ${mode.name} storefront route regression.`);

    for (const viewport of viewports) {
      test(`opens the product details route, survives refresh, and supports back/forward on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const crashChecker = registerCrashDetection(page);
        const catalogUrl = `${storefrontOrigin}${storefrontPath(mode.slug)}`;

        await page.goto(catalogUrl, { waitUntil: 'domcontentloaded' });
        await dismissCookieBanner(page);

        const firstCard = await waitForCatalogReady(page);
        const itemName = (await firstCard.getByRole('heading').first().innerText()).trim();

        await clickProductDetails(firstCard);
        await expect(page).toHaveURL(/(?:\?|&)item=[^&]+/);
        await expect(page.getByRole('heading', { name: itemName, exact: true }).first()).toBeVisible();

        const detailUrl = page.url();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(detailUrl);
        await expect(page.getByRole('heading', { name: itemName, exact: true }).first()).toBeVisible();

        await page.goBack({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(catalogUrl);
        await waitForCatalogReady(page);

        await page.goForward({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(detailUrl);
        await expect(page.getByRole('heading', { name: itemName, exact: true }).first()).toBeVisible();

        await crashChecker.assertNoCrashes();
      });
    }
  });
}
