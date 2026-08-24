import { test, expect } from '@playwright/test';

const POS_TEXT_SIZE_STORAGE_KEY = 'dgfy.pos.text-size.v1';
const VIEWPORTS = [
  { name: '1024x600 tablet landscape', width: 1024, height: 600 },
  { name: '1280x720 desktop', width: 1280, height: 720 },
  { name: '1366x768 desktop wide', width: 1366, height: 768 },
  { name: '390x844 phone', width: 390, height: 844 }
];

// The locked terminal intentionally probes the protected bootstrap endpoints
// before credentials are supplied. Chrome reports those expected 401s as
// console errors; all other console errors remain test failures.
const EXPECTED_LOCKED_TERMINAL_CONSOLE_ERRORS = [
  /^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/
];

function registerRuntimeDiagnostics(page) {
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    serverErrors: []
  };

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const messageText = message.text();
    const expected = EXPECTED_LOCKED_TERMINAL_CONSOLE_ERRORS.some((pattern) => pattern.test(messageText));
    if (!expected) diagnostics.consoleErrors.push(messageText);
  });
  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || 'request failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) diagnostics.serverErrors.push(`${response.status()} ${response.url()}`);
  });

  return diagnostics;
}

async function assertHealthy(page, diagnostics) {
  await expect(page.locator('body')).not.toBeEmpty();
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/Something went wrong|ReferenceError|Cannot read properties of undefined/i);

  expect(diagnostics.pageErrors, JSON.stringify(diagnostics, null, 2)).toEqual([]);
  expect(diagnostics.consoleErrors, JSON.stringify(diagnostics, null, 2)).toEqual([]);
  expect(diagnostics.requestFailures, JSON.stringify(diagnostics, null, 2)).toEqual([]);
  expect(diagnostics.serverErrors, JSON.stringify(diagnostics, null, 2)).toEqual([]);
}

async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

for (const viewport of VIEWPORTS) {
  test.describe(`POS text enlargement: ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('changes accessible text size, persists after reload, and stays within the viewport', async ({ page }) => {
      const diagnostics = registerRuntimeDiagnostics(page);

      await page.goto('/terminal', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();

      const textSizeControl = page.locator('#pos-text-size-lock-drawer');
      await expect(textSizeControl).toBeVisible();
      await expect(textSizeControl).toHaveAttribute('aria-label', 'POS text size');
      await expect(textSizeControl).toHaveValue('normal');

      const formOwner = await textSizeControl.evaluate((element) => element.closest('form'));
      expect(formOwner).toBeNull();

      const normalHeadingSize = await page.getByRole('heading', { name: 'Terminal Login Required' })
        .evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));

      await textSizeControl.selectOption('large');
      await expect(page.locator('body')).toHaveAttribute('data-pos-text-size', 'large');
      await expect(textSizeControl).toHaveValue('large');
      await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), POS_TEXT_SIZE_STORAGE_KEY))
        .toBe('large');

      const largeHeadingSize = await page.getByRole('heading', { name: 'Terminal Login Required' })
        .evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));
      expect(largeHeadingSize).toBeGreaterThan(normalHeadingSize);

      await textSizeControl.selectOption('extra-large');
      await expect(page.locator('body')).toHaveAttribute('data-pos-text-size', 'extra-large');
      await expect(textSizeControl).toHaveValue('extra-large');
      await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), POS_TEXT_SIZE_STORAGE_KEY))
        .toBe('extra-large');

      await assertNoHorizontalOverflow(page);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
      await expect(page.locator('body')).toHaveAttribute('data-pos-text-size', 'extra-large');
      await expect(page.locator('#pos-text-size-lock-drawer')).toHaveValue('extra-large');
      await assertNoHorizontalOverflow(page);
      await assertHealthy(page, diagnostics);
    });
  });
}
