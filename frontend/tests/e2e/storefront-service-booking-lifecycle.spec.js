import { expect, test } from '@playwright/test';

const storefrontURL = String(process.env.STOREFRONT_URL || 'http://localhost:5175').replace(/\/$/, '');
const posURL = String(process.env.E2E_BASE_URL || 'http://localhost:5174').replace(/\/$/, '');
const apiURL = String(process.env.E2E_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const testEmail = String(process.env.E2E_TEST_USER_EMAIL || '').trim();
const testPassword = String(process.env.E2E_TEST_USER_PASSWORD || '');
const configuredStoreSlug = String(process.env.E2E_SERVICE_STORE_SLUG || process.env.E2E_STORE_SLUG || '').trim().toLowerCase();
const configuredCompanyName = String(process.env.E2E_SERVICE_COMPANY_NAME || process.env.E2E_TEST_COMPANY_NAME || '').trim();
const configuredServiceName = String(process.env.E2E_SERVICE_NAME || '').trim();

const HANDOFF_SCENARIOS = [
  { key: 'delivery', label: 'Pick up and deliver' },
  { key: 'pickup', label: "Pick up and I'll collect" }
];

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

const isExpectedDiagnostic = (entry, allDiagnostics = []) => {
  const path = getPath(entry.url);
  if (entry.type === 'http' && entry.status === 401 && [
    '/api/v1/dgfy/auth/me',
    '/api/v1/dgfy/account/companies',
    '/api/v1/pos/device/status',
    '/api/v1/store/auth/me'
  ].includes(path)) return true;
  if (entry.type === 'http' && entry.status === 404 && (
    path === '/api/v1/store/domain-context' || /^\/api\/v1\/store\/track\/[^/]+$/.test(path)
  )) return true;
  if (entry.type === 'requestfailed' && entry.error === 'net::ERR_ABORTED') {
    return path === '/api/v1/dgfy/auth/me'
      || path === '/api/v1/pos/catalog/events'
      || path === '/api/v1/dgfy/customer/events'
      || path === '/api/v1/storefront/discovery'
      || path === '/api/v1/storefront/discovery/index'
      || path === '/api/v1/storefront/discovery/search'
      || /^\/openfreemap\//.test(path);
  }
  if (entry.type === 'console.error' && /^Failed to load resource: the server responded with a status of (401|404) /.test(entry.message)) {
    return allDiagnostics.some((candidate) => candidate.type === 'http' && isExpectedDiagnostic(candidate, []));
  }
  return false;
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
  page.on('pageerror', (error) => diagnostics.push({
    type: 'pageerror', surface, message: error.message, stack: error.stack || null, url: page.url()
  }));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push({
      type: 'console.error', surface, message: message.text(), url: page.url()
    });
  });
  page.on('requestfailed', (request) => diagnostics.push({
    type: 'requestfailed', surface, method: request.method(), url: request.url(),
    error: request.failure()?.errorText || 'unknown request failure'
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) diagnostics.push({
      type: 'http', surface, status: response.status(), method: response.request().method(), url: response.url()
    });
  });

  const assertHealthy = async (checkpoint) => {
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByText(/Something went wrong|Unexpected error|Application error/i)).toHaveCount(0);
    const unexpected = diagnostics.filter((entry) => !isExpectedDiagnostic(entry, diagnostics));
    expect(unexpected, `${surface} diagnostics after ${checkpoint}: ${JSON.stringify(unexpected, null, 2)}`).toEqual([]);
    diagnostics.length = 0;
  };

  return { diagnostics, authHeaders, assertHealthy };
};

const attachScreenshot = async (testInfo, page, name) => {
  if (!page || page.isClosed()) return;
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
};

const toManilaDateTimeInput = (value) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
};

const manilaDateKey = (daysAhead) => {
  const target = new Date(Date.now() + (daysAhead * 24 * 60 * 60 * 1000));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(target);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const discoverServicesStore = async (page) => {
  const response = await page.request.get(`${apiURL}/api/v1/storefront/discovery`, {
    params: {
      limit: 100,
      result_mode: 'union',
      stock_filter: 'include_out_of_stock',
      pin_scope: 'tenant_primary',
      include_match_meta: 'true'
    },
    failOnStatusCode: false
  });
  const body = await readJson(response);
  expect(response.status(), `Services storefront discovery failed: ${JSON.stringify(responseSummary(response, body))}`).toBe(200);
  const stores = Array.isArray(body?.data?.stores) ? body.data.stores : [];
  const matching = stores.filter((store) => (
    store.workflow_mode === 'services'
    && store.storefront_open !== false
    && store.access_capabilities?.booking !== false
    && Number(store.catalog_count || 0) > 0
  ));
  const store = configuredStoreSlug
    ? matching.find((candidate) => String(candidate.slug || '').toLowerCase() === configuredStoreSlug)
    : matching.sort((left, right) => String(left.slug).localeCompare(String(right.slug)))[0];
  expect(store, configuredStoreSlug
    ? `Configured Services storefront ${configuredStoreSlug} is not discoverable or booking-ready.`
    : 'No open, transaction-capable Services storefront with catalog entries is discoverable.').toBeTruthy();
  return store;
};

const findBookableServiceAndSlot = async (page, store) => {
  const headers = { 'x-store-slug': store.slug };
  const catalogResponse = await page.request.get(`${apiURL}/api/v1/store/services/catalog`, {
    headers,
    params: { limit: 200 },
    failOnStatusCode: false
  });
  const catalogBody = await readJson(catalogResponse);
  expect(catalogResponse.status(), `Services catalog failed: ${JSON.stringify(responseSummary(catalogResponse, catalogBody))}`).toBe(200);
  const services = Array.isArray(catalogBody?.data?.services) ? catalogBody.data.services : [];
  const candidates = services.filter((service) => (
    service.service_detail?.bookable !== false
    && Number(service.default_sale_price || 0) > 0
  ));
  const service = configuredServiceName
    ? candidates.find((candidate) => candidate.name === configuredServiceName)
    : candidates[0];
  expect(service, configuredServiceName
    ? `Configured service ${configuredServiceName} is not publicly bookable.`
    : 'The Services storefront has no publicly bookable service with a positive sale price.').toBeTruthy();

  const locationId = Number(store.location_id || store.active_location_snapshot?.[0]?.location_id || 0) || null;
  for (let daysAhead = 1; daysAhead <= 21; daysAhead += 1) {
    const date = manilaDateKey(daysAhead);
    const availabilityResponse = await page.request.get(`${apiURL}/api/v1/store/services/availability`, {
      headers,
      params: {
        service_item_id: service.item_id,
        date,
        quantity: 1,
        ...(locationId ? { location_id: locationId } : {})
      },
      failOnStatusCode: false
    });
    const availabilityBody = await readJson(availabilityResponse);
    if (availabilityResponse.status() !== 200) continue;
    const slots = Array.isArray(availabilityBody?.data?.slots) ? availabilityBody.data.slots : [];
    if (slots[0]?.start_at) return { service, slot: slots[0], locationId };
  }
  throw new Error(`No available slot was found for ${service.name} in the next 21 days.`);
};

const authenticatePosAndPrepareShift = async ({ page, store, diagnostics, runId }) => {
  await page.goto(`${posURL}/login`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Terminal Login Required' })).toBeVisible();
  await page.getByLabel('DGFY or Cashier Email').fill(testEmail);
  await page.getByRole('textbox', { name: 'Password' }).fill(testPassword);
  const loginResponsePromise = page.waitForResponse((response) => (
    getPath(response.url()) === '/api/v1/dgfy/auth/login' && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /^sign in$/i }).click();
  const loginResponse = await loginResponsePromise;
  const loginBody = await readJson(loginResponse);
  expect(loginResponse.status(), `POS login failed: ${JSON.stringify(responseSummary(loginResponse, loginBody))}`).toBe(200);

  const companySelect = page.getByLabel('Company');
  await expect(companySelect).toBeVisible();
  await expect(companySelect).not.toContainText('Loading companies', { timeout: 20_000 });
  const companyName = configuredCompanyName || store.tenant_name;
  const matchingOption = companySelect.locator('option', { hasText: companyName });
  const availableCompanies = (await companySelect.locator('option').allTextContents())
    .map((label) => label.trim())
    .filter((label) => label && !/^select accessible company$/i.test(label));
  expect(
    await matchingOption.count(),
    `POS account cannot access the Services company "${companyName}". Available companies: ${availableCompanies.join(', ') || 'none'}.`
  ).toBeGreaterThan(0);
  await companySelect.selectOption({ label: companyName });
  const tenantSessionPromise = page.waitForResponse((response) => (
    getPath(response.url()) === '/api/v1/dgfy/auth/tenant-session' && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /^continue to pos$/i }).click();
  const tenantSessionResponse = await tenantSessionPromise;
  const tenantSessionBody = await readJson(tenantSessionResponse);
  expect(tenantSessionResponse.status(), `Tenant session failed: ${JSON.stringify(responseSummary(tenantSessionResponse, tenantSessionBody))}`).toBe(200);
  await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => Boolean(diagnostics.authHeaders.authorization), { timeout: 15_000 }).toBe(true);
  await diagnostics.assertHealthy('POS authentication');

  const terminalText = page.getByText(/^Terminal:\s+\S+$/).last();
  await expect(terminalText).toBeVisible();
  let terminalId = (await terminalText.innerText()).replace(/^Terminal:\s*/i, '').trim().toUpperCase();
  const currentShiftResponse = await page.request.get(`${apiURL}/api/v1/pos/terminal/shifts/current`, {
    headers: diagnostics.authHeaders,
    failOnStatusCode: false
  });
  const currentShiftBody = await readJson(currentShiftResponse);
  expect(currentShiftResponse.status(), `Current shift lookup failed: ${JSON.stringify(responseSummary(currentShiftResponse, currentShiftBody))}`).toBe(200);
  let shift = currentShiftBody?.data?.shift || currentShiftBody?.data?.current_shift || null;
  let createdShiftId = null;
  const openingCashAmount = 1000.01;

  if (!shift) {
    await expect(page.getByText(/No open shift is active\./).last()).toBeVisible();
    await page.locator('#shift-opening-cash-amount').last().fill(String(openingCashAmount));
    await page.locator('#shift-opening-note').last().fill(runId);
    const openResponsePromise = page.waitForResponse((response) => (
      getPath(response.url()) === '/api/v1/pos/terminal/shifts/open' && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Open Shift', exact: true }).last().click();
    const openResponse = await openResponsePromise;
    const openBody = await readJson(openResponse);
    expect(openResponse.status(), `Open shift failed: ${JSON.stringify(responseSummary(openResponse, openBody))}`).toBe(200);
    shift = openBody?.data?.shift || openBody?.data?.current_shift || null;
    createdShiftId = Number(shift?.pos_terminal_shift_id || 0) || null;
  }

  const shiftId = Number(shift?.pos_terminal_shift_id || 0);
  terminalId = String(shift?.terminal_id || terminalId).trim().toUpperCase();
  const locationId = Number(shift?.location_id || 0);
  expect(shiftId).toBeGreaterThan(0);
  expect(locationId).toBeGreaterThan(0);
  expect(terminalId).toMatch(/^[A-Z0-9._-]{2,100}$/);
  return { shiftId, terminalId, locationId, createdShiftId, openingCashAmount };
};

const authenticateStorefront = async (page, store) => {
  const storePath = `/tenant-store/${encodeURIComponent(store.slug)}`;
  await page.goto(`${storefrontURL}/login?return_to=${encodeURIComponent(storePath)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible();
  await page.locator('#dgfyLoginEmail').fill(testEmail);
  await page.locator('#dgfyLoginPassword').fill(testPassword);
  const loginResponsePromise = page.waitForResponse((response) => (
    getPath(response.url()) === '/api/v1/dgfy/auth/login' && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  const loginBody = await readJson(loginResponse);
  expect(loginResponse.status(), `Storefront login failed: ${JSON.stringify(responseSummary(loginResponse, loginBody))}`).toBe(200);
  const reachedTenantRoute = await page.waitForURL((url) => url.pathname === storePath, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!reachedTenantRoute) await page.goto(`${storefrontURL}${storePath}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty();
  const tenantMarker = page.getByText(`Tenant page: ${store.slug}`, { exact: true });
  if (!await tenantMarker.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect(tenantMarker, `Storefront failed to hydrate tenant ${store.slug}; current URL: ${page.url()}`).toBeVisible({ timeout: 30_000 });
};

const getBookingFromResponse = (body) => body?.data?.booking || body?.booking || null;

test.describe('Storefront Services booking lifecycle @services @critical', () => {
  test.skip(!testEmail || !testPassword, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');

  for (const scenario of HANDOFF_SCENARIOS) {
    test(`${scenario.label}: booking through completion, settlement, and receipt`, async ({ page, browser }, testInfo) => {
      test.setTimeout(240_000);
      const runId = `PW-SVC-${scenario.key}-${Date.now()}`;
      const detailInstruction = `${runId} detail instruction`;
      const checkoutInstruction = `${runId} checkout instruction`;
      const selectedAddOn = 'Additional detergent';
      const storefrontDiagnostics = registerDiagnostics(page, 'storefront');
      const posContext = await browser.newContext();
      const posPage = await posContext.newPage();
      const posDiagnostics = registerDiagnostics(posPage, 'pos');
      let booking = null;
      let settlement = null;
      let shift = null;

      try {
        const store = await test.step('discover a booking-ready Services storefront', async () => discoverServicesStore(page));
        const bookingFixture = await test.step('find a bookable service and authoritative available slot', async () => (
          findBookableServiceAndSlot(page, store)
        ));

        shift = await test.step('authenticate staff and prepare the POS shift', async () => {
          const prepared = await authenticatePosAndPrepareShift({ page: posPage, store, diagnostics: posDiagnostics, runId });
          await attachScreenshot(testInfo, posPage, `${scenario.key}-pos-shift-ready.png`);
          return prepared;
        });

        await test.step('browse and select the service', async () => {
          await authenticateStorefront(page, store);
          const serviceHeading = page.getByRole('heading', { name: bookingFixture.service.name, exact: true });
          if (!await serviceHeading.isVisible({ timeout: 10_000 }).catch(() => false)) {
            await page.goto(`${storefrontURL}/tenant-store/${encodeURIComponent(store.slug)}`, { waitUntil: 'domcontentloaded' });
          }
          await expect(serviceHeading).toBeVisible({ timeout: 30_000 });
          await serviceHeading.click();
          await expect(page.getByText('Review the service before booking', { exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
          await page.getByRole('button', { name: 'Open service cart' }).click();
          const serviceCartDrawer = page.locator('aside').filter({ hasText: 'Added services' });
          await expect(serviceCartDrawer).toBeVisible();
          await expect(serviceCartDrawer).toContainText(bookingFixture.service.name);
          await page.getByRole('button', { name: 'Continue to Booking', exact: true }).click();
          await expect(page.getByText('Step 1: Customer Details', { exact: true })).toBeVisible();
          await storefrontDiagnostics.assertHealthy('service selection');
          await attachScreenshot(testInfo, page, `${scenario.key}-service-selected.png`);
        });

        await test.step('confirm customer details', async () => {
          await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
          await expect(page.getByText('Step 2: Add-ons', { exact: true })).toBeVisible();
          await storefrontDiagnostics.assertHealthy('customer details');
        });

        await test.step('select add-on and enter checkout instructions', async () => {
          await page.getByRole('button', { name: 'Expand add-ons' }).click();
          await page.getByRole('button', { name: new RegExp(`^${selectedAddOn}`) }).click();
          await expect(page.getByText('With Add-ons', { exact: true })).toBeVisible();
          await page.getByLabel('Special instructions (optional)').fill(`${detailInstruction}; ${checkoutInstruction}`);
          await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
          await expect(page.getByText('Step 3: Fulfillment', { exact: true })).toBeVisible();
          await storefrontDiagnostics.assertHealthy('add-ons');
          await attachScreenshot(testInfo, page, `${scenario.key}-addons-selected.png`);
        });

        await test.step(`choose ${scenario.label} and review schedule`, async () => {
          await page.getByRole('button', { name: scenario.label, exact: true }).click();
          await expect(page.getByRole('button', { name: scenario.label, exact: true })).toBeVisible();
          const [preferredDate, preferredTime] = toManilaDateTimeInput(bookingFixture.slot.start_at).split('T');
          const dateInput = page.locator('input[type="date"][aria-hidden="true"]');
          await expect(dateInput).toHaveCount(1);
          await dateInput.evaluate((element, value) => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(element, value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }, preferredDate);
          await expect(page.getByText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)).toBeVisible();
          const preferredTimeOption = page.getByRole('option', { name: new RegExp(preferredTime) });
          if (await preferredTimeOption.count()) await preferredTimeOption.click();
          await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
          await expect(page.getByText('Step 4: Review and Payment', { exact: true })).toBeVisible();
          await expect(page.getByText(scenario.label, { exact: true })).toBeVisible();
          await expect(page.locator('main')).toContainText(selectedAddOn);
          await expect(page.locator('main')).toContainText(checkoutInstruction);
          await expect(page.getByText('Pay later selected', { exact: true })).toBeVisible();
          await storefrontDiagnostics.assertHealthy('fulfillment and review');
          await attachScreenshot(testInfo, page, `${scenario.key}-review-payment.png`);
        });

        await test.step('confirm booking and inspect the submitted contract', async () => {
          const requestPromise = page.waitForRequest((request) => (
            /\/api\/v1\/store\/services\/bookings(?:\/batch)?$/.test(getPath(request.url()))
            && request.method() === 'POST'
          ));
          const responsePromise = page.waitForResponse((response) => (
            /\/api\/v1\/store\/services\/bookings(?:\/batch)?$/.test(getPath(response.url()))
            && response.request().method() === 'POST'
          ));
          await page.getByRole('button', { name: 'Confirm Booking', exact: true }).click();
          const bookingRequest = await requestPromise;
          const bookingPayload = bookingRequest.postDataJSON();
          const bookingResponse = await responsePromise;
          const bookingBody = await readJson(bookingResponse);
          await testInfo.attach(`${scenario.key}-booking-request.json`, {
            body: JSON.stringify(bookingPayload, null, 2), contentType: 'application/json'
          });
          await testInfo.attach(`${scenario.key}-booking-response.json`, {
            body: JSON.stringify(bookingBody, null, 2), contentType: 'application/json'
          });
          expect([200, 201], `Booking creation failed: ${JSON.stringify(responseSummary(bookingResponse, bookingBody))}`)
            .toContain(bookingResponse.status());
          booking = getBookingFromResponse(bookingBody);
          expect(booking).toEqual(expect.objectContaining({
            public_reference: expect.any(String),
            booking_id: expect.any(Number),
            status: 'requested'
          }));
          const serializedPayload = JSON.stringify(bookingPayload);
          expect.soft(serializedPayload, `Booking payload lost the selected handoff: ${scenario.label}`).toContain(scenario.label);
          expect.soft(serializedPayload, `Booking payload lost add-on: ${selectedAddOn}`).toContain(selectedAddOn);
          expect.soft(serializedPayload, 'Booking payload lost checkout-step special instructions.').toContain(checkoutInstruction);
          expect.soft(serializedPayload, 'Booking payload lost the service-detail instruction marker.').toContain(detailInstruction);
          if (scenario.key === 'delivery') {
            expect.soft(bookingPayload.location_id, 'Delivery booking was accepted without a delivery location.').not.toBeNull();
          }
          await expect(page.getByText(booking.public_reference, { exact: true })).toBeVisible();
          await storefrontDiagnostics.assertHealthy('booking confirmation');
          await attachScreenshot(testInfo, page, `${scenario.key}-booking-confirmed.png`);
        });

        await test.step('staff confirms, checks in, starts, and completes the service', async () => {
          const servicesNav = posPage.getByTestId('pos-nav-services');
          const servicesNavCount = await servicesNav.count();
          expect.soft(servicesNavCount, 'The signed-in staff user cannot reach Services operations from POS.').toBeGreaterThan(0);
          if (servicesNavCount > 0) {
            await servicesNav.click();
            await expect(posPage.getByTestId('pos-services-operations-workspace')).toBeVisible();
            await posPage.getByRole('tab', { name: 'Calendar' }).click();
            const search = posPage.getByRole('textbox', { name: 'Search calendar bookings' });
            await search.fill(booking.public_reference);
            const statusSelect = posPage.getByLabel(`Status for ${booking.public_reference}`);
            await expect(statusSelect).toHaveValue('requested', { timeout: 20_000 });

            for (const status of ['confirmed', 'checked_in', 'in_service', 'completed']) {
              const statusResponsePromise = posPage.waitForResponse((response) => (
                getPath(response.url()) === `/api/v1/services/bookings/${booking.booking_id}/status`
                && response.request().method() === 'PATCH'
              ));
              await statusSelect.selectOption(status);
              const statusResponse = await statusResponsePromise;
              const statusBody = await readJson(statusResponse);
              expect(statusResponse.status(), `Status ${status} failed: ${JSON.stringify(responseSummary(statusResponse, statusBody))}`).toBe(200);
              if (status !== 'completed') await expect(statusSelect).toHaveValue(status, { timeout: 20_000 });
            }
            await expect(statusSelect).toHaveCount(0, { timeout: 20_000 });
          } else {
            for (const status of ['confirmed', 'checked_in', 'in_service', 'completed']) {
              const statusResponse = await posPage.request.patch(`${apiURL}/api/v1/services/bookings/${booking.booking_id}/status`, {
                headers: posDiagnostics.authHeaders,
                data: { status },
                failOnStatusCode: false
              });
              const statusBody = await readJson(statusResponse);
              expect(statusResponse.status(), `Status ${status} failed: ${JSON.stringify(responseSummary(statusResponse, statusBody))}`).toBe(200);
            }
          }
          await posDiagnostics.assertHealthy('service lifecycle completion');
          await attachScreenshot(testInfo, posPage, `${scenario.key}-service-completed.png`);
        });

        await test.step('record completed-booking settlement reachability and settle through the API fallback', async () => {
          const collectPayment = posPage.getByRole('button', { name: 'Collect Payment' });
          if (await posPage.getByTestId('pos-services-operations-workspace').count()) {
            await posPage.getByRole('tab', { name: 'Calendar' }).click();
            await posPage.getByRole('textbox', { name: 'Search calendar bookings' }).fill(booking.public_reference);
          }
          expect.soft(await collectPayment.count(), 'Completed booking disappeared before post-service payment could be collected in the Services UI.').toBeGreaterThan(0);

          const settlementResponse = await posPage.request.post(`${apiURL}/api/v1/services/bookings/${booking.booking_id}/settle`, {
            headers: posDiagnostics.authHeaders,
            data: {
              payment_type: 'cash',
              cash_received: Number(booking.total_amount),
              shift_id: shift.shiftId,
              terminal_id: shift.terminalId,
              location_id: shift.locationId
            },
            failOnStatusCode: false
          });
          const settlementBody = await readJson(settlementResponse);
          await testInfo.attach(`${scenario.key}-settlement-response.json`, {
            body: JSON.stringify(settlementBody, null, 2), contentType: 'application/json'
          });
          expect(settlementResponse.status(), `Service settlement failed: ${JSON.stringify(responseSummary(settlementResponse, settlementBody))}`).toBe(200);
          settlement = settlementBody?.data || settlementBody;
          expect(settlement?.booking).toEqual(expect.objectContaining({ status: 'completed', payment_status: 'paid' }));
          expect(settlement?.pos_transaction).toEqual(expect.objectContaining({
            pos_transaction_id: expect.any(Number),
            invoice_number: expect.any(String),
            payment_type: 'cash',
            payment_status: 'paid'
          }));
        });

        await test.step('open and verify the POS receipt', async () => {
          const invoiceNumber = settlement.pos_transaction.invoice_number;
          await posPage.getByTestId('pos-nav-history').click();
          const historySearch = posPage.getByPlaceholder('Search by invoice number...');
          await expect(historySearch).toBeVisible();
          await historySearch.fill(invoiceNumber);
          const viewReceipt = posPage.getByRole('button', { name: `View receipt for ${invoiceNumber}` });
          await expect(viewReceipt).toBeVisible({ timeout: 20_000 });
          await viewReceipt.click();
          const receiptDialog = posPage.getByRole('dialog').filter({ hasText: 'Receipt Preview' });
          await expect(receiptDialog).toBeVisible();
          await expect(receiptDialog).toContainText(invoiceNumber);
          await expect(receiptDialog).toContainText(bookingFixture.service.name);
          await expect(receiptDialog).not.toContainText(`Item #${bookingFixture.service.item_id}`);
          await expect(receiptDialog).toContainText('CASH');
          await expect.soft(receiptDialog, 'Receipt lost the booking reference.').toContainText(booking.public_reference);
          await expect.soft(receiptDialog, 'Receipt lost the selected add-on.').toContainText(selectedAddOn);
          await expect.soft(receiptDialog, 'Receipt lost the service instructions.').toContainText(checkoutInstruction);
          const businessIcon = receiptDialog.getByRole('img', { name: /icon$/i });
          expect.soft(await businessIcon.count(), 'Receipt does not display the configured business icon.').toBeGreaterThan(0);
          await posDiagnostics.assertHealthy('receipt preview');
          await attachScreenshot(testInfo, posPage, `${scenario.key}-receipt-preview.png`);
        });
      } finally {
        if (storefrontDiagnostics.diagnostics.length > 0) {
          await testInfo.attach(`${scenario.key}-storefront-runtime-diagnostics.json`, {
            body: JSON.stringify(storefrontDiagnostics.diagnostics, null, 2), contentType: 'application/json'
          });
        }
        if (posDiagnostics.diagnostics.length > 0) {
          await testInfo.attach(`${scenario.key}-pos-runtime-diagnostics.json`, {
            body: JSON.stringify(posDiagnostics.diagnostics, null, 2), contentType: 'application/json'
          });
        }
        await attachScreenshot(testInfo, page, `${scenario.key}-storefront-final.png`);
        await attachScreenshot(testInfo, posPage, `${scenario.key}-pos-final.png`);
        await posContext.close();
      }
    });
  }
});
