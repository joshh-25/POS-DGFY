/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapPinPicker from '../MapPinPicker.jsx';
import { getMapStyleUrl, rewriteOpenFreeMapUrl, shouldUseLocalTileProxy } from '../mapLibreShared.js';

const originalFetch = globalThis.fetch;

const haversineMeters = (from, to) => {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(to[1] - from[1]);
  const deltaLng = toRadians(to[0] - from[0]);
  const lat1 = toRadians(from[1]);
  const lat2 = toRadians(to[1]);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const maplibreMocks = vi.hoisted(() => {
  const maps = [];
  const markers = [];

  class MockMap {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.sources = new Map();
      this.layers = [];
      this.zoom = options.zoom || 12;
      this.center = options.center || [0, 0];
      this.dragRotate = { disable: vi.fn() };
      this.touchZoomRotate = { disableRotation: vi.fn() };
      this.flyTo = vi.fn((nextOptions = {}) => {
        if (Array.isArray(nextOptions.center)) this.center = nextOptions.center;
        if (Number.isFinite(nextOptions.zoom)) this.zoom = nextOptions.zoom;
      });
      this.easeTo = vi.fn((nextOptions = {}) => {
        if (Array.isArray(nextOptions.center)) this.center = nextOptions.center;
        if (Number.isFinite(nextOptions.zoom)) this.zoom = nextOptions.zoom;
      });
      this.jumpTo = vi.fn((nextOptions = {}) => {
        if (Array.isArray(nextOptions.center)) this.center = nextOptions.center;
        if (Number.isFinite(nextOptions.zoom)) this.zoom = nextOptions.zoom;
      });
      this.fitBounds = vi.fn();
      this.resize = vi.fn();
      this.remove = vi.fn();
      this.addControl = vi.fn();
      this.canvas = { style: {} };
      maps.push(this);
      setTimeout(() => this.handlers.load?.(), 0);
    }

    on(eventName, handler) {
      this.handlers[eventName] = handler;
      return this;
    }

    once(eventName, handler) {
      this.handlers[eventName] = handler;
      return this;
    }

    isStyleLoaded() {
      return true;
    }

    getZoom() {
      return this.zoom;
    }

    getCenter() {
      return { lng: this.center[0], lat: this.center[1] };
    }

    getSource(sourceId) {
      return this.sources.get(sourceId);
    }

    addSource(sourceId, source) {
      this.sources.set(sourceId, {
        ...source,
        setData: vi.fn((data) => {
          this.sources.get(sourceId).data = data;
        })
      });
    }

    addLayer(layer) {
      this.layers.push(layer);
    }

    getLayer(layerId) {
      return this.layers.find((layer) => layer.id === layerId);
    }

    getCanvas() {
      return this.canvas;
    }

    getCanvasContainer() {
      return { style: {} };
    }

    getBounds() {
      return {
        contains: vi.fn(() => true)
      };
    }
  }

  class MockMarker {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.lngLat = { lng: 0, lat: 0 };
      this.remove = vi.fn();
      this.element = {
        style: {},
        innerHTML: '',
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      };
      markers.push(this);
    }

    setLngLat(value) {
      this.lngLat = { lng: value[0], lat: value[1] };
      return this;
    }

    addTo(map) {
      this.map = map;
      return this;
    }

    on(eventName, handler) {
      this.handlers[eventName] = handler;
      return this;
    }

    getLngLat() {
      return this.lngLat;
    }

    getElement() {
      return this.element;
    }

    setDraggable(value) {
      this.options.draggable = value;
      return this;
    }
  }

  class MockAttributionControl {
    constructor(options) {
      this.options = options;
    }
  }

  return {
    maps,
    markers,
    Map: vi.fn(function MapConstructor(options) {
      return new MockMap(options);
    }),
    Marker: vi.fn(function MarkerConstructor(options) {
      return new MockMarker(options);
    }),
    AttributionControl: vi.fn(function AttributionControlConstructor(options) {
      return new MockAttributionControl(options);
    })
  };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: maplibreMocks.Map,
    Marker: maplibreMocks.Marker,
    AttributionControl: maplibreMocks.AttributionControl
  }
}));

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

describe('MapPinPicker MapLibre behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maplibreMocks.maps.length = 0;
    maplibreMocks.markers.length = 0;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) => success({
          coords: {
            latitude: 14.5995123,
            longitude: 120.9842456,
            accuracy: 42
          }
        }))
      }
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          address_line: 'Iloilo City, Iloilo, Philippines',
          provider: 'dgfy-ph-local',
          precision: 'city',
          distance_meters: 25
        }
      })
    });
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    delete navigator.geolocation;
    delete globalThis.ResizeObserver;
  });

  it('searches for an address and moves the business pin to the selected result', async () => {
    const onChange = vi.fn();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/address-search?')) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: {
              results: [{
                address_line: 'Jaro, Iloilo City, Iloilo, Philippines',
                latitude: 10.7202,
                longitude: 122.5621,
                precision: 'city',
                provider: 'dgfy-ph-local',
                psgc_code: '0631000000'
              }]
            }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: {} })
      });
    });

    render(<MapPinPicker latitude="" longitude="" addressLine="" deliveryRadiusKm={5} onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search business address' }), 'Jaro Iloilo');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Jaro, Iloilo City, Iloilo, Philippines' }));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/geo/address-search?'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      address_line: 'Jaro, Iloilo City, Iloilo, Philippines',
      latitude: 10.7202,
      longitude: 122.5621
    }));
  });

  it('initializes MapLibre with the Storefront basemap over Iloilo City', async () => {
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.Map).toHaveBeenCalled());
    expect(maplibreMocks.Map.mock.calls[0][0]).toEqual(expect.objectContaining({
      bearing: 0,
      pitch: 0,
      minZoom: 4,
      maxZoom: 18,
      trackResize: false,
      attributionControl: false,
      doubleClickZoom: true,
      touchZoomRotate: true
    }));
    expect(maplibreMocks.Map.mock.calls[0][0]).not.toHaveProperty('maxBounds');
    expect(maplibreMocks.Map.mock.calls[0][0].center).toEqual([122.5621, 10.7202]);
    expect(maplibreMocks.Map.mock.calls[0][0].style).toBe('/openfreemap/styles/positron');
    expect(maplibreMocks.Map.mock.calls[0][0]).toHaveProperty('transformRequest');
    expect(maplibreMocks.maps[0].dragRotate.disable).toHaveBeenCalled();
    expect(maplibreMocks.maps[0].touchZoomRotate.disableRotation).toHaveBeenCalled();
    expect(maplibreMocks.AttributionControl).toHaveBeenCalledWith({ compact: true });
    expect(maplibreMocks.maps[0].addControl).toHaveBeenCalledWith(expect.anything(), 'bottom-right');
    expect(await screen.findByLabelText(/Map location picker/i)).toBeTruthy();
    expect(screen.getByText(/No pin selected yet\./i)).toBeTruthy();
    expect(maplibreMocks.Marker).not.toHaveBeenCalled();
  });

  it('Phase 329: renders the requested radius as a straight-line coverage preview', async () => {
    const center = [122.5621, 10.7202];
    render(<MapPinPicker latitude={center[1]} longitude={center[0]} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => {
      const source = maplibreMocks.maps[0]?.getSource('delivery-radius');
      expect(source?.data?.features).toHaveLength(1);
    });

    const coordinates = maplibreMocks.maps[0].getSource('delivery-radius').data.features[0].geometry.coordinates[0];
    const distances = coordinates
      .slice(0, -1)
      .map((coordinate) => haversineMeters(center, coordinate));

    expect(coordinates[0]).toEqual(coordinates[coordinates.length - 1]);
    expect(Math.min(...distances)).toBeGreaterThan(4990);
    expect(Math.max(...distances)).toBeLessThan(5010);
    expect(screen.getByText(/Delivery coverage preview: 5\.00 km radius/i)).toBeTruthy();
  });

  it('Phase 329: a zero-kilometer radius keeps the overlay empty and hidden', async () => {
    const { rerender } = render(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.maps[0]?.getSource('delivery-radius')).toBeTruthy());
    expect(maplibreMocks.maps[0].getSource('delivery-radius').data.features).toHaveLength(1);

    rerender(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={0} onChange={vi.fn()} />);

    expect(maplibreMocks.maps[0].getSource('delivery-radius').data).toEqual({
      type: 'FeatureCollection',
      features: []
    });
    expect(screen.queryByText(/Delivery coverage preview/i)).toBeNull();
  });

  it('renders a read-only map preview with the selected pin and no picker controls', async () => {
    render(<MapPinPicker readOnly latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await waitFor(() => expect(maplibreMocks.markers[0]).toBeTruthy());

    const mapSurface = screen.getByRole('application', { name: 'Map location picker' }).parentElement.parentElement.parentElement;
    expect(mapSurface).toBeTruthy();
    expect(mapSurface.className).toContain('h-[260px]');
    expect(mapSurface.className).toContain('sm:h-[340px]');
    expect(mapSurface.className).toContain('lg:h-[420px]');
    expect(screen.queryByRole('searchbox', { name: 'Search business address' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Adjust Pin' })).toBeNull();
    expect(maplibreMocks.markers[0].lngLat).toEqual({ lng: 122.5621, lat: 10.7202 });
  });

  it('renders the streamlined Storefront location editor with direct pin editing', async () => {
    const onChange = vi.fn();
    render(
      <MapPinPicker
        locationEditorMode
        defaultAdjustMode
        latitude={10.7202}
        longitude={122.5621}
        addressLine="Jaro, Iloilo City, Iloilo, Philippines"
        deliveryRadiusKm={5}
        onChange={onChange}
      />
    );

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await waitFor(() => expect(maplibreMocks.markers[0]).toBeTruthy());

    const useCurrentLocationButton = screen.getByRole('button', { name: /Use Current Location/i });
    expect(useCurrentLocationButton.className).toContain('min-h-11');
    expect(useCurrentLocationButton.className).toContain('px-3');
    expect(useCurrentLocationButton.className).toContain('text-[12px]');
    const mapSurface = screen.getByRole('application', { name: 'Map location picker' }).parentElement.parentElement.parentElement;
    expect(mapSurface).toBeTruthy();
    expect(mapSurface.className).toContain('h-[260px]');
    expect(mapSurface.className).toContain('sm:h-[340px]');
    expect(mapSurface.className).toContain('lg:h-[420px]');
    expect(screen.queryByText('Selected location')).toBeNull();
    expect(screen.queryByText('5.00 km radius')).toBeNull();
    expect(screen.queryByText('Pinned coordinates')).toBeNull();
    expect(screen.queryByRole('button', { name: /Reset View/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Adjust Pin/i })).toBeNull();
    expect(screen.queryByText(/Location is locked/i)).toBeNull();
    expect(maplibreMocks.markers[0].options.draggable).toBe(true);

    act(() => {
      maplibreMocks.maps[0].handlers.click({
        lngLat: { lng: 122.599488, lat: 10.720263 }
      });
    });
    expect(onChange).toHaveBeenCalledWith({ latitude: 10.720263, longitude: 122.599488 });

    const searchInput = screen.getByRole('searchbox', { name: 'Search business address' });
    await userEvent.click(screen.getByRole('button', { name: 'Clear address search' }));
    expect(searchInput.value).toBe('');
  });

  it('embeds Search in the address field and keeps the optional location action beside it', async () => {
    const user = userEvent.setup();
    render(
      <MapPinPicker
        locationEditorMode
        locationEditorAction={<button type="button">Add location</button>}
        mapHeightClassName="h-[150px] rounded-xl sm:h-[340px] lg:h-[420px]"
        latitude=""
        longitude=""
        onChange={vi.fn()}
      />
    );

    const searchRegion = screen.getByRole('search', { name: 'Search for a storefront location' });
    const searchInput = screen.getByRole('searchbox', { name: 'Search business address' });
    const searchButton = screen.getByRole('button', { name: 'Search address' });
    const addLocationButton = screen.getByRole('button', { name: 'Add location' });

    expect(searchInput.parentElement?.contains(searchButton)).toBe(true);
    expect(searchInput.placeholder).toBe('Search');
    expect(searchInput.className).toContain('appearance-none');
    expect(addLocationButton.parentElement?.parentElement).toBe(searchRegion.parentElement);
    expect(searchRegion.contains(addLocationButton)).toBe(false);
    expect(addLocationButton.parentElement?.previousElementSibling).toBe(searchRegion);

    const mapSurface = screen.getByRole('application', { name: 'Map location picker' }).parentElement.parentElement.parentElement;
    expect(mapSurface.className).toContain('h-[150px]');
    expect(mapSurface.className).toContain('sm:h-[340px]');

    await user.type(searchInput, 'Jaro');
    expect(screen.getAllByRole('button', { name: 'Clear address search' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Clear address search' }));
    expect(searchInput.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear address search' })).toBeNull();
  });

  it('expands an editor map only within the feature-owned settings boundary', async () => {
    const user = userEvent.setup();
    const expansionBoundaryRef = { current: null };
    const { container } = render(
      <div ref={(node) => { expansionBoundaryRef.current = node; }}>
        <MapPinPicker
          locationEditorMode
          latitude={10.7202}
          longitude={122.5621}
          deliveryRadiusKm={5}
          onChange={vi.fn()}
          expansionBoundaryRef={expansionBoundaryRef}
        />
      </div>
    );
    const boundary = container.firstElementChild;
    Object.defineProperty(boundary, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 244, top: 80, width: 900, height: 720, right: 1144, bottom: 800 })
    });

    await user.click(await screen.findByRole('button', { name: 'Expand map' }));

    const mapSurface = screen.getByRole('dialog', { name: 'Set branch location' });
    expect(mapSurface.className).toContain('fixed');
    expect(screen.queryByText('Search for an address or adjust the exact store location.')).toBeNull();
    const expandedSearch = screen.getByRole('search', { name: 'Search for a storefront location in the expanded map' });
    expect(expandedSearch.className).toBe('space-y-2');
    const dismissScrim = screen.getByRole('button', { name: 'Dismiss expanded map' });
    expect(dismissScrim.className).toContain('fixed z-40');
    expect(dismissScrim.className).not.toContain('inset-0');
    expect(dismissScrim.className).toContain('bg-slate-950/25');
    expect(dismissScrim.style.left).toBe('244px');
    expect(dismissScrim.style.top).toBe('80px');
    expect(dismissScrim.style.width).toBe(`${Math.min(1144, window.innerWidth) - 244}px`);
    const inset = window.innerWidth >= 1024 ? 24 : window.innerWidth >= 640 ? 18 : 12;
    const leftEdge = 244 + inset;
    const rightEdge = Math.min(1144, window.innerWidth) - inset;
    const topEdge = 80 + inset;
    const bottomEdge = Math.min(800, window.innerHeight) - inset;
    const availableHeight = bottomEdge - topEdge;
    const expectedHeight = Math.min(window.innerWidth >= 1024 ? 620 : 680, availableHeight);
    expect(mapSurface.style.left).toBe(`${leftEdge}px`);
    expect(mapSurface.style.top).toBe(`${topEdge + ((availableHeight - expectedHeight) / 2)}px`);
    expect(mapSurface.style.width).toBe(`${Math.min(1040, rightEdge - leftEdge)}px`);
    expect(mapSurface.style.height).toBe(`${expectedHeight}px`);
    expect(screen.getByRole('searchbox', { name: 'Search business address' })).toBeTruthy();
  });

  it('uses a semantic expanded dialog and restores focus after closing', async () => {
    const user = userEvent.setup();
    const expansionBoundaryRef = { current: null };
    render(
      <div ref={(node) => { expansionBoundaryRef.current = node; }}>
        <MapPinPicker
          locationEditorMode
          latitude={10.7202}
          longitude={122.5621}
          deliveryRadiusKm={5}
          onChange={vi.fn()}
          expansionBoundaryRef={expansionBoundaryRef}
        />
      </div>
    );
    Object.defineProperty(expansionBoundaryRef.current, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 12, top: 12, width: 700, height: 700, right: 712, bottom: 712 })
    });

    const expandButton = await screen.findByRole('button', { name: 'Expand map' });
    await user.click(expandButton);
    const closeButton = await screen.findByRole('button', { name: 'Close expanded map' });
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    expect(screen.getByRole('dialog', { name: 'Set branch location' }).getAttribute('aria-modal')).toBe('true');
    expect(closeButton.getAttribute('title')).toBe('Close expanded map');

    await user.click(closeButton);
    const restoredExpandButton = await screen.findByRole('button', { name: 'Expand map' });
    await waitFor(() => expect(document.activeElement).toBe(restoredExpandButton));

    await user.click(restoredExpandButton);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set branch location' })).toBeNull());
  });

  it('locks the settings scroll parent and recalculates bounds on scroll', async () => {
    const user = userEvent.setup();
    const scrollParentRef = { current: null };
    const expansionBoundaryRef = { current: null };
    let rect = { left: 20, top: 20, width: 700, height: 600, right: 720, bottom: 620 };
    render(
      <div ref={(node) => { scrollParentRef.current = node; }} style={{ overflowY: 'auto' }}>
        <div ref={(node) => { expansionBoundaryRef.current = node; }}>
          <MapPinPicker
            locationEditorMode
            latitude={10.7202}
            longitude={122.5621}
            deliveryRadiusKm={5}
            onChange={vi.fn()}
            expansionBoundaryRef={expansionBoundaryRef}
            expansionScrollParentRef={scrollParentRef}
          />
        </div>
      </div>
    );
    Object.defineProperty(scrollParentRef.current, 'scrollHeight', { configurable: true, value: 1200 });
    Object.defineProperty(scrollParentRef.current, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(expansionBoundaryRef.current, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect
    });

    await user.click(await screen.findByRole('button', { name: 'Expand map' }));
    expect(scrollParentRef.current.style.overflowY).toBe('hidden');
    rect = { left: 80, top: 40, width: 500, height: 500, right: 580, bottom: 540 };
    act(() => window.dispatchEvent(new Event('scroll')));
    const responsiveInset = window.innerWidth >= 1024 ? 24 : window.innerWidth >= 640 ? 18 : 12;
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Set branch location' }).style.left).toBe(`${80 + responsiveInset}px`));

    await user.click(screen.getByRole('button', { name: 'Close expanded map' }));
    expect(scrollParentRef.current.style.overflowY).toBe('auto');
  });

  it('keeps the expanded surface inside mobile, tablet, and desktop viewports', async () => {
    const user = userEvent.setup();
    const expansionBoundaryRef = { current: null };
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const setViewport = (width, height) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    };

    render(
      <div ref={(node) => { expansionBoundaryRef.current = node; }}>
        <MapPinPicker
          locationEditorMode
          latitude={10.7202}
          longitude={122.5621}
          deliveryRadiusKm={5}
          onChange={vi.fn()}
          expansionBoundaryRef={expansionBoundaryRef}
        />
      </div>
    );
    Object.defineProperty(expansionBoundaryRef.current, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: -24, top: 20, width: 2000, height: 2000, right: 1976, bottom: 2020 })
    });

    try {
      setViewport(390, 844);
      await user.click(await screen.findByRole('button', { name: 'Expand map' }));

      for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
        setViewport(width, height);
        act(() => window.dispatchEvent(new Event('resize')));
        await waitFor(() => {
          const dialog = screen.getByRole('dialog', { name: 'Set branch location' });
          const left = Number.parseFloat(dialog.style.left);
          const top = Number.parseFloat(dialog.style.top);
          const dialogWidth = Number.parseFloat(dialog.style.width);
          const dialogHeight = Number.parseFloat(dialog.style.height);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(left + dialogWidth).toBeLessThanOrEqual(width);
          expect(top + dialogHeight).toBeLessThanOrEqual(height);
        });
      }

      await user.click(screen.getByRole('button', { name: 'Close expanded map' }));
    } finally {
      setViewport(originalInnerWidth, originalInnerHeight);
    }
  });

  it('does not fall back to covering the viewport without a feature boundary', async () => {
    const user = userEvent.setup();
    render(<MapPinPicker locationEditorMode latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Expand map' }));

    expect(screen.queryByRole('dialog', { name: 'Set branch location' })).toBeNull();
    expect(screen.getByText(/cannot be expanded in this view/i)).toBeTruthy();
  });

  it('Phase 329: renders the requested radius as a straight-line coverage preview', async () => {
    const center = [122.5621, 10.7202];
    render(<MapPinPicker latitude={center[1]} longitude={center[0]} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => {
      const source = maplibreMocks.maps[0]?.getSource('delivery-radius');
      expect(source?.data?.features).toHaveLength(1);
    });

    const coordinates = maplibreMocks.maps[0].getSource('delivery-radius').data.features[0].geometry.coordinates[0];
    const distances = coordinates
      .slice(0, -1)
      .map((coordinate) => haversineMeters(center, coordinate));

    expect(coordinates[0]).toEqual(coordinates[coordinates.length - 1]);
    expect(Math.min(...distances)).toBeGreaterThan(4990);
    expect(Math.max(...distances)).toBeLessThan(5010);
    expect(screen.getByText(/Delivery coverage preview: 5\.00 km radius/i)).toBeTruthy();
  });

  it('Phase 329: a zero-kilometer radius keeps the overlay empty and hidden', async () => {
    const { rerender } = render(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.maps[0]?.getSource('delivery-radius')).toBeTruthy());
    expect(maplibreMocks.maps[0].getSource('delivery-radius').data.features).toHaveLength(1);

    rerender(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={0} onChange={vi.fn()} />);

    expect(maplibreMocks.maps[0].getSource('delivery-radius').data).toEqual({
      type: 'FeatureCollection',
      features: []
    });
    expect(screen.queryByText(/Delivery coverage preview/i)).toBeNull();
  });

  it('keeps POS map tiles on OpenFreeMap when the POS host has no local tile proxy', () => {
    const posEnv = {
      VITE_APP_SURFACE: 'pos',
      VITE_TILE_BASE: ''
    };

    expect(shouldUseLocalTileProxy(posEnv)).toBe(false);
    expect(getMapStyleUrl(posEnv)).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  it('keeps the local tile proxy for non-POS surfaces', () => {
    const skupervisorEnv = {
      VITE_APP_SURFACE: 'skupervisor',
      VITE_TILE_BASE: ''
    };

    expect(shouldUseLocalTileProxy(skupervisorEnv)).toBe(true);
    expect(getMapStyleUrl(skupervisorEnv)).toBe('/openfreemap/styles/positron');
    expect(rewriteOpenFreeMapUrl(
      'https://tiles.openfreemap.org/styles/positron',
      'https://skupervisor.dgfy.ph'
    )).toBe('https://skupervisor.dgfy.ph/openfreemap/styles/positron');
  });

  it('treats legacy 0,0 coordinates as no selected merchant pin', async () => {
    render(<MapPinPicker latitude={0} longitude={0} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());

    expect(screen.getByText(/No pin selected yet\./i)).toBeTruthy();
    expect(maplibreMocks.Marker).not.toHaveBeenCalled();
    expect(maplibreMocks.maps[0].jumpTo).not.toHaveBeenCalledWith(expect.objectContaining({
      center: [0, 0]
    }));
  });

  it('creates the first draggable marker from Adjust Pin at the Iloilo camera center without waiting for parent rerender', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));

    expect(onChange).toHaveBeenCalledWith({
      latitude: 10.7202,
      longitude: 122.5621
    });
    expect(maplibreMocks.maps[0].jumpTo).toHaveBeenCalledWith({
      center: [122.5621, 10.7202],
      zoom: 16
    });

    await waitFor(() => expect(maplibreMocks.markers[0]?.options.draggable).toBe(true));
    expect(screen.getByRole('button', { name: /Stop Moving Pin/i })).toBeTruthy();
    expect(screen.queryByText(/No pin selected yet\./i)).toBeNull();
    expect(screen.getByText(/Pinned: 10\.720200, 122\.562100/i)).toBeTruthy();
  });

  it('toggles drag mode off without removing the selected marker', async () => {
    const user = userEvent.setup();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));
    await waitFor(() => expect(maplibreMocks.markers[0]?.options.draggable).toBe(true));

    await user.click(screen.getByRole('button', { name: /Stop Moving Pin/i }));

    expect(maplibreMocks.markers[0].options.draggable).toBe(false);
    expect(screen.getByRole('button', { name: /Adjust Pin/i })).toBeTruthy();
    expect(screen.getByText(/Pinned: 10\.720200, 122\.562100/i)).toBeTruthy();
    expect(screen.queryByText(/No pin selected yet\./i)).toBeNull();
  });

  it('clears invalid 0,0 input when Reset View returns to Iloilo', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MapPinPicker latitude={0} longitude={0} deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Reset View/i }));

    expect(onChange).toHaveBeenCalledWith({ latitude: '', longitude: '' });
    expect(maplibreMocks.maps[0].flyTo).toHaveBeenCalledWith({
      center: [122.5621, 10.7202],
      zoom: 13
    });
  });

  it('keeps click and geolocation locked until Adjust Pin is enabled', async () => {
    const onChange = vi.fn();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());

    act(() => {
      maplibreMocks.maps[0].handlers.click({
        lngLat: { lng: 120.9842456, lat: 14.5995123 }
      });
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Pin Current Location/i }).disabled).toBe(true);
  });

  it('writes coordinates from map click and geolocation into the field contract while adjusting', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));
    onChange.mockClear();
    globalThis.fetch.mockClear();

    act(() => {
      maplibreMocks.maps[0].handlers.click({
        lngLat: { lng: 120.9842456, lat: 14.5995123 }
      });
    });

    expect(onChange).toHaveBeenCalledWith({
      latitude: 14.5995123,
      longitude: 120.9842456
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        latitude: 14.5995123,
        longitude: 120.9842456,
        address_line: 'Iloilo City, Iloilo, Philippines',
        address_precision: 'city',
        address_provider: 'dgfy-ph-local',
        address_distance_meters: 25
      });
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/geo/reverse-geocode?'),
      expect.objectContaining({
        credentials: 'include',
        headers: { Accept: 'application/json' }
      })
    );
    expect(globalThis.fetch.mock.calls[0][0]).toContain('lat=14.5995123');
    expect(globalThis.fetch.mock.calls[0][0]).toContain('lon=120.9842456');

    rerender(<MapPinPicker latitude={14.5995123} longitude={120.9842456} deliveryRadiusKm={5} onChange={onChange} />);
    expect(maplibreMocks.markers[0].options.draggable).toBe(true);

    await user.click(screen.getByRole('button', { name: /Pin Current Location/i }));
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith({
      latitude: 14.5995123,
      longitude: 120.9842456
    });
    await waitFor(() => expect(screen.getByText(/Pinned: 14\.599512, 120\.984246/i)).toBeTruthy());
    expect(screen.getByText(/High accuracy: within about 42 m/i)).toBeTruthy();
    expect(maplibreMocks.Marker).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'bottom' }));
  });

  it('writes coordinates and address from marker drag while adjust mode is active', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    rerender(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={onChange} />);
    await waitFor(() => expect(maplibreMocks.markers[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));

    act(() => {
      maplibreMocks.markers[0].setLngLat([122.599488, 10.720263]);
      maplibreMocks.markers[0].handlers.dragend();
    });

    expect(onChange).toHaveBeenCalledWith({
      latitude: 10.720263,
      longitude: 122.599488
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        latitude: 10.720263,
        longitude: 122.599488,
        address_line: 'Iloilo City, Iloilo, Philippines',
        address_precision: 'city',
        address_provider: 'dgfy-ph-local',
        address_distance_meters: 25
      });
    });
  });

  it('does not emit marker drag changes after Stop Moving Pin locks the marker', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.markers[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));
    await user.click(screen.getByRole('button', { name: /Stop Moving Pin/i }));
    onChange.mockClear();

    act(() => {
      maplibreMocks.markers[0].setLngLat([122.599488, 10.720263]);
      maplibreMocks.markers[0].handlers.dragend();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(maplibreMocks.markers[0].lngLat).toEqual({ lng: 122.5621, lat: 10.7202 });
  });

  it('ignores stale reverse-geocode responses from older pin selections', async () => {
    let resolveFirst;
    let resolveSecond;
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));
    onChange.mockClear();
    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = () => resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: {
              address_line: 'Older address',
              provider: 'dgfy-ph-local',
              precision: 'city'
            }
          })
        });
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = () => resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: {
              address_line: 'Newer address',
              provider: 'dgfy-ph-local',
              precision: 'barangay',
              distance_meters: 12
            }
          })
        });
      }));

    act(() => {
      maplibreMocks.maps[0].handlers.click({ lngLat: { lng: 122.5962, lat: 10.7294 } });
      maplibreMocks.maps[0].handlers.click({ lngLat: { lng: 122.5798, lat: 10.7316 } });
    });

    act(() => resolveSecond());
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        latitude: 10.7316,
        longitude: 122.5798,
        address_line: 'Newer address',
        address_precision: 'barangay'
      }));
    });

    act(() => resolveFirst());
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({
      address_line: 'Older address'
    }));
  });

  it('rejects browser geolocation outside the Philippines without moving the pin', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) => success({
          coords: {
            latitude: 35.2271,
            longitude: -80.8431,
            accuracy: 30
          }
        }))
      }
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /Pin Current Location/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(maplibreMocks.maps[0].flyTo).not.toHaveBeenCalledWith(expect.objectContaining({
      center: [-80.8431, 35.2271]
    }));
    expect(screen.getByText(/reported a location outside the Philippines/i)).toBeTruthy();
  });

  it.each([
    [1, /Location permission was denied/i],
    [2, /could not determine your current location/i],
    [3, /lookup timed out/i],
    [0, /Unable to get your current location/i]
  ])('shows a specific geolocation error for code %s', async (code, expectedMessage) => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success, error) => error({ code }))
      }
    });
    const user = userEvent.setup();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={vi.fn()} defaultAdjustMode />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Pin Current Location/i }));

    expect(screen.getByText(expectedMessage)).toBeTruthy();
    expect(screen.getByText(/No pin selected yet\./i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stop Moving Pin/i })).toBeTruthy();
  });

  it('shows an unsupported-browser message when geolocation is unavailable', async () => {
    delete navigator.geolocation;
    const user = userEvent.setup();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={vi.fn()} defaultAdjustMode />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Pin Current Location/i }));

    expect(screen.getByText(/Geolocation is not available in this browser/i)).toBeTruthy();
    expect(screen.getByText(/No pin selected yet\./i)).toBeTruthy();
  });

  it('keeps coordinate pinning when reverse address lookup fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('reverse geocode unavailable'));
    const onChange = vi.fn();
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    act(() => {
      maplibreMocks.maps[0].handlers.click({
        lngLat: { lng: 122.599488, lat: 10.720263 }
      });
    });

    expect(onChange).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: /Adjust Pin/i }));
    onChange.mockClear();

    act(() => {
      maplibreMocks.maps[0].handlers.click({
        lngLat: { lng: 122.599488, lat: 10.720263 }
      });
    });

    expect(onChange).toHaveBeenCalledWith({
      latitude: 10.720263,
      longitude: 122.599488
    });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({
      address_line: expect.any(String)
    }));
  });

  it('keeps the MapLibre picker usable when tile requests emit a resource error', async () => {
    render(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/Loading map/i)).toBeNull());

    act(() => {
      maplibreMocks.maps[0].handlers.error?.({ error: new Error('tile failed') });
    });

    expect(screen.queryByText(/Map failed to load/i)).toBeNull();
    expect(screen.getByText(/Map interaction is still available/i)).toBeTruthy();
    expect(screen.getByLabelText(/Map location picker/i)).toBeTruthy();
    expect(screen.getByText(/Pinned: 10.720200, 122.562100/i)).toBeTruthy();
  });

  it('ignores late MapLibre cleanup failures while closing the picker', async () => {
    const { unmount } = render(<MapPinPicker latitude={10.7202} longitude={122.5621} deliveryRadiusKm={5} onChange={vi.fn()} />);
    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());
    maplibreMocks.maps[0].remove.mockImplementationOnce(() => {
      throw new TypeError('late resize after close');
    });

    expect(() => unmount()).not.toThrow();
  });

  it('skips unsafe MapLibre resize when the container is not measurable', async () => {
    let resizeCallback;
    globalThis.ResizeObserver = vi.fn(function ResizeObserver(callback) {
      resizeCallback = callback;
      return {
        observe: vi.fn(),
        disconnect: vi.fn()
      };
    });
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });

    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={vi.fn()} />);
    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());

    act(() => {
      resizeCallback?.();
    });

    expect(maplibreMocks.maps[0].resize).not.toHaveBeenCalled();
    getBoundingClientRectSpy.mockRestore();
  });
});
