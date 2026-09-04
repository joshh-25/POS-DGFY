/** @vitest-environment jsdom */

// #1318 Wave C/C5 — POS's own "Additional Categories" secondary-membership
// editor in the item edit modal (packages/web-core/src/features/pos/components/
// TerminalOperationsWorkspace.jsx), mirroring ItemFormModal.jsx's Phase 268
// section (PR #1515) but adapted to this file's activeEditItem-based state.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';
import { getFolders, listItemFolders, replaceItemFolders } from '@/services/itemService.js';

vi.mock('../services/posService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchPosCatalog: vi.fn().mockResolvedValue([{
      item_id: 24,
      name: 'Aloo Paratha',
      category: 'product',
      current_stock: 0,
      default_sale_price: 90,
      cost_per_unit: 67,
      pos_category: 'main-course',
      folder_id: 10,
      folder: { name: 'Main Course' }
    }])
  };
});

vi.mock('@/services/itemService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getFolders: vi.fn().mockResolvedValue([
      { folder_id: 10, name: 'Main Course', is_active: true, show_in_pos_filter: true },
      { folder_id: 20, name: 'Beverages', is_active: true, show_in_pos_filter: true },
      { folder_id: 30, name: 'Desserts', is_active: true, show_in_pos_filter: true }
    ]),
    listItemFolders: vi.fn().mockResolvedValue({ memberships: [] }),
    replaceItemFolders: vi.fn().mockResolvedValue({ memberships: [] })
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
  canEditItems: true,
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

describe('POS edit-item modal: Additional Categories (#1318)', () => {
  it('renders the section, excludes the primary category, and lets an authorized manager save a selection', async () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    fireEvent.click(await screen.findByTitle('Edit Aloo Paratha'));

    await waitFor(() => expect(listItemFolders).toHaveBeenCalledWith(24));

    const heading = await screen.findByText('Additional Categories');
    const section = heading.closest('div');

    // The item's own primary category (Main Course, folder_id 10) must not
    // be offered as a secondary option -- selecting it would be redundant
    // and the API silently drops it anyway (ADR 0080 clause 2).
    expect(within(section).queryByText('Main Course')).toBeNull();
    const beveragesCheckbox = within(section).getByLabelText('Beverages');
    const dessertsCheckbox = within(section).getByLabelText('Desserts');
    expect(beveragesCheckbox.closest('fieldset').hasAttribute('disabled')).toBe(false);

    fireEvent.click(beveragesCheckbox);
    expect(beveragesCheckbox.checked).toBe(true);
    expect(dessertsCheckbox.checked).toBe(false);

    fireEvent.click(within(section).getByRole('button', { name: 'Save Additional Categories' }));

    await waitFor(() => expect(replaceItemFolders).toHaveBeenCalledWith(24, [20]));
  });

  it('shows the section read-only, not hidden, when the operator cannot manage categories -- matching the primary category field\'s own convention', async () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: false })} />);
    fireEvent.click(await screen.findByTitle('Edit Aloo Paratha'));

    await waitFor(() => expect(listItemFolders).toHaveBeenCalledWith(24));

    const heading = await screen.findByText('Additional Categories');
    const section = heading.closest('div');

    const beveragesCheckbox = within(section).getByLabelText('Beverages');
    // jsdom does not implement HTML's fieldset-disabled-cascades-to-descendants
    // behavior, so assert on the <fieldset disabled> itself (the actual gate
    // in source: disabled={!canManageCategories || secondaryFoldersSaving})
    // rather than the checkbox's .disabled property.
    expect(beveragesCheckbox.closest('fieldset').hasAttribute('disabled')).toBe(true);
    expect(within(section).queryByRole('button', { name: 'Save Additional Categories' })).toBeNull();
    expect(within(section).getByText('You can review additional categories, but your role cannot change them.')).toBeTruthy();
  });
});

describe('POS edit-item modal: Additional Categories gate (#1318, source contract)', () => {
  // This modal only ever opens for an item already found in sortedItems
  // (activeEditItem), so a "new/unsaved item" state is not reachable through
  // it today -- unlike IMS's ItemFormModal, which is shared between create
  // and edit. The section still guards on a real persisted item id, matching
  // ItemFormModal's own Boolean(itemIdForFolders) defensive gate, so it can
  // never render (or claim to load/save memberships) for an item that has no
  // server-assigned id.
  it('gates the section on a real persisted item id, not just an open modal', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const workspace = fs.readFileSync(
      path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'),
      'utf8'
    );

    expect(workspace).toContain(
      "const editItemIdForFolders = Number(activeEditItem?.item_id) > 0 ? Number(activeEditItem.item_id) : 0;"
    );
    expect(workspace).toContain('{editItemIdForFolders > 0 && (');
    expect(workspace).toContain('const fetchSecondaryFolders = useCallback(async (itemId) => {\n    if (!itemId) return;');
    expect(workspace).toContain('const saveSecondaryFolders = async () => {\n    if (!editItemIdForFolders) return;');
  });
});
