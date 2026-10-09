// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CashierHistoryPanel from '../components/CashierHistoryPanel.jsx';

afterEach(() => {
    cleanup();
});

const getTodayHistoryScopeKey = (extraFilters = {}) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = `${values.year}-${values.month}-${values.day}`;
    return JSON.stringify({
        page: 1,
        limit: 10,
        date_from: today,
        date_to: today,
        ...extraFilters
    });
};

describe('CashierHistoryPanel', () => {
    it('labels company scope and shows branch plus cashier/register owner identity', () => {
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    historyScope: {
                        mode: 'company',
                        location_count: 2,
                        label: 'All authorized company branches'
                    },
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 90,
                            business_date: '2026-09-28',
                            terminal_id: 'COUNTER-02',
                            status: 'closed',
                            opened_at: '2026-09-28T03:07:29.000Z',
                            location: { location_id: 12, name: 'Second Branch' },
                            cashier: { user_id: 17, username: 'Maya Cashier' }
                        },
                        cash_summary: {},
                        sales_summary: {}
                    }],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.getByText('Cashier History — All Branches')).toBeTruthy();
        expect(screen.getByText(/across all authorized company branches \(2 branches\)/i)).toBeTruthy();
        expect(screen.getByText(/All authorized company branches/)).toBeTruthy();
        expect(screen.getByText(/Branch:/)).toBeTruthy();
        expect(screen.getByText('Second Branch')).toBeTruthy();
        expect(screen.getByText('Maya Cashier')).toBeTruthy();
    });

    it('uses scope-aware loading copy for company history', () => {
        render(
            <CashierHistoryPanel
                state={{
                    loading: true,
                    historyScope: { mode: 'company', location_count: 2 },
                    records: [],
                    pagination: null,
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.getByText('Loading company cashier summaries...')).toBeTruthy();
        expect(screen.queryByText('Loading your cashier summaries...')).toBeNull();
    });

    it('shows explicit fallback identities when historical associations are missing', () => {
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    historyScope: { mode: 'company', location_count: 1 },
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 91,
                            business_date: '2026-09-28',
                            terminal_id: 'COUNTER-03',
                            status: 'closed',
                            opened_at: '2026-09-28T03:07:29.000Z'
                        },
                        cash_summary: {},
                        sales_summary: {}
                    }],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.getByText('Unknown branch')).toBeTruthy();
        expect(screen.getByText('Unknown cashier')).toBeTruthy();
    });

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

        expect(screen.getByText('Open shift #82 isn’t included in these results.')).toBeTruthy();
        expect(screen.getByText('Only your shifts are shown.')).toBeTruthy();
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
        const mobileView = screen.getByTestId('pos-cashier-history-mobile-view');
        expect(within(mobileView).getByText('#82')).toBeTruthy();
        expect(within(mobileView).getByRole('button', { name: 'View summary for shift #82' })).toBeTruthy();
    });

    it('passes a shift with post-close voids to the existing summary action', () => {
        const onViewSummary = vi.fn();
        const record = {
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
        };
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [record],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                onViewSummary={onViewSummary}
                isOnline
            />
        );

        fireEvent.click(within(screen.getByTestId('pos-cashier-history-mobile-view'))
            .getByRole('button', { name: 'View summary for shift #83' }));

        expect(onViewSummary).toHaveBeenCalledWith(record);
    });

    it('passes post-close refund accountability to the existing summary action', () => {
        const onViewSummary = vi.fn();
        const record = {
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
        };
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [record],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                onViewSummary={onViewSummary}
                isOnline
            />
        );

        fireEvent.click(within(screen.getByTestId('pos-cashier-history-mobile-view'))
            .getByRole('button', { name: 'View summary for shift #84' }));

        expect(onViewSummary).toHaveBeenCalledWith(record);
    });

    it('uses the Reports filter/date toolbar and applies supported status filters', async () => {
        const onRefresh = vi.fn().mockResolvedValue(null);

        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [],
                    pagination: null,
                    errorMessage: '',
                    cashier: { cashier_name: 'Hendry' }
                }}
                onRefresh={onRefresh}
                isOnline
            />
        );

        expect(screen.getByText('Only your shifts are shown.')).toBeTruthy();
        expect(screen.queryByRole('combobox', { name: 'Cashier' })).toBeNull();
        expect(screen.getByRole('searchbox', { name: 'Search cashier history' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Filter by Date' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Clear', exact: true })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Apply', exact: true })).toBeNull();
        expect(screen.queryByText('Date range', { exact: true })).toBeNull();
        expect(document.querySelector('input[type="date"]')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
        expect(screen.getByRole('dialog', { name: 'Filter cashier history' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Closed' }));
        fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

        await waitFor(() => {
            expect(onRefresh).toHaveBeenLastCalledWith(expect.objectContaining({
                page: 1,
                limit: 10,
                date_from: expect.any(String),
                date_to: expect.any(String),
                status: 'closed'
            }));
        });

        fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Status: Closed' }));
        await waitFor(() => {
            const lastRefreshCall = onRefresh.mock.calls[onRefresh.mock.calls.length - 1];
            expect(lastRefreshCall?.[0]).not.toHaveProperty('status');
        });
    });

    it('applies a calendar date preset and exposes it as a removable chip', async () => {
        const onRefresh = vi.fn().mockResolvedValue(null);
        const today = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date()).reduce((values, part) => ({ ...values, [part.type]: part.value }), {});
        const expectedYesterdayDate = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) - 1));
        const expectedYesterday = expectedYesterdayDate.toISOString().slice(0, 10);

        render(
            <CashierHistoryPanel
                state={{ loading: false, records: [], pagination: null, errorMessage: '' }}
                onRefresh={onRefresh}
                isOnline
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Filter by Date' }));
        expect(screen.getByRole('dialog', { name: 'Select shift dates' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
        fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

        await waitFor(() => {
            expect(onRefresh).toHaveBeenLastCalledWith(expect.objectContaining({
                date_from: expectedYesterday,
                date_to: expectedYesterday
            }));
        });
        expect(screen.getByRole('button', { name: `Remove filter: Date: ${new Date(`${expectedYesterday}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` })).toBeTruthy();
    });

    it('debounces shift and terminal search through the cashier history API', async () => {
        const onRefresh = vi.fn().mockResolvedValue(null);
        render(
            <CashierHistoryPanel
                state={{ loading: false, records: [], pagination: null, errorMessage: '' }}
                onRefresh={onRefresh}
                isOnline
            />
        );

        const searchField = screen.getByRole('searchbox', { name: 'Search cashier history' });
        expect(searchField.getAttribute('placeholder')).toBe('Search shift # or terminal ID');
        fireEvent.change(searchField, { target: { value: '#44' } });

        await waitFor(() => {
            expect(onRefresh).toHaveBeenLastCalledWith(expect.objectContaining({
                page: 1,
                limit: 10,
                search: '#44'
            }));
        }, { timeout: 2000 });

        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        await waitFor(() => {
            const lastRefreshCall = onRefresh.mock.calls[onRefresh.mock.calls.length - 1]?.[0];
            expect(lastRefreshCall).not.toHaveProperty('search');
        }, { timeout: 2000 });
    });

    it('renders history and filters without the extra enclosing cards', () => {
        render(
            <CashierHistoryPanel
                state={{ loading: false, records: [], pagination: null, errorMessage: '' }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        const historyHeading = screen.getByRole('heading', { name: 'Cashier History' });
        const historyContainer = historyHeading.closest('.space-y-4');
        const filterToolbar = screen.getByRole('button', { name: 'Filter by Date' }).closest('.space-y-2');

        expect(historyContainer).toBeTruthy();
        expect(filterToolbar).toBeTruthy();
        const historyCardClasses = ['rounded-xl', 'border', 'bg-white', 'p-4', 'shadow-sm'];

        expect(historyCardClasses.some((className) => historyContainer.classList.contains(className))).toBe(false);
        expect(historyCardClasses.some((className) => filterToolbar.classList.contains(className))).toBe(false);
        const refreshButton = screen.getByRole('button', { name: 'Refresh cashier history' });
        expect(refreshButton.classList.contains('!bg-[#1A4E8D]')).toBe(true);
        expect(refreshButton.classList.contains('text-white')).toBe(true);
        expect(screen.getByRole('button', { name: 'Today' }).classList.contains('!bg-[#1A4E8D]')).toBe(true);
        expect(screen.getByRole('button', { name: 'All records' }).classList.contains('border-[#8AA8CD]')).toBe(true);
    });

    it('uses the shared dropdown design for page-size selection', async () => {
        const onRefresh = vi.fn().mockResolvedValue(null);
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 93,
                            status: 'closed',
                            terminal_id: 'COUNTER-01',
                            opened_at: '2026-10-07T09:00:00.000Z',
                            closed_at: '2026-10-07T10:00:00.000Z'
                        },
                        sales_summary: {},
                        cash_summary: {}
                    }],
                    pagination: { total: 21, totalPages: 3 },
                    errorMessage: ''
                }}
                onRefresh={onRefresh}
                isOnline
            />
        );

        fireEvent.click(screen.getByRole('combobox', { name: 'Items per page' }));
        expect(screen.getByRole('listbox', { name: 'Items per page options' })).toBeTruthy();
        fireEvent.click(screen.getByTestId('pos-cashier-history-pagination-page-size-option-20'));

        await waitFor(() => {
            expect(onRefresh).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 20 }));
        });
    });

    it('replaces one-page pagination controls with a compact record count', () => {
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 92,
                            status: 'closed',
                            terminal_id: 'COUNTER-01',
                            opened_at: '2026-10-07T09:00:00.000Z',
                            closed_at: '2026-10-07T10:00:00.000Z'
                        },
                        sales_summary: {},
                        cash_summary: {}
                    }],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: ''
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.queryByTestId('pos-cashier-history-pagination')).toBeNull();
        expect(screen.getByText('Showing 1–1 of 1 records')).toBeTruthy();
    });

    it('does not render pagination controls or a count when the history is empty', () => {
        render(
            <CashierHistoryPanel
                state={{ loading: false, records: [], pagination: null, errorMessage: '' }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.queryByTestId('pos-cashier-history-pagination')).toBeNull();
        expect(screen.queryByText(/Showing .* records/)).toBeNull();
    });

    it('shows an error instead of a false empty result when history has not loaded', () => {
        const requestScopeKey = getTodayHistoryScopeKey();
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [],
                    pagination: null,
                    errorMessage: 'History is unavailable.',
                    requestScopeKey,
                    recordsScopeKey: null
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.getByRole('alert').textContent).toContain('History is unavailable.');
        expect(screen.getByRole('button', { name: 'Refresh cashier history' })).toBeTruthy();
        expect(screen.queryByText('No cashier shift records match these filters.')).toBeNull();
        expect(screen.queryByText(/isn’t included in these results/)).toBeNull();
    });

    it('keeps the last loaded records visible and marks them stale after refresh fails', () => {
        const requestScopeKey = getTodayHistoryScopeKey();
        render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [{
                        shift: {
                            pos_terminal_shift_id: 90,
                            status: 'closed',
                            terminal_id: 'COUNTER-01',
                            opened_at: '2026-10-07T09:00:00.000Z',
                            closed_at: '2026-10-07T10:00:00.000Z'
                        },
                        sales_summary: {},
                        cash_summary: {}
                    }],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: 'Refresh failed.',
                    requestScopeKey,
                    recordsScopeKey: requestScopeKey
                }}
                onRefresh={vi.fn().mockResolvedValue(null)}
                isOnline
            />
        );

        expect(screen.getByRole('alert').textContent).toContain('Refresh failed — showing last results');
        expect(screen.getByRole('table', { name: 'Cashier shift history' })).toBeTruthy();
        expect(within(screen.getByTestId('pos-cashier-history-mobile-view')).getByText('#90')).toBeTruthy();
        expect(screen.queryByText('No cashier shift records match these filters.')).toBeNull();
    });

    it('does not present results from a previous filter scope as current after a failure', async () => {
        const todayScopeKey = getTodayHistoryScopeKey();
        const closedScopeKey = getTodayHistoryScopeKey({ status: 'closed' });
        const onRefresh = vi.fn().mockResolvedValue(null);
        const record = {
            shift: {
                pos_terminal_shift_id: 91,
                status: 'open',
                terminal_id: 'COUNTER-01',
                opened_at: '2026-10-07T09:00:00.000Z'
            },
            sales_summary: {},
            cash_summary: {}
        };
        const { rerender } = render(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [record],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: '',
                    requestScopeKey: todayScopeKey,
                    recordsScopeKey: todayScopeKey
                }}
                onRefresh={onRefresh}
                isOnline
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
        fireEvent.click(screen.getByRole('button', { name: 'Closed' }));
        fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

        rerender(
            <CashierHistoryPanel
                state={{
                    loading: false,
                    records: [record],
                    pagination: { total: 1, totalPages: 1 },
                    errorMessage: 'Closed history is unavailable.',
                    requestScopeKey: closedScopeKey,
                    recordsScopeKey: todayScopeKey
                }}
                onRefresh={onRefresh}
                isOnline
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('alert').textContent).toContain('Closed history is unavailable.');
        });
        expect(screen.queryByRole('table', { name: 'Cashier shift history' })).toBeNull();
        expect(screen.queryByText('#91')).toBeNull();
        expect(screen.queryByText(/showing last results/i)).toBeNull();
    });
});
