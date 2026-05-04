/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../main.jsx';

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
            storefront_share_enabled: false
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
  });

  it('transitions Follow -> Following -> Follow and updates count', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('3 follower(s)')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Follow this storefront' }).textContent).toBe('Follow');
    });

    await user.click(screen.getByRole('button', { name: 'Follow this storefront' }));
    await waitFor(() => {
      expect(screen.getByText('4 follower(s)')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Follow this storefront' }).textContent).toBe('Following');
    });

    await user.click(screen.getByRole('button', { name: 'Follow this storefront' }));
    await waitFor(() => {
      expect(screen.getByText('3 follower(s)')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Follow this storefront' }).textContent).toBe('Follow');
    });
  });

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
            storefront_share_enabled: false
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
      expect(screen.getByRole('button', { name: 'Follow this storefront' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow this storefront' }).textContent).toBe('Following');
    });
    await user.click(screen.getByRole('button', { name: 'Follow this storefront' }));
    await waitFor(() => {
      expect(screen.getByText('Too many follow requests. Please wait and retry.')).toBeTruthy();
    });
  });

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
            storefront_share_enabled: false
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
    });
    await user.click(screen.getByRole('button', { name: 'Follow this storefront' }));
    await waitFor(() => {
      expect(screen.getByText('Storefront is unavailable for follow.')).toBeTruthy();
    });
  });
});
