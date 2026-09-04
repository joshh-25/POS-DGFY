/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { StorefrontCatalogToolbar } from './StorefrontCatalogToolbar.jsx';
import { STYLES } from '../../theme/storefrontStyleTokens.js';
import { FNB_CATEGORY_ICON_MAP } from '../../../modes/fnb/storefront/model/fnbStorefrontPresentation.js';

// RF-4 (PR #1583 review): the shared F&B/Retail catalog toolbar must select, key, and resolve
// active state by `sectionIdentity` (the stable, folder_id-based identity `fnbStorefrontViewModel.js`
// computes), never by `sectionKey` (the normalized display text) -- two distinct folders can share
// a `sectionKey` but never a `sectionIdentity`. Consumer-level counterpart to the view-model-level
// regression test in fnbStorefrontViewModel.test.js and to buildFnbCatalogPresentation.test.js's
// resolution-level test.
const modeAdapter = {
  catalogEyebrow: 'Menu',
  catalogHeading: 'Order online',
  catalogSubtitle: '',
  catalogItemNounSingular: 'item',
  catalogItemNounPlural: 'items',
  catalogSearchPlaceholder: 'Search the menu...',
  catalogMaxWidth: 1320,
  heroTheme: {}
};

const menuItems = [
  { item_id: 1, name: 'Americano' },
  { item_id: 2, name: 'Iced Americano' }
];

const baseProps = {
  FNB_CATEGORY_ICON_MAP,
  STYLES,
  catalogSearch: '',
  filteredFnbViewModel: { menuItems, menuSections: [], totalItems: menuItems.length },
  fnbSortOption: 'name_asc',
  fnbViewMode: 'list',
  isFnbCategoryDropdownOpen: false,
  isMobileViewport: false,
  modeAdapter,
  resolvedFnbSection: '',
  setActiveServiceTab: vi.fn(),
  setCatalogSearch: vi.fn(),
  setFnbSortOption: vi.fn(),
  setFnbViewMode: vi.fn(),
  setIsFnbCategoryDropdownOpen: vi.fn(),
  showViewToggle: true
};

describe('StorefrontCatalogToolbar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('selects a menu section by its sectionIdentity, not its sectionKey', () => {
    const filteredFnbViewModel = {
      menuItems,
      menuSections: [
        {
          sectionKey: 'coffee',
          sectionIdentity: 'folder:10',
          sectionLabel: 'Coffee',
          items: [menuItems[0]],
          visualMeta: { iconToken: 'coffee' }
        }
      ],
      totalItems: menuItems.length
    };
    const setActiveServiceTab = vi.fn();
    render(
      // `isFnbCategoryDropdownOpen` is a controlled prop in this component (no internal state) --
      // pass it open directly rather than simulating a click on a mocked setter that wouldn't
      // actually re-render the component.
      <StorefrontCatalogToolbar
        {...baseProps}
        filteredFnbViewModel={filteredFnbViewModel}
        setActiveServiceTab={setActiveServiceTab}
        isFnbCategoryDropdownOpen
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Coffee.*1 item/ }));

    expect(setActiveServiceTab).toHaveBeenCalledWith('folder:10');
    expect(setActiveServiceTab).not.toHaveBeenCalledWith('coffee');
  });

  it('renders and independently selects two colliding-sectionKey, distinct-sectionIdentity sections', () => {
    // The reviewer's exact repro: "A B" (folder 10) and "A_B" (folder 11) both normalize to the
    // same sectionKey text.
    const filteredFnbViewModel = {
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
      ],
      totalItems: menuItems.length
    };
    const setActiveServiceTab = vi.fn();
    render(
      <StorefrontCatalogToolbar
        {...baseProps}
        filteredFnbViewModel={filteredFnbViewModel}
        setActiveServiceTab={setActiveServiceTab}
        isFnbCategoryDropdownOpen
      />
    );

    const sectionOptions = screen.getAllByRole('button', { name: /1 item/ }).filter((button) => (
      button.textContent.includes('A B') || button.textContent.includes('A_B')
    ));
    // Both distinct-folder sections render as separate options -- neither silently dropped nor
    // merged into one.
    expect(sectionOptions).toHaveLength(2);

    fireEvent.click(sectionOptions[0]);
    expect(setActiveServiceTab).toHaveBeenNthCalledWith(1, 'folder:10');

    fireEvent.click(sectionOptions[1]);
    expect(setActiveServiceTab).toHaveBeenNthCalledWith(2, 'folder:11');
  });

  it('uses sectionIdentity for the mobile category strip too', () => {
    const filteredFnbViewModel = {
      menuItems,
      menuSections: [
        {
          sectionKey: 'coffee',
          sectionIdentity: 'folder:10',
          sectionLabel: 'Coffee',
          items: [menuItems[0]],
          visualMeta: { iconToken: 'coffee' }
        }
      ],
      totalItems: menuItems.length
    };
    const setActiveServiceTab = vi.fn();
    render(
      <StorefrontCatalogToolbar
        {...baseProps}
        filteredFnbViewModel={filteredFnbViewModel}
        setActiveServiceTab={setActiveServiceTab}
        isMobileViewport
      />
    );

    fireEvent.click(screen.getByText('Coffee'));
    expect(setActiveServiceTab).toHaveBeenCalledWith('folder:10');
  });
});
