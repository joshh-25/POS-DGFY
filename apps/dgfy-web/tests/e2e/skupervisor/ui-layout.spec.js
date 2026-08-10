import { test, expect } from '@playwright/test';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('Skupervisor UI Responsive Layout Audits', () => {
  const viewports = [
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Mobile', width: 375, height: 667 }
  ];

  for (const vp of viewports) {
    test(`Verify Login layout structure on ${vp.name} viewport`, async ({ page }) => {
      const crashChecker = registerCrashDetection(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');
      await crashChecker.assertNoCrashes();
      
      // Check logo visibility
      const logo = page.locator('img[alt="DGFY"]');
      await expect(logo).toBeVisible();

      // Check form card visibility and constraints
      const loginCard = page.locator('div.bg-white.rounded-lg.shadow-lg');
      await expect(loginCard).toBeVisible();

      // No horizontal scrolling should happen on login view
      const xScroll = await page.evaluate(() => window.scrollX);
      expect(xScroll).toBe(0);
    });
  }
});
