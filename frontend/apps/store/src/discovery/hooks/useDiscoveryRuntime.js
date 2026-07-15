import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getDiscoveryFilterState,
  getDiscoveryPaginationItems,
  getDiscoveryResultsPerPage,
  getDiscoveryTotalPages,
  getPaginatedDiscoveryStores
} from '../model/discoveryResultsModel.js';

export function useDiscoveryRuntime({
  debouncedDiscoverySearch,
  discoveryAvailabilityFilter,
  discoveryCategoryFilter,
  discoveryDistanceFilter,
  discoveryOpenFilter,
  discoveryRatingFilter,
  discoveryResultsPage,
  discoverySortBy,
  filteredDiscoveryStores,
  hasDiscoverySearch,
  isDiscoveryMobileViewport,
  isDiscoveryTabletViewport,
  search,
  setDiscoveryAvailabilityFilter,
  setDiscoveryCategoryFilter,
  setDiscoveryDistanceFilter,
  setDiscoveryOpenFilter,
  setDiscoveryRatingFilter,
  setDiscoveryResultsPage,
  setDiscoverySortBy,
  setFeaturedBaseStores,
  setHasDiscoveryExplorationStarted,
  setHighlightedDiscoveryMarkerKey,
  setHighlightedStoreSlug,
  setIsMobileResultsCollapsed,
  setIsStoreListVisible,
  setRenderDiscoveryResetButton,
  setShowDiscoveryResetButton,
  setSelectedMapPin,
  storesWithNearestBranch,
  viewMode
}) {
  const [clusterResultStores, setClusterResultStores] = useState([]);

  const clearDiscoveryClusterResults = useCallback(() => {
    setClusterResultStores([]);
  }, []);

  const handleDiscoveryClusterSelect = useCallback((stores, meta = {}) => {
    const clusterStores = Array.isArray(stores) ? stores.filter(Boolean) : [];
    if (clusterStores.length === 0) {
      clearDiscoveryClusterResults();
      return;
    }

    setClusterResultStores(clusterStores);
    setDiscoveryResultsPage(1);
    setHasDiscoveryExplorationStarted?.(true);
    setIsStoreListVisible?.(true);
    setIsMobileResultsCollapsed?.(false);

    const firstStore = clusterStores[0] || null;
    const highlightedKey = meta?.markerKey || firstStore?.id || firstStore?.slug || '';
    if (highlightedKey) {
      setHighlightedDiscoveryMarkerKey?.(String(highlightedKey));
    }
    if (firstStore?.slug) {
      setHighlightedStoreSlug?.(firstStore.slug);
    }
    if (typeof meta?.lat === 'number' && typeof meta?.lng === 'number') {
      setSelectedMapPin?.({
        latitude: meta.lat,
        longitude: meta.lng,
        stores: clusterStores,
        coordinateKey: meta?.coordinateKey || null
      });
    }
  }, [
    clearDiscoveryClusterResults,
    setDiscoveryResultsPage,
    setHasDiscoveryExplorationStarted,
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug,
    setIsMobileResultsCollapsed,
    setIsStoreListVisible,
    setSelectedMapPin
  ]);

  const discoveryResultsPerPage = useMemo(() => getDiscoveryResultsPerPage({
    viewMode,
    isMobileViewport: isDiscoveryMobileViewport,
    isTabletViewport: isDiscoveryTabletViewport
  }), [viewMode, isDiscoveryMobileViewport, isDiscoveryTabletViewport]);

  const discoveryTotalPages = useMemo(
    () => getDiscoveryTotalPages(filteredDiscoveryStores.length, discoveryResultsPerPage),
    [filteredDiscoveryStores.length, discoveryResultsPerPage]
  );

  const paginatedDiscoveryStores = useMemo(() => getPaginatedDiscoveryStores({
    stores: filteredDiscoveryStores,
    page: discoveryResultsPage,
    perPage: discoveryResultsPerPage
  }), [filteredDiscoveryStores, discoveryResultsPage, discoveryResultsPerPage]);

  const filterState = useMemo(() => getDiscoveryFilterState({
    discoverySortBy,
    discoveryCategoryFilter,
    discoveryOpenFilter,
    discoveryDistanceFilter,
    discoveryRatingFilter,
    discoveryAvailabilityFilter
  }), [
    discoverySortBy,
    discoveryCategoryFilter,
    discoveryOpenFilter,
    discoveryDistanceFilter,
    discoveryRatingFilter,
    discoveryAvailabilityFilter
  ]);

  useEffect(() => {
    if (!hasDiscoverySearch) {
      setFeaturedBaseStores(Array.isArray(storesWithNearestBranch) ? storesWithNearestBranch : []);
    }
  }, [hasDiscoverySearch, setFeaturedBaseStores, storesWithNearestBranch]);

  useEffect(() => {
    if (filterState.hasActiveDiscoveryFilters) {
      setRenderDiscoveryResetButton(true);
      const frame = requestAnimationFrame(() => setShowDiscoveryResetButton(true));
      return () => cancelAnimationFrame(frame);
    }
    setShowDiscoveryResetButton(false);
    const timeoutId = setTimeout(() => setRenderDiscoveryResetButton(false), 180);
    return () => clearTimeout(timeoutId);
  }, [
    filterState.hasActiveDiscoveryFilters,
    setRenderDiscoveryResetButton,
    setShowDiscoveryResetButton
  ]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      clearDiscoveryClusterResults();
      setDiscoveryResultsPage(1);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    viewMode,
    search,
    debouncedDiscoverySearch,
    discoverySortBy,
    discoveryCategoryFilter,
    discoveryDistanceFilter,
    discoveryOpenFilter,
    discoveryRatingFilter,
    discoveryAvailabilityFilter,
    clearDiscoveryClusterResults,
    setDiscoveryResultsPage
  ]);

  useEffect(() => {
    setDiscoveryResultsPage((currentPage) => Math.min(currentPage, discoveryTotalPages));
  }, [discoveryTotalPages, setDiscoveryResultsPage]);

  const resetDiscoveryResultsView = useCallback(() => {
    clearDiscoveryClusterResults();
    setDiscoveryCategoryFilter('all');
    setDiscoveryDistanceFilter('all');
    setDiscoveryOpenFilter('all');
    setDiscoveryRatingFilter('all');
    setDiscoveryAvailabilityFilter('all');
    setDiscoverySortBy('nearest');
    setDiscoveryResultsPage(1);
  }, [
    clearDiscoveryClusterResults,
    setDiscoveryAvailabilityFilter,
    setDiscoveryCategoryFilter,
    setDiscoveryDistanceFilter,
    setDiscoveryOpenFilter,
    setDiscoveryRatingFilter,
    setDiscoveryResultsPage,
    setDiscoverySortBy
  ]);

  const discoveryPaginationItems = useMemo(() => getDiscoveryPaginationItems({
    currentPage: discoveryResultsPage,
    totalPages: discoveryTotalPages
  }), [discoveryResultsPage, discoveryTotalPages]);

  return {
    activeDiscoveryFilterCount: filterState.activeDiscoveryFilterCount,
    clearDiscoveryClusterResults,
    clusterResultStores,
    discoveryPaginationItems,
    discoveryResultsPerPage,
    discoveryTotalPages,
    hasActiveDiscoveryFilters: filterState.hasActiveDiscoveryFilters,
    handleDiscoveryClusterSelect,
    isClusterResultsActive: clusterResultStores.length > 0,
    isCategoryFilterActive: filterState.isCategoryFilterActive,
    isOpenNowFilterActive: filterState.isOpenNowFilterActive,
    isSortFilterActive: filterState.isSortFilterActive,
    paginatedDiscoveryStores,
    resetDiscoveryResultsView
  };
}
