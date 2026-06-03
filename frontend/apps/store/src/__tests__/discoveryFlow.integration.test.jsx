/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import maplibregl from 'maplibre-gl';
import { App } from '../main.jsx';

vi.mock('maplibre-gl', () => {
  function PopupApi() {
    const handlers = {};
    const api = {
      node: null,
      html: '',
      on: vi.fn((eventName, handler) => {
        handlers[eventName] = handlers[eventName] || [];
        handlers[eventName].push(handler);
        return api;
      }),
      off: vi.fn((eventName, handler) => {
        handlers[eventName] = (handlers[eventName] || []).filter((entry) => entry !== handler);
        return api;
      }),
      setDOMContent: vi.fn((node) => {
        api.node = node;
        return api;
      }),
      setHTML: vi.fn((html) => {
        api.html = html;
        return api;
      }),
      setLngLat: vi.fn(() => api),
      addTo: vi.fn(() => {
        if (api.node && !api.node.isConnected) document.body.appendChild(api.node);
        return api;
      }),
      remove: vi.fn(() => {
        if (api.node?.isConnected) api.node.remove();
        (handlers.close || []).forEach((handler) => handler());
        return api;
      })
    };
    return api;
  }
  function MarkerApi(options = {}) {
    const element = options.element || document.createElement('div');
    element.dataset.markerOffset = JSON.stringify(options.offset || [0, 0]);
    element.dataset.markerAnchor = options.anchor || '';
    const api = {
      setLngLat: vi.fn(() => api),
      addTo: vi.fn((map) => {
        if (map?.container && !element.isConnected) map.container.appendChild(element);
        return api;
      }),
      remove: vi.fn(() => {
        if (element.isConnected) element.remove();
        return api;
      }),
      setPopup: vi.fn(() => api),
      getElement: vi.fn(() => element)
    };
    return api;
  }
  function MapApi(options = {}) {
    return {
      container: options.container,
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      flyTo: vi.fn().mockReturnThis(),
      fitBounds: vi.fn().mockReturnThis(),
      getZoom: vi.fn(() => 13),
      resize: vi.fn(),
      remove: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} }))
    };
  }
  return {
    default: {
      Map: vi.fn(MapApi),
      Marker: vi.fn(MarkerApi),
      Popup: vi.fn(PopupApi)
    }
  };
});

const injectWorkflowMode = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const newObj = { ...obj };
  if (Array.isArray(newObj.stores)) {
    newObj.stores = newObj.stores.map(store => ({
      workflow_mode: 'services',
      ...store
    }));
  }
  if (typeof newObj.slug === 'string') {
    newObj.workflow_mode = 'services';
  }
  return newObj;
};

const makeJsonResponse = (data, ok = true) => ({
  ok,
  json: async () => ({ data: injectWorkflowMode(data) })
});

const dgfyLegalTerms = {
  flows: {
    account_registration: {
      snapshot: {
        terms_version: 'dgfy-account-terms-2026-05-26',
        privacy_version: 'dgfy-privacy-2026-05-26',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-05-26',
        acknowledgement_text: 'I agree to the DGFY Terms, Privacy Policy, and marketplace account terms.'
      },
      documents: [
        { key: 'accountTerms', title: 'DGFY Account Terms', version: 'dgfy-account-terms-2026-05-26', summary: 'Account terms', href: '/legal/dgfy-account-terms' },
        { key: 'privacy', title: 'DGFY Privacy Policy', version: 'dgfy-privacy-2026-05-26', summary: 'Privacy terms', href: '/privacy' },
        { key: 'marketplaceTerms', title: 'DGFY Marketplace Provider Terms', version: 'dgfy-marketplace-provider-2026-05-26', summary: 'Marketplace terms', href: '/legal/dgfy-marketplace-provider-terms' }
      ]
    }
  }
};

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
            stock_filter: 'include_out_of_stock',
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
          catalog_count: 2,
          storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
          storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
        });
      }
      return makeJsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = '';
    document.body.querySelectorAll('.store-marker-preview-card').forEach((node) => node.remove());
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes the discovery map as a flat 2D map', async () => {
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
              catalog_count: 2
            }
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main Branch', address_line: 'Alpha Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<App />);

    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalled());
    const mapOptions = maplibregl.Map.mock.calls.at(-1)?.[0] || {};

    expect(mapOptions.bearing).toBe(0);
    expect(mapOptions.pitch).toBe(0);
  });

  it('keeps account access visible when MapLibre cannot initialize WebGL', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    maplibregl.Map.mockImplementationOnce(function MapUnavailable() {
      throw new Error('webgl unavailable');
    });

    try {
      render(<App />);

      expect(await screen.findByText('Store map unavailable')).toBeTruthy();
      expect(await screen.findByText('Log in / Sign up')).toBeTruthy();

      fireEvent.click(screen.getByText('Log in / Sign up'));

      expect(await screen.findByText('DGFY Account')).toBeTruthy();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('registers from the storefront account panel with approved field order and terms acknowledgement', async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, options = {}) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/dgfy/legal-terms/current')) {
        return makeJsonResponse(dgfyLegalTerms);
      }
      if (normalized.includes('/api/v1/dgfy/auth/register')) {
        return makeJsonResponse({
          token: 'dgfy-token',
          account: {
            id: 'dgfy-1',
            first_name: 'Ada',
            middle_name: 'Byron',
            last_name: 'Lovelace',
            email: 'ada@example.test',
            phone: '+639123456789'
          }
        });
      }
      if (normalized.includes('/api/v1/dgfy/customer/dashboard')) {
        return makeJsonResponse({
          account: {
            id: 'dgfy-1',
            first_name: 'Ada',
            middle_name: 'Byron',
            last_name: 'Lovelace',
            email: 'ada@example.test',
            phone: '+639123456789'
          },
          orders: [],
          bookings: [],
          addresses: [],
          loyalty: null
        });
      }
      return defaultFetch(url, options);
    });

    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /log in \/ sign up/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByRole('checkbox', { name: /I have reviewed and agree to the current DGFY Account Terms/i });
    await waitFor(() => expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/api/v1/dgfy/legal-terms/current'))).toBe(true));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /I have reviewed and agree to the current DGFY Account Terms/i }).disabled).toBe(false));

    const submitButton = screen.getByRole('button', { name: /create dgfy account/i });
    const placeholders = Array.from(submitButton.closest('form').querySelectorAll('input'))
      .map((input) => input.placeholder)
      .filter(Boolean)
      .slice(0, 7);
    expect(placeholders).toEqual([
      'Last name',
      'First name',
      'Middle name (optional)',
      'Email',
      'Contact number',
      'Password',
      'Confirm password'
    ]);

    fireEvent.click(screen.getByRole('button', { name: /view terms/i }));
    expect(screen.getByRole('dialog', { name: /current dgfy terms/i })).toBeTruthy();
    expect(screen.getByText('DGFY Account Terms')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /close/i }).find((button) => button.textContent === 'Close'));

    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByPlaceholderText('Middle name (optional)'), { target: { value: 'Byron' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('Contact number'), { target: { value: '+639123456789' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    fireEvent.click(screen.getByRole('button', { name: /show confirm password/i }));
    expect(screen.getByPlaceholderText('Password').type).toBe('text');
    expect(screen.getByPlaceholderText('Confirm password').type).toBe('text');
    fireEvent.click(screen.getByRole('checkbox', { name: /I have reviewed and agree to the current DGFY Account Terms/i }));
    fireEvent.click(submitButton);

    await waitFor(() => {
      const registerCall = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('/api/v1/dgfy/auth/register'));
      expect(registerCall).toBeTruthy();
      expect(JSON.parse(registerCall[1].body)).toEqual(expect.objectContaining({
        first_name: 'Ada',
        middle_name: 'Byron',
        last_name: 'Lovelace',
        email: 'ada@example.test',
        phone: '+639123456789',
        accepted_terms: true,
        terms_version: 'dgfy-account-terms-2026-05-26',
        privacy_version: 'dgfy-privacy-2026-05-26',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-05-26'
      }));
    });
  }, 15000);

  it('auto-loads signed-in DGFY customer context and exposes saved address checkout actions', async () => {
    window.history.pushState({}, '', '/tenant-store/alpha');
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = 'dgfy-token';
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, options = {}) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery/alpha')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          location_id: 11,
          address_line: 'Iloilo City',
          storefront_open: true,
          catalog_count: 1,
          storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
          storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main Branch', address_line: 'Alpha Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({
          items: [
            { item_id: 5, name: 'Pantry Pack', category: 'General', default_sale_price: 120, storefront_visible: true, current_stock: 10, checkout_allowed: true }
          ],
          pagination: { count: 1 }
        });
      }
      if (normalized.includes('/api/v1/dgfy/customer/dashboard')) {
        return makeJsonResponse({
          account: {
            id: 'dgfy-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.test',
            phone: '+639123456789'
          },
          orders: [
            { activity_id: 100, reference: 'SK-ABC123', status: 'placed', total_amount: 120, occurred_at: '2026-05-28T01:00:00Z' }
          ],
          bookings: [],
          addresses: [
            { address_id: 9, label: 'Home', address_line: 'Iloilo Home Address', latitude: 10.71, longitude: 122.55, is_default: true }
          ],
          loyalty: { balance: 12, transactions: [] }
        });
      }
      if (normalized.includes('/api/v1/store/auth/me')) {
        return makeJsonResponse({
          customer: {
            id: 'dgfy-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.test',
            phone: '+639123456789'
          }
        });
      }
      if (normalized.includes('/api/v1/store/orders')) {
        return makeJsonResponse({
          orders: [
            { activity_id: 100, reference: 'SK-ABC123', status: 'placed', total_amount: 120, occurred_at: '2026-05-28T01:00:00Z' }
          ]
        });
      }
      if (normalized.includes('/api/v1/store/services/bookings')) {
        return makeJsonResponse({ bookings: [] });
      }
      if (normalized.includes('/api/v1/dgfy/customer/addresses')) {
        return makeJsonResponse({
          addresses: [
            { address_id: 9, label: 'Home', address_line: 'Iloilo Home Address', latitude: 10.71, longitude: 122.55, is_default: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/dgfy/customer/loyalty')) {
        return makeJsonResponse({
          loyalty: { balance: 12, transactions: [] }
        });
      }
      return defaultFetch(url, options);
    });

    render(<App />);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/api/v1/dgfy/customer/dashboard'))).toBe(true);
    });
    fireEvent.click((await screen.findAllByRole('button', { name: /^profile$/i }))[0]);

    expect(await screen.findByText('My Account')).toBeTruthy();
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Home - Default')).toBeTruthy();
    expect(screen.getByText('Iloilo Home Address')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use for Checkout' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Track' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeTruthy();
  });

  it('searches only after the current search action is submitted', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1);
    });

    const searchInput = screen.getByPlaceholderText('Search products, services or stores nearby...');
    await user.type(searchInput, 'milk');

    expect(getDiscoveryQueryUrls(fetchMock)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    await waitFor(() => {
      const searchValues = getDiscoveryQueryUrls(fetchMock)
        .map((requestUrl) => new URL(requestUrl, 'http://localhost').searchParams.get('search'))
        .filter(Boolean);
      expect(searchValues).toEqual(expect.arrayContaining(['milk']));
      expect(searchValues).not.toEqual(expect.arrayContaining(['m', 'mi', 'mil']));
    });
    const searchValues = getDiscoveryQueryUrls(fetchMock)
      .map((requestUrl) => new URL(requestUrl, 'http://localhost').searchParams.get('search'))
      .filter(Boolean);
    expect(searchValues).not.toEqual(expect.arrayContaining(['m', 'mi', 'mil']));
    expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/api/v1/storefront/geo-search'))).toBe(false);
  });

  it('ignores stale geolocation callbacks from earlier search actions', async () => {
    const user = userEvent.setup();
    const pendingGeolocationRequests = [];
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success, error) => {
          pendingGeolocationRequests.push({ success, error });
        })
      }
    });

    render(<App />);
    await waitFor(() => {
      expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1);
    });

    const searchInput = screen.getByPlaceholderText('Search products, services or stores nearby...');
    await user.type(searchInput, 'milk');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await user.clear(searchInput);
    await user.type(searchInput, 'rice');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    expect(pendingGeolocationRequests).toHaveLength(2);
    pendingGeolocationRequests[0].success({ coords: { latitude: 1, longitude: 2 } });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    let searchValues = getDiscoveryQueryUrls(fetchMock)
      .map((requestUrl) => new URL(requestUrl, 'http://localhost').searchParams.get('search'))
      .filter(Boolean);
    expect(searchValues).not.toContain('milk');

    pendingGeolocationRequests[1].success({ coords: { latitude: 10.7, longitude: 122.5 } });
    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('search')).toBe('rice');
      expect(params.get('latitude')).toBe('10.7');
      expect(params.get('longitude')).toBe('122.5');
    });

    searchValues = getDiscoveryQueryUrls(fetchMock)
      .map((requestUrl) => new URL(requestUrl, 'http://localhost').searchParams.get('search'))
      .filter(Boolean);
    expect(searchValues).toContain('rice');
    expect(searchValues).not.toContain('milk');
  });

  it('sends the current discovery query contract by default', async () => {
    render(<App />);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    const params = getLastDiscoveryParams(fetchMock);
    expect(params.get('result_mode')).toBe('union');
    expect(params.get('stock_filter')).toBe('include_out_of_stock');
    expect(params.get('pin_scope')).toBe('tenant_primary');
    expect(params.get('include_match_meta')).toBe('true');
  });

  it('shows actionable no-result recovery message for search queries', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'milk');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/No stores matched "milk"/i).length).toBeGreaterThan(0);
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
              storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
              storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png',
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
            stock_filter: 'include_out_of_stock',
            pin_scope: 'all_matching_branches',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', latitude: 10.72, longitude: 122.56, is_active: false, is_primary_storefront: true, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true },
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
          catalog_count: 2,
          storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
          storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
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
    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'alpha');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => expect(screen.getAllByText('Store + Item match').length).toBeGreaterThan(0));
    expect(screen.getAllByText('In-stock match').length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'View Store' })[0]);
    await waitFor(() => {
      expect(screen.getByText('Tenant page: alpha')).toBeTruthy();
    });
    expect(screen.getAllByAltText(/Alpha Foods profile/i).length).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/Alpha Foods cover/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      const catalogCalls = fetchMock.mock.calls
        .map(([requestUrl]) => String(requestUrl))
        .filter((requestUrl) => requestUrl.includes('/api/v1/store/catalog?'));
      expect(catalogCalls.some((requestUrl) => requestUrl.includes('location_id=22'))).toBe(true);
    });
  });

  it('opens a marker preview first and routes the card action with the pinned location id', async () => {
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
              storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
              storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png',
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
            stock_filter: 'include_out_of_stock',
            pin_scope: 'all_matching_branches',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true },
            { location_id: 22, name: 'Branch', address_line: 'Branch Road', latitude: 10.721, longitude: 122.562, is_active: true, is_primary_storefront: false, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true }
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
          catalog_count: 2,
          storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
          storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Preview Alpha Foods at Main/i }).length).toBeGreaterThan(0));
    const alphaMarkerCall = maplibregl.Marker.mock.calls.find(([options]) => (
      options?.element?.getAttribute?.('aria-label') || ''
    ).includes('Preview Alpha Foods at Main'));
    expect(alphaMarkerCall?.[0]?.anchor).toBe('bottom');
    const alphaMarkerElement = alphaMarkerCall?.[0]?.element;
    expect(alphaMarkerElement).toBeTruthy();

    await user.click(alphaMarkerElement);
    await waitFor(() => expect(screen.getAllByText('Main').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Iloilo City').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Open storefront' }));
    await waitFor(() => {
      expect(screen.getByText('Tenant page: alpha')).toBeTruthy();
    });
    await waitFor(() => {
      const catalogCalls = fetchMock.mock.calls
        .map(([requestUrl]) => String(requestUrl))
        .filter((requestUrl) => requestUrl.includes('/api/v1/store/catalog?'));
      expect(catalogCalls.some((requestUrl) => requestUrl.includes('location_id=11'))).toBe(true);
    });
  });

  it('keeps the marker preview available when keyboard focus moves into the card action', async () => {
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
              storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
              storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png',
              match_reasons: ['store', 'item'],
              matching_item_count: 1,
              has_in_stock_match: true,
              matching_location_ids: [22],
              nearest_matching_location_id: 22
            }
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'all_matching_branches',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true },
            { location_id: 22, name: 'Branch', address_line: 'Branch Road', latitude: 10.721, longitude: 122.562, is_active: true, is_primary_storefront: false, is_open: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Preview Alpha Foods at Main/i }).length).toBeGreaterThan(0));

    const marker = screen.getAllByRole('button', { name: /Preview Alpha Foods at Main/i })[0];
    fireEvent.click(marker);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy());

    const action = screen.getByRole('button', { name: 'Open storefront' });
    fireEvent.blur(marker, { relatedTarget: action });
    fireEvent.focusIn(action);
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: /Alpha Foods location preview/i }), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Alpha Foods location preview/i })).toBeNull());
  });

  it('keeps click-open marker previews available when the pointer leaves the marker', async () => {
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
              storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
              storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png',
              match_reasons: ['store', 'item'],
              matching_item_count: 1,
              has_in_stock_match: true,
              matching_location_ids: [22],
              nearest_matching_location_id: 22
            }
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'all_matching_branches',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true },
            { location_id: 22, name: 'Branch', address_line: 'Branch Road', latitude: 10.721, longitude: 122.562, is_active: true, is_primary_storefront: false, is_open: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Preview Alpha Foods at Main/i }).length).toBeGreaterThan(0));

    const marker = screen.getAllByRole('button', { name: /Preview Alpha Foods at Main/i })[0];
    await user.click(marker);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy());

    fireEvent.pointerLeave(marker, { relatedTarget: document.body });
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy();
  });

  it('renders duplicate-coordinate map pins as one exact-coordinate cluster marker', async () => {
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
              matching_location_ids: [11, 22],
              nearest_matching_location_id: 11
            },
            {
              tenant_id: 'tenant-2',
              tenant_name: 'Beta Foods',
              slug: 'beta',
              storefront_open: true,
              address_line: 'Iloilo City',
              latitude: 10.72,
              longitude: 122.56,
              catalog_count: 1,
              matching_location_ids: [33],
              nearest_matching_location_id: 33
            }
          ],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        const parsed = new URL(normalized, 'http://localhost');
        const slug = parsed.searchParams.get('slug');
        return makeJsonResponse({
          primary_location_id: slug === 'beta' ? 33 : 11,
          locations: slug === 'beta'
            ? [{ location_id: 33, name: 'Main Branch', address_line: 'Beta Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true }]
            : [{ location_id: 11, name: 'Main Branch', address_line: 'Alpha Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true }]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /2 storefronts at this location/i }).length).toBeGreaterThan(0));

    const clusterCallIndex = maplibregl.Marker.mock.calls.findIndex(([options]) => (
      options?.element?.classList?.contains('discovery-result-cluster')
    ));
    expect(clusterCallIndex).toBeGreaterThanOrEqual(0);
    expect(maplibregl.Marker.mock.calls[clusterCallIndex]?.[0]?.anchor).toBe('center');
    expect(maplibregl.Marker.mock.results[clusterCallIndex]?.value?.setLngLat).toHaveBeenCalledWith([122.56, 10.72]);

    fireEvent.click(screen.getAllByRole('button', { name: /2 storefronts at this location/i })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: /Select Alpha Foods at Main Branch/i })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Select Beta Foods at Main Branch/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Select Alpha Foods at Main Branch/i }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Open storefront' })).toBeTruthy();
  });

  it('does not cluster storefronts at the default center when coordinate data is missing', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: [
            {
              tenant_id: 'tenant-1',
              tenant_name: 'Coordinate Missing A',
              slug: 'missing-a',
              storefront_open: true,
              address_line: 'Iloilo City',
              catalog_count: 2
            },
            {
              tenant_id: 'tenant-2',
              tenant_name: 'Coordinate Missing B',
              slug: 'missing-b',
              storefront_open: true,
              address_line: 'Iloilo City',
              catalog_count: 1
            }
          ],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ primary_location_id: null, locations: [] });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Coordinate Missing A/i)).toBeTruthy());

    const markerAtDefaultCenter = maplibregl.Marker.mock.results.some((result) => (
      result?.value?.setLngLat?.mock?.calls?.some(([coordinate]) => (
        Array.isArray(coordinate)
        && Number(coordinate[0]).toFixed(6) === '122.562100'
        && Number(coordinate[1]).toFixed(6) === '10.720200'
      ))
    ));
    expect(markerAtDefaultCenter).toBe(false);
  });

  it('does not render provisioned placeholder storefront coordinates as authoritative map pins', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: [
            {
              tenant_id: 'tenant-1',
              tenant_name: 'Placeholder A',
              slug: 'placeholder-a',
              storefront_open: true,
              location_id: 1,
              location_name: 'Main Branch',
              address_line: 'Iloilo City',
              latitude: 10.699817,
              longitude: 122.559893,
              catalog_count: 2
            },
            {
              tenant_id: 'tenant-2',
              tenant_name: 'Placeholder B',
              slug: 'placeholder-b',
              storefront_open: true,
              location_id: 1,
              location_name: 'Main Branch',
              address_line: 'Iloilo City',
              latitude: 10.699817,
              longitude: 122.559893,
              catalog_count: 1
            },
            {
              tenant_id: 'tenant-3',
              tenant_name: 'Configured Store',
              slug: 'configured-store',
              storefront_open: true,
              location_id: 7,
              location_name: 'Downtown',
              address_line: 'Downtown Road',
              latitude: 10.7001938,
              longitude: 122.5623094,
              catalog_count: 1
            }
          ],
          pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ primary_location_id: null, locations: [] });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Placeholder A/i)).toBeTruthy());

    const markerAtProvisionedDefault = maplibregl.Marker.mock.results.some((result) => (
      result?.value?.setLngLat?.mock?.calls?.some(([coordinate]) => (
        Array.isArray(coordinate)
        && Number(coordinate[0]).toFixed(6) === '122.559893'
        && Number(coordinate[1]).toFixed(6) === '10.699817'
      ))
    ));
    expect(markerAtProvisionedDefault).toBe(false);
    const markerAtConfiguredCoordinate = maplibregl.Marker.mock.results.some((result) => (
      result?.value?.setLngLat?.mock?.calls?.some(([coordinate]) => (
        Array.isArray(coordinate)
        && Number(coordinate[0]).toFixed(6) === '122.562309'
        && Number(coordinate[1]).toFixed(6) === '10.700194'
      ))
    ));
    expect(markerAtConfiguredCoordinate).toBe(true);
  });

  it('discloses cluster overflow when more than eight storefronts share coordinates', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: Array.from({ length: 10 }, (_, index) => ({
            tenant_id: `tenant-${index + 1}`,
            tenant_name: `Store ${index + 1}`,
            slug: `store-${index + 1}`,
            storefront_open: true,
            address_line: 'Shared Address',
            latitude: 10.72,
            longitude: 122.56,
            catalog_count: 1,
            location_id: index + 1
          })),
          pagination: { page: 1, limit: 100, total: 10, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 1,
          locations: [{ location_id: 1, name: 'Main Branch', address_line: 'Shared Address', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true }]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /10 storefronts at this location/i }).length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole('button', { name: /10 storefronts at this location/i })[0]);
    await waitFor(() => expect(screen.getByText('Showing all 10 storefronts at this exact pin')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Select Store 10 at Main Branch/i })).toBeTruthy();
  });

  it('updates featured local merchants pagination dots when carousel arrows are clicked', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(function scrollTo(options = {}) {
        this.scrollLeft = Number(options.left || 0);
        this.dispatchEvent(new Event('scroll'));
      })
    });

    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: Array.from({ length: 10 }, (_, index) => ({
            tenant_id: `tenant-${index + 1}`,
            tenant_name: `Store ${index + 1}`,
            slug: `store-${index + 1}`,
            storefront_open: true,
            storefront_categories: ['services'],
            address_line: 'Shared Address',
            latitude: 10.72 + (index * 0.001),
            longitude: 122.56 + (index * 0.001),
            catalog_count: 1,
            location_id: index + 1
          })),
          pagination: { page: 1, limit: 100, total: 10, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      return makeJsonResponse({});
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Show featured merchants page 5' })).toBeTruthy());

    const firstPageDot = screen.getByRole('button', { name: 'Show featured merchants page 1' });
    const secondPageDot = screen.getByRole('button', { name: 'Show featured merchants page 2' });
    expect(firstPageDot.getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('button', { name: 'Show next featured merchants' }));
    await waitFor(() => expect(secondPageDot.getAttribute('aria-current')).toBe('page'));
    expect(firstPageDot.getAttribute('aria-current')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show previous featured merchants' }));
    await waitFor(() => expect(firstPageDot.getAttribute('aria-current')).toBe('page'));
  });

  it('falls back to the storefront initial when profile image fails to load', async () => {
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
              storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
              storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png',
              match_reasons: ['store']
            }
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/storefront/discovery/alpha')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          location_id: 11,
          address_line: 'Iloilo City',
          storefront_open: true,
          catalog_count: 2,
          storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
          storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ locations: [], primary_location_id: null });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByAltText(/Alpha Foods profile/i).length).toBeGreaterThan(0);
    });

    const profileImage = screen.getAllByAltText(/Alpha Foods profile/i)[0];
    fireEvent.error(profileImage);

    await waitFor(() => {
      expect(screen.getAllByText('A').length).toBeGreaterThan(0);
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
    await user.click(screen.getByTitle('Use my current location'));

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
    await user.click(screen.getByTitle('Use my current location'));

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
