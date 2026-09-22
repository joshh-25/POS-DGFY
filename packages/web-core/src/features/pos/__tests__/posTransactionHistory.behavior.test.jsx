// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import POSTransactionHistoryPanel from '../components/POSTransactionHistoryPanel.jsx';

const historyRow = {
    pos_transaction_id: 1,
    invoice_number: 'INV-001',
    created_at: '2026-09-10T09:00:00.000Z',
    order_source: 'in_store',
    payment_status: 'paid',
    total_amount: 75,
    vatable_sales: 66.96,
    vat_amount: 8.04,
    service_fee_amount: 0,
    restaurant_service_charge_amount: 0,
    cashier: { username: 'Jane Doe' }
};

const buildPanelProps = (overrides = {}) => ({
    historySearch: '',
    setHistorySearch: vi.fn(),
    historyStatus: 'all',
    historyPaymentType: 'all',
    historyOrderMethod: 'all',
    historyOrderSource: 'all',
    historyCashierName: '',
    historyDateFrom: '',
    historyDateTo: '',
    historyLoading: false,
    historyRows: [historyRow],
    posWorkflow: {
        mode: 'fnb',
        allowedMethods: ['dine_in', 'takeout', 'pickup', 'delivery']
    },
    historyDetailLoading: false,
    openHistoryDetail: vi.fn(),
    canVoidTransactions: true,
    onVoidTransaction: vi.fn(),
    voidingTransactionId: null,
    loadHistory: vi.fn(),
    historyPage: 1,
    historyPagination: { total: 1, limit: 20, totalPages: 1 },
    syncPendingTransactions: vi.fn(),
    ...overrides
});

function HistoryHarness({ onLoadHistory }) {
    const [historySearch, setHistorySearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState('all');
    const [historyPaymentType, setHistoryPaymentType] = useState('all');
    const [historyOrderMethod, setHistoryOrderMethod] = useState('all');
    const [historyOrderSource, setHistoryOrderSource] = useState('all');
    const [historyCashierName, setHistoryCashierName] = useState('');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');

    return (
        <POSTransactionHistoryPanel
            {...buildPanelProps({
                historySearch,
                setHistorySearch,
                historyStatus,
                setHistoryStatus,
                historyPaymentType,
                setHistoryPaymentType,
                historyOrderMethod,
                setHistoryOrderMethod,
                historyOrderSource,
                setHistoryOrderSource,
                historyCashierName,
                setHistoryCashierName,
                historyDateFrom,
                setHistoryDateFrom,
                historyDateTo,
                setHistoryDateTo,
                loadHistory: onLoadHistory
            })}
        />
    );
}

beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
});

afterEach(() => {
    cleanup();
});

describe('POSTransactionHistoryPanel filter and tablet action behavior', () => {
    it('opens the tablet filter dialog with the desktop-style filter controls', () => {
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));

        expect(screen.getByRole('dialog')).toBeTruthy();
        const filterOverlay = document.querySelector('[data-dialog-overlay="true"]');
        expect(filterOverlay?.className).toContain('bg-transparent');
        expect(filterOverlay?.className).not.toContain('bg-slate-950/60');
        expect(filterOverlay?.className).toContain('backdrop-blur-none');
        expect(filterOverlay?.className).not.toContain('backdrop-blur-sm');
        expect(screen.getByRole('dialog').className).toContain('border-slate-300');
        expect(screen.getByRole('dialog').className).toContain('shadow-[0_12px_30px_rgba(15,23,42,0.2)]');
        expect(screen.getByText('Sales View')).toBeTruthy();
        expect(screen.getByText('Payment Method')).toBeTruthy();
        expect(screen.getByText('Order Method')).toBeTruthy();
        expect(screen.getByRole('dialog').textContent).not.toContain('Source');
        expect(screen.getByPlaceholderText('Search Cashier')).toBeTruthy();
        const resetFiltersButton = screen.getByTestId('pos-history-reset-filters');
        expect(resetFiltersButton.className).toContain('border-rose-300');
        expect(resetFiltersButton.className).toContain('text-rose-700');
        expect(resetFiltersButton.className).toContain('hover:bg-rose-50');
        expect(screen.getByTestId('pos-history-filter-status-all').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('pos-history-filter-payment-employee_credit')).toBeTruthy();
        const paymentOptions = screen.getByRole('group', { name: 'Payment Method options' });
        expect(paymentOptions.className).toContain('grid-cols-4');
        expect(paymentOptions.className).not.toContain('flex-wrap');
        expect(paymentOptions.className).not.toContain('overflow-x-auto');
        expect(screen.getByTestId('pos-history-filter-payment-employee_credit').className).toContain('whitespace-nowrap');
        expect(screen.getByTestId('pos-history-cashier-dropdown-toggle').getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(screen.getByTestId('pos-history-cashier-dropdown-toggle'));
        expect(screen.getByTestId('pos-history-cashier-option-all')).toBeTruthy();
        expect(screen.getByTestId('pos-history-cashier-option-jane-doe')).toBeTruthy();
    });

    it('shows only order methods allowed by the active storefront workflow', () => {
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            posWorkflow: {
                mode: 'services',
                allowedMethods: ['walk_in', 'appointment']
            }
        })} />);

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));

        const orderMethodOptions = screen.getByRole('group', { name: 'Order Method options' });
        expect(within(orderMethodOptions).getByTestId('pos-history-filter-order-method-all')).toBeTruthy();
        expect(within(orderMethodOptions).getByTestId('pos-history-filter-order-method-walk_in')).toBeTruthy();
        expect(within(orderMethodOptions).getByTestId('pos-history-filter-order-method-appointment')).toBeTruthy();
        expect(within(orderMethodOptions).queryByTestId('pos-history-filter-order-method-dine_in')).toBeNull();
        expect(within(orderMethodOptions).queryByTestId('pos-history-filter-order-method-takeout')).toBeNull();
        expect(within(orderMethodOptions).queryByTestId('pos-history-filter-order-method-delivery')).toBeNull();
    });

    it('renders source tabs outside the filter dialog and applies the selected source', async () => {
        const loadHistory = vi.fn();
        render(<HistoryHarness onLoadHistory={loadHistory} />);

        expect(screen.getByRole('tab', { name: 'All Sources' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: 'In-Store' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'Online Store' })).toBeTruthy();

        fireEvent.click(screen.getByTestId('pos-history-source-tab-online_store'));

        await waitFor(() => {
            expect(screen.getByTestId('pos-history-source-tab-online_store').getAttribute('aria-selected')).toBe('true');
            expect(loadHistory).toHaveBeenCalledWith(1);
        });
    });

    it('loads the selected history page size and navigates using backend pagination', () => {
        const loadHistory = vi.fn();
        const setHistoryPageSize = vi.fn();
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            historyPage: 2,
            historyPageSize: 10,
            historyRows: Array.from({ length: 10 }, (_, index) => ({
                ...historyRow,
                pos_transaction_id: index + 1,
                invoice_number: `INV-${String(index + 1).padStart(3, '0')}`
            })),
            historyPagination: { total: 25, limit: 10, totalPages: 3 },
            loadHistory,
            setHistoryPageSize
        })} />);

        const pageSizeSelect = screen.getByTestId('pos-history-page-size');
        expect(pageSizeSelect.disabled).toBe(false);
        expect(pageSizeSelect.textContent).toContain('10 / page');

        fireEvent.click(pageSizeSelect);
        fireEvent.click(screen.getByTestId('pos-history-page-size-option-50'));
        expect(setHistoryPageSize).toHaveBeenCalledWith(50);
        expect(loadHistory).toHaveBeenCalledWith(1, 50);

        fireEvent.click(screen.getByTestId('pos-history-next-page'));
        expect(loadHistory).toHaveBeenLastCalledWith(3);
        const goToPageInput = screen.getByTestId('pos-history-go-to-page');
        fireEvent.change(goToPageInput, { target: { value: '1' } });
        fireEvent.submit(goToPageInput.closest('form'));
        expect(loadHistory).toHaveBeenLastCalledWith(1);
    });

    it('anchors the desktop filter panel below the filter control', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const filterButton = screen.getByTestId('pos-history-filter-button');
        filterButton.getBoundingClientRect = vi.fn(() => ({
            bottom: 120,
            right: 920
        }));

        fireEvent.click(filterButton);

        const filterDialog = screen.getByRole('dialog');
        expect(filterDialog.style.position).toBe('fixed');
        expect(filterDialog.style.left).toBe('456px');
        expect(filterDialog.style.top).toBe('132px');
        expect(filterDialog.className).toContain('max-w-none');
        expect(filterDialog.querySelector('[aria-label="Payment Method options"]')?.className).toContain('grid-cols-4');
        expect(filterDialog.querySelector('[data-testid="pos-history-filter-payment-employee_credit"]')?.className).toContain('w-full');
        expect(filterDialog.querySelector('[data-testid="pos-history-filter-status-all"]')).toBeTruthy();
        expect(filterDialog.querySelector('[data-testid="pos-history-filter-order-method-delivery"]')).toBeTruthy();
    });

    it('keeps the desktop filter panel within the available history content bounds', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
        const { rerender } = render(<POSTransactionHistoryPanel {...buildPanelProps({ sidebarCollapsed: false })} />);

        const historyPanel = document.querySelector('[data-pos-history-panel="true"]');
        let historyPanelRect = { left: 244, right: 1100, width: 856 };
        historyPanel.getBoundingClientRect = vi.fn(() => historyPanelRect);
        const filterButton = screen.getByTestId('pos-history-filter-button');
        filterButton.getBoundingClientRect = vi.fn(() => ({ bottom: 120, right: 1050 }));

        fireEvent.click(filterButton);

        const filterDialog = screen.getByRole('dialog');
        expect(filterDialog.style.left).toBe('586px');
        expect(filterDialog.style.width).toBe('464px');

        historyPanelRect = { left: 16, right: 800, width: 784 };
        filterButton.getBoundingClientRect = vi.fn(() => ({ bottom: 120, right: 780 }));
        rerender(<POSTransactionHistoryPanel {...buildPanelProps({ sidebarCollapsed: true })} />);

        expect(filterDialog.style.left).toBe('316px');
        expect(filterDialog.style.width).toBe('464px');
    });

    it('uses the same compact column width for desktop/tablet filters and calendar', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const filterButton = screen.getByTestId('pos-history-filter-button');
        const calendarButton = screen.getByTestId('pos-history-calendar-button');
        filterButton.getBoundingClientRect = vi.fn(() => ({ bottom: 120, right: 920 }));
        calendarButton.getBoundingClientRect = vi.fn(() => ({ bottom: 120, right: 920 }));

        fireEvent.click(filterButton);
        const filterWidth = screen.getByRole('dialog').style.width;
        fireEvent.click(screen.getByRole('button', { name: 'Close history filters' }));

        fireEvent.click(calendarButton);
        expect(screen.getByRole('dialog').style.width).toBe(filterWidth);
        expect(filterWidth).toBe('464px');
    });

    it('centers both dialogs for a narrow landscape device-preview panel', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const historyPanel = document.querySelector('[data-pos-history-panel="true"]');
        historyPanel.getBoundingClientRect = vi.fn(() => ({
            left: 590,
            right: 1320,
            width: 730,
            top: 396,
            bottom: 733,
            height: 337
        }));
        act(() => window.dispatchEvent(new Event('resize')));

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));
        expect(screen.getByRole('dialog').className).toContain('dgfy-pos-history-mobile-landscape-dialog');

        fireEvent.click(screen.getByRole('button', { name: 'Close history filters' }));
        fireEvent.click(screen.getByTestId('pos-history-calendar-button'));
        expect(screen.getByRole('dialog').className).toContain('dgfy-pos-history-mobile-landscape-dialog');
    });

    it('uses the wireframe cashier-list columns and vertical overflow thresholds', () => {
        const buildCashierRows = (count) => Array.from({ length: count }, (_, index) => ({
            ...historyRow,
            pos_transaction_id: index + 1,
            invoice_number: `INV-${String(index + 1).padStart(3, '0')}`,
            cashier: { username: `Cashier ${String(index + 1).padStart(2, '0')}` }
        }));
        const openCashierList = (cashierCount) => {
            cleanup();
            render(<POSTransactionHistoryPanel {...buildPanelProps({ historyRows: buildCashierRows(cashierCount) })} />);
            fireEvent.click(screen.getByTestId('pos-history-filter-button'));
            fireEvent.click(screen.getByTestId('pos-history-cashier-dropdown-toggle'));
            return screen.getByTestId('pos-history-cashier-options');
        };

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

        // The list includes the rendered "All Cashiers" row: five cashiers + All = six rows.
        const sixRowList = openCashierList(5);
        expect(sixRowList.className).toContain('grid-cols-1');
        expect(sixRowList.className).not.toContain('overflow-y-auto');

        // Seven through twelve rendered rows use two equal columns without a
        // nested scrollbar; the surrounding filter sheet remains scrollable.
        const sevenRowList = openCashierList(6);
        expect(sevenRowList.className).toContain('grid-cols-2');
        expect(sevenRowList.className).not.toContain('overflow-y-auto');

        const twelveRowList = openCashierList(11);
        expect(twelveRowList.className).toContain('grid-cols-2');
        expect(twelveRowList.className).not.toContain('overflow-y-auto');

        // Thirteen or more rendered rows return to one column but remain scrollable.
        const thirteenRowList = openCashierList(12);
        expect(thirteenRowList.className).toContain('grid-cols-1');
        expect(thirteenRowList.className).toContain('max-h-52');
        expect(thirteenRowList.className).toContain('overflow-y-auto');
    });

    it('keeps mobile filter options in equal-sized swipeable rows', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));

        const salesOptions = screen.getByRole('group', { name: 'Sales View options' });
        const filterDialog = screen.getByRole('dialog');
        expect(filterDialog.querySelector('.dgfy-pos-history-dialog-header')?.className).toContain('py-3');
        expect(filterDialog.querySelector('.dgfy-pos-history-dialog-body')?.className).toContain('px-4 py-3');
        expect(filterDialog.querySelector('.dgfy-pos-history-dialog-footer')?.className).toContain('px-4 py-3');
        expect(salesOptions.className).toContain('mt-1');
        expect(salesOptions.className).toContain('overflow-x-auto');
        expect(salesOptions.className).toContain('flex-nowrap');
        expect(salesOptions.className).toContain('touch-pan-x');
        expect(screen.getByTestId('pos-history-filter-status-all').className).toContain('w-[6.5rem]');
        expect(screen.getByTestId('pos-history-filter-status-all').className).toContain('min-w-[6.5rem]');

        const paymentOptions = screen.getByRole('group', { name: 'Payment Method options' });
        expect(paymentOptions.className).toContain('overflow-x-auto');
        expect(paymentOptions.className).toContain('flex-nowrap');
        expect(screen.getByTestId('pos-history-filter-payment-all').className).toContain('w-[6.5rem]');

        cleanup();
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            posWorkflow: {
                mode: 'services',
                allowedMethods: Array.from({ length: 13 }, (_, index) => `method_${index + 1}`)
            }
        })} />);
        fireEvent.click(screen.getByTestId('pos-history-filter-button'));

        const orderOptions = screen.getByRole('group', { name: 'Order Method options' });
        expect(orderOptions.className).toContain('overflow-x-auto');
        expect(orderOptions.className).toContain('flex-nowrap');
        expect(screen.getByTestId('pos-history-filter-order-method-all').className).toContain('w-[6.5rem]');
    });

    it('opens a separate calendar dialog for staged date-range filtering', async () => {
        const loadHistory = vi.fn();
        render(<HistoryHarness onLoadHistory={loadHistory} />);

        fireEvent.click(screen.getByTestId('pos-history-calendar-button'));

        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Select Date' })).toBeTruthy();
        expect(screen.getByTestId('pos-history-calendar-from')).toBeTruthy();
        expect(screen.getByTestId('pos-history-calendar-to')).toBeTruthy();
        expect(screen.getByTestId('pos-history-calendar-preset-today')).toBeTruthy();
        expect(screen.getByTestId('pos-history-calendar-previous-month')).toBeTruthy();
        expect(screen.getByTestId('pos-history-calendar-next-month')).toBeTruthy();
        expect(screen.queryByText('Sales View')).toBeNull();

        fireEvent.change(screen.getByTestId('pos-history-calendar-from'), { target: { value: '2026-09-01' } });
        fireEvent.change(screen.getByTestId('pos-history-calendar-to'), { target: { value: '2026-09-10' } });
        expect(loadHistory).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('pos-history-apply-dates'));

        await waitFor(() => {
            expect(loadHistory).toHaveBeenCalledWith(1);
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(screen.getByText('From: 2026-09-01')).toBeTruthy();
            expect(screen.getByText('To: 2026-09-10')).toBeTruthy();
        });
    });

    it('clears the active preset when switching to a custom date range', () => {
        render(<HistoryHarness onLoadHistory={vi.fn()} />);

        fireEvent.click(screen.getByTestId('pos-history-calendar-button'));

        const lastMonthPreset = screen.getByTestId('pos-history-calendar-preset-last_month');
        const customRangePreset = screen.getByTestId('pos-history-calendar-preset-custom');

        fireEvent.click(lastMonthPreset);
        expect(lastMonthPreset.getAttribute('aria-pressed')).toBe('true');
        expect(customRangePreset.getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(customRangePreset);

        expect(lastMonthPreset.getAttribute('aria-pressed')).toBe('false');
        expect(customRangePreset.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('pos-history-calendar-from').value).toBe('');
        expect(screen.getByTestId('pos-history-calendar-to').value).toBe('');
    });

    it('renders a compact continuous range highlight and discards calendar drafts on cancel', () => {
        const loadHistory = vi.fn();
        render(<HistoryHarness onLoadHistory={loadHistory} />);

        fireEvent.click(screen.getByTestId('pos-history-calendar-button'));

        const calendarDialog = screen.getByRole('dialog');
        const calendarGrid = within(calendarDialog).getByRole('grid', { name: 'Calendar dates' });
        const calendarDays = within(calendarGrid).getAllByRole('gridcell');
        expect(calendarDays).toHaveLength(42);
        expect(calendarDays[0].className).toContain('h-7');
        expect(calendarDays[0].className).toContain('rounded-full');
        expect(within(calendarDialog).getByTestId('pos-history-calendar-preset-today').className).toContain('h-8');

        const currentMonthDays = calendarDays.filter((day) => day.className.includes('text-slate-700'));
        fireEvent.click(currentMonthDays[0]);
        fireEvent.click(currentMonthDays[1]);

        expect(calendarDays.some((day) => day.className.includes('before:bg-[#C7DCF3]'))).toBe(true);
        expect(calendarDays.some((day) => day.className.includes('before:rounded-l-full'))).toBe(true);
        expect(calendarDays.some((day) => day.className.includes('before:rounded-r-full'))).toBe(true);
        expect(within(calendarDialog).getByTestId('pos-history-apply-dates').textContent).toContain('Apply Filters');

        fireEvent.click(within(calendarDialog).getByTestId('pos-history-cancel-dates'));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(loadHistory).not.toHaveBeenCalled();
        expect(screen.queryByText(/From:/)).toBeNull();
    });

    it('stages filter changes until Apply Filters and reloads with the applied values', async () => {
        const loadHistory = vi.fn();
        render(<HistoryHarness onLoadHistory={loadHistory} />);

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));
        fireEvent.click(screen.getByTestId('pos-history-filter-order-method-takeout'));

        expect(screen.getByTestId('pos-history-filter-order-method-takeout').getAttribute('aria-pressed')).toBe('true');
        expect(loadHistory).not.toHaveBeenCalled();
        expect(screen.queryByText('Method: Takeout')).toBeNull();

        fireEvent.click(screen.getByTestId('pos-history-apply-filters'));

        await waitFor(() => {
            expect(loadHistory).toHaveBeenCalledWith(1);
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(screen.getByText('Method: Takeout')).toBeTruthy();
        });
    });

    it('discards draft filter changes when the dialog is closed', () => {
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));
        fireEvent.click(screen.getByTestId('pos-history-filter-order-method-takeout'));
        fireEvent.click(screen.getByRole('button', { name: 'Close history filters' }));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByText('Method: Takeout')).toBeNull();
        fireEvent.click(screen.getByTestId('pos-history-filter-button'));
        expect(screen.getByTestId('pos-history-filter-order-method-all').getAttribute('aria-pressed')).toBe('true');
    });

    it('uses the PC-style twelve-column tablet table with compact icon actions', () => {
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const viewReceiptButton = screen.getByRole('button', { name: 'View receipt for INV-001' });
        const voidButton = screen.getByRole('button', { name: 'Void transaction INV-001' });
        const actionHeader = screen.getByRole('columnheader', { name: 'Action' });

        expect(viewReceiptButton.textContent).toBe('');
        expect(voidButton.textContent).toBe('');
        expect(actionHeader.className).toContain('pos-history-action-column');
        expect(screen.queryByRole('button', { name: 'Show transaction details for INV-001' })).toBeNull();

        const historyTable = screen.getByRole('table', { name: 'POS transaction history table' });
        expect(historyTable.className).toContain('whitespace-nowrap');
        expect(historyTable.className).toContain('dgfy-pos-history-table--tablet');
        expect(historyTable.className).toContain('dgfy-pos-history-table--tablet-landscape');
        expect(historyTable.className).toContain('min-w-[1180px]');
        expect(within(historyTable).getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'Invoice',
            'Date & Time',
            'Source',
            'Payment',
            'Cashier',
            'Discount',
            'Fee',
            'Rest. charge',
            'VAT',
            'Vatable',
            'Total',
            'Action'
        ]);
        expect(screen.getAllByRole('row')[0].className).toContain('whitespace-nowrap');
        expect(screen.getAllByRole('row')[1].className).toContain('whitespace-nowrap');

        const sourceLabel = within(historyTable).getByText('In-Store');
        const paymentStatusLabel = within(historyTable).getByText('Paid');
        const dateTimeCell = screen.getByTestId('pos-history-date-time-1');
        const paymentCell = screen.getByTestId('pos-history-payment-1');
        const totalValue = within(historyTable).getByText('₱75.00');
        const scrollRegion = screen.getByTestId('pos-history-scroll-region');
        const paginationFooter = screen.getByTestId('pos-history-pagination-footer');
        expect(viewReceiptButton.className).toContain('h-9 w-9');
        expect(voidButton.className).toContain('h-9 w-9');
        expect(viewReceiptButton.parentElement?.className).toContain('pos-history-row-content');
        expect(viewReceiptButton.parentElement?.className).toContain('justify-start');
        expect(dateTimeCell.className).toContain('pos-history-row-content--column');
        expect(dateTimeCell.querySelectorAll('span')).toHaveLength(2);
        expect(paymentCell.className).toContain('pos-history-row-content--column');
        expect(paymentCell.querySelectorAll('span')).toHaveLength(2);
        expect(totalValue.closest('td')?.className).toContain('text-left');
        expect(scrollRegion.className).toContain('flex-1');
        expect(paginationFooter.className).toContain('shrink-0');
        expect(paginationFooter.className).toContain('py-2.5');
        expect(paginationFooter.className).toContain('dgfy-pos-history-pagination-footer');
        expect(paginationFooter.parentElement).toBe(scrollRegion.parentElement);
        expect(sourceLabel.className).not.toContain('rounded-full');
        expect(paymentStatusLabel.className).not.toContain('rounded-full');
        expect(viewReceiptButton.className).toContain('border-slate-200');
        expect(voidButton.className).toContain('border-slate-200');
    });

    it('inherits the complete mobile card history UI in tablet portrait', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1180 });

        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const historyList = screen.getByTestId('pos-history-mobile-list');
        const historyCard = screen.getByTestId('pos-history-mobile-card-1');
        const detailsButton = screen.getByRole('button', { name: 'Show transaction details for INV-001' });

        expect(historyList.className).toContain('divide-y');
        expect(screen.queryByRole('table', { name: 'POS transaction history table' })).toBeNull();
        expect(historyCard).toBeTruthy();
        expect(detailsButton.querySelector('svg')?.getAttribute('class')).toContain('lucide-eye');

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));
        const filterDialog = screen.getByRole('dialog');
        expect(filterDialog.className).toContain('dgfy-pos-history-tablet-portrait-dialog');
        expect(filterDialog.className).not.toContain('dgfy-pos-history-mobile-sheet');
        expect(document.querySelector('[data-dialog-overlay="true"]')?.className).toContain('bg-slate-950/60');
        expect(screen.getByRole('group', { name: 'Payment Method options' }).className).toContain('grid-cols-4');
        fireEvent.click(screen.getByRole('button', { name: 'Close history filters' }));

        fireEvent.click(screen.getByTestId('pos-history-calendar-button'));
        const calendarDialog = screen.getByRole('dialog');
        expect(calendarDialog.className).toContain('dgfy-pos-history-tablet-portrait-dialog');
        expect(calendarDialog.className).not.toContain('dgfy-pos-history-mobile-sheet');
        expect(document.querySelector('[data-dialog-overlay="true"]')?.className).toContain('bg-slate-950/60');
        expect(screen.getByTestId('pos-history-calendar-preset-today').className).toContain('h-8');
        expect(screen.getByTestId('pos-history-cancel-dates').className).toContain('border-rose-300');
        expect(screen.getByTestId('pos-history-cancel-dates').className).toContain('text-rose-700');
        fireEvent.click(screen.getByTestId('pos-history-cancel-dates'));

        fireEvent.click(detailsButton);

        const historyDetails = screen.getByTestId('pos-history-mobile-details-1');
        expect(within(historyDetails).getByText('Payment')).toBeTruthy();
        expect(within(historyDetails).getByText('Source')).toBeTruthy();
        expect(within(historyDetails).getByText('Cashier')).toBeTruthy();
        expect(within(historyDetails).getByText('₱75.00')).toBeTruthy();
    });

    it('keeps the desktop history table in one view with compact action controls', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const historyTable = screen.getByRole('table', { name: 'POS transaction history table' });
        const historyTableViewport = historyTable.parentElement;

        expect(historyTable.className).toContain('table-fixed');
        expect(historyTable.className).toContain('dgfy-pos-history-table--single-view');
        expect(historyTable.className).toContain('min-w-0');
        expect(historyTableViewport?.className).toContain('overflow-x-hidden');
        expect(historyTableViewport?.className).not.toContain('overflow-x-auto');
        expect(within(historyTable).getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'Invoice',
            'Date & Time',
            'Source',
            'Payment',
            'Cashier',
            'Discount',
            'Fee',
            'Rest. charge',
            'VAT',
            'Vatable',
            'Total',
            'Action'
        ]);
        expect(within(historyTable).getAllByText('₱0.00')).toHaveLength(2);
        const viewReceiptButton = screen.getByRole('button', { name: 'View receipt for INV-001' });
        const voidButton = screen.getByRole('button', { name: 'Void transaction INV-001' });
        expect(viewReceiptButton.className).toContain('h-9 w-9');
        expect(voidButton.className).toContain('h-9 w-9');
        expect(viewReceiptButton.className).toContain('aspect-square');
        expect(voidButton.className).toContain('aspect-square');
        expect(viewReceiptButton.className).toContain('hover:bg-slate-100');
        expect(voidButton.className).toContain('hover:bg-slate-100');
    });

    it('matches the mobile transaction-card layout with original values and top-row actions', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        const openHistoryDetail = vi.fn();
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            historyPaymentType: 'cash',
            historyDateFrom: '2026-09-01',
            historyDateTo: '2026-09-10',
            openHistoryDetail
        })} />);

        expect(screen.getByTestId('pos-history-toolbar').className).toContain('flex-nowrap');
        expect(screen.getByTestId('pos-history-toolbar').className).not.toContain('flex-wrap');
        expect(screen.getByLabelText('Applied history filters').className).toContain('overflow-x-auto');
        expect(screen.getByLabelText('Applied history filters').className).toContain('flex-nowrap');

        const historyList = screen.getByTestId('pos-history-mobile-list');
        const historyCard = screen.getByTestId('pos-history-mobile-card-1');

        expect(historyList.className).toContain('divide-y');
        expect(screen.queryByRole('table', { name: 'POS transaction history table' })).toBeNull();
        expect(screen.getByTestId('pos-history-mobile-date-time-1').textContent).toContain('•');
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Void transaction INV-001' })).toBeTruthy();
        expect(within(historyCard).queryByText('₱75.00')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'View receipt for INV-001' }));
        expect(openHistoryDetail).toHaveBeenCalledWith(historyRow);
        expect(screen.queryByTestId('pos-history-mobile-details-1')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Show transaction details for INV-001' }));

        const historyDetails = screen.getByTestId('pos-history-mobile-details-1');
        expect(historyDetails.className).toContain('grid-cols-3');
        expect(within(historyDetails).getByText('Payment')).toBeTruthy();
        expect(within(historyDetails).getByText('Source')).toBeTruthy();
        expect(within(historyDetails).getByText('In-Store')).toBeTruthy();
        expect(within(historyDetails).getByText('₱75.00')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' }).className).toContain('h-9 w-9');
        expect(screen.getByRole('button', { name: 'Void transaction INV-001' }).className).toContain('h-9 w-9');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps the pending-sync action icon-only while exposing its state accessibly', () => {
        render(
            <POSTransactionHistoryPanel
                {...buildPanelProps({
                    universalPendingSyncCount: 1,
                    syncRemaining: 1
                })}
            />
        );

        const syncButton = screen.getByTestId('pos-history-sync-button');

        expect(syncButton.textContent).toBe('');
        expect(syncButton.getAttribute('aria-label')).toBe('Sync 1 pending POS record');
        expect(syncButton.getAttribute('title')).toBe('Sync 1 pending POS record');
        expect(syncButton.className).toContain('w-11');
    });
});
