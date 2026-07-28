import { describe, expect, it, vi } from 'vitest';
import {
  DISCOVERY_CLUSTER_MAX_ZOOM,
  DISCOVERY_CLUSTER_MIN_POINTS,
  DISCOVERY_CLUSTER_RADIUS,
  DISCOVERY_DENSITY_CLUSTER_LABEL_LAYER_ID,
  DISCOVERY_DENSITY_CLUSTER_LAYER_ID,
  DISCOVERY_NEAR_CLUSTER_RADIUS_METERS,
  DISCOVERY_PIN_HALO_LAYER_ID,
  DISCOVERY_PIN_LAYER_ID,
  DISCOVERY_PIN_SOURCE_ID,
  DISCOVERY_USER_LAYER_ID,
  DISCOVERY_USER_SOURCE_ID,
  ROUTE_LINE_LAYER_ID,
  ROUTE_LINE_SOURCE_ID,
  buildDiscoveryPinLayerModel,
  buildRouteLineGeoJson,
  buildUserLocationSourceData,
  ensureDiscoveryMapLayers,
  ensureRouteLineLayer,
  getDistanceMeters,
  getDiscoveryPinIconId,
  hasPlottableCoordinate,
  setGeoJsonSourceData,
  setRouteLineData
} from '../discovery/model/discoveryMapLayers.js';

describe('discovery map layer helpers', () => {
  it('excludes stores with missing or null-island coordinates from the map source', () => {
    const model = buildDiscoveryPinLayerModel({
      stores: [
        { slug: 'located', tenant_name: 'Located', location_id: 1, latitude: 10.72, longitude: 122.56 },
        { slug: 'no-location', tenant_name: 'No Location', location_id: null, latitude: null, longitude: null },
        { slug: 'null-island', tenant_name: 'Null Island', location_id: 2, latitude: 0, longitude: 0 }
      ]
    });

    const keys = model.sourceData.features.map((feature) => feature.properties.markerKey);
    expect(model.sourceData.features).toHaveLength(1);
    expect(keys).toEqual(['located:loc:1']);
    expect(model.bounds).toHaveLength(1);
    const hasNullIsland = model.sourceData.features.some((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001;
    });
    expect(hasNullIsland).toBe(false);
  });

  it('treats missing, null, and null-island coordinates as non-plottable', () => {
    expect(hasPlottableCoordinate(10.72, 122.56)).toBe(true);
    expect(hasPlottableCoordinate(null, null)).toBe(false);
    expect(hasPlottableCoordinate(0, 0)).toBe(false);
    expect(hasPlottableCoordinate(undefined, 122.56)).toBe(false);
    expect(hasPlottableCoordinate('', '')).toBe(false);
    expect(hasPlottableCoordinate(Number.NaN, 5)).toBe(false);
  });
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

  it('groups storefront pins within the 13 meter near-cluster radius', () => {
    const model = buildDiscoveryPinLayerModel({
      stores: [
        { slug: 'alpha', location_id: 1, latitude: 10.700000, longitude: 122.500000, workflow_mode: 'services' },
        { slug: 'beta', location_id: 2, latitude: 10.700080, longitude: 122.500000, workflow_mode: 'retail' },
        { slug: 'gamma', location_id: 3, latitude: 10.700220, longitude: 122.500000, workflow_mode: 'retail' }
      ]
    });

    expect(DISCOVERY_NEAR_CLUSTER_RADIUS_METERS).toBe(13);
    expect(getDistanceMeters(
      { latitude: 10.700000, longitude: 122.500000 },
      { latitude: 10.700080, longitude: 122.500000 }
    )).toBeLessThan(13);
    expect(model.sourceData.features).toHaveLength(2);
    expect(model.sourceData.features[0].properties).toMatchObject({
      count: 2,
      type: 'cluster',
      nearCluster: true
    });
    expect(model.sourceData.features[1].properties).toMatchObject({
      count: 1,
      type: 'store'
    });
  });

  it('excludes provisioned placeholder coordinates from public map layers', () => {
    const single = buildDiscoveryPinLayerModel({
      stores: [
        { slug: 'alpha', location_id: 1, latitude: 10.699817, longitude: 122.559893, workflow_mode: 'services' }
      ]
    });
    expect(single.sourceData.features).toHaveLength(0);

    const grouped = buildDiscoveryPinLayerModel({
      stores: [
        { slug: 'alpha', location_id: 1, latitude: 10.699817, longitude: 122.559893, workflow_mode: 'services' },
        { slug: 'beta', location_id: 1, latitude: 10.699817, longitude: 122.559893, workflow_mode: 'retail' }
      ]
    });

    expect(grouped.sourceData.features).toHaveLength(0);
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
    expect(map.addSource).toHaveBeenCalledWith(DISCOVERY_PIN_SOURCE_ID, expect.objectContaining({
      type: 'geojson',
      cluster: true,
      clusterRadius: DISCOVERY_CLUSTER_RADIUS,
      clusterMaxZoom: DISCOVERY_CLUSTER_MAX_ZOOM,
      clusterMinPoints: DISCOVERY_CLUSTER_MIN_POINTS
    }));
    expect(layers.map((layer) => layer.id)).toEqual([
      DISCOVERY_USER_LAYER_ID,
      DISCOVERY_DENSITY_CLUSTER_LAYER_ID,
      DISCOVERY_DENSITY_CLUSTER_LABEL_LAYER_ID,
      DISCOVERY_PIN_HALO_LAYER_ID,
      DISCOVERY_PIN_LAYER_ID
    ]);
    expect(layers.at(-1)).toMatchObject({
      type: 'symbol',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });
  });

  it('scopes density-cluster layers to synthetic cluster points and unclustered layers to real pins', () => {
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

    ensureDiscoveryMapLayers(map);

    const densityLayer = layers.find((layer) => layer.id === DISCOVERY_DENSITY_CLUSTER_LAYER_ID);
    const densityLabelLayer = layers.find((layer) => layer.id === DISCOVERY_DENSITY_CLUSTER_LABEL_LAYER_ID);
    const haloLayer = layers.find((layer) => layer.id === DISCOVERY_PIN_HALO_LAYER_ID);
    const pinLayer = layers.find((layer) => layer.id === DISCOVERY_PIN_LAYER_ID);

    expect(densityLayer).toMatchObject({ type: 'circle', filter: ['has', 'point_count'] });
    expect(densityLabelLayer).toMatchObject({
      type: 'symbol',
      filter: ['has', 'point_count'],
      layout: expect.objectContaining({ 'text-field': ['to-string', ['get', 'storeCount']] })
    });
    expect(haloLayer.filter).toEqual(['all', ['!', ['has', 'point_count']], ['==', ['get', 'highlighted'], true]]);
    expect(pinLayer.filter).toEqual(['!', ['has', 'point_count']]);
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

  describe('route line helpers', () => {
    it('builds an empty FeatureCollection for missing/invalid geometry instead of throwing', () => {
      expect(buildRouteLineGeoJson(null)).toEqual({ type: 'FeatureCollection', features: [] });
      expect(buildRouteLineGeoJson({ type: 'Point', coordinates: [0, 0] })).toEqual({ type: 'FeatureCollection', features: [] });
    });

    it('wraps a LineString geometry as a single-feature FeatureCollection', () => {
      const geometry = { type: 'LineString', coordinates: [[122.56, 10.7], [122.57, 10.71]] };
      expect(buildRouteLineGeoJson(geometry)).toEqual({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry }]
      });
    });

    it('adds the route source/layer idempotently and is reused by both tracking and discovery callers', () => {
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

      expect(ensureRouteLineLayer(map, { dashArray: [2, 2] })).toBe(true);
      expect(map.addSource).toHaveBeenCalledWith(ROUTE_LINE_SOURCE_ID, expect.objectContaining({ type: 'geojson' }));
      expect(layers).toEqual([
        expect.objectContaining({
          id: ROUTE_LINE_LAYER_ID,
          type: 'line',
          source: ROUTE_LINE_SOURCE_ID,
          paint: expect.objectContaining({ 'line-dasharray': [2, 2] })
        })
      ]);

      // Calling again must not re-add the source/layer.
      ensureRouteLineLayer(map);
      expect(map.addSource).toHaveBeenCalledTimes(1);
      expect(layers).toHaveLength(1);
    });

    it('routes setRouteLineData through the shared GeoJSON source setter, clearing on null geometry', () => {
      const setData = vi.fn();
      const map = { getSource: vi.fn(() => ({ setData })) };
      const geometry = { type: 'LineString', coordinates: [[122.56, 10.7], [122.57, 10.71]] };

      setRouteLineData(map, geometry);
      expect(setData).toHaveBeenCalledWith(buildRouteLineGeoJson(geometry));

      setRouteLineData(map, null);
      expect(setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
    });
  });
});
