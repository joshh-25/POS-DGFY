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
});
