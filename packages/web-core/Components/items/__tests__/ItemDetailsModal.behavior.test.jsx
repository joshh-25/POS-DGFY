// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ItemDetailsModal from '../ItemDetailsModal.jsx';

vi.mock('../FIFOBatchViewer', () => ({
  default: () => <div data-testid="fifo-batch-viewer">FIFO Batches</div>
}));
vi.mock('../BarcodeManager', () => ({ default: () => null }));
vi.mock('../details/BasicInfoSection', () => ({ default: () => null }));
vi.mock('../details/StockInventorySection', () => ({ default: () => null }));
vi.mock('../details/YieldManagementSection', () => ({ default: () => null }));
vi.mock('../details/NutritionalInfoSection', () => ({ default: () => null }));
vi.mock('../details/PhysicalPropertiesSection', () => ({ default: () => null }));
vi.mock('../details/ShelfLifeSection', () => ({ default: () => null }));
vi.mock('../details/PackagingInfoSection', () => ({ default: () => null }));
vi.mock('../details/CostFinancialSection', () => ({ default: () => null }));
vi.mock('../details/QualityControlSection', () => ({ default: () => null }));
vi.mock('../details/RegulatoryComplianceSection', () => ({ default: () => null }));

vi.mock('../../../src/hooks/usePermission', () => ({
  usePermission: () => ({ canDelete: () => false })
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = 'unset';
});

const baseItem = {
  item_id: 42,
  id: 42,
  name: 'Iced Tea',
  sku_code: 'TEA-001',
  status: 'active',
  category: 'raw_material',
  unit_of_measure: 'serving',
  current_stock: 8,
  max_capacity: 20,
  min_threshold: 2,
  purchase_allowance: 0,
  cost_per_unit: 10,
  default_sale_price: 25,
  fifo_enabled: false,
  description: 'Fresh brewed tea'
};

const fifoItem = {
  ...baseItem,
  fifo_enabled: true,
  shelf_life_days: 30,
  opened_shelf_life_days: 7
};

const renderDetails = (item, { itemEditorMode = false } = {}) => {
  const onClose = vi.fn();

  render(
    <MemoryRouter>
      <ItemDetailsModal
        item={item}
        open
        onClose={onClose}
        onRefresh={vi.fn()}
        itemEditorMode={itemEditorMode}
        workflowMode="fnb"
      />
    </MemoryRouter>
  );

  return onClose;
};

describe('ItemDetailsModal behavior', () => {
  it.each([
    ['simple items', baseItem],
    ['manufactured products', { ...baseItem, category: 'product', product_type: 'finished_goods' }]
  ])('provides a visible close action for %s', (_label, item) => {
    const onClose = renderDetails(item);
    const closeButton = screen.getByRole('button', { name: 'Close item details' });

    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes stock changes to Stock Movements in Item Editor mode', () => {
    renderDetails(baseItem, { itemEditorMode: true });

    expect(screen.getByRole('button', { name: 'View Movement History' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manage Stock' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create Stock Movement' })).toBeNull();
  });

  it('keeps stock movement actions for non-Item Editor callers', () => {
    renderDetails(baseItem);

    expect(screen.getByRole('button', { name: 'View Movement History' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Stock Movement' })).toBeTruthy();
  });

  it('hides FIFO batch and expiry presentation in Item Editor mode', () => {
    renderDetails(fifoItem, { itemEditorMode: true });

    expect(screen.queryByTestId('fifo-batch-viewer')).toBeNull();
    expect(screen.queryByText('Shelf Life Information')).toBeNull();
  });

  it('keeps FIFO batch presentation for non-Item Editor callers', () => {
    renderDetails(fifoItem);

    expect(screen.getByTestId('fifo-batch-viewer')).toBeTruthy();
    expect(screen.getByText('Shelf Life Information')).toBeTruthy();
  });
});
