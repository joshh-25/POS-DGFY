/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep category-order coverage deterministic: DndContext captures the handler so the test can
// exercise the same reorder path without depending on browser pointer geometry in jsdom.
let capturedCategoryDragEnd = null;
const draggablePointerDown = vi.hoisted(() => vi.fn());
const draggableKeyDown = vi.hoisted(() => vi.fn());
const categoryToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
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
    listeners: { onPointerDown: draggablePointerDown, onKeyDown: draggableKeyDown },
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    isDragging: false
  }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useSensor: () => ({}),
  useSensors: () => []
}));

import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';
import { resolveSellablePosItemPreset } from '../components/PosItemsWorkspace.jsx';
import { fetchPosCatalogPage } from '../services/posService.js';
import { getFolders, getItems, reorderFolders } from '@/services/itemService.js';

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
    getItems: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
    reorderFolders: vi.fn().mockResolvedValue({ success: true })
  };
});

vi.mock('@/src/utils/iminRuntimeFeedback.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, posToast: categoryToast };
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
  it('selects the effective Food & Beverage sellable preset for item creation', () => {
    expect(resolveSellablePosItemPreset('fnb')).toEqual(expect.objectContaining({
      key: 'menu_item',
      category: 'product'
    }));
    expect(resolveSellablePosItemPreset('food_manufacturing', ['fnbDining'])).toEqual(expect.objectContaining({
      key: 'menu_item',
      category: 'product'
    }));
    expect(resolveSellablePosItemPreset('food_manufacturing')).toEqual(expect.objectContaining({
      key: 'finished_product',
      category: 'product'
    }));
  });

  it('keeps reorder controls hidden until reorder mode and disables rearranging during search', async () => {
    getFolders.mockResolvedValue([
      { folder_id: 2, name: 'Drinks', sort_order: 0, is_active: true },
      { folder_id: 1, name: 'Mains', sort_order: 1, is_active: true }
    ]);
    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));

    const drinksCard = await screen.findByTestId('pos-category-card-2');
    const mainsCard = screen.getByTestId('pos-category-card-1');
    expect(drinksCard.compareDocumentPosition(mainsCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Storefront category priority order' })).toBeTruthy();

    expect(screen.queryByText('Storefront category order')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reorder Drinks, priority 1 of 2' })).toBeNull();
    const hiddenInstructions = screen.getByText(/When reorder mode is active/);
    expect(hiddenInstructions.classList.contains('sr-only')).toBe(true);
    const editButtons = screen.getAllByTitle('Edit category Drinks');
    expect(editButtons[0].disabled).toBe(false);
    const reorderButton = screen.getByRole('button', { name: 'Reorder categories' });
    expect(reorderButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(reorderButton);

    const drinksHandle = screen.getByRole('button', { name: 'Reorder Drinks, priority 1 of 2' });
    expect(drinksHandle.classList.contains('enabled:cursor-grab')).toBe(true);
    expect(drinksCard.classList.contains('cursor-grab')).toBe(false);
    expect(screen.getByRole('button', { name: 'Done reordering categories' }).getAttribute('aria-pressed')).toBe('true');
    expect(editButtons[0].disabled).toBe(true);
    expect(draggablePointerDown).not.toHaveBeenCalled();
    expect(draggableKeyDown).not.toHaveBeenCalled();
    fireEvent.pointerDown(drinksHandle);
    fireEvent.keyDown(drinksHandle, { code: 'Space' });
    expect(draggablePointerDown).toHaveBeenCalledTimes(1);
    expect(draggableKeyDown).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText('Search Categories'), { target: { value: 'Drink' } });
    expect(screen.queryByRole('button', { name: 'Reorder Drinks, priority 1 of 2' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reorder categories' }).disabled).toBe(true);
    expect(screen.getByText('Clear the search to reorder the full category list.')).toBeTruthy();
  });

  it('saves the complete reordered ID list and leaves the optimistic order visible', async () => {
    getFolders.mockResolvedValue([
      { folder_id: 1, name: 'Mains', sort_order: 0, is_active: true },
      { folder_id: 2, name: 'Drinks', sort_order: 1, is_active: true },
      { folder_id: 3, name: 'Desserts', sort_order: 2, is_active: true }
    ]);
    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));
    await screen.findByTestId('pos-category-card-1');
    fireEvent.click(screen.getByRole('button', { name: 'Reorder categories' }));

    await capturedCategoryDragEnd({ active: { id: 3 }, over: { id: 1 } });

    await waitFor(() => expect(reorderFolders).toHaveBeenCalledWith([3, 1, 2]));
    expect(categoryToast.success).toHaveBeenCalledWith('Category order saved.');
    const handles = screen.getAllByRole('button', { name: /^Reorder .+, priority/ });
    expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual([
      'Reorder Desserts, priority 1 of 3',
      'Reorder Mains, priority 2 of 3',
      'Reorder Drinks, priority 3 of 3'
    ]);
    expect(screen.queryByTestId('pos-category-reorder-status')).toBeNull();
  });

  it('restores the previous order and announces the failure when saving a reorder fails', async () => {
    getFolders.mockResolvedValue([
      { folder_id: 1, name: 'Mains', sort_order: 0, is_active: true },
      { folder_id: 2, name: 'Drinks', sort_order: 1, is_active: true }
    ]);
    reorderFolders.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));
    await screen.findByTestId('pos-category-card-1');
    fireEvent.click(screen.getByRole('button', { name: 'Reorder categories' }));

    await capturedCategoryDragEnd({ active: { id: 2 }, over: { id: 1 } });

    expect(reorderFolders).toHaveBeenCalledWith([2, 1]);
    expect(categoryToast.success).not.toHaveBeenCalled();
    expect(categoryToast.error).toHaveBeenCalledWith('Unable to save the category order. The previous order was restored.');
    expect(screen.getAllByRole('button', { name: /^Reorder .+, priority/ }).map((handle) => handle.getAttribute('aria-label')))
      .toEqual(['Reorder Mains, priority 1 of 2', 'Reorder Drinks, priority 2 of 2']);
    expect(screen.queryByTestId('pos-category-reorder-status')).toBeNull();
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
    await screen.findByTestId('pos-category-card-1');
    fireEvent.click(screen.getByRole('button', { name: 'Reorder categories' }));

    await capturedCategoryDragEnd({ active: { id: 3 }, over: { id: 1 } });

    await waitFor(() => expect(getFolders.mock.calls.length).toBeGreaterThan(1));
    expect(reorderFolders).toHaveBeenCalledWith([3, 1, 2]);
    expect(screen.queryByTestId('pos-category-card-1')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Reorder .+, priority/ }).map((handle) => handle.getAttribute('aria-label')))
      .toEqual(['Reorder Drinks, priority 1 of 2', 'Reorder Desserts, priority 2 of 2']);
    expect(categoryToast.error).toHaveBeenCalledWith('Category list changed. Refresh and try again.');
    expect(screen.queryByTestId('pos-category-reorder-status')).toBeNull();
  });

  it('queries the complete server catalog with search, filters, location, and page size', async () => {
    fetchPosCatalogPage.mockResolvedValue({
      items: [{ item_id: 601, name: 'Tomato Meatballs', current_stock: 10 }],
      pagination: { page: 1, page_size: 15, total: 1, total_pages: 1 }
    });
    render(<TerminalOperationsWorkspace {...buildProps({ operatingLocationId: 9, canEditItems: true })} />);

    fireEvent.change(document.getElementById('pos-items-search'), { target: { value: 'meat' } });

    await waitFor(() => expect(fetchPosCatalogPage).toHaveBeenLastCalledWith({
      search: 'meat',
      page: 1,
      page_size: 20,
      category_filter: 'all',
      stock_filter: 'all',
      location_id: 9
    }));
    expect((await screen.findAllByTitle('Edit Tomato Meatballs')).length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–1 of 1 entries')).toBeTruthy();
  });

  it('waits for a valid location context before requesting the catalog', async () => {
    const locationState = {
      loading: false,
      locations: [{ location_id: 1, name: 'Main Branch', is_active: true }]
    };
    const { rerender } = render(<TerminalOperationsWorkspace {...buildProps({
      operatingLocationId: null,
      locationsState: locationState
    })} />);

    await waitFor(() => expect(fetchPosCatalogPage).not.toHaveBeenCalled());

    rerender(<TerminalOperationsWorkspace {...buildProps({
      operatingLocationId: 9,
      locationsState: locationState
    })} />);

    await waitFor(() => expect(fetchPosCatalogPage).not.toHaveBeenCalled());

    rerender(<TerminalOperationsWorkspace {...buildProps({
      operatingLocationId: 1,
      locationsState: locationState
    })} />);

    await waitFor(() => expect(fetchPosCatalogPage).toHaveBeenCalledWith({
      search: '',
      page: 1,
      page_size: 20,
      category_filter: 'all',
      stock_filter: 'all',
      location_id: 1
    }));
  });

  it('keeps the current alphabetic item order when saved category order differs', async () => {
    getFolders.mockResolvedValue([
      { folder_id: 2, name: 'Drinks', sort_order: 0, is_active: true, show_in_pos_filter: true },
      { folder_id: 1, name: 'Mains', sort_order: 1, is_active: true, show_in_pos_filter: true }
    ]);
    fetchPosCatalogPage.mockResolvedValue({
      items: [
        { item_id: 701, name: 'Zulu Drink', folder_id: 2, folder: { name: 'Drinks', sort_order: 0 } },
        { item_id: 702, name: 'Alpha Main', folder_id: 1, folder: { name: 'Mains', sort_order: 1 } }
      ],
      pagination: { page: 1, page_size: 15, total: 2, total_pages: 1 }
    });
    render(<TerminalOperationsWorkspace {...buildProps({ canEditItems: true })} />);

    const mainsEdit = (await screen.findAllByTitle('Edit Alpha Main'))[0];
    const drinksEdit = screen.getAllByTitle('Edit Zulu Drink')[0];
    expect(mainsEdit.compareDocumentPosition(drinksEdit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows Items and Categories as tabs for an authorized catalog administrator', () => {
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    expect(screen.getByRole('tab', { name: 'Items' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Categories' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Items' }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens the online-only message when Categories is selected while offline', async () => {
    render(<TerminalOperationsWorkspace {...buildProps({ isOnline: false })} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));

    expect(await screen.findByText('Category management is available online only.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Categories' }).getAttribute('aria-selected')).toBe('true');
  });

  it('lets a category-only manager enter Categories without exposing the item list', () => {
    render(<TerminalOperationsWorkspace {...buildProps({
      canViewPos: false,
      canManageCategories: true,
      isOnline: false
    })} />);

    expect(screen.getByRole('region', { name: 'Categories' })).toBeTruthy();
    expect(screen.getByText('Category management is available online only.')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search item by Name, SKU, or Barcode')).toBeNull();
  });

  it('lets a catalog-only manager open Items and Add Items without POS view permission', async () => {
    getFolders.mockResolvedValue([{ folder_id: 1, name: 'Mains', is_active: true, show_in_pos_filter: true }]);
    getItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 }
    });

    render(<TerminalOperationsWorkspace {...buildProps({
      canViewPos: false,
      catalogOnlyAccess: true,
      canCreateItems: true,
      canManageCategories: true,
      operatingLocationId: null
    })} />);

    expect(screen.getByRole('tab', { name: 'Items' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Categories' })).toBeTruthy();
    await waitFor(() => expect(getItems).toHaveBeenCalledWith({
      search: '',
      page: 1,
      limit: 20
    }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Items' })[0]);
    expect(await screen.findByRole('dialog', { name: 'Product Details' })).toBeTruthy();
    expect(screen.queryByText('Always Available')).toBeNull();
    expect(screen.queryByText('Best Seller')).toBeNull();
    expect(screen.queryByText('Add Options')).toBeNull();
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Items' })[0]);

    expect(screen.getByText('Product Category')).toBeTruthy();
    expect(screen.queryByText('Food Category')).toBeNull();
  });

  it('preserves food category terminology for F&B', () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canCreateItems: true })} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Items' })[0]);

    expect(screen.getByText('Food Category')).toBeTruthy();
  });

  it('places edit-item barcode fields in full-width stacked rows', async () => {
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
    fireEvent.click((await screen.findAllByTitle('Edit Aloo Paratha'))[0]);

    const manualBarcodeInput = screen.getByLabelText('Manual Barcode (priority)');
    const gtinInput = screen.getByLabelText('GTIN / UPC / EAN');
    const manualBarcodeRow = manualBarcodeInput.parentElement;
    const gtinRow = gtinInput.parentElement;

    expect(manualBarcodeRow?.className).toContain('sm:col-span-2');
    expect(gtinRow?.className).toContain('sm:col-span-2');
    expect(manualBarcodeRow?.className).toContain('space-y-1');
    expect(gtinRow?.className).toContain('space-y-1');
    expect(manualBarcodeInput.compareDocumentPosition(gtinInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a separate service-create action only in Services mode with catalog permission', () => {
    const { rerender } = render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'services',
      canCreateItems: true,
      canManageServiceCatalog: true
    })} />);

    expect(screen.getAllByRole('button', { name: 'Add Service' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Add Items' }).length).toBeGreaterThan(0);

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

    expect(screen.getByRole('tab', { name: 'Item Options & Modifiers' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Service add-ons' })).toBeNull();

    rerender(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'retail',
      canViewFnbModifiers: true,
      canManageFnbModifiers: true
    })} />);

    expect(screen.queryByRole('tab', { name: 'Item Options & Modifiers' })).toBeNull();
  });

  it('shows the online-only explanation without queueing an item draft', async () => {
    const onQueueOfflineItemDraft = vi.fn();
    render(<TerminalOperationsWorkspace {...buildProps({
      workflowMode: 'services',
      canManageServiceCatalog: true,
      isOnline: false,
      onQueueOfflineItemDraft
    })} />);

    const addServiceButton = screen.getAllByRole('button', { name: 'Add Service' }).at(-1);
    fireEvent.click(addServiceButton);

    expect(await screen.findByText('Service creation is available online only.', {}, { timeout: 5000 })).toBeTruthy();
    expect((await screen.findByRole('button', { name: 'Create Service' }, { timeout: 5000 })).hasAttribute('disabled')).toBe(true);
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

    expect((await screen.findAllByTitle('Edit Wash and Fold')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Service catalog entry').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Stock Exempt').length).toBeGreaterThan(0);
    expect(screen.queryByText('Out of Stock')).toBeNull();
    expect(screen.getAllByText('Not tracked').length).toBeGreaterThan(0);
  });
});
