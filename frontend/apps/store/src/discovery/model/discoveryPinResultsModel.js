function scorePin(pin) {
  let score = 0;
  if (pin?.is_primary_storefront === true) score += 5;
  if (Number.isFinite(Number(pin?.location_id)) && Number(pin.location_id) > 0) score += 4;
  if (pin?.address_line) score += 2;
  if (pin?.location_name) score += 1;
  return score;
}

function getLocationIdentity(location, toSlug) {
  const numericLocationId = Number(location.location_id);
  return Number.isInteger(numericLocationId) && numericLocationId > 0
    ? `loc:${numericLocationId}`
    : `coord:${Number(location.latitude).toFixed(6)}:${Number(location.longitude).toFixed(6)}:${toSlug(location?.name || '')}`;
}

export function buildDiscoveryMapPins({
  discoveryCoords,
  discoveryLocationMap,
  discoveryPinScope,
  filteredDiscoveryStores,
  haversineDistanceKm,
  search,
  selectDiscoveryPinLocations,
  toNumberOrNull,
  toSlug
}) {
  const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
  const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
  const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
  const hasSearchQuery = search.trim().length > 0;
  const pins = [];

  filteredDiscoveryStores.forEach((store) => {
    const slug = toSlug(store?.slug);
    const locationBundle = discoveryLocationMap[slug] || {};
    const locations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
    const activeWithCoords = locations
      .filter((location) => location?.is_active !== false)
      .map((location) => ({
        ...location,
        latitude: toNumberOrNull(location?.latitude),
        longitude: toNumberOrNull(location?.longitude)
      }))
      .filter((location) => location.latitude != null && location.longitude != null);
    const matchingLocationIds = Array.isArray(store?.matching_location_ids)
      ? store.matching_location_ids
        .map((locationId) => Number(locationId))
        .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
      : [];
    const nearestMatchingLocationId = Number(store?.nearest_matching_location_id);
    const nearestMatchingLocation = Number.isInteger(nearestMatchingLocationId)
      ? (activeWithCoords.find((location) => Number(location.location_id) === nearestMatchingLocationId) || null)
      : null;
    const hasUnresolvedIndexedLocation = Number.isInteger(nearestMatchingLocationId)
      && nearestMatchingLocationId > 0
      && !nearestMatchingLocation;
    if (activeWithCoords.length === 0 || hasUnresolvedIndexedLocation) {
      const lat = toNumberOrNull(store?.latitude);
      const lng = toNumberOrNull(store?.longitude);
      if (lat == null || lng == null) return;
      const fallbackLocationId = store?.location_id ?? nearestMatchingLocationId ?? null;
      pins.push({
        ...store,
        marker_key: `${slug}:${fallbackLocationId || 'fallback'}`,
        latitude: lat,
        longitude: lng,
        location_id: fallbackLocationId,
        location_name: store?.nearest_location_name || store?.tenant_name,
        branch_label: 'Storefront pin',
        distance_km: Number.isFinite(Number(store?.nearest_distance_km)) ? Number(store.nearest_distance_km) : null
      });
      return;
    }

    const scopedLocations = selectDiscoveryPinLocations({
      activeLocations: activeWithCoords,
      hasSearchQuery,
      pinScope: discoveryPinScope,
      matchingLocationIds,
      nearestMatchingLocationId: nearestMatchingLocation?.location_id ?? null
    });
    const scopedLocationMap = new globalThis.Map();
    scopedLocations.forEach((location) => {
      if (!location) return;
      const locationIdentity = getLocationIdentity(location, toSlug);
      const current = scopedLocationMap.get(locationIdentity);
      if (!current || location?.is_primary_storefront === true) {
        scopedLocationMap.set(locationIdentity, location);
      }
    });
    Array.from(scopedLocationMap.values()).forEach((location) => {
      const numericLocationId = Number(location.location_id);
      const stableLocationId = Number.isInteger(numericLocationId) && numericLocationId > 0
        ? String(numericLocationId)
        : `${Number(location.latitude).toFixed(6)}:${Number(location.longitude).toFixed(6)}`;
      pins.push({
        ...store,
        marker_key: `${slug}:${stableLocationId}`,
        location_id: location.location_id,
        location_name: location.name || store?.tenant_name,
        address_line: location.address_line || store?.address_line || '',
        latitude: location.latitude,
        longitude: location.longitude,
        is_primary_storefront: location.is_primary_storefront === true,
        branch_label: location.is_primary_storefront ? 'Primary branch' : 'Branch',
        distance_km: hasDiscoveryLocation
          ? haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
          : null
      });
    });
  });

  return dedupeAndSortPins(pins, toSlug);
}

export function buildFallbackDiscoveryMapPins({ filteredDiscoveryStores, toNumberOrNull, toSlug }) {
  return (Array.isArray(filteredDiscoveryStores) ? filteredDiscoveryStores : [])
    .map((store) => {
      const lat = toNumberOrNull(store?.latitude);
      const lng = toNumberOrNull(store?.longitude);
      if (lat == null || lng == null) return null;
      const slug = toSlug(store?.slug || store?.tenant_name);
      return {
        ...store,
        marker_key: `${slug || 'store'}:anchor`,
        latitude: lat,
        longitude: lng,
        location_id: store?.nearest_location_id ?? store?.location_id ?? null,
        location_name: store?.nearest_location_name || store?.tenant_name || 'Storefront',
        address_line: store?.address_line || '',
        is_primary_storefront: true,
        branch_label: 'Storefront pin',
        distance_km: Number.isFinite(Number(store?.nearest_distance_km)) ? Number(store.nearest_distance_km) : null
      };
    })
    .filter(Boolean);
}

export function buildHeroDiscoveryMapPins({
  discoveryCoords,
  discoveryLocationMap,
  haversineDistanceKm,
  storesWithNearestBranch,
  toNumberOrNull,
  toSlug
}) {
  const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
  const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
  const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
  const pins = [];

  (Array.isArray(storesWithNearestBranch) ? storesWithNearestBranch : []).forEach((store) => {
    const slug = toSlug(store?.slug || store?.tenant_name);
    const locationBundle = discoveryLocationMap[slug] || {};
    const activeLocations = (Array.isArray(locationBundle.locations) ? locationBundle.locations : [])
      .filter((location) => location?.is_active !== false)
      .map((location) => ({
        ...location,
        latitude: toNumberOrNull(location?.latitude),
        longitude: toNumberOrNull(location?.longitude)
      }))
      .filter((location) => location.latitude != null && location.longitude != null);

    if (activeLocations.length === 0) {
      const lat = toNumberOrNull(store?.latitude);
      const lng = toNumberOrNull(store?.longitude);
      if (lat == null || lng == null) return;
      pins.push({
        ...store,
        marker_key: `${slug || 'store'}:hero-anchor`,
        latitude: lat,
        longitude: lng,
        location_id: store?.nearest_location_id ?? store?.location_id ?? null,
        location_name: store?.nearest_location_name || store?.tenant_name || 'Storefront',
        address_line: store?.address_line || '',
        is_primary_storefront: true,
        branch_label: store?.nearest_is_primary ? 'Primary branch' : 'Storefront pin',
        distance_km: Number.isFinite(Number(store?.nearest_distance_km)) ? Number(store.nearest_distance_km) : null
      });
      return;
    }

    const uniqueLocationMap = new globalThis.Map();
    activeLocations.forEach((location) => {
      const numericLocationId = Number(location.location_id);
      const identity = Number.isInteger(numericLocationId) && numericLocationId > 0
        ? `loc:${numericLocationId}`
        : `coord:${Number(location.latitude).toFixed(6)}:${Number(location.longitude).toFixed(6)}`;
      const current = uniqueLocationMap.get(identity);
      if (!current || location?.is_primary_storefront === true) {
        uniqueLocationMap.set(identity, location);
      }
    });

    Array.from(uniqueLocationMap.values()).forEach((location) => {
      const numericLocationId = Number(location.location_id);
      const stableLocationId = Number.isInteger(numericLocationId) && numericLocationId > 0
        ? String(numericLocationId)
        : `${Number(location.latitude).toFixed(6)}:${Number(location.longitude).toFixed(6)}`;
      pins.push({
        ...store,
        marker_key: `${slug || 'store'}:hero:${stableLocationId}`,
        latitude: location.latitude,
        longitude: location.longitude,
        location_id: location.location_id ?? null,
        location_name: location.name || store?.tenant_name || 'Storefront',
        address_line: location.address_line || store?.address_line || '',
        is_primary_storefront: location.is_primary_storefront === true,
        branch_label: location.is_primary_storefront === true ? 'Primary branch' : 'Branch',
        distance_km: hasDiscoveryLocation
          ? haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
          : null
      });
    });
  });

  return dedupeAndSortPins(pins, toSlug, { keepFirst: true });
}

export function groupDiscoveryPinsBySlug({ discoveryMapPins, toSlug }) {
  const map = {};
  discoveryMapPins.forEach((pin) => {
    const slug = toSlug(pin?.slug);
    if (!slug) return;
    if (!Array.isArray(map[slug])) {
      map[slug] = [];
    }
    map[slug].push(pin);
  });
  return map;
}

function dedupeAndSortPins(pins, toSlug, options = {}) {
  const uniquePins = [];
  const seenPinKeys = new globalThis.Map();
  pins.forEach((pin) => {
    if (!pin) return;
    const numericLocationId = Number(pin.location_id);
    const dedupeKey = Number.isInteger(numericLocationId) && numericLocationId > 0
      ? `${pin.slug || toSlug(pin?.tenant_name)}:loc:${numericLocationId}`
      : `${pin.slug || toSlug(pin?.tenant_name)}:coord:${Number(pin.latitude).toFixed(6)}:${Number(pin.longitude).toFixed(6)}`;
    const existingIndex = seenPinKeys.get(dedupeKey);
    if (existingIndex == null) {
      seenPinKeys.set(dedupeKey, uniquePins.length);
      uniquePins.push(pin);
      return;
    }
    if (!options.keepFirst && scorePin(pin) > scorePin(uniquePins[existingIndex])) {
      uniquePins[existingIndex] = pin;
    }
  });

  return uniquePins.sort((a, b) => {
    const left = Number.isFinite(Number(a.distance_km)) ? Number(a.distance_km) : Number.POSITIVE_INFINITY;
    const right = Number.isFinite(Number(b.distance_km)) ? Number(b.distance_km) : Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
  });
}
