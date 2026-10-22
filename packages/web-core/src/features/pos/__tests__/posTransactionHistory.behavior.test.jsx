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

const voidedCashRefundPendingRow = {
    ...historyRow,
    status: 'voided',
    payment_type: 'cash',
    total_amount: 0,
    financial_outcome: {
        refund_required: true,
        refund_amount: 75,
        next_action: 'record_cash_refund_with_cash_drawer_event',
        reason_code: 'CASH_REFUND_REQUIRED'
    }
};

const buildPanelProps = (overrides = {}) => ({
    historySearch: '',
    setHistorySearch: vi.fn(),
    historyStatus: 'all',
    historyPaymentType: 'all',
    historyDeliveryProvider: 'all',
    setHistoryDeliveryProvider: vi.fn(),
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
    const [historyDeliveryProvider, setHistoryDeliveryProvider] = useState('all');
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
                historyDeliveryProvider,
                setHistoryDeliveryProvider,
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
        expect(screen.getByText('Delivery Provider')).toBeTruthy();
        expect(screen.getByText('Order Method')).toBeTruthy();
        expect(screen.getByRole('dialog').textContent).not.toContain('Source');
        expect(screen.getByPlaceholderText('Search Cashier')).toBeTruthy();
        const resetFiltersButton = screen.getByTestId('pos-history-reset-filters');
        expect(resetFiltersButton.className).toContain('border-rose-300');
        expect(resetFiltersButton.className).toContain('text-rose-700');
        expect(resetFiltersButton.className).toContain('hover:bg-rose-50');
        expect(screen.getByTestId('pos-history-filter-status-all').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('pos-history-filter-payment-employee_credit')).toBeTruthy();
        expect(screen.getByTestId('pos-history-filter-delivery-provider-grab')).toBeTruthy();
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

    it('applies the selected delivery provider and exposes the active filter chip', async () => {
        const loadHistory = vi.fn();
        render(<HistoryHarness onLoadHistory={loadHistory} />);

        fireEvent.click(screen.getByTestId('pos-history-filter-button'));
        fireEvent.click(screen.getByTestId('pos-history-filter-delivery-provider-grab'));
        fireEvent.click(screen.getByTestId('pos-history-apply-filters'));

        await waitFor(() => {
            expect(screen.getByText('Delivery Provider: Grab')).toBeTruthy();
            expect(loadHistory).toHaveBeenCalledWith(1);
        });
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

        const sourceTabs = screen.getByTestId('pos-history-source-tabs');
        const historyToolbar = screen.getByTestId('pos-history-toolbar');
        expect(sourceTabs.compareDocumentPosition(historyToolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Filter by Date' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'All Sources' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: 'In-Store' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'Online Store' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'All Sources' }).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'In-Store' }).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'Online Store' }).querySelector('svg[aria-hidden="true"]')).toBeTruthy();

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
        expect(filterButton.getAttribute('aria-haspopup')).toBe('dialog');
        expect(filterButton.getAttribute('aria-expanded')).toBe('true');
        const filterWidth = screen.getByRole('dialog').style.width;
        fireEvent.click(screen.getByRole('button', { name: 'Close history filters' }));

        fireEvent.click(calendarButton);
        expect(calendarButton.getAttribute('aria-haspopup')).toBe('dialog');
        expect(calendarButton.getAttribute('aria-expanded')).toBe('true');
        expect(filterButton.getAttribute('aria-expanded')).toBe('false');
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
            expect(screen.getByText('Date: Sep 1, 2026 – Sep 10, 2026')).toBeTruthy();
        });
    });

    it('uses the shared removable applied-filter chips and clears all History filters', () => {
        const setters = {
            setHistorySearch: vi.fn(),
            setHistoryStatus: vi.fn(),
            setHistoryPaymentType: vi.fn(),
            setHistoryOrderMethod: vi.fn(),
            setHistoryOrderSource: vi.fn(),
            setHistoryCashierName: vi.fn(),
            setHistoryDateFrom: vi.fn(),
            setHistoryDateTo: vi.fn()
        };
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            historySearch: 'NFS-000003',
            historyStatus: 'completed',
            historyPaymentType: 'cash',
            historyOrderMethod: 'takeout',
            historyCashierName: 'Henndry',
            historyDateFrom: '2026-08-15',
            historyDateTo: '2026-09-23',
            ...setters
        })} />);

        const appliedFilters = within(screen.getByRole('group', { name: 'Applied history filters' }));
        expect(appliedFilters.getByRole('button', { name: 'Remove filter: Date: Aug 15, 2026 – Sep 23, 2026' })).toBeTruthy();
        expect(appliedFilters.getByRole('button', { name: 'Clear all history filters' })).toBeTruthy();

        fireEvent.click(appliedFilters.getByRole('button', { name: 'Remove filter: Date: Aug 15, 2026 – Sep 23, 2026' }));
        expect(setters.setHistoryDateFrom).toHaveBeenCalledWith('');
        expect(setters.setHistoryDateTo).toHaveBeenCalledWith('');

        fireEvent.click(appliedFilters.getByRole('button', { name: 'Clear all history filters' }));
        expect(setters.setHistorySearch).toHaveBeenCalledWith('');
        expect(setters.setHistoryStatus).toHaveBeenCalledWith('all');
        expect(setters.setHistoryPaymentType).toHaveBeenCalledWith('all');
        expect(setters.setHistoryOrderMethod).toHaveBeenCalledWith('all');
        expect(setters.setHistoryOrderSource).toHaveBeenCalledWith('all');
        expect(setters.setHistoryCashierName).toHaveBeenCalledWith('');
        expect(setters.setHistoryDateFrom).toHaveBeenCalledWith('');
        expect(setters.setHistoryDateTo).toHaveBeenCalledWith('');
    });

    it('keeps History Clear all outside the horizontally scrolling filter chips on mobile', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

        render(<POSTransactionHistoryPanel {...buildPanelProps({
            historySearch: 'NFS-000003',
            historyStatus: 'completed',
            historyPaymentType: 'cash',
            historyCashierName: 'Len2'
        })} />);

        const filterGroup = screen.getByRole('group', { name: 'Applied history filters' });
        const chipRail = filterGroup.querySelector('.dgfy-pos-applied-filter-scroll');
        const clearAllButton = within(filterGroup).getByRole('button', { name: 'Clear all history filters' });

        expect(chipRail?.className).toContain('overflow-x-auto');
        expect(chipRail?.contains(clearAllButton)).toBe(false);
        expect(filterGroup.className).toContain('flex-nowrap');
        expect(filterGroup.className).not.toContain('overflow-x-auto');
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
        expect(calendarDialog.className).toContain('h-auto');
        expect(calendarDialog.className.split(/\s+/)).not.toContain('h-[min(90vh,40rem)]');
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
        expect(screen.queryByText(/Date:/)).toBeNull();
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

    it('uses five data columns plus receipt, void, and eye actions on tablet landscape', () => {
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const detailsButton = screen.getByRole('button', { name: 'View details for INV-001' });
        const actionHeader = screen.getByRole('columnheader', { name: 'Action' });
        const actionCell = detailsButton.closest('td');

        expect(detailsButton.textContent).toBe('');
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Void transaction INV-001' })).toBeTruthy();
        expect(actionCell).toBeTruthy();
        const actionButtons = within(actionCell).getAllByRole('button');
        expect(actionButtons).toHaveLength(3);
        expect(actionButtons.every((button) => button.className.includes('h-9 w-9'))).toBe(true);
        expect(actionHeader.className).toContain('pos-history-action-column');
        expect(screen.queryByRole('button', { name: 'Show transaction details for INV-001' })).toBeNull();

        const historyTable = screen.getByRole('table', { name: 'POS transaction history table' });
        expect(historyTable.className).toContain('whitespace-nowrap');
        expect(historyTable.className).toContain('dgfy-pos-history-table--tablet');
        expect(historyTable.className).toContain('dgfy-pos-history-table--tablet-landscape');
        expect(historyTable.className).toContain('min-w-0');
        expect(within(historyTable).getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'Invoice',
            'Date & Time',
            'Source',
            'Payment',
            'Total',
            'Action'
        ]);
        expect(within(historyTable).queryByRole('columnheader', { name: 'Cashier' })).toBeNull();
        expect(within(historyTable).queryByRole('columnheader', { name: 'Vatable' })).toBeNull();
        expect(screen.getAllByRole('row')[0].className).toContain('whitespace-nowrap');
        expect(screen.getAllByRole('row')[1].className).toContain('whitespace-nowrap');

        const sourceLabel = within(historyTable).getByText('In-Store');
        const paymentStatusLabel = within(historyTable).getByText('Paid');
        const dateTimeCell = screen.getByTestId('pos-history-date-time-1');
        const paymentCell = screen.getByTestId('pos-history-payment-1');
        const totalValue = within(historyTable).getByText('₱75.00');
        const scrollRegion = screen.getByTestId('pos-history-scroll-region');
        const paginationFooter = screen.getByTestId('pos-history-pagination-footer');
        expect(detailsButton.className).toContain('h-9 w-9');
        expect(detailsButton.parentElement?.className).toContain('pos-history-action-group');
        expect(detailsButton.parentElement?.className).toContain('items-center justify-center');
        expect(dateTimeCell.className).toContain('pos-history-row-content--column');
        expect(dateTimeCell.querySelectorAll('span')).toHaveLength(2);
        expect(paymentCell.className).toContain('pos-history-row-content--column');
        expect(paymentCell.querySelectorAll('span')).toHaveLength(2);
        expect(totalValue.closest('td')?.className).toContain('text-left');
        expect(scrollRegion.className).toContain('flex-1');
        expect(paginationFooter.className).toContain('shrink-0');
        expect(paginationFooter.className).toContain('py-2.5');
        expect(paginationFooter.className).toContain('dgfy-pos-pagination-footer');
        expect(paginationFooter.parentElement).toBe(scrollRegion.parentElement);
        expect(sourceLabel.className).not.toContain('rounded-full');
        expect(paymentStatusLabel.className).not.toContain('rounded-full');
        expect(detailsButton.className).toContain('pos-table-action-button');

        fireEvent.click(detailsButton);
        expect(screen.getByTestId('pos-history-details-dialog')).toBeTruthy();
        expect(screen.getByText('Transaction Information')).toBeTruthy();
        expect(screen.getByText('Sales Summary')).toBeTruthy();
    });

    it('uses the compact portrait tablet table and keeps full details in the eye action', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1180 });

        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const historyTable = screen.getByRole('table', { name: 'POS transaction history table' });
        const detailsButton = screen.getByRole('button', { name: 'View details for INV-001' });

        expect(historyTable.className).toContain('dgfy-pos-history-table--tablet-portrait');
        expect(within(historyTable).getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'Invoice',
            'Date & Time',
            'Source',
            'Total',
            'Action'
        ]);
        expect(screen.queryByTestId('pos-history-mobile-list')).toBeNull();
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

        const historyDetails = screen.getByTestId('pos-history-details-dialog');
        expect(within(historyDetails).getByText('Transaction Information')).toBeTruthy();
        expect(within(historyDetails).getByText('Sales Summary')).toBeTruthy();
        expect(within(historyDetails).getByText('Cashier')).toBeTruthy();
        expect(within(historyDetails).getByText('₱75.00')).toBeTruthy();
    });

    it('keeps the desktop history table in one view with receipt, void, and eye actions', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const historyTable = screen.getByRole('table', { name: 'POS transaction history table' });
        const historyTableViewport = historyTable.parentElement;

        expect(historyTable.className).toContain('table-fixed');
        expect(historyTable.className).toContain('dgfy-pos-history-table--single-view');
        expect(historyTable.className).toContain('min-w-0');
        expect(historyTableViewport?.className).toContain('overflow-x-hidden');
        expect(historyTableViewport?.className).not.toContain('overflow-x-auto');
        expect(historyTableViewport?.className).toContain('rounded-xl');
        expect(historyTableViewport?.className).toContain('border-slate-200');
        expect(within(historyTable).getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'Invoice',
            'Date & Time',
            'Source',
            'Payment',
            'Cashier',
            'Vatable',
            'Total',
            'Action'
        ]);
        expect(within(historyTable).getByText('₱66.96')).toBeTruthy();
        expect(within(historyTable).getByText('₱75.00')).toBeTruthy();
        const detailsButton = screen.getByRole('button', { name: 'View details for INV-001' });
        const actionCell = detailsButton.closest('td');
        const actionGroup = actionCell?.querySelector('.pos-history-action-group');
        expect(detailsButton.className).toContain('h-9 w-9');
        expect(detailsButton.className).toContain('pos-table-action-button');
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Void transaction INV-001' })).toBeTruthy();
        expect(actionCell).toBeTruthy();
        expect(actionGroup).toBeTruthy();
        expect(actionGroup?.className).toContain('items-center');
        expect(actionGroup?.className).not.toContain('pos-history-row-content');
        const actionButtons = within(actionCell).getAllByRole('button');
        expect(actionButtons).toHaveLength(3);
        expect(actionButtons.every((button) => button.className.includes('h-9 w-9'))).toBe(true);
    });

    it('shows pending financial follow-up in voided transaction details', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            historyRows: [voidedCashRefundPendingRow]
        })} />);

        fireEvent.click(screen.getByRole('button', { name: 'View details for INV-001' }));

        const details = screen.getByTestId('pos-history-details-dialog');
        expect(within(details).getByText('Financial Follow-up')).toBeTruthy();
        expect(within(details).getByText('Cash refund and a linked cash-drawer event are still required.')).toBeTruthy();
        expect(within(details).getByText('Required Amount')).toBeTruthy();
        expect(within(details).getByText('₱75.00')).toBeTruthy();
    });

    it('uses a four-data-column portrait tablet table and retains its action column', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1024 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const historyTable = screen.getByRole('table', { name: 'POS transaction history table' });
        expect(historyTable.className).toContain('dgfy-pos-history-table--tablet-portrait');
        expect(within(historyTable).getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'Invoice',
            'Date & Time',
            'Source',
            'Total',
            'Action'
        ]);
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Void transaction INV-001' })).toBeTruthy();
    });

    it('adds Payment at landscape tablet width without dropping the row action', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
        render(<POSTransactionHistoryPanel {...buildPanelProps()} />);

        const historyTable = screen.getByRole('table', { name: 'POS transaction history table' });
        expect(historyTable.className).toContain('dgfy-pos-history-table--tablet-landscape');
        expect(within(historyTable).getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'Invoice',
            'Date & Time',
            'Source',
            'Payment',
            'Total',
            'Action'
        ]);
        expect(within(historyTable).queryByRole('columnheader', { name: 'Cashier' })).toBeNull();
        expect(within(historyTable).queryByRole('columnheader', { name: 'Vatable' })).toBeNull();
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' })).toBeTruthy();
    });

    it('matches the mobile transaction-card layout with original values and top-row actions', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        const openHistoryDetail = vi.fn();
        const mobileHistoryRow = {
            ...historyRow,
            payment_type: 'employee_credit',
            discount: { discount_type: 'Employee', discount_rate: 15 }
        };
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            historyRows: [mobileHistoryRow],
            historyPaymentType: 'cash',
            historyDateFrom: '2026-09-01',
            historyDateTo: '2026-09-10',
            openHistoryDetail
        })} />);

        expect(screen.getByTestId('pos-history-toolbar').className).toContain('flex-col');
        expect(screen.getByTestId('pos-history-toolbar').className).not.toContain('flex-nowrap');
        const appliedFilterGroup = screen.getByLabelText('Applied history filters');
        const chipRail = appliedFilterGroup.querySelector('.dgfy-pos-applied-filter-scroll');
        const clearAllButton = within(appliedFilterGroup).getByRole('button', { name: 'Clear all history filters' });
        expect(appliedFilterGroup.className).toContain('flex-nowrap');
        expect(appliedFilterGroup.className).not.toContain('overflow-x-auto');
        expect(chipRail?.className).toContain('overflow-x-auto');
        expect(chipRail?.contains(clearAllButton)).toBe(false);

        const historyList = screen.getByTestId('pos-history-mobile-list');
        const historyCard = screen.getByTestId('pos-history-mobile-card-1');
        const historySurface = document.getElementById('pos-history-table-panel');
        const sourceTabs = screen.getByTestId('pos-history-source-tabs');
        const scrollRegion = screen.getByTestId('pos-history-scroll-region');

        expect(historyList.className).toContain('gap-1.5');
        expect(historyList.className).toContain('py-2');
        expect(historyList.className).not.toMatch(/(?:^|\s)px-/);
        expect(sourceTabs.className).toContain('shrink-0');
        expect(scrollRegion.contains(sourceTabs)).toBe(false);
        expect(sourceTabs.compareDocumentPosition(scrollRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(historyCard.className).toContain('rounded-xl');
        expect(historyCard.className).toContain('border-slate-200');
        expect(historySurface.className).toContain('rounded-none');
        expect(historySurface.className).toContain('border-0');
        expect(historySurface.className).toContain('bg-transparent');
        expect(historySurface.className).toContain('shadow-none');
        expect(historySurface.className).toContain('overflow-visible');
        expect(historySurface.className).not.toContain('rounded-xl');
        expect(historySurface.className).not.toContain('overflow-hidden');
        expect(screen.queryByRole('table', { name: 'POS transaction history table' })).toBeNull();
        expect(screen.getByTestId('pos-history-mobile-date-time-1').textContent).toContain('•');
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Void transaction INV-001' })).toBeTruthy();
        expect(within(historyCard).getByText('In-Store')).toBeTruthy();
        expect(within(historyCard).getByText('Paid').className).toContain('bg-emerald-50');
        expect(screen.getByTestId('pos-history-mobile-details-1').hasAttribute('hidden')).toBe(true);
        fireEvent.click(within(historyCard).getByText('INV-001'));
        expect(screen.getByTestId('pos-history-mobile-details-1').hasAttribute('hidden')).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'View receipt for INV-001' }));
        expect(openHistoryDetail).toHaveBeenCalledWith(mobileHistoryRow);
        expect(screen.getByTestId('pos-history-mobile-details-1').hasAttribute('hidden')).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Show transaction details for INV-001' }));

        const historyDetails = screen.getByTestId('pos-history-mobile-details-1');
        expect(historyDetails.className).toContain('border-t');
        expect(historyDetails.getAttribute('role')).toBe('region');
        expect(historyDetails.hasAttribute('hidden')).toBe(false);
        expect(screen.getByRole('button', { name: 'Hide transaction details for INV-001' }).getAttribute('aria-controls')).toBe(historyDetails.id);
        expect(within(historyDetails).getByText('Payment')).toBeTruthy();
        expect(within(historyDetails).getByText('Employee Credit')).toBeTruthy();
        expect(within(historyDetails).getByText('Cashier')).toBeTruthy();
        expect(within(historyDetails).getByText('Jane Doe')).toBeTruthy();
        expect(within(historyDetails).getByText('Discount')).toBeTruthy();
        expect(within(historyDetails).getByText('Employee (15.00%)')).toBeTruthy();
        expect(within(historyDetails).getByText('Rest. charge')).toBeTruthy();
        expect(within(historyDetails).getByText('VAT')).toBeTruthy();
        expect(within(historyDetails).getByText('Vatable')).toBeTruthy();
        expect(within(historyDetails).getByText('Fee')).toBeTruthy();
        expect(within(historyDetails).getByText('₱75.00')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Hide transaction details for INV-001' }).getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('button', { name: 'View receipt for INV-001' }).className).toContain('pos-table-action-button');
        expect(screen.getByRole('button', { name: 'Void transaction INV-001' }).className).toContain('pos-table-action-button');
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Hide transaction details for INV-001' }));
        expect(screen.getByTestId('pos-history-mobile-details-1').hasAttribute('hidden')).toBe(true);
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

    it('requires a numeric refund passcode before confirming a transaction void', async () => {
        const onVoidTransaction = vi.fn().mockResolvedValue(undefined);
        render(<POSTransactionHistoryPanel {...buildPanelProps({ onVoidTransaction })} />);

        fireEvent.click(screen.getByRole('button', { name: 'Void transaction INV-001' }));

        const confirmButton = screen.getByRole('button', { name: 'Confirm Transaction Void' });
        expect(confirmButton.disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('Void reason'), {
            target: { value: 'Customer refund approved' }
        });
        fireEvent.change(screen.getByLabelText('Authorized user global POS PIN'), {
            target: { value: '2468' }
        });
        expect(confirmButton.disabled).toBe(false);

        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(onVoidTransaction).toHaveBeenCalledWith(
                historyRow,
                'Customer refund approved',
                [],
                '2468'
            );
        });
    });

    it('shows the temporary POS void approval popup only for an authorized reviewer', async () => {
        const approvalRequest = {
            business_admin_approval_request_id: 501,
            action_type: 'pos_void',
            entity_id: 7,
            requested_by: 10,
            status: 'pending',
            reason: 'Correct duplicate sale',
            created_at: '2026-09-10T09:05:00.000Z',
            payload: { transaction_id: 7, invoice_number: 'NFS-000007', amount: 75 }
        };
        const decideVoidApproval = vi.fn().mockResolvedValue({});

        render(<POSTransactionHistoryPanel {...buildPanelProps({
            inlineVoidApprovalEnabled: true,
            canReviewVoidApprovals: true,
            voidApprovalQueue: [approvalRequest],
            voidApprovalDialogOpen: true,
            voidApprovalSelectedRequest: approvalRequest,
            decideVoidApproval,
            currentUserId: 99
        })} />);

        expect(screen.getByTestId('pos-history-void-approval-button')).toBeTruthy();
        expect(screen.getByTestId('pos-history-toolbar').className).toContain('flex-nowrap');
        expect(screen.getByTestId('pos-history-void-approval-row').className).not.toContain('basis-full');
        expect(screen.getByTestId('pos-inline-void-approval-dialog')).toBeTruthy();
        expect(screen.getAllByText('NFS-000007').length).toBeGreaterThanOrEqual(2);

        fireEvent.click(screen.getByTestId('pos-inline-void-approval-approve-501'));

        await waitFor(() => {
            expect(decideVoidApproval).toHaveBeenCalledWith(approvalRequest, 'approve', '');
        });
    });

    it('keeps phone search and icon actions together above labeled POS approvals', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            inlineVoidApprovalEnabled: true,
            canReviewVoidApprovals: true
        })} />);

        const toolbar = screen.getByTestId('pos-history-toolbar');
        const primaryActions = screen.getByTestId('pos-history-primary-actions');
        const approvalRow = screen.getByTestId('pos-history-void-approval-row');
        const approvalButton = screen.getByTestId('pos-history-void-approval-button');

        expect(toolbar.className).toContain('flex-col');
        expect(toolbar.className).toContain('min-w-0');
        expect(primaryActions.className).toContain('w-full');
        expect(primaryActions.className).toContain('min-w-0');
        expect(within(primaryActions).getByRole('searchbox', { name: 'Search all transaction fields' })).toBeTruthy();
        expect(within(primaryActions).getByTestId('pos-history-filter-button')).toBeTruthy();
        expect(within(primaryActions).getByTestId('pos-history-calendar-button')).toBeTruthy();
        expect(within(primaryActions).getByTestId('pos-history-sync-button')).toBeTruthy();
        expect(approvalRow.className).toContain('w-full');
        expect(approvalRow.className).toContain('justify-end');
        expect(approvalRow.previousElementSibling).toBe(primaryActions);
        expect(approvalButton.className).toContain('min-w-[8.5rem]');
        expect(approvalButton.className).not.toContain('w-11');
        expect(approvalButton.getAttribute('aria-label')).toBe('Open POS approval requests');
        expect(approvalButton.textContent).toContain('POS approvals');
        expect(approvalButton.querySelector('.sr-only')).toBeNull();
    });

    it('keeps tablet history toolbar actions in one row with icon-only buttons', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 });
        render(<POSTransactionHistoryPanel {...buildPanelProps({
            inlineVoidApprovalEnabled: true,
            canReviewVoidApprovals: true
        })} />);

        const toolbar = screen.getByTestId('pos-history-toolbar');
        const primaryActions = screen.getByTestId('pos-history-primary-actions');
        const approvalRow = screen.getByTestId('pos-history-void-approval-row');
        const approvalButton = screen.getByTestId('pos-history-void-approval-button');

        expect(toolbar.className).toContain('flex-nowrap');
        expect(toolbar.className).not.toContain('flex-col');
        expect(approvalRow.previousElementSibling).toBe(primaryActions);
        expect(within(primaryActions).getByRole('searchbox', { name: 'Search all transaction fields' })).toBeTruthy();
        expect(within(primaryActions).getByTestId('pos-history-filter-button').className).toContain('w-11');
        expect(within(primaryActions).getByTestId('pos-history-calendar-button').className).toContain('w-11');
        expect(within(primaryActions).getByTestId('pos-history-sync-button').className).toContain('w-11');
        expect(approvalButton.className).toContain('w-11');
        expect(approvalButton.querySelector('.sr-only')?.textContent).toBe('POS approvals');
    });

    it('disables self-review in the inline POS void approval popup', () => {
        const approvalRequest = {
            business_admin_approval_request_id: 502,
            action_type: 'pos_void',
            entity_id: 8,
            requested_by: 10,
            status: 'pending',
            reason: 'Duplicate sale',
            payload: { transaction_id: 8, invoice_number: 'NFS-000008', amount: 80 }
        };

        render(<POSTransactionHistoryPanel {...buildPanelProps({
            inlineVoidApprovalEnabled: true,
            canReviewVoidApprovals: true,
            voidApprovalQueue: [approvalRequest],
            voidApprovalDialogOpen: true,
            voidApprovalSelectedRequest: approvalRequest,
            currentUserId: 10
        })} />);

        expect(screen.queryByTestId('pos-inline-void-approval-approve-502')).toBeNull();
        expect(screen.getByText('Waiting for an authorized manager.')).toBeTruthy();
    });

    it('shows parked-sale cancellation approvals with the parked-sale reference and action', () => {
        const approvalRequest = {
            business_admin_approval_request_id: 503,
            action_type: 'pos_parked_sale_cancel',
            entity_type: 'pos_parked_sale',
            entity_id: 33,
            requested_by: 10,
            status: 'pending',
            reason: 'Test parked-sale cancellation',
            payload: {
                parked_sale_id: 33,
                park_reference: 'PARK-00033',
                reason: 'Test parked-sale cancellation'
            }
        };

        render(<POSTransactionHistoryPanel {...buildPanelProps({
            inlineVoidApprovalEnabled: true,
            canReviewVoidApprovals: true,
            voidApprovalQueue: [approvalRequest],
            voidApprovalDialogOpen: true,
            voidApprovalSelectedRequest: approvalRequest,
            currentUserId: 99
        })} />);

        expect(screen.getAllByText('Parked sale PARK-00033').length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText('Cancel parked sale').length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText('No payment captured').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByTestId('pos-inline-void-approval-approve-503').textContent).toContain('Approve cancellation');
    });
});
