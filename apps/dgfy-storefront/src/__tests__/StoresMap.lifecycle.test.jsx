/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoresMap } from '../discovery/components/StoresMap.jsx';
import { DISCOVERY_PIN_LAYER_ID, DISCOVERY_PIN_SOURCE_ID } from '../discovery/model/discoveryMapLayers.js';

const mapState = vi.hoisted(() => ({
  maps: [],
  popups: [],
  ensureMapImageOverride: null
}));

vi.mock('../discovery/model/discoveryMapLayers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // The normal lifecycle test delegates to the real helper. Tests that exercise
    // rejected consumer chains install a deliberate rejection through this seam.
    ensureMapImage: (...args) => (
      mapState.ensureMapImageOverride
        ? mapState.ensureMapImageOverride(...args)
        : actual.ensureMapImage(...args)
    )
  };
});

vi.mock('maplibre-gl', () => {
  function PopupApi() {
    const handlers = {};
    const api = {
      map: null,
      node: null,
      open: false,
      on: vi.fn((eventName, handler) => {
        handlers[eventName] = handlers[eventName] || [];
        handlers[eventName].push(handler);
        return api;
      }),
      setDOMContent: vi.fn((node) => {
        api.node = node;
        return api;
      }),
      setLngLat: vi.fn(() => api),
      addTo: vi.fn((map) => {
        api.map = map;
        api.open = true;
        if (api.node && !api.node.isConnected) document.body.appendChild(api.node);
        return api;
      }),
      isOpen: vi.fn(() => api.open),
      remove: vi.fn(() => {
        if (!api.open) return api;
        api.open = false;
        if (api.node?.isConnected) api.node.remove();
        (handlers.close || []).forEach((handler) => handler());
        return api;
      })
    };
    mapState.popups.push(api);
    return api;
  }

  function MapApi(options = {}) {
    const sources = new Map();
    const layers = new Map();
    const images = new Set();
    const layerHandlers = {};
    const mapHandlers = {};
    let camera = {
      center: options.center || [122.57, 10.72],
      zoom: options.zoom ?? 11,
      bearing: options.bearing ?? 0,
      pitch: options.pitch ?? 0
    };
    const sourceApi = (source = {}) => {
      const sourceInstance = { ...source };
      sourceInstance.setData = vi.fn((data) => {
        sourceInstance.data = data;
      });
      return sourceInstance;
    };
    const api = {
      container: options.container,
      options,
      removed: false,
      on: vi.fn((eventName, layerOrHandler, maybeHandler) => {
        if (typeof layerOrHandler === 'string' && typeof maybeHandler === 'function') {
          const key = `${eventName}:${layerOrHandler}`;
          layerHandlers[key] = layerHandlers[key] || [];
          layerHandlers[key].push(maybeHandler);
        } else if (typeof layerOrHandler === 'function') {
          mapHandlers[eventName] = mapHandlers[eventName] || [];
          mapHandlers[eventName].push(layerOrHandler);
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
        } else if (typeof layerOrHandler === 'function') {
          mapHandlers[eventName] = (mapHandlers[eventName] || []).filter((entry) => entry !== layerOrHandler);
        }
        return api;
      }),
      isStyleLoaded: vi.fn(() => true),
      getCanvasContainer: vi.fn(() => {
        const element = document.createElement('div');
        options.container?.appendChild(element);
        return element;
      }),
      getCanvas: vi.fn(() => ({ style: {} })),
      resize: vi.fn(),
      flyTo: vi.fn(),
      fitBounds: vi.fn(),
      getCenter: vi.fn(() => ({ lng: camera.center[0], lat: camera.center[1] })),
      getZoom: vi.fn(() => camera.zoom),
      getBearing: vi.fn(() => camera.bearing),
      getPitch: vi.fn(() => camera.pitch),
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
      hasImage: vi.fn((id) => {
        if (api.removed) throw new TypeError("Cannot read properties of undefined (reading 'getImage')");
        return images.has(id);
      }),
      addImage: vi.fn((id) => {
        if (api.removed) throw new TypeError("Cannot read properties of undefined (reading 'addImage')");
        images.add(id);
        return api;
      }),
      remove: vi.fn(() => {
        // Model MapLibre's teardown ordering: style access is invalidated first,
        // then removing the open popup synchronously emits its close event.
        api.removed = true;
        mapState.popups
          .filter((popup) => popup.map === api && popup.isOpen())
          .forEach((popup) => popup.remove());
      }),
      __sources: sources,
      __setCamera: (nextCamera) => { camera = { ...camera, ...nextCamera }; },
      __emit: (eventName, event = {}) => (mapHandlers[eventName] || []).forEach((handler) => handler(event)),
      __emitLayer: (eventName, layerId, feature) => {
        const key = `${eventName}:${layerId}`;
        (layerHandlers[key] || []).forEach((handler) => handler({
          preventDefault: vi.fn(),
          features: feature ? [feature] : []
        }));
      }
    };
    mapState.maps.push(api);
    return api;
  }

  return {
    default: {
      Map: vi.fn(MapApi),
      Popup: vi.fn(PopupApi),
      setWorkerUrl: vi.fn()
    }
  };
});

const externalListing = {
  entity_type: 'external_listing',
  external_provider: 'mapviu',
  slug: 'mapviu-hotel',
  tenant_name: 'MapViu Hotel',
  location_id: 27,
  latitude: 10.72,
  longitude: 122.56,
  address_line: 'Iloilo City'
};

const getLatestMap = () => mapState.maps.at(-1);
const getPinSource = (map) => map?.__sources.get(DISCOVERY_PIN_SOURCE_ID);
const getPinFeature = (map) => getPinSource(map)?.data?.features?.[0];

const installSuccessfulImageMock = () => {
  class MockImage {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    set src(value) {
      this._src = value;
      window.setTimeout(() => this.onload?.(), 0);
    }

    get src() {
      return this._src;
    }
  }
  vi.stubGlobal('Image', MockImage);
  window.Image = MockImage;
};

const waitForMap = async () => {
  await waitFor(() => expect(mapState.maps.length).toBeGreaterThan(0));
  return getLatestMap();
};

const waitForInitialPinData = async (map) => {
  await waitFor(() => expect(getPinSource(map)?.setData).toHaveBeenCalled());
};

const clickPin = (map, feature = getPinFeature(map)) => {
  act(() => map.__emitLayer('click', DISCOVERY_PIN_LAYER_ID, feature));
};

describe('StoresMap popup and image lifecycle', () => {
  beforeEach(() => {
    mapState.maps.length = 0;
    mapState.popups.length = 0;
    mapState.ensureMapImageOverride = null;
    installSuccessfulImageMock();
  });

  afterEach(() => {
    cleanup();
    mapState.ensureMapImageOverride = null;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('handles the real image helper when teardown closes an external popup after map removal', async () => {
    const onPreviewOpen = vi.fn();
    const onPreviewClose = vi.fn();
    const view = render(
      <StoresMap
        stores={[externalListing]}
        onPreviewOpen={onPreviewOpen}
        onPreviewClose={onPreviewClose}
      />
    );
    const map = await waitForMap();
    await waitForInitialPinData(map);
    const pinSource = getPinSource(map);

    clickPin(map);
    expect(await screen.findByRole('dialog', { name: /MapViu Hotel external listing preview/i })).toBeTruthy();
    await waitFor(() => expect(pinSource.setData.mock.calls.length).toBeGreaterThan(1));
    expect(onPreviewOpen).toHaveBeenCalledWith(externalListing);
    const updatesBeforeRemoval = pinSource.setData.mock.calls.length;

    view.unmount();
    expect(map.remove).toHaveBeenCalledOnce();
    expect(map.removed).toBe(true);
    expect(onPreviewClose).toHaveBeenCalledWith(externalListing);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await Promise.resolve();
    });

    expect(pinSource.setData).toHaveBeenCalledTimes(updatesBeforeRemoval);
  });

  it('keeps external preview close, reopen, and action behavior working', async () => {
    const onPreviewOpen = vi.fn();
    const onPreviewClose = vi.fn();
    const onSelectStore = vi.fn();
    render(
      <StoresMap
        stores={[externalListing]}
        onPreviewOpen={onPreviewOpen}
        onPreviewClose={onPreviewClose}
        onSelectStore={onSelectStore}
      />
    );
    const map = await waitForMap();
    await waitForInitialPinData(map);
    const pinSource = getPinSource(map);

    clickPin(map);
    expect(await screen.findByRole('dialog', { name: /MapViu Hotel external listing preview/i })).toBeTruthy();
    await waitFor(() => expect(getPinFeature(map)?.properties?.highlighted).toBe(true));
    expect(onPreviewOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close MapViu Hotel preview' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(getPinFeature(map)?.properties?.highlighted).toBe(false));
    expect(onPreviewClose).toHaveBeenCalledWith(externalListing);

    clickPin(map);
    expect(await screen.findByRole('dialog', { name: /MapViu Hotel external listing preview/i })).toBeTruthy();
    expect(onPreviewOpen).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Inquire' }));
    expect(onSelectStore).toHaveBeenCalledWith(externalListing);
    expect(pinSource.setData.mock.calls.length).toBeGreaterThan(1);
  });

  it('handles a rejected initial pin-image chain without updating the source', async () => {
    mapState.ensureMapImageOverride = vi.fn(() => Promise.reject(new Error('injected initial image failure')));
    render(<StoresMap stores={[externalListing]} />);
    const map = await waitForMap();
    await waitFor(() => expect(getPinSource(map)).toBeTruthy());
    const pinSource = getPinSource(map);

    await act(async () => Promise.resolve());

    expect(mapState.ensureMapImageOverride).toHaveBeenCalled();
    expect(pinSource.setData).not.toHaveBeenCalled();
  });

  it('captures and restores the discovery camera without auto-fitting restored data', async () => {
    const cameraSnapshotRef = {
      current: { longitude: 122.51, latitude: 10.71, zoom: 9.5, bearing: 22, pitch: 37 }
    };
    const stores = [{
      entity_type: 'dgfy_native',
      slug: 'native-food',
      tenant_name: 'Native Food',
      latitude: 10.72,
      longitude: 122.56
    }];

    const firstView = render(
      <StoresMap
        stores={stores}
        cameraSnapshotRef={cameraSnapshotRef}
        preserveCameraOnMount
      />
    );
    const firstMap = await waitForMap();
    await waitForInitialPinData(firstMap);
    expect(firstMap.options.center).toEqual([122.51, 10.71]);
    expect(firstMap.options.zoom).toBe(9.5);
    expect(firstMap.options.bearing).toBe(22);
    expect(firstMap.options.pitch).toBe(37);
    expect(firstMap.flyTo).not.toHaveBeenCalled();
    expect(firstMap.fitBounds).not.toHaveBeenCalled();

    firstMap.__setCamera({
      center: [122.53, 10.73],
      zoom: 10.25,
      bearing: 31,
      pitch: 42
    });
    act(() => firstMap.__emit('moveend'));
    expect(cameraSnapshotRef.current).toEqual({
      longitude: 122.53,
      latitude: 10.73,
      zoom: 10.25,
      bearing: 31,
      pitch: 42
    });

    firstView.unmount();
    const secondView = render(
      <StoresMap
        stores={stores}
        cameraSnapshotRef={cameraSnapshotRef}
        preserveCameraOnMount
      />
    );
    await waitFor(() => expect(mapState.maps).toHaveLength(2));
    const secondMap = getLatestMap();
    await waitForInitialPinData(secondMap);
    expect(secondMap.options.center).toEqual([122.53, 10.73]);
    expect(secondMap.options.zoom).toBe(10.25);
    expect(secondMap.options.bearing).toBe(31);
    expect(secondMap.options.pitch).toBe(42);
    expect(secondMap.flyTo).not.toHaveBeenCalled();
    expect(secondMap.fitBounds).not.toHaveBeenCalled();

    secondView.unmount();
  });

  it('releases restored-camera suppression after an intentional map gesture', async () => {
    const onCameraInteraction = vi.fn();
    const stores = [{
      entity_type: 'dgfy_native',
      slug: 'native-food',
      tenant_name: 'Native Food',
      latitude: 10.72,
      longitude: 122.56
    }];
    const cameraSnapshotRef = {
      current: { longitude: 122.51, latitude: 10.71, zoom: 9, bearing: 0, pitch: 0 }
    };
    const view = render(
      <StoresMap
        stores={stores}
        cameraSnapshotRef={cameraSnapshotRef}
        preserveCameraOnMount
        onCameraInteraction={onCameraInteraction}
      />
    );
    const map = await waitForMap();
    await waitForInitialPinData(map);
    expect(map.flyTo).not.toHaveBeenCalled();

    act(() => map.__emit('dragstart', { originalEvent: {} }));
    expect(onCameraInteraction).toHaveBeenCalledOnce();
    view.rerender(
      <StoresMap
        stores={[...stores, { ...stores[0], slug: 'native-food-two', tenant_name: 'Native Food Two', latitude: 10.75 }]}
        cameraSnapshotRef={cameraSnapshotRef}
        preserveCameraOnMount
        onCameraInteraction={onCameraInteraction}
      />
    );
    await waitFor(() => expect(map.fitBounds).toHaveBeenCalled());
    view.unmount();
  });

  it('handles a rejected external-selection image chain without updating the source', async () => {
    render(<StoresMap stores={[externalListing]} />);
    const map = await waitForMap();
    await waitForInitialPinData(map);
    const pinSource = getPinSource(map);
    const updatesBeforeSelection = pinSource.setData.mock.calls.length;
    mapState.ensureMapImageOverride = vi.fn(() => Promise.reject(new Error('injected selection image failure')));

    clickPin(map);
    expect(await screen.findByRole('dialog', { name: /MapViu Hotel external listing preview/i })).toBeTruthy();
    await act(async () => Promise.resolve());

    expect(mapState.ensureMapImageOverride).toHaveBeenCalled();
    expect(pinSource.setData).toHaveBeenCalledTimes(updatesBeforeSelection);
    mapState.ensureMapImageOverride = null;
  });
});
