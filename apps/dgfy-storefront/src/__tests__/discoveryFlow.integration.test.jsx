/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import maplibregl from 'maplibre-gl';
import { App } from '../main.jsx';
import { BrowserRouter } from 'react-router-dom';
import { useStorefrontStore } from '../store/useStorefrontStore.js';

vi.mock('maplibre-gl', () => {
  function PopupApi(options = {}) {
    const handlers = {};
    const api = {
      options,
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
    const sources = new Map();
    const layers = new Map();
    const images = new Set();
    const layerHandlers = {};
    const sourceApi = (source = {}) => {
      const sourceInstance = { ...source };
      sourceInstance.setData = vi.fn((data) => {
        sourceInstance.data = data;
      });
      return sourceInstance;
    };
    const api = {
      container: options.container,
      on: vi.fn((eventName, layerOrHandler, maybeHandler) => {
        if (typeof layerOrHandler === 'string' && typeof maybeHandler === 'function') {
          const key = `${eventName}:${layerOrHandler}`;
          layerHandlers[key] = layerHandlers[key] || [];
          layerHandlers[key].push(maybeHandler);
        }
        return api;
      }),
      once: vi.fn((eventName, handler) => {
        if (typeof handler === 'function') handler();
        return api;
      }),
      off: vi.fn((eventName, layerOrHandler, maybeHandler) => {
        if (typeof layerOrHandler === 'string' && typeof maybeHandler === 'function') {
          const key = `${eventName}:${layerOrHandler}`;
          layerHandlers[key] = (layerHandlers[key] || []).filter((entry) => entry !== maybeHandler);
        }
        return api;
      }),
      flyTo: vi.fn().mockReturnThis(),
      fitBounds: vi.fn().mockReturnThis(),
      getZoom: vi.fn(() => 13),
      resize: vi.fn(),
      remove: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} })),
      // #475 RF-1: a real DOM node attached under the map's own container, not a
      // detached stub -- StoresMap.jsx and DiscoveryHeroMapStage.jsx now portal
      // their overlay controls (e.g. "Use current location") into whatever this
      // returns via ReactDOM.createPortal, which needs an actual DOM node, and it
      // has to be reachable from document.body for `screen.getByRole` etc. to see
      // the portaled content the same way they'd see real MapLibre's canvas
      // container (a real descendant of the map's mount point).
      getCanvasContainer: vi.fn(() => {
        const el = document.createElement('div');
        options.container?.appendChild?.(el);
        return el;
      }),
      isStyleLoaded: vi.fn(() => true),
      addSource: vi.fn((id, source) => {
        sources.set(id, sourceApi(source));
        return api;
      }),
      getSource: vi.fn((id) => sources.get(id)),
      addLayer: vi.fn((layer) => {
        layers.set(layer.id, layer);
        return api;
      }),
      getLayer: vi.fn((id) => layers.get(id)),
      hasImage: vi.fn((id) => images.has(id)),
      addImage: vi.fn((id) => {
        images.add(id);
        return api;
      }),
      __sources: sources,
      __layers: layers,
      __emitLayer: (eventName, layerId, feature) => {
        const key = `${eventName}:${layerId}`;
        (layerHandlers[key] || []).forEach((handler) => handler({
          preventDefault: vi.fn(),
          features: feature ? [feature] : []
        }));
      }
    };
    return {
      ...api
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

const isStoreCatalogRequest = (url) => {
  const normalized = String(url || '');
  return normalized.includes('/api/v1/store/catalog?')
    || normalized.includes('/api/v1/store/services/catalog?');
};

const dgfyLegalTerms = {
  flows: {
    account_registration: {
      snapshot: {
        terms_version: 'dgfy-account-terms-2026-06-08',
        privacy_version: 'dgfy-privacy-2026-06-08',
        marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08',
        acknowledgement_text: 'I agree to the DGFY Terms, Privacy Policy, and marketplace account terms.'
      },
      documents: [
        { key: 'accountTerms', title: 'DGFY Account Terms', version: 'dgfy-account-terms-2026-06-08', summary: 'Account terms', href: '/legal/dgfy-account-terms' },
        { key: 'privacy', title: 'DGFY Privacy Policy', version: 'dgfy-privacy-2026-06-08', summary: 'Privacy terms', href: '/privacy' },
        { key: 'marketplaceTerms', title: 'DGFY Marketplace Provider Terms', version: 'dgfy-marketplace-provider-2026-06-08', summary: 'Marketplace terms', href: '/legal/dgfy-marketplace-provider-terms' }
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

const installNavigationLocationMock = () => {
  const originalLocation = window.location;
  let locationUrl = new URL(originalLocation.href);
  const mockLocation = {
    ancestorOrigins: undefined,
    assign: vi.fn((value) => { locationUrl = new URL(String(value || ''), locationUrl); }),
    reload: vi.fn(),
    replace: vi.fn((value) => { locationUrl = new URL(String(value || ''), locationUrl); }),
    toString: () => locationUrl.toString(),
    get href() { return locationUrl.toString(); },
    set href(value) { locationUrl = new URL(String(value || ''), locationUrl); },
    get origin() { return locationUrl.origin; },
    get protocol() { return locationUrl.protocol; },
    get host() { return locationUrl.host; },
    get hostname() { return locationUrl.hostname; },
    get port() { return locationUrl.port; },
    get pathname() { return locationUrl.pathname; },
    get search() { return locationUrl.search; },
    get hash() { return locationUrl.hash; }
  };
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: mockLocation });
  return () => Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
};

const getMapApis = () => maplibregl.Map.mock.results
  .map((result) => result?.value)
  .filter(Boolean);

const getMapViewportCallCount = () => getMapApis().reduce((total, mapApi) => (
  total + (mapApi.flyTo?.mock?.calls?.length || 0) + (mapApi.fitBounds?.mock?.calls?.length || 0)
), 0);

const getLatestMapApi = () => getMapApis().at(-1);

const getDiscoveryPinFeatures = () => {
  const source = getLatestMapApi()?.getSource?.('dgfy-discovery-pins');
  return source?.data?.features || [];
};

const getDiscoveryUserFeatures = () => {
  const source = getLatestMapApi()?.getSource?.('dgfy-discovery-user-location');
  return source?.data?.features || [];
};

const waitForDiscoveryPinFeatures = async (count) => {
  await waitFor(() => expect(getDiscoveryPinFeatures().length).toBe(count));
  return getDiscoveryPinFeatures();
};

const emitDiscoveryPinClick = (feature) => {
  const mapApi = getLatestMapApi();
  mapApi?.__emitLayer('click', 'dgfy-discovery-pin-symbols', feature);
};

const emitDiscoveryPinMouseEnter = (feature) => {
  const mapApi = getLatestMapApi();
  mapApi?.__emitLayer('mouseenter', 'dgfy-discovery-pin-symbols', feature);
};

const emitDiscoveryPinMouseLeave = (feature) => {
  const mapApi = getLatestMapApi();
  mapApi?.__emitLayer('mouseleave', 'dgfy-discovery-pin-symbols', feature);
};

const originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'geolocation');
const originalPermissionsDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'permissions');

const restoreNavigatorProperty = (property, descriptor) => {
  if (descriptor) {
    Object.defineProperty(window.navigator, property, descriptor);
    return;
  }
  delete window.navigator[property];
};

describe('storefront discovery integration flow', () => {
  let fetchMock;

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    const MockImage = class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }
      set src(_value) {
        this._src = _value;
        setTimeout(() => this.onload?.(), 0);
      }
      get src() {
        return this._src;
      }
    };
    vi.stubGlobal('Image', MockImage);
    window.Image = MockImage;
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
      if (isStoreCatalogRequest(normalized)) {
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
    useStorefrontStore.getState().reset();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024
    });
    window.localStorage.clear();
    window.__SKU_DGFY_CUSTOMER_AUTH_TOKEN__ = '';
    restoreNavigatorProperty('geolocation', originalGeolocationDescriptor);
    restoreNavigatorProperty('permissions', originalPermissionsDescriptor);
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
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalled());
    const mapOptions = maplibregl.Map.mock.calls.at(-1)?.[0] || {};

    expect(mapOptions.bearing).toBe(0);
    expect(mapOptions.pitch).toBe(0);
  });

  it('renders the per-mode delivery from-price on discovery store cards (#1333)', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        const parsed = new URL(normalized, 'http://localhost');
        const search = parsed.searchParams.get('search');
        return makeJsonResponse({
          stores: search === 'delivery'
            ? [
                {
                  tenant_id: 'tenant-fixed',
                  tenant_name: 'Fixed Fee Foods',
                  slug: 'fixed-fee-foods',
                  storefront_open: true,
                  location_id: null,
                  location_name: null,
                  address_line: null,
                  latitude: null,
                  longitude: null,
                  catalog_count: 2,
                  store_has_no_location: true,
                  map_publication_disabled: true,
                  match_reasons: ['item'],
                  matching_item_count: 1,
                  store_delivery_fee: 49,
                  delivery_fee_mode: 'fixed'
                },
                {
                  tenant_id: 'tenant-calculated',
                  tenant_name: 'Calculated Kitchen',
                  slug: 'calculated-kitchen',
                  storefront_open: true,
                  location_id: null,
                  location_name: null,
                  address_line: null,
                  latitude: null,
                  longitude: null,
                  catalog_count: 2,
                  store_has_no_location: true,
                  map_publication_disabled: true,
                  match_reasons: ['item'],
                  matching_item_count: 1,
                  store_delivery_fee: 25,
                  delivery_fee_mode: 'calculated'
                },
                {
                  tenant_id: 'tenant-free',
                  tenant_name: 'Free Delivery Diner',
                  slug: 'free-delivery-diner',
                  storefront_open: true,
                  location_id: null,
                  location_name: null,
                  address_line: null,
                  latitude: null,
                  longitude: null,
                  catalog_count: 2,
                  store_has_no_location: true,
                  map_publication_disabled: true,
                  match_reasons: ['item'],
                  matching_item_count: 1,
                  store_delivery_fee: 0,
                  delivery_fee_mode: 'free'
                }
              ]
            : [],
          pagination: { page: 1, limit: 100, total: search === 'delivery' ? 3 : 0, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ locations: [], primary_location_id: null, store_has_no_location: true, map_publication_disabled: true });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'delivery');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    await waitFor(() => expect(screen.getAllByText('Fixed Fee Foods').length).toBeGreaterThan(0));
    expect(screen.getAllByText('₱49 delivery').length).toBeGreaterThan(0);
    expect(screen.getAllByText('From ₱25 delivery').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Free delivery').length).toBeGreaterThan(0);
  });

  it('omits the delivery-fee label when a fixed-mode store has no resolvable store_delivery_fee (#1566 RF-1)', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        const parsed = new URL(normalized, 'http://localhost');
        const search = parsed.searchParams.get('search');
        return makeJsonResponse({
          stores: search === 'delivery'
            ? [
                {
                  tenant_id: 'tenant-unresolved',
                  tenant_name: 'Unresolved Fee Diner',
                  slug: 'unresolved-fee-diner',
                  storefront_open: true,
                  location_id: null,
                  location_name: null,
                  address_line: null,
                  latitude: null,
                  longitude: null,
                  catalog_count: 2,
                  store_has_no_location: true,
                  map_publication_disabled: true,
                  match_reasons: ['item'],
                  matching_item_count: 1,
                  store_delivery_fee: null,
                  delivery_fee_mode: 'fixed'
                }
              ]
            : [],
          pagination: { page: 1, limit: 100, total: search === 'delivery' ? 1 : 0, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ locations: [], primary_location_id: null, store_has_no_location: true, map_publication_disabled: true });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'delivery');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    await waitFor(() => expect(screen.getAllByText('Unresolved Fee Diner').length).toBeGreaterThan(0));
    expect(screen.queryByText('₱0 delivery')).toBeNull();
    expect(screen.queryByText(/delivery$/)).toBeNull();
  });

  it('keeps account access visible when MapLibre cannot initialize WebGL', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    maplibregl.Map.mockImplementationOnce(function MapUnavailable() {
      throw new Error('webgl unavailable');
    });
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, options = {}) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/dgfy/auth/me')) {
        return {
          ok: false,
          json: async () => ({ success: false, message: 'Unauthorized' })
        };
      }
      return defaultFetch(url, options);
    });

    try {
      render(<BrowserRouter><App /></BrowserRouter>);

      expect(await screen.findByText('Store map unavailable')).toBeTruthy();
      expect(await screen.findByText('Log in / Sign up')).toBeTruthy();

      fireEvent.click(screen.getByText('Log in / Sign up'));

      // Customer sign-in now navigates in-app (dgfy.ph/login) instead of
      // doing a full-page redirect out to skupervisor, so we assert on the
      // react-router navigation call rather than window.location.
      await waitFor(() => expect(pushStateSpy).toHaveBeenCalled());
      const [, , to] = pushStateSpy.mock.calls.at(-1);
      const target = new URL(String(to), 'http://localhost/');
      expect(target.pathname).toBe('/login');
      expect(target.searchParams.get('intent')).toBe('customer');
      expect(target.searchParams.get('mode')).toBe('sign-in');
      expect(target.searchParams.get('return_to')).toContain('/map-dgfy/account');
      expect(screen.queryByRole('dialog', { name: 'DGFY Account' })).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('routes the signed-out storefront account action directly to canonical DGFY auth', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, options = {}) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/dgfy/auth/me')) {
        return {
          ok: false,
          json: async () => ({ success: false, message: 'Unauthorized' })
        };
      }
      return defaultFetch(url, options);
    });

    render(<BrowserRouter><App /></BrowserRouter>);

    fireEvent.click(screen.getAllByRole('button', { name: /log in \/ sign up/i })[0]);

    // Customer sign-in now navigates in-app (dgfy.ph/login) instead of
    // doing a full-page redirect out to skupervisor, so we assert on the
    // react-router navigation call rather than window.location.
    await waitFor(() => expect(pushStateSpy).toHaveBeenCalled());
    const [, , to] = pushStateSpy.mock.calls.at(-1);
    const target = new URL(String(to), 'http://localhost/');
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('intent')).toBe('customer');
    expect(target.searchParams.get('mode')).toBe('sign-in');
    expect(target.searchParams.get('return_to')).toContain('/map-dgfy/account');
    expect(screen.queryByRole('dialog', { name: 'DGFY Account' })).toBeNull();
  });

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

    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('/api/v1/dgfy/customer/dashboard'))).toBe(true);
    });
    fireEvent.click((await screen.findAllByRole(
      'button',
      { name: /^profile$/i },
      { timeout: 5000 }
    ))[0]);

    expect(await screen.findByText('My Account')).toBeTruthy();
    expect((await screen.findAllByText('Ada Lovelace')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Track Order' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Reorder Items' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Addresses' }));
    expect(await screen.findByText('Default')).toBeTruthy();
    expect((await screen.findAllByText('Iloilo Home Address')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Use .* for checkout/i })).toBeTruthy();
  }, 10000);

  it('searches only after the current search action is submitted', async () => {
    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);

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

  it('requests all matching branches once without geolocation for normal submitted searches', async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn();
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => {
      expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1);
    });

    const searchInput = screen.getByPlaceholderText('Search products, services or stores nearby...');
    await user.type(searchInput, 'milk');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('search')).toBe('milk');
      expect(params.get('latitude')).toBeNull();
      expect(params.get('longitude')).toBeNull();
      expect(params.get('pin_scope')).toBe('all_matching_branches');
    });
    expect(getDiscoveryQueryUrls(fetchMock)).toHaveLength(2);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    const searchValues = getDiscoveryQueryUrls(fetchMock)
      .map((requestUrl) => new URL(requestUrl, 'http://localhost').searchParams.get('search'))
      .filter(Boolean);
    expect(searchValues).toContain('milk');
  });

  it('requests all matching branches once for a submitted discovery category', async () => {
    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock)).toHaveLength(1));

    await user.click(screen.getAllByRole('button', { name: /^Food$/i })[0]);

    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('search')).toBe('Food');
      expect(params.get('pin_scope')).toBe('all_matching_branches');
    });
    expect(getDiscoveryQueryUrls(fetchMock)).toHaveLength(2);
  });

  it('keeps mobile discovery search results rendered after submit', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390
    });
    window.dispatchEvent(new Event('resize'));
    const user = userEvent.setup();

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => {
      expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1);
    });

    const searchInput = screen.getByPlaceholderText('Search products, services or stores nearby...');
    await user.type(searchInput, 'milk');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Showing businesses related to "milk"/i)).toBeTruthy();
    });
    expect(screen.getByText(/Stores Found/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /view all stores/i })).toBeNull();
  });

  it('centers initial discovery on existing granted location permission without prompting denied users', async () => {
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 10.7, longitude: 122.5 } });
    });
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    Object.defineProperty(window.navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn(async () => ({ state: 'granted' }))
      }
    });

    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('latitude')).toBe('10.7');
      expect(params.get('longitude')).toBe('122.5');
      expect(params.get('pin_scope')).toBe('tenant_primary');
    });
    expect(window.navigator.permissions.query).toHaveBeenCalledWith({ name: 'geolocation' });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('uses prior explicit location success as a fallback when permissions API is unavailable', async () => {
    window.localStorage.setItem('dgfy_storefront_discovery_location_permission_v1', 'granted');
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 10.75, longitude: 122.55 } });
    });
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    Object.defineProperty(window.navigator, 'permissions', {
      configurable: true,
      value: undefined
    });

    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('latitude')).toBe('10.75');
      expect(params.get('longitude')).toBe('122.55');
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('sends the current discovery query contract by default', async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    const params = getLastDiscoveryParams(fetchMock);
    expect(params.get('result_mode')).toBe('union');
    expect(params.get('stock_filter')).toBe('include_out_of_stock');
    expect(params.get('pin_scope')).toBe('tenant_primary');
    expect(params.get('include_match_meta')).toBe('true');
  });

  it('shows actionable no-result recovery message for search queries', async () => {
    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'milk');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/No stores matched "milk"/i).length).toBeGreaterThan(0);
    });
  });

  it('renders no-location search results as list cards without map features or coordinate fallback', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        const parsed = new URL(normalized, 'http://localhost');
        const search = parsed.searchParams.get('search');
        return makeJsonResponse({
          stores: search === 'calamansi'
            ? [
                {
                  tenant_id: 'tenant-search-only',
                  tenant_name: 'Search Only Kitchen',
                  slug: 'search-only-kitchen',
                  storefront_open: true,
                  location_id: null,
                  location_name: null,
                  address_line: null,
                  latitude: null,
                  longitude: null,
                  catalog_count: 2,
                  store_has_no_location: true,
                  map_publication_disabled: true,
                  match_reasons: ['item'],
                  matching_item_count: 1,
                  matching_item_sample: ['Calamansi Juice'],
                  matching_location_ids: [],
                  nearest_matching_location_id: null
                }
              ]
            : [],
          pagination: { page: 1, limit: 100, total: search === 'calamansi' ? 1 : 0, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({ locations: [], primary_location_id: null, store_has_no_location: true, map_publication_disabled: true });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));
    const viewportCallsBeforeSearch = getMapViewportCallCount();

    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'calamansi');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    await waitFor(() => expect(screen.getAllByText('Search Only Kitchen').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Searchable storefront, no map pin/i).length).toBeGreaterThan(0);
    await waitFor(() => expect(getDiscoveryPinFeatures()).toHaveLength(0));
    expect(maplibregl.Popup).not.toHaveBeenCalled();
    expect(getMapViewportCallCount()).toBe(viewportCallsBeforeSearch);
  });

  it('renders no-location storefront profiles without public map or directions', async () => {
    window.history.pushState({}, '', '/tenant-store/search-only-kitchen');
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery/search-only-kitchen')) {
        return makeJsonResponse({
          slug: 'search-only-kitchen',
          tenant_name: 'Search Only Kitchen',
          storefront_open: true,
          location_id: null,
          location_name: null,
          address_line: null,
          latitude: null,
          longitude: null,
          catalog_count: 1,
          store_has_no_location: true,
          map_publication_disabled: true,
          active_location_snapshot: [
            { location_id: 11, name: 'Saved Branch', address_line: 'Saved Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true }
          ],
          access_capabilities: { profile: true, contact: true, catalog: true, cart: false, checkout: false, booking: false, payment: false },
          effective_customer_access_mode: 'catalog'
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Saved Branch', address_line: 'Saved Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true }
          ],
          store_has_no_location: true,
          map_publication_disabled: true
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [{ item_id: 1, name: 'Calamansi Juice', default_sale_price: 80, image_url: '' }] });
      }
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({ stores: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => expect(screen.getAllByText('Search Only Kitchen').length).toBeGreaterThan(0));
    expect(screen.queryByLabelText(/Open large map/i)).toBeNull();
    expect(screen.queryByText(/Get directions/i)).toBeNull();
    expect(fetchMock.mock.calls.some(([requestUrl]) => String(requestUrl).includes('location_id=11'))).toBe(false);
  });

  it('keeps item-search storefront results after a previous Near Me request', async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 10.7, longitude: 122.5 } });
    });
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        const parsed = new URL(normalized, 'http://localhost');
        const search = parsed.searchParams.get('search');
        return makeJsonResponse({
          stores: search === 'aircon'
            ? [
                {
                  tenant_id: 'tenant-ac',
                  tenant_name: 'A/C Innovative Solutions',
                  slug: 'ac-innovative-solutions',
                  storefront_open: true,
                  address_line: 'Iloilo City',
                  latitude: 10.7001938,
                  longitude: 122.5623094,
                  catalog_count: 4,
                  nearest_distance_km: 4.1,
                  distance_km: 4.1,
                  match_reasons: ['item'],
                  matching_item_count: 1,
                  matching_item_sample: ['Aircon cleaning'],
                  has_in_stock_match: true,
                  matching_location_ids: [11],
                  nearest_matching_location_id: 11
                }
              ]
            : [],
          pagination: { page: 1, limit: 100, total: search === 'aircon' ? 1 : 0, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: parsed.searchParams.get('pin_scope') || 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main Branch', address_line: 'Iloilo City', latitude: 10.7001938, longitude: 122.5623094, is_active: true, is_primary_storefront: true, is_open: true }
          ]
        });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    await user.click(screen.getByTitle('Use my current location'));
    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('pin_scope')).toBe('nearest_matching_branch');
      expect(params.get('latitude')).toBe('10.7');
    });

    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'aircon');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));

    await waitFor(() => expect(screen.getAllByText('A/C Innovative Solutions').length).toBeGreaterThan(0));
    const features = await waitForDiscoveryPinFeatures(1);
    expect(features.some((feature) => feature.properties?.highlighted === true)).toBe(true);
    const params = getLastDiscoveryParams(fetchMock);
    expect(params.get('search')).toBe('aircon');
    expect(params.get('pin_scope')).toBe('all_matching_branches');
    expect(params.get('latitude')).toBeNull();
    expect(params.get('longitude')).toBeNull();
  });

  it('moves to a new submitted result set once without refitting repeated identical searches', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        const parsed = new URL(normalized, 'http://localhost');
        const search = parsed.searchParams.get('search');
        const stores = search === 'space'
          ? [
              {
                tenant_id: 'tenant-space',
                tenant_name: 'Space Hardware',
                slug: 'space-hardware',
                storefront_open: true,
                address_line: 'Iloilo City',
                latitude: 10.73,
                longitude: 122.58,
                catalog_count: 3,
                match_reasons: ['store']
              }
            ]
          : search === 'aircon'
            ? [
                {
                  tenant_id: 'tenant-ac',
                  tenant_name: 'A/C Innovative Solutions',
                  slug: 'ac-innovative-solutions',
                  storefront_open: true,
                  address_line: 'Iloilo City',
                  latitude: 10.7001938,
                  longitude: 122.5623094,
                  catalog_count: 4,
                  match_reasons: ['item'],
                  matching_item_count: 1,
                  has_in_stock_match: true
                }
              ]
            : [];
        return makeJsonResponse({
          stores,
          pagination: { page: 1, limit: 100, total: stores.length, totalPages: 1 },
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
        const isSpace = slug === 'space-hardware';
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            {
              location_id: 11,
              name: 'Main Branch',
              address_line: 'Iloilo City',
              latitude: isSpace ? 10.73 : 10.7001938,
              longitude: isSpace ? 122.58 : 122.5623094,
              is_active: true,
              is_primary_storefront: true,
              is_open: true
            }
          ]
        });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));

    const searchInput = screen.getByPlaceholderText('Search products, services or stores nearby...');
    await user.type(searchInput, 'aircon');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => expect(screen.getAllByText('A/C Innovative Solutions').length).toBeGreaterThan(0));
    // Branch locations are derived synchronously from the discovery response
    // (active_location_snapshot) rather than fetched separately, so there is
    // no /api/v1/store/locations request to wait on here anymore -- waiting
    // for the map to react to the new result set is the real signal.
    await waitFor(() => {
      expect(getMapViewportCallCount()).toBeGreaterThan(0);
    });
    const firstSearchViewportCalls = getMapViewportCallCount();

    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => expect(getLastDiscoveryParams(fetchMock).get('search')).toBe('aircon'));
    expect(getMapViewportCallCount()).toBe(firstSearchViewportCalls);

    await user.clear(searchInput);
    await user.type(searchInput, 'space');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => expect(screen.getAllByText('Space Hardware').length).toBeGreaterThan(0));
    expect(getMapViewportCallCount()).toBeGreaterThan(firstSearchViewportCalls);
  });

  it('keeps searched marker previews hover-owned and opens store with preferred matching location id', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(hover: hover)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
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
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getAllByText('Alpha Foods').length).toBeGreaterThan(0));
    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'alpha');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => expect(screen.getAllByText('Alpha Foods').length).toBeGreaterThan(0));
    const features = await waitForDiscoveryPinFeatures(1);
    expect(features.some((feature) => feature.properties?.highlighted === true)).toBe(true);
    expect(screen.queryByRole('dialog', { name: /Alpha Foods location preview/i })).toBeNull();
    emitDiscoveryPinMouseEnter(features[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open storefront' })).toBeTruthy());
    emitDiscoveryPinMouseLeave(features[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Alpha Foods location preview/i })).toBeNull());
    expect(maplibregl.Popup.mock.calls.some(([options]) => (
      options?.anchor === 'bottom'
      && options?.offset?.bottom?.[1] === -58
      && options?.offset?.top?.[1] === 58
    ))).toBe(true);

    await user.click(screen.getAllByRole('button', { name: 'View Store' })[0]);
    await waitFor(() => {
      expect(screen.getByText('Tenant page: alpha')).toBeTruthy();
    });
    expect(screen.getAllByAltText(/Alpha Foods profile/i).length).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/Alpha Foods cover/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      const catalogCalls = fetchMock.mock.calls
        .map(([requestUrl]) => String(requestUrl))
        .filter(isStoreCatalogRequest);
      expect(catalogCalls.some((requestUrl) => requestUrl.includes('location_id=22'))).toBe(true);
    });
  });

  it('routes capped F&B Order Now to the canonical storefront instead of the order shell', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: [
            {
              tenant_id: 'tenant-space',
              tenant_name: 'Space Bar',
              slug: 'space-bar-8ddb33',
              storefront_open: true,
              workflow_mode: 'fnb',
              business_mode: 'fnb',
              address_line: 'Iloilo City',
              latitude: 10.72,
              longitude: 122.56,
              catalog_count: 116,
              estimated_wait_minutes: 15,
              customer_access_mode: 'transaction',
              requested_customer_access_mode: 'transaction',
              effective_customer_access_mode: 'catalog',
              max_customer_access_mode: 'catalog',
              access_limitation_reason: 'Registration stage informal allows up to catalog mode.',
              access_capabilities: {
                profile: true,
                contact: true,
                catalog: true,
                inventory: true,
                cart: false,
                quote: false,
                checkout: false,
                booking: false,
                payment: false
              },
              storefront_cover_image_url: '/uploads/storefront-assets/space/cover.png',
              storefront_profile_image_url: '/uploads/storefront-assets/space/profile.png'
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
          primary_location_id: 33,
          locations: [
            { location_id: 33, name: 'Space Bar Bernwood', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/storefront/discovery/space-bar-8ddb33')) {
        return makeJsonResponse({
          slug: 'space-bar-8ddb33',
          tenant_name: 'Space Bar',
          location_id: 33,
          address_line: 'Iloilo City',
          storefront_open: true,
          catalog_count: 116,
          customer_access_mode: 'transaction',
          requested_customer_access_mode: 'transaction',
          effective_customer_access_mode: 'catalog',
          access_limitation_reason: 'Registration stage informal allows up to catalog mode.',
          access_capabilities: {
            profile: true,
            contact: true,
            catalog: true,
            inventory: true,
            cart: false,
            quote: false,
            checkout: false,
            booking: false,
            payment: false
          },
          storefront_cover_image_url: '/uploads/storefront-assets/space/cover.png',
          storefront_profile_image_url: '/uploads/storefront-assets/space/profile.png'
        });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getAllByText('Space Bar').length).toBeGreaterThan(0));
    await user.type(screen.getByPlaceholderText('Search products, services or stores nearby...'), 'space');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    await waitFor(() => expect(screen.getAllByText('Space Bar').length).toBeGreaterThan(1));
    // Search results render inline (map + list) by default; the results
    // panel toggle starts collapsed ("View Results") rather than expanded,
    // matching every other search-driven test in this file.
    expect(await screen.findByRole('button', { name: /View Results/i })).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Order Now' })[0]);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/tenant-store/space-bar-8ddb33');
    });
    expect(window.location.pathname).not.toBe('/tenant-store/space-bar-8ddb33/order');
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
              nearest_matching_location_id: 22,
              location_id: 11,
              // Single branch: this test asserts the hero-map click -> "Open
              // storefront" -> location_id routing chain, not multi-branch pin
              // selection (covered by the duplicate-coordinate-cluster test).
              // A second active branch would make buildHeroDiscoveryMapPins
              // legitimately emit two pins once discoveryLocationMap populates,
              // racing waitForDiscoveryPinFeatures(1).
              active_location_snapshot: [
                { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true }
              ]
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
      // Still fetched for real: openStoreBySlug's own /api/v1/store/locations
      // call (useStoreCatalogLoader.js) is a single-store request made when
      // opening the tenant page, unrelated to the discovery fan-out this
      // change removes -- see the plan note not to touch that call site.
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true, supports_delivery: true, supports_pickup: true, supports_dine_in: true }
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
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    const user = userEvent.setup();
    render(<BrowserRouter><App /></BrowserRouter>);
    const [alphaFeature] = await waitForDiscoveryPinFeatures(1);
    expect(alphaFeature.properties?.markerKey).toContain('alpha');
    expect(alphaFeature.geometry.coordinates).toEqual([122.56, 10.72]);

    emitDiscoveryPinClick(alphaFeature);
    await waitFor(() => expect(screen.getAllByText('Main').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Open storefront' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Open storefront' }));
    await waitFor(() => {
      expect(screen.getByText('Tenant page: alpha')).toBeTruthy();
    });
    await waitFor(() => {
      const catalogCalls = fetchMock.mock.calls
        .map(([requestUrl]) => String(requestUrl))
        .filter(isStoreCatalogRequest);
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

    render(<BrowserRouter><App /></BrowserRouter>);
    const [alphaFeature] = await waitForDiscoveryPinFeatures(1);

    emitDiscoveryPinClick(alphaFeature);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy());

    const action = screen.getByRole('button', { name: 'Open storefront' });
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

    render(<BrowserRouter><App /></BrowserRouter>);
    const [alphaFeature] = await waitForDiscoveryPinFeatures(1);

    emitDiscoveryPinClick(alphaFeature);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy());

    getMapApis()[0]?.__emitLayer?.('mouseleave', 'dgfy-discovery-pin-symbols', alphaFeature);
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy();
  });

  it('collapses hover-open marker previews when the pointer leaves the marker', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(hover: hover)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
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
              storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
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
            { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    const [alphaFeature] = await waitForDiscoveryPinFeatures(1);

    emitDiscoveryPinMouseEnter(alphaFeature);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Alpha Foods location preview/i })).toBeTruthy());

    fireEvent.mouseEnter(screen.getByRole('dialog', { name: /Alpha Foods location preview/i }));
    emitDiscoveryPinMouseLeave(alphaFeature);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Alpha Foods location preview/i })).toBeNull());
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

    render(<BrowserRouter><App /></BrowserRouter>);
    const [clusterFeature] = await waitForDiscoveryPinFeatures(1);
    expect(clusterFeature.geometry.coordinates).toEqual([122.56, 10.72]);
    expect(clusterFeature.properties).toMatchObject({
      coordinateKey: '10.720000:122.560000',
      count: 2,
      type: 'cluster'
    });
    expect(maplibregl.Marker).not.toHaveBeenCalledWith(expect.objectContaining({
      anchor: 'bottom'
    }));
    expect(maplibregl.Popup).not.toHaveBeenCalled();

    emitDiscoveryPinClick(clusterFeature);
    await waitFor(() => expect(screen.getByText('Stores At This Pin')).toBeTruthy());
    await waitFor(() => expect(getMapApis().filter((api) => api?.container?.isConnected).length).toBe(1));
    expect(screen.getByText('2 Stores Found')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /collapse results panel/i }));
    // Collapsing clears the cluster selection (clearDiscoveryClusterResults),
    // and with no active text search to fall back to, the interactive results
    // stage unmounts entirely in favor of the default hero/map exploration
    // view -- there's no "N results" toggle to reopen, just the hero map.
    await waitFor(() => {
      expect(screen.queryByText('Stores At This Pin')).toBeNull();
      expect(screen.queryByRole('button', { name: /View Results/i })).toBeNull();
    });
    expect(await screen.findByText('Live Map')).toBeTruthy();
    expect(screen.getAllByText('Alpha Foods').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta Foods').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Select Alpha Foods at Main Branch/i })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /Alpha Foods location preview/i })).toBeNull();
  });

  it('keeps indexed discovery coordinates without a per-store location enrichment fan-out', async () => {
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
              location_id: 11,
              location_name: 'Alpha Main',
              address_line: 'Alpha Road',
              latitude: 10.7268685,
              longitude: 122.5051406,
              catalog_count: 2,
              matching_location_ids: [11],
              nearest_matching_location_id: 11
            },
            {
              tenant_id: 'tenant-2',
              tenant_name: 'Beta Foods',
              slug: 'beta',
              storefront_open: true,
              location_id: 22,
              location_name: 'Beta Main',
              address_line: 'Beta Road',
              latitude: 10.7202,
              longitude: 122.5621,
              catalog_count: 1,
              matching_location_ids: [22],
              nearest_matching_location_id: 22
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
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Alpha Main', address_line: 'Alpha Road', latitude: 10.7268685, longitude: 122.5051406, is_active: true, is_primary_storefront: true, is_open: true }
          ]
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText(/Alpha Foods/i)).toBeTruthy());

    expect(screen.queryByRole('button', { name: /2 storefronts at this location/i })).toBeNull();
    const features = await waitForDiscoveryPinFeatures(2);
    const coordinates = features.map((feature) => feature.geometry.coordinates.map((value) => Number(value).toFixed(6)));
    expect(coordinates).toContainEqual(['122.505141', '10.726869']);
    expect(coordinates).toContainEqual(['122.562100', '10.720200']);

    // #297: branch-location enrichment used to fan out one GET
    // /api/v1/store/locations per store (up to 100 simultaneous requests),
    // which exhausted the tenant connection cache in production. It is now
    // a pure client-side derivation from the discovery response, so no
    // enrichment request should ever fire.
    const locationRequests = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/api/v1/store/locations'));
    expect(locationRequests).toHaveLength(0);
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

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText(/Coordinate Missing A/i)).toBeTruthy());

    await waitForDiscoveryPinFeatures(0);
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

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText(/Placeholder A/i)).toBeTruthy());

    await waitFor(() => {
      const coordinates = getDiscoveryPinFeatures().map((feature) => feature.geometry.coordinates.map((value) => Number(value).toFixed(6)));
      expect(coordinates).not.toContainEqual(['122.559893', '10.699817']);
      expect(coordinates).toContainEqual(['122.562309', '10.700194']);
    });
    const coordinates = getDiscoveryPinFeatures().map((feature) => feature.geometry.coordinates.map((value) => Number(value).toFixed(6)));
    expect(coordinates).not.toContainEqual(['122.559893', '10.699817']);
    expect(coordinates).toContainEqual(['122.562309', '10.700194']);
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

    render(<BrowserRouter><App /></BrowserRouter>);
    const [clusterFeature] = await waitForDiscoveryPinFeatures(1);
    expect(clusterFeature.properties).toMatchObject({
      count: 10,
      type: 'cluster'
    });

    emitDiscoveryPinClick(clusterFeature);
    await waitFor(() => expect(screen.getByText('Stores At This Pin')).toBeTruthy());
    expect(screen.getByText('10 Stores Found')).toBeTruthy();
    expect(screen.getAllByText('Store 10').length).toBeGreaterThan(0);
    expect(screen.queryByText('Showing all 10 storefronts at this exact pin')).toBeNull();
    expect(screen.queryByRole('button', { name: /Select Store 10 at Main Branch/i })).toBeNull();
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
    render(<BrowserRouter><App /></BrowserRouter>);

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

    render(<BrowserRouter><App /></BrowserRouter>);
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

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(getDiscoveryQueryUrls(fetchMock).length).toBe(1));
    await user.click(screen.getByTitle('Use my current location'));

    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('latitude')).toBe('10.7');
      expect(params.get('longitude')).toBe('122.5');
      expect(params.get('pin_scope')).toBe('nearest_matching_branch');
    });
    await waitFor(() => expect(getDiscoveryUserFeatures()).toHaveLength(1));
    expect(getDiscoveryUserFeatures()[0].geometry.coordinates).toEqual([122.5, 10.7]);
    const mapApi = getMapApis()[0];
    expect(mapApi.getLayer('dgfy-discovery-user-location')).toBeTruthy();
    expect(mapApi.getLayer('dgfy-discovery-pin-symbols')).toBeTruthy();
  });

  it('exposes a mobile map control that shares current location and renders the user dot', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390
    });
    window.dispatchEvent(new Event('resize'));
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 10.701, longitude: 122.501 } });
    });
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        const parsed = new URL(normalized, 'http://localhost');
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
            pin_scope: parsed.searchParams.get('pin_scope') || 'tenant_primary',
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

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getAllByText('Alpha Foods').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Use current location on map' }));

    await waitFor(() => {
      const params = getLastDiscoveryParams(fetchMock);
      expect(params.get('latitude')).toBe('10.701');
      expect(params.get('longitude')).toBe('122.501');
      expect(params.get('pin_scope')).toBe('nearest_matching_branch');
    });
    await waitFor(() => expect(getDiscoveryUserFeatures()).toHaveLength(1));
    expect(getDiscoveryUserFeatures()[0].geometry.coordinates).toEqual([122.501, 10.701]);
    expect(screen.getByRole('button', { name: 'Use current location on map' }).textContent).toContain('My location');
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

    render(<BrowserRouter><App /></BrowserRouter>);
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
    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('Storefront items are not set up yet')).toBeTruthy();
    });
    expect(screen.getByText(/Customer checkout will be available once at least one storefront item is enabled/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check Again' })).toBeTruthy();

    await user.type(screen.getByPlaceholderText('Search services...'), 'milk');
    expect(screen.getByPlaceholderText('Search services...').value).toBe('milk');
  });

  it('loads root tenant URLs with the selected location_id catalog scope', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery/alpha')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          workflow_mode: 'services',
          location_id: 11,
          location_name: 'Main',
          address_line: 'Main Road',
          storefront_open: true,
          catalog_count: 1
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true },
            { location_id: 22, name: 'Branch', address_line: 'Branch Road', latitude: 10.73, longitude: 122.57, is_active: true, is_primary_storefront: false, is_open: true }
          ]
        });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({ stores: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } });
      }
      return makeJsonResponse({});
    });

    window.history.pushState({}, '', '/tenant-store/alpha?location_id=22');
    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => {
      const catalogCalls = fetchMock.mock.calls
        .map(([requestUrl]) => String(requestUrl))
        .filter(isStoreCatalogRequest);
      expect(catalogCalls.some((requestUrl) => requestUrl.includes('location_id=22'))).toBe(true);
    });
    expect(window.location.pathname).toBe('/tenant-store/alpha');
    expect(window.location.search).toBe('?location_id=22');
  });

  it('canonicalizes root tenant URLs to the resolved default location', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery/alpha')) {
        return makeJsonResponse({
          slug: 'alpha',
          tenant_name: 'Alpha Foods',
          workflow_mode: 'services',
          location_id: 11,
          location_name: 'Main',
          address_line: 'Main Road',
          storefront_open: true,
          catalog_count: 1
        });
      }
      if (normalized.includes('/api/v1/store/locations')) {
        return makeJsonResponse({
          primary_location_id: 11,
          locations: [
            { location_id: 11, name: 'Main', address_line: 'Main Road', latitude: 10.72, longitude: 122.56, is_active: true, is_primary_storefront: true, is_open: true },
            { location_id: 22, name: 'Branch', address_line: 'Branch Road', latitude: 10.73, longitude: 122.57, is_active: true, is_primary_storefront: false, is_open: true }
          ]
        });
      }
      if (isStoreCatalogRequest(normalized)) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    window.history.pushState({}, '', '/tenant-store/alpha');
    render(<BrowserRouter><App /></BrowserRouter>);

    await waitFor(() => {
      expect(window.location.search).toBe('?location_id=11');
    });
    const catalogCalls = fetchMock.mock.calls
      .map(([requestUrl]) => String(requestUrl))
      .filter(isStoreCatalogRequest);
    expect(catalogCalls.some((requestUrl) => requestUrl.includes('location_id=11'))).toBe(true);
  });

  // Regression coverage for #297: a discovery load used to fan out one
  // GET /api/v1/store/locations request per store (up to 100 for a full
  // page, each against a different tenant DB) to build discoveryLocationMap.
  // Branch data now comes from active_location_snapshot on the discovery
  // response itself, so no such request should ever fire.
  it('derives store branch locations from the discovery response without any /api/v1/store/locations requests', async () => {
    fetchMock.mockImplementation(async (url) => {
      const normalized = String(url);
      if (normalized.includes('/api/v1/storefront/discovery?')) {
        return makeJsonResponse({
          stores: Array.from({ length: 12 }, (_, index) => ({
            tenant_id: `tenant-${index}`,
            tenant_name: `Fanout Store ${index}`,
            slug: `fanout-store-${index}`,
            storefront_open: true,
            address_line: 'Iloilo City',
            latitude: 10.7 + index * 0.001,
            longitude: 122.5 + index * 0.001,
            catalog_count: 1,
            location_id: 100 + index,
            active_location_snapshot: [
              {
                location_id: 100 + index,
                name: `Fanout Store ${index} Main`,
                address_line: 'Iloilo City',
                latitude: 10.7 + index * 0.001,
                longitude: 122.5 + index * 0.001,
                is_active: true,
                is_primary_storefront: true,
                is_open: true,
                supports_delivery: true,
                supports_pickup: true,
                supports_dine_in: true
              }
            ]
          })),
          pagination: { page: 1, limit: 100, total: 12, totalPages: 1 },
          applied_filters: {
            result_mode: 'union',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'tenant_primary',
            include_match_meta: true
          }
        });
      }
      if (normalized.includes('/api/v1/store/catalog')) {
        return makeJsonResponse({ items: [] });
      }
      return makeJsonResponse({});
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getAllByText('Fanout Store 0').length).toBeGreaterThan(0));
    // The hero map derives pins from discoveryLocationMap synchronously, so
    // by the time all 12 stores have rendered, branch data is already there.
    await waitForDiscoveryPinFeatures(12);

    const locationRequests = fetchMock.mock.calls
      .map(([requestUrl]) => String(requestUrl))
      .filter((requestUrl) => requestUrl.includes('/api/v1/store/locations'));
    expect(locationRequests).toEqual([]);
  });
});
