import { expect, test } from '@playwright/test';

const storefrontURL = String(process.env.E2E_CONTRACT_BASE_URL || process.env.STOREFRONT_URL || 'http://127.0.0.1:5175').replace(/\/$/, '');
const storeSlug = 'phase-20-conditional-modifiers';

const installRuntimeDiagnostics = (page) => {
  const diagnostics = [];
  const pathFor = (url) => {
    try {
      return new URL(url).pathname;
    } catch {
      return String(url || '');
    }
  };
  const isExpected = (entry) => {
    const path = pathFor(entry.url);
    if (entry.type === 'http' && entry.status === 404 && path === '/api/v1/store/domain-context') return true;
    if (entry.type === 'requestfailed' && entry.error === 'net::ERR_ABORTED') {
      const isNominatimReverseLookup = (() => {
        try {
          const url = new URL(entry.url);
          return url.hostname === 'nominatim.openstreetmap.org' && path === '/reverse';
        } catch {
          return false;
        }
      })();
      return /^\/api\/v1\/storefront\/discovery(?:\/|$)/.test(path)
        || path === '/api/v1/dgfy/auth/me'
        || isNominatimReverseLookup
        || /^\/openfreemap\//.test(path);
    }
    return false;
  };

  page.on('pageerror', (error) => diagnostics.push({
    type: 'pageerror', message: error.message, stack: error.stack || null, url: page.url()
  }));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push({
      type: 'console.error', message: message.text(), url: page.url()
    });
  });
  page.on('requestfailed', (request) => {
    const entry = {
      type: 'requestfailed', method: request.method(), url: request.url(),
      error: request.failure()?.errorText || 'unknown request failure'
    };
    if (!isExpected(entry)) diagnostics.push(entry);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const entry = {
        type: 'http', status: response.status(), method: response.request().method(), url: response.url()
      };
      if (!isExpected(entry)) diagnostics.push(entry);
    }
  });

  const assertHealthy = async (checkpoint) => {
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByText(/Something went wrong|Unexpected error|Application error|ReferenceError/i)).toHaveCount(0);
    expect(diagnostics, `Runtime diagnostics after ${checkpoint}: ${JSON.stringify(diagnostics, null, 2)}`).toEqual([]);
    diagnostics.length = 0;
  };

  return { diagnostics, assertHealthy };
};

const installDeterministicStorefront = async (page) => {
  const item = {
    item_id: 501,
    name: 'Phase 20 Burger',
    description: 'Deterministic browser fixture for conditional menu modifiers.',
    category: 'product',
    folder_name: 'Meals',
    default_sale_price: 180,
    current_stock: 10,
    available: true,
    inventory_display: { label: 'Available', available: true },
    fnb_modifier_groups: [
      {
        modifier_group_id: 601,
        display_name: 'Meal upgrade',
        group_kind: 'modifier',
        min_select: 0,
        max_select: 2,
        required: false,
        options: [
          { modifier_option_id: 701, name: 'Make it a combo', price_delta: 50, is_active: true }
        ]
      },
      {
        modifier_group_id: 602,
        display_name: 'Drink',
        group_kind: 'combo_choice',
        parent_modifier_option_id: 701,
        min_select: 1,
        max_select: 1,
        required: true,
        options: [
          { modifier_option_id: 702, name: 'Cola', price_delta: 25, is_active: true }
        ]
      }
    ]
  };

  await page.route(/\/api\/v1\/storefront\/discovery(?:\/|\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: {
      tenant_id: '11111111-1111-4111-8111-111111111111',
      tenant_name: 'Phase 20 Cafe',
      slug: storeSlug,
      workflow_mode: 'fnb',
      storefront_open: true,
      store_has_no_location: true,
      map_publication_disabled: true,
      active_location_snapshot: [],
      access_capabilities: { catalog: true, cart: true, quote: true, checkout: true },
      inventory_display_mode: 'availability'
    } })
  }));
  await page.route('**/api/v1/store/locations**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { locations: [], store_has_no_location: true } })
  }));
  await page.route('**/api/v1/store/catalog**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: {
      items: [item],
      workflow_mode: 'fnb',
      capabilities: { menuModifiers: true },
      access_policy: { effective_customer_access_mode: 'transaction' }
    } })
  }));
  await page.route('**/api/v1/store/items/501/reviews**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { reviews: [], summary: { score: 0, total_count: 0 } } })
  }));
  await page.route('**/api/v1/dgfy/customer/reviews/public**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { reviews: [], summary: { score: 0, total_count: 0 } } })
  }));
};

const assertConditionalFlow = async (page, runtime, onConditionalSelection = null) => {
  await runtime.assertHealthy('initial F&B item render');
  await expect(page.getByRole('heading', { name: 'Phase 20 Burger' })).toBeVisible();
  await expect(page.getByText('Meal Upgrade', { exact: true })).toBeVisible();
  await expect(page.getByText('Drink', { exact: true })).toHaveCount(0);

  const parentGroupButton = page.getByRole('button', { name: /Meal Upgrade/ });
  await parentGroupButton.focus();
  await expect(parentGroupButton).toBeFocused();
  await page.keyboard.press('Enter');

  const parentOption = page.getByRole('checkbox').first();
  await parentOption.focus();
  await expect(parentOption).toBeFocused();
  await page.keyboard.press('Space');
  await expect(parentOption).toBeChecked();
  await expect(page.getByText('Drink', { exact: true })).toBeVisible();

  const childGroupButton = page.getByRole('button', { name: /Drink/ });
  await childGroupButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Cola', { exact: true })).toBeVisible();

  const childOption = page.getByRole('radio');
  await childOption.focus();
  await page.keyboard.press('Space');
  await expect(childOption).toBeChecked();
  const childQuantity = page.getByLabel('Cola quantity');
  await expect(childQuantity).toHaveValue('1');
  await childQuantity.fill('3');
  await expect(childQuantity).toHaveValue('3');
  await expect(page.getByText(/PHP 305\.00/).first()).toBeVisible();
  await runtime.assertHealthy('conditional modifier quantity update');

  const unlabeledInputs = await page.locator('input').evaluateAll((inputs) => inputs.filter((input) => {
    const id = input.getAttribute('id');
    const hasExplicitLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const hasWrappingLabel = Boolean(input.closest('label'));
    const hasAccessibleName = Boolean(input.getAttribute('aria-label') || input.getAttribute('aria-labelledby'));
    return !hasExplicitLabel && !hasWrappingLabel && !hasAccessibleName;
  }).length);
  expect(unlabeledInputs).toBe(0);

  if (onConditionalSelection) await onConditionalSelection();

  await parentOption.focus();
  await page.keyboard.press('Space');
  await expect(parentOption).not.toBeChecked();
  await expect(page.getByText('Drink', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Cola quantity')).toHaveCount(0);
  await runtime.assertHealthy('conditional modifier deactivation');
};

test('conditional F&B modifier is accessible and responsive on desktop and mobile @fnb @modifiers @phase25', async ({ page }, testInfo) => {
  const runtime = installRuntimeDiagnostics(page);
  await installDeterministicStorefront(page);

  await page.goto(`${storefrontURL}/tenant-store/${storeSlug}/item?item=501`, { waitUntil: 'domcontentloaded' });
  await assertConditionalFlow(page, runtime, async () => testInfo.attach('phase25-conditional-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertConditionalFlow(page, runtime, async () => {
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const renderedWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(renderedWidth).toBeLessThanOrEqual(viewportWidth);
    await testInfo.attach('phase25-conditional-mobile', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  });

  if (runtime.diagnostics.length > 0) {
    await testInfo.attach('runtime-diagnostics', {
      body: JSON.stringify(runtime.diagnostics, null, 2), contentType: 'application/json'
    });
  }
  expect(runtime.diagnostics).toEqual([]);
});
