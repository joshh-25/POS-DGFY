import { expect, test } from '@playwright/test';

const storefrontURL = String(
  process.env.E2E_CONTRACT_BASE_URL || process.env.STOREFRONT_URL || 'http://127.0.0.1:5175'
).replace(/\/$/, '');

const modes = [
  { label: 'Retail', slug: 'qa-downpayment-retail', workflowMode: 'retail', paymentMode: 'downpayment_required' },
  { label: 'Simple', slug: 'qa-downpayment-simple', workflowMode: 'msme', paymentMode: 'downpayment_required' },
  { label: 'F&B', slug: 'qa-downpayment-fnb', workflowMode: 'fnb', paymentMode: 'downpayment_required' },
  { label: 'Customer choice', slug: 'qa-downpayment-choice', workflowMode: 'retail', paymentMode: 'customer_choice' },
  { label: 'Full payment', slug: 'qa-downpayment-full', workflowMode: 'retail', paymentMode: 'full_payment' },
];

const viewports = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile', width: 390, height: 844 },
];

const json = (data) => ({ success: true, data });

async function installCheckoutStorefront(page, mode) {
  const origin = new URL(storefrontURL).origin;
  const quoteBodies = [];
  const paymentSessionBodies = [];
  const checkoutBodies = [];
  const unmockedApiRequests = [];
  const diagnostics = [];

  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
  });

  await page.route((url) => url.origin === origin && url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = request.url();
    unmockedApiRequests.push(`${request.method()} ${url}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: `unmocked route: ${url}` }),
    });
  });

  const profile = {
    tenant_id: '11111111-1111-4111-8111-111111111111',
    tenant_name: `#2644 ${mode.label} Test Store`,
    slug: mode.slug,
    workflow_mode: mode.workflowMode,
    storefront_open: true,
    guest_checkout_enabled: true,
    store_has_no_location: true,
    map_publication_disabled: true,
    active_location_snapshot: [],
    access_capabilities: { catalog: true, cart: true, quote: true, checkout: true, payment: true },
    payment_capabilities: {
      qrph: { enabled: true, environment: 'test' },
      gcash: { enabled: true, environment: 'test' },
      maya: { enabled: true, environment: 'test' },
      card: { enabled: true, environment: 'test' },
      cash: { enabled: true },
    },
    inventory_display_mode: 'availability',
  };
  const item = {
    item_id: 501,
    name: `${mode.label} checkout item`,
    description: 'Deterministic issue #2644 checkout fixture.',
    category: 'product',
    folder_name: 'Checkout',
    default_sale_price: 100,
    current_stock: 10,
    available: true,
    inventory_display: { label: 'Available', available: true },
    fnb_modifier_groups: [],
  };
  const paymentCapabilities = profile.payment_capabilities;

  await page.route('**/api/v1/storefront/discovery**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json(profile)),
  }));
  await page.route('**/api/v1/auth/csrf-token', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json({ csrf_token: 'qa-2644-csrf-token' })),
  }));
  await page.route('**/api/v1/storefront/reverse-geocode**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json({ precision: 'coordinate_only', address_line: '' })),
  }));
  await page.route('**/api/v1/store/domain-context', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'No custom domain context.' }),
  }));
  await page.route('**/api/v1/store/locations**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json({ locations: [], store_has_no_location: true })),
  }));
  await page.route('**/api/v1/store/catalog**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json({
      items: [item],
      workflow_mode: mode.workflowMode,
      capabilities: { menuModifiers: true },
      access_policy: {
        customer_access_mode: 'transaction',
        effective_customer_access_mode: 'transaction',
        max_customer_access_mode: 'transaction',
        guest_checkout_enabled: true,
        access_capabilities: { catalog: true, cart: true, quote: true, checkout: true, payment: true },
        inventory_display_mode: 'availability',
      },
        payment_mode: mode.paymentMode,
      payment_capabilities: paymentCapabilities,
    })),
  }));
  await page.route('**/api/v1/store/items/501/reviews**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json({ reviews: [], summary: { score: 0, total_count: 0 } })),
  }));
  await page.route('**/api/v1/dgfy/customer/reviews/public**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json({ reviews: [], summary: { score: 0, total_count: 0 } })),
  }));
  await page.route('**/api/v1/dgfy/auth/me', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Not signed in.' }),
  }));
  await page.route('**/api/v1/store/checkout/guest-otp/request', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ delivery_status: 'sent' }),
  }));
  await page.route('**/api/v1/store/checkout/guest-otp/verify', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ guest_checkout_proof: 'qa-2644-guest-proof' }),
  }));
  await page.route('**/api/v1/store/cart/quote', async (route) => {
    const body = route.request().postDataJSON();
    quoteBodies.push(body);
    const resolvedPaymentMode = mode.paymentMode === 'customer_choice'
      ? (body.payment_election === 'downpayment' ? 'downpayment_required' : 'full_payment')
      : mode.paymentMode;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(json({
        subtotal_amount: 100,
        total_amount: 100,
        delivery_fee: 0,
        customer_processing_fee_amount: 0,
        payment_mode: resolvedPaymentMode,
        downpayment_amount: 1,
        balance_due_amount: 99,
        downpayment_refundable: true,
      })),
    });
  });
  await page.route('**/api/v1/store/checkout/payment-sessions', async (route) => {
    const body = route.request().postDataJSON();
    paymentSessionBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(json({
        payment_session: {
          payment_session_id: 'qa-2644-payment-session',
          status: 'awaiting_payment',
          payment_type: body.payment_type,
          capture_kind: 'downpayment',
          total_amount: 1,
          order_total_amount: 100,
          downpayment_amount: 1,
          balance_due_amount: 99,
          downpayment_refundable: true,
        },
      })),
    });
  });
  await page.route('**/api/v1/store/checkout', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    checkoutBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(json({
        tracking_pin: 'QA2644',
        order: {
          order_id: 'qa-2644-cash-order',
          status: 'placed',
          payment_type: 'cash',
          total_amount: 100,
        },
      })),
    });
  });
  await page.route('**/api/v1/store/track/QA2644', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(json({
      tracking_pin: 'QA2644',
      status: 'placed',
      order_method: 'pickup',
      order: { status: 'placed', total_amount: 100, payment_type: 'cash' },
    })),
  }));
  await page.route('**/api/v1/store/checkout/payment-sessions/qa-2644-payment-session', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(json({
        payment_session: {
          payment_session_id: 'qa-2644-payment-session',
          status: 'awaiting_payment',
          payment_method: 'gcash',
          payment_type: 'gcash',
          capture_kind: 'downpayment',
          total_amount: 1,
          order_total_amount: 100,
          downpayment_amount: 1,
          balance_due_amount: 99,
          downpayment_refundable: true,
        },
      })),
    });
  });

  return { checkoutBodies, diagnostics, paymentSessionBodies, quoteBodies, unmockedApiRequests };
}

async function openCheckout(page, slug) {
  await page.goto(`${storefrontURL}/store/${slug}`, { waitUntil: 'domcontentloaded' });
  const acceptAnalytics = page.getByRole('button', { name: 'Accept', exact: true });
  if (await acceptAnalytics.count() && await acceptAnalytics.first().isVisible().catch(() => false)) {
    await acceptAnalytics.first().click();
  }
  const firstCard = page.locator('#storefront-catalog-section article').first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  const detailTrigger = firstCard.locator('[data-product-detail-trigger="true"]');
  if (await detailTrigger.count()) {
    await detailTrigger.first().click();
  } else {
    // Image-less deterministic fixtures keep the same details click target on their first media
    // wrapper; click it directly instead of requiring a network-backed image asset.
    await firstCard.locator('div').first().click();
  }
  await expect(page).toHaveURL(/(?:\?|&)item=[^&]+/);
  await page.getByRole('button', { name: /Buy Now/ }).click();
  await expect(page).toHaveURL(/\/order(?:\?|$)/);

  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await page.locator('input[placeholder="Enter your full name"]').fill('QA Shopper');
  await page.locator('input[placeholder="+63 912 345 6789"]').fill('+639171234567');
  await page.locator('input[placeholder="Enter your email"]').fill('qa-shopper@example.com');
  await page.getByRole('button', { name: 'Send Code and Apply Details' }).click();
  await page.locator('input[placeholder="6-digit code"]').fill('123456');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText('Email verified', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
  await expect(page.getByText('Step 2: Fulfillment', { exact: true })).toBeVisible();

  const pickup = page.getByRole('button', { name: 'Pickup', exact: true });
  if (await pickup.count()) await pickup.first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
  await expect(page.getByText('Step 3: Review & Payment', { exact: true })).toBeVisible();
}

for (const mode of modes) {
  for (const viewport of viewports) {
    test(`${mode.label} checkout remains submit-ready across payment rail changes (${viewport.label}) @checkout @downpayment`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const runtime = await installCheckoutStorefront(page, mode);

      await openCheckout(page, mode.slug);
      if (mode.paymentMode === 'customer_choice') {
        await page.locator('input[name="storefront-payment-election"]').nth(1).check();
      }
      if (mode.paymentMode === 'full_payment') {
        await expect.poll(() => runtime.quoteBodies.length, { timeout: 1_000 }).toBe(0);
        await expect(page.getByText(/Downpayment due now:/)).toHaveCount(0);
      } else {
        await expect.poll(() => runtime.quoteBodies.length, { timeout: 10_000 }).toBeGreaterThan(0);
        await expect(page.getByText(/Downpayment due now:\s*(?:₱|PHP)\s?1\.00/).first()).toBeVisible();
        await expect(page.getByText(/Pay the remaining\s*(?:₱|PHP)\s?99\.00 in cash/).first()).toBeVisible();
      }
      // Let the fulfillment or election change that caused the current quote finish before
      // measuring whether subsequent rail changes trigger unnecessary quote requests.
      await page.waitForTimeout(450);

      const quoteCount = runtime.quoteBodies.length;
      const paymentMethod = page.getByRole('combobox', {
        name: mode.paymentMode === 'downpayment_required' || mode.paymentMode === 'customer_choice'
          ? 'Pay downpayment with'
          : 'Payment Type',
      });
      await expect(paymentMethod).toBeVisible();
      await paymentMethod.click();
      await page.getByRole('option', { name: /Pay via QR Ph/ }).click();
      await paymentMethod.click();
      await page.getByRole('option', { name: /GCash/ }).click();
      await paymentMethod.click();
      await page.getByRole('option', { name: /Pay via QR Ph/ }).click();
      await paymentMethod.click();
      await page.getByRole('option', { name: /GCash/ }).click();
      if (mode.paymentMode === 'full_payment') {
        await paymentMethod.click();
        await page.getByRole('option', { name: 'Cash on delivery/pickup' }).click();
      }
      await page.waitForTimeout(450);
      expect(runtime.quoteBodies).toHaveLength(quoteCount);

      const paymentButton = page.getByRole('button', { name: /Pay downpayment|Place Order|Checkout/ }).last();
      await expect(paymentButton).toBeEnabled();
      await paymentButton.click();
      if (mode.paymentMode === 'full_payment') {
        await expect.poll(() => runtime.checkoutBodies.length, { timeout: 10_000 }).toBe(1);
        expect(runtime.checkoutBodies[0].payment_type).toBe('cash');
        expect(runtime.checkoutBodies[0].lines).toEqual([{ item_id: 501, quantity: 1 }]);
      } else {
        await expect.poll(() => runtime.paymentSessionBodies.length, { timeout: 10_000 }).toBe(1);
        expect(runtime.paymentSessionBodies[0].payment_type).toBe('gcash');
        expect(runtime.paymentSessionBodies[0].lines).toEqual([{ item_id: 501, quantity: 1 }]);
      }
      await expect(page.getByText(/Updating your order total -- please wait/)).toHaveCount(0);
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(runtime.unmockedApiRequests).toEqual([]);
      expect(runtime.diagnostics).toEqual([]);
      await testInfo.attach(`issue-2644-${mode.label.toLowerCase()}-${viewport.label}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  }
}
