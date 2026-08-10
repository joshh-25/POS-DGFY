import { expect, test } from '@playwright/test';

const storefrontURL = String(process.env.STOREFRONT_URL || 'http://localhost:5175').replace(/\/$/, '');
const storeSlug = 'phase-20-conditional-modifiers';

const installRuntimeDiagnostics = (page) => {
  const diagnostics = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const path = new URL(request.url()).pathname;
    const failure = request.failure()?.errorText || '';
    if (failure === 'net::ERR_ABORTED' && path === '/api/v1/storefront/discovery') return;
    diagnostics.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) diagnostics.push(`http5xx: ${response.status()} ${response.url()}`);
  });
  return diagnostics;
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
          { modifier_option_id: 702, name: 'Cola', price_delta: 0, is_active: true }
        ]
      }
    ]
  };

  await page.route('**/api/v1/storefront/discovery/**', (route) => route.fulfill({
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
};

const assertConditionalFlow = async (page, onConditionalSelection = null) => {
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText(/Something went wrong|Unexpected error|Application error/i)).toHaveCount(0);
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
};

test('conditional F&B modifier is accessible and responsive on desktop and mobile @fnb @modifiers @phase21', async ({ page }, testInfo) => {
  const diagnostics = installRuntimeDiagnostics(page);
  await installDeterministicStorefront(page);

  await page.goto(`${storefrontURL}/tenant-store/${storeSlug}/item?item=501`, { waitUntil: 'domcontentloaded' });
  await assertConditionalFlow(page, async () => testInfo.attach('phase21-conditional-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertConditionalFlow(page, async () => {
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const renderedWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(renderedWidth).toBeLessThanOrEqual(viewportWidth);
    await testInfo.attach('phase21-conditional-mobile', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  });

  if (diagnostics.length > 0) {
    await testInfo.attach('runtime-diagnostics', { body: diagnostics.join('\n'), contentType: 'text/plain' });
  }
  expect(diagnostics, diagnostics.join('\n')).toEqual([]);
});
