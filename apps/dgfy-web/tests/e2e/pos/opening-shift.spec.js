import { test, expect } from '@playwright/test';
import { signIn } from '../fixtures/login.js';
import { hasTestCredentials, testCredentials } from '../fixtures/test-credentials.js';

const shiftFlowEnabled = process.env.E2E_SHIFT_FLOW_ENABLED === 'true';

function registerOpeningShiftDiagnostics(page) {
  const diagnostics = [];
  const authHeaders = {};
  page.on('request', (request) => {
    if (!request.url().includes('/api/v1/') || request.url().includes('/api/v1/dgfy/')) return;
    const headers = request.headers();
    if (headers.authorization) authHeaders.authorization = headers.authorization;
    if (headers['x-company-token']) authHeaders['x-company-token'] = headers['x-company-token'];
  });
  page.on('pageerror', (error) => diagnostics.push({ type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push({ type: 'console.error', message: message.text() });
  });
  page.on('requestfailed', (request) => diagnostics.push({
    type: 'requestfailed',
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText || 'unknown request failure'
  }));
  page.on('response', async (response) => {
    if (response.status() >= 400) {
      const entry = {
        type: 'http',
        status: response.status(),
        method: response.request().method(),
        url: response.url()
      };
      if (response.status() >= 500 || response.url().includes('/dgfy/auth/tenant-session')) {
        try {
          const body = await response.json();
          entry.error_code = body?.error_code || body?.code || null;
          entry.message = body?.message || body?.error || null;
        } catch {
          // The response may not be JSON; keep the URL and status evidence.
        }
      }
      diagnostics.push(entry);
    }
  });
  return { diagnostics, authHeaders };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function closeCreatedShift(request, headers, shiftId, closingCashAmount) {
  const response = await request.post(`/api/v1/pos/terminal/shifts/${shiftId}/close`, {
    headers,
    data: {
      idempotency_key: `e2e-close-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      closing_cash_amount: closingCashAmount,
      closing_note: 'Playwright opening-shift verification cleanup'
    }
  });
  const body = await readJson(response);
  expect(response.status(), `cleanup close-shift failed: ${JSON.stringify(body)}`).toBe(200);
}

test.describe('POS opening-shift flow', () => {
  test('admin/cashier opening policy and terminal state work without runtime errors', async ({ page }, testInfo) => {
    test.skip(!shiftFlowEnabled, 'Set E2E_SHIFT_FLOW_ENABLED=true to run the state-changing opening-shift flow.');
    test.skip(!hasTestCredentials, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');

    const instrumentation = registerOpeningShiftDiagnostics(page);
    const { diagnostics, authHeaders } = instrumentation;
    let createdShiftId = null;
    let createdOpeningCash = 0;

    try {
      await signIn(page, testCredentials);
      await expect(page.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();

      await expect.poll(() => Boolean(authHeaders.authorization), { timeout: 15_000 }).toBe(true);
      const userResponse = await page.request.get('/api/v1/users/me', { headers: authHeaders });
      const userBody = await readJson(userResponse);
      expect(userResponse.status(), `current-user request failed: ${JSON.stringify(userBody)}`).toBe(200);
      const user = userBody?.data || {};
      const permissions = Array.isArray(user.permissions) ? user.permissions : [];
      const readOnlyAdmin = user.is_master_admin !== true && permissions.includes('settings:view');

      const currentResponse = await page.request.get('/api/v1/pos/terminal/shifts/current', { headers: authHeaders });
      const currentBody = await readJson(currentResponse);
      expect(currentResponse.status(), `current-shift request failed: ${JSON.stringify(currentBody)}`).toBe(200);
      const currentShift = currentBody?.data?.shift || null;

      if (currentShift) {
        await page.getByRole('button', { name: /^Shift/ }).click();
        await expect(page.getByRole('button', { name: 'Close Shift', exact: true })).toBeVisible();
        return;
      }

      const incomingQueueEnabled = await page
        .getByRole('button', { name: /^Orders \(/ })
        .isVisible()
        .catch(() => false);

      const existingOpenShiftDialog = page.locator('div.fixed.inset-0').filter({ hasText: 'No open shift is active.' }).last();
      const dialogAppeared = await existingOpenShiftDialog
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!dialogAppeared) {
        await page.getByRole('button', { name: /^Shift/ }).click();
        await expect(page.getByText('Open Shift', { exact: true }).last()).toBeVisible();
      }

      const activeDialog = page.locator('div.fixed.inset-0').filter({ hasText: 'No open shift is active.' }).last();
      const scope = await activeDialog.isVisible().catch(() => false) ? activeDialog : page.locator('body');
      const readOnlyMessage = scope.getByText('Administrator navigation is read-only. A cashier must open the shift.', { exact: true }).last();
      const openButton = scope.getByRole('button', { name: 'Open Shift', exact: true }).last();

      if (readOnlyAdmin) {
        await expect(readOnlyMessage).toBeVisible();
        await expect(openButton).toBeDisabled();
        return;
      }

      await expect(openButton).toBeVisible();
      const openingInput = scope.locator('input[placeholder="0.00"]:visible').last();
      await expect(openingInput).toBeVisible();
      createdOpeningCash = 1000.01;
      await openingInput.fill(String(createdOpeningCash));
      await expect(openButton).toBeEnabled();

      const incomingQueueResponsePromise = incomingQueueEnabled
        ? page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname.endsWith('/api/v1/pos/incoming-orders')
            && Number(url.searchParams.get('shift_id')) > 0
            && Number(url.searchParams.get('location_id')) > 0;
        }, { timeout: 15_000 }).catch(() => null)
        : Promise.resolve(null);

      const openResponsePromise = page.waitForResponse(
        (response) => /\/api\/v1\/pos\/terminal\/shifts\/open$/.test(new URL(response.url()).pathname),
        { timeout: 15_000 }
      );
      await openButton.click();
      const openResponse = await openResponsePromise;
      const openBody = await readJson(openResponse);

      expect(openResponse.status(), `open-shift request failed: ${JSON.stringify(openBody)}`).toBe(200);
      createdShiftId = openBody?.data?.shift?.pos_terminal_shift_id;
      expect(createdShiftId, `open-shift response omitted shift id: ${JSON.stringify(openBody)}`).toBeTruthy();
      const openedCurrentResponse = await page.request.get('/api/v1/pos/terminal/shifts/current', { headers: authHeaders });
      const openedCurrentBody = await readJson(openedCurrentResponse);
      expect(openedCurrentResponse.status(), `opened shift could not be read back: ${JSON.stringify(openedCurrentBody)}`).toBe(200);
      expect(openedCurrentBody?.data?.shift?.pos_terminal_shift_id).toBe(createdShiftId);

      if (incomingQueueEnabled) {
        const incomingQueueResponse = await incomingQueueResponsePromise;
        expect(incomingQueueResponse, 'newly opened shift did not trigger an incoming queue refresh').toBeTruthy();
        expect(incomingQueueResponse.status()).toBe(200);
      }
    } finally {
      if (createdShiftId) {
        await closeCreatedShift(page.request, authHeaders, createdShiftId, createdOpeningCash);
      }
      await testInfo.attach('opening-shift-diagnostics.json', {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: 'application/json'
      });
      const unexpectedDiagnostics = diagnostics.filter((entry) => !(
        entry.type === 'http'
        && entry.status === 401
        && entry.method === 'GET'
        && entry.url.endsWith('/api/v1/pos/device/status')
      ) && !(entry.type === 'console.error' && entry.message === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)')
        && !(entry.type === 'requestfailed' && entry.error === 'net::ERR_ABORTED'));
      expect(unexpectedDiagnostics, `runtime diagnostics detected: ${JSON.stringify(unexpectedDiagnostics)}`).toEqual([]);
    }
  });
});
