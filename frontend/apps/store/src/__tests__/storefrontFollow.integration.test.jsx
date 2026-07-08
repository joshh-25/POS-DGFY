/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../main.jsx';

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('maplibre-gl', () => {
  function PopupApi() {
    return {
    setDOMContent: vi.fn().mockReturnThis(),
    setHTML: vi.fn().mockReturnThis(),
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis()
    };
  }
  function MarkerApi() {
    return {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    getElement: vi.fn(() => document.createElement('div'))
    };
  }
  function MapApi() {
    return {
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

const makeResponse = (payload, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => payload
});

describe('storefront follow integration', () => {
  let fetchMock;

  beforeEach(() => {
    window.history.pushState({}, '', '/tenant-store/alpha-store');
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = '';
    window.__SKU_STOREFRONT_AUTH_TOKEN__ = '';
    fetchMock = vi.fn(async (url, options = {}) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery/alpha-store')) {
        return makeResponse({
          data: {
            slug: 'alpha-store',
            tenant_name: 'Alpha Foods',
            location_id: 11,
            location_name: 'Main',
            address_line: 'Iloilo City',
            storefront_open: true,
            catalog_count: 2,
            storefront_ui_v2_enabled: true,
            storefront_follow_enabled: true,
            storefront_share_enabled: false,
            workflow_mode: 'services'
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeResponse({
          data: {
            primary_location_id: 11,
            locations: []
          }
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeResponse({ data: { items: [] } });
      }
      if (normalized.includes('/api/v1/store/follow/status')) {
        return makeResponse({ data: { storefront_slug: 'alpha-store', is_following: false, followers_count: 3 } });
      }
      if (normalized.endsWith('/api/v1/store/follow') && String(options.method || 'GET').toUpperCase() === 'POST') {
        return makeResponse({ data: { storefront_slug: 'alpha-store', is_following: true, followers_count: 4 } });
      }
      if (normalized.endsWith('/api/v1/store/follow') && String(options.method || 'GET').toUpperCase() === 'DELETE') {
        return makeResponse({ data: { storefront_slug: 'alpha-store', is_following: false, followers_count: 3 } });
      }
      return makeResponse({ data: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = '';
    window.__SKU_STOREFRONT_AUTH_TOKEN__ = '';
  });

  it('transitions Follow -> Following -> Follow and updates count', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('3 followers').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Follow this storefront' }).getAttribute('title')).toBe('Follow');
    }, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: 'Follow this storefront' }));
    await waitFor(() => {
      expect(screen.getAllByText('4 followers').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Unfollow this storefront' }).getAttribute('title')).toBe('Following');
    }, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: 'Unfollow this storefront' }));
    await waitFor(() => {
      expect(screen.getAllByText('3 followers').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Follow this storefront' }).getAttribute('title')).toBe('Follow');
    }, { timeout: 8000 });
  }, 10000);

  it('repairs stale invalid visitor ids before loading follow status', async () => {
    window.localStorage.setItem('dgfy_storefront_visitor_id', 'stale visitor id with spaces');

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('3 followers').length).toBeGreaterThan(0);
    }, { timeout: 8000 });

    const statusCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/v1/store/follow/status'));
    expect(statusCall).toBeTruthy();
    const requestUrl = new URL(String(statusCall[0]));
    const repairedVisitorId = requestUrl.searchParams.get('visitor_id');
    expect(repairedVisitorId).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    expect(repairedVisitorId).not.toBe('stale visitor id with spaces');
    expect(window.localStorage.getItem('dgfy_storefront_visitor_id')).toBe(repairedVisitorId);
  }, 10000);

  it('keeps follow status and follow actions on the public visitor-id contract', async () => {
    window.sessionStorage.setItem('dgfy_store_customer_token', 'stale-store-token');
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow this storefront' })).toBeTruthy();
    }, { timeout: 8000 });

    const statusCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/v1/store/follow/status'));
    expect(statusCall).toBeTruthy();
    expect(statusCall[1]?.headers?.Authorization).toBeUndefined();
    expect(statusCall[1]?.credentials).toBe('omit');

    await user.click(screen.getByRole('button', { name: 'Follow this storefront' }));

    await waitFor(() => {
      const followCall = fetchMock.mock.calls.find(([url, options]) => (
        String(url).endsWith('/api/v1/store/follow')
        && String(options?.method || '').toUpperCase() === 'POST'
      ));
      expect(followCall).toBeTruthy();
      expect(followCall[1]?.headers?.Authorization).toBeUndefined();
      expect(followCall[1]?.credentials).toBe('omit');
    }, { timeout: 8000 });
  }, 10000);

  it('renders explicit 429 follow errors', async () => {
    fetchMock.mockImplementation(async (url, options = {}) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery/alpha-store')) {
        return makeResponse({
          data: {
            slug: 'alpha-store',
            tenant_name: 'Alpha Foods',
            location_id: 11,
            address_line: 'Iloilo City',
            storefront_open: true,
            catalog_count: 2,
            storefront_ui_v2_enabled: true,
            storefront_follow_enabled: true,
            storefront_share_enabled: false,
            workflow_mode: 'services'
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeResponse({ data: { primary_location_id: 11, locations: [] } });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeResponse({ data: { items: [] } });
      }
      if (normalized.includes('/api/v1/store/follow/status')) {
        return makeResponse({ data: { storefront_slug: 'alpha-store', is_following: true, followers_count: 1 } });
      }
      if (normalized.endsWith('/api/v1/store/follow') && String(options.method || '').toUpperCase() === 'DELETE') {
        return makeResponse({ success: false, message: 'rate limited' }, false, 429);
      }
      if (normalized.endsWith('/api/v1/store/follow') && String(options.method || '').toUpperCase() === 'POST') {
        return makeResponse({ success: false, message: 'slug not found' }, false, 404);
      }
      return makeResponse({ data: {} });
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unfollow this storefront' })).toBeTruthy();
    }, { timeout: 8000 });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unfollow this storefront' }).getAttribute('title')).toBe('Following');
    }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Unfollow this storefront' }));
    await waitFor(() => {
      expect(screen.getAllByText('Too many follow requests. Please wait and retry.').length).toBeGreaterThan(0);
    }, { timeout: 8000 });
  }, 10000);

  it('renders explicit 404 follow errors', async () => {
    fetchMock.mockImplementation(async (url, options = {}) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery/alpha-store')) {
        return makeResponse({
          data: {
            slug: 'alpha-store',
            tenant_name: 'Alpha Foods',
            location_id: 11,
            address_line: 'Iloilo City',
            storefront_open: true,
            catalog_count: 2,
            storefront_ui_v2_enabled: true,
            storefront_follow_enabled: true,
            storefront_share_enabled: false,
            workflow_mode: 'services'
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeResponse({ data: { primary_location_id: 11, locations: [] } });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeResponse({ data: { items: [] } });
      }
      if (normalized.includes('/api/v1/store/follow/status')) {
        return makeResponse({ data: { storefront_slug: 'alpha-store', is_following: false, followers_count: 0 } });
      }
      if (normalized.endsWith('/api/v1/store/follow') && String(options.method || '').toUpperCase() === 'POST') {
        return makeResponse({ success: false, message: 'slug not found' }, false, 404);
      }
      return makeResponse({ data: {} });
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow this storefront' })).toBeTruthy();
    }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Follow this storefront' }));
    await waitFor(() => {
      expect(screen.getAllByText('Storefront is unavailable for follow.').length).toBeGreaterThan(0);
    }, { timeout: 8000 });
  }, 10000);
});
