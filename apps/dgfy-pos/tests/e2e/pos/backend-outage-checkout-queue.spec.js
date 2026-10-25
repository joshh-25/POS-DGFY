import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { signIn } from '../fixtures/login.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../../../../../');
const setupScript = path.join(repositoryRoot, 'apps/dgfy-api/tests/fixtures/prepare-pos-sales-e2e-user.mjs');
const apiBaseUrl = String(process.env.E2E_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const itemPrice = 145;

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
};

const authenticatedRequest = async (page, authHeaders, method, route, data) => {
  const response = await page.request.fetch(apiBaseUrl + '/api/v1' + route, {
    method,
    headers: authHeaders,
    ...(data === undefined ? {} : { data })
  });
  const body = await readJson(response);
  expect(response.ok(), method + ' ' + route + ' failed (' + response.status() + '): ' + JSON.stringify(body)).toBe(true);
  return body?.data ?? body;
};

const readQueuedEntry = async (page, intentId) => page.evaluate(async (id) => {
  const database = await new Promise((resolve, reject) => {
    const request = window.indexedDB.open('sku_pos_terminal_sync_queue', 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const entry = await new Promise((resolve, reject) => {
    const request = database
      .transaction('terminal_operation_queue', 'readonly')
      .objectStore('terminal_operation_queue')
      .get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return entry;
}, intentId);

const prepareTerminalCheckout = async (page) => {
  const user = JSON.parse(execFileSync(process.execPath, [setupScript], {
    cwd: path.join(repositoryRoot, 'apps/dgfy-api'),
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  }));
  const authHeaders = {
    'x-company-token': user.companyToken,
    'x-pos-terminal-id': user.terminalId
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
    expectedPostcondition: 'pos-catalog'
  });
  await expect.poll(() => Boolean(authHeaders.authorization), { timeout: 15_000 }).toBe(true);

  const stamp = Date.now();
  const itemName = 'Backend Outage ' + stamp;
  const item = await authenticatedRequest(page, authHeaders, 'POST', '/items', {
    sku_code: 'BO-' + String(stamp).slice(-9),
    name: itemName,
    category: 'product',
    product_type: 'finished_goods',
    unit_of_measure: 'pcs',
    cost_per_unit: 120,
    default_sale_price: itemPrice,
    vat_type: 'vatable',
    max_capacity: 20,
    current_stock: 8,
    status: 'active'
  });
  const itemId = Number(item?.item_id || item?.id);
  expect(itemId).toBeGreaterThan(0);
  await authenticatedRequest(page, authHeaders, 'PATCH', '/pos/catalog-overrides/' + itemId, { pos_visible: true });

  const shiftState = await authenticatedRequest(
    page,
    authHeaders,
    'GET',
    '/pos/terminal/shifts/current?terminal_id=' + encodeURIComponent(user.terminalId)
  );
  let openedShiftId = Number(shiftState?.shift?.pos_terminal_shift_id || 0) || null;
  if (!openedShiftId) {
    const unlockDialog = page.getByRole('dialog').filter({ hasText: 'Opening Cash' }).last();
    if (!await unlockDialog.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Unlock Terminal', exact: true }).click();
    }
    await expect(unlockDialog).toBeVisible();
    await unlockDialog.getByLabel('Opening Cash').fill('0');
    const openShiftResponsePromise = page.waitForResponse((response) => (
      new URL(response.url()).pathname.endsWith('/api/v1/pos/terminal/shifts/open')
    ));
    await unlockDialog.getByRole('button', { name: 'Open Shift', exact: true }).click();
    const openShiftResponse = await openShiftResponsePromise;
    const openShiftBody = await readJson(openShiftResponse);
    expect(openShiftResponse.ok(), JSON.stringify(openShiftBody)).toBe(true);
    const openedShift = await authenticatedRequest(
      page,
      authHeaders,
      'GET',
      '/pos/terminal/shifts/current?terminal_id=' + encodeURIComponent(user.terminalId)
    );
    openedShiftId = Number(openedShift?.shift?.pos_terminal_shift_id || 0) || null;
    expect(openedShiftId).toBeGreaterThan(0);
    await expect(unlockDialog).toBeHidden();
  }

  const stockAlertDialog = page.getByRole('dialog')
    .filter({ hasText: 'POS inventory needs attention before the next selling session.' });
  if (await stockAlertDialog.isVisible().catch(() => false)) {
    await stockAlertDialog.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(stockAlertDialog).toBeHidden();
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

  return { authHeaders, openedShiftId, page, user, itemName };
};

const closeShift = async ({ authHeaders, openedShiftId, page, user }) => {
  if (!openedShiftId) return;
  await authenticatedRequest(
    page,
    authHeaders,
    'POST',
    '/pos/terminal/shifts/' + openedShiftId + '/close',
    {
      idempotency_key: 'backend-outage-e2e-close-' + Date.now(),
      closing_cash_amount: 0,
      closing_note: 'Backend outage checkout E2E cleanup'
    }
  ).catch(() => {});
  await authenticatedRequest(
    page,
    authHeaders,
    'GET',
    '/pos/terminal/shifts/current?terminal_id=' + encodeURIComponent(user.terminalId)
  ).catch(() => {});
};

const completeOutageCheckout = async ({ page, routePattern, routeHandler }) => {
  let idempotencyKey = '';
  await page.route(routePattern, async (route) => {
    idempotencyKey = String(route.request().postDataJSON()?.idempotency_key || '');
    await routeHandler(route);
  });
  const checkoutDialog = page.getByRole('dialog').filter({ hasText: 'Checkout Tab' });
  await checkoutDialog.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByText('Offline transaction saved locally.', { exact: false })).toBeVisible();
  expect(idempotencyKey).not.toBe('');
  await expect.poll(async () => (await readQueuedEntry(page, idempotencyKey))?.status).toBe('queued');
  const queuedEntry = await readQueuedEntry(page, idempotencyKey);
  expect(queuedEntry).toMatchObject({
    intent_id: idempotencyKey,
    operation: 'checkout',
    status: 'queued'
  });
  expect(queuedEntry.payload.idempotency_key).toBe(idempotencyKey);
  await expect(page.getByText(/^POS checkout failed$/i)).toHaveCount(0);

  await page.unroute(routePattern);
  const recoveredCatalogResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith('/api/v1/pos/catalog') && response.status() < 500
  ));
  await page.reload();
  await recoveredCatalogResponse;
  await expect(page.locator('input[placeholder="Search POS-visible items..."]:visible').first()).toBeVisible();
  await expect.poll(async () => (await readQueuedEntry(page, idempotencyKey))?.status).toBe('queued');
};

test('queues a cash checkout after the server returns 502 and recovers after the route is removed', async ({ page }) => {
  const checkout = await prepareTerminalCheckout(page);
  try {
    await completeOutageCheckout({
      page,
      routePattern: '**/api/v1/pos/checkouts',
      routeHandler: (route) => route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Gateway unavailable' })
      })
    });
  } finally {
    await page.unroute('**/api/v1/pos/checkouts').catch(() => {});
    await closeShift(checkout);
  }
});

test('queues a cash checkout after API requests are aborted and recovers after the route is removed', async ({ page }) => {
  const checkout = await prepareTerminalCheckout(page);
  try {
    await completeOutageCheckout({
      page,
      routePattern: '**/api/**',
      routeHandler: (route) => route.abort('failed')
    });
  } finally {
    await page.unroute('**/api/**').catch(() => {});
    await closeShift(checkout);
  }
});
