import { useDiscoveryNoMatchToast } from './useDiscoveryNoMatchToast.js';
import { useDiscoveryResultsData } from './useDiscoveryResultsData.js';

export function useDiscoveryDerivedResults({
  DEFAULT_CENTER,
  DISCOVERY_CATEGORY_MATCHERS,
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
  setIsDiscoveryNoMatchToastActive,
  stores,
  storesError,
  toNumberOrNull,
  toSlug,
  toast
}) {
  const discoveryResults = useDiscoveryResultsData({
    DEFAULT_CENTER,
    DISCOVERY_CATEGORY_MATCHERS,
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
  });

  useDiscoveryNoMatchToast({
    debouncedDiscoverySearch,
    discoveryAvailabilityFilter,
    discoveryCategoryFilter,
    discoveryDistanceFilter,
    discoveryOpenFilter,
    discoveryRatingFilter,
    filteredDiscoveryStoresLength: discoveryResults.filteredDiscoveryStores.length,
    hasDiscoverySearch,
    loadingStores,
    search,
    setIsDiscoveryNoMatchToastActive,
    storesError,
    toast
  });

  return discoveryResults;
}
