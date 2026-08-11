/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';
import { fetchPosCatalog } from '../services/posService.js';

vi.mock('../services/posService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchPosCatalog: vi.fn().mockResolvedValue([])
  };
});

vi.mock('@/services/itemService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getFolders: vi.fn().mockResolvedValue([])
  };
});

const buildProps = (overrides = {}) => ({
  viewMode: 'items',
  workflowMode: 'fnb',
  terminalUser: { user_id: 7, username: 'Catalog Admin' },
  locked: false,
  terminalMeta: { storefrontSlug: '' },
  shiftState: { loading: false, shift: null, cashSummary: null },
  todayDashboard: { loading: false },
  canViewPos: true,
  canManageCategories: true,
  canManageServiceCatalog: false,
  canCreateItems: false,
  canEditItems: false,
  canDeleteItems: false,
  canTransactPos: false,
  isOnline: true,
  operatingLocationId: 1,
  sectionIds: { items: 'pos-section-items' },
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Items category placement', () => {
  it('shows Items and Categories as tabs for an authorized catalog administrator', () => {
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    expect(screen.getByRole('tab', { name: 'Items' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Categories' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Items' }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens the online-only message when Categories is selected while offline', () => {
    render(<TerminalOperationsWorkspace {...buildProps({ isOnline: false })} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));

    expect(screen.getByText('Category management is available online only.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Categories' }).getAttribute('aria-selected')).toBe('true');
  });

  it('lets a category-only manager enter Categories without exposing the item list', () => {
    render(<TerminalOperationsWorkspace {...buildProps({
      canViewPos: false,
      canManageCategories: true,
      isOnline: false
    })} />);

    expect(screen.getByText('Category management is available online only.')).toBeTruthy();
    expect(screen.queryByText('Search by item name, SKU, or barcode')).toBeNull();
  });

  it('does not expose Category Management to an ordinary item viewer', () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: false })} />);

    expect(screen.queryByRole('tab', { name: 'Categories' })).toBeNull();
    expect(screen.queryByText('Category Management')).toBeNull();
  });

  it('uses retail product terminology in the add-item form', () => {
    render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'retail',
      canCreateItems: true
    })} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Item' })[0]);

    expect(screen.getByText('Product Category')).toBeTruthy();
    expect(screen.queryByText('Food Category')).toBeNull();
  });

  it('preserves food category terminology for F&B', () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canCreateItems: true })} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Item' })[0]);

    expect(screen.getByText('Food Category')).toBeTruthy();
  });

  it('places edit-item barcode fields directly under the Food Category section', async () => {
    fetchPosCatalog.mockResolvedValueOnce([{
      item_id: 24,
      name: 'Aloo Paratha',
      category: 'product',
      current_stock: 0,
      default_sale_price: 90,
      cost_per_unit: 67,
      pos_category: 'main-course'
    }]);

    render(<TerminalOperationsWorkspace {...buildProps({ canEditItems: true })} />);
    fireEvent.click(await screen.findByTitle('Edit Aloo Paratha'));

    const categoryLabel = screen.getByText('Food Category');
    const manualBarcodeLabel = screen.getByText('Manual Barcode (priority)');
    const gtinLabel = screen.getByText('GTIN / UPC / EAN');

    expect(categoryLabel.parentElement?.parentElement).toBe(manualBarcodeLabel.parentElement?.parentElement);
    expect(manualBarcodeLabel.compareDocumentPosition(gtinLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a separate service-create action only in Services mode with catalog permission', () => {
    const { rerender } = render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'services',
      canCreateItems: true,
      canManageServiceCatalog: true
    })} />);

    expect(screen.getAllByRole('button', { name: 'Add Service' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Add Item' }).length).toBeGreaterThan(0);

    rerender(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'retail',
      canCreateItems: true,
      canManageServiceCatalog: true
    })} />);

    expect(screen.queryByRole('button', { name: 'Add Service' })).toBeNull();
  });

  it('shows Service add-ons only in Services mode', () => {
    const { rerender } = render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'fnb',
      canManageServiceCatalog: true
    })} />);

    expect(screen.queryByRole('tab', { name: 'Service add-ons' })).toBeNull();

    rerender(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'services',
      canManageServiceCatalog: true
    })} />);

    expect(screen.getByRole('tab', { name: 'Service add-ons' })).toBeTruthy();
  });

  it('shows F&B menu modifier management only in standalone POS F&B mode', () => {
    const { rerender } = render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'fnb',
      canViewFnbModifiers: true,
      canManageFnbModifiers: true
    })} />);

    expect(screen.getByRole('tab', { name: 'Menu modifiers' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Service add-ons' })).toBeNull();

    rerender(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'retail',
      canViewFnbModifiers: true,
      canManageFnbModifiers: true
    })} />);

    expect(screen.queryByRole('tab', { name: 'Menu modifiers' })).toBeNull();
  });

  it('shows the online-only explanation without queueing an item draft', () => {
    const onQueueOfflineItemDraft = vi.fn();
    render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'services',
      canManageServiceCatalog: true,
      isOnline: false,
      onQueueOfflineItemDraft
    })} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Service' })[0]);

    expect(screen.getByText('Service creation is available online only.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Service' }).hasAttribute('disabled')).toBe(true);
    expect(onQueueOfflineItemDraft).not.toHaveBeenCalled();
  });

  it('uses Services catalog permission for canonical service edits', async () => {
    fetchPosCatalog.mockResolvedValueOnce([{
      item_id: 18,
      name: 'Wash and Fold',
      category: 'service',
      mode_item_preset: 'service',
      current_stock: 0,
      default_sale_price: 250,
      cost_per_unit: null
    }]);

    render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'services',
      canEditItems: false,
      canManageServiceCatalog: true
    })} />);

    expect(await screen.findByTitle('Edit Wash and Fold')).toBeTruthy();
    expect(screen.getByText('Service catalog entry')).toBeTruthy();
    expect(screen.getByText('Stock Exempt')).toBeTruthy();
    expect(screen.queryByText('Out of Stock')).toBeNull();
    expect(screen.getAllByText('Not tracked').length).toBeGreaterThan(0);
  });
});
