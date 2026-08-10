/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosFnbModifiersWorkspace from '../components/PosFnbModifiersWorkspace.jsx';
import {
  createFnbModifierGroup,
  listFnbItemModifierGroups,
  listFnbModifierGroups,
  replaceFnbItemModifierGroups
} from '@/src/features/fnb/api/fnbApi.js';
import { fetchPosCatalog } from '../services/posService.js';

vi.mock('@/src/features/fnb/api/fnbApi.js', () => ({
  createFnbModifierGroup: vi.fn(),
  listFnbItemModifierGroups: vi.fn(),
  listFnbModifierGroups: vi.fn(),
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
  listFnbItemModifierGroups.mockResolvedValue({ item_modifier_groups: [] });
  fetchPosCatalog.mockResolvedValue([{ item_id: 5, name: 'Burger', is_active: true }]);
  createFnbModifierGroup.mockResolvedValue({});
  replaceFnbItemModifierGroups.mockResolvedValue({});
};

describe('standalone POS F&B modifier management', () => {
  it('creates a modifier group from the POS workspace', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} />);

    await screen.findByRole('heading', { name: 'F&B menu modifiers' });
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Sauces' } });
    fireEvent.change(screen.getByLabelText('Option 1 name'), { target: { value: 'Garlic mayo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => expect(createFnbModifierGroup).toHaveBeenCalledTimes(1));
    expect(createFnbModifierGroup.mock.calls[0][0].name).toBe('Sauces');
    expect(createFnbModifierGroup.mock.calls[0][0].parent_modifier_option_id).toBeNull();
  });

  it('assigns a modifier group to a specific POS menu item', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage isOnline locations={[]} />);

    await screen.findByRole('heading', { name: 'Assign add-ons to an item' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Burger extras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save item add-ons' }));

    await waitFor(() => expect(replaceFnbItemModifierGroups).toHaveBeenCalledWith(5, {
      modifier_groups: [{ modifier_group_id: 10, sort_order: 0 }]
    }));
  });

  it('shows assignments without mutation controls to view-only operators', async () => {
    arrange();
    render(<PosFnbModifiersWorkspace canManage={false} isOnline locations={[]} />);

    await screen.findAllByRole('status');
    expect(screen.getByText('Read-only menu modifiers')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save item add-ons' })).toBeNull();
  });
});
