/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SimpleCatalogToolbar } from './SimpleCatalogToolbar.jsx';

// RF-4 (PR #1583 review): Simple mode consumes the same F&B view model
// (getFoodBeverageStorefrontViewModel) as StorefrontCatalogToolbar.jsx, so its own category
// dropdown must select by `sectionIdentity` (the stable, folder_id-based identity), never
// `sectionKey` (the normalized display text).
const menuItems = [{ item_id: 1, name: 'Item A' }, { item_id: 2, name: 'Item B' }];

const baseProps = {
  catalogSearch: '',
  categoryDropdownRef: { current: null },
  isMobileViewport: false,
  modeAdapter: { catalogHeading: 'Shop', catalogSubtitle: '', catalogSearchPlaceholder: 'Search...' },
  sortOption: 'name_asc',
  viewMode: 'list',
  onCategoryChange: vi.fn(),
  onCategoryDropdownOpenChange: vi.fn(),
  onSearchChange: vi.fn(),
  onSortChange: vi.fn(),
  onViewModeChange: vi.fn()
};

describe('SimpleCatalogToolbar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders and independently selects two colliding-sectionKey, distinct-sectionIdentity sections', () => {
    const filteredCatalogViewModel = {
      menuItems,
      menuSections: [
        {
          sectionKey: 'a_b',
          sectionIdentity: 'folder:10',
          sectionLabel: 'A B',
          items: [menuItems[0]],
          visualMeta: { iconToken: 'menu' }
        },
        {
          sectionKey: 'a_b',
          sectionIdentity: 'folder:11',
          sectionLabel: 'A_B',
          items: [menuItems[1]],
          visualMeta: { iconToken: 'menu' }
        }
      ]
    };
    const onCategoryChange = vi.fn();
    render(
      // `isCategoryDropdownOpen` is a controlled prop -- pass it open directly.
      <SimpleCatalogToolbar
        {...baseProps}
        filteredCatalogViewModel={filteredCatalogViewModel}
        resolvedSection=""
        isCategoryDropdownOpen
        onCategoryChange={onCategoryChange}
      />
    );

    const sectionOptions = screen.getAllByRole('button').filter((button) => (
      button.textContent.includes('A B') || button.textContent.includes('A_B')
    ));
    // Both distinct-folder sections render as separate options -- neither silently dropped nor
    // merged into one.
    expect(sectionOptions).toHaveLength(2);

    fireEvent.click(sectionOptions[0]);
    expect(onCategoryChange).toHaveBeenNthCalledWith(1, 'folder:10');

    fireEvent.click(sectionOptions[1]);
    expect(onCategoryChange).toHaveBeenNthCalledWith(2, 'folder:11');
  });
});
