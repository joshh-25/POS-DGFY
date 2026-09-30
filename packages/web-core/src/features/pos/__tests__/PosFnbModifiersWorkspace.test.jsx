/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { fetchPosCatalog } from '../services/posService.js';

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

vi.mock('../services/posService.js', () => ({ fetchPosCatalog: vi.fn() }));

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
});

const arrange = () => {
  listFnbModifierGroups.mockResolvedValue({ modifier_groups: groups });
  listFnbFolderModifierGroups.mockResolvedValue({ folder_modifier_groups: [] });
  listFnbItemModifierGroups.mockResolvedValue({ item_modifier_groups: [] });
  fetchPosCatalog.mockResolvedValue([{ item_id: 5, name: 'Burger', is_active: true, folder_id: 20, folder: { folder_id: 20, name: 'Breakfast' } }]);
  createFnbModifierGroup.mockResolvedValue({});
  replaceFnbItemModifierGroups.mockResolvedValue({});
};

describe('standalone POS F&B modifier management', () => {
  it('creates a modifier group from the POS workspace', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Option Groups' });
    fireEvent.click(screen.getByRole('button', { name: 'Add an Option Group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Sauces' } });
    fireEvent.change(screen.getByLabelText('Option 1 name'), { target: { value: 'Garlic mayo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(createFnbModifierGroup).toHaveBeenCalledTimes(1));
    expect(createFnbModifierGroup.mock.calls[0][0].name).toBe('Sauces');
    expect(createFnbModifierGroup.mock.calls[0][0].parent_modifier_option_id).toBeNull();
  });

  it('assigns a modifier group to a specific POS menu item', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Assign Options to an Item' });
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Burger extras' })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply Filters' })[1]);

    await waitFor(() => expect(replaceFnbItemModifierGroups).toHaveBeenCalledWith(5, {
      modifier_groups: [{ modifier_group_id: 10, sort_order: 0, is_excluded: false }]
    }));
  });

  it('assigns a modifier group to a POS folder for inheritance', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} operatingLocationId={1} />);

    await screen.findByRole('heading', { name: 'Assign Option Groups to a Category' });
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Burger extras' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply Filters' })[0]);

    await waitFor(() => expect(replaceFnbFolderModifierGroups).toHaveBeenCalledWith(20, {
      modifier_groups: [{ modifier_group_id: 10, sort_order: 0 }]
    }));
  });

  it('shows assignments without mutation controls to view-only operators', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage={false} isOnline locations={[]} operatingLocationId={1} />);

    expect(await screen.findByText('Option Groups')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add an Option Group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply Filters' })).toBeNull();
  });

  it('does not load catalog data for a location that is not in the available location list', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace
      isOnline
      locations={[{ location_id: 1, name: 'Main Branch' }]}
      operatingLocationId={9}
    />);

    expect(await screen.findByText('Select an authorized location to load item options.')).toBeTruthy();
    expect(fetchPosCatalog).not.toHaveBeenCalled();
    expect(listFnbModifierGroups).not.toHaveBeenCalled();
  });

  it('ignores a catalog response from the previous location after a location switch', async () => {
    arrange();
    let resolveFirstLocationCatalog;
    const firstLocationCatalog = new Promise((resolve) => {
      resolveFirstLocationCatalog = resolve;
    });
    fetchPosCatalog.mockImplementation(({ location_id }) => (
      location_id === 1
        ? firstLocationCatalog
        : Promise.resolve([{ item_id: 22, name: 'Second location item', is_active: true, folder_id: 200 }])
    ));

    const locations = [
      { location_id: 1, name: 'Main Branch' },
      { location_id: 2, name: 'Second Branch' }
    ];
    const view = render(<PosFnbModifiersWorkspace
      isOnline
      locations={locations}
      operatingLocationId={1}
    />);

    await waitFor(() => expect(fetchPosCatalog).toHaveBeenCalledWith({ limit: 500, location_id: 1 }));
    view.rerender(<PosFnbModifiersWorkspace
      isOnline
      locations={locations}
      operatingLocationId={2}
    />);

    const itemSelector = await screen.findByRole('combobox', { name: 'Select Item' });
    await waitFor(() => expect(itemSelector.textContent).toContain('Second location item'));
    resolveFirstLocationCatalog([{ item_id: 11, name: 'First location item', is_active: true, folder_id: 100 }]);

    await waitFor(() => expect(itemSelector.textContent).toContain('Second location item'));
    expect(itemSelector.textContent).not.toContain('First location item');
  });
});
