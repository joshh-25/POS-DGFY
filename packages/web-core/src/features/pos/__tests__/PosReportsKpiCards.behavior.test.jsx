/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsKpiCards, { calculateKpiDelta, getProfitOnly } from '../components/PosReportsKpiCards.jsx';

describe('POS reports KPI cards', () => {
  afterEach(() => cleanup());

  it('keeps two KPI columns on small screens and places each value below its label', () => {
    render(
      <PosReportsKpiCards
        summaryCards={{ total_sales: 1000000 }}
        dailySummary={{}}
        comparison={{}}
      />
    );

    const salesLabel = screen.getByText('Total Sales (₱)');
    const salesCard = salesLabel.closest('article');
    const grid = salesCard.parentElement;
    const salesValue = screen.getByText('₱1,000,000.00');
    const profitCard = screen.getByText('Profit (₱)').closest('article');

    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-7');
    expect(profitCard.className).toContain('col-span-2');
    expect(profitCard.className).toContain('xl:col-span-1');
    expect(profitCard.className).toContain('py-2.5');
    expect(profitCard.className).toContain('sm:py-3');
    expect(salesValue.parentElement).toBe(salesLabel.parentElement);
    expect(salesLabel.nextElementSibling).toBe(salesValue);
    expect(salesValue.className).toContain('break-words');
    expect(salesValue.className.split(/\s+/)).not.toContain('truncate');
  });

  it('maps each KPI to the current report summary and omits comparison copy when no prior period exists', () => {
    render(
      <PosReportsKpiCards
        summaryCards={{ total_sales: 1000000, gross_sales: 1100000, total_transactions: 100000, pos_profit_loss: 123456 }}
        dailySummary={{ total_transactions: 100000, completed_transactions: 99999, voided_refunded_transactions: 1, discounts: 100000 }}
        comparison={{ previous: { net_sales: 0, gross_sales: 0, total_transactions: 0, discounts: 0, pos_profit_loss: 0 } }}
      />
    );

    expect(screen.getByText('Total Sales (₱)')).toBeTruthy();
    expect(screen.getByText('₱1,000,000.00')).toBeTruthy();
    expect(screen.getByText('₱1,100,000.00')).toBeTruthy();
    expect(screen.getByText('Recorded Transactions')).toBeTruthy();
    expect(screen.getByText('Completed Sales')).toBeTruthy();
    expect(screen.getByText('Voided/Refunded')).toBeTruthy();
    expect(screen.getByText('100,000')).toBeTruthy();
    expect(screen.getByText('99,999')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('₱100,000.00')).toBeTruthy();
    expect(screen.getByText('Profit (₱)')).toBeTruthy();
    expect(screen.getByText('₱123,456.00')).toBeTruthy();
    expect(screen.queryByText('No prior period data')).toBeNull();
    expect(screen.queryByText('+100.0% vs previous period')).toBeNull();
  });

  it('keeps explicit KPI context visible when period comparison is unavailable', () => {
    render(
      <PosReportsKpiCards
        summaryCards={{}}
        dailySummary={{}}
        comparison={{}}
        selectedTender={{ payment_label: 'Cash', amount: 125, transaction_count: 3 }}
      />
    );

    expect(screen.getByText(/3 completed transactions; whole-transaction tender/)).toBeTruthy();
    expect(screen.queryByText('No prior period data')).toBeNull();
  });

  it('calculates a directional comparison only when a real prior-period base exists', () => {
    expect(calculateKpiDelta(120, 100)).toBe(20);
    expect(calculateKpiDelta(-50, -100)).toBe(50);
    expect(calculateKpiDelta(120, 0)).toBeNull();
    expect(calculateKpiDelta(120, undefined)).toBeNull();
  });

  it('does not present a negative signed result as profit', () => {
    expect(getProfitOnly(-50)).toBe(0);
    expect(getProfitOnly(50)).toBe(50);
    expect(getProfitOnly('invalid')).toBe(0);
  });
});
