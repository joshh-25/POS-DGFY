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
      categoryMeta: {
        label: 'Laundry',
        iconToken: 'laundry',
        accent: '#0f766e',
        accentBg: '#f0fdfa'
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
  servicesPrimary: '#0f766e',
  servicesPrimaryDark: '#134e4a',
  servicesPrimarySoft: '#f0fdfa',
  servicesPrimaryBorder: 'rgba(15,118,110,0.2)',
  servicesPrimaryShadow: 'rgba(15,118,110,0.24)',
  catalogPresentation: {
    eyebrow: 'Laundry Services',
    heading: 'Choose the care you need',
    subtitle: '',
    searchPlaceholder: 'Search laundry services...',
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

  it('renders the retail catalog toolbar with service-specific copy and count', () => {
    render(<ServicesCatalogToolbar {...baseProps} />);

    expect(screen.getByText('Laundry Services')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choose the care you need' })).toBeTruthy();
    expect(screen.getByText('2 services available')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search laundry services...')).toBeTruthy();
    expect(screen.getByRole('button', { name: /All Prices/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Category.*All.*2/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /All Prices/ }).style.minHeight).toBe('44px');
    expect(screen.getByRole('button', { name: /Category.*All.*2/ }).parentElement.style.width).toBe('215px');
    expect(screen.getByRole('button', { name: 'Search services' })).toBeTruthy();
    expect([...screen.getByRole('button', { name: /All Prices/ }).querySelectorAll('svg')].at(-1)?.getAttribute('width')).toBe('16');
    expect(screen.getByRole('button', { name: /Category.*All.*2/ }).querySelector('svg')?.getAttribute('width')).toBe('16');
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

    fireEvent.change(screen.getByPlaceholderText('Search laundry services...'), { target: { value: 'wash' } });
    expect(setCatalogSearch).toHaveBeenCalledWith('wash');

    fireEvent.click(screen.getByRole('button', { name: /All Prices/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Price: Low to High' }));
    expect(setServiceSortOption).toHaveBeenCalledWith('price_asc');

    fireEvent.click(screen.getByRole('button', { name: /Category.*All.*2/ }));
    fireEvent.click(screen.getByRole('button', { name: /Laundry.*1 service/ }));
    expect(setActiveServiceTab).toHaveBeenCalledWith('laundry');
  });

  it('keeps the mobile category strip with the search interaction', () => {
    render(<ServicesCatalogToolbar {...baseProps} isMobileViewport />);

    expect(screen.getByText('Browse by Category')).toBeTruthy();
    expect(screen.getByText('2 services available')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search laundry services...')).toBeNull();
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
