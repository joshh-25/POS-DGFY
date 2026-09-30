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
  it('uses the shared POS pagination footer with 20 rows per page', async () => {
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

    const pagination = screen.getByRole('navigation', { name: 'entries pagination' });
    const tableSurface = screen.getByRole('table').closest('div.rounded-xl');
    expect(tableSurface).toBeTruthy();
    expect(pagination.parentElement).not.toBe(tableSurface);
    expect(pagination.previousElementSibling).toBe(tableSurface);
    expect(pagination.className).toContain('dgfy-pos-pagination-footer');
    expect(pagination.className).toContain('max-[767px]:sticky');
    expect(pagination.className).toContain('max-[767px]:bottom-0');
    expect(screen.getByText('Showing 1–20 of 21 entries')).toBeTruthy();
    const pageSize = screen.getByRole('button', { name: 'Items per page' });
    expect(pageSize.getAttribute('aria-haspopup')).toBe('listbox');
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Previous page').disabled).toBe(true);
    expect(within(screen.getByTestId('pos-reports-table-mobile-view')).queryByText('Row 21')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
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
    expect(amountCell.className).toContain('text-[#475569]');
    expect(container.querySelector('tbody tr').className).toContain('text-slate-700');
  });

  it('uses semantic value tones in desktop cells and mobile summary cards', () => {
    const { container } = render(
      <PosReportsResponsiveTable
        rows={[{ invoice: 'NFS-000012', net_sales: '₱117.30', variance: -20 }]}
        columns={[
          { key: 'invoice', label: 'Invoice', required: true, mobileTitleLabel: false, valueTone: 'primary' },
          { key: 'net_sales', label: 'Net Sales', required: true, valueTone: 'brand' },
          { key: 'variance', label: 'Variance', required: true, valueTone: (row) => row.variance < 0 ? 'danger' : 'secondary' }
        ]}
        title="Semantic colors"
        idPrefix="semantic-colors"
      />
    );

    const desktopCells = container.querySelectorAll('table.pos-reports-responsive-table tbody tr:first-child td');
    expect(desktopCells[0].className).toContain('text-[#0F172A]');
    expect(desktopCells[1].className).toContain('text-[#15579B]');
    expect(desktopCells[2].className).toContain('text-[#DC2626]');

    const mobileCard = screen.getByTestId('semantic-colors-mobile-view').querySelector('article');
    const mobileTitle = within(mobileCard).getByText('NFS-000012');
    expect(mobileTitle.className).toContain('text-[#0F172A]');
    expect(mobileTitle.className).toContain('text-[13px]');
    expect(mobileTitle.className).toContain('font-bold');
    const mobileValues = mobileCard.querySelectorAll('dd');
    expect(mobileValues[0].className).toContain('text-[#15579B]');
    expect(mobileValues[1].className).toContain('text-[#DC2626]');
  });

  it('uses a dark neutral tone for the first mobile card value while preserving semantic tones', () => {
    render(
      <PosReportsResponsiveTable
        rows={[
          { period: 'September 24, 2026', tone: 'secondary' },
          { period: 'Rank 2', tone: 'muted' },
          { period: 'Negative variance', tone: 'danger' }
        ]}
        columns={[{
          key: 'period',
          label: 'Period',
          required: true,
          valueTone: (row) => row.tone
        }]}
        title="Mobile title tones"
        idPrefix="mobile-title-tones"
      />
    );

    const cards = screen.getByTestId('mobile-title-tones-mobile-view').querySelectorAll('article');
    const neutralTitle = within(cards[0]).getByText('September 24, 2026');
    const mutedTitle = within(cards[1]).getByText('Rank 2');
    const dangerTitle = within(cards[2]).getByText('Negative variance');

    expect(neutralTitle.className).toContain('text-[#0F172A]');
    expect(mutedTitle.className).toContain('text-[#0F172A]');
    expect(dangerTitle.className).toContain('text-[#DC2626]');
  });

  it('keeps left and compact center alignment straight under matching headers', () => {
    const { container } = render(
      <PosReportsResponsiveTable
        rows={[{ label: 'Operator', status: 'Active' }]}
        columns={[
          { key: 'label', label: 'Operator', align: 'left' },
          { key: 'status', label: 'Status', align: 'center' }
        ]}
        title="Operations alignment test"
        idPrefix="operations-alignment-test"
        ariaLabel="Operations alignment test table"
      />
    );

    const headers = container.querySelectorAll('thead th');
    const cells = container.querySelectorAll('tbody tr td');

    expect(headers[0].className).toContain('text-left');
    expect(cells[0].className).toContain('text-left');
    expect(headers[1].className).toContain('text-center');
    expect(cells[1].className).toContain('text-center');
  });

  it('caps the table at seven data columns and expands mobile details inline while keeping the desktop dialog', async () => {
    const user = userEvent.setup();
    const row = {
      invoice_number: 'NFS-000003',
      required_one: 'Required one',
      required_two: 'Required two',
      default_field: 'Default field',
      optional_one: 'Optional one',
      optional_two: 'Optional two',
      optional_three: 'Optional three',
      optional_four: 'Optional four',
      hidden_field: 'Hidden field'
    };

    render(
      <PosReportsResponsiveTable
        rows={[row]}
        columns={[
          { key: 'required_one', label: 'Required one', required: true },
          { key: 'required_two', label: 'Required two', required: true },
          { key: 'default_field', label: 'Default field', defaultVisible: true },
          { key: 'optional_one', label: 'Optional one' },
          { key: 'optional_two', label: 'Optional two' },
          { key: 'optional_three', label: 'Optional three' },
          { key: 'optional_four', label: 'Optional four' },
          { key: 'hidden_field', label: 'Hidden field', defaultVisible: false }
        ]}
        title="Sales transactions"
        ariaLabel="Sales transactions table"
        detailsDialogTitle="Transaction Details"
        getDetailsSubtitle={(selectedRow) => selectedRow.invoice_number}
      />
    );

    const table = screen.getByRole('table');
    expect(table.querySelectorAll('thead th')).toHaveLength(8);
    expect(within(table).getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
    expect(within(table).queryByRole('columnheader', { name: 'Hidden field' })).toBeNull();

    const mobileCard = within(screen.getByTestId('pos-reports-table-mobile-view')).getByRole('article');
    const mobileToggle = within(mobileCard).getByRole('button', { name: 'Show details for NFS-000003' });
    expect(mobileToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(mobileCard).queryByRole('region', { name: 'Additional details for NFS-000003' })).toBeNull();

    await user.click(mobileToggle);
    expect(mobileToggle.getAttribute('aria-expanded')).toBe('true');
    const mobileDetails = within(mobileCard).getByRole('region', { name: 'Additional details for NFS-000003' });
    const hiddenFieldLabel = within(mobileDetails).getByText('Hidden field', { selector: 'dt' });
    expect(hiddenFieldLabel.nextElementSibling.textContent).toBe('Hidden field');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(mobileToggle);
    expect(mobileToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(mobileCard).queryByRole('region', { name: 'Additional details for NFS-000003' })).toBeNull();

    await user.click(within(table).getByRole('button', { name: 'View details for NFS-000003' }));

    const dialog = screen.getByRole('dialog');
    const title = within(dialog).getByText('Transaction Details');
    expect(title.className).toContain('min-[768px]:text-[clamp(1.125rem,1.35vw,1.5rem)]');
    expect(within(dialog).getByText('NFS-000003')).toBeTruthy();
    const detailsDialog = screen.getByTestId('pos-reports-table-details-dialog');
    expect(detailsDialog.className).toContain('min-[768px]:max-w-4xl');
    expect(detailsDialog.className).toContain('min-[768px]:bg-white');
    const desktopHiddenFieldLabel = within(dialog).getByText('Hidden field', { selector: 'dt' });
    expect(desktopHiddenFieldLabel.className).toContain('min-[768px]:text-[clamp(0.75rem,0.8vw,0.8125rem)]');
    expect(desktopHiddenFieldLabel.className).toContain('min-[768px]:text-[#334155]');
    expect(desktopHiddenFieldLabel.nextElementSibling.className).toContain('min-[768px]:text-[clamp(0.8125rem,0.9vw,0.9375rem)]');
    expect(desktopHiddenFieldLabel.nextElementSibling.textContent).toBe('Hidden field');
  });

  it('renders employee-style mobile summaries and discloses hidden fields inline', async () => {
    const user = userEvent.setup();
    render(
      <PosReportsResponsiveTable
      rows={[{ item: 'UFC Banana Ketchup', net_sales: '₱245.00', units_sold: '12', average_price: '₱20.42', cogs: '₱189.00', margin: '22.86%' }]}
      columns={[
        { key: 'item', label: 'Item', required: true, visibility: { mobile: true } },
        { key: 'net_sales', label: 'Net Sales', required: true, visibility: { mobile: true } },
        { key: 'units_sold', label: 'Units Sold', visibility: { mobile: true } },
        { key: 'average_price', label: 'Average Price', visibility: { mobile: true } },
        { key: 'cogs', label: 'COGS', visibility: { mobile: false } },
          { key: 'margin', label: 'Profit Margin', defaultVisible: false, visibility: { mobile: false } }
        ]}
        title="Profit and loss items"
        ariaLabel="Profit and loss items table"
        idPrefix="mobile-profit-loss"
        initialSort={{ key: 'item', direction: 'asc' }}
      />
    );

    const mobileView = screen.getByTestId('mobile-profit-loss-mobile-view');
    const tableRegion = screen.getByRole('region', { name: 'Profit and loss items table' });
    expect(mobileView.className).toContain('min-[768px]:hidden');
    expect(mobileView.querySelector('article').className).toContain('rounded-xl');
    expect(tableRegion.className).toContain('overflow-x-auto');
    expect(within(tableRegion).getByRole('columnheader', { name: 'Net Sales' })).toBeTruthy();
    const mobileCard = within(mobileView).getByRole('listitem');
    const collapsedSummary = mobileCard.querySelector('article > dl');
    expect(within(mobileCard).getByText('UFC Banana Ketchup')).toBeTruthy();
    expect(within(collapsedSummary).getByText('₱245.00')).toBeTruthy();
    expect(within(collapsedSummary).getByText('12')).toBeTruthy();
    expect(within(collapsedSummary).queryByText('Average Price')).toBeNull();
    expect(within(collapsedSummary).queryByText('COGS')).toBeNull();
    expect(within(collapsedSummary).queryByText('Profit Margin')).toBeNull();

    const mobileToggle = within(mobileCard).getByRole('button', { name: 'Show details for UFC Banana Ketchup' });
    await user.click(mobileToggle);
    const details = within(mobileCard).getByRole('region', { name: 'Additional details for UFC Banana Ketchup' });
    expect(within(details).getByText('COGS', { selector: 'dt' }).nextElementSibling.textContent).toBe('₱189.00');
    expect(within(details).getByText('Profit Margin', { selector: 'dt' }).nextElementSibling.textContent).toBe('22.86%');
    expect(within(details).getByText('Average Price', { selector: 'dt' }).nextElementSibling.textContent).toBe('₱20.42');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('progressively reduces tablet columns while preserving the row Actions column', () => {
    const tabletColumns = Array.from({ length: 8 }, (_, index) => ({
      key: `field-${index + 1}`,
      label: `Field ${index + 1}`,
      required: true
    }));
    const { container } = render(
      <PosReportsResponsiveTable
        rows={[Object.fromEntries(tabletColumns.map((column, index) => [column.key, `Value ${index + 1}`]))]}
        columns={tabletColumns}
        title="Tablet report"
        idPrefix="tablet-report"
      />
    );

    const mobileView = screen.getByTestId('tablet-report-mobile-view');
    const tableSurface = screen.getByRole('region', { name: 'Reports table' });
    const table = within(tableSurface).getByRole('table');
    const headers = Array.from(table.querySelectorAll('thead th'));
    const findHeader = (label) => headers.find((header) => header.textContent.includes(label));

    expect(mobileView.className).toContain('min-[768px]:hidden');
    expect(tableSurface.className).toContain('min-[768px]:max-[1199px]:overflow-x-hidden');
    expect(findHeader('Field 4').className).toContain('table-cell');
    expect(findHeader('Field 5').className).toContain('hidden min-[1024px]:table-cell');
    expect(findHeader('Field 7').className).toContain('hidden min-[1200px]:table-cell');
    expect(findHeader('Actions')).toBeTruthy();
    expect(table.className).toContain('pos-reports-responsive-table');
    expect(container.querySelectorAll('[data-testid="tablet-report-mobile-view"] article')).toHaveLength(1);
  });

  it('omits redundant mobile sort controls and keeps the report default order', () => {
    render(
      <PosReportsResponsiveTable
        rows={[
          { item: 'First item', reference: 'Z-200' },
          { item: 'Second item', reference: 'A-100' }
        ]}
        columns={[
          { key: 'item', label: 'Item', visibility: { mobile: true } },
          { key: 'reference', label: 'Reference', visibility: { mobile: true } }
        ]}
        title="Report entries"
        ariaLabel="Report entries table"
        idPrefix="mobile-default-order-test"
        initialSort={{ key: 'item', direction: 'asc' }}
      />
    );

    const mobileView = screen.getByTestId('mobile-default-order-test-mobile-view');
    expect(within(mobileView).queryByLabelText('Sort by')).toBeNull();
    expect(within(mobileView).queryByRole('button', { name: /Change sort to/ })).toBeNull();
    expect(mobileView.querySelector('li').textContent).toContain('First item');
  });

  it('shows the appropriate empty message in the mobile card list', () => {
    render(
      <PosReportsResponsiveTable
        rows={[]}
        columns={columns}
        searchQuery="missing"
        emptyMessage="No report rows for this period."
        searchEmptyMessage="No report rows match your search."
        title="Report entries"
        idPrefix="empty-mobile-report"
      />
    );

    expect(within(screen.getByTestId('empty-mobile-report-mobile-view')).getByText('No report rows match your search.')).toBeTruthy();
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
