import { useMemo } from 'react';

import {
  buildDiscoveryMapPins,
  buildDiscoverySummary,
  buildFallbackDiscoveryMapPins,
  buildHeroDiscoveryMapPins,
  buildStoresWithNearestBranch,
  filterDiscoveryStores,
  getHighlightedStore,
  getNearestDistanceKm,
  groupDiscoveryPinsBySlug,
  sortDiscoveryResultStores
} from '../model/discoveryResultsDataModel.js';

export function useDiscoveryResultsData({
  DEFAULT_CENTER,
  DISCOVERY_CATEGORY_MATCHERS,
  activeDiscoveryMapPinsFallback = [],
  debouncedDiscoverySearch,
  discoveryAvailabilityFilter,
  discoveryCategoryFilter,
  discoveryCoords,
  discoveryDistanceFilter,
  discoveryLocationMap,
  discoveryOpenFilter,
  discoveryPinScope,
  discoveryRatingFilter,
  discoverySortBy,
  getDiscoveryEmptyStateMessage,
  hasDiscoverySearch,
  haversineDistanceKm,
  highlightedStoreSlug,
  isDiscoveryNoMatchToastActive,
  loadingStores,
  normalizeDiscoveryCategoryKey,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary,
  search,
  selectDiscoveryPinLocations,
  stores,
  storesError,
  toNumberOrNull,
  toSlug
}) {
  void debouncedDiscoverySearch;
  void getDiscoveryEmptyStateMessage;

  const storesWithNearestBranch = useMemo(() => buildStoresWithNearestBranch({
    DEFAULT_CENTER,
    discoveryCoords,
    discoveryLocationMap,
    haversineDistanceKm,
    stores,
    toNumberOrNull,
    toSlug
  }), [DEFAULT_CENTER, discoveryCoords, discoveryLocationMap, haversineDistanceKm, stores, toNumberOrNull, toSlug]);

  const discoveryResultStores = useMemo(() => sortDiscoveryResultStores({
    discoveryCoords,
    discoverySortBy,
    hasDiscoverySearch,
    normalizeStorefrontReviewSummary,
    storesWithNearestBranch
  }), [discoveryCoords, discoverySortBy, hasDiscoverySearch, normalizeStorefrontReviewSummary, storesWithNearestBranch]);

  const filteredDiscoveryStores = useMemo(() => filterDiscoveryStores({
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
  }), [
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
  ]);

  const discoveryMapPins = useMemo(() => buildDiscoveryMapPins({
    discoveryCoords,
    discoveryLocationMap,
    discoveryPinScope,
    filteredDiscoveryStores,
    haversineDistanceKm,
    search,
    selectDiscoveryPinLocations,
    toNumberOrNull,
    toSlug
  }), [
    discoveryCoords,
    discoveryLocationMap,
    discoveryPinScope,
    filteredDiscoveryStores,
    haversineDistanceKm,
    search,
    selectDiscoveryPinLocations,
    toNumberOrNull,
    toSlug
  ]);

  const discoveryPinsBySlug = useMemo(() => groupDiscoveryPinsBySlug({
    discoveryMapPins,
    toSlug
  }), [discoveryMapPins, toSlug]);

  const fallbackDiscoveryMapPins = useMemo(() => buildFallbackDiscoveryMapPins({
    filteredDiscoveryStores,
    toNumberOrNull,
    toSlug
  }), [filteredDiscoveryStores, toNumberOrNull, toSlug]);

  const heroDiscoveryMapPins = useMemo(() => buildHeroDiscoveryMapPins({
    discoveryCoords,
    discoveryLocationMap,
    haversineDistanceKm,
    storesWithNearestBranch,
    toNumberOrNull,
    toSlug
  }), [discoveryCoords, discoveryLocationMap, haversineDistanceKm, storesWithNearestBranch, toNumberOrNull, toSlug]);
  const stableHeroDiscoveryMapPins = heroDiscoveryMapPins.length > 0
    ? heroDiscoveryMapPins
    : activeDiscoveryMapPinsFallback;
  const activeDiscoveryMapPins = discoveryMapPins.length > 0 ? discoveryMapPins : fallbackDiscoveryMapPins;
  const rememberedDiscoveryMapPins = Array.isArray(activeDiscoveryMapPinsFallback)
    ? activeDiscoveryMapPinsFallback
    : [];
  const persistentDiscoveryMapPins = hasDiscoverySearch
    && !loadingStores
    && !storesError
    && filteredDiscoveryStores.length === 0
    ? (isDiscoveryNoMatchToastActive ? [] : rememberedDiscoveryMapPins)
    : (activeDiscoveryMapPins.length > 0 ? activeDiscoveryMapPins : rememberedDiscoveryMapPins);
  const searchedDiscoveryMapPins = hasDiscoverySearch && filteredDiscoveryStores.length > 0
    ? discoveryMapPins
    : persistentDiscoveryMapPins;

  const discoveryResultsMapKey = useMemo(() => {
    const searchKey = String(search || '').trim().toLowerCase();
    const pinKey = (Array.isArray(searchedDiscoveryMapPins) ? searchedDiscoveryMapPins : [])
      .map((pin) => String(
        pin?.marker_key
        || `${toSlug(pin?.slug || pin?.tenant_name)}:${pin?.location_id ?? `${pin?.latitude}:${pin?.longitude}`}`
      ))
      .join('|');
    return `discovery-results-map:${searchKey}:${filteredDiscoveryStores.length}:${pinKey}`;
  }, [filteredDiscoveryStores.length, search, searchedDiscoveryMapPins, toSlug]);

  const discoverySummary = useMemo(
    () => buildDiscoverySummary(filteredDiscoveryStores),
    [filteredDiscoveryStores]
  );

  const nearestDistanceKm = useMemo(
    () => getNearestDistanceKm(filteredDiscoveryStores),
    [filteredDiscoveryStores]
  );

  const highlightedStore = useMemo(() => getHighlightedStore({
    filteredDiscoveryStores,
    highlightedStoreSlug
  }), [filteredDiscoveryStores, highlightedStoreSlug]);


  return {
    activeDiscoveryMapPins,
    discoveryMapPins,
    discoveryPinsBySlug,
    discoveryResultStores,
    discoveryResultsMapKey,
    discoverySummary,
    filteredDiscoveryStores,
    highlightedStore,
    nearestDistanceKm,
    searchedDiscoveryMapPins,
    stableHeroDiscoveryMapPins,
    storesWithNearestBranch
  };
}
