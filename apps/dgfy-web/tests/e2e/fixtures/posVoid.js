import { expect } from '@playwright/test';
import { signIn } from './login.js';

const TERMINAL_STORAGE_KEY = 'pos_terminal_identity_v1';

export const POS_VOID_FLOW_ENABLED = process.env.E2E_POS_VOID_FLOW_ENABLED === 'true';
export const POS_VOID_STALE_SHIFT_CLEANUP_ENABLED = process.env.E2E_POS_VOID_CLEAN_STALE_SHIFT === 'true';
export const POS_VOID_TERMINAL_ID = String(process.env.E2E_POS_VOID_TERMINAL_ID || '').trim().toUpperCase();
export const POS_VOID_ADMIN_CREDENTIALS = {
    email: String(process.env.E2E_POS_VOID_ADMIN_EMAIL || '').trim(),
    password: process.env.E2E_POS_VOID_ADMIN_PASSWORD || ''
};
export const POS_VOID_CASHIER_CREDENTIALS = {
    email: String(process.env.E2E_POS_VOID_CASHIER_EMAIL || '').trim(),
    password: process.env.E2E_POS_VOID_CASHIER_PASSWORD || ''
};

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;

export const getPosVoidFlowPrerequisiteReport = () => {
    const missing = [];
    if (!POS_VOID_FLOW_ENABLED) missing.push('E2E_POS_VOID_FLOW_ENABLED=true');
    if (!hasValue(POS_VOID_TERMINAL_ID)) missing.push('E2E_POS_VOID_TERMINAL_ID');
    if (!hasValue(POS_VOID_ADMIN_CREDENTIALS.email)) missing.push('E2E_POS_VOID_ADMIN_EMAIL');
    if (!hasValue(POS_VOID_ADMIN_CREDENTIALS.password)) missing.push('E2E_POS_VOID_ADMIN_PASSWORD');
    if (!hasValue(POS_VOID_CASHIER_CREDENTIALS.email)) missing.push('E2E_POS_VOID_CASHIER_EMAIL');
    if (!hasValue(POS_VOID_CASHIER_CREDENTIALS.password)) missing.push('E2E_POS_VOID_CASHIER_PASSWORD');

    return {
        ready: missing.length === 0,
        missing,
        message: missing.length === 0
            ? 'Reusable POS administrator-void E2E prerequisites are ready.'
            : `Reusable POS administrator-void E2E is disabled or incomplete. Configure: ${missing.join(', ')}.`
    };
};

export const hasPosVoidFlowPrerequisites = getPosVoidFlowPrerequisiteReport().ready;

const parseJsonResponse = async (response) => {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
};

export const capturePosAuthHeaders = (page) => {
    const authHeaders = {};
    page.on('request', (request) => {
        if (!request.url().includes('/api/v1/') || request.url().includes('/api/v1/dgfy/')) return;
        const headers = request.headers();
        if (headers.authorization) authHeaders.authorization = headers.authorization;
        if (headers['x-company-token']) authHeaders['x-company-token'] = headers['x-company-token'];
    });
    return authHeaders;
};

export const signInPosVoidActor = async (page, credentials) => {
    await page.addInitScript(({ terminalId, storageKey }) => {
        window.localStorage.setItem(storageKey, terminalId);
    }, { terminalId: POS_VOID_TERMINAL_ID, storageKey: TERMINAL_STORAGE_KEY });

    const authHeaders = capturePosAuthHeaders(page);
    await signIn(page, credentials);
    await expect.poll(
        () => Boolean(authHeaders.authorization && authHeaders['x-company-token']),
        { timeout: 15_000, message: 'POS API authentication headers were not observed.' }
    ).toBe(true);
    return authHeaders;
};

export const skipPosAdminShiftPrompt = async (page) => {
    const skipButton = page.getByRole('button', { name: 'Skip for Admin', exact: true });
    const promptVisible = await skipButton.waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
    if (promptVisible) {
        await skipButton.click();
        await expect(skipButton).toBeHidden({ timeout: 10_000 });
        await expect(page.getByRole('heading', { name: 'Shift Controls', exact: true }))
            .toBeVisible({ timeout: 10_000 });
    }
};

export const resumePosVoidShift = async (page) => {
    const resumeButton = page.getByRole('button', { name: 'Resume Shift', exact: true });
    const promptVisible = await resumeButton.waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
    if (promptVisible) {
        await expect(resumeButton).toBeEnabled();
        await resumeButton.click();
        await expect(resumeButton).toBeHidden({ timeout: 10_000 });
    }
};

export const dismissPosStockAlert = async (page) => {
    const stockAlert = page.getByRole('dialog').filter({ hasText: 'Stock Alert' });
    const stockAlertVisible = await stockAlert.waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
    if (stockAlertVisible) {
        await stockAlert.getByRole('button', { name: 'Dismiss', exact: true }).click();
        await expect(stockAlert).toBeHidden({ timeout: 10_000 });
    }
};

export const selectPosVoidAdminTerminal = async (page, locationId) => {
    const locationSelect = page.getByLabel('Operating Location');
    await expect(locationSelect).toBeVisible();
    await locationSelect.selectOption(String(locationId));

    const terminalSelect = page.getByLabel('Branch Terminal');
    await expect.poll(
        () => terminalSelect.locator(`option[value="${POS_VOID_TERMINAL_ID}"]`).count(),
        { timeout: 10_000, message: 'The reusable POS void terminal was not listed for the selected location.' }
    ).toBeGreaterThan(0);
    await terminalSelect.selectOption(POS_VOID_TERMINAL_ID);

    const selectButton = page.getByRole('button', { name: 'Use Selected Terminal', exact: true });
    const selectedTerminalId = await terminalSelect.inputValue();
    if (selectedTerminalId === POS_VOID_TERMINAL_ID) {
        await expect(page.getByText(`Current terminal: ${POS_VOID_TERMINAL_ID}`, { exact: true }))
            .toBeVisible();
        return;
    }
    await expect(selectButton).toBeEnabled();
    await selectButton.click();

    const confirmationDialog = page.getByRole('dialog');
    await expect(confirmationDialog).toBeVisible();
    await confirmationDialog.getByRole('button', { name: 'Use Terminal', exact: true }).click();
    await expect.poll(
        () => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), TERMINAL_STORAGE_KEY),
        { timeout: 15_000, message: 'POS did not persist the selected reusable terminal.' }
    ).toBe(POS_VOID_TERMINAL_ID);

    await dismissPosStockAlert(page);
};

export const posRequest = async (page, authHeaders, method, endpoint, data = undefined) => {
    const response = await page.request.fetch(endpoint, {
        method,
        headers: {
            ...authHeaders,
            'x-pos-terminal-id': POS_VOID_TERMINAL_ID
        },
        ...(data === undefined ? {} : { data })
    });
    return { response, body: await parseJsonResponse(response) };
};

export const expectPosResponse = ({ response, body }, expectedStatus, label) => {
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    expect(
        expectedStatuses,
        `${label} failed with ${response.status()}: ${JSON.stringify(body)}`
    ).toContain(response.status());
};

export const getPosUser = async (page, authHeaders) => {
    const result = await posRequest(page, authHeaders, 'GET', '/api/v1/users/me');
    expectPosResponse(result, 200, 'POS user lookup');
    return result.body?.data || {};
};

export const getRegisteredTerminal = async (page, authHeaders) => {
    const result = await posRequest(page, authHeaders, 'GET', '/api/v1/pos/terminal/paired');
    expectPosResponse(result, 200, 'registered terminal lookup');
    return result.body?.data || {};
};

export const getTerminalShiftState = async (page, authHeaders, locationId = null) => {
    const query = new URLSearchParams({ terminal_id: POS_VOID_TERMINAL_ID });
    if (locationId) query.set('location_id', String(locationId));
    const result = await posRequest(page, authHeaders, 'GET', `/api/v1/pos/terminal/shifts/current?${query}`);
    expectPosResponse(result, 200, 'current shift lookup');
    return result.body?.data || {};
};

export const getCurrentShift = async (page, authHeaders, locationId = null) => {
    const state = await getTerminalShiftState(page, authHeaders, locationId);
    return state.shift || null;
};

export const openPosVoidTestShift = async (page, authHeaders, locationId, openingFloatAmount = 0) => {
    const result = await posRequest(page, authHeaders, 'POST', '/api/v1/pos/terminal/shifts/open', {
        idempotency_key: `e2e-pos-void-open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        terminal_id: POS_VOID_TERMINAL_ID,
        location_id: Number(locationId),
        opening_float_amount: Number(openingFloatAmount || 0),
        opening_note: 'Reusable administrator void E2E fixture'
    });
    expectPosResponse(result, 200, 'test shift opening');
    return result.body?.data?.shift || result.body?.data || {};
};

export const closePosVoidTestShift = async (page, authHeaders, shiftId, closingCashAmount = 0) => {
    const result = await posRequest(page, authHeaders, 'POST', `/api/v1/pos/terminal/shifts/${shiftId}/close`, {
        idempotency_key: `e2e-pos-void-close-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        closing_cash_amount: Number(closingCashAmount || 0),
        closing_note: 'Reusable administrator void E2E fixture cleanup'
    });
    expectPosResponse(result, 200, 'test shift close');
    return result.body?.data?.shift || result.body?.data || {};
};

export const createPosVoidTrainingSale = async (page, authHeaders, shift, locationId) => {
    const catalogResult = await posRequest(
        page,
        authHeaders,
        'GET',
        `/api/v1/pos/catalog?location_id=${encodeURIComponent(locationId)}`
    );
    expectPosResponse(catalogResult, 200, 'POS catalog lookup');
    const item = (Array.isArray(catalogResult.body?.data) ? catalogResult.body.data : [])
        .find((candidate) => (
            Number.isInteger(Number(candidate?.item_id))
            && Number(candidate.item_id) > 0
            && Number(candidate.current_stock) > 0
        ));
    expect(
        item,
        'The sandbox POS catalog must contain at least one active item with positive current_stock.'
    ).toBeTruthy();

    const checkoutResult = await posRequest(page, authHeaders, 'POST', '/api/v1/pos/checkouts', {
        idempotency_key: `e2e-pos-void-checkout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        terminal_id: POS_VOID_TERMINAL_ID,
        shift_id: Number(shift.pos_terminal_shift_id),
        location_id: Number(locationId),
        order_method: 'dine_in',
        payment_type: 'cash',
        document_context: 'training_test',
        lines: [{
            item_id: Number(item.item_id),
            quantity: 1
        }]
    });
    expectPosResponse(checkoutResult, [200, 201], 'training POS checkout');
    const transaction = checkoutResult.body?.data?.transaction
        || checkoutResult.body?.data?.pos_transaction
        || checkoutResult.body?.data;
    const transactionId = Number(transaction?.pos_transaction_id || transaction?.id);
    expect(transactionId, `Checkout response did not contain a transaction ID: ${JSON.stringify(checkoutResult.body)}`).toBeGreaterThan(0);
    return transaction;
};
