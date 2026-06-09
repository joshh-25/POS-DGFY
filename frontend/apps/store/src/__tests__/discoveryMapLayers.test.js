import { describe, expect, it, vi } from 'vitest';
import {
  DISCOVERY_PIN_HALO_LAYER_ID,
  DISCOVERY_PIN_LAYER_ID,
  DISCOVERY_PIN_SOURCE_ID,
  DISCOVERY_USER_LAYER_ID,
  DISCOVERY_USER_SOURCE_ID,
  buildDiscoveryPinLayerModel,
  buildUserLocationSourceData,
  ensureDiscoveryMapLayers,
  getDiscoveryPinIconId,
  setGeoJsonSourceData
} from '../discoveryMapLayers.js';

describe('discovery map layer helpers', () => {
  it('builds exact-coordinate layer features without display offsets', () => {
    const model = buildDiscoveryPinLayerModel({
      stores: [
        {
          slug: 'alpha',
          tenant_name: 'Alpha',
          location_id: 7,
          latitude: 10.7212344,
          longitude: 122.5678912,
          workflow_mode: 'services',
          is_primary_storefront: true
        },
        {
          slug: 'alpha',
          tenant_name: 'Alpha duplicate row',
          location_id: 7,
          latitude: 10.7212344,
          longitude: 122.5678912,
          workflow_mode: 'services'
        },
        {
          slug: 'beta',
          tenant_name: 'Beta',
          location_id: 9,
          latitude: 10.700001,
          longitude: 122.500001,
          workflow_mode: 'food_manufacturing'
        }
      ],
      highlightedKeys: ['beta:loc:9']
    });

    expect(model.sourceData.features).toHaveLength(2);
    expect(model.sourceData.features[0].geometry.coordinates).toEqual([122.5678912, 10.7212344]);
    expect(model.sourceData.features[0].properties).toMatchObject({
      markerKey: 'alpha:loc:7',
      type: 'store',
      highlighted: true
    });
    expect(model.sourceData.features[1].geometry.coordinates).toEqual([122.500001, 10.700001]);
    expect(model.sourceData.features[1].properties.highlighted).toBe(true);
  });

  it('groups multiple storefronts at one coordinate into one count pin', () => {
    const model = buildDiscoveryPinLayerModel({
      stores: [
        { slug: 'alpha', location_id: 1, latitude: 10.7, longitude: 122.5, workflow_mode: 'services' },
        { slug: 'beta', location_id: 2, latitude: 10.7, longitude: 122.5, workflow_mode: 'retail' }
      ],
      selectedKey: 'beta:loc:2'
    });

    expect(model.sourceData.features).toHaveLength(1);
    expect(model.sourceData.features[0].properties).toMatchObject({
      coordinateKey: '10.700000:122.500000',
      count: 2,
      type: 'cluster',
      highlighted: true
    });
    expect(model.requiredImages[0].id).toBe(getDiscoveryPinIconId({
      type: 'cluster',
      count: 2,
      selected: true
    }));
  });

  it('adds user location below pin halo and pin symbol layers', () => {
    const sources = new Map();
    const layers = [];
    const map = {
      getSource: vi.fn((id) => sources.get(id)),
      addSource: vi.fn((id, source) => {
        sources.set(id, { ...source, setData: vi.fn() });
      }),
      getLayer: vi.fn((id) => layers.find((layer) => layer.id === id)),
      addLayer: vi.fn((layer) => {
        layers.push(layer);
      })
    };

    expect(ensureDiscoveryMapLayers(map)).toBe(true);

    expect(map.addSource).toHaveBeenCalledWith(DISCOVERY_USER_SOURCE_ID, expect.objectContaining({ type: 'geojson' }));
    expect(map.addSource).toHaveBeenCalledWith(DISCOVERY_PIN_SOURCE_ID, expect.objectContaining({ type: 'geojson' }));
    expect(layers.map((layer) => layer.id)).toEqual([
      DISCOVERY_USER_LAYER_ID,
      DISCOVERY_PIN_HALO_LAYER_ID,
      DISCOVERY_PIN_LAYER_ID
    ]);
    expect(layers.at(-1)).toMatchObject({
      type: 'symbol',
      layout: {
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });
  });

  it('sets GeoJSON source data through MapLibre source ownership', () => {
    const setData = vi.fn();
    const data = buildUserLocationSourceData({ latitude: 10.7, longitude: 122.5 });
    const map = {
      getSource: vi.fn(() => ({ setData }))
    };

    expect(setGeoJsonSourceData(map, DISCOVERY_USER_SOURCE_ID, data)).toBe(true);
    expect(setData).toHaveBeenCalledWith(data);
  });
});
