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

const modes = [
  { name: 'Retail', slug: process.env.RETAIL_STOREFRONT_TEST_SLUG },
  { name: 'F&B', slug: process.env.FNB_STOREFRONT_TEST_SLUG },
  { name: 'Simple MSME', slug: process.env.SIMPLE_STOREFRONT_TEST_SLUG },
];

async function dismissCookieBanner(page) {
  const acceptCookies = page.getByRole('button', { name: 'Accept', exact: true });
  if (await acceptCookies.count() && await acceptCookies.first().isVisible().catch(() => false)) {
    await acceptCookies.first().click();
  }
}

async function openFirstProduct(page, slug) {
  await page.goto(`${storefrontOrigin}${routePrefix}/${encodeURIComponent(String(slug).trim())}${locationQuery}`, {
    waitUntil: 'domcontentloaded',
  });
  await dismissCookieBanner(page);

  const firstCard = page.locator('#storefront-catalog-section article').first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  const detailTrigger = firstCard.locator('[data-product-detail-trigger="true"]');
  if (await detailTrigger.count()) {
    await detailTrigger.first().click();
  } else {
    await firstCard.locator('img').first().click();
  }
  await expect(page).toHaveURL(/(?:\?|&)item=[^&]+/);
  await expect(page.getByRole('button', { name: /Buy Now/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Buy Now/ }).click();
  await expect(page).toHaveURL(/\/order(?:\?|$)/);
  await dismissCookieBanner(page);
}

async function passGuestAccountStep(page) {
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await page.locator('input[placeholder="Enter your full name"]').fill('QA Mobile Customer');
  await page.locator('input[placeholder="+63 912 345 6789"]').fill('+639171234567');
  await page.locator('input[placeholder="Enter your email"]').fill('qa-mobile@example.com');

  await page.route('**/api/v1/store/checkout/guest-otp/request', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ delivery_status: 'sent' }),
  }));
  await page.route('**/api/v1/store/checkout/guest-otp/verify', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ guest_checkout_proof: 'e2e-proof' }),
  }));

  await page.getByRole('button', { name: 'Send Code and Apply Details' }).click();
  await page.locator('input[placeholder="6-digit code"]').fill('123456');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
}

async function readLayoutMetrics(page) {
  return page.evaluate(() => {
    const footer = document.querySelector('[data-storefront-mobile-checkout-footer="true"]');
    const map = document.querySelector('[data-delivery-map-frame="true"]');
    const footerRect = footer?.getBoundingClientRect();
    const mapRect = map?.getBoundingClientRect();
    const scrollRoot = document.querySelector('[data-storefront-checkout-scroll-root="true"]');
    const stepTwoTitle = Array.from(document.querySelectorAll('*')).find((element) => (
      element.children.length === 0 && element.textContent?.trim() === 'Step 2: Fulfillment'
    ));
    const stepTwoTitleStyle = stepTwoTitle ? window.getComputedStyle(stepTwoTitle) : null;
    const footerActionHeights = footer
      ? Array.from(footer.querySelectorAll('button')).slice(1).map((button) => Math.round(button.getBoundingClientRect().height))
      : [];
    return {
      footerHeight: footerRect?.height ?? null,
      footerTop: footerRect?.top ?? null,
      footerPointerEvents: footer ? getComputedStyle(footer).pointerEvents : null,
      mapBottom: mapRect?.bottom ?? null,
      mapTop: mapRect?.top ?? null,
      mapVisible: Boolean(mapRect && mapRect.width > 0 && mapRect.height > 0),
      rootReserve: getComputedStyle(document.documentElement).getPropertyValue('--storefront-mobile-checkout-footer-reserve').trim(),
      scrollRootClientHeight: scrollRoot?.clientHeight ?? null,
      scrollRootOverflowY: scrollRoot ? getComputedStyle(scrollRoot).overflowY : null,
      stepTwoTitleFontFamily: stepTwoTitleStyle?.fontFamily ?? null,
      stepTwoTitleFontSize: stepTwoTitleStyle?.fontSize ?? null,
      stepTwoTitleFontWeight: stepTwoTitleStyle?.fontWeight ?? null,
      footerActionHeights,
    };
  });
}

for (const mode of modes) {
  test.describe(`${mode.name} mobile checkout footer clearance @mobile-checkout`, () => {
    test.skip(!mode.slug, `Set the storefront slug for ${mode.name} before running this regression.`);

    test('keeps the delivery map reachable above the persistent order footer', async ({ page }) => {
      const crashChecker = registerCrashDetection(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await openFirstProduct(page, mode.slug);
      await passGuestAccountStep(page);
      await expect(page.getByText('Step 2: Fulfillment', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-delivery-map-frame="true"]')).toBeVisible({ timeout: 30_000 });

      await page.evaluate(() => {
        document.querySelector('[data-delivery-map-frame="true"]')?.scrollIntoView({ block: 'end', behavior: 'instant' });
      });
      await page.waitForTimeout(250);

      const metrics = await readLayoutMetrics(page);
      expect(metrics.mapVisible).toBe(true);
      expect(metrics.footerHeight).toBeGreaterThan(0);
      expect(metrics.rootReserve).toMatch(/^\d+px$/);
      expect(metrics.footerPointerEvents).toBe('none');
      expect(metrics.mapBottom).toBeLessThanOrEqual(metrics.footerTop + 1);
      expect(metrics.scrollRootOverflowY).toBe('auto');
      expect(metrics.stepTwoTitleFontFamily).toMatch(/Segoe UI/i);
      expect(metrics.stepTwoTitleFontSize).toBe('18px');
      expect(metrics.stepTwoTitleFontWeight).toBe('700');
      expect(metrics.footerActionHeights.length).toBeGreaterThan(0);
      expect(metrics.footerActionHeights.every((height) => height === 44)).toBe(true);
      await crashChecker.assertNoCrashes();
    });
  });
}
