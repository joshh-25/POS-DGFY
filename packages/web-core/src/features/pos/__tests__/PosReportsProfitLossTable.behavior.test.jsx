/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsProfitLossTable from '../components/PosReportsProfitLossTable.jsx';

const rows = [
  {
    rank: 1,
    item_id: 1,
    item_name: 'Burger Classic',
    category: 'Burgers',
    item_sold: 42,
    gross_sales: 2980,
    cogs: 1562,
    net_sales: 2830,
    net_profit: 1417.6,
    loss: 0,
    profit_margin: 50.06,
    pos_profit_loss: 1417.6
  },
  {
    rank: 2,
    item_id: 2,
    item_name: 'Neutral Item',
    category: 'Sides',
    item_sold: 2,
    gross_sales: 20,
    cogs: 20,
    net_sales: 20,
    net_profit: 0,
    loss: 0,
    profit_margin: 0,
    pos_profit_loss: 0
  },
  {
    rank: 3,
    item_id: 3,
    item_name: 'Loss Item',
    category: 'Drinks',
    item_sold: 1,
    gross_sales: 60,
    cogs: 30,
    net_sales: 50,
    net_profit: 0,
    loss: 50,
    profit_margin: -50,
    pos_profit_loss: -50
  }
];

describe('POS reports profit and loss table', () => {
  afterEach(() => cleanup());

  it('renders the proposed item-level columns and server-provided values', () => {
    render(<PosReportsProfitLossTable rows={rows} />);

    ['Rank', 'Item', 'Net Sales (₱)', 'Net Profit (₱)', 'Loss (₱)', 'Profit Margin (%)'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Sort by ${label}` })).toBeTruthy();
    });
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.getAllByText('Burger Classic').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱1,417.60').length).toBeGreaterThan(0);
    expect(screen.getAllByText('50.06%').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–3 of 3 profit and loss items')).toBeTruthy();

    const tableRegion = screen.getByRole('region', { name: 'Profit and loss table' });
    const headers = tableRegion.querySelectorAll('thead th');
    const firstRowCells = tableRegion.querySelectorAll('tbody tr:first-child td');
    expect(firstRowCells[0].className).toContain('text-left');
    expect(headers[0].className).toContain('text-left');
    [2, 3, 4, 5].forEach((index) => {
      expect(headers[index].className).toContain('text-left');
      expect(firstRowCells[index].className).toContain('text-left');
      expect(firstRowCells[index].className).toContain('tabular-nums');
    });
  });

  it('uses brand for profit, danger for loss, and secondary for a neutral result', () => {
    render(<PosReportsProfitLossTable rows={rows} />);

    expect(screen.getAllByLabelText('Profit ₱1,417.60')[0].className).toContain('text-[#15579B]');
    expect(screen.getAllByLabelText('Loss ₱50.00')[0].className).toContain('text-[#DC2626]');
    expect(screen.getAllByLabelText('No profit ₱0.00')[0].className).toContain('text-[#475569]');
  });
});
