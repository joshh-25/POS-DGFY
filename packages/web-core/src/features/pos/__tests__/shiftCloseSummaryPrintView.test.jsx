// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShiftCloseSummaryPrintView from '../components/ShiftCloseSummaryPrintView.jsx';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('ShiftCloseSummaryPrintView', () => {
    it('shows the existing shift, sales, payment, cash, and post-close summary fields', () => {
        render(
            <ShiftCloseSummaryPrintView
                report={{
                    shift: {
                        pos_terminal_shift_id: 8,
                        business_date: '2026-08-16',
                        terminal_id: 'COUNTER-01',
                        status: 'closed',
                        opened_at: '2026-08-16T04:51:36.000Z',
                        closed_at: '2026-08-16T04:54:31.000Z',
                        cashier: { display_name: 'Hendry' }
                    },
                    cash_summary: {
                        opening_float_amount: 5000,
                        cash_sales_amount: 0,
                        cash_in_total: 0,
                        cash_out_total: 0,
                        expected_cash_amount: 5000,
                        closing_cash_amount: 842,
                        cash_variance_amount: -4158
                    },
                    sales_summary: {
                        transaction_count: 2,
                        total_amount: 837,
                        discount_amount: 0,
                        void_transaction_count: 0,
                        void_amount: 0,
                        payment_breakdown: [{ payment_type: 'gcash', count: 1, amount: 142 }],
                        post_close_adjustment_count: 1,
                        post_close_refund_amount: 125,
                        post_close_pending_amount: 0,
                        post_close_manual_review_amount: 0,
                        post_close_adjustments: [{
                            pos_transaction_adjustment_id: 9,
                            adjustment_reference: 'PRA-9',
                            adjustment_type: 'cash_refund',
                            amount: 125,
                            status: 'succeeded',
                            actor_name: 'Admin One',
                            actor_shift_id: 91,
                            event_at: '2026-08-16T05:00:00.000Z'
                        }]
                    }
                }}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByRole('dialog', { name: /shift 8/i })).toBeTruthy();
        expect(screen.getByText('Payment method breakdown')).toBeTruthy();
        expect(screen.getByText('Cash reconciliation')).toBeTruthy();
        expect(screen.getByText('Closing cash')).toBeTruthy();
        expect(screen.getByText('Post-close adjustment accountability')).toBeTruthy();
        expect(screen.getByText(/Actioned by Admin One/)).toBeTruthy();
        expect(screen.queryByText('Sales summary')).toBeNull();
        expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Paper' }).textContent).toContain('80mm (3 1/8 in)');
    });

    it('uses the saved POS paper width and applies the selected width to browser printing', () => {
        const print = vi.spyOn(window, 'print').mockImplementation(() => {});
        function PaperWidthHarness() {
            const [paperWidth, setPaperWidth] = useState('57mm');
            return (
                <ShiftCloseSummaryPrintView
                    report={{ shift: { pos_terminal_shift_id: 12 } }}
                    paperWidth={paperWidth}
                    onPaperWidthChange={setPaperWidth}
                    onClose={vi.fn()}
                />
            );
        }

        const { container } = render(<PaperWidthHarness />);

        const paperSelect = screen.getByRole('combobox', { name: 'Paper' });
        expect(paperSelect.textContent).toContain('57mm (2 1/4 in)');

        fireEvent.click(paperSelect);
        expect(screen.getByRole('listbox', { name: 'Paper size options' })).toBeTruthy();
        expect(screen.getByRole('option', { name: '57mm (2 1/4 in)' }).getAttribute('aria-selected')).toBe('true');
        fireEvent.click(screen.getByRole('option', { name: '80mm (3 1/8 in)' }));
        expect(paperSelect.textContent).toContain('80mm (3 1/8 in)');
        expect(paperSelect.getAttribute('aria-expanded')).toBe('false');
        expect(container.querySelector('.pos-shift-summary-print-shell').style.getPropertyValue('--pos-shift-summary-paper-width')).toBe('80mm');

        const printButton = screen.getByRole('button', { name: 'Print', exact: true });
        const doneButton = screen.getByRole('button', { name: 'Done', exact: true });
        expect(printButton.parentElement).toBe(doneButton.parentElement);
        expect(printButton.parentElement.className).not.toContain('flex-col');
        expect(printButton.className).toContain('min-h-11');

        fireEvent.click(printButton);
        expect(print).toHaveBeenCalledOnce();
    });
});
