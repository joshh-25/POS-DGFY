import { normalizeBusinessMode, renderBusinessModePinSpriteSvg, renderClusterPinSpriteSvg } from './businessModePins.js';
import { getDiscoveryMarkerKey } from './discoveryMapDom.js';

export const DISCOVERY_PIN_SOURCE_ID = 'dgfy-discovery-pins';
export const DISCOVERY_USER_SOURCE_ID = 'dgfy-discovery-user-location';
export const DISCOVERY_PIN_HALO_LAYER_ID = 'dgfy-discovery-pin-halo';
export const DISCOVERY_PIN_LAYER_ID = 'dgfy-discovery-pin-symbols';
export const DISCOVERY_USER_LAYER_ID = 'dgfy-discovery-user-location';
export const DISCOVERY_DENSITY_CLUSTER_LAYER_ID = 'dgfy-discovery-density-cluster';
export const DISCOVERY_DENSITY_CLUSTER_LABEL_LAYER_ID = 'dgfy-discovery-density-cluster-label';

// Zoom-based density clustering (Tier 2) groups distinct, nearby-but-not-identical
// locations that visually overlap at the current zoom. It runs on top of the
// exact/near-coordinate "same address" grouping (Tier 1, buildCoordinateGroups
// below) rather than replacing it — see plan/PIN_CLUSTERING_IMPLEMENTATION_PLAN.md.
export const DISCOVERY_CLUSTER_RADIUS = 60;
export const DISCOVERY_CLUSTER_MAX_ZOOM = 14;
export const DISCOVERY_CLUSTER_MIN_POINTS = 2;

const PROVISIONED_PLACEHOLDER_COORDINATES = [
  { latitude: 10.699817, longitude: 122.559893 }
];
export const DISCOVERY_NEAR_CLUSTER_RADIUS_METERS = 13;
const EARTH_RADIUS_METERS = 6371000;

export const isKnownProvisionedPlaceholderCoordinate = (latitude, longitude) => (
  PROVISIONED_PLACEHOLDER_COORDINATES.some((coordinate) => (
    Math.abs(Number(latitude) - coordinate.latitude) < 0.000001
    && Math.abs(Number(longitude) - coordinate.longitude) < 0.000001
  ))
);

// A store is only plottable when it has real, finite coordinates that are not
// "null island" (0,0). The discovery list API returns latitude/longitude as
// null for stores with no location (empty tenant_locations); upstream builders
// coerce those nulls to 0 (Number(null) === 0), which is finite and would slip
// past a plain Number.isFinite check — so location-less stores must be rejected
// here to keep them off the map.
export const hasPlottableCoordinate = (latitude, longitude) => {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  if (isKnownProvisionedPlaceholderCoordinate(lat, lng)) return false;
  return true;
};

const svgToDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const getDiscoveryPinIconId = ({ type = 'store', mode = 'food_manufacturing', count = 1, selected = false } = {}) => {
  if (type === 'cluster') {
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(1, Math.min(99, Number(count))) : 1;
    return `dgfy-cluster-${normalizedCount}-${selected ? 'selected' : 'normal'}`;
  }
  return `dgfy-pin-${normalizeBusinessMode(mode)}-${selected ? 'selected' : 'normal'}`;
};

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

const buildCoordinateGroups = (rows) => {
  const uniqueRows = [];
  const seenMarkerKeys = new Set();
  rows.forEach((store) => {
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

  const validRows = uniqueRows
    .map((store) => {
      if (!hasPlottableCoordinate(store?.latitude, store?.longitude)) return null;
      const lat = Number(store?.latitude);
      const lng = Number(store?.longitude);
      return {
        store,
        latitude: lat,
        longitude: lng,
        coordinateKey: getCoordinateKey(lat, lng),
        isPlaceholder: isKnownProvisionedPlaceholderCoordinate(lat, lng)
      };
    })
    .filter(Boolean);

  const groups = [];
  validRows.forEach((entry) => {
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

  const coordinateGroups = groups.reduce((acc, group, index) => {
    const groupEntries = group.entries;
    if (!Array.isArray(groupEntries) || groupEntries.length === 0) return acc;
    const exactCoordinateKey = groupEntries.every((entry) => entry.coordinateKey === groupEntries[0].coordinateKey)
      ? groupEntries[0].coordinateKey
      : '';
    const latitude = exactCoordinateKey
      ? groupEntries[0].latitude
      : groupEntries.reduce((sum, entry) => sum + entry.latitude, 0) / groupEntries.length;
    const longitude = exactCoordinateKey
      ? groupEntries[0].longitude
      : groupEntries.reduce((sum, entry) => sum + entry.longitude, 0) / groupEntries.length;
    const key = exactCoordinateKey || `near:${index}:${getCoordinateKey(latitude, longitude)}`;
    acc[key] = {
      coordinateKey: key,
      displayLatitude: latitude,
      displayLongitude: longitude,
      exactCoordinateKey,
      isPlaceholderGroup: groupEntries.every((entry) => entry.isPlaceholder),
      stores: groupEntries.map((entry) => entry.store)
    };
    return acc;
  }, {});

  const rowGroupKeys = validRows.reduce((acc, entry) => {
    const groupKey = Object.keys(coordinateGroups).find((key) => (
      coordinateGroups[key].stores.includes(entry.store)
    ));
    if (groupKey) acc.set(entry.store, groupKey);
    return acc;
  }, new Map());

  return { uniqueRows, coordinateGroups, rowGroupKeys };
};

const buildExactCoordinateGroups = (uniqueRows) => (
  uniqueRows.reduce((acc, store) => {
    const lat = Number(store?.latitude);
    const lng = Number(store?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;
    const key = getCoordinateKey(lat, lng);
    if (!Array.isArray(acc[key])) acc[key] = [];
    acc[key].push(store);
    return acc;
  }, {})
);

export const buildDiscoveryPinLayerModel = ({
  stores = [],
  selectedKey = '',
  highlightedKeys = []
} = {}) => {
  const rows = Array.isArray(stores) ? stores : [];
  const selectedMarkerKey = String(selectedKey || '').trim();
  const highlightedKeySet = new Set(
    (Array.isArray(highlightedKeys) ? highlightedKeys : [])
      .map((key) => String(key || '').trim())
      .filter(Boolean)
  );
  const { uniqueRows, coordinateGroups, rowGroupKeys } = buildCoordinateGroups(rows);
  const exactCoordinateGroups = buildExactCoordinateGroups(uniqueRows);
  const renderedCoordinateGroups = new Set();
  const groups = [];
  const features = [];
  const bounds = [];
  const requiredImages = new Map();

  uniqueRows.forEach((store) => {
    if (!hasPlottableCoordinate(store?.latitude, store?.longitude)) return;
    const lat = Number(store?.latitude);
    const lng = Number(store?.longitude);
    const rowCoordinateKey = getCoordinateKey(lat, lng);
    const coordinateKey = rowGroupKeys.get(store) || rowCoordinateKey;
    if (renderedCoordinateGroups.has(coordinateKey)) return;
    renderedCoordinateGroups.add(coordinateKey);
    const coordinateGroup = coordinateGroups[coordinateKey];
    const group = Array.isArray(coordinateGroup?.stores) ? coordinateGroup.stores : [];
    if (group.length === 0) return;
    const isPlaceholderGroup = coordinateGroup?.isPlaceholderGroup === true;
    if (isPlaceholderGroup && group.length < 2) return;

    const selected = selectedMarkerKey
      ? group.some((entry) => String(getDiscoveryMarkerKey(entry) || '') === selectedMarkerKey)
      : group.some((entry) => entry?.is_primary_storefront === true);
    const highlighted = group.some((entry) => highlightedKeySet.has(String(getDiscoveryMarkerKey(entry) || ''))) || selected;
    const isCluster = group.length > 1;
    const [singleStore] = group;
    const markerKey = isCluster
      ? coordinateKey
      : getDiscoveryMarkerKey(singleStore) || `${lat}:${lng}`;
    const mode = singleStore?.workflow_mode || singleStore?.business_mode || 'food_manufacturing';
    const iconId = getDiscoveryPinIconId({
      type: isCluster ? 'cluster' : 'store',
      mode,
      count: group.length,
      selected: highlighted
    });
    requiredImages.set(iconId, isCluster
      ? renderClusterPinSpriteSvg(group.length, highlighted)
      : renderBusinessModePinSpriteSvg(mode, highlighted));
    groups.push({
      coordinateKey,
      group,
      isCluster,
      lat: Number(coordinateGroup?.displayLatitude ?? lat),
      lng: Number(coordinateGroup?.displayLongitude ?? lng),
      markerKey,
      highlighted
    });
    bounds.push([Number(coordinateGroup?.displayLongitude ?? lng), Number(coordinateGroup?.displayLatitude ?? lat)]);
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(coordinateGroup?.displayLongitude ?? lng), Number(coordinateGroup?.displayLatitude ?? lat)]
      },
      properties: {
        coordinateKey,
        iconId,
        markerKey,
        type: isCluster ? 'cluster' : 'store',
        count: group.length,
        highlighted,
        nearCluster: !coordinateGroup?.exactCoordinateKey,
        placeholderCluster: isPlaceholderGroup,
        exactCoordinateCount: Array.isArray(exactCoordinateGroups[rowCoordinateKey]) ? exactCoordinateGroups[rowCoordinateKey].length : 1
      }
    });
  });

  return {
    bounds,
    groups,
    requiredImages: Array.from(requiredImages.entries()).map(([id, svg]) => ({ id, svg })),
    sourceData: {
      type: 'FeatureCollection',
      features
    }
  };
};

export const buildUserLocationSourceData = (userLocation = null) => {
  const lat = Number(userLocation?.latitude);
  const lng = Number(userLocation?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { type: 'user' }
    }]
  };
};

export const ensureMapImage = (map, id, svg) => new Promise((resolve) => {
  if (!map || !id || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') {
    resolve(false);
    return;
  }
  if (map.hasImage(id)) {
    resolve(true);
    return;
  }
  if (typeof window === 'undefined' || typeof window.Image !== 'function') {
    resolve(false);
    return;
  }
  const image = new window.Image(38, 48);
  image.onload = () => {
    try {
      if (!map.hasImage(id)) {
        map.addImage(id, image, { pixelRatio: 1 });
      }
      resolve(true);
    } catch {
      resolve(false);
    }
  };
  image.onerror = () => resolve(false);
  image.src = svgToDataUrl(svg);
});

export const ensureDiscoveryMapLayers = (map) => {
  if (!map) return false;
  if (typeof map.getSource === 'function' && !map.getSource(DISCOVERY_USER_SOURCE_ID) && typeof map.addSource === 'function') {
    map.addSource(DISCOVERY_USER_SOURCE_ID, {
      type: 'geojson',
      data: buildUserLocationSourceData(null)
    });
  }
  if (typeof map.getLayer === 'function' && !map.getLayer(DISCOVERY_USER_LAYER_ID) && typeof map.addLayer === 'function') {
    map.addLayer({
      id: DISCOVERY_USER_LAYER_ID,
      type: 'circle',
      source: DISCOVERY_USER_SOURCE_ID,
      paint: {
        'circle-radius': 10,
        'circle-color': '#1a4e8d',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
        'circle-blur': 0,
        'circle-opacity': 1
      }
    });
  }
  if (typeof map.getSource === 'function' && !map.getSource(DISCOVERY_PIN_SOURCE_ID) && typeof map.addSource === 'function') {
    map.addSource(DISCOVERY_PIN_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterRadius: DISCOVERY_CLUSTER_RADIUS,
      clusterMaxZoom: DISCOVERY_CLUSTER_MAX_ZOOM,
      clusterMinPoints: DISCOVERY_CLUSTER_MIN_POINTS,
      clusterProperties: {
        storeCount: ['+', ['get', 'count']],
        anyHighlighted: ['any', ['get', 'highlighted']]
      }
    });
  }
  if (typeof map.getLayer === 'function' && !map.getLayer(DISCOVERY_DENSITY_CLUSTER_LAYER_ID) && typeof map.addLayer === 'function') {
    map.addLayer({
      id: DISCOVERY_DENSITY_CLUSTER_LAYER_ID,
      type: 'circle',
      source: DISCOVERY_PIN_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 25, 25],
        'circle-color': '#1a4e8d',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
        'circle-opacity': 0.92
      }
    });
  }
  if (typeof map.getLayer === 'function' && !map.getLayer(DISCOVERY_DENSITY_CLUSTER_LABEL_LAYER_ID) && typeof map.addLayer === 'function') {
    map.addLayer({
      id: DISCOVERY_DENSITY_CLUSTER_LABEL_LAYER_ID,
      type: 'symbol',
      source: DISCOVERY_PIN_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['to-string', ['get', 'storeCount']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 13,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#ffffff'
      }
    });
  }
  if (typeof map.getLayer === 'function' && !map.getLayer(DISCOVERY_PIN_HALO_LAYER_ID) && typeof map.addLayer === 'function') {
    map.addLayer({
      id: DISCOVERY_PIN_HALO_LAYER_ID,
      type: 'circle',
      source: DISCOVERY_PIN_SOURCE_ID,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'highlighted'], true]],
      paint: {
        'circle-radius': 28,
        'circle-color': '#1a4e8d',
        'circle-opacity': 0.16,
        'circle-blur': 0.45,
        'circle-translate': [0, -24],
        'circle-translate-anchor': 'viewport'
      }
    });
  }
  if (typeof map.getLayer === 'function' && !map.getLayer(DISCOVERY_PIN_LAYER_ID) && typeof map.addLayer === 'function') {
    map.addLayer({
      id: DISCOVERY_PIN_LAYER_ID,
      type: 'symbol',
      source: DISCOVERY_PIN_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'iconId'],
        'icon-anchor': 'bottom',
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-optional': false
      }
    });
  }
  return true;
};

export const setGeoJsonSourceData = (map, sourceId, data) => {
  const source = typeof map?.getSource === 'function' ? map.getSource(sourceId) : null;
  if (source && typeof source.setData === 'function') {
    source.setData(data);
    return true;
  }
  return false;
};

// Shared maplibre source/layer for drawing a line between two points — used by
// both order tracking (store -> customer, straight line today) and the
// discovery map (customer -> selected store, real GraphHopper route).
export const ROUTE_LINE_SOURCE_ID = 'dgfy-route-line';
export const ROUTE_LINE_LAYER_ID = 'dgfy-route-line-layer';

export const buildRouteLineGeoJson = (geometry) => {
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry }]
  };
};

export const ensureRouteLineLayer = (map, {
  sourceId = ROUTE_LINE_SOURCE_ID,
  layerId = ROUTE_LINE_LAYER_ID,
  color = '#1a4e8d',
  width = 4,
  dashArray = null,
  beforeId
} = {}) => {
  if (!map) return false;
  if (typeof map.getSource === 'function' && !map.getSource(sourceId) && typeof map.addSource === 'function') {
    map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (typeof map.getLayer === 'function' && !map.getLayer(layerId) && typeof map.addLayer === 'function') {
    const paint = { 'line-color': color, 'line-width': width };
    if (dashArray) paint['line-dasharray'] = dashArray;
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint
    }, beforeId);
  }
  return true;
};

export const setRouteLineData = (map, geometry, { sourceId = ROUTE_LINE_SOURCE_ID } = {}) => (
  setGeoJsonSourceData(map, sourceId, buildRouteLineGeoJson(geometry))
);
