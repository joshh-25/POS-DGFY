import { test, expect } from '@playwright/test';
import { registerCrashDetection } from '../helpers/assertions.js';

const IPHONE_VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone Pro Max', width: 430, height: 932 }
];

for (const device of IPHONE_VIEWPORTS) {
  test.describe(`POS PWA responsive: ${device.name}`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    });

    test('loads the PWA shell without horizontal viewport overflow', async ({ page }) => {
      const crashChecker = registerCrashDetection(page);

      await page.goto('/pos');
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /.*manifest\.webmanifest/);
      await crashChecker.assertNoCrashes();

      const viewportMetrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      }));
      expect(viewportMetrics.documentWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth + 1);
    });
  });
}
