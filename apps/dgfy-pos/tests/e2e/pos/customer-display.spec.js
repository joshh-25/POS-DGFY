import { test, expect } from '@playwright/test';
import { registerCrashDetection } from '../helpers/assertions.js';

const sessionId = `cd-e2e-${Date.now().toString(36)}`;
const terminalId = 'COUNTER-01';
const displayRoute = `/#/customer-display?sessionId=${sessionId}&terminalId=${terminalId}`;
const channelName = `dgfy-pos-customer-display:v1:${sessionId}`;

const attachRuntimeDiagnostics = (page, label) => {
    const diagnostics = [];
    page.on('requestfailed', (request) => {
        diagnostics.push(`${label} requestfailed ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
    });
    page.on('response', (response) => {
        if (response.status() >= 500) diagnostics.push(`${label} HTTP ${response.status()} ${response.url()}`);
    });
    return diagnostics;
};

test('customer display synchronizes snapshots across same-origin windows', async ({ context }) => {
    const cashierPage = await context.newPage();
    const displayPage = await context.newPage();
    const cashierCrashChecker = registerCrashDetection(cashierPage);
    const displayCrashChecker = registerCrashDetection(displayPage);
    const cashierDiagnostics = attachRuntimeDiagnostics(cashierPage, 'cashier');
    const displayDiagnostics = attachRuntimeDiagnostics(displayPage, 'display');

    try {
        await displayPage.setViewportSize({ width: 390, height: 640 });
        await cashierPage.goto('/login', { waitUntil: 'domcontentloaded' });
        await cashierCrashChecker.assertNoCrashes();

        await cashierPage.evaluate(({ channelName: requestedChannelName, requestedSessionId, requestedTerminalId }) => {
            const channel = new BroadcastChannel(requestedChannelName);
            window.__customerDisplayTestChannel = channel;
            channel.addEventListener('message', (event) => {
                if (event.data?.messageType !== 'display.ready') return;
                channel.postMessage({
                    protocolVersion: 1,
                    messageType: 'display.snapshot',
                    sessionId: requestedSessionId,
                    terminalId: requestedTerminalId,
                    revision: 1,
                    sentAt: Date.now(),
                    payload: {
                        viewState: 'active',
                        currency: 'PHP',
                        items: [{ key: 'line-0', name: 'Customer display latte', quantity: 2, unitPrice: 145, lineTotal: 290, options: [] }],
                        itemCount: 2,
                        subtotal: 290,
                        discount: 0,
                        serviceFees: 0,
                        total: 290
                    }
                });
            });
        }, { channelName, requestedSessionId: sessionId, requestedTerminalId: terminalId });

        await displayPage.goto(displayRoute, { waitUntil: 'domcontentloaded' });
        await expect(displayPage.getByTestId('customer-display-state')).toHaveAttribute('data-state', 'active');
        await expect(displayPage.getByText('Customer display latte')).toBeVisible();
        await expect(displayPage.getByTestId('customer-display-total')).toContainText('₱290.00');
        await expect(displayPage.getByRole('columnheader', { name: 'Item name' })).toBeVisible();
        await expect(displayPage.getByRole('columnheader', { name: 'Qty' })).toBeVisible();
        await expect(displayPage.getByRole('columnheader', { name: 'Total price' })).toBeVisible();
        const itemRow = displayPage.getByTestId('customer-display-item');
        await expect(itemRow.locator('td')).toHaveCount(3);
        await expect(itemRow).toContainText('2');
        await expect(itemRow).toContainText('₱290.00');
        await expect(itemRow).not.toContainText('each');

        const responsiveMetrics = await displayPage.evaluate(() => {
            const root = document.querySelector('[data-testid="customer-display"]');
            const order = document.querySelector('[data-testid="customer-display-order"]');
            const item = document.querySelector('[data-testid="customer-display-item"]');
            const summary = document.querySelector('[data-testid="customer-display-summary"]');
            const total = document.querySelector('[data-testid="customer-display-total"]');
            const rect = (element) => element?.getBoundingClientRect();
            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                rootRight: rect(root)?.right || 0,
                orderRight: rect(order)?.right || 0,
                itemRight: rect(item)?.right || 0,
                summaryRight: rect(summary)?.right || 0,
                totalRight: rect(total)?.right || 0
            };
        });

        expect(responsiveMetrics.documentWidth).toBeLessThanOrEqual(responsiveMetrics.viewportWidth + 1);
        expect(responsiveMetrics.orderRight).toBeLessThanOrEqual(responsiveMetrics.rootRight + 1);
        expect(responsiveMetrics.itemRight).toBeLessThanOrEqual(responsiveMetrics.orderRight + 1);
        expect(responsiveMetrics.summaryRight).toBeLessThanOrEqual(responsiveMetrics.rootRight + 1);
        expect(responsiveMetrics.totalRight).toBeLessThanOrEqual(responsiveMetrics.summaryRight + 1);

        await cashierPage.evaluate(({ requestedSessionId, requestedTerminalId }) => {
            window.__customerDisplayTestChannel.postMessage({
                protocolVersion: 1,
                messageType: 'display.snapshot',
                sessionId: requestedSessionId,
                terminalId: requestedTerminalId,
                revision: 0,
                sentAt: Date.now(),
                payload: {
                    viewState: 'active',
                    currency: 'PHP',
                    items: [{ key: 'stale', name: 'Stale item', quantity: 1, unitPrice: 1, lineTotal: 1, options: [] }],
                    itemCount: 1,
                    subtotal: 1,
                    discount: 0,
                    serviceFees: 0,
                    total: 1
                }
            });
        }, { requestedChannelName: channelName, requestedSessionId: sessionId, requestedTerminalId: terminalId });
        await expect(displayPage.getByTestId('customer-display-total')).toContainText('₱290.00');
        await expect(displayPage.getByText('Stale item')).toHaveCount(0);

        await cashierPage.evaluate(({ requestedSessionId, requestedTerminalId }) => {
            window.__customerDisplayTestChannel.postMessage({
                protocolVersion: 1,
                messageType: 'display.snapshot',
                sessionId: requestedSessionId,
                terminalId: requestedTerminalId,
                revision: 2,
                sentAt: Date.now(),
                payload: {
                    viewState: 'completed',
                    currency: 'PHP',
                    items: [{ key: 'line-0', name: 'Customer display latte', quantity: 2, unitPrice: 145, lineTotal: 290, options: [] }],
                    itemCount: 2,
                    subtotal: 290,
                    discount: 0,
                    serviceFees: 0,
                    total: 290,
                    paymentSummary: {
                        paymentType: 'cash',
                        isCash: true,
                        totalDue: 290,
                        amountPaid: 300,
                        changeAmount: 10
                    }
                }
            });
        }, { requestedSessionId: sessionId, requestedTerminalId: terminalId });
        await expect(displayPage.getByTestId('customer-display-state')).toHaveAttribute('data-state', 'completed');
        await expect(displayPage.getByTestId('customer-display-completed')).toBeVisible();
        await expect(displayPage.getByText('Payment confirmed')).toBeVisible();
        await expect(displayPage.getByText('Thank you!')).toBeVisible();
        await expect(displayPage.getByTestId('customer-display-payment-change')).toContainText('₱10.00');
        await expect(displayPage.getByTestId('customer-display-items')).toHaveCount(0);

        await cashierPage.evaluate(({ requestedSessionId, requestedTerminalId }) => {
            window.__customerDisplayTestChannel.postMessage({
                protocolVersion: 1,
                messageType: 'display.close',
                sessionId: requestedSessionId,
                terminalId: requestedTerminalId,
                revision: 3,
                sentAt: Date.now(),
                payload: {}
            });
        }, { requestedSessionId: sessionId, requestedTerminalId: terminalId });
        await expect(displayPage.getByTestId('customer-display-state')).toHaveAttribute('data-state', 'ended');
        await displayCrashChecker.assertNoCrashes();
    } finally {
        await cashierPage.evaluate(() => window.__customerDisplayTestChannel?.close()).catch(() => {});
        await cashierPage.close();
        await displayPage.close();
    }

    expect(cashierDiagnostics).toEqual([]);
    expect(displayDiagnostics).toEqual([]);
});
