#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const childProcess = require('child_process');
const playwright = require('../backend/node_modules/playwright');

const managedServerPort = Number(process.env.STOREFRONT_DELIVERY_MAP_PORT || 5185);
const baseUrl = String(process.env.STOREFRONT_DELIVERY_MAP_URL || `http://127.0.0.1:${managedServerPort}/tenant-store/map-qa-cafe/order`);
const useManagedServer = String(process.env.STOREFRONT_DELIVERY_MAP_MANAGED_SERVER || 'true').toLowerCase() !== 'false';
const artifactRoot = path.resolve(process.cwd(), '.tmp', 'rendered-qa', 'storefront-delivery-map');
const evidencePath = path.join(artifactRoot, 'storefront-delivery-map-smoke.json');

const viewports = [
  { name: 'iphone-390', width: 390, height: 844, isMobile: true },
  { name: 'android-360', width: 360, height: 740, isMobile: true },
  { name: 'small-320', width: 320, height: 568, isMobile: true },
  { name: 'desktop', width: 1366, height: 900, isMobile: false }
];

const storeSlug = 'map-qa-cafe';
const storeProfile = {
  tenant_id: 'tenant-map-qa',
  tenant_name: 'Map QA Cafe',
  store_name: 'Map QA Cafe',
  slug: storeSlug,
  workflow_mode: 'fnb',
  business_mode: 'fnb',
  storefront_open: true,
  store_is_visible: true,
  catalog_count: 1,
  address_line: 'Javellana Street, Iloilo City',
  city: 'Iloilo City',
  latitude: 10.7202,
  longitude: 122.5621,
  location_id: 101,
  primary_location_id: 101,
  supports_delivery: true,
  supports_pickup: true,
  supports_dine_in: false,
  customer_access_mode: 'transaction',
  effective_customer_access_mode: 'transaction',
  requested_customer_access_mode: 'transaction',
  max_customer_access_mode: 'transaction',
  access_capabilities: {
    profile: true,
    contact: true,
    catalog: true,
    inventory: true,
    cart: true,
    quote: true,
    checkout: true,
    booking: false,
    payment: false
  }
};

const locationPayload = {
  primary_location_id: 101,
  locations: [
    {
      location_id: 101,
      name: 'Main Branch',
      address_line: 'Javellana Street, Iloilo City',
      city: 'Iloilo City',
      latitude: 10.7202,
      longitude: 122.5621,
      is_active: true,
      is_primary_storefront: true,
      is_open: true,
      supports_delivery: true,
      supports_pickup: true,
      supports_dine_in: false
    }
  ]
};

const catalogPayload = {
  items: [
    {
      item_id: 501,
      sku: 'MAP-QA-BOWL',
      name: 'Chicken Rice Bowl',
      description: 'Rendered QA item for delivery map smoke.',
      category: 'Rice Meals',
      product_type: 'Rice Meals',
      menu_category: 'Rice Meals',
      folder_name: 'Rice Meals',
      unit_of_measure: 'serving',
      default_sale_price: 145,
      current_stock: 20,
      storefront_visible: true,
      checkout_allowed: true,
      is_available: true,
      availability_status: 'in_stock',
      modifiers: []
    }
  ],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1, count: 1 }
};

const mapStylePayload = {
  version: 8,
  sources: {
    'delivery-map-qa': {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    }
  },
  layers: [
    {
      id: 'delivery-map-qa-background',
      type: 'background',
      paint: {
        'background-color': '#e8eef5'
      }
    }
  ]
};

const json = (data, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(status >= 400 ? { success: false, message: 'Mocked failure', data } : { success: true, data })
});

const rawJson = (data, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(data)
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async (url, timeoutMs = 30000) => {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/html' }
      });
      if (response.ok) return true;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Storefront dev server did not become ready at ${url}: ${lastError?.message || 'timeout'}`);
};

const startManagedStorefrontServer = async () => {
  if (!useManagedServer) return null;
  const url = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return null;

  const viteBin = path.resolve(process.cwd(), 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
  const cwd = path.resolve(process.cwd(), 'frontend');
  const child = childProcess.spawn(process.execPath, [
    viteBin,
    '--config',
    'apps/store/vite.config.js',
    '--host',
    '127.0.0.1',
    '--port',
    url.port || String(managedServerPort),
    '--strictPort'
  ], {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  child.once('exit', (code, signal) => {
    if (code || signal) logs.push(`[vite-exit] code=${code} signal=${signal}`);
  });

  try {
    await waitForServer(`${url.origin}/`, 30000);
  } catch (error) {
    child.kill();
    throw new Error(`${error.message}\n${logs.join('')}`);
  }

  return {
    pid: child.pid,
    stop: async () => {
      if (child.killed) return;
      child.kill();
      await sleep(300);
    },
    logs
  };
};

const routeMockedApis = async (page) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.includes('/api/v1/maps/style/openfreemap') || pathname.includes('/openfreemap/styles/positron')) {
      await route.fulfill(rawJson(mapStylePayload));
      return;
    }

    if (pathname.includes('/api/v1/storefront/discovery/map-qa-cafe')) {
      await route.fulfill(json(storeProfile));
      return;
    }

    if (pathname.includes('/api/v1/storefront/discovery')) {
      await route.fulfill(json({
        stores: [storeProfile],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
        applied_filters: {
          result_mode: 'union',
          stock_filter: 'include_out_of_stock',
          pin_scope: 'tenant_primary',
          include_match_meta: true
        }
      }));
      return;
    }

    if (pathname.includes('/api/v1/store/locations')) {
      await route.fulfill(json(locationPayload));
      return;
    }

    if (pathname.includes('/api/v1/store/catalog')) {
      await route.fulfill(json(catalogPayload));
      return;
    }

    if (pathname.includes('/api/v1/store/follow/status')) {
      await route.fulfill(json({ storefront_slug: storeSlug, is_following: false, followers_count: 0 }));
      return;
    }

    if (pathname.includes('/api/v1/dgfy/auth/me')) {
      await route.fulfill(json(null, 401));
      return;
    }

    if (pathname.startsWith('/api/')) {
      await route.fulfill(json({}));
      return;
    }

    await route.continue();
  });
};

const rectInside = (child, parent, tolerance = 2) => (
  child.left >= parent.left - tolerance
  && child.top >= parent.top - tolerance
  && child.right <= parent.right + tolerance
  && child.bottom <= parent.bottom + tolerance
);

const measureMap = async (page, label) => {
  const frames = page.locator('[data-delivery-map-frame="true"]');
  const frame = label === 'expanded' ? frames.last() : frames.first();
  await frame.waitFor({ state: 'visible', timeout: 20000 });
  if (label === 'normal') {
    await frame.scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(750);

  const metrics = await frame.evaluate((node) => {
    const toRect = (rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    });
    const root = node.querySelector('[data-delivery-map-root="true"]');
    const controls = node.querySelector('[data-delivery-map-controls="true"]');
    const canvas = node.querySelector('canvas');
    const buttons = Array.from(node.querySelectorAll('button')).map((button) => ({
      text: button.textContent.trim(),
      ariaLabel: button.getAttribute('aria-label') || '',
      rect: toRect(button.getBoundingClientRect())
    }));
    return {
      frame: toRect(node.getBoundingClientRect()),
      root: root ? toRect(root.getBoundingClientRect()) : null,
      controls: controls ? toRect(controls.getBoundingClientRect()) : null,
      canvas: canvas ? toRect(canvas.getBoundingClientRect()) : null,
      buttonCount: buttons.length,
      buttons,
      mapUnavailable: Boolean(node.querySelector('[data-delivery-map-frame="fallback"]'))
    };
  });

  const checks = {
    frameVisible: metrics.frame.width > 0 && metrics.frame.height > 0,
    rootFillsFrame: metrics.root
      ? metrics.root.width >= metrics.frame.width * 0.95 && metrics.root.height >= metrics.frame.height * 0.95
      : false,
    canvasFillsFrame: metrics.canvas
      ? metrics.canvas.width >= metrics.frame.width * 0.95 && metrics.canvas.height >= metrics.frame.height * 0.95
      : false,
    controlsInsideFrame: metrics.controls ? rectInside(metrics.controls, metrics.frame) : false,
    buttonsInsideFrame: metrics.buttons.every((button) => rectInside(button.rect, metrics.frame)),
    hasCurrentLocation: metrics.buttons.some((button) => /use current location/i.test(button.text)),
    hasPinAction: metrics.buttons.some((button) => /drag to (adjust pin|pin)/i.test(button.text)),
    hasExpandAction: label === 'normal'
      ? metrics.buttons.some((button) => /open large map/i.test(button.ariaLabel))
      : true,
    notFallback: metrics.mapUnavailable === false
  };

  return { label, metrics, checks };
};

const runViewport = async (browser, viewport) => {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile
  });
  const consoleEntries = [];
  const apiRequests = [];
  page.on('request', (request) => {
    try {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) apiRequests.push(`${request.method()} ${url.pathname}${url.search}`);
    } catch {
      // Ignore malformed browser-internal URLs.
    }
  });
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      const text = message.text();
      if (/Failed to load resource: the server responded with a status of 401/i.test(text)) return;
      if (/GL Driver Message.*ReadPixels/i.test(text)) return;
      if (/Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED/i.test(text)) return;
      consoleEntries.push({ type: message.type(), text, location: message.location() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEntries.push({ type: 'pageerror', text: error.message });
  });

  await routeMockedApis(page);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const guestButton = page.getByRole('button', { name: /continue as guest/i }).first();
  if (await guestButton.isVisible().catch(() => false)) {
    await guestButton.click();
    await page.waitForTimeout(500);
  }

  try {
    const normal = await measureMap(page, 'normal');
    const normalScreenshot = path.join(artifactRoot, `${viewport.name}-normal.png`);
    await page.screenshot({ path: normalScreenshot, fullPage: false });

    const expandButton = page.getByRole('button', { name: /open large map/i }).first();
    await expandButton.click();
    await page.getByText('Large Map').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(750);
    const expanded = await measureMap(page, 'expanded');
    const expandedScreenshot = path.join(artifactRoot, `${viewport.name}-expanded.png`);
    await page.screenshot({ path: expandedScreenshot, fullPage: false });

    await page.close();

    return {
      viewport,
      url: baseUrl,
      normal,
      expanded,
      screenshots: { normal: normalScreenshot, expanded: expandedScreenshot },
      apiRequests,
      consoleEntries
    };
  } catch (error) {
    const debugScreenshot = path.join(artifactRoot, `${viewport.name}-debug-failure.png`);
    const debugTextPath = path.join(artifactRoot, `${viewport.name}-debug-failure.txt`);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    await page.screenshot({ path: debugScreenshot, fullPage: false }).catch(() => {});
    await fs.writeFile(debugTextPath, [
      `url=${page.url()}`,
      `error=${error.message}`,
      '',
      '[body]',
      bodyText,
      '',
      '[apiRequests]',
      ...apiRequests,
      '',
      '[console]',
      ...consoleEntries.map((entry) => `${entry.type}: ${entry.text}`)
    ].join('\n'));
    await page.close();
    throw error;
  }
};

const collectFailures = (entry) => {
  const failures = [];
  for (const section of [entry.normal, entry.expanded]) {
    for (const [key, passed] of Object.entries(section.checks)) {
      if (!passed) failures.push(`${entry.viewport.name}.${section.label}.${key}`);
    }
  }
  if (entry.consoleEntries.length > 0) {
    failures.push(`${entry.viewport.name}.console=${entry.consoleEntries.map((item) => item.text).join(' | ')}`);
  }
  return failures;
};

const run = async () => {
  await fs.mkdir(artifactRoot, { recursive: true });
  const managedServer = await startManagedStorefrontServer();
  const browser = await playwright.chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const viewport of viewports) {
      evidence.push(await runViewport(browser, viewport));
    }
  } finally {
    await browser.close();
    await managedServer?.stop?.();
  }

  const failures = evidence.flatMap(collectFailures);
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    artifactRoot,
    managedServer: managedServer ? { pid: managedServer.pid } : null,
    evidence,
    failures
  };
  await fs.writeFile(evidencePath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));

  if (failures.length > 0) {
    console.error(`[storefront-delivery-map-smoke] FAIL ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('[storefront-delivery-map-smoke] PASS');
};

run().catch((error) => {
  console.error('[storefront-delivery-map-smoke] failed:', error);
  process.exit(1);
});
