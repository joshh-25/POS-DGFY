/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsTopItemsTable from '../components/PosReportsTopItemsTable.jsx';

const rows = [
  {
    item_id: 1,
    item_name: 'Coca Cola 1.5L',
    category: 'Beverages',
    quantity_sold: 15,
    net_sales: 3400,
    sales_share_percentage: 13.5,
    average_price: 15,
    orders: 54
  }
];

describe('POS reports top-selling items table', () => {
  afterEach(() => cleanup());

  it('renders the proposed columns and supported aggregate values', () => {
    render(<PosReportsTopItemsTable rows={rows} totalSales={25185} />);

    ['Rank', 'Items', 'Category', 'Quantity Sold', 'Net Sales (₱)', '% of Total Sales', 'Average Price (₱)', 'Orders'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: label })).toBeTruthy();
    });
    const tableRegion = screen.getByRole('region', { name: 'Top-selling items table' });
    expect(within(tableRegion).getByText('1')).toBeTruthy();
    expect(screen.getAllByText('Coca Cola 1.5L').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beverages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱3,400.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('13.5%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱15.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('54').length).toBeGreaterThan(0);
    expect(within(tableRegion).getByRole('progressbar', { name: 'Coca Cola 1.5L share of total sales' }).getAttribute('aria-valuenow')).toBe('13.5');

    const firstRowCells = tableRegion.querySelectorAll('tbody tr:first-child td');
    const headers = tableRegion.querySelectorAll('thead th');
    const expectedAlignments = ['center', 'left', 'left', 'center', 'left', 'right', 'left', 'center'];
    expectedAlignments.forEach((alignment, index) => {
      expect(headers[index].className).toContain(`text-${alignment}`);
      expect(firstRowCells[index].className).toContain(`text-${alignment}`);
    });
    [4, 6].forEach((index) => {
      expect(firstRowCells[index].className).toContain('font-semibold');
      expect(firstRowCells[index].className).toContain('tabular-nums');
    });
  });

  it('keeps the table usable when there are no top items', () => {
    render(<PosReportsTopItemsTable rows={[]} />);

    expect(screen.getAllByText('No top-item activity found for the selected filters.').length).toBeGreaterThan(0);
  });
});
