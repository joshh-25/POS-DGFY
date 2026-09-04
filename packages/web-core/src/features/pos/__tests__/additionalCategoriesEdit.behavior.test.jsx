/** @vitest-environment jsdom */

// #1318 Wave C/C5 — POS's own "Additional Categories" secondary-membership
// editor in the item edit modal (packages/web-core/src/features/pos/components/
// TerminalOperationsWorkspace.jsx), mirroring ItemFormModal.jsx's Phase 268
// section (PR #1515) but adapted to this file's activeEditItem-based state.
//
// PR #1581 review (Codex, fix round 1) added the RF-1/RF-2/RF-3 describe
// blocks below:
//   RF-1 (blocker) — a staged-but-unsaved primary category change must be
//     excluded from the Additional Categories list too, not just the
//     persisted primary, and a stale checked selection must be dropped if
//     the primary changes out from under it before it's saved.
//   RF-2 (should-fix) — the max-10 boundary and loading/preserving/removing
//     pre-existing memberships had no runtime coverage.
//   RF-3 (should-fix) — a 403 from the memberships GET (permission failure)
//     must render an honest "unavailable" status, never the same "0/10
//     selected" a genuinely empty membership list would show.

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

// Opens the edit modal for the fixture item and returns the Additional
// Categories section's own container, after confirming the memberships GET
// resolved (success or failure -- callers assert on the outcome themselves).
const openEditAndGetSection = async () => {
  fireEvent.click(await screen.findByTitle('Edit Aloo Paratha'));
  await waitFor(() => expect(listItemFolders).toHaveBeenCalledWith(24));
  const heading = await screen.findByText('Additional Categories');
  return heading.closest('div');
};

// Stages a primary-category selection via the edit modal's own
// EditableFoodCategoryCombobox, WITHOUT saving the item -- exactly the
// "not yet saved" state RF-1 is about. Scoped to the combobox's own listbox
// (`within`, not the global `screen`) because the page's top-level Category
// filter is a native <select> whose <option> children share the same
// implicit ARIA role="option" and the same category names, which makes an
// unscoped role query ambiguous.
const stagePrimaryCategorySelection = (name) => {
  const combobox = document.getElementById('pos-items-edit-category');
  fireEvent.focus(combobox);
  const listbox = document.getElementById('pos-items-edit-category-listbox');
  fireEvent.click(within(listbox).getByRole('option', { name }));
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('POS edit-item modal: Additional Categories (#1318)', () => {
  it('renders the section, excludes the primary category, and lets an authorized manager save a selection', async () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

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
    const section = await openEditAndGetSection();

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

describe('POS edit-item modal: Additional Categories — RF-1 pending primary category (#1318, PR #1581 review)', () => {
  it('excludes a staged-but-unsaved primary category change, and drops it from an already-checked selection', async () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

    // Check Beverages (folder 20) as a secondary category while the
    // persisted primary is still Main Course (folder 10) -- allowed today.
    const beveragesCheckboxBefore = within(section).getByLabelText('Beverages');
    fireEvent.click(beveragesCheckboxBefore);
    expect(beveragesCheckboxBefore.checked).toBe(true);

    // Now stage (but do not yet save via "Save Item") a primary category
    // change to Beverages -- the exact reproduction from the review: without
    // the fix, folder 20 stays selectable/selected as a secondary category
    // even though it is about to become the primary.
    stagePrimaryCategorySelection('Beverages');

    // Beverages must disappear from the Additional Categories list entirely,
    // and the prior checked selection for it must be dropped, not carried
    // forward as a stale, now-invalid checked id.
    await waitFor(() => expect(within(section).queryByLabelText('Beverages')).toBeNull());

    fireEvent.click(within(section).getByRole('button', { name: 'Save Additional Categories' }));

    // The resulting secondary payload can never contain 20, the pending
    // (not-yet-saved) primary -- this is the disjointness invariant ADR 0080
    // Decision 2 requires, which the two independent writes (Save Additional
    // Categories vs Save Item) cannot otherwise guarantee on their own.
    await waitFor(() => expect(replaceItemFolders).toHaveBeenCalled());
    const [, sentFolderIds] = replaceItemFolders.mock.calls.at(-1);
    expect(sentFolderIds).not.toContain(20);
  });

  it('never offers the currently-staged primary as a secondary option even before anything is checked', async () => {
    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

    expect(within(section).getByLabelText('Beverages')).toBeTruthy();

    stagePrimaryCategorySelection('Beverages');

    await waitFor(() => expect(within(section).queryByLabelText('Beverages')).toBeNull());
    // Desserts (30) is unaffected -- only the staged primary is excluded.
    expect(within(section).getByLabelText('Desserts')).toBeTruthy();
  });
});

describe('POS edit-item modal: Additional Categories — RF-2 boundary + pre-existing memberships (#1318, PR #1581 review)', () => {
  it('disables the 11th unchecked option once 10 are already selected, and it cannot be sent', async () => {
    const nonPrimaryFolders = Array.from({ length: 11 }, (_, index) => ({
      folder_id: 100 + index,
      name: `Folder ${index + 1}`,
      is_active: true,
      show_in_pos_filter: true
    }));
    getFolders.mockResolvedValue([
      { folder_id: 10, name: 'Main Course', is_active: true, show_in_pos_filter: true },
      ...nonPrimaryFolders
    ]);
    const preSelected = nonPrimaryFolders.slice(0, 10);
    listItemFolders.mockResolvedValue({
      memberships: preSelected.map((folder) => ({ folder_id: folder.folder_id }))
    });

    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

    await waitFor(() => expect(within(section).getByText('10/10 selected')).toBeTruthy());

    const eleventhFolder = nonPrimaryFolders[10];
    const eleventhCheckbox = within(section).getByLabelText(eleventhFolder.name);
    expect(eleventhCheckbox.checked).toBe(false);
    expect(eleventhCheckbox.disabled).toBe(true);

    fireEvent.click(eleventhCheckbox);
    expect(eleventhCheckbox.checked).toBe(false);

    fireEvent.click(within(section).getByRole('button', { name: 'Save Additional Categories' }));

    await waitFor(() => expect(replaceItemFolders).toHaveBeenCalled());
    const [, sentFolderIds] = replaceItemFolders.mock.calls.at(-1);
    expect(sentFolderIds).not.toContain(eleventhFolder.folder_id);
    expect(sentFolderIds).toHaveLength(10);
  });

  it('renders pre-existing memberships as checked, and preserves/removes/adds them correctly on save', async () => {
    getFolders.mockResolvedValue([
      { folder_id: 10, name: 'Main Course', is_active: true, show_in_pos_filter: true },
      { folder_id: 20, name: 'Beverages', is_active: true, show_in_pos_filter: true },
      { folder_id: 30, name: 'Desserts', is_active: true, show_in_pos_filter: true },
      { folder_id: 40, name: 'Snacks', is_active: true, show_in_pos_filter: true }
    ]);
    listItemFolders.mockResolvedValue({ memberships: [{ folder_id: 20 }, { folder_id: 30 }] });

    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

    const beverages = within(section).getByLabelText('Beverages');
    const desserts = within(section).getByLabelText('Desserts');
    const snacks = within(section).getByLabelText('Snacks');
    await waitFor(() => {
      expect(beverages.checked).toBe(true);
      expect(desserts.checked).toBe(true);
    });
    expect(snacks.checked).toBe(false);
    expect(within(section).getByText('2/10 selected')).toBeTruthy();

    // Remove Desserts, add Snacks, leave Beverages untouched (preserved).
    fireEvent.click(desserts);
    fireEvent.click(snacks);

    fireEvent.click(within(section).getByRole('button', { name: 'Save Additional Categories' }));

    await waitFor(() => expect(replaceItemFolders).toHaveBeenCalled());
    const [calledItemId, sentFolderIds] = replaceItemFolders.mock.calls.at(-1);
    expect(calledItemId).toBe(24);
    expect([...sentFolderIds].sort((a, b) => a - b)).toEqual([20, 40]);
  });
});

describe('POS edit-item modal: Additional Categories — RF-3 permission-failure vs empty state (#1318, PR #1581 review)', () => {
  it('renders the real memberships and an honest count when the read succeeds', async () => {
    listItemFolders.mockResolvedValue({ memberships: [{ folder_id: 20 }] });

    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

    await waitFor(() => expect(within(section).getByLabelText('Beverages').checked).toBe(true));
    expect(within(section).getByText('1/10 selected')).toBeTruthy();
    expect(within(section).queryByText(/unavailable/i)).toBeNull();
  });

  it('renders an honest "unavailable" status, never a false 0/10, when the memberships GET is rejected with 403 -- even if the client still believes canManageCategories is true', async () => {
    // requireTenantAdmin (apps/dgfy-api/src/middleware/auth.js) is what
    // actually gates GET /items/:item_id/folders in production -- this
    // proves the UI trusts that real response over its own client-side
    // canManageCategories flag, which can drift from the server (stale
    // permission cache, a race, direct testing).
    listItemFolders.mockRejectedValue({
      response: { status: 403, data: { message: 'Category management permission is required.' } }
    });

    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

    await waitFor(() => expect(within(section).getByText(/unavailable/i)).toBeTruthy());
    expect(within(section).queryByText('0/10 selected')).toBeNull();
    expect(within(section).queryByText('You can review additional categories, but your role cannot change them.')).toBeNull();
    expect(within(section).queryByLabelText('Beverages')).toBeNull();
  });

  it('does not treat a non-403 failure (e.g. a network error) as the same "unavailable" permission state', async () => {
    listItemFolders.mockRejectedValue(new Error('Network request failed'));

    render(<TerminalOperationsWorkspace {...buildProps({ canManageCategories: true })} />);
    const section = await openEditAndGetSection();

    // Not a permission failure -- falls back to the genuinely-empty render
    // (0/10), same as today's behavior for any other kind of fetch failure.
    // This is a known, named gap (a transient network error still looks like
    // "zero memberships" rather than its own distinct error state) -- RF-3's
    // scope is specifically the permission-failure/empty-state conflation.
    await waitFor(() => expect(within(section).getByText('0/10 selected')).toBeTruthy());
    expect(within(section).queryByText(/unavailable/i)).toBeNull();
  });
});

describe('POS edit-item modal: Additional Categories gate (#1318, source contract)', () => {
  // This modal only ever opens for an item already found in sortedItems
  // (activeEditItem), so a "new/unsaved item" state is not reachable through
  // it today -- unlike IMS's ItemFormModal, which is shared between create
  // and edit. The section still guards on a real persisted item id, matching
  // ItemFormModal's own Boolean(itemIdForFolders) defensive gate, so it can
  // never render (or claim to load/save memberships) for an item that has no
  // server-assigned id. This is a source-string contract check, not a third
  // runtime behavior case -- named as such per the PR #1581 review (RF-2).
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

  it('resolves the pending primary category the same way handleSave resolves the saved one (RF-1)', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const workspace = fs.readFileSync(
      path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'),
      'utf8'
    );

    expect(workspace).toContain('const pendingPrimaryFolderId = useMemo(() => {');
    expect(workspace).toContain(
      "const foodCategory = resolveFoodCategorySelection(editForm.pos_category)\n      || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(typedCategoryName));"
    );
    expect(workspace).toContain('const excludedPrimaryFolderIds = useMemo(() => {');
  });
});
