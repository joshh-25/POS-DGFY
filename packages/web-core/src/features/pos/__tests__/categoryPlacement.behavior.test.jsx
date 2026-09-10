/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep category-order coverage deterministic: DndContext captures the handler so the test can
// exercise the same reorder path without depending on browser pointer geometry in jsdom.
let capturedCategoryDragEnd = null;
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }) => {
    capturedCategoryDragEnd = onDragEnd;
    return children;
  },
  closestCenter: {},
  KeyboardSensor: {},
  PointerSensor: {},
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    isDragging: false
  }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useSensor: () => ({}),
  useSensors: () => []
}));

import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';
import { fetchPosCatalogPage } from '../services/posService.js';
import { getFolders, reorderFolders } from '@/services/itemService.js';

vi.mock('../services/posService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchPosCatalog: vi.fn().mockResolvedValue([]),
    fetchPosCatalogPage: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, page_size: 15, total: 0, total_pages: 1 } })
  };
});

vi.mock('@/services/itemService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getFolders: vi.fn().mockResolvedValue([]),
    reorderFolders: vi.fn().mockResolvedValue({ success: true })
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
  capturedCategoryDragEnd = null;
  vi.clearAllMocks();
});

describe('Items category placement', () => {
  it('renders saved category order with drag handles and disables rearranging during search', async () => {
    getFolders.mockResolvedValue([
      { folder_id: 2, name: 'Drinks', sort_order: 0, is_active: true },
      { folder_id: 1, name: 'Mains', sort_order: 1, is_active: true }
    ]);
    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));

    const drinksHandle = await screen.findByRole('button', { name: 'Move Drinks' });
    const mainsHandle = screen.getByRole('button', { name: 'Move Mains' });
    expect(drinksHandle.compareDocumentPosition(mainsHandle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(drinksHandle.disabled).toBe(false);

    fireEvent.change(screen.getByPlaceholderText('Search categories'), { target: { value: 'Drink' } });
    expect(screen.getByRole('button', { name: 'Move Drinks' }).disabled).toBe(true);
  });

  it('saves the complete reordered ID list and leaves the optimistic order visible', async () => {
    getFolders.mockResolvedValue([
      { folder_id: 1, name: 'Mains', sort_order: 0, is_active: true },
      { folder_id: 2, name: 'Drinks', sort_order: 1, is_active: true },
      { folder_id: 3, name: 'Desserts', sort_order: 2, is_active: true }
    ]);
    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));
    await screen.findByRole('button', { name: 'Move Mains' });

    await capturedCategoryDragEnd({ active: { id: 3 }, over: { id: 1 } });

    await waitFor(() => expect(reorderFolders).toHaveBeenCalledWith([3, 1, 2]));
    const handles = screen.getAllByRole('button', { name: /^Move / });
    expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual([
      'Move Desserts',
      'Move Mains',
      'Move Drinks'
    ]);
  });

  it('refreshes the authoritative list after a stale reorder instead of keeping a rejected order', async () => {
    const initialFolders = [
      { folder_id: 1, name: 'Mains', sort_order: 0, is_active: true },
      { folder_id: 2, name: 'Drinks', sort_order: 1, is_active: true },
      { folder_id: 3, name: 'Desserts', sort_order: 2, is_active: true }
    ];
    const refreshedFolders = [
      { folder_id: 2, name: 'Drinks', sort_order: 0, is_active: true },
      { folder_id: 3, name: 'Desserts', sort_order: 1, is_active: true }
    ];
    getFolders.mockResolvedValue(initialFolders);
    reorderFolders.mockImplementationOnce(async () => {
      // The category set changed in another tab while this tab was open.
      getFolders.mockResolvedValue(refreshedFolders);
      const staleError = new Error('Category list changed. Refresh and try again.');
      staleError.response = { status: 409, data: { message: staleError.message } };
      throw staleError;
    });

    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));
    await screen.findByRole('button', { name: 'Move Mains' });

    await capturedCategoryDragEnd({ active: { id: 3 }, over: { id: 1 } });

    await waitFor(() => expect(getFolders.mock.calls.length).toBeGreaterThan(1));
    expect(reorderFolders).toHaveBeenCalledWith([3, 1, 2]);
    expect(screen.queryByRole('button', { name: 'Move Mains' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Move / }).map((handle) => handle.getAttribute('aria-label')))
      .toEqual(['Move Drinks', 'Move Desserts']);
  });

  it('queries the complete server catalog with search, filters, location, and page size', async () => {
    fetchPosCatalogPage.mockResolvedValue({
      items: [{ item_id: 601, name: 'Tomato Meatballs', current_stock: 10 }],
      pagination: { page: 1, page_size: 15, total: 1, total_pages: 1 }
    });
    render(<TerminalOperationsWorkspace {...buildProps({ operatingLocationId: 9, canEditItems: true })} />);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'meat' } });

    await waitFor(() => expect(fetchPosCatalogPage).toHaveBeenLastCalledWith({
      search: 'meat',
      page: 1,
      page_size: 15,
      category_filter: 'all',
      stock_filter: 'all',
      location_id: 9
    }));
    expect(await screen.findByTitle('Edit Tomato Meatballs')).toBeTruthy();
    expect(screen.getByText('Showing 1–1 of 1 items')).toBeTruthy();
  });

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
    fetchPosCatalogPage.mockResolvedValueOnce({ items: [{
      item_id: 24,
      name: 'Aloo Paratha',
      category: 'product',
      current_stock: 0,
      default_sale_price: 90,
      cost_per_unit: 67,
      pos_category: 'main-course'
    }], pagination: { page: 1, page_size: 15, total: 1, total_pages: 1 } });

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
    fetchPosCatalogPage.mockResolvedValueOnce({ items: [{
      item_id: 18,
      name: 'Wash and Fold',
      category: 'service',
      mode_item_preset: 'service',
      current_stock: 0,
      default_sale_price: 250,
      cost_per_unit: null
    }], pagination: { page: 1, page_size: 15, total: 1, total_pages: 1 } });

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
