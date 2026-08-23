// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const serviceMocks = vi.hoisted(() => ({
    addPosPaymentAllocation: vi.fn(),
    cancelPosPaymentAllocation: vi.fn(),
    cancelPosPaymentSession: vi.fn(),
    completePosPaymentSession: vi.fn(),
    createPosPaymentSession: vi.fn(),
    fetchActivePosPaymentSession: vi.fn().mockResolvedValue(null),
    fetchPosPaymentSession: vi.fn()
}));

vi.mock('../services/posService.js', () => serviceMocks);
vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: { error: vi.fn(), message: vi.fn(), success: vi.fn() }
}));

import POSSplitPaymentDialog from '../components/POSSplitPaymentDialog.jsx';

const openSession = {
    pos_payment_session_id: 501,
    status: 'open',
    total_amount: 1250,
    paid_amount: 0,
    remaining_amount: 1250,
    allocations: []
};

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
    serviceMocks.fetchActivePosPaymentSession.mockResolvedValue(null);
});

describe('POS manual walk-in tender', () => {
    it.each(['completed', 'cancelled'])('clears a %s recovery pointer and closes without reopening a terminal session', async (status) => {
        window.localStorage.setItem('pos_split_payment_session:terminal-recovery', JSON.stringify({
            session_id: 501,
            idempotency_key: 'terminal-session-key'
        }));
        serviceMocks.fetchPosPaymentSession.mockResolvedValue({
            ...openSession,
            status
        });
        const onSessionStateChange = vi.fn();
        const onOpenChange = vi.fn();

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={onOpenChange}
                cart={[]}
                catalog={[]}
                subtotalAmount={0}
                totalAmount={0}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="terminal-recovery"
                onSessionStateChange={onSessionStateChange}
            />
        );

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(onSessionStateChange).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
        expect(window.localStorage.getItem('pos_split_payment_session:terminal-recovery')).toBeNull();
        expect(serviceMocks.createPosPaymentSession).not.toHaveBeenCalled();
    });

    it('releases a stale recovery lock when the saved server session no longer exists', async () => {
        window.localStorage.setItem('pos_split_payment_session:missing-recovery', JSON.stringify({
            session_id: 999,
            idempotency_key: 'missing-session-key'
        }));
        serviceMocks.fetchPosPaymentSession.mockRejectedValue({
            response: { status: 404, data: { message: 'POS payment session not found.' } }
        });
        const onSessionStateChange = vi.fn();

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[]}
                catalog={[]}
                subtotalAmount={0}
                totalAmount={0}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="missing-recovery"
                onSessionStateChange={onSessionStateChange}
            />
        );

        expect((await screen.findByRole('alert')).textContent).toContain('POS payment session not found.');
        expect(onSessionStateChange).toHaveBeenCalledWith({ active: false, recovered: false, session: null });
        expect(window.localStorage.getItem('pos_split_payment_session:missing-recovery')).toBeNull();
    });

    it.each([
        ['desktop', 1280],
        ['mobile', 390]
    ])('restores a saved split-payment draft with its item summary at %s width', async (_viewport, width) => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        window.dispatchEvent(new Event('resize'));
        const recoveredSession = {
            pos_payment_session_id: 501,
            session_reference: 'PAY-RECOVERY-501',
            status: 'ready_to_complete',
            line_count: 1,
            total_amount: 90,
            paid_amount: 90,
            remaining_amount: 0,
            snapshot: {
                lines: [{ item_id: 36, quantity: 1, sale_price: 90 }]
            },
            allocations: [{
                pos_payment_allocation_id: 701,
                payment_method: 'gcash',
                payment_provider: 'merchant_owned',
                status: 'successful',
                applied_amount: 90
            }]
        };
        window.localStorage.setItem('pos_split_payment_session:refresh-recovery', JSON.stringify({
            session_id: 501,
            idempotency_key: 'existing-session-key'
        }));
        serviceMocks.fetchPosPaymentSession.mockResolvedValue(recoveredSession);
        const onSessionStateChange = vi.fn();
        const onOpenChange = vi.fn();
        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={onOpenChange}
                cart={[]}
                catalog={[{ item_id: 36, name: 'Chai Tea (Hot)' }]}
                subtotalAmount={0}
                totalAmount={0}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="refresh-recovery"
                onSessionStateChange={onSessionStateChange}
            />
        );

        await waitFor(() => expect(screen.queryByTestId('pos-split-payment-saved-sale')).toBeNull());
        expect(screen.queryByText('Sale awaiting completion')).toBeNull();
        expect(screen.queryByTestId('pos-split-payment-cancel-session')).toBeNull();
        expect(serviceMocks.completePosPaymentSession).not.toHaveBeenCalled();
        expect(screen.queryByText('Payment recorded')).toBeNull();
        await waitFor(() => expect(onSessionStateChange).toHaveBeenCalledWith(expect.objectContaining({
            active: true,
            recovered: true,
            session: recoveredSession
        })));

        await userEvent.setup().click(screen.getByRole('button', { name: 'Close split payment' }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(window.localStorage.getItem('pos_split_payment_session:refresh-recovery')).not.toBeNull();
    });

    it('does not restart the session request when the checkout snapshot object changes identity', async () => {
        const savedSession = {
            ...openSession,
            total_amount: 90,
            remaining_amount: 90
        };
        window.localStorage.setItem('pos_split_payment_session:snapshot-rerender', JSON.stringify({
            session_id: 501,
            idempotency_key: 'existing-session-key'
        }));
        serviceMocks.fetchPosPaymentSession.mockResolvedValue(savedSession);

        const view = render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 36, quantity: 1, sale_price: 90 }]}
                totalAmount={90}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="snapshot-rerender"
                checkoutSnapshot={{ schema_version: 1, lines: [{ item_id: 36, quantity: 1, sale_price: 90 }] }}
            />
        );

        await screen.findByText('Payment Methods');
        await waitFor(() => expect(serviceMocks.fetchPosPaymentSession).toHaveBeenCalledTimes(1));

        view.rerender(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 36, quantity: 1, sale_price: 90 }]}
                totalAmount={90}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="snapshot-rerender"
                checkoutSnapshot={{ schema_version: 1, lines: [{ item_id: 36, quantity: 1, sale_price: 90 }] }}
            />
        );

        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(serviceMocks.fetchPosPaymentSession).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Record Payment' }).disabled).toBe(true);
    });

    it.each([
        ['desktop', 1280],
        ['mobile', 390]
    ])('records GCash and cash payment rows with change at %s width', async (_viewport, width) => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        window.dispatchEvent(new Event('resize'));
        const threeHundredSession = {
            ...openSession,
            total_amount: 300,
            remaining_amount: 300
        };
        serviceMocks.createPosPaymentSession.mockResolvedValue(threeHundredSession);
        const gcashSession = {
            ...threeHundredSession,
            status: 'partially_paid',
            paid_amount: 250,
            remaining_amount: 50,
            allocations: [{
                pos_payment_allocation_id: 700,
                payment_method: 'gcash',
                payment_provider: 'merchant_owned',
                status: 'successful',
                applied_amount: 250
            }]
        };
        serviceMocks.addPosPaymentAllocation
            .mockResolvedValueOnce({ allocation: gcashSession.allocations[0], session: gcashSession })
            .mockResolvedValueOnce({
                allocation: {
                    pos_payment_allocation_id: 701,
                    payment_method: 'cash',
                    status: 'successful',
                    applied_amount: 50,
                    cash_tendered: 100,
                    change_amount: 50
                },
                session: {
                    ...gcashSession,
                    status: 'ready_to_complete',
                    paid_amount: 300,
                    remaining_amount: 0,
                    allocations: [
                        ...gcashSession.allocations,
                        {
                            pos_payment_allocation_id: 701,
                            payment_method: 'cash',
                            status: 'successful',
                            applied_amount: 50,
                            cash_tendered: 100,
                            change_amount: 50
                        }
                    ]
                }
            });
        serviceMocks.completePosPaymentSession.mockResolvedValue({
            session: { ...gcashSession, status: 'completed', paid_amount: 300, remaining_amount: 0 },
            transaction: { pos_transaction_id: 992, total_amount: 300 }
        });
        const user = userEvent.setup();
        const onOpenChange = vi.fn();
        const onSessionStateChange = vi.fn();
        const onReadyToComplete = vi.fn().mockResolvedValue(true);

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={onOpenChange}
                onSessionStateChange={onSessionStateChange}
                onReadyToComplete={onReadyToComplete}
                cart={[{ item_id: 7, quantity: 1, sale_price: 300 }]}
                subtotalAmount={300}
                totalAmount={300}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="phase-64-render-test"
            />
        );

        await screen.findByText('Payment Methods');
        expect(screen.queryByText('Quick two-way split')).toBeNull();
        expect(screen.getByRole('combobox', { name: 'Method of payment 1' }).value).toBe('gcash');
        expect(screen.getByRole('combobox', { name: 'Method of payment 2' }).value).toBe('cash');
        const amountInput = screen.getByRole('spinbutton', { name: 'Amount for GCash' });
        const cashInput = screen.getByRole('spinbutton', { name: 'Amount for Cash' });
        expect(amountInput.value).toBe('');
        expect(cashInput.value).toBe('');
        await user.type(amountInput, '250');
        await user.type(cashInput, '100');
        expect(screen.queryByTestId('pos-payment-received-1')).toBeNull();
        expect(screen.queryByText(/This does not use PayMongo\./)).toBeNull();
        const summary = screen.getByTestId('pos-split-payment-summary');
        expect(summary.textContent).toContain('PaidPHP 300.00');
        expect(summary.textContent).toContain('RemainingPHP 0.00');
        expect(summary.textContent).toContain('ChangePHP 50.00');
        expect(screen.queryByTestId('pos-payment-rows-preview')).toBeNull();
        const completeButton = screen.getByRole('button', { name: 'Record Payment' });
        expect(completeButton.disabled).toBe(false);
        await user.click(completeButton);

        await waitFor(() => expect(serviceMocks.addPosPaymentAllocation).toHaveBeenCalledTimes(2));
        expect(serviceMocks.addPosPaymentAllocation).toHaveBeenNthCalledWith(1, 501, expect.objectContaining({
            payment_method: 'gcash',
            amount: 250,
            payment_handoff_mode: 'external',
            payment_provider: 'merchant_owned',
            manual_payment_received: true
        }));
        expect(serviceMocks.addPosPaymentAllocation).toHaveBeenNthCalledWith(2, 501, expect.objectContaining({
            payment_method: 'cash',
            amount: 100,
            payment_handoff_mode: 'internal'
        }));
        expect(serviceMocks.completePosPaymentSession).not.toHaveBeenCalled();
        expect(onSessionStateChange).toHaveBeenLastCalledWith(expect.objectContaining({
            active: true,
            recovered: false,
            session: expect.objectContaining({
                status: 'ready_to_complete',
                paid_amount: 300,
                remaining_amount: 0
            })
        }));
        expect(onReadyToComplete).toHaveBeenCalledOnce();
        expect(onReadyToComplete).toHaveBeenCalledWith(expect.objectContaining({
            status: 'ready_to_complete',
            remaining_amount: 0
        }));
        expect(screen.queryByText('Payment recorded')).toBeNull();
    });

    it('does not show a finish-sale recovery card when automatic sale completion fails', async () => {
        const ninetySession = {
            ...openSession,
            total_amount: 90,
            remaining_amount: 90
        };
        const readySession = {
            ...ninetySession,
            status: 'ready_to_complete',
            paid_amount: 90,
            remaining_amount: 0,
            allocations: [{
                pos_payment_allocation_id: 705,
                payment_method: 'gcash',
                payment_provider: 'merchant_owned',
                status: 'successful',
                applied_amount: 90
            }]
        };
        serviceMocks.createPosPaymentSession.mockResolvedValue(ninetySession);
        serviceMocks.addPosPaymentAllocation.mockResolvedValue({
            allocation: readySession.allocations[0],
            session: readySession
        });
        const onReadyToComplete = vi.fn().mockResolvedValue(false);
        const user = userEvent.setup();

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                onReadyToComplete={onReadyToComplete}
                cart={[{ item_id: 36, quantity: 1, sale_price: 90 }]}
                totalAmount={90}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="completion-retry"
            />
        );

        await screen.findByText('Payment Methods');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for GCash' }), '90');
        await user.click(screen.getByRole('button', { name: 'Record Payment' }));

        expect(await screen.findByText(/Payment was recorded, but the sale was not completed/)).toBeTruthy();
        expect(screen.getByTestId('pos-split-payment-dialog')).toBeTruthy();
        expect(onReadyToComplete).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Payment recorded')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Retry Finish Sale' })).toBeNull();
    });

    it('silently completes a recovered ready payment without showing a recovery card', async () => {
        const recoveredSession = {
            pos_payment_session_id: 501,
            status: 'ready_to_complete',
            total_amount: 90,
            paid_amount: 90,
            remaining_amount: 0,
            snapshot: { lines: [{ item_id: 36, quantity: 1, sale_price: 90 }] },
            allocations: []
        };
        window.localStorage.setItem('pos_split_payment_session:auto-complete-retry', JSON.stringify({
            session_id: 501,
            idempotency_key: 'existing-session-key'
        }));
        serviceMocks.fetchPosPaymentSession.mockResolvedValue(recoveredSession);
        const onOpenChange = vi.fn();
        const onReadyToComplete = vi.fn().mockResolvedValue(true);

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={onOpenChange}
                onReadyToComplete={onReadyToComplete}
                cart={[]}
                catalog={[{ item_id: 36, name: 'Chai Tea (Hot)' }]}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="auto-complete-retry"
            />
        );

        await waitFor(() => expect(serviceMocks.fetchPosPaymentSession).toHaveBeenCalled());
        expect(screen.queryByText('Payment recorded')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Retry Finish Sale' })).toBeNull();
        expect(serviceMocks.completePosPaymentSession).not.toHaveBeenCalled();
        await waitFor(() => expect(onReadyToComplete).toHaveBeenCalledWith(recoveredSession));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('adds a third payment row and records the selected Card method', async () => {
        serviceMocks.createPosPaymentSession.mockResolvedValue(openSession);
        const readySession = {
            ...openSession,
            status: 'ready_to_complete',
            paid_amount: 1250,
            remaining_amount: 0,
            allocations: [{
                pos_payment_allocation_id: 702,
                payment_method: 'card',
                payment_provider: 'merchant_owned',
                status: 'successful',
                applied_amount: 1250
            }]
        };
        serviceMocks.addPosPaymentAllocation.mockResolvedValue({
            allocation: readySession.allocations[0],
            session: readySession
        });
        serviceMocks.completePosPaymentSession.mockResolvedValue({
            session: { ...readySession, status: 'completed' },
            transaction: { pos_transaction_id: 994, total_amount: 1250 }
        });
        const user = userEvent.setup();
        const onReadyToComplete = vi.fn().mockResolvedValue(true);

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                onReadyToComplete={onReadyToComplete}
                cart={[{ item_id: 7, quantity: 1, sale_price: 1250 }]}
                totalAmount={1250}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="more-payment-methods"
            />
        );

        await screen.findByText('Payment Methods');
        await user.click(screen.getByRole('button', { name: /Add Another Payment/ }));
        expect(screen.getByRole('combobox', { name: 'Method of payment 3' }).value).toBe('maya');
        await user.selectOptions(screen.getByRole('combobox', { name: 'Method of payment 3' }), 'card');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for Card' }), '1250');
        await user.click(screen.getByRole('button', { name: 'Record Payment' }));

        await waitFor(() => expect(serviceMocks.addPosPaymentAllocation).toHaveBeenCalledWith(501, expect.objectContaining({
            payment_method: 'card',
            amount: 1250,
            payment_provider: 'merchant_owned',
            manual_payment_received: true
        })));
        expect(serviceMocks.completePosPaymentSession).not.toHaveBeenCalled();
        expect(onReadyToComplete).toHaveBeenCalledWith(readySession);
    });

    it('keeps GCash visible and retries only cash when the second field fails', async () => {
        serviceMocks.createPosPaymentSession.mockResolvedValue(openSession);
        const gcashSession = {
            ...openSession,
            status: 'partially_paid',
            paid_amount: 500,
            remaining_amount: 750,
            allocations: [{
                pos_payment_allocation_id: 700,
                payment_method: 'gcash',
                payment_provider: 'merchant_owned',
                status: 'successful',
                applied_amount: 500
            }]
        };
        serviceMocks.addPosPaymentAllocation
            .mockResolvedValueOnce({ allocation: gcashSession.allocations[0], session: gcashSession })
            .mockRejectedValueOnce(new Error('Cash recording interrupted'));
        serviceMocks.fetchPosPaymentSession.mockResolvedValue(gcashSession);
        const user = userEvent.setup();

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 7, quantity: 1, sale_price: 1250 }]}
                subtotalAmount={1250}
                totalAmount={1250}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="sequential-partial-recovery"
            />
        );

        await screen.findByText('Payment Methods');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for GCash' }), '500');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for Cash' }), '750');
        await user.click(screen.getByRole('button', { name: 'Record Payment' }));

        expect(await screen.findByText(/GCash was recorded, but the remaining payment was not completed/)).toBeTruthy();
        expect(screen.getAllByText('PHP 500.00').length).toBeGreaterThan(0);
        expect(screen.getByRole('spinbutton', { name: 'Amount for Cash' }).value).toBe('750');
        expect(screen.getByRole('spinbutton', { name: 'Amount for GCash' }).value).toBe('');
        expect(screen.getByRole('button', { name: 'Record Payment' }).disabled).toBe(false);
    });

    it('reconciles a persisted digital row when its response is interrupted', async () => {
        serviceMocks.createPosPaymentSession.mockResolvedValue(openSession);
        const recoveredSession = {
            ...openSession,
            status: 'partially_paid',
            paid_amount: 500,
            remaining_amount: 750,
            allocations: [{
                pos_payment_allocation_id: 703,
                payment_method: 'gcash',
                payment_provider: 'merchant_owned',
                status: 'successful',
                applied_amount: 500
            }]
        };
        serviceMocks.addPosPaymentAllocation.mockRejectedValueOnce(new Error('Response interrupted'));
        serviceMocks.fetchPosPaymentSession.mockResolvedValue(recoveredSession);
        const user = userEvent.setup();

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 7, quantity: 1, sale_price: 1250 }]}
                totalAmount={1250}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="response-loss-recovery"
            />
        );

        await screen.findByText('Payment Methods');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for GCash' }), '500');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for Cash' }), '750');
        await user.click(screen.getByRole('button', { name: 'Record Payment' }));

        expect(await screen.findByText(/GCash was recorded, but the remaining payment was not completed/)).toBeTruthy();
        expect(screen.getByRole('spinbutton', { name: 'Amount for GCash' }).value).toBe('');
        expect(screen.getByRole('spinbutton', { name: 'Amount for Cash' }).value).toBe('750');
        expect(screen.getByRole('button', { name: 'Record Payment' }).disabled).toBe(false);
    });
});
