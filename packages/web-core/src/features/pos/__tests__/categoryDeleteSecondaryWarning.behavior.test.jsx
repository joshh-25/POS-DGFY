/** @vitest-environment jsdom */

// #1578 review RF-2: the delete-confirmation dialog's new secondary-membership
// warning line (#1318, ADR 0080 Consequences item 4) had no rendered-UI test --
// only backend repository/transport coverage. This proves the warning actually
// renders for a merchant, with the correct count, and that it never implies a
// replacement category is required for a folder with zero PRIMARY assignments
// (the existing "Move assigned items to" reassignment control stays gated on
// `item_count`, unaffected by the new `secondary_item_count`).

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';
import { getFolders } from '@/services/itemService.js';

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

describe('Category delete dialog: secondary-membership warning (#1318)', () => {
  it('shows the secondary-only count and does not require (or offer) a replacement category when the folder has zero primary assignments', async () => {
    getFolders.mockResolvedValue([{
      folder_id: 1,
      name: 'Legacy Folder',
      description: '',
      is_active: true,
      item_count: 0,
      secondary_item_count: 2
    }]);

    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));

    await screen.findByText('Legacy Folder');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Delete Legacy Folder? It has no assigned active items, so no reassignment is required.')).toBeTruthy();
    expect(screen.getByText(
      '2 item(s) also list this as a secondary category and will lose that link — no reassignment is offered for those, since each keeps its primary category elsewhere.'
    )).toBeTruthy();

    // The reassignment control is gated on `item_count` (primary), not the new
    // `secondary_item_count` -- a folder with only secondary memberships must
    // never be blocked on picking a replacement category.
    expect(screen.queryByText('Move assigned items to')).toBeNull();
    expect(screen.queryByLabelText(/Move assigned items to/)).toBeNull();
  });

  it('omits the secondary-membership line entirely when a folder has no secondary memberships', async () => {
    getFolders.mockResolvedValue([{
      folder_id: 2,
      name: 'Fresh Folder',
      description: '',
      is_active: true,
      item_count: 0,
      secondary_item_count: 0
    }]);

    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));

    await screen.findByText('Fresh Folder');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Delete Fresh Folder? It has no assigned active items, so no reassignment is required.')).toBeTruthy();
    expect(screen.queryByText(/also list this as a secondary category/)).toBeNull();
  });

  it('shows both the primary reassignment requirement and the secondary-only note together when a folder has both', async () => {
    getFolders.mockResolvedValue([{
      folder_id: 3,
      name: 'Mixed Folder',
      description: '',
      is_active: true,
      item_count: 3,
      secondary_item_count: 1
    }]);

    render(<TerminalOperationsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }));

    await screen.findByText('Mixed Folder');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Delete Mixed Folder? Its 3 assigned item(s) must move to another active category first.')).toBeTruthy();
    expect(screen.getByText(
      '1 item(s) also list this as a secondary category and will lose that link — no reassignment is offered for those, since each keeps its primary category elsewhere.'
    )).toBeTruthy();
    // The primary reassignment control IS required here, unaffected by the
    // secondary count.
    expect(screen.getByText('Move assigned items to')).toBeTruthy();
  });
});
