import { test, expect } from '@playwright/test';
import { registerCrashDetection } from '../helpers/assertions.js';

test.describe('POS PWA Audits', () => {
  test('POS links its manifest file', async ({ page }) => {
    const crashChecker = registerCrashDetection(page);
    await page.goto('/pos');
    await crashChecker.assertNoCrashes();
    
    // POS app shell should link the PWA manifest
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', /.*manifest(?:-[^/]+)?\.webmanifest/);
  });

  test('hides the outer document scrollbar while keeping the POS shell viewport locked', async ({ page }) => {
    await page.goto('/pos');
    await expect(page.locator('.dgfy-pos-shell')).toBeVisible();

    const scrollState = await page.evaluate(() => ({
      hasPosDocumentScrollLock: document.documentElement.classList.contains('dgfy-pos-document-scroll-lock'),
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    }));

    expect(scrollState.hasPosDocumentScrollLock).toBe(true);
    expect(scrollState.htmlOverflowY).toBe('hidden');
    expect(scrollState.documentScrollHeight).toBeLessThanOrEqual(scrollState.viewportHeight + 1);
  });
});
