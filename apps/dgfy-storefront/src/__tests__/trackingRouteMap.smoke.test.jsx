/* @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrackingRouteMap, { extractTrackingMapCoordinates } from '../tracking/TrackingRouteMap.jsx';

afterEach(cleanup);

vi.mock('maplibre-gl', () => {
  const fakeMap = {
    on: vi.fn((event, arg2, arg3) => {
      const handler = typeof arg2 === 'function' ? arg2 : arg3;
      if (event === 'load' && typeof handler === 'function') handler();
    }),
    off: vi.fn(),
    remove: vi.fn(),
    getCanvas: vi.fn(() => ({ style: {} })),
    getCanvasContainer: vi.fn(() => ({ style: {} })),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => ({ setData: vi.fn() })),
    getLayer: vi.fn(() => null),
    hasImage: vi.fn(() => true),
    addImage: vi.fn(),
    resize: vi.fn()
  };
  return {
    default: {
      Map: vi.fn(() => fakeMap)
    }
  };
});

vi.mock('../services/routeCalculatorService.js', () => ({
  getStoreRoute: vi.fn().mockResolvedValue({ distance_meters: 1000, duration_seconds: 120, geometry: null })
}));

describe('TrackingRouteMap (rebuilt real map)', () => {
  it('renders a real map container for a delivery order (store + customer pins)', () => {
    const { container } = render(
      <TrackingRouteMap
        storePin={{ latitude: 10.7, longitude: 122.56 }}
        customerPin={{ latitude: 10.72, longitude: 122.57 }}
        styleUrl="/openfreemap/styles/positron"
        transformRequest={undefined}
        mapHeight={280}
      />
    );
    expect(container.querySelector('div')).toBeTruthy();
    expect(container.textContent).not.toContain('under development');
  });

  it('renders a store-only map for pickup orders (no customer pin)', () => {
    const { container } = render(
      <TrackingRouteMap
        storePin={{ latitude: 10.7, longitude: 122.56 }}
        customerPin={null}
        styleUrl="/openfreemap/styles/positron"
        mapHeight={140}
      />
    );
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('shows a fallback instead of crashing when there is no store pin at all', () => {
    const { getByText } = render(
      <TrackingRouteMap storePin={null} customerPin={null} styleUrl="/openfreemap/styles/positron" />
    );
    expect(getByText('Store map unavailable')).toBeTruthy();
  });

  it('still exports the coordinate-extraction helper unchanged', () => {
    const pins = extractTrackingMapCoordinates(
      { raw: { order: { delivery_latitude: '10.72', delivery_longitude: '122.57' } } },
      { latitude: '10.70', longitude: '122.56' },
      null
    );
    expect(pins).toEqual({
      storePin: { latitude: 10.7, longitude: 122.56 },
      customerPin: { latitude: 10.72, longitude: 122.57 }
    });
  });
});
