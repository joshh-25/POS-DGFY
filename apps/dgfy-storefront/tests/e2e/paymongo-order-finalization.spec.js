import { test, expect } from '@playwright/test';

const paymentFlowEnabled = process.env.E2E_PAYMENT_FLOW_ENABLED === 'true';
const storefrontURL = process.env.STOREFRONT_URL || 'http://localhost:5175';
const apiURL = process.env.E2E_API_URL || 'http://localhost:5000';
const storeSlug = String(process.env.E2E_STORE_SLUG || '').trim().toLowerCase();
const testEmail = String(process.env.E2E_TEST_USER_EMAIL || '').trim();
const testPassword = String(process.env.E2E_TEST_USER_PASSWORD || '');

const readJson = async (response) => {
  const body = await response.text();
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return { raw: body };
  }
};

const summarizePaymentSessionBody = (body) => {
  const paymentSession = body?.data?.payment_session || body?.payment_session;
  if (!paymentSession) return body;
  return {
    ...body,
    data: body.data
      ? {
          ...body.data,
          payment_session: {
            ...paymentSession,
            qr_code_image_url: paymentSession.qr_code_image_url ? '[omitted]' : paymentSession.qr_code_image_url
          }
        }
      : body.data,
    payment_session: body.payment_session
      ? {
          ...paymentSession,
          qr_code_image_url: paymentSession.qr_code_image_url ? '[omitted]' : paymentSession.qr_code_image_url
        }
      : body.payment_session
  };
};

const getStorePath = () => `/tenant-store/${encodeURIComponent(storeSlug)}`;

const registerPaymentFlowDiagnostics = (page) => {
  const diagnostics = [];
  const expectedUnauthenticatedProbe = (entry) => (
    entry.type === 'http'
    && entry.status === 401
    && entry.method === 'GET'
    && (
      entry.url.includes('/api/v1/dgfy/auth/me')
      || entry.url.includes('/api/v1/dgfy/account/companies')
    )
  );
  const expectedAuthConsoleError = (entry) => (
    entry.type === 'console.error'
    && entry.message === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
    && /\/login(?:\?|$)|\/tenant-store\//.test(new URL(entry.url).pathname)
    && diagnostics.some(expectedUnauthenticatedProbe)
  );

  page.on('pageerror', (error) => {
    diagnostics.push({
      type: 'pageerror',
      message: error.message,
      stack: error.stack || null,
      url: page.url()
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.push({
        type: 'console.error',
        message: message.text(),
        url: page.url()
      });
    }
  });
  page.on('requestfailed', (request) => {
    diagnostics.push({
      type: 'requestfailed',
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || 'unknown request failure'
    });
  });
  page.on('response', async (response) => {
    if (response.status() < 400) return;
    diagnostics.push({
      type: 'http',
      status: response.status(),
      method: response.request().method(),
      url: response.url()
    });
  });

  return {
    diagnostics,
    assertNoUnexpectedDiagnostics: () => {
      const unexpected = diagnostics.filter((entry) => {
        if (expectedUnauthenticatedProbe(entry)) return false;
        if (expectedAuthConsoleError(entry)) return false;
        if (entry.type === 'requestfailed' && entry.error === 'net::ERR_ABORTED') return false;
        return true;
      });
      expect(unexpected, `payment-flow diagnostics detected: ${JSON.stringify(unexpected, null, 2)}`).toEqual([]);
    }
  };
};

const waitForFinalizedPaymentSession = async ({ page, paymentSessionId }) => {
  let lastBody = null;
  try {
    await expect.poll(async () => {
      const response = await page.request.get(
        `${apiURL}/api/v1/store/checkout/payment-sessions/${encodeURIComponent(paymentSessionId)}`,
        {
          headers: { 'x-store-slug': storeSlug },
          failOnStatusCode: false
        }
      );
      const body = await readJson(response);
      lastBody = body;
      return body?.data?.payment_session?.status || body?.payment_session?.status || null;
    }, {
      timeout: 120_000,
      intervals: [2_000, 4_000, 6_000]
    }).toBe('finalized');
  } catch (error) {
    throw new Error(
      `Payment session ${paymentSessionId} did not finalize. Last response: ${JSON.stringify(summarizePaymentSessionBody(lastBody))}`,
      { cause: error }
    );
  }

  return lastBody;
};

test.describe('PayMongo online-order finalization', () => {
  test('creates one paid POS order after sandbox QR Ph confirmation', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(!paymentFlowEnabled, 'Set E2E_PAYMENT_FLOW_ENABLED=true to run the state-changing PayMongo sandbox flow.');
    test.skip(!storeSlug, 'E2E_STORE_SLUG is required and must identify a dedicated local test storefront.');
    test.skip(!testEmail || !testPassword, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');

    const instrumentation = registerPaymentFlowDiagnostics(page);
    const { diagnostics, assertNoUnexpectedDiagnostics } = instrumentation;
    const storefrontOrigin = storefrontURL.replace(/\/$/, '');
    const storePath = getStorePath();
    let paymentSessionId = null;

    try {
      await page.goto(`${storefrontOrigin}/login?return_to=${encodeURIComponent(storePath)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible();
      await page.locator('#dgfyLoginEmail').fill(testEmail);
      await page.locator('#dgfyLoginPassword').fill(testPassword);

      const loginResponsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/v1/dgfy/auth/login',
        { timeout: 20_000 }
      );
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      const loginResponse = await loginResponsePromise;
      const loginBody = await readJson(loginResponse);
      expect(loginResponse.status(), `DGFY login failed: ${JSON.stringify(loginBody)}`).toBe(200);

      await page.goto(`${storefrontOrigin}${storePath}`, { waitUntil: 'domcontentloaded' });
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
      expect(addedItem, 'No available storefront item could be added to the test cart.').toBe(true);

      const cartButton = page.locator('button[style*="position: fixed"]').last();
      await expect(cartButton).toBeVisible();
      await cartButton.click();
      await page.getByRole('button', { name: 'Order & Purchase', exact: true }).click();

      await expect(page.getByText('Step 1: Customer Details', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
      await expect(page.getByText('Step 2: Fulfillment', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
      await expect(page.getByText('Step 3: Review & Payment', { exact: true })).toBeVisible();

      const paymentTypeTrigger = page.locator('button[aria-haspopup="listbox"]').last();
      await expect(paymentTypeTrigger).toBeVisible();
      await paymentTypeTrigger.click();
      await page.getByRole('listbox').getByRole('button', { name: /Pay via QR Ph/i }).click();

      const createSessionResponsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/v1/store/checkout/payment-sessions'
          && response.request().method() === 'POST',
        { timeout: 20_000 }
      );
      await page.getByRole('button', { name: 'Generate QR Ph', exact: true }).click();
      const createSessionResponse = await createSessionResponsePromise;
      const createSessionBody = await readJson(createSessionResponse);
      expect(
        createSessionResponse.status(),
        `payment session creation failed: ${JSON.stringify(summarizePaymentSessionBody(createSessionBody))}`
      ).toBe(201);
      const createdPaymentSession = createSessionBody?.data?.payment_session || createSessionBody?.payment_session || null;
      paymentSessionId = createdPaymentSession?.payment_session_id || null;
      expect(paymentSessionId, `payment session was not returned: ${JSON.stringify(createSessionBody)}`).toMatch(/^CPS-[A-Z0-9]{10}$/);

      const confirmResponsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname.endsWith(`/confirm-test`)
          && response.request().method() === 'POST',
        { timeout: 20_000 }
      );
      await page.getByRole('button', { name: 'Confirm test payment', exact: true }).click();
      const confirmResponse = await confirmResponsePromise;
      const confirmBody = await readJson(confirmResponse);
      expect(
        confirmResponse.status(),
        `sandbox payment confirmation failed: ${JSON.stringify(summarizePaymentSessionBody(confirmBody))}`
      ).toBe(202);

      const finalizedBody = await waitForFinalizedPaymentSession({ page, paymentSessionId });
      const finalizedSession = finalizedBody?.data?.payment_session || finalizedBody?.payment_session || null;
      expect(finalizedSession?.status).toBe('finalized');
      expect(finalizedSession?.pos_transaction_id).toBeTruthy();
      expect(finalizedSession?.tracking_pin).toMatch(/^SK-[A-Z0-9]{6}$/);

      await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toContain('/track/');
      const trackingPin = decodeURIComponent(new URL(page.url()).pathname.split('/').filter(Boolean).pop() || '');
      expect(trackingPin).toBe(finalizedSession.tracking_pin);

      const trackingResponse = await page.request.get(
        `${apiURL}/api/v1/store/track/${encodeURIComponent(trackingPin)}`,
        {
          headers: { 'x-store-slug': storeSlug },
          failOnStatusCode: false
        }
      );
      const trackingBody = await readJson(trackingResponse);
      expect(trackingResponse.status(), `tracking lookup failed: ${JSON.stringify(trackingBody)}`).toBe(200);
      const trackedOrder = trackingBody?.data?.order || trackingBody?.order || null;
      expect(trackedOrder).toEqual(expect.objectContaining({
        payment_type: 'qrph',
        payment_status: 'paid',
        payment_provider: 'paymongo',
        payment_session_reference: paymentSessionId,
        order_source: 'online_store'
      }));
      expect(trackedOrder.pos_transaction_id).toBe(finalizedSession.pos_transaction_id);
      expect(trackedOrder.tracking_pin).toBe(finalizedSession.tracking_pin);
      await expect(page.getByText(/payment confirmed|order has been placed|order tracking/i)).toBeVisible();
    } finally {
      await testInfo.attach('paymongo-order-finalization-diagnostics.json', {
        body: JSON.stringify({
          url: page.url(),
          payment_session_id: paymentSessionId,
          diagnostics
        }, null, 2),
        contentType: 'application/json'
      });
      assertNoUnexpectedDiagnostics();
    }
  });
});
