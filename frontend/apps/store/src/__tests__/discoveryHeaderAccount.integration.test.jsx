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

const makeJsonResponse = (data, ok = true, status = ok ? 200 : 401) => ({
  ok,
  status,
  json: async () => ({ data })
});

const makeErrorResponse = (message = 'DGFY account authentication is required.', status = 401) => ({
  ok: false,
  status,
  json: async () => ({
    success: false,
    data: null,
    message
  })
});

describe('discovery header customer account actions', () => {
  let fetchMock;
  let dgfyMeResponse;
  let locationUrl;
  let mockLocation;

  beforeEach(() => {
    locationUrl = new URL('http://localhost/');
    mockLocation = {
      ancestorOrigins: undefined,
      assign: vi.fn((value) => {
        locationUrl = new URL(String(value || ''), locationUrl.toString());
      }),
      reload: vi.fn(),
      replace: vi.fn((value) => {
        locationUrl = new URL(String(value || ''), locationUrl.toString());
      }),
      toString: () => locationUrl.toString(),
      get href() { return locationUrl.toString(); },
      set href(value) { locationUrl = new URL(String(value || ''), locationUrl.toString()); },
      get origin() { return locationUrl.origin; },
      get protocol() { return locationUrl.protocol; },
      get host() { return locationUrl.host; },
      get hostname() { return locationUrl.hostname; },
      get port() { return locationUrl.port; },
      get pathname() { return locationUrl.pathname; },
      set pathname(value) { locationUrl = new URL(String(value || ''), locationUrl.origin); },
      get search() { return locationUrl.search; },
      set search(value) { locationUrl.search = String(value || ''); },
      get hash() { return locationUrl.hash; },
      set hash(value) { locationUrl.hash = String(value || ''); }
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: mockLocation
    });
    vi.spyOn(window.history, 'pushState').mockImplementation((_, __, url) => {
      if (url) {
        locationUrl = new URL(String(url), locationUrl.origin);
      }
    });
    vi.spyOn(window.history, 'replaceState').mockImplementation((_, __, url) => {
      if (url) {
        locationUrl = new URL(String(url), locationUrl.origin);
      }
    });
    window.history.pushState({}, '', '/');
    window.localStorage.clear();
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = '';
    dgfyMeResponse = null;
    fetchMock = vi.fn(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: [],
          pagination: { page: 1, limit: 100, total: 0, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'all_matching_branches',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/dgfy/legal-terms/current')) {
        return makeJsonResponse({
          flows: {
            account_registration: {
              snapshot: {
                terms_version: 'terms-v1',
                privacy_version: 'privacy-v1',
                marketplace_terms_version: 'market-v1'
              }
            }
          }
        });
      }
      if (normalized.includes('/api/v1/dgfy/auth/me')) {
        return dgfyMeResponse || makeErrorResponse();
      }
      if (normalized.includes('/api/v1/dgfy/customer/dashboard')) {
        return makeJsonResponse({
          account: {
            id: 'acct-1',
            first_name: 'Kate',
            last_name: 'Coleen',
            email: 'kate@example.com'
          },
          orders: [],
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
  });

  it('shows separate customer auth and business registration actions on discovery header', async () => {
    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /log in \/ sign up/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /register your business/i }).length).toBeGreaterThan(0);
  }, 10000);

  it('routes the discovery auth action to the canonical DGFY auth page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /log in \/ sign up/i }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/dgfy/auth');
      expect(window.location.search).toContain('intent=customer');
      expect(window.location.search).toContain('mode=sign-in');
    });
  }, 10000);

  it('switches discovery header to My Account when a DGFY customer session exists', async () => {
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = 'dgfy-test-token';
    dgfyMeResponse = makeJsonResponse({
      account: {
        id: 'acct-1',
        first_name: 'Kate',
        last_name: 'Coleen',
        email: 'kate@example.com'
      }
    });
    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /kate/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /log in \/ sign up/i })).toBeNull();
  }, 10000);

  it('opens the signed-in account surface from the discovery return query', async () => {
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = 'dgfy-test-token';
    window.history.pushState({}, '', '/map-dgfy?dgfy_account=1');
    dgfyMeResponse = makeJsonResponse({
      account: {
        id: 'acct-1',
        first_name: 'Kate',
        last_name: 'Coleen',
        email: 'kate@example.com'
      }
    });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to discovery/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
      expect(screen.getByText(/overview/i)).toBeTruthy();
    });
    expect(window.location.pathname).toBe('/map-dgfy');
    expect(window.location.search).not.toContain('dgfy_account');
  }, 10000);

  it('rehydrates the discovery account state from a cookie-backed DGFY session after memory token loss', async () => {
    dgfyMeResponse = makeJsonResponse({
      account: {
        id: 'acct-cookie',
        first_name: 'Cookie',
        last_name: 'Customer',
        email: 'cookie@example.com'
      }
    });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cookie/i })).toBeTruthy();
    });

    const meCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/v1/dgfy/auth/me'));
    expect(meCall).toBeTruthy();
    expect(meCall[1]?.credentials).toBe('include');
    expect(meCall[1]?.headers?.Authorization).toBeUndefined();
    expect(window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__).toBe('');
  }, 10000);

  it('rehydrates the signed-in discovery account surface from a query return without using handoff exchange', async () => {
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = 'dgfy-handoff-session';
    window.history.pushState({}, '', '/map-dgfy?dgfy_account=1');
    const user = userEvent.setup();
    dgfyMeResponse = makeJsonResponse({
      account: {
        id: 'acct-handoff',
        first_name: 'Handoff',
        last_name: 'Customer',
        email: 'handoff@example.com'
      }
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /handoff/i })).toBeTruthy();
    });

    expect(window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__).toBe('dgfy-handoff-session');
    expect(window.location.pathname).toBe('/map-dgfy');
    expect(window.location.search).not.toContain('dgfy_account');

    const exchangeCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/v1/dgfy/auth/handoff/exchange'));
    expect(exchangeCall).toBeUndefined();

    await user.click(screen.getByRole('button', { name: /handoff/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to discovery/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in \/ sign up/i })).toBeTruthy();
    });
  }, 10000);

  it('logs out a cookie-backed DGFY session even when no bearer token is in memory', async () => {
    window.history.pushState({}, '', '/map-dgfy/account');
    dgfyMeResponse = makeJsonResponse({
      account: {
        id: 'acct-cookie',
        first_name: 'Cookie',
        last_name: 'Customer',
        email: 'cookie@example.com'
      }
    });
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to discovery/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      const logoutCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/v1/dgfy/auth/logout'));
      expect(logoutCall).toBeTruthy();
      expect(logoutCall[1]?.method).toBe('POST');
      expect(logoutCall[1]?.credentials).toBe('include');
      expect(logoutCall[1]?.headers?.Authorization).toBeUndefined();
      expect(screen.getByRole('button', { name: /log in \/ sign up/i })).toBeTruthy();
    });
  }, 10000);

  it('returns the standalone account page to discovery after sign out', async () => {
    window.history.pushState({}, '', '/map-dgfy/account');
    dgfyMeResponse = makeJsonResponse({
      account: {
        id: 'acct-standalone',
        first_name: 'Standalone',
        last_name: 'Customer',
        email: 'standalone@example.com'
      }
    });
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to discovery/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
      expect(screen.getByText(/overview/i)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /back to discovery/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/map-dgfy');
      expect(screen.getByRole('button', { name: /log in \/ sign up/i })).toBeTruthy();
    });
    const logoutCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/v1/dgfy/auth/logout'));
    expect(logoutCall).toBeTruthy();
  }, 10000);
});
