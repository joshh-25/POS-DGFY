/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsAdjustmentsTable from '../components/PosReportsAdjustmentsTable.jsx';

const rows = [
  {
    pos_transaction_adjustment_id: 12,
    adjustment_reference: 'REF-000125',
    pos_transaction_id: 42,
    invoice_number: 'ORD-00034',
    event_at: '2026-08-28T13:00:00.000Z',
    adjustment_type: 'cash_refund',
    amount: 250,
    original_cashier_name: 'John D.',
    reason: 'Customer Return',
    external_reference: 'Returned Item: Blue Mug'
  },
  {
    pos_transaction_adjustment_id: 13,
    adjustment_reference: 'VOID-000126',
    pos_transaction_id: 43,
    invoice_number: 'ORD-00035',
    event_at: '2026-08-27T13:00:00.000Z',
    adjustment_type: 'void',
    amount: 125,
    original_cashier_name: 'Mary A.',
    reason: 'Duplicate order',
    item_voided: true,
    voided_lines: [{ item_id: 179, item_name: 'Casino Ethyl Alcohol', quantity: 1, voided_quantity: 1 }]
  }
];

describe('POS reports adjustments table', () => {
  afterEach(() => cleanup());

  it('renders prioritized adjustment columns without an actions column', () => {
    render(<PosReportsAdjustmentsTable rows={rows} />);

    ['Date/Time', 'Type', 'Reference No.', 'Order No.', 'Voided Item(s)', 'Cashier', 'Amount (₱)', 'Affected Sales'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: new RegExp(label.replace(/[().]/g, '\\$&')) })).toBeTruthy();
    });
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.getAllByText('Refund').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Void').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REF-000125').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ORD-00034').length).toBeGreaterThan(0);
    expect(screen.getAllByText('John D.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱250.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Casino Ethyl Alcohol × 1').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–2 of 2 adjustments')).toBeTruthy();

  });

  it('supports search-compatible filtering and sortable amount values', () => {
    const { rerender } = render(<PosReportsAdjustmentsTable rows={rows} />);

    const amountSort = screen.getByRole('button', { name: 'Sort by Amount (₱)' });
    fireEvent.click(amountSort);
    fireEvent.click(amountSort);
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0].textContent).toContain('₱250.00');

    rerender(<PosReportsAdjustmentsTable rows={rows} searchQuery="VOID-000126" />);
    expect(screen.getAllByText('VOID-000126').length).toBeGreaterThan(0);
    expect(screen.queryByText('REF-000125')).toBeNull();
    expect(screen.getByText('Showing 1–1 of 1 adjustments')).toBeTruthy();
  });
});
