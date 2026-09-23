/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsCashiersTable from '../components/PosReportsCashiersTable.jsx';

const rows = [
  {
    cashier_id: 9,
    cashier_name: 'John D.',
    summary: { total_transactions: 34, gross_sales: 4820, discounts: 2980, net_sales: 1562 }
  },
  {
    cashier_id: 10,
    cashier_name: 'Maya S.',
    summary: { total_transactions: 12, gross_sales: 1800, discounts: 120, net_sales: 1680 }
  }
];

describe('POS reports cashiers table', () => {
  afterEach(() => cleanup());

  it('renders the proposed cashier columns from the nested backend summary', () => {
    render(<PosReportsCashiersTable rows={rows} />);

    ['Rank', 'Cashier', 'Transactions', 'Gross Sales (₱)', 'Discounts (₱)', 'Net Sales (₱)'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Sort by ${label}` })).toBeTruthy();
    });
    expect(screen.getAllByText('Maya S.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱4,820.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱2,980.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–2 of 2 cashiers')).toBeTruthy();
  });

  it('filters cashier rows through the shared report search value', () => {
    render(<PosReportsCashiersTable rows={rows} searchQuery="Maya" />);

    expect(screen.getAllByText('Maya S.').length).toBeGreaterThan(0);
    expect(screen.queryByText('John D.')).toBeNull();
    expect(screen.getByText('Showing 1–1 of 1 cashiers')).toBeTruthy();
  });
});
