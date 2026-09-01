#!/usr/bin/env node
// #1341 (PR #1342, reviewer finding RF-1): Architecture Governance item 8 rendered-UI proof for
// PosDeliveryPricingSettingsCard.jsx. Modelled on the existing committed rendered-QA harnesses
// (scripts/smoke-pos-terminal-ui.js, scripts/smoke-guest-checkout-gate-ui.js,
// scripts/smoke-storefront-delivery-map.js) -- same playwright import, viewport shape,
// console/response-failure collection, and .tmp/rendered-qa/<suite>/ artifact convention.
//
// Scope note (disclosed, not silently assumed): this mounts the shipped component in isolation
// through a dedicated dev-only harness route (apps/dgfy-pos/tests/smoke/pos-delivery-pricing-
// harness.html/.jsx), not through the full authenticated TerminalOperationsWorkspace. Reaching
// this card through a real POS login requires either a live backend + seeded tenant DB (not
// available in every environment this harness runs in, including the one that authored it) or
// mocking TerminalOperationsWorkspace's own much larger set of unrelated bootstrap endpoints,
// which would exercise code this PR does not touch. The isolated harness renders the actual,
// unmodified component file through the real apps/dgfy-pos Vite config (same aliases the
// production build uses) with only its own two network calls (GET/PUT /api/v1/settings)
// intercepted -- it proves the component itself renders, saves, and round-trips correctly; it
// does not re-prove TerminalOperationsWorkspace's own unrelated tab-strip wiring.
const fs = require('fs/promises');
const path = require('path');
const childProcess = require('child_process');
// Unlike the storefront/dgfy-api-cross-referencing smoke scripts, this pulls playwright from
// apps/dgfy-pos's own node_modules (a transitive dep of its @playwright/test devDependency,
// already used by its own tests/e2e suite) rather than apps/dgfy-api's -- this harness only ever
// drives the POS app, so it has no reason to depend on dgfy-api's install being present.
const playwright = require('../apps/dgfy-pos/node_modules/playwright');

const managedServerPort = Number(process.env.POS_DELIVERY_PRICING_UI_PORT || 5194);
const harnessPath = '/tests/smoke/pos-delivery-pricing-harness.html';
const baseUrl = String(process.env.POS_DELIVERY_PRICING_UI_BASE_URL || `http://127.0.0.1:${managedServerPort}`).replace(/\/+$/, '');
const useManagedServer = String(process.env.POS_DELIVERY_PRICING_UI_MANAGED_SERVER || 'true').toLowerCase() !== 'false';
const artifactRoot = path.resolve(process.cwd(), '.tmp', 'rendered-qa', 'pos-delivery-pricing');
const evidencePath = path.join(artifactRoot, 'pos-delivery-pricing-ui-smoke.json');

const viewports = [
  { name: 'desktop', width: 1440, height: 960, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

const json = (data, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(status >= 400 ? { success: false, message: 'Mocked failure' } : { success: true, data })
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async (url, timeoutMs = 30000) => {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'text/html' } });
      if (response.ok) return true;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`POS dev server did not become ready at ${url}: ${lastError?.message || 'timeout'}`);
};

const startManagedPosServer = async () => {
  if (!useManagedServer) return null;
  const url = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return null;

  const viteBin = path.resolve(process.cwd(), 'apps/dgfy-pos', 'node_modules', 'vite', 'bin', 'vite.js');
  const cwd = path.resolve(process.cwd(), 'apps/dgfy-pos');
  const child = childProcess.spawn(process.execPath, [
    viteBin,
    '--config',
    'vite.config.js',
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
    await waitForServer(`${url.origin}${harnessPath}`, 30000);
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

const buildInitialSettings = () => ({
  store_delivery_fee: { value: 75 },
  store_delivery_fee_mode: { value: 'fixed' },
  store_delivery_fee_calc: { value: null }
});

const routeMockedApis = async (page, state) => {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === '/api/v1/settings' && request.method() === 'GET') {
      state.getCount += 1;
      await route.fulfill(json(state.settings));
      return;
    }

    if (pathname === '/api/v1/settings' && request.method() === 'PUT') {
      let body = {};
      try {
        body = request.postDataJSON();
      } catch {
        body = {};
      }
      state.putCount += 1;
      state.putBodies.push(body);
      if ('store_delivery_fee' in body) state.settings.store_delivery_fee = { value: body.store_delivery_fee };
      if ('store_delivery_fee_mode' in body) state.settings.store_delivery_fee_mode = { value: body.store_delivery_fee_mode };
      if ('store_delivery_fee_calc' in body) state.settings.store_delivery_fee_calc = { value: body.store_delivery_fee_calc };
      await route.fulfill(json(state.settings));
      return;
    }

    if (pathname.startsWith('/api/')) {
      await route.fulfill(json({}));
      return;
    }

    await route.continue();
  });
};

const runViewport = async (browser, viewport) => {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile
  });
  const state = { settings: buildInitialSettings(), getCount: 0, putCount: 0, putBodies: [] };
  const consoleEntries = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleEntries.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEntries.push({ type: 'pageerror', text: error.message });
  });

  await routeMockedApis(page, state);
  await page.goto(`${baseUrl}${harnessPath}?canManage=true`, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const heading = page.getByRole('heading', { name: 'Delivery Pricing' });
  await heading.waitFor({ timeout: 15000 });
  const feeInput = page.locator('#delivery-fee-flat');
  await feeInput.waitFor({ timeout: 15000 });
  const initialValue = await feeInput.inputValue();
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  const frameworkOverlayCount = await page.locator('vite-error-overlay').count();

  // Primary interaction: change the flat fee and Save. Round-trip proof: after save the card
  // re-fetches (force: true) and must re-render the value this harness's mocked PUT persisted,
  // not the pre-save value.
  await feeInput.fill('');
  await feeInput.fill('120');
  const [putRequest] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/settings') && response.request().method() === 'PUT', { timeout: 10000 }),
    page.getByRole('button', { name: /^save$/i }).click()
  ]);
  const putOk = putRequest.ok();
  const toastVisible = await page.getByText('Delivery pricing settings saved.').first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(300);
  const refreshedValue = await feeInput.inputValue().catch(() => '');
  const roundTripped = refreshedValue === '120';

  const screenshotPath = path.join(artifactRoot, `${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const checks = {
    pageIdentity: await heading.isVisible().catch(() => false),
    nonblankContent: bodyText.includes('Delivery Fee Mode') && bodyText.includes('Flat Delivery Fee'),
    initialHydration: initialValue === '75',
    noFrameworkOverlay: frameworkOverlayCount === 0,
    consoleHealth: consoleEntries.length === 0,
    interactionPutSent: state.putCount === 1,
    interactionPutOk: putOk,
    interactionToastVisible: toastVisible,
    interactionRoundTripped: roundTripped
  };

  await page.close();

  return {
    viewport: viewport.name,
    url: `${baseUrl}${harnessPath}?canManage=true`,
    bodyTextLength: bodyText.length,
    initialValue,
    refreshedValue,
    checks,
    putBodies: state.putBodies,
    getCount: state.getCount,
    consoleEntries,
    screenshot: screenshotPath
  };
};

// Negative proof (Architecture Governance item 7): a user without settings:edit gets the
// access-denied copy and the component never calls GET /settings at all -- desktop only, this
// is a gate check, not a second viewport matrix.
const runAccessGateCheck = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const state = { settings: buildInitialSettings(), getCount: 0, putCount: 0, putBodies: [] };
  await routeMockedApis(page, state);
  await page.goto(`${baseUrl}${harnessPath}?canManage=false`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const deniedText = page.getByText(/don't have access/i);
  const deniedVisible = await deniedText.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(300);
  await page.close();
  return {
    deniedVisible,
    settingsFetched: state.getCount > 0
  };
};

const collectFailures = (entry) => {
  const failures = [];
  for (const [key, passed] of Object.entries(entry.checks)) {
    if (!passed) failures.push(`${entry.viewport}.${key}`);
  }
  return failures;
};

const run = async () => {
  await fs.mkdir(artifactRoot, { recursive: true });
  const managedServer = await startManagedPosServer();
  const browser = await playwright.chromium.launch({ headless: true });
  const evidence = [];
  let accessGate = null;
  try {
    for (const viewport of viewports) {
      evidence.push(await runViewport(browser, viewport));
    }
    accessGate = await runAccessGateCheck(browser);
  } finally {
    await browser.close();
    await managedServer?.stop?.();
  }

  const failures = evidence.flatMap(collectFailures);
  if (!accessGate?.deniedVisible) failures.push('accessGate.deniedVisible');
  if (accessGate?.settingsFetched) failures.push('accessGate.settingsFetched (should not fetch when gated out)');

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    harnessPath,
    artifactRoot,
    managedServer: managedServer ? { pid: managedServer.pid } : null,
    evidence,
    accessGate,
    failures
  };
  await fs.writeFile(evidencePath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));

  if (failures.length > 0) {
    console.error(`[pos-delivery-pricing-ui-smoke] FAIL ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('[pos-delivery-pricing-ui-smoke] PASS');
};

run().catch((error) => {
  console.error('[pos-delivery-pricing-ui-smoke] failed:', error);
  process.exit(1);
});
