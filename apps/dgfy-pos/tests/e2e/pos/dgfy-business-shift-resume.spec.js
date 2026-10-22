import { expect, test } from '@playwright/test';
import { hasTestCredentials, testCredentials } from '../fixtures/test-credentials.js';

const storefrontUrl = process.env.STOREFRONT_URL || 'http://localhost:5175';
const companyName = String(process.env.E2E_TEST_COMPANY_NAME || '').trim();

// Synthetic resume fixture: controlled test data only, never production shift
// data. The shift ID is intentionally unrealistic (987654321) so a leak into
// real data would be obvious.
const RESUMED_SHIFT_ID = 987654321;
const RESUMED_OPENING_FLOAT = 2000;
const RESUMED_TERMINAL_ID = 'COUNTER-01';
const RESUMED_LOCATION_ID = 1;

test.use({ serviceWorkers: 'block' });

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function registerRuntimeDiagnostics(page, diagnostics) {
  page.on('pageerror', (error) => diagnostics.push({ type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.push({
        type: 'console.error',
        message: message.text(),
        url: message.location().url || null
      });
    }
  });
  page.on('requestfailed', (request) => diagnostics.push({
    type: 'requestfailed',
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText || 'unknown request failure'
  }));
  page.on('response', (response) => {
    if (response.status() >= 500 || (
      response.status() === 401
      && new URL(response.url()).pathname.endsWith('/api/v1/pos/device/status')
    )) {
      diagnostics.push({
        type: 'http',
        status: response.status(),
        method: response.request().method(),
        url: response.url()
      });
    }
  });
}

function assertCleanDiagnostics(diagnostics, { allowSyntheticShiftLookupFailures = false } = {}) {
  const isExpectedShiftLookupFailure = (entry) => {
    if (!allowSyntheticShiftLookupFailures) return false;
    if (entry.type === 'http'
      && entry.status === 500
      && new URL(entry.url).pathname === '/api/v1/pos/terminal/shifts/current') {
      return true;
    }
    if (entry.type === 'console.error'
      && /^Failed to load resource: the server responded with a status of 500/.test(entry.message)) {
      return true;
    }
    return false;
  };
  const deviceStatusUnauthorized = diagnostics.some((entry) => (
    entry.type === 'http'
    && entry.status === 401
    && new URL(entry.url).pathname.endsWith('/api/v1/pos/device/status')
  ));
  const unexpectedDiagnostics = diagnostics.filter((entry) => isExpectedShiftLookupFailure(entry) ? false : !(
    entry.type === 'http'
    && entry.status === 401
    && new URL(entry.url).pathname.endsWith('/api/v1/pos/device/status')
  ) && !(
    deviceStatusUnauthorized
    && entry.type === 'console.error'
    && entry.message === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
  ) && !(
    entry.type === 'requestfailed'
    && entry.method === 'GET'
    && entry.error === 'net::ERR_ABORTED'
    && [
      '/api/v1/pos/catalog/events',
      '/api/v1/items/folders',
      '/api/v1/storefront/discovery',
      '/api/v1/dgfy/customer/events'
    ].includes(new URL(entry.url).pathname)
  ) && !(
    entry.type === 'requestfailed'
    && entry.method === 'GET'
    && entry.error === 'net::ERR_BLOCKED_BY_ORB'
    && new URL(entry.url).pathname.startsWith('/uploads/storefront-assets/')
  ) && !(
    entry.type === 'console.error'
    && entry.message === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
    && entry.url
    && [
      '/uploads/storefront-assets/',
      '/uploads/storefront-catalog/'
    ].some((pathPrefix) => new URL(entry.url).pathname.startsWith(pathPrefix))
  ));
  expect(
    unexpectedDiagnostics,
    `runtime diagnostics detected: ${JSON.stringify(unexpectedDiagnostics)}`
  ).toEqual([]);
}

// Shared DGFY Business handoff: real Storefront login, then every POS API the
// resume flow touches is served from the synthetic fixture above. Returns the
// opened POS page plus request trackers and a switch to flip the current-shift
// lookup between success and failure.
async function reachResumeShiftScreen({ context, page }) {
  const diagnostics = [];
  registerRuntimeDiagnostics(page, diagnostics);
  const trackers = {
    shiftOpenPosts: [],
    currentShiftGets: [],
    currentShiftState: { mode: 'success' }
  };
  context.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'POST' && pathname === '/api/v1/pos/terminal/shifts/open') {
      trackers.shiftOpenPosts.push(request.url());
    }
    if (request.method() === 'GET' && pathname === '/api/v1/pos/terminal/shifts/current') {
      trackers.currentShiftGets.push(request.url());
    }
  });

  const accountPath = '/map-dgfy/account';
  await page.goto(`${storefrontUrl}/login?return_to=${encodeURIComponent(accountPath)}`, {
    waitUntil: 'domcontentloaded'
  });
  await expect(page.getByRole('heading', { name: 'Login your DGFY Account' })).toBeVisible();
  await page.locator('#dgfyLoginEmail').fill(testCredentials.email);
  await page.locator('#dgfyLoginPassword').fill(testCredentials.password);
  const loginResponsePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/dgfy/auth/login'
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  await page.goto(`${storefrontUrl}${accountPath}`, { waitUntil: 'domcontentloaded' });

  const companiesResponse = await page.request.get('/api/v1/dgfy/account/companies');
  expect(companiesResponse.status()).toBe(200);
  const companiesPayload = await readJson(companiesResponse);
  const company = (companiesPayload?.data?.companies || [])
    .find((entry) => String(entry?.company_name || '').trim() === companyName);
  expect(company, `DGFY account cannot access ${companyName}.`).toBeTruthy();

  const activeTerminal = {
    terminal_id: RESUMED_TERMINAL_ID,
    location_id: RESUMED_LOCATION_ID,
    is_active: true,
    is_default: true
  };

  const cashierUserPayload = {
    success: true,
    data: {
      user_id: Number(company?.tenant_user_id || 1),
      username: testCredentials.email.split('@')[0],
      email: testCredentials.email,
      role: 'cashier',
      is_master_admin: false,
      permissions: ['pos:view', 'pos:transact', 'pos:shift_open', 'pos:shift_close'],
      company: {
        id: company.tenant_id,
        name: companyName
      }
    },
    message: 'User profile retrieved successfully'
  };
  const settingsPayload = {
    success: true,
    data: {
      settings: {
        pos_terminal_registry: { value: [activeTerminal] },
        pos_terminal_registry_mode: { value: 'enforce' }
      }
    }
  };
  const activeShiftPayload = {
    success: true,
    data: {
      shift: {
        pos_terminal_shift_id: RESUMED_SHIFT_ID,
        cashier_id: Number(company?.tenant_user_id || 1),
        terminal_id: activeTerminal.terminal_id,
        location_id: Number(activeTerminal.location_id),
        opening_float_amount: RESUMED_OPENING_FLOAT,
        status: 'open'
      },
      cash_summary: null
    }
  };
  const businessHeading = page.getByRole('heading', { name: 'Your businesses', exact: true });
  if (!(await businessHeading.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Business/ }).click();
  }
  await expect(businessHeading).toBeVisible();

  const companyCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: companyName, exact: true })
  });
  await expect(companyCard).toBeVisible();
  await companyCard.getByRole('button', { name: 'Go to POS', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open DGFY POS?' })).toBeVisible();
  diagnostics.length = 0;
  await context.route('**/api/v1/users/me*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(cashierUserPayload)
  }));
  await context.route('**/api/v1/mobile-pos/bootstrap/settings*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(settingsPayload)
  }));
  await context.route('**/api/v1/pos/terminal/shifts/current*', (route) => {
    if (trackers.currentShiftState.mode === 'failure') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Synthetic current-shift lookup failure for the shift-resume regression.'
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(activeShiftPayload)
    });
  });
  // A shift-open request must never fire during resume. Fulfill (not abort) so
  // a regression fails on the explicit request assertion below instead of on
  // incidental requestfailed noise, and so no real shift can be created.
  await context.route('**/api/v1/pos/terminal/shifts/open*', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({
      success: false,
      message: 'Synthetic guard: shift open is forbidden during the resume regression.'
    })
  }));
  await context.route('**/api/v1/dgfy/account/companies/*/pos-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        token: 'e2e-tenant-session-token',
        user_id: Number(company?.tenant_user_id || 1),
        username: testCredentials.email.split('@')[0],
        email: testCredentials.email,
        role: 'cashier',
        permissions: ['pos:view', 'pos:transact', 'pos:shift_open', 'pos:shift_close'],
        company: {
          id: company.tenant_id,
          token: company.company_token,
          name: companyName
        }
      }
    })
  }));
  await context.route('**/api/v1/pos/terminal/dashboard/today*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        active_shift: activeShiftPayload.data.shift,
        active_shift_cash_summary: null,
        business_date: '2026-09-29',
        sales_summary: null
      }
    })
  }));

  context.on('page', (openedPage) => registerRuntimeDiagnostics(openedPage, diagnostics));
  const newPosPagePromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open POS in new tab', exact: true }).click();
  const newPosPage = await newPosPagePromise;
  await newPosPage.waitForLoadState('domcontentloaded');

  await expect(newPosPage.getByRole('heading', { name: 'POS Catalog' })).toBeVisible();
  const branchSelectorDialog = newPosPage.getByTestId('pos-branch-selector-dialog');
  await expect(branchSelectorDialog).toBeVisible();
  await expect(branchSelectorDialog.getByRole('button', { name: 'Resume Shift', exact: true })).toBeVisible();
  await expect(newPosPage.getByRole('heading', { name: 'Resume Shift', exact: true })).toHaveCount(0);
  await expect(newPosPage.getByRole('heading', { name: 'Open Shift', exact: true })).toHaveCount(0);

  return { newPosPage, branchSelectorDialog, trackers, diagnostics };
}

test.describe('DGFY Business active-shift handoff', () => {
  test('resumes the same shift into usable checkout without opening a replacement shift', async ({ context, page }, testInfo) => {
    test.skip(!hasTestCredentials, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');
    test.skip(!companyName, 'E2E_TEST_COMPANY_NAME is required.');

    const { newPosPage, branchSelectorDialog, trackers, diagnostics } = await reachResumeShiftScreen({ context, page });

    try {
      const currentShiftGetsBeforeResume = trackers.currentShiftGets.length;
      await branchSelectorDialog.getByRole('button', { name: 'Resume Shift', exact: true }).click();
      await expect(branchSelectorDialog).toHaveCount(0);
      await expect(newPosPage.getByRole('heading', { name: 'Open Shift', exact: true })).toHaveCount(0);

      // #2129: the cashier must land on usable checkout with the original
      // shift identity and opening cash, not just a closed dialog.
      await expect(
        newPosPage.getByRole('heading', { name: 'POS Catalog' }),
        'cashier shift-resume must reach usable checkout after Resume Shift'
      ).toBeVisible();
      expect(
        trackers.currentShiftGets.length,
        'cashier shift-resume must confirm the shift with a current-shift lookup after Resume Shift'
      ).toBeGreaterThan(currentShiftGetsBeforeResume);
      expect(
        trackers.shiftOpenPosts,
        'cashier shift-resume must not open a replacement shift during resume'
      ).toEqual([]);

      await newPosPage.getByRole('button', { name: /^Shift/ }).click();
      await expect(newPosPage.getByRole('heading', { name: 'Shift Controls' })).toBeVisible();
      await expect(newPosPage.getByText('Shift ID:')).toBeVisible();
      await expect(
        newPosPage.getByText(`#${RESUMED_SHIFT_ID}`),
        'cashier shift-resume must preserve the original shift identity'
      ).toBeVisible();
      await expect(newPosPage.getByText('Opening/Petty Cash:')).toBeVisible();
      await expect(
        newPosPage.getByText(`PHP ${RESUMED_OPENING_FLOAT}.00`),
        'cashier shift-resume must preserve the original opening cash'
      ).toBeVisible();
    } finally {
      await testInfo.attach('dgfy-business-shift-resume-diagnostics.json', {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: 'application/json'
      });
      assertCleanDiagnostics(diagnostics);
    }
  });

  test('keeps a failed shift lookup retryable without success or a replacement shift', async ({ context, page }, testInfo) => {
    test.skip(!hasTestCredentials, 'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required.');
    test.skip(!companyName, 'E2E_TEST_COMPANY_NAME is required.');

    const { newPosPage, branchSelectorDialog, trackers, diagnostics } = await reachResumeShiftScreen({ context, page });

    try {
      trackers.currentShiftState.mode = 'failure';
      await branchSelectorDialog.getByRole('button', { name: 'Resume Shift', exact: true }).click();
      const resumeShiftDialog = newPosPage.getByRole('dialog').filter({
        has: newPosPage.getByRole('heading', { name: 'Resume Shift', exact: true })
      });
      await expect(resumeShiftDialog).toBeVisible();
      await resumeShiftDialog.getByRole('button', { name: 'Resume Shift', exact: true }).click();

      // The failed confirmation must restore the retryable resume prompt: no
      // success, no opening-cash form as if a new shift were needed, and no
      // shift-open request.
      await expect(
        newPosPage.getByRole('heading', { name: 'Resume Shift', exact: true }),
        'failed shift lookup must keep the Resume Shift prompt retryable'
      ).toBeVisible();
      await expect(newPosPage.getByRole('heading', { name: 'Open Shift', exact: true })).toHaveCount(0);
      await expect(
        newPosPage.getByText('No new shift or opening cash is needed', { exact: false }),
        'failed shift lookup must explain that no new shift or opening cash is needed'
      ).toBeVisible();
      expect(
        trackers.shiftOpenPosts,
        'failed shift lookup must not open a replacement shift'
      ).toEqual([]);

      // Recovery: with the lookup healthy again, the same prompt resumes.
      trackers.currentShiftState.mode = 'success';
      trackers.shiftOpenPosts.length = 0;
      await resumeShiftDialog.getByRole('button', { name: 'Resume Shift', exact: true }).click();
      await expect(resumeShiftDialog).toHaveCount(0);
      await expect(newPosPage.getByRole('heading', { name: 'Open Shift', exact: true })).toHaveCount(0);
      await expect(
        newPosPage.getByRole('heading', { name: 'POS Catalog' }),
        'cashier shift-resume must recover into usable checkout after the lookup heals'
      ).toBeVisible();
      expect(
        trackers.shiftOpenPosts,
        'cashier shift-resume recovery must not open a replacement shift'
      ).toEqual([]);
    } finally {
      await testInfo.attach('dgfy-business-shift-resume-failed-lookup-diagnostics.json', {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: 'application/json'
      });
      assertCleanDiagnostics(diagnostics, { allowSyntheticShiftLookupFailures: true });
    }
  });
});
