/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
    gross_profit: 60
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
  it('supports keyboard-only action-button selection and exposes table semantics for screen readers', async () => {
    const user = userEvent.setup();
    renderSalesPage();

    await waitFor(() => {
      expect(screen.getByRole('table', { name: 'Unified sales transactions table' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getAllByText('INV-1001').length).toBeGreaterThan(0);
    });

    const viewButton = screen.getByRole('button', { name: /View transaction INV-1001/i });
    viewButton.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('Transaction Detail')).toBeTruthy();
    expect(screen.getByText(/Reference:/)).toBeTruthy();
    expect(screen.getAllByText('INV-1001').length).toBeGreaterThan(0);
  });
});
