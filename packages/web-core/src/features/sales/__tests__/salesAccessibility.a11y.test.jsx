/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SalesPage from '../pages/SalesPage.jsx';

const mockFetchUnifiedSalesTransactions = vi.fn();
const mockExportUnifiedSalesTransactionsCsv = vi.fn();

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    loading: false,
    can: () => true
  })
}));

vi.mock('@/services/salesService', () => ({
  fetchUnifiedSalesTransactions: (...args) => mockFetchUnifiedSalesTransactions(...args),
  exportUnifiedSalesTransactionsCsv: (...args) => mockExportUnifiedSalesTransactionsCsv(...args)
}));

vi.mock('@/src/features/settings/WorkflowModeContext.jsx', () => ({
  useWorkflowMode: () => ({
    workflowMode: 'manufacturing'
  })
}));

const renderSalesPage = () => render(
  <MemoryRouter initialEntries={['/sales']}>
    <Routes>
      <Route path="/sales" element={<SalesPage />} />
    </Routes>
  </MemoryRouter>
);

const sampleResult = {
  transactions: [
    {
      source: 'POS',
      source_id: 1001,
      reference_no: 'INV-1001',
      occurred_at: '2026-04-09T09:15:00.000Z',
      customer_or_recipient: 'Walk-in',
      gross_sales: 120,
      cogs: 60,
      gross_profit: 60,
      status: 'completed',
      vatable_sales: 107.14,
      vat_amount: 12.86,
      vat_exempt_sales: 0,
      zero_rated_sales: 0,
      service_fee_amount: 0,
      service_fee_label_snapshot: null,
      service_fee_method_snapshot: null,
      discount_amount: 0,
      discount_label_snapshot: null,
      discount_rate_snapshot: null
    }
  ],
  pagination: {
    page: 1,
    totalPages: 1,
    total: 1
  },
  summary: {
    gross_sales: 120,
    service_fee_total: 0,
    cogs: 60,
    gross_profit: 60,
    discounts: 0,
    vatable_sales: 107.14,
    vat: 12.86,
    net_sales: 120
  }
};

beforeEach(() => {
  mockFetchUnifiedSalesTransactions.mockResolvedValue(sampleResult);
  mockExportUnifiedSalesTransactionsCsv.mockResolvedValue(new Blob(['col\nvalue'], { type: 'text/csv' }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SalesPage accessibility affordances', () => {
  it('does not preselect a transaction or style its View action as active on initial load', async () => {
    renderSalesPage();

    const sourceSelect = await screen.findByRole('combobox', { name: 'Sales source' });
    const table = await screen.findByRole('table', { name: 'Unified sales transactions table' });
    const viewButton = await within(table).findByRole('button', { name: /View transaction INV-1001/i });
    const transactionRow = within(table).getByText('INV-1001', { exact: true }).closest('tr');

    expect(sourceSelect.value).toBe('ALL');
    expect(screen.getByRole('button', { name: /Sales date range:/ })).toBeTruthy();
    expect(screen.queryByLabelText('Sales date from')).toBeNull();
    expect(screen.queryByLabelText('Sales date to')).toBeNull();
    expect(screen.getByText('Gross sales', { exact: true })).toBeTruthy();
    expect(screen.getByText('Discount', { exact: true })).toBeTruthy();
    expect(screen.getByText('VAT sales', { exact: true })).toBeTruthy();
    expect(screen.getAllByText('VAT', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByText('Net sales', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Gross profit', { exact: true })).toBeNull();
    expect(screen.queryByText('Transaction activity', { exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear sales filters' })).toBeNull();
    expect(screen.queryByLabelText('Filter by payment')).toBeNull();
    expect(transactionRow).toBeTruthy();
    expect(transactionRow.className).toContain('bg-white');
    expect(transactionRow.className).not.toContain('bg-teal-50/70');
    expect(viewButton.className).toContain('border-slate-300');
  });

  it('passes the selected source from the dropdown to the sales query', async () => {
    const user = userEvent.setup();
    renderSalesPage();

    const sourceSelect = await screen.findByRole('combobox', { name: 'Sales source' });
    await user.selectOptions(sourceSelect, 'DISPATCH');

    await waitFor(() => {
      expect(mockFetchUnifiedSalesTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'DISPATCH' }));
    });
    expect(sourceSelect.value).toBe('DISPATCH');
  });

  it('shows the empty state when the selected source has no transactions', async () => {
    mockFetchUnifiedSalesTransactions.mockImplementation(async ({ source }) => (
      source === 'DISPATCH'
        ? {
            transactions: [],
            pagination: { page: 1, totalPages: 1, total: 0 },
            summary: {
              gross_sales: 0,
              service_fee_total: 0,
              cogs: 0,
              gross_profit: 0,
              discounts: 0,
              vatable_sales: 0,
              vat: 0,
              net_sales: 0
            }
          }
        : sampleResult
    ));
    const user = userEvent.setup();
    renderSalesPage();

    const sourceSelect = await screen.findByRole('combobox', { name: 'Sales source' });
    await user.selectOptions(sourceSelect, 'DISPATCH');

    expect(await screen.findByText('No sales transactions found for the current filters. Try changing the date, source, or search.')).toBeTruthy();
  });

  it('supports keyboard-only action-button selection and exposes table semantics for screen readers', async () => {
    const user = userEvent.setup();
    renderSalesPage();

    await waitFor(() => {
      expect(screen.getByRole('table', { name: 'Unified sales transactions table' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getAllByText('INV-1001').length).toBeGreaterThan(0);
    });

    const table = screen.getByRole('table', { name: 'Unified sales transactions table' });
    const viewButton = within(table).getByRole('button', { name: /View transaction INV-1001/i });
    viewButton.focus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('dialog', { name: 'Selected transaction detail' });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Transaction INV-1001' })).toBeTruthy();
    expect(within(dialog).getByText('Reference', { exact: true })).toBeTruthy();
    expect(within(dialog).getByText('Tax breakdown', { exact: true })).toBeTruthy();
    expect(screen.getAllByText('INV-1001').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Close transaction detail' }));
    expect(screen.queryByRole('dialog', { name: 'Selected transaction detail' })).toBeNull();
  });
});
