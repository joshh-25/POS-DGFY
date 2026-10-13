/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('keeps all financial overview columns available at their responsive widths', () => {
    render(<PosReportsOverviewTable rows={rows} />);

    ['Business Date', 'Recorded Transactions', 'Gross Sales (₱)', 'Net Sales (₱)', 'Discounts (₱)', 'Refunds/Voids (₱)'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: label })).toBeTruthy();
    });

    expect(screen.getByRole('columnheader', { name: 'Business Date' }).className).toContain('table-cell');
    expect(screen.getByRole('columnheader', { name: 'Discounts (₱)' }).className).toContain('hidden min-[1024px]:table-cell');
    expect(screen.getByRole('columnheader', { name: 'Refunds/Voids (₱)' }).className).toContain('hidden min-[1024px]:table-cell');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
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

  it('uses brand emphasis for net sales and danger only for non-zero refunds or voids', () => {
    const { container } = render(
      <PosReportsOverviewTable rows={[
        { ...rows[0], refunds_voids: 12.5 }
      ]} />
    );
    const cells = container.querySelectorAll('table.pos-reports-responsive-table tbody tr:first-child td');

    expect(cells[0].className).toContain('text-[#475569]');
    expect(cells[2].className).toContain('text-[#475569]');
    expect(cells[3].className).toContain('text-[#15579B]');
    expect(cells[4].className).toContain('text-[#475569]');
    expect(cells[5].className).toContain('text-[#DC2626]');
    expect(cells[2].className).not.toContain('text-[#059669]');
    expect(screen.getAllByText('₱-12.50').length).toBeGreaterThan(0);
  });

  it('uses the date as the card title and aligns the collapsed mobile values as label-value rows', () => {
    render(<PosReportsOverviewTable rows={rows} />);

    const mobileView = screen.getByTestId('pos-reports-overview-mobile-view');
    const card = within(mobileView).getByRole('article');
    const fields = Array.from(card.querySelector('dl').querySelectorAll(':scope > div'));

    expect(within(card).getByText('September 19, 2026')).toBeTruthy();
    expect(within(card).getByText('September 19, 2026').className).toContain('text-[#0F172A]');
    expect(within(card).queryByText('Business Date')).toBeNull();
    expect(card.querySelector('dl').className).toContain('space-y-1.5');
    expect(fields.map((field) => field.querySelector('dt')?.textContent)).toEqual([
      'Recorded Transactions',
      'Gross Sales (₱)'
    ]);
    expect(fields.map((field) => field.querySelector('dd')?.textContent)).toEqual([
      '7',
      '₱1,001.75'
    ]);
    fields.forEach((field) => expect(field.querySelector('dd').className).toContain('text-right'));
  });

  it('expands the remaining daily sales values inline without repeating the collapsed summary', async () => {
    const user = userEvent.setup();
    render(<PosReportsOverviewTable rows={rows} />);

    const mobileView = screen.getByTestId('pos-reports-overview-mobile-view');
    const card = within(mobileView).getByRole('article');
    const toggle = within(card).getByRole('button', { name: 'Show details for September 19, 2026' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle);

    const details = within(card).getByRole('region', { name: 'Additional details for September 19, 2026' });
    const netSalesValue = within(details).getByText('Net Sales (₱)', { selector: 'dt' }).nextElementSibling;
    expect(netSalesValue.textContent).toBe('₱978.50');
    expect(netSalesValue.className).toContain('text-[#15579B]');
    expect(within(details).getByText('Discounts (₱)', { selector: 'dt' }).nextElementSibling.textContent).toBe('₱23.25');
    expect(within(details).getByText('Refunds/Voids (₱)', { selector: 'dt' }).nextElementSibling.textContent).toBe('₱0.00');
    expect(within(details).queryByText('Recorded Transactions', { selector: 'dt' })).toBeNull();
    expect(within(details).queryByText('Gross Sales (₱)', { selector: 'dt' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(card).queryByRole('region', { name: 'Additional details for September 19, 2026' })).toBeNull();
  });
});
