/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsResponsiveTable from '../components/PosReportsResponsiveTable.jsx';

afterEach(cleanup);

const rows = Array.from({ length: 21 }, (_, index) => ({
  id: index + 1,
  label: `Row ${index + 1}`
}));

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'label', label: 'Label' }
];

describe('POS Reports responsive table', () => {
  it('uses the Settings-style pagination footer with 20 rows per page', async () => {
    const user = userEvent.setup();

    render(
      <PosReportsResponsiveTable
        rows={rows}
        columns={columns}
        initialSort={{ key: 'id', direction: 'asc' }}
        resultLabel="entries"
        title="Report entries"
      />
    );

    expect(screen.getByRole('navigation', { name: 'entries pagination' })).toBeTruthy();
    expect(screen.getByText('Showing 1–20 of 21 entries')).toBeTruthy();
    const pageSize = screen.getByRole('button', { name: 'entries per page: 20 / page' });
    expect(pageSize.getAttribute('aria-haspopup')).toBe('listbox');
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Previous Report entries page').disabled).toBe(true);
    expect(screen.queryByText('Row 21')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next Report entries page' }));
    expect(screen.getByText('Showing 21–21 of 21 entries')).toBeTruthy();
    expect(screen.getAllByText('Row 21').length).toBeGreaterThan(0);
    expect(screen.getByText('2 of 2')).toBeTruthy();

    await user.click(pageSize);
    expect(pageSize.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('option', { name: '50 / page' }));
    expect(screen.getByText('Showing 1–21 of 21 entries')).toBeTruthy();
    expect(screen.getByText('1 of 1')).toBeTruthy();
    expect(screen.getAllByText('Row 21').length).toBeGreaterThan(0);
  });

  it('keeps numeric headers and values aligned while emphasizing table data', () => {
    const { container } = render(
      <PosReportsResponsiveTable
        rows={[{ id: 1, label: 'Net sales', amount: 1234.5 }]}
        columns={[
          { key: 'label', label: 'Metric' },
          { key: 'amount', label: 'Amount', align: 'right' }
        ]}
        title="Alignment test"
        idPrefix="alignment-test"
        ariaLabel="Alignment test table"
      />
    );

    const amountHeader = container.querySelector('thead th:nth-child(2)');
    const amountCell = container.querySelector('tbody tr td:nth-child(2)');

    expect(amountHeader.className).toContain('text-right');
    expect(amountCell.className).toContain('text-right');
    expect(amountCell.className).toContain('font-semibold');
    expect(amountCell.className).toContain('tabular-nums');
    expect(container.querySelector('tbody tr').className).toContain('text-slate-700');
  });

  it('keeps every report field in the sortable table at narrow widths', () => {
    const { container } = render(
      <PosReportsResponsiveTable
        rows={[{ item: 'UFC Banana Ketchup', net_sales: '₱245.00', cogs: '₱189.00', margin: '22.86%' }]}
        columns={[
          { key: 'item', label: 'Item' },
          { key: 'net_sales', label: 'Net Sales' },
          { key: 'cogs', label: 'COGS' },
          { key: 'margin', label: 'Profit Margin' }
        ]}
        title="Profit and loss items"
        ariaLabel="Profit and loss items table"
        idPrefix="mobile-profit-loss"
        initialSort={{ key: 'item', direction: 'asc' }}
      />
    );

    const tableRegion = screen.getByRole('region', { name: 'Profit and loss items table' });
    expect(container.querySelector('.pos-reports-mobile-view')).toBeNull();
    expect(container.querySelector('.pos-reports-mobile-sort')).toBeNull();
    expect(tableRegion.className).toContain('overflow-x-auto');
    expect(within(tableRegion).getByRole('columnheader', { name: 'Net Sales' })).toBeTruthy();
    expect(within(tableRegion).getByRole('columnheader', { name: 'COGS' })).toBeTruthy();
    expect(within(tableRegion).getByRole('columnheader', { name: 'Profit Margin' })).toBeTruthy();
    expect(within(tableRegion).getByText('UFC Banana Ketchup')).toBeTruthy();
    expect(within(tableRegion).getByText('₱245.00')).toBeTruthy();
    expect(within(tableRegion).getByText('₱189.00')).toBeTruthy();
    expect(within(tableRegion).getByText('22.86%')).toBeTruthy();
  });

  it('sorts the table by any column through its sortable headers', async () => {
    const user = userEvent.setup();
    render(
      <PosReportsResponsiveTable
        rows={[
          { item: 'First item', reference: 'Z-200' },
          { item: 'Second item', reference: 'A-100' }
        ]}
        columns={[
          { key: 'item', label: 'Item' },
          { key: 'reference', label: 'Reference' }
        ]}
        title="Report entries"
        ariaLabel="Report entries table"
        idPrefix="mobile-sort-test"
        initialSort={{ key: 'item', direction: 'asc' }}
      />
    );

    const tableRegion = screen.getByRole('region', { name: 'Report entries table' });
    await user.click(within(tableRegion).getByRole('button', { name: 'Sort by Reference' }));

    const rowsAfterAscendingSort = Array.from(tableRegion.querySelectorAll('tbody tr'));
    expect(rowsAfterAscendingSort[0].textContent).toContain('Second item');
    expect(rowsAfterAscendingSort[1].textContent).toContain('First item');

    await user.click(within(tableRegion).getByRole('button', { name: 'Sort by Reference' }));
    const rowsAfterDescendingSort = Array.from(tableRegion.querySelectorAll('tbody tr'));
    expect(rowsAfterDescendingSort[0].textContent).toContain('First item');
    expect(rowsAfterDescendingSort[1].textContent).toContain('Second item');
  });
});
