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
    ])('restores a saved paid sale with its item summary and clears the recovery lock at %s width', async (_viewport, width) => {
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
        let finishCompletion;
        serviceMocks.completePosPaymentSession.mockImplementation(() => new Promise((resolve) => {
            finishCompletion = () => resolve({
                session: { ...recoveredSession, status: 'completed' },
                transaction: { pos_transaction_id: 991, total_amount: 90 }
            });
        }));
        const onSessionStateChange = vi.fn();
        const onCompleted = vi.fn();
        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[]}
                catalog={[{ item_id: 36, name: 'Chai Tea (Hot)' }]}
                subtotalAmount={0}
                totalAmount={0}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="refresh-recovery"
                onSessionStateChange={onSessionStateChange}
                onCompleted={onCompleted}
            />
        );

        expect(await screen.findByText('Sale awaiting completion')).toBeTruthy();
        expect(screen.getByText('Chai Tea (Hot)')).toBeTruthy();
        expect(screen.getByText('Qty 1 × PHP 90.00')).toBeTruthy();
        expect(screen.getByText('Payment session: PAY-RECOVERY-501')).toBeTruthy();
        await waitFor(() => expect(serviceMocks.completePosPaymentSession).toHaveBeenCalledTimes(1));
        expect(screen.getByText('Finishing sale…')).toBeTruthy();
        await waitFor(() => expect(onSessionStateChange).toHaveBeenCalledWith(expect.objectContaining({
            active: true,
            recovered: true,
            session: recoveredSession
        })));

        finishCompletion();
        await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
        expect(onSessionStateChange).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
        expect(window.localStorage.getItem('pos_split_payment_session:refresh-recovery')).toBeNull();
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

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
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
        expect(screen.getByText(/This does not use PayMongo\./)).toBeTruthy();
        const preview = screen.getByTestId('pos-payment-rows-preview');
        expect(preview.textContent).toContain('Non-cash appliedPHP 250.00');
        expect(preview.textContent).toContain('Cash appliedPHP 50.00');
        expect(preview.textContent).toContain('Change duePHP 50.00');
        expect(preview.textContent).toContain('Still duePHP 0.00');
        const completeButton = screen.getByRole('button', { name: 'Complete Payment' });
        expect(completeButton.disabled).toBe(true);
        await user.click(screen.getByTestId('pos-payment-received-1').querySelector('input'));
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
        await waitFor(() => expect(serviceMocks.completePosPaymentSession).toHaveBeenCalledTimes(1));
        expect(serviceMocks.completePosPaymentSession).toHaveBeenCalledWith(501, expect.objectContaining({
            idempotency_key: 'split-complete:501'
        }));
    });

    it('shows one retry action when automatic completion fails without looping', async () => {
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
        serviceMocks.completePosPaymentSession
            .mockRejectedValueOnce(new Error('Temporary checkout failure'))
            .mockResolvedValueOnce({
                session: { ...recoveredSession, status: 'completed' },
                transaction: { pos_transaction_id: 993, total_amount: 90 }
            });
        const onCompleted = vi.fn();
        const user = userEvent.setup();

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[]}
                catalog={[{ item_id: 36, name: 'Chai Tea (Hot)' }]}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                storageScopeKey="auto-complete-retry"
                onCompleted={onCompleted}
            />
        );

        expect(await screen.findByRole('button', { name: 'Retry Finish Sale' })).toBeTruthy();
        expect(serviceMocks.completePosPaymentSession).toHaveBeenCalledTimes(1);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(serviceMocks.completePosPaymentSession).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Retry Finish Sale' }));
        await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
        expect(serviceMocks.completePosPaymentSession).toHaveBeenCalledTimes(2);
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

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
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
        await user.click(screen.getByTestId('pos-payment-received-3').querySelector('input'));
        await user.click(screen.getByRole('button', { name: 'Complete Payment' }));

        await waitFor(() => expect(serviceMocks.addPosPaymentAllocation).toHaveBeenCalledWith(501, expect.objectContaining({
            payment_method: 'card',
            amount: 1250,
            payment_provider: 'merchant_owned',
            manual_payment_received: true
        })));
        await waitFor(() => expect(serviceMocks.completePosPaymentSession).toHaveBeenCalledTimes(1));
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
        await user.click(screen.getByTestId('pos-payment-received-1').querySelector('input'));
        await user.click(screen.getByRole('button', { name: 'Complete Payment' }));

        expect(await screen.findByText(/GCash was recorded, but the remaining payment was not completed/)).toBeTruthy();
        expect(screen.getAllByText('PHP 500.00').length).toBeGreaterThan(0);
        expect(screen.getByRole('spinbutton', { name: 'Amount for Cash' }).value).toBe('750');
        expect(screen.getByRole('spinbutton', { name: 'Amount for GCash' }).value).toBe('');
        expect(screen.getByRole('button', { name: 'Complete Payment' }).disabled).toBe(false);
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
        await user.click(screen.getByTestId('pos-payment-received-1').querySelector('input'));
        await user.click(screen.getByRole('button', { name: 'Complete Payment' }));

        expect(await screen.findByText(/GCash was recorded, but the remaining payment was not completed/)).toBeTruthy();
        expect(screen.getByRole('spinbutton', { name: 'Amount for GCash' }).value).toBe('');
        expect(screen.getByRole('spinbutton', { name: 'Amount for Cash' }).value).toBe('750');
        expect(screen.getByRole('button', { name: 'Complete Payment' }).disabled).toBe(false);
    });
});
