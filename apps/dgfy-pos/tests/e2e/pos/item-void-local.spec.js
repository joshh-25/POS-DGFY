import { test, expect } from '@playwright/test';

const TERMINAL_ID = String(process.env.E2E_POS_VOID_TERMINAL_ID || 'JOHN-01').trim().toUpperCase();
const OPERATOR_PIN = String(process.env.E2E_POS_VOID_OPERATOR_PIN || '').trim();
const REFUND_PASSCODE = String(process.env.E2E_POS_REFUND_PASSCODE || '').trim();
const TEST_REASON = 'Codex local item void verification';

const responseJson = async (response) => {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { raw: text };
    }
};

const dataFrom = (body) => body?.data ?? body ?? {};

const loginWithLocalTenantCredentials = async (page) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const response = await page.request.fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
            'x-company-token': process.env.E2E_TEST_COMPANY_TOKEN
        },
        data: {
            email: process.env.E2E_TEST_USER_EMAIL,
            password: process.env.E2E_TEST_USER_PASSWORD
        }
    });
    const payload = await responseJson(response);
    expect(
        response.ok(),
        `Legacy POS login failed with HTTP ${response.status()}: ${JSON.stringify(payload)}`
    ).toBe(true);

    const session = dataFrom(payload);
    expect(session?.token, 'Legacy POS login must return a tenant access token.').toBeTruthy();
    return {
        authorization: `Bearer ${session.token}`,
        'x-company-token': process.env.E2E_TEST_COMPANY_TOKEN
    };
};

const posRequest = async (page, authHeaders, method, route, body) => {
    const response = await page.request.fetch(route, {
        method,
        headers: {
            ...authHeaders,
            'x-pos-terminal-id': TERMINAL_ID
        },
        ...(body === undefined ? {} : { data: body })
    });
    const payload = await responseJson(response);
    expect(
        response.ok(),
        `${method} ${route} failed with HTTP ${response.status()}: ${JSON.stringify(payload)}`
    ).toBe(true);
    return dataFrom(payload);
};

const transactionFrom = (value) => value?.transaction || value?.pos_transaction || value || {};

const ensureOperatorAuthority = async (page, authHeaders, locationId, shiftId) => {
    const current = await posRequest(
        page,
        authHeaders,
        'GET',
        `/api/v1/pos/terminal/operator/current?terminal_id=${encodeURIComponent(TERMINAL_ID)}&location_id=${encodeURIComponent(locationId)}&shift_id=${encodeURIComponent(shiftId)}`
    );
    if (current?.operator_session?.status === 'active') return false;

    expect(OPERATOR_PIN, 'The local test account needs E2E_POS_VOID_OPERATOR_PIN when the register has no active operator.').toMatch(/^\d{4,12}$/);
    const currentUser = await posRequest(page, authHeaders, 'GET', '/api/v1/users/me');
    const userId = Number(currentUser?.user_id || currentUser?.id || 0);
    expect(userId, 'The authenticated local POS user must have a user ID.').toBeGreaterThan(0);

    await posRequest(page, authHeaders, 'POST', '/api/v1/pos/terminal/operator/takeover', {
        idempotency_key: `codex-item-void-operator-${shiftId}-${Date.now()}`,
        user_id: userId,
        pin: OPERATOR_PIN,
        terminal_id: TERMINAL_ID,
        location_id: locationId,
        shift_id: shiftId,
        note: 'Codex local item void test operator setup'
    });
    return true;
};

const approvePendingVoid = async (page, authHeaders, transactionId) => {
    const approvals = await posRequest(page, authHeaders, 'GET', '/api/v1/pos/approvals?status=pending&limit=100');
    const approval = (Array.isArray(approvals?.approvals) ? approvals.approvals : [])
        .find((candidate) => Number(candidate?.entity_id) === Number(transactionId));
    if (!approval) return null;

    return posRequest(
        page,
        authHeaders,
        'POST',
        `/api/v1/pos/approvals/${approval.business_admin_approval_request_id || approval.id}/approve`,
        { note: 'Codex local item void test approval' }
    );
};

test('Masu Cafe can void one POS item and preserve the other item', async ({ page }, testInfo) => {
    test.skip(
        !process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD,
        'Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD to run the local POS transaction test.'
    );

    const diagnostics = [];
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
    page.on('response', (response) => {
        if (response.status() >= 500) diagnostics.push({
            type: 'http-5xx',
            method: response.request().method(),
            url: response.url(),
            status: response.status()
        });
    });

    const authHeaders = {};

    let openedShiftId = null;
    let activeShiftId = null;
    let activeLocationId = null;
    let operatorSessionStartedByTest = false;
    let transactionId = null;
    let itemVoidResult = null;
    let wholeCleanupCompleted = false;

    try {
        Object.assign(authHeaders, await loginWithLocalTenantCredentials(page));

        const pairedTerminal = await posRequest(page, authHeaders, 'GET', '/api/v1/pos/terminal/paired');
        const locationId = Number(pairedTerminal?.location_id || 0);
        activeLocationId = locationId;
        expect(locationId, 'Masu Cafe terminal must resolve to a location.').toBeGreaterThan(0);

        const currentShiftState = await posRequest(
            page,
            authHeaders,
            'GET',
            `/api/v1/pos/terminal/shifts/current?terminal_id=${encodeURIComponent(TERMINAL_ID)}`
        );
        let shift = currentShiftState?.shift || null;
        if (!shift) {
            const opened = await posRequest(page, authHeaders, 'POST', '/api/v1/pos/terminal/shifts/open', {
                idempotency_key: `codex-item-void-open-${Date.now()}`,
                terminal_id: TERMINAL_ID,
                location_id: locationId,
                opening_float_amount: 0,
                opening_note: 'Codex local item void test'
            });
            shift = opened?.shift || opened;
            openedShiftId = Number(shift?.pos_terminal_shift_id || 0) || null;
            operatorSessionStartedByTest = true;
        }
        const shiftId = Number(shift?.pos_terminal_shift_id || 0);
        activeShiftId = shiftId;
        expect(shiftId, 'A POS shift is required for the local transaction.').toBeGreaterThan(0);
        operatorSessionStartedByTest = (await ensureOperatorAuthority(page, authHeaders, locationId, shiftId)) || operatorSessionStartedByTest;

        const catalog = await posRequest(
            page,
            authHeaders,
            'GET',
            `/api/v1/pos/catalog?location_id=${encodeURIComponent(locationId)}`
        );
        const catalogItems = Array.isArray(catalog) ? catalog : (catalog?.items || []);
        const items = catalogItems.filter((item) => (
            Number(item?.item_id) > 0
            && Number(item?.current_stock) > 0
            && String(item?.status || 'active').toLowerCase() !== 'inactive'
        )).slice(0, 2);
        expect(items, 'Masu Cafe must have two active POS items with stock for this test.').toHaveLength(2);

        const checkout = await posRequest(page, authHeaders, 'POST', '/api/v1/pos/checkouts', {
            idempotency_key: `codex-item-void-checkout-${Date.now()}`,
            terminal_id: TERMINAL_ID,
            shift_id: shiftId,
            location_id: locationId,
            order_method: 'dine_in',
            payment_type: 'cash',
            document_context: 'training_test',
            lines: items.map((item) => ({ item_id: Number(item.item_id), quantity: 1 }))
        });
        const createdTransaction = transactionFrom(checkout);
        transactionId = Number(createdTransaction?.pos_transaction_id || createdTransaction?.id || 0);
        expect(transactionId, 'Checkout must return a POS transaction ID.').toBeGreaterThan(0);

        const original = transactionFrom(await posRequest(
            page,
            authHeaders,
            'GET',
            `/api/v1/pos/transactions/${transactionId}`
        ));
        const originalLines = Array.isArray(original?.lines) ? original.lines : [];
        expect(originalLines).toHaveLength(2);
        const selectedLine = originalLines[0];
        const retainedLine = originalLines[1];
        const originalTotal = Number(original.total_amount);
        const selectedAmount = Number(selectedLine.line_subtotal || 0);
        expect(selectedAmount).toBeGreaterThan(0);

        itemVoidResult = await posRequest(
            page,
            authHeaders,
            'POST',
            `/api/v1/pos/transactions/${transactionId}/void`,
            {
                reason: TEST_REASON,
                terminal_id: TERMINAL_ID,
                shift_id: shiftId,
                idempotency_key: `codex-item-void-${transactionId}-${Date.now()}`,
                ...(REFUND_PASSCODE ? { refund_passcode: REFUND_PASSCODE } : {}),
                voided_lines: [{ line_id: Number(selectedLine.line_id), quantity: 1 }]
            }
        );
        if (itemVoidResult?.pending === true) {
            const approvalResult = await approvePendingVoid(page, authHeaders, transactionId);
            expect(approvalResult, 'The pending item-void request must be approved in the local admin session.').not.toBeNull();
            itemVoidResult = transactionFrom(approvalResult);
        }

        const afterItemVoid = transactionFrom(await posRequest(
            page,
            authHeaders,
            'GET',
            `/api/v1/pos/transactions/${transactionId}`
        ));
        const afterLines = Array.isArray(afterItemVoid?.lines) ? afterItemVoid.lines : [];
        const voidedLine = afterLines.find((line) => Number(line.line_id) === Number(selectedLine.line_id));
        const activeRetainedLine = afterLines.find((line) => Number(line.line_id) === Number(retainedLine.line_id));
        expect(Number(voidedLine?.voided_quantity)).toBe(1);
        expect(Number(activeRetainedLine?.voided_quantity || 0)).toBe(0);
        expect(Number(afterItemVoid.total_amount)).toBeCloseTo(originalTotal - selectedAmount, 2);
        expect(itemVoidResult?.item_voided === true || itemVoidResult?.financial_outcome?.refund_required === true).toBe(true);
        expect(Number(itemVoidResult?.financial_outcome?.refund_amount || selectedAmount)).toBeCloseTo(selectedAmount, 2);
        expect(afterItemVoid.status).not.toBe('voided');

        await testInfo.attach('item-void-evidence.json', {
            body: JSON.stringify({
                terminal_id: TERMINAL_ID,
                location_id: locationId,
                transaction_id: transactionId,
                original_total: originalTotal,
                selected_line_id: Number(selectedLine.line_id),
                selected_amount: selectedAmount,
                retained_line_id: Number(retainedLine.line_id),
                after_item_void_total: Number(afterItemVoid.total_amount),
                voided_quantity: Number(voidedLine.voided_quantity),
                retained_voided_quantity: Number(activeRetainedLine.voided_quantity || 0),
                financial_outcome: itemVoidResult?.financial_outcome || null
            }, null, 2),
            contentType: 'application/json'
        });
    } finally {
        if (transactionId && !wholeCleanupCompleted && authHeaders.authorization) {
            const cleanup = await posRequest(
                page,
                authHeaders,
                'POST',
                `/api/v1/pos/transactions/${transactionId}/void`,
                {
                    reason: 'Codex local item void test cleanup',
                    terminal_id: TERMINAL_ID,
                    shift_id: activeShiftId || undefined,
                    idempotency_key: `codex-item-void-cleanup-${transactionId}-${Date.now()}`
                }
            ).catch(() => null);
            if (cleanup?.pending === true) await approvePendingVoid(page, authHeaders, transactionId).catch(() => null);
            wholeCleanupCompleted = true;
        }
        if (operatorSessionStartedByTest && activeShiftId && activeLocationId && authHeaders.authorization) {
            await posRequest(page, authHeaders, 'POST', '/api/v1/pos/terminal/operator/end', {
                terminal_id: TERMINAL_ID,
                location_id: activeLocationId,
                shift_id: activeShiftId
            }).catch(() => null);
        }
        if (openedShiftId && authHeaders.authorization) {
            const current = await posRequest(
                page,
                authHeaders,
                'GET',
                `/api/v1/pos/terminal/shifts/current?terminal_id=${encodeURIComponent(TERMINAL_ID)}`
            ).catch(() => null);
            const expectedCash = Number(current?.cash_summary?.expected_cash_amount || 0);
            await posRequest(page, authHeaders, 'POST', `/api/v1/pos/terminal/shifts/${openedShiftId}/close`, {
                idempotency_key: `codex-item-void-close-${openedShiftId}-${Date.now()}`,
                closing_cash_amount: expectedCash,
                closing_note: 'Codex local item void test cleanup'
            }).catch(() => null);
        }
        await testInfo.attach('item-void-diagnostics.json', {
            body: JSON.stringify(diagnostics, null, 2),
            contentType: 'application/json'
        });
    }
});
