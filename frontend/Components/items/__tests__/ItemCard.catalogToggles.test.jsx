// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const item = {
  item_id: 10,
  id: 10,
  name: 'Milk Tea',
  sku_code: 'MT-001',
  category: 'product',
  product_type: 'finished_goods',
  status: 'active',
  current_stock: 12,
  max_capacity: 24,
  min_threshold: 4,
  unit_of_measure: 'pcs',
  cost_per_unit: 10,
  default_sale_price: 25
};

const renderCard = (props = {}) => render(
  <MemoryRouter>
    <ItemCard
      item={item}
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

describe('ItemCard catalog toggles', () => {
  it('renders independent POS and storefront visibility toggles', () => {
    renderCard();

    expect(screen.getByRole('switch', { name: /toggle pos visibility for milk tea/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /toggle storefront visibility for milk tea/i })).toBeTruthy();
  });

  it('toggling POS does not call storefront handler', async () => {
    const user = userEvent.setup();
    const onTogglePosVisibility = vi.fn();
    const onToggleStorefrontVisibility = vi.fn();
    renderCard({ onTogglePosVisibility, onToggleStorefrontVisibility });

    await user.click(screen.getByRole('switch', { name: /toggle pos visibility for milk tea/i }));

    expect(onTogglePosVisibility).toHaveBeenCalledWith(item, true);
    expect(onToggleStorefrontVisibility).not.toHaveBeenCalled();
  });

  it('toggling storefront does not call POS handler', async () => {
    const user = userEvent.setup();
    const onTogglePosVisibility = vi.fn();
    const onToggleStorefrontVisibility = vi.fn();
    renderCard({ onTogglePosVisibility, onToggleStorefrontVisibility });

    await user.click(screen.getByRole('switch', { name: /toggle storefront visibility for milk tea/i }));

    expect(onToggleStorefrontVisibility).toHaveBeenCalledWith(item, false);
    expect(onTogglePosVisibility).not.toHaveBeenCalled();
  });

  it('can hide visibility controls when catalog state is not available to the current user', () => {
    renderCard({
      showPosVisibilityControl: false,
      showStorefrontVisibilityControl: false
    });

    expect(screen.queryByRole('switch', { name: /toggle pos visibility for milk tea/i })).toBeNull();
    expect(screen.queryByRole('switch', { name: /toggle storefront visibility for milk tea/i })).toBeNull();
  });

  it('uses workflow mode to keep Services physical add-ons cost-only until made sellable', () => {
    renderCard({
      workflowMode: 'services',
      posVisible: false,
      storefrontVisible: false,
      item: {
        ...item,
        name: 'Salon Scissors',
        sku_code: 'SC-001',
        mode_item_preset: 'physical_add_on',
        default_sale_price: 250,
        cost_per_unit: 120
      }
    });

    expect(screen.getByText('Unit Cost')).toBeTruthy();
    expect(screen.queryByText('Selling Price')).toBeNull();
  });

  it('shows Services physical add-on selling price once configured for a sales surface', () => {
    renderCard({
      workflowMode: 'services',
      posVisible: false,
      storefrontVisible: true,
      item: {
        ...item,
        name: 'Salon Scissors',
        sku_code: 'SC-001',
        mode_item_preset: 'physical_add_on',
        default_sale_price: 250,
        cost_per_unit: 120
      }
    });

    expect(screen.getByText('Selling Price')).toBeTruthy();
    expect(screen.getByText('₱250.00')).toBeTruthy();
  });
});
