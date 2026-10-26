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
    order_source: 'in_store',
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
    order_source: 'in_store',
    order_method: 'pickup',
    discount_amount: 4,
    gross_sales: 40,
    net_sales: 36,
    pos_profit_loss: -2
  },
  {
    pos_transaction_id: 3,
    invoice_number: 'NFS-000127',
    created_at: '2026-08-26T06:45:00.000Z',
    cashier_name: 'Online Cashier',
    payment_methods: ['cash'],
    order_source: 'online_store',
    order_method: 'dine_in',
    discount_amount: 0,
    gross_sales: 92.7,
    net_sales: 92.7,
    pos_profit_loss: 70
  }
];

describe('POS reports sales table', () => {
  afterEach(() => cleanup());

  it('renders prioritized sales columns with the shared view action', () => {
    render(<PosReportsSalesTable rows={rows} />);

    const tableRegion = screen.getByRole('region', { name: 'Sales transactions table' });
    expect(tableRegion.className).toContain('overflow-x-auto');
    expect(tableRegion.querySelector('table')?.className).toContain('w-max min-w-full');
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();

    ['Date/Time', 'Transaction/Invoice', 'Cashier', 'Payment Method', 'Sales Source', 'Net Sales (₱)', 'POS Profit/Loss (₱)'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: new RegExp(label.replace(/[()₱/]/g, '\\$&')) })).toBeTruthy();
    });
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
    expect(screen.getAllByText('NFS-000125').length).toBeGreaterThan(0);
    expect(screen.getAllByText('John D.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cash').some((element) => element.className.includes('text-[#475569]'))).toBe(true);
    expect(screen.getAllByText('GCash').some((element) => element.className.includes('text-[#475569]'))).toBe(true);
    expect(screen.getAllByText('Pickup').some((element) => element.className.includes('text-[#475569]'))).toBe(true);
    expect(screen.getAllByText('Walk-in Sales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Online Sales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱36.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱30.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–3 of 3 sales transactions')).toBeTruthy();

  });

  it('opens transaction details from the row view action', () => {
    render(<PosReportsSalesTable rows={rows} />);

    const tableRegion = screen.getByRole('region', { name: 'Sales transactions table' });
    fireEvent.click(within(tableRegion).getByRole('button', { name: 'View details for NFS-000125' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Transaction Details')).toBeTruthy();
    expect(within(dialog).getAllByText('NFS-000125').length).toBeGreaterThan(0);
  });

  it('keeps online dine-in orders separate from walk-in sales', () => {
    render(<PosReportsSalesTable rows={rows} />);

    const onlineRow = screen.getAllByRole('row').find((row) => row.textContent.includes('NFS-000127'));
    const walkInRow = screen.getAllByRole('row').find((row) => row.textContent.includes('NFS-000125'));

    expect(onlineRow).toBeTruthy();
    expect(onlineRow.textContent).toContain('Online Sales');
    expect(onlineRow.textContent).not.toContain('Walk-in Sales');
    expect(walkInRow).toBeTruthy();
    expect(walkInRow.textContent).toContain('Walk-in Sales');
  });

  it('supports search-compatible filtering and sortable numeric columns', () => {
    const { rerender } = render(<PosReportsSalesTable rows={rows} />);

    const profitLossSort = screen.getByRole('button', { name: 'Sort by POS Profit/Loss (₱)' });
    fireEvent.click(profitLossSort);
    fireEvent.click(profitLossSort);
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0].textContent).toContain('₱70.00');

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
