// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ItemCard from '../ItemCard.jsx';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false
  })
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => '' } }
}));

vi.mock('../../../src/hooks/usePermission', () => ({
  usePermission: () => ({
    canEdit: () => true,
    canDelete: () => true
  })
}));

afterEach(() => {
  cleanup();
});

const baseItem = {
  item_id: 10,
  id: 10,
  name: 'Milk Tea',
  sku_code: 'MT-001',
  category: 'product',
  product_type: 'finished_goods',
  status: 'active',
  max_capacity: 24,
  min_threshold: 4,
  unit_of_measure: 'pcs',
  cost_per_unit: 10,
  default_sale_price: 25
};

const renderCard = (props = {}) => render(
  <MemoryRouter>
    <ItemCard
      item={baseItem}
      onView={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      posVisible={false}
      storefrontVisible
      canTogglePosVisibility
      canToggleStorefrontVisibility
      {...props}
    />
  </MemoryRouter>
);

describe('ItemCard branch zero-stock hint (#682)', () => {
  it('shows the honest empty-state hint when the branch view has 0 stock', () => {
    renderCard({
      item: { ...baseItem, current_stock: 0 },
      branchZeroStockHint: 'No stock at this branch — receive or transfer inventory to make it available here.'
    });

    expect(screen.getByText(/no stock at this branch/i)).toBeTruthy();
  });

  it('does not show the hint when the item actually has stock at the branch', () => {
    renderCard({
      item: { ...baseItem, current_stock: 5 },
      branchZeroStockHint: 'No stock at this branch — receive or transfer inventory to make it available here.'
    });

    expect(screen.queryByText(/no stock at this branch/i)).toBeNull();
  });

  it('does not show the hint on the default "All Locations" view (hint prop absent)', () => {
    renderCard({ item: { ...baseItem, current_stock: 0 } });

    expect(screen.queryByText(/no stock at this branch/i)).toBeNull();
  });
});
