/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsRegistersTable from '../components/PosReportsRegistersTable.jsx';

const rows = [
  {
    shift_ids: [81],
    opening_cashier_name: 'John D.',
    opening_float_amount: 2000,
    cash_sales_amount: 4820,
    expected_cash_amount: 2980,
    closing_cash_amount: 2980,
    variance_amount: 0
  },
  {
    shift_ids: [82],
    opening_cashier_name: 'Maya S.',
    opening_float_amount: 2000,
    cash_sales_amount: 4820,
    expected_cash_amount: 2980,
    closing_cash_amount: 2990,
    variance_amount: 10
  },
  {
    shift_ids: [83],
    opening_cashier_name: 'Alex R.',
    opening_float_amount: 2000,
    cash_sales_amount: 4820,
    expected_cash_amount: 2980,
    closing_cash_amount: 2970,
    variance_amount: -10
  },
  {
    shift_ids: [84],
    opening_cashier_name: 'Open Drawer',
    opening_float_amount: 2000,
    cash_sales_amount: 4820,
    expected_cash_amount: 2980,
    closing_cash_amount: null,
    variance_amount: null
  }
];

describe('POS reports registers table', () => {
  afterEach(() => cleanup());

  it('renders the proposed register columns and derives accurate states from backend amounts', () => {
    render(<PosReportsRegistersTable rows={rows} />);

    ['Register Shift', 'Opening Cashier', 'Expected (₱)', 'Counted (₱)', 'Variance (₱)', 'Status'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Sort by ${label}` })).toBeTruthy();
    });
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
    expect(screen.getAllByText('RS-81').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱2,980.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reconciled').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Over').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Short').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–4 of 4 register rows')).toBeTruthy();
  });

  it('filters register rows through the shared report search value', () => {
    render(<PosReportsRegistersTable rows={rows} searchQuery="Short" />);

    expect(screen.getAllByText('RS-83').length).toBeGreaterThan(0);
    expect(screen.queryByText('RS-81')).toBeNull();
    expect(screen.getByText('Showing 1–1 of 1 register rows')).toBeTruthy();
  });
});
