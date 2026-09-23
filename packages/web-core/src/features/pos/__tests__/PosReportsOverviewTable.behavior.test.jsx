/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsOverviewTable from '../components/PosReportsOverviewTable.jsx';

const rows = [
  {
    period: '2026-09-19',
    total_transactions: 7,
    gross_sales: 1001.75,
    net_sales: 978.5,
    discounts: 23.25,
    refunds_voids: 0
  }
];

describe('POS reports overview table', () => {
  afterEach(() => cleanup());

  it('keeps every financial overview column available in the scrollable table', () => {
    render(<PosReportsOverviewTable rows={rows} />);

    ['Business Date', 'Transactions', 'Gross Sales (₱)', 'Net Sales (₱)', 'Discounts (₱)', 'Refunds/Voids (₱)'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: label })).toBeTruthy();
    });

    screen.getAllByRole('columnheader').forEach((header) => {
      expect(header.className.split(/\s+/)).toContain('table-cell');
    });
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
    expect(screen.getAllByText('₱978.50').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱23.25').length).toBeGreaterThan(0);
  });

  it('aligns transactions to center and financial values to the left', () => {
    const { container } = render(<PosReportsOverviewTable rows={rows} />);
    const headers = Array.from(container.querySelectorAll('thead th'));
    const cells = Array.from(container.querySelectorAll('tbody tr:first-child td'));
    const expected = ['text-left', 'text-center', 'text-left', 'text-left', 'text-left', 'text-left'];

    expected.forEach((alignment, index) => {
      expect(headers[index].className).toContain(alignment);
      expect(cells[index].className).toContain(alignment);
    });
  });
});
