/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ServicesCatalogToolbar } from './ServicesCatalogToolbar.jsx';

const servicesViewModel = {
  allServices: [
    { item_id: 1, name: 'Wash and Fold' },
    { item_id: 2, name: 'Comforter Care' }
  ],
  serviceGroups: [
    {
      categoryKey: 'laundry',
      categoryIdentity: 'folder:11',
      categoryMeta: {
        label: 'Laundry',
        iconToken: 'laundry',
        accent: '#1A4E8D',
        accentBg: '#EEF6FD'
      },
      items: [{ item_id: 1, name: 'Wash and Fold' }]
    }
  ]
};

const baseProps = {
  catalogSearch: '',
  isMobileViewport: false,
  resolvedTab: '',
  serviceSortOption: 'recommended',
  servicesBodyFont: 'Inter, sans-serif',
  servicesDisplayFont: 'Inter, sans-serif',
  servicesPrimary: '#1A4E8D',
  servicesPrimaryDark: '#1A4586',
  servicesPrimarySoft: '#EEF6FD',
  servicesPrimaryBorder: 'rgba(26,78,141,0.2)',
  servicesPrimaryShadow: 'rgba(26,78,141,0.24)',
  catalogPresentation: {
    eyebrow: 'Services',
    heading: 'Choose the service you need',
    subtitle: '',
    priceAllLabel: 'All Price',
    categoryLabel: 'Service Categories',
    categoryAllLabel: 'All services',
    categoryIconToken: 'menu',
    searchPlaceholder: 'Search services...',
    maxWidth: 1216,
    toolbarVariant: 'services-compact'
  },
  servicesViewModel,
  setActiveServiceTab: vi.fn(),
  setCatalogSearch: vi.fn(),
  setServiceSortOption: vi.fn(),
  servicesViewMode: 'list',
  setServicesViewMode: vi.fn(),
  visibleServiceCount: 2
};

describe('ServicesCatalogToolbar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the services catalog toolbar with neutral copy and count', () => {
    render(<ServicesCatalogToolbar {...baseProps} />);

    expect(screen.getByText('Services')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choose the service you need' })).toBeTruthy();
    expect(screen.getByText('2 services available')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search services...').style.height).toBe('44px');
    const priceDropdown = screen.getByRole('combobox', { name: 'Select' });
    expect(priceDropdown).toBeTruthy();
    expect(screen.getByRole('button', { name: /Category.*All services.*2/ })).toBeTruthy();
    expect(priceDropdown.style.minHeight).toBe('44px');
    expect(priceDropdown.parentElement.style.minWidth).toBe('185px');
    expect(screen.getByRole('button', { name: /Category.*All services.*2/ }).parentElement.style.width).toBe('270px');
    expect(screen.getByRole('button', { name: /Category.*All services.*2/ }).style.minHeight).toBe('44px');
    expect(screen.getByRole('button', { name: 'Search services' })).toBeTruthy();
    expect(priceDropdown.querySelector('svg.lucide-filter')?.getAttribute('width')).toBe('16');
    expect(screen.getByRole('button', { name: /Category.*All services.*2/ }).querySelector('svg.lucide-box')?.getAttribute('width')).toBe('16');
    expect(screen.getByRole('button', { name: /Category.*All services.*2/ }).querySelector('span[style*="white-space"]')?.style.whiteSpace).toBe('nowrap');
  });

  it('connects search, price sorting, and categories to service state', () => {
    const setCatalogSearch = vi.fn();
    const setServiceSortOption = vi.fn();
    const setActiveServiceTab = vi.fn();
    render(
      <ServicesCatalogToolbar
        {...baseProps}
        setCatalogSearch={setCatalogSearch}
        setServiceSortOption={setServiceSortOption}
        setActiveServiceTab={setActiveServiceTab}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search services...'), { target: { value: 'wash' } });
    expect(setCatalogSearch).toHaveBeenCalledWith('wash');

    fireEvent.click(screen.getByRole('combobox', { name: 'Select' }));
    fireEvent.click(screen.getByRole('option', { name: 'Price: Low to High' }));
    expect(setServiceSortOption).toHaveBeenCalledWith('price_asc');

    fireEvent.click(screen.getByRole('button', { name: /Category.*All services.*2/ }));
    fireEvent.click(screen.getByRole('button', { name: /Laundry.*1 service/ }));
    // RF-4 (PR #1583 review): the shared toolbar must select by the stable `categoryIdentity`
    // (folder_id-based), not the normalized `categoryKey` display text.
    expect(setActiveServiceTab).toHaveBeenCalledWith('folder:11');
  });

  // RF-4 (PR #1583 review): two distinct-`folder_id` categories that happen to share a
  // normalized `categoryKey`/display label must render as two separately selectable options,
  // never collapse into one. Consumer-level counterpart to the view-model-level regression test
  // in servicesStorefrontViewModel.test.js.
  it('renders and independently selects two colliding-name, distinct-identity categories', () => {
    const collidingViewModel = {
      allServices: [
        { item_id: 1, name: 'Wash and Fold' },
        { item_id: 2, name: 'Machine Wash' }
      ],
      serviceGroups: [
        {
          categoryKey: 'wash',
          categoryIdentity: 'folder:10',
          categoryMeta: { label: 'Wash', iconToken: 'laundry', accent: '#1A4E8D', accentBg: '#EEF6FD' },
          items: [{ item_id: 1, name: 'Wash and Fold' }]
        },
        {
          categoryKey: 'wash',
          categoryIdentity: 'folder:11',
          categoryMeta: { label: 'Wash', iconToken: 'laundry', accent: '#1A4E8D', accentBg: '#EEF6FD' },
          items: [{ item_id: 2, name: 'Machine Wash' }]
        }
      ]
    };
    const setActiveServiceTab = vi.fn();
    render(
      <ServicesCatalogToolbar
        {...baseProps}
        servicesViewModel={collidingViewModel}
        setActiveServiceTab={setActiveServiceTab}
        visibleServiceCount={2}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Category.*All services.*2/ }));
    const washOptions = screen.getAllByRole('button', { name: /Wash.*1 service/ });
    expect(washOptions).toHaveLength(2); // both distinct-folder groups render, not merged into one

    fireEvent.click(washOptions[0]);
    expect(setActiveServiceTab).toHaveBeenNthCalledWith(1, 'folder:10');

    fireEvent.click(screen.getByRole('button', { name: /Category.*All services.*2/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Wash.*1 service/ })[1]);
    expect(setActiveServiceTab).toHaveBeenNthCalledWith(2, 'folder:11');
  });

  it('keeps the mobile category strip with the search interaction', () => {
    render(<ServicesCatalogToolbar {...baseProps} isMobileViewport />);

    expect(screen.getByText('Browse by Category')).toBeTruthy();
    expect(screen.getByText('2 services available')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search services...')).toBeNull();
  });

  it('enables the mobile list and grid view choices for Services', () => {
    const setServicesViewMode = vi.fn();
    const { container } = render(<ServicesCatalogToolbar {...baseProps} isMobileViewport setServicesViewMode={setServicesViewMode} />);
    const viewButtons = [...container.querySelectorAll('button')].filter((button) => button.querySelector('svg.lucide-list, svg.lucide-layout-grid'));

    expect(viewButtons).toHaveLength(2);
    fireEvent.click(viewButtons[0]);
    fireEvent.click(viewButtons[1]);
    expect(setServicesViewMode).toHaveBeenNthCalledWith(1, 'list');
    expect(setServicesViewMode).toHaveBeenNthCalledWith(2, 'grid');
  });
});
