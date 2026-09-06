/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SimpleCatalogToolbar } from './SimpleCatalogToolbar.jsx';

const menuItems = [{ item_id: 1, name: 'Item A' }, { item_id: 2, name: 'Item B' }];

const baseProps = {
  catalogSearch: '',
  categoryDropdownRef: { current: null },
  filteredCatalogViewModel: {
    menuItems: [{ item_id: 1, name: 'Rice' }],
    menuSections: []
  },
  isCategoryDropdownOpen: false,
  isMobileViewport: true,
  modeAdapter: {
    catalogEyebrow: 'Product Section',
    catalogHeading: 'Everyday Products',
    catalogSubtitle: 'Fast product browsing for simple operations with stock-aware ordering.',
    catalogSearchPlaceholder: 'Search products, essentials, or supplies...',
    heroTheme: {
      accent: '#176B3A',
      accentDark: '#0F5A30',
      bodyFont: 'Inter, sans-serif',
      displayFont: 'Inter, sans-serif',
      catalogPalette: {
        primary: '#176B3A',
        primaryHover: '#0F5A30',
        surface: '#FFFBF0',
        border: '#E4C98E'
      }
    }
  },
  resolvedSection: '',
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

  it('renders the mobile search field without requiring an expansion click', () => {
    const { container } = render(<SimpleCatalogToolbar {...baseProps} isMobileViewport />);

    expect(screen.getByText('Product Section')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Everyday Products' })).toBeTruthy();
    expect(screen.queryByText('Fast product browsing for simple operations with stock-aware ordering.')).toBeNull();
    const search = screen.getByRole('searchbox', { name: 'Search simple catalog products' });
    expect(search).toBeTruthy();
    expect(screen.getByPlaceholderText('Search products, essentials, or supplies...')).toBeTruthy();
    expect(search.parentElement.style.borderWidth).toBe('2px');
    expect(search.parentElement.style.borderColor).toBe('rgb(228, 201, 142)');
    expect(search.className).toContain('storefront-mobile-catalog-search');
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();

    const mobileGroups = [...container.querySelectorAll('[data-mobile-catalog-group]')];
    expect(mobileGroups.map((group) => group.dataset.mobileCatalogGroup)).toEqual(['intro-search', 'categories', 'filters']);
    expect(container.firstElementChild.style.gap).toBe('20px');
    expect(mobileGroups[0].style.gap).toBe('10px');
  });

  it('keeps the mobile search bound to catalog state', () => {
    const onSearchChange = vi.fn();
    render(<SimpleCatalogToolbar {...baseProps} onSearchChange={onSearchChange} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search simple catalog products' }), { target: { value: 'rice' } });

    expect(onSearchChange).toHaveBeenCalledWith('rice');
  });

  it('preserves the catalog subtitle on desktop', () => {
    render(<SimpleCatalogToolbar {...baseProps} isMobileViewport={false} />);

    expect(screen.getByText('Fast product browsing for simple operations with stock-aware ordering.')).toBeTruthy();
  });
});
