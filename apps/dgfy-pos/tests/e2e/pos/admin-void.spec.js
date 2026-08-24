import { test, expect } from '@playwright/test';
import {
    POS_VOID_ADMIN_CREDENTIALS,
    POS_VOID_CASHIER_CREDENTIALS,
    POS_VOID_STALE_SHIFT_CLEANUP_ENABLED,
    POS_VOID_TERMINAL_ID,
    closePosVoidTestShift,
    createPosVoidTrainingSale,
    dismissPosStockAlert,
    expectPosResponse,
    getPosVoidFlowPrerequisiteReport,
    getCurrentShift,
    getPosUser,
    getRegisteredTerminal,
    getTerminalShiftState,
    openPosVoidTestShift,
    posRequest,
    resumePosVoidShift,
    selectPosVoidAdminTerminal,
    skipPosAdminShiftPrompt,
    signInPosVoidActor
} from '../fixtures/posVoid.js';

const POS_BASE_URL = process.env.E2E_BASE_URL || process.env.POS_URL || 'http://localhost:5174';

const addDiagnostics = (page) => {
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
    return diagnostics;
};

const expectNoCriticalRuntimeFailures = (diagnostics, checkpoint) => {
    const critical = diagnostics.filter((entry) => entry.type === 'pageerror' || entry.type === 'http-5xx');
    expect(critical, `${checkpoint} produced browser exceptions or HTTP 5xx responses.`).toEqual([]);
};

const transactionFromResponse = (body) => body?.data?.transaction
    || body?.data?.pos_transaction
    || body?.data
    || {};

const toManilaDate = (value) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date(value));

test.describe('POS administrator void flow', () => {
    test('allows an admin to void a closed-shift transaction without creating an admin shift', async ({ browser }, testInfo) => {
        const prerequisiteReport = getPosVoidFlowPrerequisiteReport();
        test.skip(!prerequisiteReport.ready, prerequisiteReport.message);

        let adminContext = await browser.newContext({ baseURL: POS_BASE_URL });
        const cashierContext = await browser.newContext({ baseURL: POS_BASE_URL });
        let adminPage = await adminContext.newPage();
        const cashierPage = await cashierContext.newPage();
        const adminDiagnostics = addDiagnostics(adminPage);
        const cashierDiagnostics = addDiagnostics(cashierPage);
        let refreshedAdminDiagnostics = [];
        let adminAuthHeaders = null;
        let openedShiftId = null;
        let openedShiftClosingCashAmount = 0;
        let cashierAuthHeaders = null;
        let createdTransactionId = null;
        let transactionWasVoided = false;
        let refundShiftId = null;
        let refundShiftClosingCashAmount = 0;

        try {
            adminAuthHeaders = await signInPosVoidActor(adminPage, POS_VOID_ADMIN_CREDENTIALS);
            await skipPosAdminShiftPrompt(adminPage);
            const adminUser = await getPosUser(adminPage, adminAuthHeaders);
            const adminHasVoidPermission = adminUser?.is_master_admin === true
                || (Array.isArray(adminUser?.permissions) && adminUser.permissions.includes('pos:void'));
            expect(adminHasVoidPermission, 'The configured admin account must have pos:void.').toBe(true);

            const adminTerminal = await getRegisteredTerminal(adminPage, adminAuthHeaders);
            const locationId = Number(adminTerminal.location_id);
            expect(locationId, 'The configured terminal must resolve to a valid location.').toBeGreaterThan(0);

            const adminShiftState = await getTerminalShiftState(adminPage, adminAuthHeaders, locationId);
            const adminShift = adminShiftState.shift || null;
            testInfo.skip(
                Boolean(adminShift),
                `The configured admin already owns open shift #${adminShift?.pos_terminal_shift_id}; use a dedicated no-shift admin account.`
            );
            cashierAuthHeaders = await signInPosVoidActor(cashierPage, POS_VOID_CASHIER_CREDENTIALS);
            const cashierUser = await getPosUser(cashierPage, cashierAuthHeaders);
            const cashierPermissions = Array.isArray(cashierUser?.permissions) ? cashierUser.permissions : [];
            testInfo.skip(
                cashierUser?.is_master_admin !== true && (!cashierPermissions.includes('pos:void') || !cashierPermissions.includes('pos:cash_drawer_adjust')),
                'The configured cashier must have pos:void and pos:cash_drawer_adjust for the cash-refund certification step.'
            );
            const cashierShiftState = await getTerminalShiftState(cashierPage, cashierAuthHeaders, locationId);
            let cashierShift = cashierShiftState.shift || null;
            if (adminShiftState.terminal_occupancy?.status === 'occupied_by_other') {
                testInfo.skip(
                    !cashierShift,
                    'The configured terminal is occupied by an account other than the configured E2E cashier; refusing automatic cleanup.'
                );
                testInfo.skip(
                    !POS_VOID_STALE_SHIFT_CLEANUP_ENABLED,
                    `The configured test cashier owns open shift #${cashierShift?.pos_terminal_shift_id}; set E2E_POS_VOID_CLEAN_STALE_SHIFT=true to close it safely before certification.`
                );
                expect(String(cashierShift.terminal_id || '').trim().toUpperCase()).toBe(POS_VOID_TERMINAL_ID);
                await closePosVoidTestShift(
                    cashierPage,
                    cashierAuthHeaders,
                    Number(cashierShift.pos_terminal_shift_id),
                    Number(cashierShiftState.cash_summary?.expected_cash_amount || 0)
                );
                cashierShift = null;
            }
            testInfo.skip(
                Boolean(cashierShift),
                `The configured cashier already owns open shift #${cashierShift?.pos_terminal_shift_id}; use a dedicated sandbox cashier account.`
            );

            const openedShift = await openPosVoidTestShift(cashierPage, cashierAuthHeaders, locationId);
            openedShiftId = Number(openedShift.pos_terminal_shift_id);
            expect(openedShiftId).toBeGreaterThan(0);

            const createdTransaction = await createPosVoidTrainingSale(
                cashierPage,
                cashierAuthHeaders,
                openedShift,
                locationId
            );
            const transactionId = Number(createdTransaction.pos_transaction_id || createdTransaction.id);
            expect(transactionId).toBeGreaterThan(0);
            createdTransactionId = transactionId;

            const createdDetailResult = await posRequest(
                cashierPage,
                cashierAuthHeaders,
                'GET',
                `/api/v1/pos/transactions/${transactionId}`
            );
            expectPosResponse(createdDetailResult, 200, 'created transaction lookup');
            const originalTransaction = transactionFromResponse(createdDetailResult.body);
            const invoiceNumber = String(originalTransaction.invoice_number || '').trim();
            expect(invoiceNumber, 'Created transaction must contain an invoice number.').not.toBe('');
            expect(Number(originalTransaction.cashier_id)).toBe(Number(cashierUser.user_id));
            expect(Number(originalTransaction.shift_id)).toBe(openedShiftId);
            openedShiftClosingCashAmount = Number(originalTransaction.total_amount || 0);

            await closePosVoidTestShift(
                cashierPage,
                cashierAuthHeaders,
                openedShiftId,
                openedShiftClosingCashAmount
            );
            openedShiftId = null;
            openedShiftClosingCashAmount = 0;

            await adminContext.close();
            adminContext = await browser.newContext({ baseURL: POS_BASE_URL });
            adminPage = await adminContext.newPage();
            refreshedAdminDiagnostics = addDiagnostics(adminPage);
            adminAuthHeaders = await signInPosVoidActor(adminPage, POS_VOID_ADMIN_CREDENTIALS);
            await skipPosAdminShiftPrompt(adminPage);
            await selectPosVoidAdminTerminal(adminPage, locationId);
            await expect(adminPage.getByRole('button', { name: /^History\b/i })).toBeVisible();
            await adminPage.getByRole('button', { name: /^History\b/i }).click();
            const historySearch = adminPage.getByPlaceholder('Search all transaction fields...');
            await expect(historySearch).toBeVisible();
            await historySearch.fill(invoiceNumber);
            await expect(adminPage.getByText(invoiceNumber, { exact: true })).toBeVisible();

            await adminPage.getByRole('button', { name: `Void transaction ${invoiceNumber}` }).click();
            const dialog = adminPage.getByRole('dialog');
            await expect(dialog.getByText('Void Transaction', { exact: true })).toBeVisible();
            await dialog.getByLabel('Void reason').fill('Reusable administrator E2E correction');

            const voidRequestPromise = adminPage.waitForRequest(
                (request) => new URL(request.url()).pathname.endsWith(`/api/v1/pos/transactions/${transactionId}/void`),
                { timeout: 15_000 }
            );
            const voidResponsePromise = adminPage.waitForResponse(
                (response) => new URL(response.url()).pathname.endsWith(`/api/v1/pos/transactions/${transactionId}/void`),
                { timeout: 15_000 }
            );
            await dialog.getByRole('button', { name: 'Confirm Void', exact: true }).click();
            const [voidRequest, voidResponse] = await Promise.all([voidRequestPromise, voidResponsePromise]);
            expect(voidResponse.status()).toBe(200);
            transactionWasVoided = true;
            const voidPayload = voidRequest.postDataJSON();
            expect(voidPayload).toEqual({
                reason: 'Reusable administrator E2E correction',
                terminal_id: POS_VOID_TERMINAL_ID
            });
            expect(voidPayload).not.toHaveProperty('shift_id');

            const voidedDetailResult = await posRequest(
                adminPage,
                adminAuthHeaders,
                'GET',
                `/api/v1/pos/transactions/${transactionId}`
            );
            expectPosResponse(voidedDetailResult, 200, 'voided transaction lookup');
            const voidedTransaction = transactionFromResponse(voidedDetailResult.body);
            expect(voidedTransaction.status).toBe('voided');
            expect(Number(voidedTransaction.cashier_id)).toBe(Number(cashierUser.user_id));
            expect(Number(voidedTransaction.shift_id)).toBe(Number(originalTransaction.shift_id));
            expect(Number(voidedTransaction.voided_by)).toBe(Number(adminUser.user_id));
            expect(voidedTransaction.financial_outcome).toMatchObject({
                refund_required: true,
                next_action: 'record_cash_refund_with_cash_drawer_event'
            });
            expect(Number(voidedTransaction.financial_outcome.refund_amount)).toBe(
                Number(originalTransaction.total_amount || 0)
            );
            const voidAdjustment = Array.isArray(voidedTransaction.adjustments)
                ? voidedTransaction.adjustments.find((adjustment) => (
                    adjustment.adjustment_reference === `POS-VOID-${transactionId}`
                ))
                : null;
            expect(voidAdjustment, 'Void adjustment must be visible in transaction detail.').toBeTruthy();
            expect(Number(voidAdjustment.original_cashier_id)).toBe(Number(cashierUser.user_id));
            expect(Number(voidAdjustment.original_shift_id)).toBe(Number(originalTransaction.shift_id));
            expect(Number(voidAdjustment.actor_user_id)).toBe(Number(adminUser.user_id));
            expect(voidAdjustment.adjustment_type).toBe('void');
            expect(voidAdjustment.status).toBe('succeeded');

            const adminShiftAfterVoid = await getCurrentShift(adminPage, adminAuthHeaders, locationId);
            expect(adminShiftAfterVoid, 'Administrator void must not create an admin shift.').toBeNull();

            const voidedHistoryResult = await posRequest(
                adminPage,
                adminAuthHeaders,
                'GET',
                `/api/v1/pos/transactions?status=voided&location_id=${locationId}&search=${encodeURIComponent(invoiceNumber)}&limit=20`
            );
            expectPosResponse(voidedHistoryResult, 200, 'voided transaction history lookup');
            const historyRows = Array.isArray(voidedHistoryResult.body?.data?.transactions)
                ? voidedHistoryResult.body.data.transactions
                : [];
            expect(historyRows.some((row) => Number(row.pos_transaction_id) === transactionId)).toBe(true);

            await expect(dialog).toBeHidden();
            await adminPage.getByLabel('Sales View').selectOption('voided');
            const voidedRow = adminPage.getByRole('row').filter({ hasText: invoiceNumber });
            await expect(voidedRow).toBeVisible();
            await expect(voidedRow.getByTestId(`pos-void-status-${transactionId}`)).toContainText('Voided');
            await expect(voidedRow).toContainText('Reusable administrator E2E correction');
            await voidedRow.getByRole('button', { name: `View receipt for ${invoiceNumber}` }).click();

            const receiptDialog = adminPage.getByRole('dialog');
            await expect(receiptDialog.getByTestId('pos-void-audit-panel')).toBeVisible();
            await expect(receiptDialog.getByTestId('pos-void-status-badge')).toHaveText('Voided');
            await expect(receiptDialog.getByTestId('pos-void-audit-panel')).toContainText(
                'Reusable administrator E2E correction'
            );
            await expect(receiptDialog.getByTestId('pos-void-financial-outcome')).toContainText(
                'Cash refund and a linked cash-drawer event are still required.'
            );
            await expect(receiptDialog.getByTestId('pos-refund-adjustment-audit')).toContainText('POS-VOID');
            expectNoCriticalRuntimeFailures([...adminDiagnostics, ...refreshedAdminDiagnostics], 'admin void and receipt evidence');

            await receiptDialog.getByRole('button', { name: 'Close receipt preview' }).click();
            const refundShift = await openPosVoidTestShift(
                cashierPage,
                cashierAuthHeaders,
                locationId,
                Number(originalTransaction.total_amount || 0)
            );
            refundShiftId = Number(refundShift.pos_terminal_shift_id);
            expect(refundShiftId).toBeGreaterThan(0);
            refundShiftClosingCashAmount = Number(originalTransaction.total_amount || 0);

            await cashierPage.reload();
            cashierAuthHeaders = await signInPosVoidActor(cashierPage, POS_VOID_CASHIER_CREDENTIALS);
            await resumePosVoidShift(cashierPage);
            await dismissPosStockAlert(cashierPage);
            await expect(cashierPage.getByRole('button', { name: /^History\b/i })).toBeVisible();
            await expect(cashierPage.getByRole('button', { name: /^History\b/i })).toBeEnabled();
            await cashierPage.getByRole('button', { name: /^History\b/i }).click();
            const cashierHistorySearch = cashierPage.getByPlaceholder('Search all transaction fields...');
            await expect(cashierHistorySearch).toBeVisible();
            await cashierHistorySearch.fill(invoiceNumber);
            await cashierPage.getByLabel('Sales View').selectOption('voided');
            const cashierVoidedRow = cashierPage.getByRole('row').filter({ hasText: invoiceNumber });
            await expect(cashierVoidedRow).toBeVisible();
            await cashierVoidedRow.getByRole('button', { name: `Resolve refund for ${invoiceNumber}` }).click();

            const refundDialog = cashierPage.getByTestId('pos-refund-workflow-dialog');
            await expect(refundDialog.getByText('Record cash refund', { exact: true })).toBeVisible();
            await refundDialog.getByLabel('Refund reason').fill('Reusable cash refund certification');
            const cashRefundRequestPromise = cashierPage.waitForRequest(
                (request) => new URL(request.url()).pathname.endsWith(`/api/v1/pos/transactions/${transactionId}/cash-refund`),
                { timeout: 15_000 }
            );
            const cashRefundResponsePromise = cashierPage.waitForResponse(
                (response) => new URL(response.url()).pathname.endsWith(`/api/v1/pos/transactions/${transactionId}/cash-refund`),
                { timeout: 15_000 }
            );
            await refundDialog.getByRole('button', { name: 'Confirm refund action', exact: true }).click();
            const [cashRefundRequest, cashRefundResponse] = await Promise.all([cashRefundRequestPromise, cashRefundResponsePromise]);
            expect(cashRefundResponse.status()).toBe(200);
            refundShiftClosingCashAmount = 0;
            expect(cashRefundRequest.postDataJSON()).toEqual(expect.objectContaining({
                reason: 'Reusable cash refund certification',
                shift_id: refundShiftId,
                terminal_id: POS_VOID_TERMINAL_ID,
                idempotency_key: expect.stringMatching(/^pos-refund-/)
            }));

            const refundedDetailResult = await posRequest(
                cashierPage,
                cashierAuthHeaders,
                'GET',
                `/api/v1/pos/transactions/${transactionId}`
            );
            expectPosResponse(refundedDetailResult, 200, 'refunded transaction lookup');
            const refundedTransaction = transactionFromResponse(refundedDetailResult.body);
            expect(refundedTransaction.payment_status).toBe('refunded');
            const cashRefundAdjustment = refundedTransaction.adjustments.find((adjustment) => adjustment.adjustment_type === 'cash_refund');
            expect(cashRefundAdjustment).toMatchObject({
                status: 'succeeded',
                original_shift_id: Number(originalTransaction.shift_id),
                actor_shift_id: refundShiftId,
                actor_user_id: Number(cashierUser.user_id)
            });
            expect(Number(cashRefundAdjustment.cash_drawer_event_id)).toBeGreaterThan(0);

            await closePosVoidTestShift(cashierPage, cashierAuthHeaders, refundShiftId, refundShiftClosingCashAmount);
            refundShiftId = null;
            expectNoCriticalRuntimeFailures(cashierDiagnostics, 'cash refund workflow');

            const shiftHistoryResult = await posRequest(
                cashierPage,
                cashierAuthHeaders,
                'GET',
                `/api/v1/pos/terminal/shifts/history?location_id=${locationId}&status=closed&limit=50`
            );
            expectPosResponse(shiftHistoryResult, 200, 'cashier shift history lookup');
            const shiftRecords = Array.isArray(shiftHistoryResult.body?.data?.records)
                ? shiftHistoryResult.body.data.records
                : [];
            const closedRecord = shiftRecords.find((record) => Number(record?.shift?.pos_terminal_shift_id) === Number(originalTransaction.shift_id));
            expect(closedRecord, 'Closed cashier shift must remain visible after the admin void.').toBeTruthy();
            expect(Number(closedRecord.shift?.cash_variance_amount)).toBe(0);
            expect(Number(closedRecord.sales_summary?.post_close_void_transaction_count)).toBe(1);
            expect(Number(closedRecord.sales_summary?.post_close_void_amount)).toBe(Number(originalTransaction.total_amount || 0));
            expect(Number(closedRecord.sales_summary?.post_close_adjustment_count)).toBe(1);
            expect(Number(closedRecord.sales_summary?.post_close_refund_amount)).toBe(Number(originalTransaction.total_amount || 0));
            expect(closedRecord.sales_summary?.post_close_adjustments).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    adjustment_type: 'cash_refund',
                    actor_user_id: Number(cashierUser.user_id),
                    original_shift_id: Number(originalTransaction.shift_id)
                })
            ]));

            const eventDate = toManilaDate(cashRefundAdjustment.completed_at || cashRefundAdjustment.created_at);
            const reportResult = await posRequest(
                adminPage,
                adminAuthHeaders,
                'GET',
                `/api/v1/pos/reports/overview?date_from=${eventDate}&date_to=${eventDate}&location_id=${locationId}`
            );
            expectPosResponse(reportResult, 200, 'refund event-date report lookup');
            const report = reportResult.body?.data || {};
            expect(report.daily_report?.adjustment_summary).toEqual(expect.objectContaining({
                net_sales_impact: 0,
                mutates_prior_z_reading: false
            }));
            expect(Number(report.daily_report?.adjustment_summary?.succeeded_amount || 0))
                .toBeGreaterThanOrEqual(Number(originalTransaction.total_amount || 0));
            expect(report.daily_report?.adjustment_rows).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    adjustment_reference: cashRefundAdjustment.adjustment_reference,
                    original_shift_id: Number(originalTransaction.shift_id),
                    actor_user_id: Number(cashierUser.user_id)
                })
            ]));
        } finally {
            if (refundShiftId) {
                await closePosVoidTestShift(cashierPage, cashierAuthHeaders, refundShiftId, refundShiftClosingCashAmount).catch(() => {});
            }
            if (openedShiftId) {
                await closePosVoidTestShift(cashierPage, cashierAuthHeaders, openedShiftId, openedShiftClosingCashAmount).catch(() => {});
            }
            if (createdTransactionId && !transactionWasVoided && adminAuthHeaders) {
                await posRequest(
                    adminPage,
                    adminAuthHeaders,
                    'POST',
                    `/api/v1/pos/transactions/${createdTransactionId}/void`,
                    {
                        reason: 'Reusable administrator E2E failure cleanup',
                        terminal_id: POS_VOID_TERMINAL_ID
                    }
                ).catch(() => {});
            }
            await testInfo.attach('admin-void-diagnostics.json', {
                body: JSON.stringify([...adminDiagnostics, ...refreshedAdminDiagnostics, ...cashierDiagnostics], null, 2),
                contentType: 'application/json'
            });
            await adminContext.close();
            await cashierContext.close();
        }
    });
});
