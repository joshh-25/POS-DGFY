import { getRelevanceWeightedDistanceRank, scoreStoresByRelevance } from './discoverySearchRanking.js';

export function buildStoresWithNearestBranch({
  DEFAULT_CENTER,
  discoveryCoords,
  discoveryLocationMap,
  haversineDistanceKm,
  stores,
  toNumberOrNull,
  toSlug
}) {
  const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
  const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
  const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;

  return (Array.isArray(stores) ? stores : [])
    .map((store) => {
      const slug = toSlug(store?.slug);
      const locationBundle = discoveryLocationMap[slug] || {};
      const allLocations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
      const activeLocations = allLocations.filter((location) => location?.is_active !== false);
      const pins = activeLocations
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
        ? (pins.find((location) => Number(location.location_id) === nearestMatchingLocationId) || null)
        : null;
      const primaryLocation = pins.find((location) => Number(location.location_id) === Number(locationBundle.primary_location_id))
        || pins.find((location) => location?.is_primary_storefront === true)
        || null;
      const fallbackLocation = nearestMatchingLocation || primaryLocation || pins[0] || null;
      const fallbackLat = toNumberOrNull(store?.latitude);
      const fallbackLng = toNumberOrNull(store?.longitude);
      // DEFAULT_CENTER is a map viewport fallback, not storefront location data.
      // Keeping missing coordinates null prevents no-location stores from becoming
      // fake pins at the center of the map.
      const anchorLatitude = fallbackLocation?.latitude ?? fallbackLat ?? null;
      const anchorLongitude = fallbackLocation?.longitude ?? fallbackLng ?? null;
      const nearestPinWithDistance = hasDiscoveryLocation
        ? pins
          .map((location) => ({
            location,
            distance_km: haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
          }))
          .sort((a, b) => a.distance_km - b.distance_km)[0] || null
        : null;
      const nearestDistanceKm = nearestPinWithDistance?.distance_km
        ?? (Number.isFinite(Number(store?.distance_km)) ? Number(store.distance_km) : null);
      const nearestLocation = nearestPinWithDistance?.location || fallbackLocation;

      return {
        ...store,
        latitude: anchorLatitude,
        longitude: anchorLongitude,
        active_location_count: activeLocations.length,
        nearest_distance_km: nearestDistanceKm,
        nearest_location_name: nearestLocation?.name || null,
        nearest_location_hours: String(
          nearestLocation?.business_hours_label
          || nearestLocation?.business_hours
          || nearestLocation?.operating_hours
          || nearestLocation?.hours_label
          || nearestLocation?.hours_text
          || nearestLocation?.hours
          || ''
        ).trim(),
        nearest_location_id: nearestLocation?.location_id ?? null,
        nearest_is_primary: nearestLocation?.is_primary_storefront === true,
        match_reasons: Array.isArray(store?.match_reasons) ? store.match_reasons : [],
        matching_item_count: Number(store?.matching_item_count || 0),
        matching_item_sample: Array.isArray(store?.matching_item_sample) ? store.matching_item_sample : [],
        has_in_stock_match: store?.has_in_stock_match === true,
        matching_location_ids: matchingLocationIds,
        nearest_matching_location_id: Number.isInteger(nearestMatchingLocationId) ? nearestMatchingLocationId : null
      };
    })
    .sort((a, b) => {
      const left = Number.isFinite(a.nearest_distance_km) ? a.nearest_distance_km : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(b.nearest_distance_km) ? b.nearest_distance_km : Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
      return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
    });
}

export function sortDiscoveryResultStores({
  discoveryCoords,
  discoverySortBy,
  hasDiscoverySearch,
  normalizeStorefrontReviewSummary,
  search,
  storesWithNearestBranch
}) {
  const hasDiscoveryLocation = discoveryCoords?.latitude != null && discoveryCoords?.longitude != null;
  const searcherRadiusKm = 0.1;
  const radiusScoped = hasDiscoverySearch && hasDiscoveryLocation
    ? storesWithNearestBranch.filter((store) => {
        const distanceKm = Number(store?.nearest_distance_km);
        if (!Number.isFinite(distanceKm) || distanceKm > searcherRadiusKm) return false;
        const deliveryRadiusKm = Number(store?.delivery_radius_km);
        if (Number.isFinite(deliveryRadiusKm) && deliveryRadiusKm > 0) {
          return distanceKm <= deliveryRadiusKm;
        }
        return true;
      })
    : storesWithNearestBranch;
  // Relevance-weighted distance ranking so a strong text/category match on a slightly
  // farther store can outrank a weak/unrelated match that happens to be nearer, while a
  // much nearer store can still win over a distant strong match (see RELEVANCE_DISTANCE_PENALTY_KM).
  const relevanceByStore = hasDiscoverySearch
    ? scoreStoresByRelevance(radiusScoped, search)
    : null;
  const sorted = [...radiusScoped];
  sorted.sort((a, b) => {
    if (discoverySortBy === 'open') {
      if (Boolean(a?.storefront_open) !== Boolean(b?.storefront_open)) return a?.storefront_open ? -1 : 1;
    } else if (discoverySortBy === 'rating') {
      const leftRating = Number(normalizeStorefrontReviewSummary(a?.storefront_review_summary)?.score || 0);
      const rightRating = Number(normalizeStorefrontReviewSummary(b?.storefront_review_summary)?.score || 0);
      if (leftRating !== rightRating) return rightRating - leftRating;
    } else if (discoverySortBy === 'wait') {
      const leftWait = Number(a?.estimated_wait_minutes || Number.POSITIVE_INFINITY);
      const rightWait = Number(b?.estimated_wait_minutes || Number.POSITIVE_INFINITY);
      if (leftWait !== rightWait) return leftWait - rightWait;
    } else if (discoverySortBy === 'catalog') {
      const leftCatalog = Number(a?.catalog_count || 0);
      const rightCatalog = Number(b?.catalog_count || 0);
      if (leftCatalog !== rightCatalog) return rightCatalog - leftCatalog;
    }
    if (relevanceByStore) {
      const leftRank = getRelevanceWeightedDistanceRank(a, relevanceByStore);
      const rightRank = getRelevanceWeightedDistanceRank(b, relevanceByStore);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
    }
    const leftDistance = Number.isFinite(Number(a?.nearest_distance_km)) ? Number(a.nearest_distance_km) : Number.POSITIVE_INFINITY;
    const rightDistance = Number.isFinite(Number(b?.nearest_distance_km)) ? Number(b.nearest_distance_km) : Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
  });
  return sorted;
}

export function filterDiscoveryStores({
  DISCOVERY_CATEGORY_MATCHERS,
  discoveryAvailabilityFilter,
  discoveryCategoryFilter,
  discoveryDistanceFilter,
  discoveryOpenFilter,
  discoveryRatingFilter,
  discoveryResultStores,
  normalizeDiscoveryCategoryKey,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary
}) {
  return discoveryResultStores.filter((store) => {
    const categories = normalizeStorefrontCategories(store?.storefront_categories).map((entry) => String(entry || '').trim().toLowerCase());
    const primaryCategory = categories[0] || String(store?.workflow_mode || store?.business_mode || 'store').replace(/_/g, ' ').trim().toLowerCase();
    const ratingSummary = normalizeStorefrontReviewSummary(store?.storefront_review_summary);
    const ratingValue = Number(ratingSummary?.score || 0);
    const distanceValue = Number(store?.nearest_distance_km);

    if (discoveryCategoryFilter !== 'all') {
      const haystack = [
        primaryCategory,
        ...categories,
        String(store?.workflow_mode || '').replace(/_/g, ' ').trim().toLowerCase(),
        String(store?.business_mode || '').replace(/_/g, ' ').trim().toLowerCase()
      ].filter(Boolean);
      const matchers = DISCOVERY_CATEGORY_MATCHERS[normalizeDiscoveryCategoryKey(discoveryCategoryFilter)] || [normalizeDiscoveryCategoryKey(discoveryCategoryFilter)];
      const hasCategoryMatch = matchers.some((matcher) => haystack.some((entry) => entry.includes(matcher) || matcher.includes(entry)));
      if (!hasCategoryMatch) return false;
    }
    if (discoveryOpenFilter === 'open' && store?.storefront_open !== true) return false;
    if (discoveryAvailabilityFilter === 'in_stock' && store?.has_in_stock_match !== true) return false;
    if (discoveryRatingFilter !== 'all') {
      const minimum = Number(discoveryRatingFilter);
      if (!Number.isFinite(ratingValue) || ratingValue < minimum) return false;
    }
    if (discoveryDistanceFilter !== 'all') {
      const maxDistance = Number(discoveryDistanceFilter);
      if (!Number.isFinite(distanceValue) || distanceValue > maxDistance) return false;
    }
    return true;
  });
}

const FEATURED_DISCOVERY_CATEGORY_KEYWORDS = {
  food: ['food', 'f&b', 'restaurant', 'cafe', 'coffee', 'pizza', 'bakery'],
  grocery: ['grocery', 'market', 'mart', 'supermarket', 'convenience'],
  pharmacy: ['pharmacy', 'medical', 'health', 'drugstore', 'clinic'],
  services: ['service', 'laundry', 'salon', 'spa', 'hardware', 'repair', 'auto'],
  electronics: ['electronics', 'electronic', 'gadget', 'tech', 'computer', 'mobile']
};

export function buildFeaturedDiscoveryStores({
  featuredBaseStores,
  featuredCategoryFilter,
  normalizeStorefrontCategories
}) {
  const base = Array.isArray(featuredBaseStores) ? featuredBaseStores : [];
  if (featuredCategoryFilter === 'all') return base.slice(0, 10);

  const terms = FEATURED_DISCOVERY_CATEGORY_KEYWORDS[featuredCategoryFilter] || [];
  return base
    .filter((store) => {
      const categories = normalizeStorefrontCategories(store?.storefront_categories);
      const categoryText = categories.join(' ').toLowerCase();
      const modeText = String(store?.workflow_mode || store?.business_mode || '').toLowerCase();
      const searchText = `${categoryText} ${modeText}`;
      return terms.some((term) => searchText.includes(term));
    })
    .slice(0, 10);
}
