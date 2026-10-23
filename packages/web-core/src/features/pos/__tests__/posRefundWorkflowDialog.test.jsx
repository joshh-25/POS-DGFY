/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePosRefundWorkflow } from '../components/POSRefundWorkflowDialog.jsx';
import POSRefundWorkflowDialog from '../components/POSRefundWorkflowDialog.jsx';

const cashRefundTransaction = {
    pos_transaction_id: 7,
    invoice_number: 'NFS-000007',
    payment_type: 'cash',
    payment_status: 'paid',
    total_amount: 100,
    financial_outcome: {
        refund_required: true,
        refund_amount: 100,
        next_action: 'record_cash_refund_with_cash_drawer_event',
        reason_code: 'CASH_REFUND_REQUIRED'
    }
};

afterEach(() => {
    cleanup();
});

describe('POS refund workflow resolution', () => {
    it('routes a stale provider outcome back to the cash drawer workflow', () => {
        expect(resolvePosRefundWorkflow({
            payment_type: null,
            payment_breakdown: JSON.stringify([
                { payment_type: 'cash', amount: 90 },
                { payment_type: 'gcash', amount: 0 },
                { payment_type: 'card', amount: 0 }
            ]),
            financial_outcome: {
                next_action: 'confirm_provider_ownership_and_refund'
            }
        })).toBe('cash');
    });

    it('keeps funded split allocations on the split workflow', () => {
        expect(resolvePosRefundWorkflow({
            payment_type: 'cash',
            payment_breakdown: [
                { payment_type: 'cash', amount: 100 },
                { payment_type: 'card', amount: 50 }
            ],
            financial_outcome: {
                next_action: 'confirm_provider_ownership_and_refund'
            }
        })).toBe('split');
    });

    it('keeps a no-shift cash refund pending and offers shift-controls recovery', () => {
        const onOpenChange = vi.fn();
        const onOpenShiftControls = vi.fn();

        render(
            <POSRefundWorkflowDialog
                transaction={cashRefundTransaction}
                open
                hasActiveShift={false}
                onOpenChange={onOpenChange}
                onOpenShiftControls={onOpenShiftControls}
            />
        );

        expect(screen.getByTestId('pos-refund-shift-required').textContent).toContain('Cash refund pending');
        expect(screen.getByRole('button', { name: 'Confirm refund action' }).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Go to Shift Controls' }));

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onOpenShiftControls).toHaveBeenCalledTimes(1);
    });

    it('allows a single cash-refund submission once an acting shift is active', () => {
        const onSubmit = vi.fn();

        render(
            <POSRefundWorkflowDialog
                transaction={cashRefundTransaction}
                open
                hasActiveShift
                onSubmit={onSubmit}
            />
        );

        fireEvent.change(screen.getByLabelText('Refund reason'), { target: { value: 'Customer return' } });
        const submit = screen.getByRole('button', { name: 'Confirm refund action' });
        expect(submit.disabled).toBe(false);
        fireEvent.click(submit);

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
            workflow: 'cash',
            reason: 'Customer return'
        }));
    });

    it('contains a rejected refund action instead of leaking an unhandled rejection', async () => {
        const error = Object.assign(new Error('Request failed with status code 409'), {
            name: 'AxiosError',
            isAxiosError: true,
            response: {
                status: 409,
                data: { message: 'Void the POS transaction before requesting a provider refund' }
            }
        });
        const onSubmit = vi.fn().mockRejectedValue(error);
        const unhandledRejection = vi.fn();

        render(
            <POSRefundWorkflowDialog
                transaction={cashRefundTransaction}
                open
                hasActiveShift
                onSubmit={onSubmit}
            />
        );

        fireEvent.change(screen.getByLabelText('Refund reason'), { target: { value: 'Customer return' } });
        const submit = screen.getByRole('button', { name: 'Confirm refund action' });
        process.on('unhandledRejection', unhandledRejection);

        try {
            fireEvent.click(submit);
            await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(unhandledRejection).not.toHaveBeenCalled();
            expect(screen.getByTestId('pos-refund-workflow-dialog')).toBeTruthy();
            expect(submit.disabled).toBe(false);

            fireEvent.click(submit);
            await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(unhandledRejection).not.toHaveBeenCalled();
        } finally {
            process.removeListener('unhandledRejection', unhandledRejection);
        }
    });

    it('reuses the original void reason instead of asking for a second refund reason', () => {
        const onSubmit = vi.fn();

        render(
            <POSRefundWorkflowDialog
                transaction={{ ...cashRefundTransaction, void_reason: 'Customer refund approved' }}
                open
                hasActiveShift
                onSubmit={onSubmit}
            />
        );

        const reasonInput = screen.getByDisplayValue('Customer refund approved');
        expect(reasonInput.value).toBe('Customer refund approved');
        expect(reasonInput.readOnly).toBe(true);
        expect(screen.getByText('Reused from the original void reason and recorded with this refund.')).toBeTruthy();

        const submit = screen.getByRole('button', { name: 'Confirm refund action' });
        expect(submit.disabled).toBe(false);
        fireEvent.click(submit);

        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
            workflow: 'cash',
            reason: 'Customer refund approved'
        }));
    });

    it('inherits an item-void reason when the transaction detail arrives after the dialog opens', async () => {
        const onSubmit = vi.fn();
        const { rerender } = render(
            <POSRefundWorkflowDialog
                transaction={cashRefundTransaction}
                open
                hasActiveShift
                onSubmit={onSubmit}
            />
        );

        expect(screen.getByLabelText('Refund reason').value).toBe('');

        rerender(
            <POSRefundWorkflowDialog
                transaction={{
                    ...cashRefundTransaction,
                    item_void_adjustment_id: 42,
                    adjustments: [{
                        pos_transaction_adjustment_id: 42,
                        item_voided: true,
                        reason: 'Damaged item'
                    }]
                }}
                open
                hasActiveShift
                onSubmit={onSubmit}
            />
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('Damaged item').value).toBe('Damaged item');
        });
        expect(screen.getByDisplayValue('Damaged item').readOnly).toBe(true);
    });

    it('disables both refund submission and navigation while a refund is submitting', () => {
        render(
            <POSRefundWorkflowDialog
                transaction={cashRefundTransaction}
                open
                hasActiveShift={false}
                submitting
            />
        );

        expect(screen.getByRole('button', { name: 'Recording…' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Go to Shift Controls' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    });
});
