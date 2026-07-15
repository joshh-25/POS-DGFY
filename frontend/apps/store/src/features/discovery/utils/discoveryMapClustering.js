import { getDiscoveryMarkerKey } from '../../../discoveryMapDom.js';

export const DISCOVERY_NEAR_CLUSTER_RADIUS_METERS = 13;
const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => Number(degrees) * (Math.PI / 180);

export const getDistanceMeters = (left, right) => {
  const leftLat = Number(left?.latitude);
  const leftLng = Number(left?.longitude);
  const rightLat = Number(right?.latitude);
  const rightLng = Number(right?.longitude);
  if (![leftLat, leftLng, rightLat, rightLng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const deltaLat = toRadians(rightLat - leftLat);
  const deltaLng = toRadians(rightLng - leftLng);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(leftLat)) * Math.cos(toRadians(rightLat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getCoordinateKey = (latitude, longitude) => `${Number(latitude).toFixed(6)}:${Number(longitude).toFixed(6)}`;

const dedupeByMarkerKey = (stores) => {
  const uniqueRows = [];
  const seenMarkerKeys = new Set();
  stores.forEach((store) => {
    if (!store) return;
    const markerKey = getDiscoveryMarkerKey(store);
    if (!markerKey) {
      uniqueRows.push(store);
      return;
    }
    if (seenMarkerKeys.has(markerKey)) return;
    seenMarkerKeys.add(markerKey);
    uniqueRows.push(store);
  });
  return uniqueRows;
};

// Groups stores at the same physical address: identical coordinates, or within
// DISCOVERY_NEAR_CLUSTER_RADIUS_METERS of any other member already in the group
// (transitive chaining, not just distance-to-centroid) — mirrors a mall/building
// with multiple storefronts sharing one entrance-area GPS fix.
export const buildAddressGroups = (stores) => {
  const rows = Array.isArray(stores) ? stores : [];
  const uniqueRows = dedupeByMarkerKey(rows);

  const validEntries = uniqueRows
    .map((store) => {
      const latitude = Number(store?.latitude);
      const longitude = Number(store?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { store, latitude, longitude, coordinateKey: getCoordinateKey(latitude, longitude) };
    })
    .filter(Boolean);

  const groups = [];
  validEntries.forEach((entry) => {
    const matchingGroup = groups.find((group) => (
      group.entries.some((existing) => existing.coordinateKey === entry.coordinateKey)
      || group.entries.some((existing) => getDistanceMeters(existing, entry) <= DISCOVERY_NEAR_CLUSTER_RADIUS_METERS)
    ));
    if (matchingGroup) {
      matchingGroup.entries.push(entry);
      return;
    }
    groups.push({ entries: [entry] });
  });

  return groups.map((group, index) => {
    const entries = group.entries;
    const allExactMatch = entries.every((entry) => entry.coordinateKey === entries[0].coordinateKey);
    const latitude = allExactMatch
      ? entries[0].latitude
      : entries.reduce((sum, entry) => sum + entry.latitude, 0) / entries.length;
    const longitude = allExactMatch
      ? entries[0].longitude
      : entries.reduce((sum, entry) => sum + entry.longitude, 0) / entries.length;
    const groupKey = allExactMatch ? entries[0].coordinateKey : `near:${index}:${getCoordinateKey(latitude, longitude)}`;
    return {
      groupKey,
      latitude,
      longitude,
      isNearCluster: !allExactMatch,
      stores: entries.map((entry) => entry.store)
    };
  });
};

// --- Zoom/density clustering engine -----------------------------------
//
// Uses MapLibre's native `cluster: true` GeoJSON source purely as a
// Supercluster-backed clustering *engine* — this source is never rendered
// with addLayer. StoresMap.jsx reads its output via querySourceFeatures and
// syncs its own maplibregl.Marker DOM elements, preserving the existing
// rich pin/popup UX. Each input feature is one *address group* (the output
// of buildAddressGroups), not one raw store — an "address" cluster nested
// inside a density cluster is resolved back to its full store list via the
// groupsByKey side-table built here.

export const DISCOVERY_DENSITY_CLUSTER_SOURCE_ID = 'dgfy-discovery-density-clusters';
export const DEFAULT_CLUSTER_RADIUS = 50;
export const DEFAULT_CLUSTER_MAX_ZOOM = 15;
export const DEFAULT_CLUSTER_MIN_POINTS = 2;

export const buildClusterInputFeatures = (addressGroups) => {
  const groups = Array.isArray(addressGroups) ? addressGroups : [];
  const groupsByKey = new Map();
  const features = groups.map((group, index) => {
    groupsByKey.set(group.groupKey, group.stores);
    return {
      type: 'Feature',
      id: index,
      geometry: { type: 'Point', coordinates: [group.longitude, group.latitude] },
      properties: { groupKey: group.groupKey, addressCount: group.stores.length }
    };
  });
  return {
    featureCollection: { type: 'FeatureCollection', features },
    groupsByKey
  };
};

// querySourceFeatures is tile-based and can return the same feature more
// than once near tile boundaries — dedupe clusters by cluster_id and leaves
// by groupKey before handing results to the marker-sync effect.
export const partitionClusterFeatures = (rawFeatures) => {
  const features = Array.isArray(rawFeatures) ? rawFeatures : [];
  const seenClusterIds = new Set();
  const seenGroupKeys = new Set();
  const clusters = [];
  const leaves = [];
  features.forEach((feature) => {
    const props = feature?.properties || {};
    if (props.cluster) {
      const clusterId = props.cluster_id;
      if (clusterId != null && seenClusterIds.has(clusterId)) return;
      if (clusterId != null) seenClusterIds.add(clusterId);
      clusters.push(feature);
      return;
    }
    const groupKey = props.groupKey;
    if (groupKey != null) {
      if (seenGroupKeys.has(groupKey)) return;
      seenGroupKeys.add(groupKey);
    }
    leaves.push(feature);
  });
  return { clusters, leaves };
};

// Resolves cluster leaves (address-group features) back to their full store
// arrays via the groupsByKey side-table, deduped by groupKey.
export const flattenLeafStores = (leafFeatures, groupsByKey) => {
  const features = Array.isArray(leafFeatures) ? leafFeatures : [];
  const groups = groupsByKey instanceof Map ? groupsByKey : new Map();
  const stores = [];
  const seenGroupKeys = new Set();
  features.forEach((feature) => {
    const groupKey = feature?.properties?.groupKey;
    if (groupKey == null || seenGroupKeys.has(groupKey)) return;
    seenGroupKeys.add(groupKey);
    const groupStores = groups.get(groupKey);
    if (Array.isArray(groupStores)) stores.push(...groupStores);
  });
  return stores;
};

export const ensureClusterSource = (map, sourceId, featureCollection, options = {}) => {
  if (!map || typeof map.getSource !== 'function') return false;
  const existingSource = map.getSource(sourceId);
  if (existingSource) {
    if (typeof existingSource.setData === 'function') existingSource.setData(featureCollection);
    return true;
  }
  if (typeof map.addSource !== 'function') return false;
  map.addSource(sourceId, {
    type: 'geojson',
    data: featureCollection,
    cluster: true,
    clusterRadius: options.clusterRadius ?? DEFAULT_CLUSTER_RADIUS,
    clusterMaxZoom: options.clusterMaxZoom ?? DEFAULT_CLUSTER_MAX_ZOOM,
    clusterMinPoints: options.clusterMinPoints ?? DEFAULT_CLUSTER_MIN_POINTS
  });
  return true;
};

export const DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID = 'dgfy-discovery-density-clusters-activation';

// MapLibre's tile/data-loading scheduler processes a source based on the
// layers that reference it. Since this cluster source is deliberately never
// given a visible GPU layer (clusters render as DOM markers), bind one
// fully transparent circle layer so the source's Supercluster index still
// gets built/kept in sync — zero visual/perf cost, but keeps
// querySourceFeatures/getClusterExpansionZoom/getClusterLeaves reliable.
export const ensureClusterActivationLayer = (map, sourceId, layerId = DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID) => {
  if (!map || typeof map.getLayer !== 'function' || typeof map.addLayer !== 'function') return false;
  if (map.getLayer(layerId)) return true;
  map.addLayer({
    id: layerId,
    type: 'circle',
    source: sourceId,
    paint: { 'circle-radius': 0, 'circle-opacity': 0 }
  });
  return true;
};

export const getClustersForViewport = (map, sourceId) => {
  if (!map || typeof map.querySourceFeatures !== 'function') return { clusters: [], leaves: [] };
  return partitionClusterFeatures(map.querySourceFeatures(sourceId));
};

// getClusterExpansionZoom/getClusterLeaves are async in MapLibre v5 — callers must await.
export const getExpansionZoom = async (map, sourceId, clusterId) => {
  const source = map?.getSource?.(sourceId);
  if (!source || typeof source.getClusterExpansionZoom !== 'function') return null;
  return source.getClusterExpansionZoom(clusterId);
};

export const getClusterStores = async (map, sourceId, clusterId, pointCount, groupsByKey) => {
  const source = map?.getSource?.(sourceId);
  if (!source || typeof source.getClusterLeaves !== 'function') return [];
  const leaves = await source.getClusterLeaves(clusterId, pointCount, 0);
  return flattenLeafStores(leaves, groupsByKey);
};
