// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CashierHistoryPanel from '../components/CashierHistoryPanel.jsx';

afterEach(() => {
    cleanup();
});

describe('CashierHistoryPanel', () => {
    it('explains when the active shift is outside Today and offers All records', async () => {
        const onRefresh = vi.fn().mockResolvedValue(null);

        render(
            <CashierHistoryPanel
                state={{ loading: false, records: [], pagination: null, errorMessage: '' }}
                onRefresh={onRefresh}
                activeShift={{
                    pos_terminal_shift_id: 82,
                    business_date: '2026-08-16',
                    terminal_id: 'JOHN-01',
                    status: 'open'
                }}
                isOnline
            />
        );

        expect(screen.getByText(/active shift #82 is open/i)).toBeTruthy();
        const viewAllButton = screen.getByRole('button', { name: 'View All records' });
        expect(viewAllButton).toBeTruthy();

        fireEvent.click(viewAllButton);

        await waitFor(() => {
            expect(onRefresh).toHaveBeenLastCalledWith({ page: 1, limit: 10 });
        });
    });

    it('does not show the outside-period notice when the active shift is already listed', () => {
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 82,
                            business_date: '2026-08-16',
                            terminal_id: 'JOHN-01',
                            status: 'open',
                            opened_at: '2026-08-16T03:07:29.000Z'
                        },
                        cash_summary: {},
                        sales_summary: {}
                    }],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                activeShift={{ pos_terminal_shift_id: 82, business_date: '2026-08-16' }}
                isOnline
            />
        );

        expect(screen.queryByText(/not included in the selected date period/i)).toBeNull();
        expect(screen.getByText(/2026-08-16 · Shift #82/i)).toBeTruthy();
    });

    it('labels a void made after close as a post-close adjustment', () => {
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 83,
                            business_date: '2026-08-16',
                            terminal_id: 'JOHN-01',
                            status: 'closed',
                            opened_at: '2026-08-16T03:07:29.000Z',
                            closed_at: '2026-08-16T11:07:29.000Z'
                        },
                        cash_summary: {},
                        sales_summary: {
                            void_transaction_count: 1,
                            void_amount: 125,
                            post_close_void_transaction_count: 1,
                            post_close_void_amount: 125
                        }
                    }],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.getByText('Post-close voids')).toBeTruthy();
        expect(screen.getAllByText('1 · PHP 125.00')).toHaveLength(2);
    });

    it('shows post-close refund actor and shift accountability separately from void totals', () => {
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 84,
                            business_date: '2026-08-16',
                            terminal_id: 'JOHN-01',
                            status: 'closed',
                            opened_at: '2026-08-16T03:07:29.000Z',
                            closed_at: '2026-08-16T11:07:29.000Z'
                        },
                        cash_summary: {},
                        sales_summary: {
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
                                event_at: '2026-08-16T12:00:00.000Z'
                            }]
                        }
                    }],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.getByText('Post-close adjustment accountability')).toBeTruthy();
        expect(screen.getByText(/Actioned by:/)).toBeTruthy();
        expect(screen.getByText(/Admin One/)).toBeTruthy();
        expect(screen.getByText(/Acting shift:/)).toBeTruthy();
    });
});
