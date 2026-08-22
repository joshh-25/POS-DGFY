import { test, expect } from '@playwright/test';

const paymentFlowEnabled = process.env.E2E_DIRECT_CARD_FLOW_ENABLED === 'true';
const configuredScenario = String(process.env.E2E_DIRECT_CARD_SCENARIO || '').trim().toLowerCase();
const storefrontURL = process.env.STOREFRONT_URL || 'http://localhost:5175';
const apiURL = process.env.E2E_API_URL || 'http://localhost:5000';
const storeSlug = String(process.env.E2E_STORE_SLUG || '').trim().toLowerCase();
const testEmail = String(process.env.E2E_TEST_USER_EMAIL || '').trim();
const testPassword = String(process.env.E2E_TEST_USER_PASSWORD || '');
const directCardCvc = String(process.env.E2E_DIRECT_CARD_CVC || '').trim();
const directCardExpiry = String(process.env.E2E_DIRECT_CARD_EXPIRY || '').trim();
const storefrontOrigin = new URL(storefrontURL).origin;
const storefrontHostname = new URL(storefrontURL).hostname;
const apiHostname = new URL(apiURL).hostname;
const expectedAnonymousProbePaths = new Set([
  '/api/v1/dgfy/auth/me',
  '/api/v1/dgfy/account/companies'
]);

const cardScenarios = {
  success: {
    cardNumber: String(process.env.E2E_DIRECT_CARD_SUCCESS_NUMBER || '').trim(),
    expects3ds: false
  },
  '3ds': {
    cardNumber: String(process.env.E2E_DIRECT_CARD_3DS_NUMBER || '').trim(),
    expects3ds: true
  }
};

const readJson = async (response) => {
  let body;
  try {
    body = await response.text();
  } catch (error) {
    return { read_error: error.message };
  }
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return { raw: body };
  }
};

const summarizeSession = (body) => {
  const session = body?.data?.payment_session || body?.payment_session || null;
  if (!session) return body;
  return {
    payment_session_id: session.payment_session_id || null,
    payment_method: session.payment_method || null,
    payment_flow: session.payment_flow || null,
    status: session.status || null,
    provider_payment_intent_id: session.provider_payment_intent_id ? '[present]' : null,
    checkout_url: session.checkout_url || null,
    paymongo_client_key: session.paymongo_client_key ? '[present]' : null,
    paymongo_public_key: session.paymongo_public_key ? '[present]' : null,
    paymongo_return_url: session.paymongo_return_url ? '[present]' : null
  };
};

const getStorePath = () => `/tenant-store/${encodeURIComponent(storeSlug)}`;

const assertHealthyPage = async (page, checkpoint) => {
  await expect.poll(
    async () => (await page.locator('body').innerText().catch(() => '')).trim().length,
    { timeout: 5_000 }
  ).toBeGreaterThan(0);
  await expect(
    page.getByText(/something went wrong|unexpected error|application error|fatal error/i).first(),
    `${checkpoint}: an error boundary is visible`
  ).not.toBeVisible({ timeout: 2_000 });
};

const waitForFinalizedPaymentSession = async ({ page, paymentSessionId }) => {
  let lastSessionBody = null;
  await expect.poll(async () => {
    const response = await page.request.get(
      `${apiURL}/api/v1/store/checkout/payment-sessions/${encodeURIComponent(paymentSessionId)}`,
      {
        headers: { 'x-store-slug': storeSlug },
        failOnStatusCode: false
      }
    );
    lastSessionBody = await readJson(response);
    return lastSessionBody?.data?.payment_session?.status || lastSessionBody?.payment_session?.status || null;
  }, { timeout: 120_000, intervals: [2_000, 4_000, 6_000] }).toBe('finalized');
  return lastSessionBody?.data?.payment_session || lastSessionBody?.payment_session || null;
};

const assertNoUnexpectedDiagnostics = (diagnostics) => {
  const unexpected = diagnostics.filter((entry) => {
    if (entry.type === 'requestfailed' && entry.errorText === 'net::ERR_ABORTED') return false;
    if (entry.type === 'console.error' && /favicon|ResizeObserver loop/i.test(entry.message)) return false;
    // The storefront performs documented anonymous/pre-auth probes during bootstrap;
    // the browser reports their expected 401 responses as console errors.
    if (entry.type === 'console.error'
      && /^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/.test(entry.message)) return false;
    // The tracking page's optional MapLibre layer can report a tile/render
    // diagnostic while payment and order state remain fully available.
    if (entry.type === 'console.error' && /^\[TrackingRouteMap\] MapLibre error/.test(entry.message)) return false;
    if (entry.type === 'http401'
      && entry.host === apiHostname
      && expectedAnonymousProbePaths.has(entry.pathname)) return false;
    return true;
  });
  expect(unexpected, `Unexpected browser diagnostics:\n${JSON.stringify(unexpected, null, 2)}`).toEqual([]);
};

const runCardScenario = async ({ page, testInfo, scenario }) => {
  const card = cardScenarios[scenario];
  test.setTimeout(180_000);

  const diagnostics = [];
  const backendCardDataRequests = [];
  let paymentSessionId = null;
  let providerAuthorizationHost = null;
  let providerAuthorizationUsed = false;
  let finalizedSession = null;

  // Register runtime and network diagnostics before the first navigation.
  page.on('pageerror', (error) => diagnostics.push({ type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push({ type: 'console.error', message: message.text() });
  });
  page.on('requestfailed', (request) => {
    diagnostics.push({
      type: 'requestfailed',
      method: request.method(),
      host: new URL(request.url()).hostname,
      pathname: new URL(request.url()).pathname,
      errorText: request.failure()?.errorText || 'unknown'
    });
  });
  page.on('response', (response) => {
    if (response.status() === 401) {
      const url = new URL(response.url());
      diagnostics.push({ type: 'http401', host: url.hostname, pathname: url.pathname });
    }
    if (response.status() >= 500) {
      const url = new URL(response.url());
      diagnostics.push({
        type: 'http5xx',
        status: response.status(),
        host: url.hostname,
        pathname: url.pathname
      });
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1') || request.method() !== 'POST') return;
    const body = request.postData() || '';
    if (/card_number|exp_month|exp_year|cvc/i.test(body)) {
      backendCardDataRequests.push({ method: request.method(), host: url.hostname, pathname: url.pathname });
    }
  });

  try {
    await page.goto(
      `${storefrontURL.replace(/\/$/, '')}/login?return_to=${encodeURIComponent(getStorePath())}`,
      { waitUntil: 'domcontentloaded' }
    );
    await assertHealthyPage(page, 'initial login page');
    await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible();
    await page.locator('#dgfyLoginEmail').fill(testEmail);
    await page.locator('#dgfyLoginPassword').fill(testPassword);
    const loginResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/dgfy/auth/login'
    );
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status(), `DGFY login failed: ${JSON.stringify(await readJson(loginResponse))}`).toBe(200);
    await assertHealthyPage(page, 'after login');

    await page.goto(`${storefrontURL.replace(/\/$/, '')}${getStorePath()}`, { waitUntil: 'domcontentloaded' });
    await assertHealthyPage(page, 'storefront catalog');
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
    expect(addedItem).toBe(true);

    await page.locator('button[style*="position: fixed"]').last().click();
    await page.getByRole('button', { name: 'Order & Purchase', exact: true }).click();
    await expect(page.getByText('Step 1: Customer Details', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
    await expect(page.getByText('Step 2: Fulfillment', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
    await expect(page.getByText('Step 3: Review & Payment', { exact: true })).toBeVisible();
    await assertHealthyPage(page, 'review and payment page');

    await page.locator('button[aria-haspopup="listbox"]').last().click();
    await page.getByRole('listbox').getByRole('button', { name: /^Card(?: \(|$)/i }).click();
    const createSessionResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/store/checkout/payment-sessions'
        && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Pay with Card', exact: true }).click();

    const createSessionResponse = await createSessionResponsePromise;
    const createSessionBody = await readJson(createSessionResponse);
    expect(createSessionResponse.status(), JSON.stringify(summarizeSession(createSessionBody))).toBe(201);
    const createdSession = createSessionBody?.data?.payment_session || createSessionBody?.payment_session || null;
    paymentSessionId = createdSession?.payment_session_id || null;
    expect(paymentSessionId).toMatch(/^CPS-[A-Z0-9]{10}$/);
    expect(createdSession).toEqual(expect.objectContaining({
      payment_method: 'card',
      payment_flow: 'direct_card',
      checkout_url: null,
      status: 'awaiting_payment'
    }));
    expect(createdSession?.provider_payment_intent_id).toBeTruthy();
    expect(createdSession?.paymongo_client_key).toBeTruthy();
    expect(createdSession?.paymongo_public_key).toBeTruthy();
    expect(createdSession?.paymongo_return_url).toBeTruthy();
    await assertHealthyPage(page, 'direct card form');

    await page.getByRole('textbox', { name: 'Cardholder name' }).fill('Test Customer');
    await page.getByRole('textbox', { name: 'Card number' }).fill(card.cardNumber);
    await page.getByRole('textbox', { name: 'Expiry (MM/YY)' }).fill(directCardExpiry);
    await page.getByLabel('CVC').fill(directCardCvc);

    const paymentMethodResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).hostname === 'api.paymongo.com'
        && new URL(response.url()).pathname === '/v1/payment_methods'
        && response.request().method() === 'POST',
      { timeout: 60_000 }
    );
    const attachResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).hostname === 'api.paymongo.com'
        && new URL(response.url()).pathname.includes('/v1/payment_intents/')
        && new URL(response.url()).pathname.endsWith('/attach')
        && response.request().method() === 'POST',
      { timeout: 60_000 }
    );
    await page.getByRole('button', { name: 'Continue securely with card', exact: true }).click();

    const paymentMethodResponse = await paymentMethodResponsePromise;
    expect(paymentMethodResponse.status()).toBe(200);
    const attachResponse = await attachResponsePromise;
    expect(attachResponse.status()).toBe(200);
    await assertHealthyPage(page, 'after card authorization request');
    expect(backendCardDataRequests).toEqual([]);

    if (card.expects3ds) {
      const providerButton = page.getByRole('button', { name: 'Authorize Test Payment', exact: true });
      await expect(providerButton).toBeVisible({ timeout: 30_000 });
      providerAuthorizationUsed = true;
      providerAuthorizationHost = new URL(page.url()).hostname;
      expect(providerAuthorizationHost).not.toBe('checkout.paymongo.com');
      await assertHealthyPage(page, 'card 3-D Secure test page');
      await providerButton.click();
      await expect.poll(() => new URL(page.url()).hostname, { timeout: 30_000 }).toBe(storefrontHostname);
      await assertHealthyPage(page, 'after 3-D Secure return');
    } else {
      expect(new URL(page.url()).origin).toBe(storefrontOrigin);
      expect(page.url()).not.toContain('checkout.paymongo.com');
      await expect(page.getByText('Card submitted securely. Waiting for PayMongo confirmation.', { exact: true })).toBeVisible();
    }

    finalizedSession = await waitForFinalizedPaymentSession({ page, paymentSessionId });
    expect(finalizedSession.status).toBe('finalized');
    expect(finalizedSession.pos_transaction_id).toBeTruthy();
    expect(finalizedSession.tracking_pin).toMatch(/^SK-[A-Z0-9]{6}$/);

    await expect.poll(() => {
      const url = new URL(page.url());
      return url.pathname.includes('/track') ? 'track' : url.pathname;
    }, { timeout: 30_000 }).toBe('track');
    const trackingUrl = new URL(page.url());
    const trackingPin = decodeURIComponent(
      trackingUrl.searchParams.get('pin')
        || trackingUrl.pathname.split('/').filter(Boolean).pop()
        || ''
    );
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
      payment_type: 'card',
      payment_status: 'paid',
      payment_provider: 'paymongo',
      payment_session_reference: paymentSessionId,
      order_source: 'online_store'
    }));
    expect(trackedOrder.pos_transaction_id).toBe(finalizedSession.pos_transaction_id);
    expect(trackedOrder.tracking_pin).toBe(finalizedSession.tracking_pin);

    console.log(`[sandbox-evidence] ${JSON.stringify({
      payment_type: 'card',
      scenario,
      payment_session_id: paymentSessionId,
      provider_authorization_used: providerAuthorizationUsed,
      provider_authorization_host: providerAuthorizationHost,
      webhook_result: 'finalized',
      pos_transaction_id_present: Boolean(finalizedSession.pos_transaction_id),
      tracking_pin: finalizedSession.tracking_pin,
      card_data_sent_to_dgfy_backend: false
    })}`);
  } finally {
    await testInfo.attach(`direct-card-${scenario}-sandbox-evidence.json`, {
      body: JSON.stringify({
        payment_type: 'card',
        scenario,
        payment_session_id: paymentSessionId,
        session_created: paymentSessionId ? '[present]' : null,
        provider_authorization_used: providerAuthorizationUsed,
        provider_authorization_host: providerAuthorizationHost,
        finalized_status: finalizedSession?.status || null,
        pos_transaction_id_present: Boolean(finalizedSession?.pos_transaction_id),
        tracking_pin_present: Boolean(finalizedSession?.tracking_pin),
        card_data_sent_to_dgfy_backend: backendCardDataRequests.length > 0,
        backend_card_data_request_count: backendCardDataRequests.length,
        diagnostics
      }, null, 2),
      contentType: 'application/json'
    });
    assertNoUnexpectedDiagnostics(diagnostics);
  }
};

test.describe('PayMongo direct card sandbox authorization', () => {
  test('completes the successful direct card sandbox path', async ({ page }, testInfo) => {
    test.skip(!paymentFlowEnabled, 'Set E2E_DIRECT_CARD_FLOW_ENABLED=true to run the state-changing sandbox flow.');
    test.skip(!['', 'success'].includes(configuredScenario), 'Set E2E_DIRECT_CARD_SCENARIO=success to run this scenario.');
    test.skip(!storeSlug, 'E2E_STORE_SLUG is required.');
    test.skip(!testEmail || !testPassword, 'E2E test credentials are required.');
    test.skip(!cardScenarios.success.cardNumber || !directCardExpiry || !directCardCvc,
      'E2E direct-card sandbox values must come from ignored local environment variables.');
    await runCardScenario({ page, testInfo, scenario: 'success' });
  });

  test('completes the direct card 3-D Secure sandbox path', async ({ page }, testInfo) => {
    test.skip(!paymentFlowEnabled, 'Set E2E_DIRECT_CARD_FLOW_ENABLED=true to run the state-changing sandbox flow.');
    test.skip(!['', '3ds'].includes(configuredScenario), 'Set E2E_DIRECT_CARD_SCENARIO=3ds to run this scenario.');
    test.skip(!storeSlug, 'E2E_STORE_SLUG is required.');
    test.skip(!testEmail || !testPassword, 'E2E test credentials are required.');
    test.skip(!cardScenarios['3ds'].cardNumber || !directCardExpiry || !directCardCvc,
      'E2E direct-card sandbox values must come from ignored local environment variables.');
    await runCardScenario({ page, testInfo, scenario: '3ds' });
  });
});
