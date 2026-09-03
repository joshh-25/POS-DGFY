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

const viewports = [
  { name: 'desktop', width: 1280, height: 720, accountTitleSize: 18, savedTitleSize: 15, otpTitleSize: 16 },
  { name: 'mobile', width: 390, height: 844, accountTitleSize: 18, savedTitleSize: 14, otpTitleSize: 16 },
];

async function dismissCookieBanner(page) {
  const acceptCookies = page.getByRole('button', { name: 'Accept', exact: true });
  if (await acceptCookies.count() && await acceptCookies.first().isVisible().catch(() => false)) {
    await acceptCookies.first().click();
  }
}

async function openCheckout(page, slug) {
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
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await expect(page.getByText('Step 1: Customer Details', { exact: true })).toBeVisible({ timeout: 30_000 });
}

async function readAccountTypography(page) {
  return page.evaluate(() => {
    const findExact = (text) => Array.from(document.querySelectorAll('*')).find((element) => (
      element.children.length === 0 && element.textContent?.trim() === text
    ));
    const accountTitle = findExact('Step 1: Customer Details');
    const savedTitle = findExact('Guest Check-out Saved Details');
    const otpTitle = findExact('Verify your email');
    const getStyle = (element) => {
      if (!element) return null;
      const style = window.getComputedStyle(element);
      return { fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight };
    };
    const findButton = (text) => Array.from(document.querySelectorAll('button')).find((element) => (
      element.textContent?.replace(/\s+/g, ' ').trim() === text
    ));
    const getHeight = (element) => element ? Math.round(element.getBoundingClientRect().height) : null;
    return {
      accountTitle: getStyle(accountTitle),
      savedTitle: getStyle(savedTitle),
      otpTitle: getStyle(otpTitle),
      nameFieldHeight: getHeight(document.querySelector('input[placeholder="Enter your full name"]')),
      codeFieldHeight: getHeight(document.querySelector('input[placeholder="6-digit code"]')),
      verifyButtonHeight: getHeight(findButton('Verify')),
      backButtonHeight: getHeight(findButton('Back to Catalog')),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
}

for (const mode of modes) {
  test.describe(`${mode.name} guest checkout Account UI @guest-account-ui`, () => {
    test.skip(!mode.slug, `Set the storefront slug for ${mode.name} before running this regression.`);

    for (const viewport of viewports) {
      test(`uses the shared copy, Segoe font, and responsive type scale on ${viewport.name}`, async ({ page }) => {
        const crashChecker = registerCrashDetection(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript(() => {
          window.localStorage.setItem('dgfy_store_saved_customer_details_v1', JSON.stringify({
            name: 'QA Guest Customer',
            phone: '+639171234567',
            email: 'qa-guest@example.com',
            updatedAt: Date.now(),
            source: 'guest',
          }));
        });

        await openCheckout(page, mode.slug);

        await expect(page.getByText('Guest Check-out Saved Details', { exact: true })).toBeVisible();
        await expect(page.getByText('Guest checkout uses the details you entered for this order only.', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Add your name and email, then verify your email to continue.', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Complete required fields to continue.', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Verify your email', { exact: true })).toBeVisible();

        const nameField = page.locator('input[placeholder="Enter your full name"]');
        if (!(await nameField.isVisible().catch(() => false))) {
          await page.getByRole('button', { name: /Not you\? Use different details/ }).click();
        }
        await expect(nameField).toBeVisible();

        const metrics = await readAccountTypography(page);
        expect(metrics.accountTitle.fontFamily).toMatch(/Segoe UI/i);
        expect(metrics.savedTitle.fontFamily).toMatch(/Segoe UI/i);
        expect(metrics.otpTitle.fontFamily).toMatch(/Segoe UI/i);
        expect(metrics.accountTitle.fontSize).toBe(`${viewport.accountTitleSize}px`);
        expect(metrics.savedTitle.fontSize).toBe(`${viewport.savedTitleSize}px`);
        expect(metrics.otpTitle.fontSize).toBe(`${viewport.otpTitleSize}px`);
        expect(metrics.accountTitle.fontWeight).toBe('700');
        expect(metrics.savedTitle.fontWeight).toBe('700');
        expect(metrics.otpTitle.fontWeight).toBe('700');
        expect(metrics.otpTitle.fontFamily).toMatch(/^['"]?Segoe UI/i);
        expect(metrics.nameFieldHeight).toBe(44);
        expect(metrics.codeFieldHeight).toBe(44);
        expect(metrics.verifyButtonHeight).toBe(44);
        if (metrics.backButtonHeight !== null) expect(metrics.backButtonHeight).toBe(44);
        expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
        await crashChecker.assertNoCrashes();
      });
    }
  });
}
