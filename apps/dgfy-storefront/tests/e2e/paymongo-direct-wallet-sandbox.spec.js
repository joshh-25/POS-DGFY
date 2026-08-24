import { test, expect } from '@playwright/test';

const paymentFlowEnabled = process.env.E2E_DIRECT_PAYMENT_FLOW_ENABLED === 'true';
const paymentType = String(process.env.E2E_DIRECT_PAYMENT_TYPE || 'gcash').trim().toLowerCase();
const storefrontURL = process.env.STOREFRONT_URL || 'http://localhost:5175';
const apiURL = process.env.E2E_API_URL || 'http://localhost:5000';
const storeSlug = String(process.env.E2E_STORE_SLUG || '').trim().toLowerCase();
const testEmail = String(process.env.E2E_TEST_USER_EMAIL || '').trim();
const testPassword = String(process.env.E2E_TEST_USER_PASSWORD || '');
const paymentLabels = { gcash: 'GCash', maya: 'Maya' };

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
    paymongo_return_url: session.paymongo_return_url ? '[present]' : null
  };
};

const getStorePath = () => `/tenant-store/${encodeURIComponent(storeSlug)}`;

test.describe('PayMongo direct wallet sandbox authorization', () => {
  test(`creates and attaches a direct ${paymentLabels[paymentType] || paymentType} sandbox payment`, async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!paymentFlowEnabled, 'Set E2E_DIRECT_PAYMENT_FLOW_ENABLED=true to run the state-changing sandbox flow.');
    test.skip(!['gcash', 'maya'].includes(paymentType), 'E2E_DIRECT_PAYMENT_TYPE must be gcash or maya.');
    test.skip(!storeSlug, 'E2E_STORE_SLUG is required.');
    test.skip(!testEmail || !testPassword, 'E2E test credentials are required.');

    const label = paymentLabels[paymentType];
    const diagnostics = [];
    let paymentSessionId = null;

    page.on('pageerror', (error) => diagnostics.push({ type: 'pageerror', message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push({ type: 'console.error', message: message.text() });
    });

    await page.goto(`${storefrontURL.replace(/\/$/, '')}/login?return_to=${encodeURIComponent(getStorePath())}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible();
    await page.locator('#dgfyLoginEmail').fill(testEmail);
    await page.locator('#dgfyLoginPassword').fill(testPassword);
    const loginResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/dgfy/auth/login');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status(), `DGFY login failed: ${JSON.stringify(await readJson(loginResponse))}`).toBe(200);

    await page.goto(`${storefrontURL.replace(/\/$/, '')}${getStorePath()}`, { waitUntil: 'domcontentloaded' });
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

    await page.locator('button[aria-haspopup="listbox"]').last().click();
    await page.getByRole('listbox').getByRole('button', { name: new RegExp(`^${label}(?: \\(|$)`, 'i') }).click();
    const createSessionResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/store/checkout/payment-sessions'
        && response.request().method() === 'POST'
    );
    const attachResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/v1/payment_intents/') && response.url().endsWith('/attach')
    );
    await page.getByRole('button', { name: `Pay with ${label}`, exact: true }).click();

    const createSessionResponse = await createSessionResponsePromise;
    const createSessionBody = await readJson(createSessionResponse);
    expect(createSessionResponse.status(), JSON.stringify(summarizeSession(createSessionBody))).toBe(201);
    const createdSession = createSessionBody?.data?.payment_session || createSessionBody?.payment_session || null;
    paymentSessionId = createdSession?.payment_session_id || null;
    expect(paymentSessionId).toMatch(/^CPS-[A-Z0-9]{10}$/);
    expect(createdSession).toEqual(expect.objectContaining({
      payment_method: paymentType,
      payment_flow: `direct_${paymentType}`,
      checkout_url: null,
      status: 'awaiting_payment'
    }));

    const attachResponse = await attachResponsePromise;
    const attachStatus = attachResponse.status();
    expect(attachStatus).toBe(200);
    const providerUrl = new URL(page.url());
    expect(providerUrl.hostname).not.toBe('checkout.paymongo.com');
    await expect(page.getByRole('heading', { name: `${label} Test Payment Page` })).toBeVisible();
    const providerText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500);
    await page.getByRole('button', { name: 'Authorize Test Payment', exact: true }).click();
    await expect.poll(() => new URL(page.url()).hostname, { timeout: 30_000 }).toBe(new URL(storefrontURL).hostname);

    let lastSessionBody = null;
    await expect.poll(async () => {
      const response = await page.request.get(
        `${apiURL}/api/v1/store/checkout/payment-sessions/${encodeURIComponent(paymentSessionId)}`,
        { headers: { 'x-store-slug': storeSlug }, failOnStatusCode: false }
      );
      lastSessionBody = await readJson(response);
      return lastSessionBody?.data?.payment_session?.status || lastSessionBody?.payment_session?.status || null;
    }, { timeout: 120_000, intervals: [2_000, 4_000, 6_000] }).toBe('finalized');
    const finalizedSession = lastSessionBody?.data?.payment_session || lastSessionBody?.payment_session || null;
    expect(finalizedSession?.pos_transaction_id).toBeTruthy();
    expect(finalizedSession?.tracking_pin).toMatch(/^SK-[A-Z0-9]{6}$/);
    console.log(`[sandbox-evidence] ${JSON.stringify({
      payment_type: paymentType,
      payment_session_id: paymentSessionId,
      provider_redirect_host: providerUrl.hostname,
      webhook_result: 'finalized',
      pos_transaction_id_present: Boolean(finalizedSession?.pos_transaction_id),
      tracking_pin: finalizedSession.tracking_pin
    })}`);

    await test.info().attach('direct-wallet-sandbox-evidence.json', {
      body: JSON.stringify({
        payment_type: paymentType,
        payment_session_id: paymentSessionId,
        session: summarizeSession(createSessionBody),
        attach_status: attachStatus,
        provider_redirect_host: providerUrl.hostname,
        provider_redirect_path_present: Boolean(providerUrl.pathname),
        provider_page_excerpt: providerText,
        finalized_status: finalizedSession?.status || null,
        pos_transaction_id_present: Boolean(finalizedSession?.pos_transaction_id),
        tracking_pin_present: Boolean(finalizedSession?.tracking_pin),
        diagnostics
      }, null, 2),
      contentType: 'application/json'
    });
  });
});
