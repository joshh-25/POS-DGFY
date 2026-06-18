#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const playwright = require('../backend/node_modules/playwright');

const urls = {
  pos: String(process.env.DGFY_ACCESS_POS_URL || 'http://localhost:5174/terminal'),
  dgfyAuth: String(process.env.DGFY_ACCESS_AUTH_URL || 'http://localhost:5173/dgfy/auth'),
  dgfyAccount: String(process.env.DGFY_ACCESS_ACCOUNT_URL || 'http://localhost:5175/map-dgfy/account')
};

const viewports = [
  { name: 'desktop', width: 1366, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

const artifactRoot = path.resolve(process.cwd(), '.tmp', 'rendered-qa', 'dgfy-access');
const evidencePath = path.join(artifactRoot, 'dgfy-access-ui-smoke.json');
const strictNetwork = String(process.env.DGFY_ACCESS_STRICT_NETWORK || '').toLowerCase() === 'true';
const forwardedProto = String(process.env.DGFY_ACCESS_FORWARDED_PROTO || '').trim();

const envPatterns = (name) => String(process.env[name] || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => new RegExp(entry, 'i'));

const checks = [
  {
    key: 'pos',
    label: 'POS DGFY lock drawer',
    expected: [
      /Terminal Login Required/i,
      /DGFY POS unlock/i,
      /Legacy access until June 17, 2027/i
    ],
    requiredLabels: [/DGFY Email/i, /DGFY Password/i, /Company/i, /Terminal ID/i],
    seededExpected: envPatterns('DGFY_ACCESS_POS_EXPECT_TEXT'),
    interact: async (page) => {
      const email = page.getByLabel('DGFY Email');
      await email.fill('cashier@example.test');
      const terminal = page.getByLabel(/Terminal ID/i).first();
      await terminal.fill('COUNTER-01').catch(async () => {});
    }
  },
  {
    key: 'dgfyAuth',
    label: 'DGFY auth entry',
    expected: [
      /DGFY/i,
      /sign in|log in|create account/i
    ],
    requiredLabels: [/email/i],
    seededExpected: envPatterns('DGFY_ACCESS_AUTH_EXPECT_TEXT'),
    interact: async (page) => {
      const email = page.getByLabel(/email/i).first();
      if (await email.count()) await email.focus();
    }
  },
  {
    key: 'dgfyAccount',
    label: 'DGFY account business surface',
    expected: [
      /DGFY|account|business|sign in/i
    ],
    requiredLabels: [],
    seededExpected: envPatterns('DGFY_ACCESS_ACCOUNT_EXPECT_TEXT'),
    interact: async () => {}
  }
];

const normalizeErrors = (errors) => errors.filter((entry) => {
  const text = `${entry.type || ''} ${entry.text || ''}`;
  if (/React Router Future Flag Warning/i.test(text)) return false;
  if (/GL Driver Message.*ReadPixels/i.test(text)) return false;
  if (/warning Expected value to be of type number, but found null instead/i.test(text)) return false;
  if (/Failed to load resource: the server responded with a status of (400|401|404)/i.test(text)) return false;
  if (!strictNetwork && /Failed to load resource: the server responded with a status of 5\d\d/i.test(text)) return false;
  return true;
});

const runCheck = async (browser, check, viewport) => {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile
  });
  if (forwardedProto) {
    await page.route((url) => {
      const hostname = url.hostname;
      const pathname = url.pathname;
      const port = url.port;
      const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
      return isLocalhost && (port === '5000' || pathname.startsWith('/api/'));
    }, async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-forwarded-proto': forwardedProto
        }
      });
    });
  }
  const consoleEntries = [];
  const responseFailures = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleEntries.push({ type: message.type(), text: message.text(), location: message.location() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEntries.push({ type: 'pageerror', text: error.message });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      responseFailures.push({
        status,
        url: response.url(),
        requestMethod: response.request().method()
      });
    }
  });

  const targetUrl = urls[check.key];
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(750);
  const title = await page.title();
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  await check.interact(page);
  const labelResults = [];
  for (const pattern of check.requiredLabels || []) {
    const count = await page.getByLabel(pattern).count().catch(() => 0);
    labelResults.push({ pattern: String(pattern), found: count > 0 });
  }

  const screenshotPath = path.join(artifactRoot, `${check.key}-${viewport.name}.png`);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const matched = check.expected.some((pattern) => pattern.test(bodyText));
  const seededMatches = (check.seededExpected || []).map((pattern) => ({
    pattern: String(pattern),
    matched: pattern.test(bodyText)
  }));
  const frameworkOverlay = /vite|webpack|react error|syntaxerror|referenceerror/i.test(bodyText)
    && /stack|plugin|module|compiled/i.test(bodyText);
  const errors = normalizeErrors(consoleEntries);
  const blockingResponseFailures = strictNetwork
    ? responseFailures.filter((entry) => entry.status >= 500)
    : [];
  await page.close();

  return {
    surface: check.key,
    label: check.label,
    viewport: viewport.name,
    url: targetUrl,
    title,
    nonblank: bodyText.trim().length > 0,
    expectedContent: matched,
    seededContent: seededMatches,
    labels: labelResults,
    frameworkOverlay,
    consoleErrors: errors,
    responseFailures,
    blockingResponseFailures,
    screenshotPath
  };
};

const run = async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const check of checks) {
      for (const viewport of viewports) {
        evidence.push(await runCheck(browser, check, viewport));
      }
    }
  } finally {
    await browser.close();
  }

  const failures = evidence.flatMap((entry) => {
    const failed = [];
    if (!entry.nonblank) failed.push(`${entry.surface}.${entry.viewport}.blank`);
    if (!entry.expectedContent) failed.push(`${entry.surface}.${entry.viewport}.expectedContent`);
    for (const label of entry.labels) {
      if (!label.found) failed.push(`${entry.surface}.${entry.viewport}.missingLabel=${label.pattern}`);
    }
    for (const seeded of entry.seededContent) {
      if (!seeded.matched) failed.push(`${entry.surface}.${entry.viewport}.missingSeededContent=${seeded.pattern}`);
    }
    if (entry.frameworkOverlay) failed.push(`${entry.surface}.${entry.viewport}.frameworkOverlay`);
    if (entry.consoleErrors.length > 0) failed.push(`${entry.surface}.${entry.viewport}.consoleErrors=${entry.consoleErrors.map((error) => error.text).join(' | ')}`);
    if (entry.blockingResponseFailures.length > 0) {
      failed.push(`${entry.surface}.${entry.viewport}.network=${entry.blockingResponseFailures.map((failure) => `${failure.status} ${failure.requestMethod} ${failure.url}`).join(' | ')}`);
    }
    return failed;
  });

  console.log('[dgfy-access-ui-smoke] evidence');
  const payload = {
    generatedAt: new Date().toISOString(),
    urls,
    artifactRoot,
    strictNetwork,
    forwardedProto: forwardedProto || null,
    evidence
  };
  await fs.writeFile(evidencePath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (failures.length > 0) {
    console.error(`[dgfy-access-ui-smoke] FAIL ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('[dgfy-access-ui-smoke] PASS');
};

run().catch((error) => {
  console.error('[dgfy-access-ui-smoke] failed:', error);
  process.exit(1);
});
