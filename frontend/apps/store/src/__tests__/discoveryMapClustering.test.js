import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CLUSTER_MAX_ZOOM,
  DEFAULT_CLUSTER_MIN_POINTS,
  DEFAULT_CLUSTER_RADIUS,
  DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID,
  DISCOVERY_NEAR_CLUSTER_RADIUS_METERS,
  buildAddressGroups,
  buildClusterInputFeatures,
  ensureClusterActivationLayer,
  ensureClusterSource,
  flattenLeafStores,
  getClusterStores,
  getClustersForViewport,
  getDistanceMeters,
  getExpansionZoom,
  partitionClusterFeatures
} from '../features/discovery/utils/discoveryMapClustering.js';

describe('buildAddressGroups', () => {
  it('keeps distinct addresses as separate single-store groups', () => {
    const groups = buildAddressGroups([
      { slug: 'alpha', location_id: 1, latitude: 10.7, longitude: 122.5 },
      { slug: 'beta', location_id: 2, latitude: 10.9, longitude: 122.9 }
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.stores.length === 1 && group.isNearCluster === false)).toBe(true);
  });

  it('groups storefronts at the exact same coordinate', () => {
    const groups = buildAddressGroups([
      { slug: 'alpha', location_id: 1, latitude: 10.7, longitude: 122.5 },
      { slug: 'beta', location_id: 2, latitude: 10.7, longitude: 122.5 }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      groupKey: '10.700000:122.500000',
      latitude: 10.7,
      longitude: 122.5,
      isNearCluster: false
    });
    expect(groups[0].stores).toHaveLength(2);
  });

  it('groups storefronts within the 13 meter near-cluster radius, chained transitively', () => {
    expect(DISCOVERY_NEAR_CLUSTER_RADIUS_METERS).toBe(13);
    expect(getDistanceMeters(
      { latitude: 10.700000, longitude: 122.500000 },
      { latitude: 10.700080, longitude: 122.500000 }
    )).toBeLessThan(13);

    const groups = buildAddressGroups([
      { slug: 'alpha', location_id: 1, latitude: 10.700000, longitude: 122.500000 },
      { slug: 'beta', location_id: 2, latitude: 10.700080, longitude: 122.500000 },
      { slug: 'gamma', location_id: 3, latitude: 10.700220, longitude: 122.500000 }
    ]);

    expect(groups).toHaveLength(2);
    const nearCluster = groups.find((group) => group.isNearCluster);
    const soloGroup = groups.find((group) => !group.isNearCluster);
    expect(nearCluster.stores.map((store) => store.slug).sort()).toEqual(['alpha', 'beta']);
    expect(soloGroup.stores.map((store) => store.slug)).toEqual(['gamma']);
  });

  it('averages the group centroid for near-clusters instead of using the exact coordinate', () => {
    const groups = buildAddressGroups([
      { slug: 'alpha', location_id: 1, latitude: 10.700000, longitude: 122.500000 },
      { slug: 'beta', location_id: 2, latitude: 10.700080, longitude: 122.500000 }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].isNearCluster).toBe(true);
    expect(groups[0].latitude).toBeCloseTo(10.700040, 6);
    expect(groups[0].longitude).toBeCloseTo(122.500000, 6);
  });

  it('dedupes rows that share the same marker key before grouping', () => {
    const groups = buildAddressGroups([
      { slug: 'alpha', location_id: 7, latitude: 10.7212344, longitude: 122.5678912, tenant_name: 'Alpha' },
      { slug: 'alpha', location_id: 7, latitude: 10.7212344, longitude: 122.5678912, tenant_name: 'Alpha duplicate row' }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].stores).toHaveLength(1);
    expect(groups[0].stores[0].tenant_name).toBe('Alpha');
  });

  it('ignores stores with missing or invalid coordinates', () => {
    const groups = buildAddressGroups([
      { slug: 'alpha', location_id: 1, latitude: 10.7, longitude: 122.5 },
      { slug: 'no-coords', location_id: 2, latitude: null, longitude: undefined },
      { slug: 'nan-coords', location_id: 3, latitude: 'not-a-number', longitude: 122.5 }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].stores.map((store) => store.slug)).toEqual(['alpha']);
  });

  it('returns an empty array for empty or non-array input', () => {
    expect(buildAddressGroups([])).toEqual([]);
    expect(buildAddressGroups(undefined)).toEqual([]);
  });
});

describe('buildClusterInputFeatures', () => {
  it('builds one GeoJSON point per address group and a groupKey side-table', () => {
    const addressGroups = buildAddressGroups([
      { slug: 'alpha', location_id: 1, latitude: 10.7, longitude: 122.5 },
      { slug: 'beta', location_id: 2, latitude: 10.7, longitude: 122.5 },
      { slug: 'gamma', location_id: 3, latitude: 10.9, longitude: 122.9 }
    ]);

    const { featureCollection, groupsByKey } = buildClusterInputFeatures(addressGroups);

    expect(featureCollection.type).toBe('FeatureCollection');
    expect(featureCollection.features).toHaveLength(2);
    expect(featureCollection.features[0].geometry.coordinates).toEqual([122.5, 10.7]);
    expect(featureCollection.features[0].properties.addressCount).toBe(2);
    expect(groupsByKey.get(featureCollection.features[0].properties.groupKey)).toHaveLength(2);
    expect(groupsByKey.get(featureCollection.features[1].properties.groupKey)).toHaveLength(1);
  });

  it('returns an empty feature collection for empty input', () => {
    const { featureCollection, groupsByKey } = buildClusterInputFeatures([]);
    expect(featureCollection.features).toEqual([]);
    expect(groupsByKey.size).toBe(0);
  });
});

describe('partitionClusterFeatures', () => {
  it('splits cluster features from leaf features and dedupes by cluster_id/groupKey', () => {
    const rawFeatures = [
      { properties: { cluster: true, cluster_id: 5, point_count: 3 } },
      { properties: { cluster: true, cluster_id: 5, point_count: 3 } }, // tile-boundary duplicate
      { properties: { groupKey: 'alpha:loc:1' } },
      { properties: { groupKey: 'alpha:loc:1' } }, // tile-boundary duplicate
      { properties: { groupKey: 'beta:loc:2' } }
    ];

    const { clusters, leaves } = partitionClusterFeatures(rawFeatures);

    expect(clusters).toHaveLength(1);
    expect(leaves).toHaveLength(2);
    expect(leaves.map((leaf) => leaf.properties.groupKey)).toEqual(['alpha:loc:1', 'beta:loc:2']);
  });

  it('returns empty arrays for non-array input', () => {
    expect(partitionClusterFeatures(undefined)).toEqual({ clusters: [], leaves: [] });
  });
});

describe('flattenLeafStores', () => {
  it('resolves leaf features back to their address-group store arrays, deduped by groupKey', () => {
    const groupsByKey = new Map([
      ['alpha:loc:1', [{ slug: 'alpha' }]],
      ['beta:loc:2', [{ slug: 'beta-a' }, { slug: 'beta-b' }]]
    ]);
    const leaves = [
      { properties: { groupKey: 'alpha:loc:1' } },
      { properties: { groupKey: 'beta:loc:2' } },
      { properties: { groupKey: 'beta:loc:2' } } // duplicate should not double-count
    ];

    const stores = flattenLeafStores(leaves, groupsByKey);

    expect(stores.map((store) => store.slug)).toEqual(['alpha', 'beta-a', 'beta-b']);
  });

  it('ignores leaves with no matching group', () => {
    expect(flattenLeafStores([{ properties: { groupKey: 'missing' } }], new Map())).toEqual([]);
  });
});

describe('ensureClusterSource', () => {
  it('adds a cluster:true GeoJSON source with default tuning when none exists', () => {
    const addSource = vi.fn();
    const map = { getSource: vi.fn(() => undefined), addSource };

    const data = { type: 'FeatureCollection', features: [] };
    expect(ensureClusterSource(map, 'src-id', data)).toBe(true);
    expect(addSource).toHaveBeenCalledWith('src-id', expect.objectContaining({
      type: 'geojson',
      data,
      cluster: true,
      clusterRadius: DEFAULT_CLUSTER_RADIUS,
      clusterMaxZoom: DEFAULT_CLUSTER_MAX_ZOOM,
      clusterMinPoints: DEFAULT_CLUSTER_MIN_POINTS
    }));
  });

  it('updates data on an existing source instead of re-adding it', () => {
    const setData = vi.fn();
    const map = { getSource: vi.fn(() => ({ setData })), addSource: vi.fn() };

    const data = { type: 'FeatureCollection', features: [] };
    expect(ensureClusterSource(map, 'src-id', data)).toBe(true);
    expect(setData).toHaveBeenCalledWith(data);
    expect(map.addSource).not.toHaveBeenCalled();
  });

  it('honors custom tuning options', () => {
    const addSource = vi.fn();
    const map = { getSource: vi.fn(() => undefined), addSource };

    ensureClusterSource(map, 'src-id', { type: 'FeatureCollection', features: [] }, {
      clusterRadius: 80,
      clusterMaxZoom: 12,
      clusterMinPoints: 3
    });
    expect(addSource).toHaveBeenCalledWith('src-id', expect.objectContaining({
      clusterRadius: 80,
      clusterMaxZoom: 12,
      clusterMinPoints: 3
    }));
  });
});

describe('ensureClusterActivationLayer', () => {
  it('adds a fully transparent circle layer bound to the cluster source when none exists', () => {
    const addLayer = vi.fn();
    const map = { getLayer: vi.fn(() => undefined), addLayer };

    expect(ensureClusterActivationLayer(map, 'src-id')).toBe(true);
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID,
      type: 'circle',
      source: 'src-id',
      paint: { 'circle-radius': 0, 'circle-opacity': 0 }
    }));
  });

  it('does not re-add the layer if it already exists', () => {
    const addLayer = vi.fn();
    const map = { getLayer: vi.fn(() => ({ id: DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID })), addLayer };

    expect(ensureClusterActivationLayer(map, 'src-id')).toBe(true);
    expect(addLayer).not.toHaveBeenCalled();
  });
});

describe('getClustersForViewport', () => {
  it('queries the source and partitions the results', () => {
    const querySourceFeatures = vi.fn(() => [
      { properties: { cluster: true, cluster_id: 1, point_count: 2 } },
      { properties: { groupKey: 'alpha:loc:1' } }
    ]);
    const map = { querySourceFeatures };

    const { clusters, leaves } = getClustersForViewport(map, 'src-id');
    expect(querySourceFeatures).toHaveBeenCalledWith('src-id');
    expect(clusters).toHaveLength(1);
    expect(leaves).toHaveLength(1);
  });
});

describe('getExpansionZoom', () => {
  it('awaits the async getClusterExpansionZoom helper', async () => {
    const getClusterExpansionZoom = vi.fn().mockResolvedValue(14);
    const map = { getSource: vi.fn(() => ({ getClusterExpansionZoom })) };

    await expect(getExpansionZoom(map, 'src-id', 5)).resolves.toBe(14);
    expect(getClusterExpansionZoom).toHaveBeenCalledWith(5);
  });

  it('returns null when the source is unavailable', async () => {
    const map = { getSource: vi.fn(() => undefined) };
    await expect(getExpansionZoom(map, 'src-id', 5)).resolves.toBe(null);
  });
});

describe('getClusterStores', () => {
  it('awaits getClusterLeaves and flattens the result via the groupsByKey side-table', async () => {
    const getClusterLeaves = vi.fn().mockResolvedValue([
      { properties: { groupKey: 'alpha:loc:1' } }
    ]);
    const map = { getSource: vi.fn(() => ({ getClusterLeaves })) };
    const groupsByKey = new Map([['alpha:loc:1', [{ slug: 'alpha' }]]]);

    const stores = await getClusterStores(map, 'src-id', 5, 3, groupsByKey);
    expect(getClusterLeaves).toHaveBeenCalledWith(5, 3, 0);
    expect(stores).toEqual([{ slug: 'alpha' }]);
  });
});
