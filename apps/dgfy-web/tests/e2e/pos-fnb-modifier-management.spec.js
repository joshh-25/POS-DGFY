import { expect, test } from '@playwright/test';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';
import { signIn } from './fixtures/login.js';

test('F&B modifier creation and item assignment are located in standalone POS @fnb @modifiers @smoke', async ({ page }, testInfo) => {
  test.skip(!hasTestCredentials, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');

  const diagnostics = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const failureText = request.failure()?.errorText || '';
    const pathname = new URL(request.url()).pathname;
    const expectedCatalogStreamAbort = /\/api\/v1\/pos\/catalog\/events$/.test(pathname) && failureText === 'net::ERR_ABORTED';
    if (!expectedCatalogStreamAbort) diagnostics.push(`requestfailed: ${request.method()} ${request.url()} ${failureText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) diagnostics.push(`http5xx: ${response.status()} ${response.url()}`);
  });

  await signIn(page, testCredentials);
  diagnostics.length = 0;

  await page.getByTestId('pos-nav-items').click();
  const modifiersTab = page.getByRole('tab', { name: 'Menu modifiers' });
  await expect(modifiersTab).toBeVisible();
  await modifiersTab.focus();
  await expect(modifiersTab).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Menu modifiers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'F&B menu modifiers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Assign add-ons to an item' })).toBeVisible();
  await expect(page.getByLabel('Menu item')).toBeVisible();
  await expect(page.getByText(/Something went wrong|Unexpected error|Application error/i)).toHaveCount(0);

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(desktopOverflow).toBe(false);
  await testInfo.attach('pos-fnb-menu-modifiers-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Assign add-ons to an item' })).toBeVisible();
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(mobileOverflow).toBe(false);
  await testInfo.attach('pos-fnb-menu-modifiers-mobile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  if (diagnostics.length) await testInfo.attach('runtime-diagnostics', { body: diagnostics.join('\n'), contentType: 'text/plain' });
  expect(diagnostics, diagnostics.join('\n')).toEqual([]);
});
