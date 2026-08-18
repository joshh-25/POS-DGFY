import { expect, test } from '@playwright/test';

const storefrontURL = String(process.env.STOREFRONT_URL || 'http://localhost:5175').replace(/\/$/, '');
const storeSlug = String(process.env.E2E_FNB_STORE_SLUG || 'kusina-caf-e36b28').trim();
const storeName = String(process.env.E2E_FNB_STORE_NAME || 'Kusina & Café').trim();

const installRuntimeDiagnostics = (page) => {
  const diagnostics = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      diagnostics.push(`console.error: ${message.text()}${location?.url ? ` @ ${location.url}` : ''}`);
    }
  });
  page.on('requestfailed', (request) => {
    const path = new URL(request.url()).pathname;
    const failure = request.failure()?.errorText || '';
    if (failure === 'net::ERR_ABORTED' && (
      /\/api\/v1\/(dgfy\/auth\/me|dgfy\/customer\/events|storefront\/discovery)/.test(path)
      || /^\/openfreemap\/.+\.pbf$/.test(path)
      || /^https:\/\/tiles\.openfreemap\.org\/styles\/.+/.test(request.url())
      || /^https:\/\/tiles\.openfreemap\.org\/sprites\/.+\.png$/.test(request.url())
    )) return;
    diagnostics.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) diagnostics.push(`http5xx: ${response.status()} ${response.url()}`);
  });
  return diagnostics;
};

test('F&B Storefront renders safely on desktop and mobile @fnb @modifiers @smoke', async ({ page }, testInfo) => {
  const diagnostics = installRuntimeDiagnostics(page);
  await page.goto(`${storefrontURL}/tenant-store/${storeSlug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText(/Something went wrong|Unexpected error|Application error/i)).toHaveCount(0);
  await expect(page.getByText(storeName, { exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText(storeName, { exact: true }).first()).toBeVisible();

  if (diagnostics.length > 0) {
    await testInfo.attach('runtime-diagnostics', { body: diagnostics.join('\n'), contentType: 'text/plain' });
  }
  expect(diagnostics, diagnostics.join('\n')).toEqual([]);
});
