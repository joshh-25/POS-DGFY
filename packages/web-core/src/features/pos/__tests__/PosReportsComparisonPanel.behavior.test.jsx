/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PosReportsComparisonPanel from '../components/PosReportsComparisonPanel.jsx';

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

const comparison = {
  flexible_range: {
    current: { net_sales: 17910, gross_sales: 19000, pos_profit_loss: 4200, total_transactions: 120 },
    previous: { net_sales: 16420, gross_sales: 17500, pos_profit_loss: 3600, total_transactions: 100 },
    current_range: { dateFrom: '2026-08-27', dateTo: '2026-08-28' },
    previous_range: { dateFrom: '2026-08-25', dateTo: '2026-08-26' }
  },
  flexible_trend: [
    { label: '2026-08-27', current_net_sales: 8000, previous_net_sales: 7200 },
    { label: '2026-08-28', current_net_sales: 9910, previous_net_sales: 9220 }
  ]
};

describe('POS reports comparison panel', () => {
  afterEach(() => cleanup());

  it('renders the comparison summary, selected ranges, and paired trend series', () => {
    render(<PosReportsComparisonPanel comparison={comparison} />);

    expect(screen.getByText('Sales Comparison Summary')).toBeTruthy();
    const mobileSummary = screen.getByTestId('pos-comparison-summary-mobile');
    expect(mobileSummary.querySelectorAll('li')).toHaveLength(4);
    expect(mobileSummary.className).toContain('min-[768px]:hidden');
    const summaryTable = screen.getByRole('table');
    expect(within(summaryTable).getByRole('columnheader', { name: 'Change' }).className).toContain('min-[1200px]:table-cell');
    expect(within(summaryTable).getByRole('columnheader', { name: 'Change / %' }).className).toContain('min-[1200px]:hidden');
    expect(within(mobileSummary).getByText('Net Sales')).toBeTruthy();
    expect(within(mobileSummary).getByText('₱17,910.00')).toBeTruthy();
    expect(within(mobileSummary).getByText('₱16,420.00')).toBeTruthy();
    expect(screen.getByText('Aug 27, 2026 – Aug 28, 2026 vs Aug 25, 2026 – Aug 26, 2026')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Line chart comparing current and previous period net sales' })).toBeTruthy();
  });

  it('uses the shared hierarchy for selected values and semantic comparison deltas', () => {
    const { container, unmount } = render(<PosReportsComparisonPanel comparison={comparison} />);
    const table = screen.getByRole('table');
    const firstRow = table.querySelector('tbody tr');
    const metricLabel = firstRow.querySelector('th');
    const values = firstRow.querySelectorAll('td');

    expect(metricLabel.className).toContain('text-[#0F172A]');
    expect(values[0].className).toContain('text-[#15579B]');
    expect(values[1].className).toContain('text-[#475569]');
    expect(values[2].querySelector('span').className).toContain('text-[#059669]');

    const mobileCard = container.querySelector('[data-testid="pos-comparison-summary-mobile"] article');
    expect(within(mobileCard).getByText('Net Sales').className).toContain('text-[#0F172A]');
    expect(mobileCard.querySelectorAll('dd')[0].className).toContain('text-[#15579B]');
    expect(mobileCard.querySelectorAll('dd')[1].className).toContain('text-[#475569]');
    unmount();

    const decliningComparison = {
      ...comparison,
      flexible_range: {
        ...comparison.flexible_range,
        current: { ...comparison.flexible_range.current, net_sales: 100 },
        previous: { ...comparison.flexible_range.previous, net_sales: 200 }
      }
    };
    render(<PosReportsComparisonPanel comparison={decliningComparison} />);
    const decliningDelta = screen.getByRole('table').querySelector('tbody tr td:nth-of-type(3) span');
    expect(decliningDelta.className).toContain('text-[#DC2626]');
  });

  it('uses the shared Reports dropdown so comparison granularity changes in one interaction', async () => {
    const user = userEvent.setup();
    const onGranularityChange = vi.fn();
    render(<PosReportsComparisonPanel comparison={comparison} onGranularityChange={onGranularityChange} />);

    const selector = screen.getByRole('button', { name: 'Compare trend by: Daily' });
    await user.click(selector);
    expect(selector.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('option', { name: 'Weekly' }));
    expect(onGranularityChange).toHaveBeenCalledWith('weekly');
  });
});
