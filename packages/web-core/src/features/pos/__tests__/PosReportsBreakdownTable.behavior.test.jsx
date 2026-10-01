/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PosReportsBreakdownTable, { PosReportsBreakdownSummary } from '../components/PosReportsBreakdownTable.jsx';
import { getPosReportRefundsVoidsDisplayValue } from '../components/posReportFormatting.js';

const originalResizeObserver = globalThis.ResizeObserver;

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});
const itemData = {
  breakdown: 'items',
  timezone: 'Asia/Manila',
  range: { date_from: '2026-09-01', date_to: '2026-09-30' },
  generated_at: '2026-09-28T04:00:00.000Z',
  summary: {
    total_transactions: 3,
    total_items_sold: 5,
    gross_sales: 500,
    net_sales: 450,
    profit: 120
  },
  rows: [{
    item_key: 'item:11',
    item_id: 11,
    item_name: 'Coffee',
    sku: 'COF-01',
    category_name: 'Beverages',
    quantity: 5,
    orders: 3,
    net_sales: 450,
    sales_share: 100,
    average_unit_price: 90,
    profit: 120,
    profit_margin: 26.67
  }],
  pagination: { page: 1, limit: 20, total_rows: 41, total_pages: 3, has_next: true }
};

const hourlyData = {
  breakdown: 'hourly',
  timezone: 'Asia/Manila',
  range: { date_from: '2026-09-01', date_to: '2026-09-01' },
  generated_at: '2026-09-28T04:00:00.000Z',
  summary: {
    total_transactions: 1,
    total_items_sold: 1,
    gross_sales: 80,
    net_sales: 0,
    profit: -67,
    refunds_voids: 80
  },
  rows: [{
    bucket_start_local: '2026-09-01T08:00:00.000Z',
    bucket_end_local: '2026-09-01T08:59:59.999Z',
    transaction_count: 1,
    item_quantity: 1,
    gross_sales: 80,
    discounts: 0,
    net_sales: 0,
    refunds_voids: 80,
    profit: -67,
    profit_margin: 0
  }],
  pagination: { page: 1, limit: 20, total_rows: 1, total_pages: 1, has_next: false }
};

describe('POS report breakdown table', () => {
  afterEach(() => cleanup());

  it('renders item-sales columns from server values and uses server totals', () => {
    render(<PosReportsBreakdownTable breakdown="items" data={itemData} />);

    const tableRegion = screen.getByRole('region', { name: 'Item sales report table' });
    expect(within(tableRegion).getByRole('columnheader', { name: 'Item' })).toBeTruthy();
    expect(within(tableRegion).getByRole('columnheader', { name: 'Net Sales (₱)' })).toBeTruthy();
    expect(within(tableRegion).queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.getAllByText('Coffee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱450.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–20 of 41 items')).toBeTruthy();
  });

  it('maps sort and pagination actions to server callbacks', () => {
    const onSortChange = vi.fn();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <PosReportsBreakdownTable
        breakdown="items"
        data={itemData}
        sort={{ sort_by: 'net_sales', sort_direction: 'desc' }}
        onSortChange={onSortChange}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Quantity' }));
    expect(onSortChange).toHaveBeenCalledWith({ sort_by: 'quantity', sort_direction: 'asc' });

    fireEvent.click(screen.getByRole('button', { name: 'Sort by SKU' }));
    expect(onSortChange).toHaveBeenCalledWith({ sort_by: 'sku', sort_direction: 'asc' });

    fireEvent.click(screen.getByTestId('pos-reports-items-next-page'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('labels cached values as display-only stale data', () => {
    render(<PosReportsBreakdownSummary breakdown="items" data={itemData} currencySymbol="₱" stale />);
    expect(screen.getByRole('status').textContent).toContain('Offline snapshot');
    fireEvent.click(screen.getByRole('button', { name: 'cards' }));
    expect(screen.getByText('₱450.00')).toBeTruthy();
  });

  it('switches item sales between graph and cards', () => {
    render(<PosReportsBreakdownSummary breakdown="items" data={itemData} currencySymbol="₱" />);

    expect(screen.getByRole('heading', { name: 'Item Sales trend' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Item sales chart showing net sales and profit by item' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'graph' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'cards' }));

    expect(screen.getByRole('heading', { name: 'Item Sales summary' })).toBeTruthy();
    expect(screen.getByText('₱450.00')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Item sales chart showing net sales and profit by item' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'graph' }));
    expect(screen.getByRole('img', { name: 'Item sales chart showing net sales and profit by item' })).toBeTruthy();
  });

  it('switches sales by category between graph and cards', () => {
    const categoryData = {
      ...itemData,
      breakdown: 'categories',
      rows: [{
        category_key: 'category:beverages',
        category_name: 'Beverages',
        item_count: 2,
        quantity: 5,
        orders: 3,
        net_sales: 450,
        sales_share: 100,
        profit: 120,
        profit_margin: 26.67
      }]
    };

    render(<PosReportsBreakdownSummary breakdown="categories" data={categoryData} currencySymbol="₱" />);

    expect(screen.getByRole('heading', { name: 'Sales by Category trend' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Sales by category chart showing net sales and profit by category' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Sales by category chart legend' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'cards' }));
    expect(screen.getByRole('heading', { name: 'Sales by Category summary' })).toBeTruthy();
    expect(screen.getByText('₱450.00')).toBeTruthy();
  });

  it('replaces the hourly KPI summary with an hourly sales chart', () => {
    render(<PosReportsBreakdownSummary breakdown="hourly" data={hourlyData} currencySymbol="₱" />);

    expect(screen.getByRole('heading', { name: 'Hourly Sales trend' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Hourly sales chart showing gross sales, net sales, and profit by hour' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Hourly sales chart legend' })).toBeTruthy();
    expect(screen.getByText('Gross Sales')).toBeTruthy();
    expect(screen.getByText('Net Sales')).toBeTruthy();
    expect(screen.getByText('Profit')).toBeTruthy();
    expect(screen.queryByText('₱500.00')).toBeNull();
  });

  it('keeps the hourly chart available after switching to cards', () => {
    render(<PosReportsBreakdownSummary breakdown="hourly" data={hourlyData} currencySymbol="₱" />);

    fireEvent.click(screen.getByRole('button', { name: 'cards' }));
    expect(screen.getByRole('heading', { name: 'Hourly Sales summary' })).toBeTruthy();
    expect(screen.getByText('₱80.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'graph' }));
    expect(screen.getByRole('img', { name: 'Hourly sales chart showing gross sales, net sales, and profit by hour' })).toBeTruthy();
  });

  it('shows an empty state when hourly chart rows are unavailable', () => {
    render(<PosReportsBreakdownSummary breakdown="hourly" data={{ ...hourlyData, rows: [] }} currencySymbol="₱" />);

    expect(screen.getByText('No hourly sales data is available for the selected filters.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Hourly sales chart showing gross sales, net sales, and profit by hour' })).toBeNull();
  });

  it('presents refunds and voids as a negative adjustment without changing net sales', () => {
    render(<PosReportsBreakdownTable breakdown="hourly" data={hourlyData} />);

    expect(screen.getAllByText('₱-80.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱0.00').length).toBeGreaterThan(0);
  });

  it('normalizes refund and void display values without double-negating them', () => {
    expect(getPosReportRefundsVoidsDisplayValue(80)).toBe(-80);
    expect(getPosReportRefundsVoidsDisplayValue(-80)).toBe(-80);
    expect(getPosReportRefundsVoidsDisplayValue(0)).toBe(0);
    expect(getPosReportRefundsVoidsDisplayValue('not-a-number')).toBe(0);
  });
});
