/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosItemResponsiveCard from '../components/PosItemResponsiveCard.jsx';

afterEach(() => cleanup());

const longName = 'Lami kaaayu ba hamoot pohfddfghjkhgfd';

const buildProps = (overrides = {}) => ({
  item: {
    item_id: 1,
    name: longName,
    sku_code: 'PRD-LKBH-001',
    folder: { name: 'Add Ons' },
    default_sale_price: 119.62,
    cost_per_unit: 0
  },
  isServiceItem: false,
  imageSources: { src: '', configuredLargeSrc: '' },
  imageGallery: [],
  stock: {
    quantity: 0,
    quantityClassName: 'text-sky-700',
    statusLabel: 'Always Available',
    badgeClassName: 'border-sky-200 bg-sky-50 text-sky-800',
    dotClassName: 'bg-sky-500'
  },
  profit: 119.62,
  formatMoney: (value) => Number(value || 0).toFixed(2),
  permissions: { canDelete: true, canEdit: true },
  disabledActions: { delete: false, edit: false },
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onImagePreview: vi.fn(),
  ...overrides
});

describe('POS responsive Items card', () => {
  it('preserves the complete item name and stock status in accessible content', () => {
    render(<PosItemResponsiveCard {...buildProps()} />);

    const title = screen.getByRole('heading', { level: 3, name: longName });
    expect(title.getAttribute('title')).toBe(longName);
    expect(title.className).toContain('line-clamp-2');
    expect(screen.getByTestId('pos-item-stock-status').textContent).toBe('Always Available');
  });

  it('does not show a divider between the category and product code', () => {
    render(<PosItemResponsiveCard {...buildProps()} />);

    const productCode = screen.getByText('PRD-LKBH-001');
    expect(productCode.closest('div').className).not.toContain('border-t');
  });

  it('renders the desktop metrics in the reference 2x2 order with status shown only on the image', () => {
    const { container } = render(<PosItemResponsiveCard {...buildProps()} />);
    const metrics = screen.getByTestId('pos-item-responsive-metrics');
    const cells = Array.from(metrics.children);
    const labels = cells.map((cell) => cell.querySelector('div p')?.textContent.trim());
    const image = container.querySelector('.pos-items-responsive-image');

    expect(metrics.className).toContain('grid-cols-2');
    expect(metrics.className).toContain('shrink-0');
    expect(metrics.className).toContain('grid-rows-[repeat(2,minmax(2.25rem,auto))]');
    expect(metrics.className).toContain('border-slate-300/40');
    expect(labels).toEqual(['Cost (₱):', 'Stock:', 'Price (₱):', 'Profit (₱):']);
    expect(cells.every((cell) => cell.className.includes('justify-between'))).toBe(true);
    expect(cells[1].textContent).toContain('0');
    expect(screen.queryByTestId('pos-item-stock-status-metric')).toBeNull();
    expect(image?.contains(screen.getByTestId('pos-item-stock-status'))).toBe(true);
  });

  it('keeps existing permission-gated edit and delete actions wired to their handlers', () => {
    const props = buildProps();
    render(<PosItemResponsiveCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Item' }));

    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onEdit).toHaveBeenCalledOnce();
  });

  it('does not render authoring actions when their existing permissions are absent', () => {
    render(<PosItemResponsiveCard {...buildProps({ permissions: { canDelete: false, canEdit: false } })} />);

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Item' })).toBeNull();
  });
});
