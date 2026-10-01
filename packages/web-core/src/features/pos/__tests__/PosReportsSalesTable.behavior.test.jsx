/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsSalesTable from '../components/PosReportsSalesTable.jsx';

const rows = [
  {
    pos_transaction_id: 1,
    invoice_number: 'NFS-000125',
    created_at: '2026-08-28T06:45:00.000Z',
    cashier_name: 'John D.',
    payment_methods: ['cash'],
    order_method: 'dine_in',
    discount_amount: 0,
    gross_sales: 36,
    net_sales: 36,
    pos_profit_loss: 30
  },
  {
    pos_transaction_id: 2,
    invoice_number: 'NFS-000126',
    created_at: '2026-08-27T06:45:00.000Z',
    cashier_name: 'Mary A.',
    payment_methods: ['gcash', 'cash'],
    order_method: 'pickup',
    discount_amount: 4,
    gross_sales: 40,
    net_sales: 36,
    pos_profit_loss: -2
  }
];

describe('POS reports sales table', () => {
  afterEach(() => cleanup());

  it('renders prioritized sales columns without an actions column', () => {
    render(<PosReportsSalesTable rows={rows} />);

    const tableRegion = screen.getByRole('region', { name: 'Sales transactions table' });
    expect(tableRegion.className).toContain('overflow-x-auto');
    expect(tableRegion.querySelector('table')?.className).toContain('w-max min-w-full');
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();

    ['Date/Time', 'Transaction/Invoice', 'Cashier', 'Payment Method', 'Order Method', 'Net Sales (₱)', 'POS Profit/Loss (₱)'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: new RegExp(label.replace(/[()₱/]/g, '\\$&')) })).toBeTruthy();
    });
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.getAllByText('NFS-000125').length).toBeGreaterThan(0);
    expect(screen.getAllByText('John D.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cash').some((element) => element.className.includes('text-[#475569]'))).toBe(true);
    expect(screen.getAllByText('GCash').some((element) => element.className.includes('text-[#475569]'))).toBe(true);
    expect(screen.getAllByText('Pickup').some((element) => element.className.includes('text-[#475569]'))).toBe(true);
    expect(screen.getAllByText('₱36.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱30.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–2 of 2 sales transactions')).toBeTruthy();

  });

  it('supports search-compatible filtering and sortable numeric columns', () => {
    const { rerender } = render(<PosReportsSalesTable rows={rows} />);

    const profitLossSort = screen.getByRole('button', { name: 'Sort by POS Profit/Loss (₱)' });
    fireEvent.click(profitLossSort);
    fireEvent.click(profitLossSort);
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0].textContent).toContain('₱30.00');

    rerender(<PosReportsSalesTable rows={rows} searchQuery="NFS-000126" />);
    expect(screen.getAllByText('NFS-000126').length).toBeGreaterThan(0);
    expect(screen.queryByText('NFS-000125')).toBeNull();
    expect(screen.getByText('Showing 1–1 of 1 sales transactions')).toBeTruthy();
  });

  it('keeps the Transaction/Invoice label on one line in mobile cards', () => {
    render(<PosReportsSalesTable rows={rows} />);

    const mobileView = screen.getByTestId('pos-reports-sales-mobile-view');
    const mobileCard = mobileView.querySelector('article');
    const transactionLabel = within(mobileCard).getByText('Transaction/Invoice', { selector: 'dt' });

    expect(transactionLabel.className).toContain('whitespace-nowrap');
    expect(transactionLabel.parentElement.className).toContain('grid-cols-[max-content_minmax(0,1fr)]');
  });
});
