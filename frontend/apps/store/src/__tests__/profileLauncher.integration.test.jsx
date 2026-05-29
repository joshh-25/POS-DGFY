/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../main.jsx';

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

describe('storefront profile launcher', () => {
  let fetchMock;

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    window.localStorage.clear();
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

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /^Profile$/i })).toBeNull();
  });

  it('opens account panel from the profile launcher button on a store page', async () => {
    window.history.pushState({}, '', '/tenant-store/alpha');
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getAllByText('Alpha Foods').length).toBeGreaterThan(0);
    });

    const profileButton = screen.getAllByRole('button', { name: /^Profile$/i })
      .find((button) => window.getComputedStyle(button).pointerEvents !== 'none');
    expect(profileButton).toBeTruthy();
    await user.click(profileButton);

    await waitFor(() => {
      expect(screen.getByText('DGFY Account')).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign in to dgfy/i })).toBeTruthy();
    });
  });

  it('shows an active order badge on storefront headers for signed-in customers with in-progress orders', async () => {
    window.localStorage.setItem('dgfy_customer_account_token', 'dgfy-test-token');
    window.history.pushState({}, '', '/tenant-store/alpha');
    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByLabelText(/1 active order/i)).toBeTruthy();
    });
  });
});
