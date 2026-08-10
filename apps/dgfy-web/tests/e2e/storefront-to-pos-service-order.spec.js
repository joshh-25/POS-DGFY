import { test, expect } from '@playwright/test';

const storefrontURL = String(process.env.STOREFRONT_URL || 'http://localhost:5175').replace(/\/$/, '');
const posURL = String(process.env.E2E_BASE_URL || 'http://localhost:5174').replace(/\/$/, '');
const apiURL = String(process.env.E2E_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const storeSlug = String(process.env.E2E_STORE_SLUG || '').trim().toLowerCase();
const companyName = String(process.env.E2E_TEST_COMPANY_NAME || '').trim();
const testEmail = String(process.env.E2E_TEST_USER_EMAIL || '').trim();
const testPassword = String(process.env.E2E_TEST_USER_PASSWORD || '');

const getPath = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || '');
  }
};

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
};

const responseSummary = (response, body) => ({
  status: response?.status?.() ?? null,
  message: body?.message || body?.error || null,
  error_code: body?.error_code || body?.code || null,
  data_keys: body?.data && typeof body.data === 'object' ? Object.keys(body.data) : []
});

const isExpectedHttpDiagnostic = (entry) => {
  const path = getPath(entry.url);
  if (entry.type !== 'http' || entry.method !== 'GET') return false;
  if (entry.status === 401 && [
    '/api/v1/dgfy/auth/me',
    '/api/v1/dgfy/account/companies',
    '/api/v1/pos/device/status',
    '/api/v1/store/auth/me'
  ].includes(path)) {
    return true;
  }
  return entry.status === 404 && path === '/api/v1/store/domain-context';
};

const isExpectedAbortedRequest = (entry) => {
  if (entry.type !== 'requestfailed' || entry.error !== 'net::ERR_ABORTED') return false;
  const path = getPath(entry.url);
  return path === '/api/v1/storefront/discovery'
    || path === '/api/v1/storefront/discovery/index'
    || path === '/api/v1/storefront/discovery/search'
    || path === '/api/v1/pos/catalog/events'
    || path === '/api/v1/dgfy/auth/me'
    || path === '/api/v1/dgfy/customer/events'
    || (/^\/openfreemap\/planet\/.+\.pbf$/i.test(path))
    || path === '/openfreemap/planet'
    || path === '/openfreemap/styles/positron'
    || (/^\/openfreemap\/sprites\/.+\.(png|json)$/i.test(path));
};

const isExpectedTrackingNetworkChange = (entry) => {
  if (entry.type !== 'requestfailed' || entry.error !== 'net::ERR_NETWORK_CHANGED') return false;
  if (!/\/tenant-store\/[^/]+\/track(?:\?|$)/.test(String(entry.page_url || ''))) return false;
  const path = getPath(entry.url);
  return /^\/api\/v1\/dgfy\/(affiliate|customer)\//.test(path)
    || path === '/api/v1/dgfy/account/companies'
    || /^\/api\/v1\/storefront\/discovery\//.test(path)
    || path === '/dgfy-symbologo-32.png'
    || /^\/openfreemap\//.test(path);
};

const registerDiagnostics = (page, surface) => {
  const diagnostics = [];
  const authHeaders = {};

  page.on('request', (request) => {
    if (!request.url().includes('/api/v1/') || request.url().includes('/api/v1/dgfy/')) return;
    const headers = request.headers();
    if (headers.authorization) authHeaders.authorization = headers.authorization;
    if (headers['x-company-token']) authHeaders['x-company-token'] = headers['x-company-token'];
  });

  page.on('pageerror', (error) => {
    diagnostics.push({
      type: 'pageerror',
      surface,
      message: error.message,
      stack: error.stack || null,
      url: page.url()
    });
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    diagnostics.push({
      type: 'console.error',
      surface,
      message: message.text(),
      url: page.url()
    });
  });

  page.on('requestfailed', (request) => {
    diagnostics.push({
      type: 'requestfailed',
      surface,
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || 'unknown request failure',
      page_url: page.url()
    });
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;
    diagnostics.push({
      type: 'http',
      surface,
      status: response.status(),
      method: response.request().method(),
      url: response.url()
    });
  });

  const assertNoUnexpectedDiagnostics = (stage) => {
    const unexpected = diagnostics.filter((entry) => {
      if (isExpectedHttpDiagnostic(entry) || isExpectedAbortedRequest(entry) || isExpectedTrackingNetworkChange(entry)) return false;
      if (entry.type !== 'console.error') return true;
      if (/\/tenant-store\/[^/]+\/track(?:\?|$)/.test(String(entry.url || ''))
        && (entry.message === 'Failed to load resource: net::ERR_NETWORK_CHANGED'
          || entry.message.startsWith('[TrackingRouteMap] MapLibre error'))) {
        return diagnostics.some((candidate) => isExpectedTrackingNetworkChange(candidate));
      }
      if (!/^Failed to load resource: the server responded with a status of (401|404) /.test(entry.message)) {
        return true;
      }
      return !diagnostics.some((candidate) => isExpectedHttpDiagnostic(candidate));
    });

    expect(unexpected, `${surface} diagnostics after ${stage}: ${JSON.stringify(unexpected, null, 2)}`).toEqual([]);
  };

  return { diagnostics, authHeaders, assertNoUnexpectedDiagnostics };
};

const extractShift = (body) => body?.data?.shift || body?.data?.current_shift || null;

const extractOrder = (body) => body?.data?.order || body?.order || null;

const extractTrackingPin = (body) => String(
  body?.data?.tracking_pin
    || body?.tracking_pin
    || extractOrder(body)?.tracking_pin
    || ''
).trim().toUpperCase();

const extractTransactionId = (body) => Number(
  extractOrder(body)?.pos_transaction_id
    || body?.data?.pos_transaction_id
    || body?.pos_transaction_id
    || 0
);

const getOrderLocationId = (order) => Number(
  order?.location_id
    || order?.fulfillment_location_id
    || order?.operating_location_id
    || 0
);

const getDeliveryJob = (order) => order?.deliveryJob ?? order?.delivery_job ?? null;

const attachScreenshot = async (testInfo, page, name) => {
  if (!page || page.isClosed()) return;
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
};

const findIncomingOrder = (orders, { transactionId, trackingPin }) => (
  orders.find((order) => (
    Number(order?.pos_transaction_id) === Number(transactionId)
      || String(order?.tracking_pin || '').trim().toUpperCase() === trackingPin
  )) || null
);

const getIncomingOrders = async (page, authHeaders, shiftId, locationId) => {
  const response = await page.request.get(`${apiURL}/api/v1/pos/incoming-orders`, {
    headers: authHeaders,
    params: {
      shift_id: shiftId,
      location_id: locationId,
      limit: 200
    },
    failOnStatusCode: false
  });
  const body = await readJson(response);
  expect(response.status(), `incoming-orders failed: ${JSON.stringify(responseSummary(response, body))}`).toBe(200);
  return Array.isArray(body?.data?.orders) ? body.data.orders : [];
};

const closeCreatedShift = async ({ page, authHeaders, shiftId, closingCashAmount, cleanupReport, runId }) => {
  const response = await page.request.post(`${apiURL}/api/v1/pos/terminal/shifts/${shiftId}/close`, {
    headers: authHeaders,
    data: {
      idempotency_key: `pw-close-${runId}`,
      closing_cash_amount: closingCashAmount,
      closing_note: `Playwright cleanup ${runId}`
    },
    failOnStatusCode: false
  });
  const body = await readJson(response);
  if (response.status() !== 200) {
    cleanupReport.push({
      action: 'close_shift',
      status: 'failed',
      http_status: response.status(),
      message: body?.message || body?.error || 'Shift close failed'
    });
    return;
  }
  cleanupReport.push({ action: 'close_shift', status: 'completed', shift_id: shiftId });
};

test.describe('Storefront to POS non-delivery service order', () => {
  test('submits Pickup order, completes it in POS, and verifies cleanup', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(!storeSlug, 'E2E_STORE_SLUG is required and must identify a dedicated local test storefront.');
    test.skip(!companyName, 'E2E_TEST_COMPANY_NAME is required and must match the storefront tenant.');
    test.skip(!testEmail || !testPassword, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');

    const runId = `PW-SERVICE-${Date.now()}`;
    const storefrontDiagnostics = registerDiagnostics(page, 'storefront');
    const posContext = await page.context().browser().newContext();
    const posPage = await posContext.newPage();
    const posDiagnostics = registerDiagnostics(posPage, 'pos');
    const cleanupReport = [];
    let createdShiftId = null;
    let activeShiftId = null;
    let openingCashAmount = 1000.01;
    let terminalId = null;
    let locationId = null;
    let trackingPin = null;
    let transactionId = null;
    let totalAmount = 0;
    let cashCollected = false;
    let completed = false;

    try {
      await test.step('preflight storefront availability', async () => {
        await page.goto(`${storefrontURL}/tenant-store/${encodeURIComponent(storeSlug)}`, { waitUntil: 'domcontentloaded' });
        const closedBadge = page.getByText('CLOSED', { exact: true }).first();
        if (await closedBadge.isVisible().catch(() => false)) {
          test.skip(true, `Dedicated storefront ${storeSlug} is closed; rerun during its configured operating hours.`);
        }
      });

      await test.step('authenticate POS and prepare a shift', async () => {
        await posPage.goto(`${posURL}/login`, { waitUntil: 'domcontentloaded' });
        await expect(posPage.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
        await posPage.getByLabel('DGFY or Cashier Email').fill(testEmail);
        await posPage.getByRole('textbox', { name: 'Password' }).fill(testPassword);

        const loginResponsePromise = posPage.waitForResponse(
          (response) => getPath(response.url()) === '/api/v1/dgfy/auth/login'
            && response.request().method() === 'POST',
          { timeout: 20_000 }
        );
        await posPage.getByRole('button', { name: /^sign in$/i }).click();
        const loginResponse = await loginResponsePromise;
        const loginBody = await readJson(loginResponse);
        expect(loginResponse.status(), `POS login failed: ${JSON.stringify(responseSummary(loginResponse, loginBody))}`).toBe(200);

        const companySelect = posPage.getByLabel('Company');
        await expect(companySelect).toBeVisible();
        await companySelect.selectOption({ label: companyName });
        await expect(companySelect).toHaveValue(/.+/);

        const tenantSessionResponsePromise = posPage.waitForResponse(
          (response) => getPath(response.url()) === '/api/v1/dgfy/auth/tenant-session'
            && response.request().method() === 'POST',
          { timeout: 20_000 }
        );
        await posPage.getByRole('button', { name: /^continue to pos$/i }).click();
        const tenantSessionResponse = await tenantSessionResponsePromise;
        const tenantSessionBody = await readJson(tenantSessionResponse);
        expect(tenantSessionResponse.status(), `tenant session failed: ${JSON.stringify(responseSummary(tenantSessionResponse, tenantSessionBody))}`).toBe(200);

        await expect(posPage.getByRole('heading', { name: 'POS Catalog' })).toBeVisible({ timeout: 20_000 });
        await expect.poll(() => Boolean(posDiagnostics.authHeaders.authorization), { timeout: 15_000 }).toBe(true);

        const terminalText = posPage.getByText(/^Terminal:\s+\S+$/).last();
        await expect(terminalText).toBeVisible({ timeout: 20_000 });
        terminalId = (await terminalText.innerText()).replace(/^Terminal:\s*/i, '').trim().toUpperCase();
        expect(terminalId, 'POS did not expose a selected terminal identity.').toMatch(/^[A-Z0-9._-]{2,100}$/);

        const currentShiftResponse = await posPage.request.get(`${apiURL}/api/v1/pos/terminal/shifts/current`, {
          headers: posDiagnostics.authHeaders,
          failOnStatusCode: false
        });
        const currentShiftBody = await readJson(currentShiftResponse);
        expect(currentShiftResponse.status(), `current shift lookup failed: ${JSON.stringify(responseSummary(currentShiftResponse, currentShiftBody))}`).toBe(200);
        let currentShift = extractShift(currentShiftBody);

        if (!currentShift) {
          const openingNotice = posPage.getByText(/No open shift is active\./).last();
          await expect(openingNotice).toBeVisible({ timeout: 20_000 });
          const openingInput = posPage.locator('#shift-opening-cash-amount').last();
          await openingInput.fill(String(openingCashAmount));
          await posPage.locator('#shift-opening-note').last().fill(runId);
          const openResponsePromise = posPage.waitForResponse(
            (response) => getPath(response.url()) === '/api/v1/pos/terminal/shifts/open'
              && response.request().method() === 'POST',
            { timeout: 20_000 }
          );
          await posPage.getByRole('button', { name: 'Open Shift', exact: true }).last().click();
          const openResponse = await openResponsePromise;
          const openBody = await readJson(openResponse);
          expect(openResponse.status(), `open shift failed: ${JSON.stringify(responseSummary(openResponse, openBody))}`).toBe(200);
          currentShift = extractShift(openBody);
          createdShiftId = Number(currentShift?.pos_terminal_shift_id || 0) || null;
          expect(createdShiftId, `open shift response omitted a shift id: ${JSON.stringify(responseSummary(openResponse, openBody))}`).toBeTruthy();
        }

        const shiftId = Number(currentShift?.pos_terminal_shift_id || 0);
        terminalId = String(currentShift?.terminal_id || terminalId || '').trim().toUpperCase();
        expect(terminalId, 'POS shift did not expose an authoritative terminal identity.').toMatch(/^[A-Z0-9._-]{2,100}$/);
        locationId = Number(currentShift?.location_id || 0);
        expect(shiftId).toBeGreaterThan(0);
        expect(locationId).toBeGreaterThan(0);
        activeShiftId = shiftId;
        await attachScreenshot(testInfo, posPage, 'pos-visible-and-shift-ready.png');
        posDiagnostics.assertNoUnexpectedDiagnostics('POS visible and shift ready');
      });

      await test.step('submit a storefront Pickup order with cash payment', async () => {
        const storePath = `/tenant-store/${encodeURIComponent(storeSlug)}`;
        await page.goto(`${storefrontURL}/login?return_to=${encodeURIComponent(storePath)}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible();
        await page.locator('#dgfyLoginEmail').fill(testEmail);
        await page.locator('#dgfyLoginPassword').fill(testPassword);

        const loginResponsePromise = page.waitForResponse(
          (response) => getPath(response.url()) === '/api/v1/dgfy/auth/login'
            && response.request().method() === 'POST',
          { timeout: 20_000 }
        );
        await page.getByRole('button', { name: 'Login', exact: true }).click();
        const loginResponse = await loginResponsePromise;
        const loginBody = await readJson(loginResponse);
        expect(loginResponse.status(), `Storefront login failed: ${JSON.stringify(responseSummary(loginResponse, loginBody))}`).toBe(200);

        await page.goto(`${storefrontURL}${storePath}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).not.toBeEmpty();
        const productCards = page.locator('article[data-cart-fly-origin="true"]');
        await expect(productCards.first()).toBeVisible({ timeout: 30_000 });
        let addedItem = false;
        for (let index = 0; index < await productCards.count(); index += 1) {
          const addButton = productCards.nth(index).getByRole('button').last();
          if (await addButton.isEnabled().catch(() => false)) {
            await addButton.click();
            addedItem = true;
            break;
          }
        }
        expect(addedItem, 'No available storefront catalog item could be added.').toBe(true);

        const cartButton = page.locator('button[style*="position: fixed"]').last();
        await expect(cartButton).toBeVisible();
        await cartButton.click();
        await page.getByRole('button', { name: 'Order & Purchase', exact: true }).click();

        await expect(page.getByText('Step 1: Customer Details', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
        await expect(page.getByText('Step 2: Fulfillment', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Pickup', exact: true }).click();
        await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
        await expect(page.getByText('Step 3: Review & Payment', { exact: true })).toBeVisible();
        await expect(page.getByText('Cash on delivery/pickup', { exact: true })).toBeVisible();

        const placeOrderButton = page.getByRole('button', { name: 'Place Order', exact: true });
        await expect(placeOrderButton).toBeEnabled();
        const checkoutResponsePromise = page.waitForResponse(
          (response) => getPath(response.url()) === '/api/v1/store/checkout'
            && response.request().method() === 'POST',
          { timeout: 30_000 }
        );
        await placeOrderButton.click();
        const checkoutResponse = await checkoutResponsePromise;
        const checkoutBody = await readJson(checkoutResponse);
        expect([200, 201], `store checkout failed: ${JSON.stringify(responseSummary(checkoutResponse, checkoutBody))}`).toContain(checkoutResponse.status());

        const storefrontOrder = extractOrder(checkoutBody);
        trackingPin = extractTrackingPin(checkoutBody);
        transactionId = extractTransactionId(checkoutBody);
        totalAmount = Number(storefrontOrder?.total_amount || checkoutBody?.data?.total_amount || 0);
        expect(trackingPin, `checkout did not return a tracking PIN: ${JSON.stringify(responseSummary(checkoutResponse, checkoutBody))}`).toMatch(/^SK-[A-Z0-9]{6}$/);
        expect(transactionId, `checkout did not return a POS transaction id: ${JSON.stringify(responseSummary(checkoutResponse, checkoutBody))}`).toBeGreaterThan(0);
        expect(totalAmount).toBeGreaterThan(0);
        expect(storefrontOrder).toEqual(expect.objectContaining({
          order_method: 'pickup',
          payment_type: 'cash',
          order_source: 'online_store'
        }));
        expect(getDeliveryJob(storefrontOrder)).toBeFalsy();
        const checkoutLocationId = getOrderLocationId(storefrontOrder);
        if (checkoutLocationId > 0) {
          expect(checkoutLocationId).toBe(locationId);
        }

        const trackingResponse = await page.request.get(`${apiURL}/api/v1/store/track/${encodeURIComponent(trackingPin)}`, {
          headers: { 'x-store-slug': storeSlug },
          failOnStatusCode: false
        });
        const trackingBody = await readJson(trackingResponse);
        expect(trackingResponse.status(), `tracking lookup failed: ${JSON.stringify(responseSummary(trackingResponse, trackingBody))}`).toBe(200);
        const trackedOrder = trackingBody?.data?.order || trackingBody?.order || null;
        expect(trackedOrder).toEqual(expect.objectContaining({
          tracking_pin: trackingPin,
          order_method: 'pickup',
          payment_type: 'cash',
          order_source: 'online_store'
        }));
        expect(getDeliveryJob(trackedOrder)).toBeFalsy();
        await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toContain('/track');
        await attachScreenshot(testInfo, page, 'storefront-order-submitted.png');
        storefrontDiagnostics.assertNoUnexpectedDiagnostics('storefront order submitted');
      });

      await test.step('find the exact order in the POS Incoming Online Queue', async () => {
        await posPage.getByRole('button', { name: /^Orders\b/ }).last().click();
        await expect(posPage.getByRole('button', { name: 'Refresh Queue', exact: true })).toBeVisible({ timeout: 20_000 });
        await posPage.getByRole('button', { name: 'Refresh Queue', exact: true }).click();
        await expect.poll(async () => {
          const orders = await getIncomingOrders(posPage, posDiagnostics.authHeaders, activeShiftId, locationId);
          return findIncomingOrder(orders, { transactionId, trackingPin })?.fulfillment_status || null;
        }, { timeout: 60_000, intervals: [1_000, 2_000, 4_000] }).toBe('placed');

        const orders = await getIncomingOrders(posPage, posDiagnostics.authHeaders, activeShiftId, locationId);
        const matchingOrders = orders.filter((order) => (
          Number(order?.pos_transaction_id) === transactionId
            || String(order?.tracking_pin || '').trim().toUpperCase() === trackingPin
        ));
        expect(matchingOrders).toHaveLength(1);
        const incomingOrder = matchingOrders[0];
        expect(incomingOrder).toEqual(expect.objectContaining({
          pos_transaction_id: transactionId,
          tracking_pin: trackingPin,
          order_method: 'pickup',
          payment_type: 'cash',
          fulfillment_status: 'placed',
          location_id: locationId
        }));
        expect(getDeliveryJob(incomingOrder)).toBeFalsy();
        expect(Number(incomingOrder.delivery_personnel_id || 0)).toBe(0);

        const orderCard = posPage.locator('#pos-section-incoming-orders > div.grid > div.rounded-xl').filter({ hasText: trackingPin }).first();
        await expect(orderCard).toBeVisible({ timeout: 20_000 });
        await expect(orderCard.getByText('Pickup', { exact: true })).toBeVisible();
        await expect(orderCard.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
        await attachScreenshot(testInfo, posPage, 'pos-order-visible-before-acceptance.png');
        posDiagnostics.assertNoUnexpectedDiagnostics('order visible in POS queue');
      });

      const transition = async ({ buttonName, expectedStatus, stage }) => {
        const orderCard = posPage.locator('#pos-section-incoming-orders > div.grid > div.rounded-xl').filter({ hasText: trackingPin }).first();
        await expect(orderCard).toBeVisible({ timeout: 20_000 });
        const patchResponsePromise = posPage.waitForResponse(
          (response) => getPath(response.url()) === `/api/v1/pos/orders/${transactionId}/status`
            && response.request().method() === 'PATCH',
          { timeout: 20_000 }
        );
        await orderCard.getByRole('button', { name: buttonName, exact: true }).click();
        const patchResponse = await patchResponsePromise;
        const patchBody = await readJson(patchResponse);
        expect(patchResponse.status(), `${stage} failed: ${JSON.stringify(responseSummary(patchResponse, patchBody))}`).toBe(200);
        const updatedOrder = extractOrder(patchBody);
        expect(updatedOrder).toEqual(expect.objectContaining({
          pos_transaction_id: transactionId,
          tracking_pin: trackingPin,
          order_method: 'pickup',
          fulfillment_status: expectedStatus,
          location_id: locationId
        }));
        expect(getDeliveryJob(updatedOrder)).toBeFalsy();
        await expect.poll(async () => {
          const orders = await getIncomingOrders(posPage, posDiagnostics.authHeaders, activeShiftId, locationId);
          return findIncomingOrder(orders, { transactionId, trackingPin })?.fulfillment_status || null;
        }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe(expectedStatus);
        return updatedOrder;
      };

      await test.step('accept the POS order and progress fulfillment', async () => {
        await transition({ buttonName: 'Confirm', expectedStatus: 'confirmed', stage: 'POS acceptance' });
        await transition({ buttonName: 'Start Preparing', expectedStatus: 'preparing', stage: 'POS preparation start' });
        await transition({ buttonName: 'Ready for Pickup', expectedStatus: 'ready_for_pickup', stage: 'POS ready-for-pickup transition' });
        await attachScreenshot(testInfo, posPage, 'pos-order-accepted-and-ready.png');
        posDiagnostics.assertNoUnexpectedDiagnostics('order accepted and ready for pickup');
      });

      await test.step('record safe cash payment before pickup completion', async () => {
        const orderCard = posPage.locator('#pos-section-incoming-orders > div.grid > div.rounded-xl').filter({ hasText: trackingPin }).first();
        await expect(orderCard.getByRole('button', { name: 'Collect Cash', exact: true })).toBeVisible();
        await orderCard.getByRole('button', { name: 'Collect Cash', exact: true }).click();
        const cashInput = posPage.getByLabel('Amount received');
        await expect(cashInput).toBeVisible();
        await cashInput.fill(String(totalAmount));
        const cashModal = cashInput.locator('xpath=ancestor::div[contains(@class, "fixed") and contains(@class, "z-[100]")][1]');
        const cashResponsePromise = posPage.waitForResponse(
          (response) => getPath(response.url()) === `/api/v1/pos/orders/${transactionId}/collect-cash`
            && response.request().method() === 'POST',
          { timeout: 20_000 }
        );
        await cashModal.getByRole('button', { name: 'Collect Cash', exact: true }).click();
        const cashResponse = await cashResponsePromise;
        const cashBody = await readJson(cashResponse);
        expect(cashResponse.status(), `cash collection failed: ${JSON.stringify(responseSummary(cashResponse, cashBody))}`).toBe(200);
        cashCollected = true;
        expect(extractOrder(cashBody)).toEqual(expect.objectContaining({
          pos_transaction_id: transactionId,
          payment_status: 'paid',
          order_method: 'pickup'
        }));
        await expect(cashInput).toBeHidden();
        await expect.poll(async () => {
          const orders = await getIncomingOrders(posPage, posDiagnostics.authHeaders, activeShiftId, locationId);
          return findIncomingOrder(orders, { transactionId, trackingPin })?.payment_status || null;
        }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe('paid');
        posDiagnostics.assertNoUnexpectedDiagnostics('cash payment recorded');
      });

      await test.step('finish the POS order and verify it leaves the incoming queue', async () => {
        const orderCard = posPage.locator('#pos-section-incoming-orders > div.grid > div.rounded-xl').filter({ hasText: trackingPin }).first();
        await expect(orderCard).toBeVisible();
        const patchResponsePromise = posPage.waitForResponse(
          (response) => getPath(response.url()) === `/api/v1/pos/orders/${transactionId}/status`
            && response.request().method() === 'PATCH',
          { timeout: 20_000 }
        );
        await orderCard.getByRole('button', { name: 'Picked Up', exact: true }).click();
        const completionResponse = await patchResponsePromise;
        const completionBody = await readJson(completionResponse);
        expect(completionResponse.status(), `POS completion failed: ${JSON.stringify(responseSummary(completionResponse, completionBody))}`).toBe(200);
        const completedOrder = extractOrder(completionBody);
        expect(completedOrder).toEqual(expect.objectContaining({
          pos_transaction_id: transactionId,
          tracking_pin: trackingPin,
          order_method: 'pickup',
          fulfillment_status: 'completed',
          payment_status: 'paid',
          location_id: locationId
        }));
        expect(getDeliveryJob(completedOrder)).toBeFalsy();
        completed = true;

        await expect.poll(async () => {
          const orders = await getIncomingOrders(posPage, posDiagnostics.authHeaders, activeShiftId, locationId);
          return findIncomingOrder(orders, { transactionId, trackingPin });
        }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBeNull();
        await expect(posPage.getByText(trackingPin, { exact: true })).toHaveCount(0, { timeout: 20_000 });
        await attachScreenshot(testInfo, posPage, 'pos-order-completed.png');
        posDiagnostics.assertNoUnexpectedDiagnostics('order completed');
      });
    } finally {
      if (transactionId && !completed && posPage && !posPage.isClosed()) {
        const rejectResponse = await posPage.request.patch(`${apiURL}/api/v1/pos/orders/${transactionId}/status`, {
          headers: posDiagnostics.authHeaders,
          data: {
            fulfillment_status: 'rejected',
            reason: `Playwright cleanup ${runId}`,
            idempotency_key: `pw-reject-${runId}`
          },
          failOnStatusCode: false
        });
        const rejectBody = await readJson(rejectResponse);
        cleanupReport.push({
          action: 'reject_incomplete_pos_order',
          status: rejectResponse.status() === 200 ? 'completed' : 'failed',
          http_status: rejectResponse.status(),
          transaction_id: transactionId,
          message: rejectResponse.status() === 200 ? null : rejectBody?.message || rejectBody?.error || 'POS rejection failed'
        });
      }

      if (trackingPin && !completed && cleanupReport.at(-1)?.status !== 'completed') {
        const cancelResponse = await page.request.patch(`${apiURL}/api/v1/store/orders/${encodeURIComponent(trackingPin)}/cancel`, {
          headers: { 'x-store-slug': storeSlug },
          data: {},
          failOnStatusCode: false
        });
        const cancelBody = await readJson(cancelResponse);
        cleanupReport.push({
          action: 'cancel_incomplete_storefront_order',
          status: cancelResponse.status() === 200 ? 'completed' : 'failed',
          http_status: cancelResponse.status(),
          message: cancelResponse.status() === 200 ? null : cancelBody?.message || cancelBody?.error || 'Cancellation failed',
          tracking_pin: trackingPin
        });
      }

      if (completed && transactionId && posPage && !posPage.isClosed()) {
        const pairedResponse = await posPage.request.get(`${apiURL}/api/v1/pos/terminal/paired`, {
          headers: { ...posDiagnostics.authHeaders, 'x-pos-terminal-id': terminalId },
          params: { terminal_id: terminalId },
          failOnStatusCode: false
        });
        const pairedBody = await readJson(pairedResponse);
        const registeredTerminalId = String(
          pairedBody?.data?.terminal_id
            || pairedBody?.data?.terminal?.terminal_id
            || terminalId
        ).trim().toUpperCase();
        if (pairedResponse.status() === 200 && registeredTerminalId) {
          const voidResponse = await posPage.request.post(`${apiURL}/api/v1/pos/transactions/${transactionId}/void`, {
            headers: { ...posDiagnostics.authHeaders, 'x-pos-terminal-id': registeredTerminalId },
            data: {
              reason: `Playwright cleanup ${runId}`,
              shift_id: activeShiftId || undefined,
              terminal_id: registeredTerminalId
            },
            failOnStatusCode: false
          });
          const voidBody = await readJson(voidResponse);
          const voidedTransaction = voidBody?.data?.transaction || voidBody?.transaction || null;
          cleanupReport.push({
            action: 'void_completed_pos_transaction',
            status: voidResponse.status() === 200 && voidedTransaction?.status === 'voided' ? 'completed' : 'failed',
            http_status: voidResponse.status(),
            transaction_id: transactionId,
            message: voidResponse.status() === 200 ? null : voidBody?.message || voidBody?.error || 'POS void failed'
          });
        } else {
          cleanupReport.push({
            action: 'void_completed_pos_transaction',
            status: 'not_available',
            http_status: pairedResponse.status(),
            transaction_id: transactionId,
            message: pairedBody?.message || 'No registered terminal was available for supported POS void cleanup.'
          });
        }
      }

      if (createdShiftId && posPage && !posPage.isClosed()) {
        await closeCreatedShift({
          page: posPage,
          authHeaders: posDiagnostics.authHeaders,
          shiftId: createdShiftId,
          closingCashAmount: openingCashAmount + (cashCollected ? totalAmount : 0),
          cleanupReport,
          runId
        });
      }

      await testInfo.attach('storefront-to-pos-service-order-diagnostics.json', {
        body: JSON.stringify({
          run_id: runId,
          storefront_url: page.url(),
          pos_url: posPage?.url() || null,
          tracking_pin: trackingPin,
          transaction_id: transactionId,
          diagnostics: [...storefrontDiagnostics.diagnostics, ...posDiagnostics.diagnostics],
          cleanup: cleanupReport
        }, null, 2),
        contentType: 'application/json'
      });
      await posContext.close();
    }
  });
});
