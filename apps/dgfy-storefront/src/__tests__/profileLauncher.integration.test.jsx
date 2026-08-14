/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../main.jsx';
import { BrowserRouter } from 'react-router-dom';

vi.mock('maplibre-gl', () => {
  function PopupApi() {
    const api = {
      node: null,
      on: vi.fn(() => api),
      off: vi.fn(() => api),
      isOpen: vi.fn(() => false),
      setDOMContent: vi.fn((node) => {
        api.node = node;
        return api;
      }),
      setHTML: vi.fn(() => api),
      setLngLat: vi.fn(() => api),
      addTo: vi.fn(() => api),
      remove: vi.fn(() => api)
    };
    return api;
  }
  function MarkerApi(options = {}) {
    const element = options.element || document.createElement('div');
    const api = {
      setLngLat: vi.fn(() => api),
      addTo: vi.fn((map) => {
        if (map?.container && !element.isConnected) map.container.appendChild(element);
        return api;
      }),
      remove: vi.fn(() => api),
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

const makeJsonResponse = (data, ok = true) => ({
  ok,
  json: async () => ({ data })
});

const makeErrorResponse = ({ status = 500, message = 'Request failed', errorCode = 'INTERNAL_ERROR', errors = {} } = {}) => ({
  ok: false,
  status,
  json: async () => ({
    success: false,
    message,
    error_code: errorCode,
    errors
  })
});

describe('storefront profile launcher', () => {
  let fetchMock;

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    window.localStorage.clear();
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = '';
    // The default fetchMock below always resolves /auth/me to a signed-in
    // account, i.e. this file's fixture models a cookie-backed session. The
    // real backend always issues `sku_csrf_token` (readable, non-httpOnly)
    // alongside that session -- see backend/src/utils/browserSessionCookies.js
    // issueCsrfToken -- which useStorefrontSession now checks before firing
    // the probe at all (hasDgfyBrowserSessionHint in dgfyAuthService.js).
    // Without this, every test here would skip the probe as if anonymous.
    document.cookie = 'sku_csrf_token=test-hint';
    fetchMock = vi.fn(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: [
            {
              tenant_id: 'tenant-1',
              tenant_name: 'Alpha Foods',
              slug: 'alpha',
              workflow_mode: 'msme',
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
            pin_scope: 'all_matching_branches',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/storefront/discovery/')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          workflow_mode: 'msme',
          location_id: 11,
          address_line: 'Iloilo City',
          storefront_open: true,
          catalog_count: 2
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ locations: [], primary_location_id: null });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      if (normalized.includes('/api/v1/dgfy/auth/me')) {
        return makeJsonResponse({
          account: {
            id: 'acct-1',
            first_name: 'Kate',
            last_name: 'Coleen',
            email: 'kate@example.com'
          }
        });
      }
      if (normalized.includes('/api/v1/dgfy/customer/dashboard')) {
        return makeJsonResponse({
          account: {
            id: 'acct-1',
            first_name: 'Kate',
            last_name: 'Coleen',
            email: 'kate@example.com'
          },
          orders: [
            {
              activity_id: 'order-1',
              reference: 'ORD-001',
              store_name: 'Alpha Foods',
              status: 'preparing',
              status_label: 'Preparing',
              occurred_at: '2026-05-28T08:00:00.000Z',
              total_amount: 189
            }
          ],
          bookings: [],
          addresses: []
        });
      }
      if (normalized.includes('/api/v1/dgfy/customer/loyalty')) {
        return makeJsonResponse({ loyalty: { balance: 0, transactions: [] } });
      }
      return makeJsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = '';
    document.cookie = 'sku_csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('does not show the profile launcher entry on the main discovery page', async () => {
    window.localStorage.setItem('dgfy_store_recent_stores', JSON.stringify([
      {
        slug: 'alpha',
        tenant_name: 'Alpha Foods',
        address_line: 'Iloilo City'
      }
    ]));
    window.localStorage.setItem('dgfy_store_last_store_slug', 'alpha');

    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /^Profile$/i })).toBeNull();
  }, 10000);

  it('keeps the storefront profile action usable from a store page', async () => {
    window.history.pushState({}, '', '/tenant-store/alpha');
    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Issue #282, Phase G: the hero (and its header nav, where "Profile"
    // lives) is now lazy-loaded -- findAllByRole waits for it instead of
    // assuming it's already mounted synchronously after the fetch.
    const profileButton = (await screen.findAllByRole(
      'button',
      { name: /^Profile$/i },
      { timeout: 5000 }
    ))
      .filter((button) => window.getComputedStyle(button).pointerEvents !== 'none')
      .at(-1);
    expect(profileButton).toBeTruthy();
    await user.click(profileButton);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/map-dgfy/account');
      expect(screen.getByTestId('dgfy-customer-account-page')).toBeTruthy();
      expect(fetchMock).toHaveBeenCalled();
    });
  }, 10000);

  it('keeps the signed-in storefront customer access visible when account activity exists', async () => {
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = 'dgfy-test-token';
    window.history.pushState({}, '', '/tenant-store/alpha');
    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Profile$/i }).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  }, 10000);

  it('keeps the storefront shell usable when catalog loading fails', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({ stores: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } });
      }
      if (normalized.includes('/api/v1/storefront/discovery/')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          workflow_mode: 'msme',
          location_id: 11,
          address_line: 'Iloilo City',
          storefront_open: true,
          catalog_count: 2
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ locations: [], primary_location_id: null });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeErrorResponse({
          status: 500,
          message: 'Failed to list storefront catalog',
          errorCode: 'STORE_CATALOG_RUNTIME_ERROR',
          errors: { catalog_error_type: 'runtime_failure' }
        });
      }
      return makeJsonResponse({});
    });

    window.history.pushState({}, '', '/tenant-store/alpha');
    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Back to Discovery/i }).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /Order Now/i })).toBeTruthy();
    });
  }, 10000);
});
