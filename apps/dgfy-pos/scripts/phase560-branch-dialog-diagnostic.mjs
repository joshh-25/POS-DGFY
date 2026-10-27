import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../dgfy-api/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e') });

const { chromium } = await import('@playwright/test');
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5174';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL
});
const page = await context.newPage();
const events = [];
const add = (event) => events.push({ atMs: Date.now() - startedAt, ...event });
const startedAt = Date.now();

await page.addInitScript(() => {
  for (const key of [
    'pos_terminal_locked_v1',
    'pos_terminal_lock_reason_v1',
    'pos_terminal_admin_lock_context_v1',
    'pos_terminal_identity_v1'
  ]) window.localStorage.removeItem(key);
  for (const eventName of ['auth:session-expired', 'auth:session-cleared', 'auth:logout']) {
    window.addEventListener(eventName, () => {
      window.__phase560AuthEvents = [...(window.__phase560AuthEvents || []), eventName];
    });
  }
});

page.on('response', (response) => {
  if ([400, 401, 403, 500, 502, 503, 504].includes(response.status())) {
    add({ type: 'response', status: response.status(), pathname: new URL(response.url()).pathname });
  }
});
page.on('pageerror', (error) => add({ type: 'pageerror', message: error.message }));
page.on('console', (message) => {
  if (message.type() === 'error') add({ type: 'console', message: message.text() });
});

const branch = page.getByTestId('pos-branch-selector-dialog');
const snapshot = async (label) => add({
  type: 'snapshot',
  label,
  url: page.url(),
  branchVisible: await branch.isVisible().catch(() => false),
  skipShiftVisible: await page.getByRole('button', { name: 'Skip for Admin', exact: true }).isVisible().catch(() => false),
  settingsVisible: await page.getByTestId('pos-nav-settings').isVisible().catch(() => false),
  dialogRoots: await page.locator('[data-dialog-root="true"]').evaluateAll((roots) => roots.map((root) => ({
    text: String(root.innerText || '').slice(0, 240),
    visible: Boolean(root.getBoundingClientRect().width && root.getBoundingClientRect().height)
  }))).catch(() => []),
  headings: await page.getByRole('heading').allTextContents().catch(() => []),
  authEvents: await page.evaluate(() => window.__phase560AuthEvents || []).catch(() => [])
});

try {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Terminal Login Required' }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByLabel('DGFY or Cashier Email').fill(process.env.E2E_TEST_USER_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.E2E_TEST_USER_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  const company = page.getByLabel('Company');
  await company.waitFor({ state: 'visible', timeout: 20_000 });
  const companyTagName = await company.evaluate((element) => element.tagName.toLowerCase());
  if (companyTagName === 'select') {
    await company.selectOption({ label: process.env.E2E_TEST_COMPANY_NAME });
  } else {
    await company.click();
    await page.getByRole('option').filter({ hasText: process.env.E2E_TEST_COMPANY_NAME }).first().click();
  }
  const tenantSession = page.waitForResponse(
    (response) => /\/api\/v1\/dgfy\/auth\/tenant-session$/.test(new URL(response.url()).pathname),
    { timeout: 20_000 }
  );
  await page.getByRole('button', { name: /^continue to pos$/i }).click();
  await tenantSession;
  await snapshot('after-goto');
  await branch.waitFor({ state: 'visible', timeout: 20_000 });
  await snapshot('branch-opened');
  await branch.getByRole('button', { name: 'Close', exact: true }).click();
  await branch.waitFor({ state: 'hidden', timeout: 8_000 });
  await snapshot('after-close');
  const skipShift = page.getByRole('button', { name: 'Skip for Admin', exact: true });
  if (await skipShift.isVisible().catch(() => false)) {
    await skipShift.click();
    await skipShift.waitFor({ state: 'hidden', timeout: 8_000 });
    await snapshot('after-skip-shift');
  }
  const settingsButton = page.getByTestId('pos-nav-settings');
  await settingsButton.click();
  await page.waitForTimeout(1500);
  await snapshot('after-settings-click');
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(250);
    if (i % 4 === 3) await snapshot(`poll-${(i + 1) * 250}ms`);
  }
  await snapshot('after-10s');
} catch (error) {
  add({ type: 'failure', message: error instanceof Error ? error.message.split('\n')[0] : String(error) });
  await snapshot('failure');
} finally {
  console.log(JSON.stringify({ events }));
  await context.close();
  await browser.close();
}
