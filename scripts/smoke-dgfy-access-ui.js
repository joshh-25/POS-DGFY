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

const checks = [
  {
    key: 'pos',
    label: 'POS DGFY lock drawer',
    expected: [
      /Terminal Login Required/i,
      /DGFY POS unlock/i,
      /Legacy access until June 17, 2027/i
    ],
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
    interact: async (page) => {
      const email = page.getByLabel(/email/i).first();
      if (await email.count()) await email.fill('qa@example.test');
    }
  },
  {
    key: 'dgfyAccount',
    label: 'DGFY account business surface',
    expected: [
      /DGFY|account|business|sign in/i
    ],
    interact: async () => {}
  }
];

const normalizeErrors = (errors) => errors.filter((entry) => {
  const text = `${entry.type || ''} ${entry.text || ''}`;
  return !/Failed to load resource: the server responded with a status of (400|401|404)/i.test(text);
});

const runCheck = async (browser, check, viewport) => {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile
  });
  const consoleEntries = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleEntries.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEntries.push({ type: 'pageerror', text: error.message });
  });

  const targetUrl = urls[check.key];
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(750);
  const title = await page.title();
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  await check.interact(page);

  const screenshotPath = path.join(artifactRoot, `${check.key}-${viewport.name}.png`);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const matched = check.expected.some((pattern) => pattern.test(bodyText));
  const frameworkOverlay = /vite|webpack|react error|syntaxerror|referenceerror/i.test(bodyText)
    && /stack|plugin|module|compiled/i.test(bodyText);
  const errors = normalizeErrors(consoleEntries);
  await page.close();

  return {
    surface: check.key,
    label: check.label,
    viewport: viewport.name,
    url: targetUrl,
    title,
    nonblank: bodyText.trim().length > 0,
    expectedContent: matched,
    frameworkOverlay,
    consoleErrors: errors,
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
    if (entry.frameworkOverlay) failed.push(`${entry.surface}.${entry.viewport}.frameworkOverlay`);
    if (entry.consoleErrors.length > 0) failed.push(`${entry.surface}.${entry.viewport}.consoleErrors=${entry.consoleErrors.map((error) => error.text).join(' | ')}`);
    return failed;
  });

  console.log('[dgfy-access-ui-smoke] evidence');
  console.log(JSON.stringify({ urls, artifactRoot, evidence }, null, 2));
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
