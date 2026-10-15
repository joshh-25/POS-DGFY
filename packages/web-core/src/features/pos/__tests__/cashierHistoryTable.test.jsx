// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CashierHistoryTable from '../components/CashierHistoryTable.jsx';
import {
    formatCashierHistoryDateTime,
    formatCashierHistoryTableDate
} from '../utils/cashierHistoryFormatters.js';

afterEach(() => cleanup());

describe('CashierHistoryTable', () => {
    it('formats every month with a readable abbreviated month name', () => {
        const monthLabels = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

        monthLabels.forEach((monthLabel, monthIndex) => {
            const month = String(monthIndex + 1).padStart(2, '0');
            expect(formatCashierHistoryTableDate(`2026-${month}-20T12:00:00.000Z`))
                .toBe(`${monthLabel} 20, 2026`);
        });

        expect(formatCashierHistoryDateTime('2026-10-07T09:00:00.000Z'))
            .toMatch(/^Oct\. 7, 2026,/);
    });

    it('keeps the cashier column, hides payment methods from the dense table, and preserves the summary action', () => {
        const onViewSummary = vi.fn();
        const record = {
            shift: {
                pos_terminal_shift_id: 8,
                business_date: '2026-08-16',
                terminal_id: 'COUNTER-01',
                status: 'closed',
                opened_at: '2026-09-20T04:51:36.000Z',
                closed_at: '2026-09-20T04:54:31.000Z'
            },
            cash_summary: { cash_sales_amount: 0 },
            sales_summary: {
                transaction_count: 2,
                total_amount: 837,
                payment_breakdown: [
                    { payment_type: 'gcash', count: 1, amount: 142 },
                    { payment_type: 'card', count: 1, amount: 695 }
                ]
            }
        };

        render(
            <CashierHistoryTable
                records={[record]}
                cashierName="Hendry"
                onViewSummary={onViewSummary}
            />
        );

        const tableRegion = screen.getByRole('region', { name: 'Cashier shift history table' });
        const table = screen.getByRole('table', { name: 'Cashier shift history' });
        const mobileView = screen.getByTestId('pos-cashier-history-mobile-view');
        const openedAtRow = within(mobileView).getByText('Opened at').parentElement;
        const totalSalesRow = within(mobileView).getByText('Total sales').parentElement;
        expect(table).toBeTruthy();
        expect(tableRegion.tabIndex).toBe(0);
        expect(screen.getByText('Scroll horizontally to view all columns.')).toBeTruthy();
        expect(within(table).getByRole('columnheader', { name: 'Cashier' })).toBeTruthy();
        expect(within(table).queryByRole('columnheader', { name: 'Payment Methods' })).toBeNull();
        expect(within(mobileView).getByText('#8')).toBeTruthy();
        expect(within(mobileView).getByText('Hendry')).toBeTruthy();
        expect(within(mobileView).getAllByText('Sep. 20, 2026')).toHaveLength(2);
        expect(within(table).getByText('2m 55s')).toBeTruthy();
        expect(within(mobileView).getByText('₱837.00')).toBeTruthy();
        expect(openedAtRow?.querySelector('dd')?.className).toContain('text-right');
        expect(totalSalesRow?.querySelector('dd')?.className).toContain('text-right');
        expect(within(mobileView).getByText('Closed')).toBeTruthy();

        fireEvent.click(within(mobileView).getByRole('button', { name: 'Show details for shift #8' }));
        expect(within(mobileView).getByRole('region', { name: 'Additional details for shift #8' })).toBeTruthy();
        expect(within(mobileView).getByText('2m 55s')).toBeTruthy();
        fireEvent.click(within(mobileView).getByRole('button', { name: 'View summary for shift #8' }));

        expect(onViewSummary).toHaveBeenCalledWith(record);
    });

    it('does not invent a close time or duration for an open shift', () => {
        render(
            <CashierHistoryTable
                records={[{
                    shift: {
                        pos_terminal_shift_id: 9,
                        status: 'open',
                        opened_at: '2026-08-16T04:51:36.000Z'
                    },
                    sales_summary: {},
                    cash_summary: {}
                }]}
            />
        );

        const mobileView = screen.getByTestId('pos-cashier-history-mobile-view');
        expect(within(mobileView).getByText('Open')).toBeTruthy();
        expect(within(mobileView).getByRole('button', { name: 'View summary for shift #9' })).toBeTruthy();
    });

    it('displays the API cashier username in the desktop history table', () => {
        render(
            <CashierHistoryTable
                records={[{
                    shift: {
                        pos_terminal_shift_id: 11,
                        status: 'closed',
                        cashier: { user_id: 42, username: 'Hernando' }
                    },
                    sales_summary: {},
                    cash_summary: {}
                }]}
            />
        );

        const table = screen.getByRole('table', { name: 'Cashier shift history' });
        expect(within(table).getByText('Hernando')).toBeTruthy();
        expect(within(table).queryByText('Unknown cashier')).toBeNull();
    });

    it('keeps branch and post-close accountability available in the responsive history view', () => {
        const record = {
            shift: {
                pos_terminal_shift_id: 10,
                terminal_id: 'COUNTER-02',
                status: 'closed',
                opened_at: '2026-08-16T04:51:36.000Z',
                location: { name: 'Second Branch' },
                cashier: { display_name: 'Maya Cashier' }
            },
            cash_summary: {},
            sales_summary: {
                post_close_adjustment_count: 1,
                post_close_refund_amount: 125,
                post_close_adjustments: [{
                    pos_transaction_adjustment_id: 9,
                    adjustment_reference: 'PRA-9',
                    adjustment_type: 'cash_refund',
                    amount: 125,
                    status: 'succeeded',
                    actor_name: 'Admin One',
                    actor_shift_id: 91,
                    event_at: '2026-08-16T12:00:00.000Z'
                }]
            }
        };

        render(<CashierHistoryTable records={[record]} />);

        const table = screen.getByRole('table', { name: 'Cashier shift history' });
        expect(within(table).getByRole('columnheader', { name: 'Branch' })).toBeTruthy();
        expect(within(table).getByRole('columnheader', { name: 'Post-close' })).toBeTruthy();
        expect(within(table).getByText('Second Branch')).toBeTruthy();
        expect(within(table).getByText(/1 refunds · ₱125\.00/)).toBeTruthy();

        const mobileView = screen.getByTestId('pos-cashier-history-mobile-view');
        fireEvent.click(within(mobileView).getByRole('button', { name: 'Show details for shift #10' }));
        expect(within(mobileView).getByText('Second Branch')).toBeTruthy();
        const accountabilityItems = within(mobileView).getAllByText((_, element) => (
            element?.tagName === 'LI'
            && element.textContent.includes('cash refund')
            && element.textContent.includes('₱125.00')
            && element.textContent.includes('succeeded')
            && element.textContent.includes('By Admin One')
            && element.textContent.includes('Shift 91')
            && element.textContent.includes('PRA-9')
        ));
        expect(accountabilityItems.length).toBeGreaterThan(0);
    });
});
