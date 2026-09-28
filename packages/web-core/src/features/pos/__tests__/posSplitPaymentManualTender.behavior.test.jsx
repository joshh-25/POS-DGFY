// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const serviceMocks = vi.hoisted(() => ({
    addPosPaymentAllocation: vi.fn(),
    cancelPosPaymentAllocation: vi.fn(),
    cancelPosPaymentSession: vi.fn(),
    completePosPaymentSession: vi.fn(),
    createPosPaymentSession: vi.fn(),
    fetchPosPaymentSession: vi.fn()
}));
const employeeCreditServiceMocks = vi.hoisted(() => ({
    fetchEmployeeCreditCheckoutOptions: vi.fn().mockResolvedValue([]),
    fetchEmployeeCreditAccount: vi.fn().mockResolvedValue({
        account_code: 'EC-44',
        outstanding_balance: 0
    })
}));

vi.mock('../services/posService.js', () => serviceMocks);
vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: { error: vi.fn(), message: vi.fn(), success: vi.fn() }
}));
vi.mock('../services/employeeCreditService.js', () => employeeCreditServiceMocks);

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
    employeeCreditServiceMocks.fetchEmployeeCreditCheckoutOptions.mockResolvedValue([]);
});

describe('POS manual walk-in tender', () => {
    it('does not create a server session until a payment is recorded', async () => {
        serviceMocks.createPosPaymentSession.mockResolvedValue(openSession);
        const onSessionStateChange = vi.fn();
        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[]}
                totalAmount={1250}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                onSessionStateChange={onSessionStateChange}
            />
        );

        await screen.findByText('Payment Methods');
        expect(serviceMocks.createPosPaymentSession).not.toHaveBeenCalled();
        expect(serviceMocks.fetchPosPaymentSession).not.toHaveBeenCalled();
        expect(window.localStorage.length).toBe(0);
        expect(onSessionStateChange).not.toHaveBeenCalled();
    });

    it('does not auto-complete a ready session because opening the checkout is side-effect free', async () => {
        const readySession = {
            ...openSession,
            status: 'ready_to_complete',
            paid_amount: 1250,
            remaining_amount: 0,
            allocations: []
        };
        serviceMocks.createPosPaymentSession.mockResolvedValue(readySession);
        const onReadyToComplete = vi.fn().mockResolvedValue(true);
        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                onReadyToComplete={onReadyToComplete}
                cart={[]}
                totalAmount={1250}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
            />
        );

        await waitFor(() => expect(screen.getByTestId('pos-split-payment-dialog')).toBeTruthy());
        expect(serviceMocks.createPosPaymentSession).not.toHaveBeenCalled();
        expect(onReadyToComplete).not.toHaveBeenCalled();
        expect(serviceMocks.completePosPaymentSession).not.toHaveBeenCalled();
        expect(screen.queryByTestId('pos-split-payment-saved-sale')).toBeNull();
    });

    it('does not restart the session request when the checkout snapshot object changes identity', async () => {
        serviceMocks.createPosPaymentSession.mockResolvedValue({
            ...openSession,
            total_amount: 90,
            remaining_amount: 90
        });
        const user = userEvent.setup();
        const view = render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 36, quantity: 1, sale_price: 90 }]}
                totalAmount={90}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                checkoutSnapshot={{ schema_version: 1, lines: [{ item_id: 36, quantity: 1, sale_price: 90 }] }}
            />
        );

        await screen.findByText('Payment Methods');
        expect(serviceMocks.createPosPaymentSession).not.toHaveBeenCalled();

        await user.type(screen.getByRole('spinbutton', { name: 'Amount for GCash' }), '90');
        await user.click(screen.getByRole('button', { name: 'Record Payment' }));
        await waitFor(() => expect(serviceMocks.createPosPaymentSession).toHaveBeenCalledTimes(1));

        view.rerender(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 36, quantity: 1, sale_price: 90 }]}
                totalAmount={90}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                checkoutSnapshot={{ schema_version: 1, lines: [{ item_id: 36, quantity: 1, sale_price: 90 }] }}
            />
        );

        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(serviceMocks.createPosPaymentSession).toHaveBeenCalledTimes(1);
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
            />
        );

        await screen.findByText('Payment Methods');
        expect(screen.queryByText('Quick two-way split')).toBeNull();
        expect(within(screen.getByTestId('pos-payment-method-1')).getByRole('button', { name: 'GCash' }).getAttribute('aria-pressed')).toBe('true');
        expect(within(screen.getByTestId('pos-payment-method-2')).getByRole('button', { name: 'Cash' }).getAttribute('aria-pressed')).toBe('true');
        const amountInput = screen.getByRole('spinbutton', { name: 'Amount for GCash' });
        const cashInput = screen.getByRole('spinbutton', { name: 'Amount for Cash' });
        expect(amountInput.value).toBe('');
        expect(cashInput.value).toBe('');
        await user.type(amountInput, '250');
        await user.type(cashInput, '100');
        expect(screen.queryByTestId('pos-payment-received-1')).toBeNull();
        expect(screen.queryByText(/This does not use PayMongo\./)).toBeNull();
        const summary = screen.getByTestId('pos-split-payment-summary');
        expect(summary.textContent).toContain('Paid₱300.00');
        expect(summary.textContent).toContain('Remaining₱0.00');
        expect(summary.textContent).toContain('Change₱50.00');
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

    it('does not expose Employee Credit to an unauthorized operator', async () => {
        serviceMocks.createPosPaymentSession.mockResolvedValue(openSession);

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 7, quantity: 1, sale_price: 1250 }]}
                totalAmount={1250}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
            />
        );

        await screen.findByText('Payment Methods');
        expect(screen.queryByTestId('pos-payment-method-1-employee_credit')).toBeNull();
        expect(employeeCreditServiceMocks.fetchEmployeeCreditCheckoutOptions).not.toHaveBeenCalled();
    });

    it('does not expose Employee Credit when the location has no eligible account', async () => {
        serviceMocks.createPosPaymentSession.mockResolvedValue(openSession);

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                cart={[{ item_id: 7, quantity: 1, sale_price: 1250 }]}
                totalAmount={1250}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                canUseEmployeeCredit
            />
        );

        await screen.findByText('Payment Methods');
        await waitFor(() => expect(employeeCreditServiceMocks.fetchEmployeeCreditCheckoutOptions).toHaveBeenCalledWith({ locationId: 3, limit: 50 }));
        expect(screen.queryByTestId('pos-payment-method-1-employee_credit')).toBeNull();
    });

    it('records a verified Employee Credit portion together with cash', async () => {
        const threeHundredSession = {
            ...openSession,
            total_amount: 300,
            remaining_amount: 300
        };
        serviceMocks.createPosPaymentSession.mockResolvedValue(threeHundredSession);
        const employeeCreditSession = {
            ...threeHundredSession,
            status: 'partially_paid',
            paid_amount: 150,
            remaining_amount: 150,
            allocations: [{
                pos_payment_allocation_id: 701,
                payment_method: 'employee_credit',
                status: 'successful',
                applied_amount: 150
            }]
        };
        const readySession = {
            ...employeeCreditSession,
            status: 'ready_to_complete',
            paid_amount: 300,
            remaining_amount: 0,
            allocations: [
                ...employeeCreditSession.allocations,
                {
                    pos_payment_allocation_id: 702,
                    payment_method: 'cash',
                    status: 'successful',
                    applied_amount: 150,
                    cash_tendered: 200,
                    change_amount: 50
                }
            ]
        };
        serviceMocks.addPosPaymentAllocation
            .mockResolvedValueOnce({ allocation: employeeCreditSession.allocations[0], session: employeeCreditSession })
            .mockResolvedValueOnce({ allocation: readySession.allocations[1], session: readySession });
        employeeCreditServiceMocks.fetchEmployeeCreditCheckoutOptions.mockResolvedValue([{
            account_code: 'EC-44',
            is_active: true,
            account_configured: true,
            is_eligible: true
        }]);
        const onReadyToComplete = vi.fn().mockResolvedValue(true);
        const user = userEvent.setup();

        render(
            <POSSplitPaymentDialog
                open
                onOpenChange={vi.fn()}
                onReadyToComplete={onReadyToComplete}
                cart={[{ item_id: 7, quantity: 1, sale_price: 300 }]}
                totalAmount={300}
                shiftId={41}
                locationId={3}
                terminalId="COUNTER-01"
                employeeCreditAccountCode="EC-44"
                employeeCreditAccount={{ account_code: 'EC-44', outstanding_balance: 0 }}
                canUseEmployeeCredit
                selectedEmployeeCreditOption={{
                    option_key: 'employee:44',
                    employee_name: 'Employee 44',
                    employee_code: 'EMP-44',
                    branch_name: 'Main',
                    account_code: 'EC-44',
                    is_eligible: true
                }}
            />
        );

        await screen.findByText('Payment Methods');
        await user.click(within(screen.getByTestId('pos-payment-method-1')).getByRole('button', { name: 'Employee Credit' }));
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for Employee Credit' }), '150');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for Cash' }), '150');
        await user.click(screen.getByRole('button', { name: 'Record Payment' }));

        await waitFor(() => expect(serviceMocks.addPosPaymentAllocation).toHaveBeenCalledTimes(2));
        expect(serviceMocks.addPosPaymentAllocation).toHaveBeenNthCalledWith(1, 501, expect.objectContaining({
            payment_method: 'employee_credit',
            amount: 150,
            payment_handoff_mode: 'internal',
            employee_credit: { account_code: 'EC-44' }
        }));
        expect(serviceMocks.addPosPaymentAllocation).toHaveBeenNthCalledWith(2, 501, expect.objectContaining({
            payment_method: 'cash',
            amount: 150,
            payment_handoff_mode: 'internal'
        }));
        expect(serviceMocks.addPosPaymentAllocation.mock.calls[0][1]).not.toHaveProperty('manual_payment_received');
        expect(onReadyToComplete).toHaveBeenCalledOnce();
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
            />
        );

        await screen.findByText('Payment Methods');
        await user.click(screen.getByRole('button', { name: /Add Another Payment/ }));
        const thirdMethodGroup = screen.getByTestId('pos-payment-method-3');
        expect(within(thirdMethodGroup).getByRole('button', { name: 'Maya' }).getAttribute('aria-pressed')).toBe('true');
        await user.click(within(thirdMethodGroup).getByRole('button', { name: 'Card' }));
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
            />
        );

        await screen.findByText('Payment Methods');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for GCash' }), '500');
        await user.type(screen.getByRole('spinbutton', { name: 'Amount for Cash' }), '750');
        await user.click(screen.getByRole('button', { name: 'Record Payment' }));

        expect(await screen.findByText(/GCash was recorded, but the remaining payment was not completed/)).toBeTruthy();
        expect(screen.getAllByText('₱500.00').length).toBeGreaterThan(0);
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
