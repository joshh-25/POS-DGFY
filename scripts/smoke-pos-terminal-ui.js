#!/usr/bin/env node
const { URL } = require('url');
const playwright = require('../apps/dgfy-api/node_modules/playwright');

const baseUrl = String(process.env.POS_UI_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');
const expectedSkupervisorOrigin = String(process.env.POS_UI_EXPECT_SKUPERVISOR_ORIGIN || '').trim()
  || (() => {
    const parsed = new URL(baseUrl);
    if (parsed.port === '5174') {
      parsed.port = '5173';
    } else if (parsed.hostname.startsWith('pos.')) {
      parsed.hostname = parsed.hostname.replace(/^pos\./, 'skupervisor.');
    }
    return parsed.origin;
  })();

const viewports = [
  { name: 'desktop', width: 1440, height: 960, isMobile: false },
  { name: 'tablet', width: 820, height: 1180, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

const collectTerminalEvidence = async (browser, viewport) => {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile
  });
  const logs = [];
  const httpErrors = [];
  page.on('console', (message) => logs.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => logs.push({ type: 'pageerror', text: error.message }));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpErrors.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(`${baseUrl}/terminal`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.getByRole('heading', { name: 'POS Catalog' }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Current Sale' }).waitFor({ timeout: 15000 });
  await page.getByText('Terminal Login Required').waitFor({ timeout: 15000 });
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  const emailInput = page.locator('#dgfy-pos-email');
  const passwordInput = page.getByPlaceholder('Enter your password');
  await emailInput.fill(`cashier-${viewport.name}@example.test`);
  await passwordInput.fill(`password-${viewport.name}`);

  const filterButton = page.getByRole('button', { name: /filter/i });
  const lockDrawerBlocksCatalog = await filterButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(centerX, centerY);
    return topElement !== element && !element.contains(topElement);
  });

  const ignoredHttpErrors = httpErrors.filter((entry) => {
    return (
      (entry.status === 400 && /\/api\/v1\/auth\/refresh-token$/.test(entry.url))
      || (entry.status === 401 && /\/api\/v1\/pos\/device\/status$/.test(entry.url))
    );
  });
  const unexpectedHttpErrors = httpErrors.filter((entry) => !ignoredHttpErrors.includes(entry));
  const consoleErrors = logs.filter((entry) => entry.type === 'error' || entry.type === 'pageerror').map((entry) => entry.text);
  const visibleConsoleErrors = unexpectedHttpErrors.length === 0
    ? consoleErrors.filter((text) => !/Failed to load resource: the server responded with a status of (400|401)/.test(text))
    : consoleErrors;

  const evidence = {
    viewport,
    hasTerminal: bodyText.includes('Terminal Login Required'),
    hasCatalog: bodyText.includes('POS Catalog'),
    hasCurrentSale: bodyText.includes('Current Sale'),
    hasLogin: await emailInput.isVisible() && await passwordInput.isVisible(),
    loginFormEditable: (await emailInput.inputValue()).includes(viewport.name)
      && (await passwordInput.inputValue()).includes(viewport.name),
    lockDrawerBlocksCatalog,
    errors: visibleConsoleErrors,
    httpErrors: unexpectedHttpErrors,
    ignoredHttpErrors,
    warnings: logs.filter((entry) => entry.type === 'warning').map((entry) => entry.text)
  };

  await page.close();
  return evidence;
};

const collectSalesRedirectEvidence = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failedRequests = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  try {
    await page.goto(`${baseUrl}/#/sales?source=pos-smoke`, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForURL((url) => {
      const currentUrl = String(url);
      return currentUrl.startsWith(`${expectedSkupervisorOrigin}/sales`)
        || currentUrl.startsWith(`${expectedSkupervisorOrigin}/login`);
    }, { timeout: 8000 });
  } catch {
    // The SKUpervisor dev server may be offline; URL mutation still proves redirect intent.
  }
  const redirectedUrl = page.url();
  await page.close();
  const expectedSalesUrl = `${expectedSkupervisorOrigin}/sales`;
  const expectedLoginUrl = `${expectedSkupervisorOrigin}/login`;
  const directSalesHandoff = redirectedUrl.startsWith(expectedSalesUrl)
    || failedRequests.some((url) => String(url || '').startsWith(expectedSalesUrl));
  const authGuardedSalesHandoff = redirectedUrl.startsWith(expectedLoginUrl);
  return {
    expectedSkupervisorOrigin,
    expectedSalesUrl,
    expectedLoginUrl,
    redirectedUrl,
    failedRequests,
    directSalesHandoff,
    authGuardedSalesHandoff,
    passed: directSalesHandoff || authGuardedSalesHandoff
  };
};

const run = async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const terminalEvidence = [];
    for (const viewport of viewports) {
      terminalEvidence.push(await collectTerminalEvidence(browser, viewport));
    }
    const salesRedirect = await collectSalesRedirectEvidence(browser);
    const failures = [];

    for (const evidence of terminalEvidence) {
      for (const key of ['hasTerminal', 'hasCatalog', 'hasCurrentSale', 'hasLogin', 'loginFormEditable', 'lockDrawerBlocksCatalog']) {
        if (!evidence[key]) {
          failures.push(`${evidence.viewport.name}.${key}`);
        }
      }
      if (evidence.errors.length > 0) {
        failures.push(`${evidence.viewport.name}.consoleErrors=${evidence.errors.join(' | ')}`);
      }
      if (evidence.httpErrors.length > 0) {
        failures.push(`${evidence.viewport.name}.httpErrors=${JSON.stringify(evidence.httpErrors)}`);
      }
    }
    if (!salesRedirect.passed) {
      failures.push(`salesRedirect=${salesRedirect.redirectedUrl}`);
    }

    console.log('[pos-terminal-ui-smoke] evidence');
    console.log(JSON.stringify({ baseUrl, terminalEvidence, salesRedirect }, null, 2));

    if (failures.length > 0) {
      console.error(`[pos-terminal-ui-smoke] FAIL ${failures.join(', ')}`);
      process.exit(1);
    }
    console.log('[pos-terminal-ui-smoke] PASS');
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  console.error('[pos-terminal-ui-smoke] failed:', error);
  process.exit(1);
});
