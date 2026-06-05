/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapPinPicker from '../MapPinPicker.jsx';

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
      this.dragRotate = { disable: vi.fn() };
      this.touchZoomRotate = { disableRotation: vi.fn() };
      this.flyTo = vi.fn((nextOptions = {}) => {
        if (Number.isFinite(nextOptions.zoom)) this.zoom = nextOptions.zoom;
      });
      this.easeTo = vi.fn((nextOptions = {}) => {
        if (Number.isFinite(nextOptions.zoom)) this.zoom = nextOptions.zoom;
      });
      this.jumpTo = vi.fn((nextOptions = {}) => {
        if (Number.isFinite(nextOptions.zoom)) this.zoom = nextOptions.zoom;
      });
      this.fitBounds = vi.fn();
      this.resize = vi.fn();
      this.remove = vi.fn();
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

    getCanvas() {
      return this.canvas;
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

  return {
    maps,
    markers,
    Map: vi.fn(function MapConstructor(options) {
      return new MockMap(options);
    }),
    Marker: vi.fn(function MarkerConstructor(options) {
      return new MockMarker(options);
    })
  };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: maplibreMocks.Map,
    Marker: maplibreMocks.Marker
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
            longitude: 120.9842456
          }
        }))
      }
    });
  });

  afterEach(() => {
    cleanup();
    delete navigator.geolocation;
    delete globalThis.ResizeObserver;
  });

  it('initializes MapLibre as a flat draggable location picker', async () => {
    render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={vi.fn()} />);

    await waitFor(() => expect(maplibreMocks.Map).toHaveBeenCalled());
    expect(maplibreMocks.Map.mock.calls[0][0]).toEqual(expect.objectContaining({
      bearing: 0,
      pitch: 0,
      minZoom: 4,
      maxZoom: 18
    }));
    expect(maplibreMocks.maps[0].dragRotate.disable).toHaveBeenCalled();
    expect(maplibreMocks.maps[0].touchZoomRotate.disableRotation).toHaveBeenCalled();
    expect(await screen.findByLabelText(/Map location picker/i)).toBeTruthy();
  });

  it('writes coordinates from map click and geolocation into the field contract', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<MapPinPicker latitude="" longitude="" deliveryRadiusKm={5} onChange={onChange} />);

    await waitFor(() => expect(maplibreMocks.maps[0]).toBeTruthy());

    act(() => {
      maplibreMocks.maps[0].handlers.click({
        lngLat: { lng: 120.9842456, lat: 14.5995123 }
      });
    });

    expect(onChange).toHaveBeenCalledWith({
      latitude: 14.5995123,
      longitude: 120.9842456
    });

    rerender(<MapPinPicker latitude={14.5995123} longitude={120.9842456} deliveryRadiusKm={5} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Adjust Pin/i }));
    expect(maplibreMocks.markers[0].options.draggable).toBe(true);

    await user.click(screen.getByRole('button', { name: /Pin Current Location/i }));
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith({
      latitude: 14.5995123,
      longitude: 120.9842456
    });
    expect(maplibreMocks.Marker).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'bottom' }));
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
