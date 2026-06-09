import { normalizeBusinessMode, renderBusinessModePinSpriteSvg, renderClusterPinSpriteSvg } from './businessModePins.js';
import { getDiscoveryMarkerKey } from './discoveryMapDom.js';

export const DISCOVERY_PIN_SOURCE_ID = 'dgfy-discovery-pins';
export const DISCOVERY_USER_SOURCE_ID = 'dgfy-discovery-user-location';
export const DISCOVERY_PIN_HALO_LAYER_ID = 'dgfy-discovery-pin-halo';
export const DISCOVERY_PIN_LAYER_ID = 'dgfy-discovery-pin-symbols';
export const DISCOVERY_USER_LAYER_ID = 'dgfy-discovery-user-location';

const PROVISIONED_PLACEHOLDER_COORDINATES = [
  { latitude: 10.699817, longitude: 122.559893 }
];

export const isKnownProvisionedPlaceholderCoordinate = (latitude, longitude) => (
  PROVISIONED_PLACEHOLDER_COORDINATES.some((coordinate) => (
    Math.abs(Number(latitude) - coordinate.latitude) < 0.000001
    && Math.abs(Number(longitude) - coordinate.longitude) < 0.000001
  ))
);

const svgToDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const getDiscoveryPinIconId = ({ type = 'store', mode = 'food_manufacturing', count = 1, selected = false } = {}) => {
  if (type === 'cluster') {
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(1, Math.min(99, Number(count))) : 1;
    return `dgfy-cluster-${normalizedCount}-${selected ? 'selected' : 'normal'}`;
  }
  return `dgfy-pin-${normalizeBusinessMode(mode)}-${selected ? 'selected' : 'normal'}`;
};

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

  const coordinateGroups = uniqueRows.reduce((acc, store) => {
    const lat = Number(store?.latitude);
    const lng = Number(store?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;
    const key = `${lat.toFixed(6)}:${lng.toFixed(6)}`;
    if (!Array.isArray(acc[key])) acc[key] = [];
    acc[key].push(store);
    return acc;
  }, {});

  return { uniqueRows, coordinateGroups };
};

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
  const { uniqueRows, coordinateGroups } = buildCoordinateGroups(rows);
  const renderedCoordinateGroups = new Set();
  const groups = [];
  const features = [];
  const bounds = [];
  const requiredImages = new Map();

  uniqueRows.forEach((store) => {
    const lat = Number(store?.latitude);
    const lng = Number(store?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (isKnownProvisionedPlaceholderCoordinate(lat, lng)) return;
    const coordinateKey = `${lat.toFixed(6)}:${lng.toFixed(6)}`;
    if (renderedCoordinateGroups.has(coordinateKey)) return;
    renderedCoordinateGroups.add(coordinateKey);
    const group = Array.isArray(coordinateGroups[coordinateKey]) ? coordinateGroups[coordinateKey] : [];
    if (group.length === 0) return;

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
      lat,
      lng,
      markerKey,
      highlighted
    });
    bounds.push([lng, lat]);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        coordinateKey,
        iconId,
        markerKey,
        type: isCluster ? 'cluster' : 'store',
        count: group.length,
        highlighted
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
      data: { type: 'FeatureCollection', features: [] }
    });
  }
  if (typeof map.getLayer === 'function' && !map.getLayer(DISCOVERY_PIN_HALO_LAYER_ID) && typeof map.addLayer === 'function') {
    map.addLayer({
      id: DISCOVERY_PIN_HALO_LAYER_ID,
      type: 'circle',
      source: DISCOVERY_PIN_SOURCE_ID,
      filter: ['==', ['get', 'highlighted'], true],
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
