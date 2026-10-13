/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosItemsListView from '../components/PosItemsListView.jsx';
import PosItemsViewToggle from '../components/PosItemsViewToggle.jsx';

afterEach(() => cleanup());

const longName = 'Lami kaaayu ba hamoot pohfddfghjkhgfd';

const buildPresentation = (overrides = {}) => {
  const item = {
    item_id: 1,
    name: longName,
    sku_code: 'PRD-LKBH-001',
    folder: { name: 'Add Ons' },
    default_sale_price: 119.62,
    cost_per_unit: 0,
    current_stock: 0
  };
  return {
    item: { ...item, ...(overrides.item || {}) },
    isServiceItem: false,
    imageSources: { src: '', configuredLargeSrc: '' },
    previewSources: { gallery: [] },
    stockQuantity: 0,
    profit: 119.62,
    stockStatusLabel: 'Out of Stock',
    stockQuantityClassName: 'text-rose-700',
    ...(overrides.presentation || {})
  };
};

const buildListProps = (overrides = {}) => ({
  items: [buildPresentation()],
  formatMoney: (value) => Number(value || 0).toFixed(2),
  permissions: { canDelete: true, canEdit: true, canManageServiceCatalog: false },
  disabledActions: { delete: false, edit: false, serviceEdit: false },
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onImagePreview: vi.fn(),
  ...overrides
});

describe('POS Items list view', () => {
  it('renders the reference columns and keeps long names readable without selection controls', () => {
    render(<PosItemsListView {...buildListProps()} />);

    const table = screen.getByRole('table', { name: 'POS item list' });
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent.trim());
    const itemName = within(table).getByText(longName);
    const category = within(table).getByText('Add Ons').closest('td');
    const actionsHeading = within(table).getByRole('columnheader', { name: 'Actions' });
    const actionsGroup = screen.getByRole('button', { name: `Edit ${longName}` }).parentElement;

    expect(headers).toEqual(['Item', 'Category', 'SKU', 'Price (₱)', 'Cost (₱)', 'Profit (₱)', 'Stock', 'Actions']);
    expect(itemName.getAttribute('title')).toBe(longName);
    expect(within(table).getByText('Add Ons')).toBeTruthy();
    expect(category.className).toContain('font-semibold');
    expect(actionsHeading.className).toContain('!text-center');
    expect(actionsGroup.className).toContain('justify-center');
    expect(within(table).getByText('PRD-LKBH-001')).toBeTruthy();
    expect(within(table).getAllByText('₱119.62')).toHaveLength(2);
    expect(within(table).getByText('₱0.00')).toBeTruthy();
    expect(within(table).getByText(/Stock status: Out of Stock/)).toBeTruthy();
    expect(within(table).queryByRole('checkbox')).toBeNull();
  });

  it('routes the per-item Edit and Delete actions through their existing handlers', () => {
    const props = buildListProps();
    render(<PosItemsListView {...props} />);

    fireEvent.click(screen.getByRole('button', { name: `Edit ${longName}` }));
    fireEvent.click(screen.getByRole('button', { name: `Delete ${longName}` }));

    expect(props.onEdit).toHaveBeenCalledWith(props.items[0].item);
    expect(props.onDelete).toHaveBeenCalledWith(props.items[0].item);
  });

  it('respects existing authoring permissions and service-item cost/stock behavior', () => {
    const service = buildPresentation({
      item: { item_id: 2, name: 'Consultation', cost_per_unit: null, current_stock: 0 },
      presentation: { isServiceItem: true, stockStatusLabel: 'Stock Exempt' }
    });
    render(
      <PosItemsListView
        {...buildListProps({
          items: [service],
          permissions: { canDelete: false, canEdit: false, canManageServiceCatalog: true },
          disabledActions: { delete: false, edit: false, serviceEdit: true }
        })}
      />
    );

    expect(screen.getAllByText('Not tracked')).toHaveLength(2);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Consultation' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Delete Consultation' })).toBeNull();
  });
});

describe('POS Items view toggle', () => {
  it('exposes mutually exclusive accessible Grid and List buttons', () => {
    const onChange = vi.fn();
    render(<PosItemsViewToggle value="grid" onChange={onChange} />);

    const gridButton = screen.getByRole('button', { name: 'Grid view' });
    const listButton = screen.getByRole('button', { name: 'List view' });

    expect(screen.getByRole('group', { name: 'Items view' })).toBeTruthy();
    expect(gridButton.getAttribute('aria-pressed')).toBe('true');
    expect(listButton.getAttribute('aria-pressed')).toBe('false');
    expect(gridButton.className).toContain('bg-[#1A4E8D]');
    expect(gridButton.className).toContain('text-white');
    expect(listButton.className).not.toContain('bg-[#1A4E8D]');
    fireEvent.click(listButton);
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
