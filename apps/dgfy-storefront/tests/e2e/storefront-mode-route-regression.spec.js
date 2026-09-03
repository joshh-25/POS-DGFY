import { expect, test } from '@playwright/test';
import { registerCrashDetection } from './helpers/assertions.js';
import { STOREFRONT_URL } from './helpers/urls.js';

const storefrontOrigin = STOREFRONT_URL.replace(/\/$/, '');
const routePrefix = String(process.env.STOREFRONT_TEST_ROUTE_PREFIX || '/store')
  .replace(/^\/?/, '/')
  .replace(/\/+$/, '');
const locationQuery = process.env.STOREFRONT_TEST_LOCATION_ID
  ? `?location_id=${encodeURIComponent(String(process.env.STOREFRONT_TEST_LOCATION_ID).trim())}`
  : '';

const storefrontModes = [
  {
    envKey: 'RETAIL_STOREFRONT_TEST_SLUG',
    name: 'Retail',
    slug: process.env.RETAIL_STOREFRONT_TEST_SLUG
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

async function assertProductDetailsLayout(page) {
  const metrics = await page.evaluate(() => {
    const viewButton = document.querySelector('button[aria-label="View larger image"]');
    const gallery = viewButton?.parentElement;
    const leftColumn = gallery?.parentElement;
    const detailsGrid = leftColumn?.parentElement;
    const summaryColumn = detailsGrid?.children?.[1];
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width };
    };
    const galleryRect = rect(gallery);
    const summaryRect = rect(summaryColumn);
    const galleryImage = gallery?.querySelector('img[alt]');
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      galleryBottom: galleryRect?.bottom ?? null,
      galleryRight: galleryRect?.right ?? null,
      summaryTop: summaryRect?.top ?? null,
      summaryLeft: summaryRect?.left ?? null,
      hasGallery: Boolean(galleryRect),
      imageObjectFit: galleryImage ? window.getComputedStyle(galleryImage).objectFit : null,
      overlap: galleryRect && summaryRect ? Math.max(0, galleryRect.right - summaryRect.left) : null
    };
  });

  expect(metrics.hasGallery).toBe(true);
  expect(metrics.imageObjectFit).toBe('cover');
  if (metrics.viewportWidth < 840) {
    expect(metrics.galleryBottom).toBeLessThanOrEqual(metrics.summaryTop + 1);
  } else {
    expect(metrics.overlap).toBeLessThanOrEqual(1);
  }
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

for (const mode of storefrontModes) {
  test.describe(`${mode.name} storefront route regression @route-regression`, () => {
    test.skip(!mode.slug, `Set ${mode.envKey} to run the ${mode.name} storefront route regression.`);

    for (const viewport of viewports) {
      test(`opens the product details route, survives refresh, and supports back/forward on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const crashChecker = registerCrashDetection(page);
        const catalogUrl = `${storefrontOrigin}${storefrontPath(mode.slug)}${locationQuery}`;

        await page.goto(catalogUrl, { waitUntil: 'domcontentloaded' });
        await dismissCookieBanner(page);

        const firstCard = await waitForCatalogReady(page);
        const resolvedCatalogUrl = page.url();
        const itemName = (await firstCard.getByRole('heading').first().innerText()).trim();

        await clickProductDetails(firstCard);
        await expect(page).toHaveURL(/(?:\?|&)item=[^&]+/);
        await expect(page.getByRole('heading', { name: itemName, exact: true }).first()).toBeVisible();
        await assertProductDetailsLayout(page);

        const detailUrl = page.url();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(detailUrl);
        await expect(page.getByRole('heading', { name: itemName, exact: true }).first()).toBeVisible();
        await assertProductDetailsLayout(page);

        await page.goBack({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(resolvedCatalogUrl);
        await waitForCatalogReady(page);

        await page.goForward({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(detailUrl);
        await expect(page.getByRole('heading', { name: itemName, exact: true }).first()).toBeVisible();
        await assertProductDetailsLayout(page);

        await crashChecker.assertNoCrashes();
      });
    }
  });
}
