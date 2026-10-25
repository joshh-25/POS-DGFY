import { test, expect } from '@playwright/test';
import { hasTestCredentials, testCredentials } from '../fixtures/test-credentials.js';
import { signIn } from '../fixtures/login.js';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

function monitorRuntime(page) {
  const errors = [];
  // The local browser sandbox blocks OpenFreeMap tile-style requests. Keep this
  // external harness limitation separate from application/API failures.
  const isExpectedMapAbort = (request) => request.failure()?.errorText === 'net::ERR_ABORTED'
    && /tiles\.openfreemap\.org|openfreemap/i.test(request.url());
  const isExpectedMapNetworkBlock = (request) => request.failure()?.errorText === 'net::ERR_NETWORK_ACCESS_DENIED'
    && /tiles\.openfreemap\.org|openfreemap/i.test(request.url());
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text() !== 'Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (!isExpectedMapAbort(request) && !isExpectedMapNetworkBlock(request)) {
      errors.push(`requestfailed: ${request.failure()?.errorText || 'unknown'}: ${request.url()}`);
    }
  });
  return {
    assertClean() {
      expect(errors, errors.join('\n')).toEqual([]);
    },
  };
}

async function openSettings(page) {
  await page.addInitScript(() => {
    for (const key of [
      'pos_terminal_locked_v1',
      'pos_terminal_lock_reason_v1',
      'pos_terminal_admin_lock_context_v1',
      'pos_terminal_identity_v1',
    ]) {
      window.localStorage.removeItem(key);
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const settingsButton = page.getByRole('button', { name: /^Settings\b/i });
  await settingsButton.waitFor({ state: 'visible' });
  if (!(await settingsButton.isEnabled())) {
    await signIn(page, testCredentials, { expectedPostcondition: 'pos-catalog' });
    await expect(settingsButton).toBeEnabled({ timeout: 20_000 });
  }
  await expect(page.locator('#root')).not.toBeEmpty();

  const skipShift = page.getByRole('button', { name: 'Skip for Admin', exact: true });
  await skipShift.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  if (await skipShift.isVisible().catch(() => false)) {
    await skipShift.click();
    await expect(skipShift).toBeHidden({ timeout: 8_000 });
    await page.getByRole('heading', { name: 'Shift', exact: true }).waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  }

  const settings = page.getByRole('button', { name: /^Settings\b/i });
  if (!(await settings.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Open sidebar menu' }).click();
  }
  await expect(page.getByRole('button', { name: /^Settings\b/i })).toBeEnabled({ timeout: 20_000 });
  const profileTab = page.getByRole('tab', { name: 'Profile Setting' });
  await settings.click();
  if (!(await profileTab.isVisible({ timeout: 5_000 }).catch(() => false))) {
    await settings.click();
  }
  await expect(profileTab).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('tabpanel')).toBeVisible();
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    body: { client: document.body.clientWidth, scroll: document.body.scrollWidth },
    document: { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth },
  }));
  expect(dimensions.body.scroll).toBeLessThanOrEqual(dimensions.body.client + 1);
  expect(dimensions.document.scroll).toBeLessThanOrEqual(dimensions.document.client + 1);
}

test.beforeEach(async ({ page }) => {
  test.skip(!hasTestCredentials, 'Provide E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD.');
  await openSettings(page);
});

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: Settings navigation remains usable without page overflow`, async ({ page }) => {
    const runtime = monitorRuntime(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const tabName of ['Profile Setting', 'POS Setup', 'Storefront', 'Payments', 'Delivery Pricing', 'Employees']) {
      const tab = page.getByRole('tab', { name: tabName, exact: true });
      if (await tab.count()) {
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await assertNoHorizontalOverflow(page);
      }
    }

    runtime.assertClean();
  });
}

test('Settings tabs support roving keyboard focus', async ({ page }) => {
  const profile = page.getByRole('tab', { name: 'Profile Setting', exact: true });
  await profile.focus();
  await profile.press('ArrowRight');
  const posSetup = page.getByRole('tab', { name: 'POS Setup', exact: true });
  await expect(posSetup).toBeFocused();
  await expect(posSetup).toHaveAttribute('aria-selected', 'true');
});

test('Settings text inputs use compact readable sizing', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit profile' }).click();
  const username = page.getByLabel('Username');
  await expect(username).toBeVisible();
  const metrics = await username.evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, fontSize: parseFloat(style.fontSize) };
  });
  expect(metrics.height).toBeGreaterThanOrEqual(36);
  expect(metrics.height).toBeLessThanOrEqual(40);
  expect(metrics.fontSize).toBeGreaterThanOrEqual(13);
  expect(metrics.fontSize).toBeLessThanOrEqual(14);
});

test('Storefront subtabs and business-hour inline forms preserve context on cancel', async ({ page }) => {
  const runtime = monitorRuntime(page);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByRole('tab', { name: 'POS Setup', exact: true }).click();
    const posSetupSubtabHeight = await page.getByRole('tab', { name: 'Business & Receipts', exact: true }).evaluate((element) => element.getBoundingClientRect().height);
    await page.getByRole('tab', { name: 'Storefront', exact: true }).click();
    const locationsTab = page.getByRole('tab', { name: 'Business Hours and Locations', exact: true });
    await locationsTab.click();
    const locationsTabHeight = await locationsTab.evaluate((element) => element.getBoundingClientRect().height);
    expect(locationsTabHeight, `${viewport.name} Storefront tab height`).toBe(posSetupSubtabHeight);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('tab', { name: 'Storefront', exact: true }).click();

  for (const name of ['Store Setup', 'Store Content', 'Business Hours and Locations', 'Reviews']) {
    const tab = page.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  await page.getByRole('tab', { name: 'Business Hours and Locations', exact: true }).click();
  const locationsTabMetrics = await page.getByRole('tab', { name: 'Business Hours and Locations', exact: true }).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
    label: element.querySelector('span:last-child')
      ? {
        clientWidth: element.querySelector('span:last-child').clientWidth,
        scrollWidth: element.querySelector('span:last-child').scrollWidth
      }
      : null
  }));
  expect(locationsTabMetrics.scrollWidth).toBeLessThanOrEqual(locationsTabMetrics.clientWidth + 1);
  expect(locationsTabMetrics.label?.scrollWidth).toBeLessThanOrEqual((locationsTabMetrics.label?.clientWidth || 0) + 1);
  await expect(page.getByText('Current Schedule', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Schedule Set', exact: true }).click();
  await expect(page.getByText('Add New Schedule Set', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Add New Schedule Set', { exact: true })).toBeHidden();
  await expect(page.getByText('Current Schedule', { exact: true })).toBeVisible();
  runtime.assertClean();
});

test('Edit Branch map expansion is scoped, responsive, keyboard dismissible, and restores focus', async ({ page }) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 }
  ];

  const openEditor = async () => {
    await page.getByRole('tab', { name: 'Storefront', exact: true }).click();
    await page.getByRole('tab', { name: 'Business Hours and Locations', exact: true }).click();
    const editBranch = page.getByRole('button', { name: /Edit .*branch|Edit branch/i }).first();
    await editBranch.click();
    await expect(page.getByText('Edit Branch', { exact: true })).toBeVisible();
  };

  await page.setViewportSize(viewports[0]);
  await page.getByRole('tab', { name: 'Storefront', exact: true }).click();
  await page.getByRole('tab', { name: 'Business Hours and Locations', exact: true }).click();
  const editBranch = page.getByRole('button', { name: /Edit .*branch|Edit branch/i }).first();
  test.skip(!(await editBranch.count()), 'No editable branch is available for this tenant.');

  for (const [index, viewport] of viewports.entries()) {
    if (index > 0) {
      await page.setViewportSize(viewport);
      await openEditor();
    } else {
      await editBranch.click();
      await expect(page.getByText('Edit Branch', { exact: true })).toBeVisible();
    }

    const expand = page.getByRole('button', { name: 'Expand map', exact: true });
    await expand.click();
    const dialog = page.getByRole('dialog', { name: 'Set branch location' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close expanded map' })).toBeFocused();
    const box = await dialog.boundingBox();
    const scrim = page.getByRole('button', { name: 'Dismiss expanded map', exact: true });
    const scrimBox = await scrim.boundingBox();
    const headerBox = await page.locator('.dgfy-pos-topbar').boundingBox();
    const settingsViewportBox = await page.getByTestId('pos-workspace-scroll-container').boundingBox();
    expect(box).not.toBeNull();
    expect(scrimBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(settingsViewportBox).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x).toBeGreaterThanOrEqual(settingsViewportBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(settingsViewportBox.x + settingsViewportBox.width);
    expect(scrimBox.x).toBeGreaterThanOrEqual(settingsViewportBox.x);
    expect(scrimBox.x + scrimBox.width).toBeLessThanOrEqual(settingsViewportBox.x + settingsViewportBox.width);
    expect(scrimBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(scrimBox.y + scrimBox.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.getByTestId('pos-workspace-scroll-container').evaluate((element) => element.style.overflowY)).toBe('hidden');
    if (viewport.width < 640) {
      const saveBox = await page.getByRole('button', { name: 'Save Changes', exact: true }).boundingBox();
      expect(saveBox).not.toBeNull();
      expect(scrimBox.y + scrimBox.height).toBeLessThanOrEqual(saveBox.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(expand).toBeFocused();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('Mobile Edit Branch actions stay fixed and visible while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Storefront', exact: true }).click();
  await page.getByRole('tab', { name: 'Business Hours and Locations', exact: true }).click();

  const editBranch = page.getByRole('button', { name: /Edit .*branch|Edit branch/i }).first();
  test.skip(!(await editBranch.count()), 'No editable branch is available for this tenant.');
  await editBranch.click();

  const save = page.getByRole('button', { name: 'Save Changes', exact: true });
  await expect(save).toHaveCount(1);
  const actionBar = save.locator('..');
  await expect.poll(() => actionBar.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');

  const before = await actionBar.boundingBox();
  expect(before).not.toBeNull();
  expect(before.y + before.height).toBeLessThanOrEqual(844);

  await page.mouse.wheel(0, 1200);
  const after = await actionBar.boundingBox();
  expect(after).not.toBeNull();
  expect(after.y + after.height).toBeLessThanOrEqual(844);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
});

test('Gallery upload accepts one or multiple image files', async ({ page }) => {
  const runtime = monitorRuntime(page);
  await page.getByRole('tab', { name: 'Storefront', exact: true }).click();
  await page.getByRole('tab', { name: 'Store Content', exact: true }).click();
  const fileInput = page.getByLabel('Choose gallery images');
  await expect(fileInput).toHaveCount(1);
  await expect(fileInput).toBeEnabled({ timeout: 20_000 });
  expect(await fileInput.evaluate((input) => input.multiple)).toBe(true);

  const galleryList = page.getByRole('list', { name: 'Storefront gallery images', exact: true });
  const initialImageCount = await galleryList.count()
    ? await galleryList.locator('img').count()
    : 0;
  let uploadRequestCount = 0;
  await page.route('**/settings/storefront-assets/gallery**', async (route) => {
    uploadRequestCount += 1;
    expect(route.request().method()).toBe('POST');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          path: `storefront/gallery/qa-${uploadRequestCount}.png`,
          image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        },
      }),
    });
  });

  await fileInput.setInputFiles([
    { name: 'qa-gallery-one.png', mimeType: 'image/png', buffer: Buffer.from('qa-gallery-one') },
    { name: 'qa-gallery-two.png', mimeType: 'image/png', buffer: Buffer.from('qa-gallery-two') },
  ]);
  await expect.poll(() => uploadRequestCount).toBe(2);
  await expect(page.locator('p[aria-live="polite"]').filter({ hasText: '2 gallery images processed.' })).toHaveText('2 gallery images processed.');
  await expect.poll(async () => (await page.getByRole('list', { name: 'Storefront gallery images', exact: true }).locator('img').count()))
    .toBe(initialImageCount + 2);
  runtime.assertClean();
});

test('Employees pagination controls remain consistently sized on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const employees = page.getByRole('tab', { name: 'Employees', exact: true });
  test.skip(!(await employees.count()), 'Employees settings are unavailable for this role.');
  await employees.click();
  await expect(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible();
  const pageSize = page.getByRole('combobox', { name: 'Employees per page', exact: true });
  await expect(pageSize).toBeVisible();
  const fontSize = await pageSize.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBe(12);
  await assertNoHorizontalOverflow(page);
});

test('All Settings views load without API or responsive layout regressions', async ({ page }) => {
  const runtime = monitorRuntime(page);
  const failedApiResponses = [];
  page.on('response', (response) => {
    if (/\/api\/v1\//i.test(response.url()) && response.status() >= 400) {
      failedApiResponses.push(`${response.status()}: ${response.url()}`);
    }
  });

  const views = [
    {
      top: 'Profile Setting',
      heading: 'Shared Account Profile',
    },
    {
      top: 'POS Setup',
      nestedTablist: 'POS Setup sections',
      nested: [
        ['Business & Receipts', 'Receipt & POS Metadata'],
        ['Operations & Access', 'Cashier Closeout'],
        ['Terminals', 'Terminal Registry'],
        ['Discounts & Automation', 'POS Discount Presets'],
      ],
    },
    {
      top: 'Storefront',
      nestedTablist: 'Storefront settings sections',
      nested: [
        ['Store Setup', 'Storefront ID and item QR links'],
        ['Store Content', 'Store Content'],
        ['Business Hours and Locations', 'Business Hours'],
        ['Reviews', 'Reviews'],
      ],
    },
    {
      top: 'Payments',
      heading: 'Payment Mode',
    },
    {
      top: 'Delivery Pricing',
      heading: 'Delivery Pricing',
    },
    {
      top: 'Employees',
      nestedTablist: 'Employee settings sections',
      nested: [
        ['Employees', 'Employees'],
        ['Delivery Personnel', 'Delivery Personnel'],
        ['Employee Credit', 'Employee Credit'],
      ],
    },
  ];

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);

    for (const view of views) {
      const topTab = page.getByRole('tab', { name: view.top, exact: true });
      await topTab.click();
      await expect(topTab).toHaveAttribute('aria-selected', 'true');

      if (view.heading) {
        await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeVisible();
      }

      for (const [nestedName, heading] of view.nested || []) {
        const nestedTab = page.getByRole('tablist', { name: view.nestedTablist, exact: true })
          .getByRole('tab', { name: nestedName, exact: true });
        await nestedTab.click();
        await expect(nestedTab).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      }

      await assertNoHorizontalOverflow(page);
    }
  }

  expect(failedApiResponses, failedApiResponses.join('\n')).toEqual([]);
  runtime.assertClean();
});
