/** @vitest-environment jsdom */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosFnbModifiersWorkspace from '../components/PosFnbModifiersWorkspace.jsx';
import {
  createFnbModifierGroup,
  listFnbFolderModifierGroups,
  listFnbItemModifierGroups,
  listFnbModifierGroups,
  replaceFnbFolderModifierGroups,
  replaceFnbItemModifierGroups
} from '@/src/features/fnb/api/fnbApi.js';
import { fetchPosCatalogPage } from '../services/posService.js';
import { getFolders } from '@/services/itemService.js';

vi.mock('@/services/itemService.js', () => ({
  getFolders: vi.fn().mockResolvedValue([{ folder_id: 20, name: 'Breakfast' }])
}));

vi.mock('@/src/features/fnb/api/fnbApi.js', () => ({
  createFnbModifierGroup: vi.fn(),
  listFnbFolderModifierGroups: vi.fn(),
  listFnbItemModifierGroups: vi.fn(),
  listFnbModifierGroups: vi.fn(),
  replaceFnbFolderModifierGroups: vi.fn(),
  replaceFnbItemModifierGroups: vi.fn(),
  updateFnbModifierGroup: vi.fn()
}));

vi.mock('../services/posService.js', () => ({ fetchPosCatalogPage: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const groups = [{
  modifier_group_id: 10,
  name: 'Extras',
  display_name: 'Burger extras',
  min_select: 0,
  max_select: 2,
  is_active: true,
  options: [{ modifier_option_id: 101, name: 'Cheese', price_delta: 20, is_active: true }]
}];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete document.visibilityState;
});

const arrange = () => {
  listFnbModifierGroups.mockResolvedValue({ modifier_groups: groups });
  listFnbFolderModifierGroups.mockResolvedValue({ folder_modifier_groups: [] });
  listFnbItemModifierGroups.mockResolvedValue({ item_modifier_groups: [] });
  fetchPosCatalogPage.mockResolvedValue({
    items: [{ item_id: 5, name: 'Burger', is_active: true, folder_id: 20, folder: { folder_id: 20, name: 'Breakfast' } }],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
  createFnbModifierGroup.mockResolvedValue({});
  replaceFnbItemModifierGroups.mockResolvedValue({});
};

const captureBackgroundRefresh = () => {
  let refreshCallback;
  vi.spyOn(window, 'setInterval').mockImplementation((callback, interval) => {
    if (interval === 60_000) refreshCallback = callback;
    return 1;
  });
  vi.spyOn(window, 'clearInterval').mockImplementation(() => {});
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  return () => refreshCallback;
};

describe('standalone POS F&B modifier management', () => {
  it('removes the redundant workspace title and manual refresh control', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });

    expect(screen.queryByRole('heading', { name: 'Item Options & Modifiers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('hides helper copy below desktop and keeps group creation accessible in a compact toolbar', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });

    const optionGroupsDescription = screen.getByText('Create reusable menu choices, then assign groups to categories or items.');
    expect(optionGroupsDescription.className).toContain('hidden');
    expect(optionGroupsDescription.className).toContain('min-[1200px]:block');

    const toolbar = screen.getByRole('button', { name: 'Create option group' }).parentElement;
    expect(toolbar.className).toContain('grid-cols-[minmax(0,1fr)_auto_auto]');
    expect(toolbar.className).toContain('min-[1200px]:flex');

    const filterButton = screen.getByRole('button', { name: 'Filters' });
    expect(filterButton.getAttribute('aria-label')).toBe('Filters');

    const createButton = screen.getByRole('button', { name: 'Create option group' });
    expect(createButton.className).toContain('w-11');
    expect(createButton.className).toContain('min-[1200px]:w-auto');
    expect(createButton.querySelector('svg')?.classList.contains('lucide-list-plus')).toBe(true);
    expect(createButton.querySelector('span')?.className).toContain('sr-only');

    fireEvent.click(screen.getByRole('tab', { name: 'Category Assignments' }));
    await screen.findByRole('heading', { name: 'Category assignments' });
    const categoryDescription = screen.getByText('Groups assigned here are inherited by items in the category.');
    expect(categoryDescription.className).toContain('hidden');
    expect(categoryDescription.className).toContain('min-[1200px]:block');

    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByRole('heading', { name: 'Item assignments' });
    const itemDescription = screen.getByText('Review direct and inherited groups for each item.');
    expect(itemDescription.className).toContain('hidden');
    expect(itemDescription.className).toContain('min-[1200px]:block');
  });

  it('uses the shared POS button treatment for option-management subtabs', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });

    const tablist = screen.getByRole('tablist', { name: 'Option group management' });
    const selectedTab = screen.getByRole('tab', { name: 'Option Groups' });
    const unselectedTab = screen.getByRole('tab', { name: 'Category Assignments' });

    expect(tablist.firstElementChild.className).toContain('min-[1200px]:grid-cols-3');
    expect(tablist.className).toContain('sm:!mt-0');
    expect(selectedTab.className).toContain('rounded-lg');
    expect(selectedTab.className).toContain('bg-[#1A4E8D]');
    expect(selectedTab.getAttribute('aria-selected')).toBe('true');
    expect(selectedTab.querySelector('svg')?.classList.contains('lucide-list-checks')).toBe(true);
    expect(unselectedTab.className).toContain('bg-[#F5F9FF]');
    expect(unselectedTab.getAttribute('aria-selected')).toBe('false');
  });

  it('keeps the assignments heading outside the table surface and uses shared POS pagination', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Category Assignments' }));
    await screen.findByRole('heading', { name: 'Category assignments' });

    const tableSurface = screen.getByTestId('pos-fnb-assignment-table-surface');
    const pagination = screen.getByTestId('pos-fnb-category-assignment-pagination');
    expect(tableSurface.className).toContain('rounded-xl border');
    expect(tableSurface.contains(screen.getByRole('heading', { name: 'Category assignments' }))).toBe(false);
    expect(pagination.className).toContain('dgfy-global-pagination');
    expect(screen.getByRole('button', { name: 'Categories per page' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Go to category page' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Categories per page' }));
    fireEvent.click(screen.getByRole('option', { name: '20 / page' }));
    expect(screen.getByRole('button', { name: 'Categories per page' }).textContent).toContain('20');

    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByRole('heading', { name: 'Item assignments' });
    fireEvent.click(screen.getByRole('button', { name: 'Items per page' }));
    fireEvent.click(screen.getByRole('option', { name: '10 / page' }));
    await waitFor(() => expect(fetchPosCatalogPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 10 })));
    expect(screen.getByTestId('pos-fnb-item-assignment-pagination').className).toContain('dgfy-global-pagination');
  });

  it('uses the Option Groups search UI and clear behavior for category and item assignments', async () => {
    arrange();
    fetchPosCatalogPage.mockImplementation(({ search }) => Promise.resolve({
      items: search ? [] : [{ item_id: 5, name: 'Burger', is_active: true, folder_id: 20 }],
      pagination: { page: 1, page_size: 20, total: search ? 0 : 1, total_pages: 1 }
    }));
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    const optionGroupsSearch = screen.getByRole('searchbox', { name: 'Search option groups' });
    const sharedSearchClassName = optionGroupsSearch.className;

    fireEvent.click(screen.getByRole('tab', { name: 'Category Assignments' }));
    await screen.findByRole('heading', { name: 'Category assignments' });
    const categorySearch = screen.getByRole('searchbox', { name: 'Search categories' });
    expect(categorySearch.className).toBe(sharedSearchClassName);
    fireEvent.change(categorySearch, { target: { value: 'no matching category' } });
    await screen.findByText('No categories found');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await screen.findByText('Breakfast');

    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByRole('heading', { name: 'Item assignments' });
    const itemSearch = screen.getByRole('searchbox', { name: 'Search items' });
    expect(itemSearch.className).toBe(sharedSearchClassName);
    fireEvent.change(itemSearch, { target: { value: 'no matching item' } });
    await screen.findByText('No items found');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await screen.findByText('Burger');
  });

  it('keeps subtabs fixed while the active option-management panel fills and scrolls its content area', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });

    const tablist = screen.getByRole('tablist', { name: 'Option group management' });
    const content = document.querySelector('.pos-items-options-content');
    const manager = document.querySelector('.pos-items-options-manager');
    const managerContent = document.querySelector('.pos-items-options-manager-content');
    const groupList = screen.getByTestId('pos-fnb-option-groups-list');

    expect(tablist.nextElementSibling).toBe(content);
    expect(content.className).toContain('min-h-0');
    expect(content.className).toContain('flex-1');
    expect(content.className).toContain('overflow-hidden');
    expect(manager.className).toContain('flex-1');
    expect(managerContent.className).toContain('min-h-0');
    expect(managerContent.className).toContain('flex-1');
    expect(groupList.className).toContain('overflow-auto');
  });

  it('refreshes silently while visible and leaves the workspace mounted', async () => {
    arrange();
    const getRefreshCallback = captureBackgroundRefresh();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    expect(getRefreshCallback()).toBeTypeOf('function');
    expect(listFnbModifierGroups).toHaveBeenCalledTimes(1);

    await act(async () => {
      getRefreshCallback()();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(listFnbModifierGroups).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Loading item options…')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Option groups' })).toBeTruthy();
  });

  it('pauses background refresh while the option group editor is open', async () => {
    arrange();
    const getRefreshCallback = captureBackgroundRefresh();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    await screen.findByRole('heading', { name: 'Create Option Group' });

    await act(async () => {
      getRefreshCallback()();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(listFnbModifierGroups).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Create Option Group' })).toBeTruthy();
  });

  it('creates a modifier group from the POS workspace', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Sauces' } });
    fireEvent.change(screen.getByLabelText('Choice 1 name'), { target: { value: 'Garlic mayo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Group' }));

    await waitFor(() => expect(createFnbModifierGroup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listFnbModifierGroups).toHaveBeenCalledTimes(2));
    expect(createFnbModifierGroup.mock.calls[0][0].name).toBe('Sauces');
    expect(createFnbModifierGroup.mock.calls[0][0].parent_modifier_option_id).toBeNull();
    expect(screen.queryByText('Loading item options…')).toBeNull();
  });

  it('assigns a modifier group to a specific POS menu item', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByText('Burger');
    fireEvent.click(screen.getByRole('button', { name: 'Assign groups' }));
    await screen.findByRole('heading', { name: 'Assign groups to Burger' });
    const assignmentBody = screen.getByTestId('pos-fnb-option-item-editor-scroll');
    expect(assignmentBody.contains(screen.getByRole('heading', { name: 'What appears at checkout' }))).toBe(true);
    expect(screen.queryByRole('combobox', { name: 'Select Item' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Select Category' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Burger extras' }));
    expect(assignmentBody.contains(screen.getByText('Customize Order'))).toBe(true);
    const previewOption = screen.getByRole('checkbox', { name: /Cheese/ });
    fireEvent.click(previewOption);
    expect(previewOption.checked).toBe(true);
    const quantity = screen.getByRole('spinbutton', { name: 'Cheese quantity' });
    const optionLabel = screen.getByText('Cheese');
    expect(screen.getByText('Customize Order').style.fontSize).toBe('13px');
    expect(optionLabel.style.fontSize).toBe('13px');
    expect(quantity.parentElement).toBe(optionLabel.parentElement);
    expect(quantity.parentElement.style.display).toBe('flex');
    expect(quantity.parentElement.style.flexWrap).toBe('nowrap');
    expect(quantity.className).toContain('pos-fnb-modifier-quantity');
    expect(replaceFnbItemModifierGroups).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    await waitFor(() => expect(replaceFnbItemModifierGroups).toHaveBeenCalledWith(5, {
      modifier_groups: [{ modifier_group_id: 10, sort_order: 0, is_excluded: false }]
    }));
  });

  it('shows the item thumbnail before its name in item assignments', async () => {
    arrange();
    fetchPosCatalogPage.mockResolvedValue({
      items: [{ item_id: 5, name: 'Burger', is_active: true, folder_id: 20, pos_image_url: '/uploads/burger.webp' }],
      pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
    });
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByText('Burger');

    const thumbnail = screen.getByTestId('pos-fnb-item-thumbnail');
    expect(thumbnail.querySelector('img')).not.toBeNull();
    expect(thumbnail.nextElementSibling.querySelector('p').textContent).toBe('Burger');
  });

  it('lets category assignment forms hide and reopen without losing edits, and confirms before discarding', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Category Assignments' }));
    await screen.findByText('Breakfast');
    fireEvent.click(screen.getByRole('button', { name: 'Assign groups' }));
    await screen.findByRole('heading', { name: 'Assign groups to Breakfast' });
    expect(screen.queryByRole('combobox', { name: 'Select Category' })).toBeNull();
    const groupCheckbox = screen.getByRole('checkbox', { name: 'Burger extras' });
    fireEvent.click(groupCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Hide form' }));

    expect(screen.queryByRole('heading', { name: 'Assign groups to Breakfast' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show form' }));
    expect(screen.getByRole('checkbox', { name: 'Burger extras' }).checked).toBe(true);

    const confirmDiscard = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close assignment form' }));
    expect(confirmDiscard).toHaveBeenCalledWith('Discard unsaved assignment changes?');
    expect(screen.getByRole('heading', { name: 'Assign groups to Breakfast' })).toBeTruthy();

    confirmDiscard.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close assignment form' }));
    expect(screen.queryByRole('heading', { name: 'Assign groups to Breakfast' })).toBeNull();
  });

  it('assigns a modifier group to a POS folder for inheritance', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Category Assignments' }));
    await screen.findByText('Breakfast');
    fireEvent.click(screen.getByRole('button', { name: 'Assign groups' }));
    await screen.findByRole('heading', { name: 'Assign groups to Breakfast' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Burger extras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    await waitFor(() => expect(replaceFnbFolderModifierGroups).toHaveBeenCalledWith(20, {
      modifier_groups: [{ modifier_group_id: 10, sort_order: 0 }]
    }));
  });

  it('bulk assigns a group to selected categories while preserving each category’s other groups', async () => {
    arrange();
    const secondGroup = { modifier_group_id: 11, name: 'Sauces', display_name: 'Sauces', is_active: true, options: [] };
    listFnbModifierGroups.mockResolvedValue({ modifier_groups: [...groups, secondGroup] });
    listFnbFolderModifierGroups.mockResolvedValue({ folder_modifier_groups: [
      { folder_id: 20, modifier_group_id: 10, sort_order: 0 },
      { folder_id: 21, modifier_group_id: 11, sort_order: 0, is_required_override: true }
    ] });
    getFolders.mockResolvedValue([
      { folder_id: 20, name: 'Breakfast' },
      { folder_id: 21, name: 'Lunch' }
    ]);
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Category Assignments' }));
    await screen.findByText('Breakfast');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select category Breakfast' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select category Lunch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign groups to 2 categories' }));

    await screen.findByRole('heading', { name: 'Assign groups to 2 categories' });
    const extrasCheckbox = screen.getByRole('checkbox', { name: 'Burger extras' });
    expect(extrasCheckbox.getAttribute('aria-checked')).toBe('mixed');
    fireEvent.click(extrasCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    await waitFor(() => expect(replaceFnbFolderModifierGroups).toHaveBeenCalledTimes(1));
    expect(replaceFnbFolderModifierGroups).toHaveBeenCalledWith(21, {
      modifier_groups: [
        { modifier_group_id: 11, sort_order: 0, is_required_override: true },
        { modifier_group_id: 10, sort_order: 1 }
      ]
    });
    expect(screen.queryByRole('heading', { name: 'Assign groups to 2 categories' })).toBeNull();
  });

  it('bulk enables a group for selected items without losing direct assignments or category inheritance', async () => {
    arrange();
    const secondGroup = { modifier_group_id: 11, name: 'Sauces', display_name: 'Sauces', is_active: true, options: [] };
    listFnbModifierGroups.mockResolvedValue({ modifier_groups: [...groups, secondGroup] });
    listFnbFolderModifierGroups.mockResolvedValue({ folder_modifier_groups: [
      { folder_id: 20, modifier_group_id: 10, sort_order: 0 }
    ] });
    listFnbItemModifierGroups.mockResolvedValue({ item_modifier_groups: [
      { item_id: 5, modifier_group_id: 11, sort_order: 0, is_excluded: false },
      { item_id: 6, modifier_group_id: 10, sort_order: 0, is_excluded: true }
    ] });
    fetchPosCatalogPage.mockResolvedValue({
      items: [
        { item_id: 5, name: 'Burger', is_active: true, folder_id: 21 },
        { item_id: 6, name: 'Fries', is_active: true, folder_id: 20 }
      ],
      pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 }
    });
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByText('Burger');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select item Burger' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select item Fries' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign groups to 2 items' }));

    await screen.findByRole('heading', { name: 'Assign groups to 2 items' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Burger extras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    await waitFor(() => expect(replaceFnbItemModifierGroups).toHaveBeenCalledTimes(2));
    expect(replaceFnbItemModifierGroups).toHaveBeenCalledWith(5, {
      modifier_groups: [
        { modifier_group_id: 11, is_excluded: false, sort_order: 0 },
        { modifier_group_id: 10, is_excluded: false, sort_order: 1 }
      ]
    });
    expect(replaceFnbItemModifierGroups).toHaveBeenCalledWith(6, { modifier_groups: [] });
  });

  it('keeps the assignment table visually stable during bulk selection and highlights only the active assignment target', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByText('Burger');

    const table = screen.getByRole('table');
    const itemRow = screen.getByRole('row', { name: /Burger/ });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select item Burger' }));

    expect(screen.getByRole('table')).toBe(table);
    expect(screen.getByRole('checkbox', { name: 'Select item Burger' }).checked).toBe(true);
    expect(itemRow.className).not.toContain('bg-blue-50/70');
    expect(screen.getByRole('button', { name: 'Clear selection' }).className).toContain('bg-[#fff1f2]/70');

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Assign groups', exact: true }));
    await screen.findByRole('heading', { name: 'Assign groups to Burger' });
    expect(itemRow.className).toContain('bg-blue-50/70');
  });

  it('supports multi-item selection and bulk assignment in the mobile card layout', async () => {
    arrange();
    fetchPosCatalogPage.mockResolvedValue({
      items: [
        { item_id: 5, name: 'Burger', is_active: true, folder_id: 20 },
        { item_id: 6, name: 'Fries', is_active: true, folder_id: 20 }
      ],
      pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 }
    });
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query) => ({
        matches: query === '(max-width: 767px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });

    try {
      render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

      await screen.findByRole('heading', { name: 'Option groups' });
      fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
      await screen.findByText('Burger');
      expect(screen.queryByRole('checkbox', { name: 'Select all items on this page' })).toBeNull();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select item Burger' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select item Fries' }));
      fireEvent.click(screen.getByRole('button', { name: 'Assign groups to 2 items' }));

      expect(await screen.findByRole('heading', { name: 'Assign groups to 2 items' })).toBeTruthy();
    } finally {
      if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, value: previousMatchMedia });
      else delete window.matchMedia;
    }
  });

  it('keeps failed bulk targets selected and retries only those targets', async () => {
    arrange();
    getFolders.mockResolvedValue([
      { folder_id: 20, name: 'Breakfast' },
      { folder_id: 21, name: 'Lunch' }
    ]);
    replaceFnbFolderModifierGroups
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({});
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option groups' });
    fireEvent.click(screen.getByRole('tab', { name: 'Category Assignments' }));
    await screen.findByText('Breakfast');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select category Breakfast' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select category Lunch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign groups to 2 categories' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Burger extras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    expect(await screen.findByText(/1 of 2 categories are saved/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Assign groups to 1 category' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    await waitFor(() => expect(replaceFnbFolderModifierGroups).toHaveBeenCalledTimes(3));
    expect(replaceFnbFolderModifierGroups.mock.calls.map(([folderId]) => folderId)).toEqual([20, 21, 21]);
    expect(screen.queryByRole('heading', { name: 'Assign groups to 1 category' })).toBeNull();
  });

  it('shows assignments without mutation controls to view-only operators', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage={false} isOnline locations={[]} operatingLocationId={1} />);

    expect(await screen.findByRole('heading', { name: 'Option groups' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create option group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save assignments' })).toBeNull();
  });

  it('does not load catalog data for a location that is not in the available location list', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace
      isOnline
      locations={[{ location_id: 1, name: 'Main Branch' }]}
      operatingLocationId={9}
    />);

    expect(await screen.findByText('Select an authorized location to load item options.')).toBeTruthy();
    expect(fetchPosCatalogPage).not.toHaveBeenCalled();
    expect(listFnbModifierGroups).not.toHaveBeenCalled();
  });

  it('ignores a catalog response from the previous location after a location switch', async () => {
    arrange();
    let resolveFirstLocationCatalog;
    const firstLocationCatalog = new Promise((resolve) => {
      resolveFirstLocationCatalog = resolve;
    });
    fetchPosCatalogPage.mockImplementation(({ location_id }) => (
      location_id === 1
        ? firstLocationCatalog
        : Promise.resolve({ items: [{ item_id: 22, name: 'Second location item', is_active: true, folder_id: 200 }], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } })
    ));

    const locations = [
      { location_id: 1, name: 'Main Branch' },
      { location_id: 2, name: 'Second Branch' }
    ];
    const view = render(<PosFnbModifiersWorkspace
      canManage
      isOnline
      locations={locations}
      operatingLocationId={1}
    />);

    await waitFor(() => expect(fetchPosCatalogPage).toHaveBeenCalledWith({ search: '', page: 1, page_size: 20, category_filter: 'all', stock_filter: 'all', location_id: 1 }));
    view.rerender(<PosFnbModifiersWorkspace
      canManage
      isOnline
      locations={locations}
      operatingLocationId={2}
    />);

    fireEvent.click(screen.getByRole('tab', { name: 'Item Assignments' }));
    await screen.findByText('Second location item');
    fireEvent.click(screen.getByRole('button', { name: 'Assign groups' }));
    const itemHeading = await screen.findByRole('heading', { name: 'Assign groups to Second location item' });
    resolveFirstLocationCatalog({ items: [{ item_id: 11, name: 'First location item', is_active: true, folder_id: 100 }], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });

    await waitFor(() => expect(itemHeading.textContent).toContain('Second location item'));
    expect(screen.queryByRole('combobox', { name: 'Select Item' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Assign groups to First location item' })).toBeNull();
  });
});
