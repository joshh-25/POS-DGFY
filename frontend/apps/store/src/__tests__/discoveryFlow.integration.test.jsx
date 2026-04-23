/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../main.jsx';

vi.mock('leaflet', () => {
  const markerApi = () => ({
    addTo: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis()
  });
  return {
    default: {
      map: vi.fn(() => ({
        setView: vi.fn().mockReturnThis(),
        fitBounds: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
        invalidateSize: vi.fn(),
        getContainer: vi.fn(() => ({ style: {} }))
      })),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      marker: vi.fn(markerApi),
      divIcon: vi.fn((options) => options)
    }
  };
});

const makeJsonResponse = (data, ok = true) => ({
  ok,
  json: async () => ({ data })
});

const getDiscoveryQueryUrls = (fetchMock) => fetchMock.mock.calls
  .map(([url]) => String(url))
  .filter((url) => url.includes('/api/v1/storefront/discovery?'));

const getLastDiscoveryParams = (fetchMock) => {
  const urls = getDiscoveryQueryUrls(fetchMock);
  const last = urls[urls.length - 1];
  if (!last) return new URLSearchParams();
  const parsed = new URL(last, 'http://localhost');
  return parsed.searchParams;
};

describe('storefront discovery integration flow', () => {
  let fetchMock;

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    fetchMock = vi.fn(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: [],
          pagination: { page: 1, limit: 100, total: 0, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'in_stock_only',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ locations: [], primary_location_id: null });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      if (normalized.includes('/api/v1/storefront/discovery/')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          location_id: 11,
          address_line: 'Iloilo City',
          storefront_open: true,
          catalog_count: 2
        });
      }
      return makeJsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('debounces search typing and only requests final query after delay', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1);
    });

    const searchInput = screen.getByPlaceholderText('Search store, slug, address, or item...');
    await user.type(searchInput, 'milk');

    await new Promise((resolve) => setTimeout(resolve, 350));
    const discoveryUrls = getDiscoveryQueryUrls(fetchMock);
    const searchValues = discoveryUrls
      .map((requestUrl) => new URL(requestUrl, 'http://localhost').searchParams.get('search'))
      .filter(Boolean);
    expect(searchValues).toEqual(expect.arrayContaining(['milk']));
    expect(searchValues).not.toEqual(expect.arrayContaining(['m', 'mi', 'mil']));
  });

  it('sends discovery control params in query string', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    await user.selectOptions(screen.getByLabelText('Result Mode'), 'item_only');
    await waitFor(() => expect(getLastDiscoveryParams(fetchMock).get('result_mode')).toBe('item_only'));

    await user.selectOptions(screen.getByLabelText('Stock Filter'), 'include_out_of_stock');
    await waitFor(() => expect(getLastDiscoveryParams(fetchMock).get('stock_filter')).toBe('include_out_of_stock'));

    await user.selectOptions(screen.getByLabelText('Pin Scope'), 'all_matching_branches');
    await waitFor(() => expect(getLastDiscoveryParams(fetchMock).get('pin_scope')).toBe('all_matching_branches'));
  });

  it('shows actionable no-result recovery message for search queries', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    await user.type(screen.getByPlaceholderText('Search store, slug, address, or item...'), 'milk');
    await new Promise((resolve) => setTimeout(resolve, 320));
    await waitFor(() => {
      expect(screen.getByText(/No stores matched "milk"/i)).toBeTruthy();
    });
  });

  it('renders match badges and opens store with preferred matching location id', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: [
            {
              tenant_id: 'tenant-1',
              tenant_name: 'Alpha Foods',
              slug: 'alpha',
              storefront_open: true,
              address_line: 'Iloilo City',
              latitude: 10.72,
              longitude: 122.56,
              catalog_count: 2,
              estimated_wait_minutes: 15,
              match_reasons: ['store', 'item'],
              matching_item_count: 1,
              matching_item_sample: ['Calamansi Juice'],
              has_in_stock_match: true,
              matching_location_ids: [22],
              nearest_matching_location_id: 22
            }
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'in_stock_only',
            pin_scope: 'all_matching_branches',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true },
            { location_id: 22, name: 'Branch', latitude: 10.721, longitude: 122.562, is_active: true, is_primary_storefront: false, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/storefront/discovery/alpha')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          location_id: 11,
          address_line: 'Iloilo City',
          storefront_open: true,
          catalog_count: 2
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Alpha Foods').length).toBeGreaterThan(0));
    await user.type(screen.getByPlaceholderText('Search store, slug, address, or item...'), 'alpha');
    await new Promise((resolve) => setTimeout(resolve, 320));
    await user.selectOptions(screen.getByLabelText('Pin Scope'), 'all_matching_branches');
    await waitFor(() => expect(screen.getAllByText('Store + Item match').length).toBeGreaterThan(0));
    expect(screen.getAllByText('In-stock match').length).toBeGreaterThan(0);

    const storeButtons = screen.getAllByRole('button', { name: /Alpha Foods/i });
    await user.click(storeButtons[0]);
    await waitFor(() => {
      const catalogCalls = fetchMock.mock.calls
        .map(([requestUrl]) => String(requestUrl))
        .filter((requestUrl) => requestUrl.includes('/api/v1/store/catalog?'));
      expect(catalogCalls.some((requestUrl) => requestUrl.includes('location_id=22'))).toBe(true);
    });
  });

  it('Near Me success sends coordinates and switches default pin scope to nearest matching branch', async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 10.7, longitude: 122.5 } });
    });
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });

    render(<App />);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Near Me' }));

    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('latitude')).toBe('10.7');
      expect(params.get('longitude')).toBe('122.5');
      expect(params.get('pin_scope')).toBe('nearest_matching_branch');
    });
  });

  it('Near Me failure falls back to discovery without coordinates', async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((success, error) => {
      error(new Error('denied'));
    });
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });

    render(<App />);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Near Me' }));

    await waitFor(() => {
      expect(getDiscoveryQueryUrls(fetchMock).length).toBeGreaterThanOrEqual(2);
    });
    const params = getLastDiscoveryParams(fetchMock);
    expect(params.get('latitude')).toBeNull();
    expect(params.get('longitude')).toBeNull();
  });

  it('shows explicit tenant setup empty-state when catalog has no sellable items', async () => {
    window.history.pushState({}, '', '/tenant-store/alpha');

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Storefront items are not set up yet')).toBeTruthy();
    });
    expect(screen.getByText(/Customer checkout will be available once at least one storefront item is enabled/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check Again' })).toBeTruthy();

    await user.type(screen.getByPlaceholderText('Search items in this store catalog...'), 'milk');
    await waitFor(() => {
      expect(screen.getByText('No items are available to search yet')).toBeTruthy();
    });
  });
});
