import { expect, test } from '@playwright/test';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';
import { signIn } from './fixtures/login.js';
import { skipPosAdminShiftPrompt } from './fixtures/posVoid.js';

const serviceCompanyName = String(process.env.E2E_SERVICE_COMPANY_NAME || '').trim();

test('Services business template is available inside standalone POS @services @smoke', async ({ page }, testInfo) => {
  test.skip(!hasTestCredentials, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');
  test.skip(!serviceCompanyName, 'E2E_SERVICE_COMPANY_NAME is required and must name a services-workflow tenant.');

  const diagnostics = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const failureText = request.failure()?.errorText || '';
    const isExpectedCatalogStreamAbort = /\/api\/v1\/pos\/catalog\/events$/.test(new URL(request.url()).pathname)
      && failureText === 'net::ERR_ABORTED';
    if (!isExpectedCatalogStreamAbort) diagnostics.push(`requestfailed: ${request.method()} ${request.url()} ${failureText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) diagnostics.push(`http5xx: ${response.status()} ${response.url()}`);
  });

  try {
    await signIn(page, testCredentials, { companyName: serviceCompanyName });
  } catch (error) {
    const companySelect = page.getByLabel('Company');
    if (!await companySelect.isVisible()) throw error;
    const continueButton = page.getByRole('button', { name: /^continue to pos$/i });
    await continueButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible({ timeout: 20_000 });
  }
  await skipPosAdminShiftPrompt(page);
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText(/Something went wrong|Unexpected error|Application error/i)).toHaveCount(0);
  diagnostics.length = 0;

  await expect(page.getByTestId('pos-nav-services')).toBeVisible();
  await page.getByTestId('pos-nav-services').click();
  await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
  await expect(page.getByTestId('pos-services-operations-workspace')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Team & Resources' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Waitlist' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Reminders' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Clients' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  await expect(async () => {
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search calendar bookings' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter calendar by status' })).toHaveValue('all');
  }).toPass({ intervals: [250, 500, 1000], timeout: 15_000 });
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText(/Something went wrong|Unexpected error|Application error/i)).toHaveCount(0);

  await expect(async () => {
    await page.getByRole('tab', { name: 'Team & Resources' }).click();
    await expect(page.getByRole('heading', { name: 'Resource', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Assign Service', exact: true })).toBeVisible();
    await expect(page.getByLabel('Resource Location ID')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Assignment' })).toBeDisabled();
  }).toPass({ intervals: [250, 500, 1000], timeout: 15_000 });

  await expect(async () => {
    await page.getByRole('tab', { name: 'Waitlist' }).click();
    await expect(page.getByRole('heading', { name: 'Add Waitlist Entry' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search waitlist' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter waitlist by status' })).toHaveValue('all');
    await expect(page.getByRole('button', { name: 'Add to Waitlist' })).toBeDisabled();
  }).toPass({ intervals: [250, 500, 1000], timeout: 15_000 });

  await expect(async () => {
    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search service clients' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter client segment' })).toHaveValue('all');
  }).toPass({ intervals: [250, 500, 1000], timeout: 15_000 });

  await expect(async () => {
    await page.getByRole('tab', { name: 'Reminders' }).click();
    await expect(page.getByRole('heading', { name: 'Reminders', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search reminders' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter reminders by status' })).toHaveValue('all');
    await expect(page.getByRole('combobox', { name: 'Reminder queue window' })).toHaveValue('24');
    await expect(page.getByRole('button', { name: 'Queue Due' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Due' })).toBeVisible();
  }).toPass({ intervals: [250, 500, 1000], timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Reminders', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search reminders' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Reminder queue window' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Queue Due' })).toBeVisible();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(async () => {
    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search service clients' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter client segment' })).toBeVisible();
  }).toPass({ intervals: [250, 500, 1000], timeout: 15_000 });

  await page.getByRole('tab', { name: 'Today' }).focus();
  await expect(page.getByRole('tab', { name: 'Today' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  if (diagnostics.length > 0) await testInfo.attach('runtime-diagnostics', { body: diagnostics.join('\n'), contentType: 'text/plain' });
  expect(diagnostics, diagnostics.join('\n')).toEqual([]);
});
