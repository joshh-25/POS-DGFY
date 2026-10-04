import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { signIn } from '../fixtures/login.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../../../../../');
const setupScript = path.join(repositoryRoot, 'apps/dgfy-api/tests/fixtures/prepare-pos-sales-e2e-user.mjs');
const apiBaseUrl = String(process.env.E2E_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const itemName = `POS Sales Journey ${Date.now()}`;
const skuCode = `POSS-${Date.now().toString().slice(-9)}`;
const price = 145;
const quantity = 1;

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
};

const authenticatedRequest = async (page, authHeaders, method, route, data) => {
  const response = await page.request.fetch(`${apiBaseUrl}/api/v1${route}`, {
    method,
    headers: authHeaders,
    ...(data === undefined ? {} : { data }),
  });
  const body = await readJson(response);
  expect(response.ok(), `${method} ${route} failed (${response.status()}): ${JSON.stringify(body)}`).toBe(true);
  return body?.data ?? body;
};

const stockForItem = async (page, authHeaders, itemId) => {
  const item = await authenticatedRequest(page, authHeaders, 'GET', `/items/${itemId}`);
  return Number(item?.current_stock ?? item?.item?.current_stock);
};

test('POS checkout decrements stock, opens history detail, and downloads sales CSV', async ({ page }, testInfo) => {
  const user = JSON.parse(execFileSync(process.execPath, [setupScript], {
    cwd: path.join(repositoryRoot, 'apps/dgfy-api'),
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }));
  const authHeaders = {
    'x-company-token': user.companyToken,
    'x-pos-terminal-id': user.terminalId,
  };
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/api/v1/') || url.includes('/api/v1/dgfy/')) return;
    const headers = request.headers();
    if (headers.authorization) authHeaders.authorization = headers.authorization;
    if (headers['x-company-token']) authHeaders['x-company-token'] = headers['x-company-token'];
  });

  await page.addInitScript(({ terminalId }) => {
    window.localStorage.setItem('pos_terminal_identity_v1', terminalId);
  }, { terminalId: user.terminalId });
  await signIn(page, { email: user.email, password: user.password }, {
    companyName: process.env.E2E_TEST_COMPANY_NAME || 'Original Legacy Data',
  });
  await expect.poll(() => Boolean(authHeaders.authorization), { timeout: 15_000 }).toBe(true);

  const item = await authenticatedRequest(page, authHeaders, 'POST', '/items', {
    sku_code: skuCode,
    name: itemName,
    category: 'product',
    product_type: 'finished_goods',
    unit_of_measure: 'pcs',
    cost_per_unit: 120,
    default_sale_price: price,
    vat_type: 'vatable',
    max_capacity: 20,
    current_stock: 8,
    status: 'active',
  });
  const itemId = Number(item?.item_id || item?.id);
  expect(itemId).toBeGreaterThan(0);
  await authenticatedRequest(page, authHeaders, 'PATCH', `/pos/catalog-overrides/${itemId}`, { pos_visible: true });
  const stockBefore = await stockForItem(page, authHeaders, itemId);
  expect(stockBefore).toBe(8);

  const shiftState = await authenticatedRequest(
    page,
    authHeaders,
    'GET',
    `/pos/terminal/shifts/current?terminal_id=${encodeURIComponent(user.terminalId)}`,
  );
  let openedShiftId = Number(shiftState?.shift?.pos_terminal_shift_id || 0) || null;
  let closingCashAmount = 0;
  try {
    if (!openedShiftId) {
      const openedShift = await authenticatedRequest(page, authHeaders, 'POST', '/pos/terminal/shifts/open', {
        idempotency_key: `pos-sales-e2e-open-${Date.now()}`,
        terminal_id: user.terminalId,
        location_id: user.locationId,
        opening_float_amount: 0,
        opening_note: 'POS sales journey E2E',
      });
      openedShiftId = Number(openedShift?.shift?.pos_terminal_shift_id || openedShift?.pos_terminal_shift_id);
      expect(openedShiftId).toBeGreaterThan(0);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();
    }

    const catalogSearch = page.locator('input[placeholder="Search POS-visible items..."]:visible').first();
    await expect(catalogSearch).toBeVisible();
    await catalogSearch.fill(itemName);
    const catalogItem = page.locator('p:visible').filter({ hasText: itemName }).first();
    await expect(catalogItem).toBeVisible();
    await catalogItem.click();
    const checkoutButton = page.getByRole('button', { name: 'Checkout', exact: true });
    await expect(checkoutButton).toBeEnabled();
    await checkoutButton.click();
    const checkoutDialog = page.getByRole('dialog').filter({ hasText: 'Checkout Tab' });
    await expect(checkoutDialog).toBeVisible();
    const checkoutResponsePromise = page.waitForResponse((response) => (
      new URL(response.url()).pathname.endsWith('/api/v1/pos/checkouts')
    ));
    await checkoutDialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const checkoutResponse = await checkoutResponsePromise;
    const checkoutBody = await readJson(checkoutResponse);
    expect([200, 201], JSON.stringify(checkoutBody)).toContain(checkoutResponse.status());
    const transaction = checkoutBody?.data?.transaction || checkoutBody?.data?.pos_transaction || checkoutBody?.data;
    const invoiceNumber = String(transaction?.invoice_number || '').trim();
    expect(invoiceNumber).not.toBe('');
    closingCashAmount = Number(transaction?.total_amount || price);

    await expect.poll(() => stockForItem(page, authHeaders, itemId), { timeout: 15_000 }).toBe(stockBefore - quantity);

    const orderPreview = page.getByRole('dialog').filter({ hasText: 'Order Preview' });
    await expect(orderPreview).toBeVisible();
    await orderPreview.getByRole('button', { name: 'View Receipt', exact: true }).click();
    const checkoutReceipt = page.getByRole('dialog').filter({ hasText: 'Receipt Preview' });
    await expect(checkoutReceipt).toBeVisible();
    await checkoutReceipt.getByRole('button', { name: 'Close receipt preview' }).click();
    await page.getByTestId('pos-nav-history').click();
    await expect(page.getByPlaceholder('Search all transaction fields...')).toBeVisible();
    const historyRow = page.locator('table[aria-label="POS transaction history table"] tbody tr')
      .filter({ hasText: invoiceNumber }).first();
    await expect(historyRow).toBeVisible();
    await historyRow.getByRole('button', { name: `View receipt for ${invoiceNumber}` }).click();
    const receiptDialog = page.getByRole('dialog').filter({ hasText: 'Receipt Preview' });
    await expect(receiptDialog).toBeVisible();
    await expect(receiptDialog.getByText(invoiceNumber, { exact: false })).toBeVisible();
    await expect(receiptDialog.getByText(itemName, { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Close receipt preview' }).click();
    await page.getByTestId('pos-nav-reports').click();
    await expect(page.getByRole('tab', { name: 'Sales', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Sales', exact: true }).click();
    const exportButton = page.getByRole('button', { name: 'Export CSV', exact: true }).first();
    await expect(exportButton).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    const filename = download.suggestedFilename();
    expect(filename).toBe('pos-sales-report.csv');
    const downloadPath = testInfo.outputPath(filename);
    await download.saveAs(downloadPath);
    const csv = await readFile(downloadPath, 'utf8');
    expect(csv).toContain('"Invoice","Datetime (Asia/Manila)"');
    expect(csv).toContain(invoiceNumber);
  } finally {
    if (openedShiftId) {
      const closingAmount = closingCashAmount || Number((await authenticatedRequest(
        page,
        authHeaders,
        'GET',
        `/pos/terminal/shifts/current?terminal_id=${encodeURIComponent(user.terminalId)}`,
      ))?.cash_summary?.expected_cash_amount || 0);
      await authenticatedRequest(page, authHeaders, 'POST', `/pos/terminal/shifts/${openedShiftId}/close`, {
        idempotency_key: `pos-sales-e2e-close-${Date.now()}`,
        closing_cash_amount: closingAmount,
        closing_note: 'POS sales journey E2E cleanup',
      }).catch(() => {});
    }
  }
});
