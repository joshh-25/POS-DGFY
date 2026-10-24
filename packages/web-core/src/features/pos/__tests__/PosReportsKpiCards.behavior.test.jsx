/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsKpiCards from '../components/PosReportsKpiCards.jsx';

describe('POS reports KPI cards', () => {
  afterEach(() => cleanup());

  it('shows only the concise Overview KPI allocation in a responsive four-column grid', () => {
    render(
      <PosReportsKpiCards
        summaryCards={{ total_sales: 1000000, gross_sales: 1100000, total_transactions: 100000, pos_profit_loss: 123456 }}
        dailySummary={{ total_transactions: 100000, completed_transactions: 99999, voided_refunded_transactions: 1, discounts: 100000 }}
      />
    );

    const netSalesLabel = screen.getByText('Net Sales (₱)');
    const grid = netSalesLabel.closest('article').parentElement;
    const netSalesValue = screen.getByText('₱1,000,000.00');
    const voidedCard = screen.getByText('Voided/Refunded').closest('article');

    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-4');
    expect(grid.querySelectorAll('article')).toHaveLength(4);
    expect(netSalesLabel.nextElementSibling).toBe(netSalesValue);
    expect(netSalesValue.className).toContain('break-words');
    expect(screen.getByText('Transactions')).toBeTruthy();
    expect(screen.getByText('100,000')).toBeTruthy();
    expect(screen.getByText('Discounts (₱)')).toBeTruthy();
    expect(within(voidedCard).getByText('1')).toBeTruthy();
    expect(screen.queryByText('Gross Sales (₱)')).toBeNull();
    expect(screen.queryByText('Completed Sales')).toBeNull();
    expect(screen.queryByText('Profit (₱)')).toBeNull();
  });

  it('shows only Gross Sales, Discounts, and Net Sales in the Sales report', () => {
    render(
      <PosReportsKpiCards
        variant="sales"
        summaryCards={{ total_sales: 1000000, gross_sales: 1100000, total_transactions: 100000 }}
        dailySummary={{ net_sales: 1000000, gross_sales: 1100000, discounts: 100000 }}
        selectedTender={{ payment_label: 'Cash', amount: 125, transaction_count: 3 }}
      />
    );

    const grid = screen.getByText('Gross Sales (₱)').closest('article').parentElement;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-3');
    expect(grid.querySelectorAll('article')).toHaveLength(3);
    expect(screen.getByText('₱1,100,000.00')).toBeTruthy();
    expect(screen.getByText('Discounts (₱)')).toBeTruthy();
    expect(screen.getByText('Net Sales (₱)')).toBeTruthy();
    expect(screen.queryByText('Cash Collected (₱)')).toBeNull();
    expect(screen.queryByText('Transactions')).toBeNull();
  });

  it('shows the Profit/Loss measures and preserves a negative result', () => {
    render(
      <PosReportsKpiCards
        variant="profit_loss"
        summaryCards={{ total_sales: 100, pos_profit_loss: -50 }}
        dailySummary={{ net_sales: 100, cogs: 150, pos_profit_loss: -50, profit_margin: -50 }}
      />
    );

    const grid = screen.getByText('Net Sales (₱)').closest('article').parentElement;
    expect(grid.className).toContain('xl:grid-cols-4');
    expect(grid.querySelectorAll('article')).toHaveLength(4);
    expect(screen.getByText('Cost of Goods Sold (₱)')).toBeTruthy();
    expect(screen.getByText('₱150.00')).toBeTruthy();
    expect(screen.getByText('POS Profit/Loss (₱)')).toBeTruthy();
    expect(screen.getByText('-₱50.00')).toBeTruthy();
    expect(screen.getByText('Profit Margin')).toBeTruthy();
    expect(screen.getByText('-50.00%')).toBeTruthy();
    expect(screen.queryByText('Discounts (₱)')).toBeNull();
  });
});
