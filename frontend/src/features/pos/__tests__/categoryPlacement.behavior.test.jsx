/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';

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
});
