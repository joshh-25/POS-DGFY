import { useEffect, useRef } from 'react';

import { useStorefrontStore } from '../../store/useStorefrontStore.js';

const useDiscoveryValue = (field) => useStorefrontStore((state) => state.discovery[field]);
const useDiscoveryAction = (name) => useStorefrontStore((state) => state[name]);

export function useDiscoveryState({ search = '' } = {}) {
  const discoveryResultMode = useDiscoveryValue('resultMode');
  const discoveryStockFilter = useDiscoveryValue('stockFilter');
  const discoveryPinScope = useDiscoveryValue('pinScope');
  const discoveryIncludeMatchMeta = useDiscoveryValue('includeMatchMeta');
  const discoveryAppliedFilters = useDiscoveryValue('appliedFilters');
  const isDiscoverySearchFocused = useDiscoveryValue('isSearchFocused');
  const hasDiscoveryExplorationStarted = useDiscoveryValue('hasExplorationStarted');
  const isDiscoveryNoMatchToastActive = useDiscoveryValue('isNoMatchToastActive');
  const discoveryResultsPage = useDiscoveryValue('resultsPage');
  const discoverySortBy = useDiscoveryValue('sortBy');
  const discoveryCategoryFilter = useDiscoveryValue('categoryFilter');
  const discoveryDistanceFilter = useDiscoveryValue('distanceFilter');
  const discoveryOpenFilter = useDiscoveryValue('openFilter');
  const discoveryRatingFilter = useDiscoveryValue('ratingFilter');
  const discoveryAvailabilityFilter = useDiscoveryValue('availabilityFilter');
  const activeDiscoveryFilterDropdown = useDiscoveryValue('activeFilterDropdown');
  const renderDiscoveryResetButton = useDiscoveryValue('renderResetButton');
  const showDiscoveryResetButton = useDiscoveryValue('showResetButton');
  const discoveryCoords = useDiscoveryValue('coords');
  const discoveryCoordsRef = useRef(discoveryCoords);
  const discoveryLocationMap = useDiscoveryValue('locationMap');
  const loadingDiscoveryLocations = useDiscoveryValue('loadingLocations');
  const highlightedDiscoveryMarkerKey = useDiscoveryValue('highlightedMarkerKey');
  const highlightedStoreSlug = useDiscoveryValue('highlightedStoreSlug');
  const selectedMapPin = useDiscoveryValue('selectedMapPin');
  const isStoreListVisible = useDiscoveryValue('isStoreListVisible');
  const isMobileResultsCollapsed = useDiscoveryValue('isMobileResultsCollapsed');
  const viewMode = useDiscoveryValue('viewMode');
  const openDiscoveryFaqIndex = useDiscoveryValue('openFaqIndex');
  const isDiscoveryNavMenuOpen = useDiscoveryValue('isNavMenuOpen');
  const activeDiscoveryNavItem = useDiscoveryValue('activeNavItem');
  const stores = useDiscoveryValue('stores');
  const loadingStores = useDiscoveryValue('loadingStores');
  const storesError = useDiscoveryValue('storesError');

  const setDiscoveryResultMode = useDiscoveryAction('discoverySetResultMode');
  const setDiscoveryStockFilter = useDiscoveryAction('discoverySetStockFilter');
  const setDiscoveryPinScope = useDiscoveryAction('discoverySetPinScope');
  const setDiscoveryIncludeMatchMeta = useDiscoveryAction('discoverySetIncludeMatchMeta');
  const setDiscoveryAppliedFilters = useDiscoveryAction('discoverySetAppliedFilters');
  const setIsDiscoverySearchFocused = useDiscoveryAction('discoverySetIsSearchFocused');
  const setHasDiscoveryExplorationStarted = useDiscoveryAction('discoverySetHasExplorationStarted');
  const setIsDiscoveryNoMatchToastActive = useDiscoveryAction('discoverySetIsNoMatchToastActive');
  const setDiscoveryResultsPage = useDiscoveryAction('discoverySetResultsPage');
  const setDiscoverySortBy = useDiscoveryAction('discoverySetSortBy');
  const setDiscoveryCategoryFilter = useDiscoveryAction('discoverySetCategoryFilter');
  const setDiscoveryDistanceFilter = useDiscoveryAction('discoverySetDistanceFilter');
  const setDiscoveryOpenFilter = useDiscoveryAction('discoverySetOpenFilter');
  const setDiscoveryRatingFilter = useDiscoveryAction('discoverySetRatingFilter');
  const setDiscoveryAvailabilityFilter = useDiscoveryAction('discoverySetAvailabilityFilter');
  const setActiveDiscoveryFilterDropdown = useDiscoveryAction('discoverySetActiveFilterDropdown');
  const setRenderDiscoveryResetButton = useDiscoveryAction('discoverySetRenderResetButton');
  const setShowDiscoveryResetButton = useDiscoveryAction('discoverySetShowResetButton');
  const setDiscoveryCoords = useDiscoveryAction('discoverySetCoords');
  const setDiscoveryLocationMap = useDiscoveryAction('discoverySetLocationMap');
  const setLoadingDiscoveryLocations = useDiscoveryAction('discoverySetLoadingLocations');
  const setHighlightedDiscoveryMarkerKey = useDiscoveryAction('discoverySetHighlightedMarkerKey');
  const setHighlightedStoreSlug = useDiscoveryAction('discoverySetHighlightedStoreSlug');
  const setSelectedMapPin = useDiscoveryAction('discoverySetSelectedMapPin');
  const setIsStoreListVisible = useDiscoveryAction('discoverySetIsStoreListVisible');
  const setIsMobileResultsCollapsed = useDiscoveryAction('discoverySetIsMobileResultsCollapsed');
  const setViewMode = useDiscoveryAction('discoverySetViewMode');
  const setOpenDiscoveryFaqIndex = useDiscoveryAction('discoverySetOpenFaqIndex');
  const setIsDiscoveryNavMenuOpen = useDiscoveryAction('discoverySetIsNavMenuOpen');
  const setActiveDiscoveryNavItem = useDiscoveryAction('discoverySetActiveNavItem');
  const setStores = useDiscoveryAction('discoverySetStores');
  const setLoadingStores = useDiscoveryAction('discoverySetLoadingStores');
  const setStoresError = useDiscoveryAction('discoverySetStoresError');
  const searchRef = useRef(search);

  useEffect(() => {
    discoveryCoordsRef.current = discoveryCoords;
  }, [discoveryCoords]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  return {
    activeDiscoveryFilterDropdown,
    activeDiscoveryNavItem,
    discoveryAppliedFilters,
    discoveryAvailabilityFilter,
    discoveryCategoryFilter,
    discoveryCoords,
    discoveryCoordsRef,
    discoveryDistanceFilter,
    discoveryIncludeMatchMeta,
    discoveryLocationMap,
    discoveryOpenFilter,
    discoveryPinScope,
    discoveryRatingFilter,
    discoveryResultMode,
    discoveryResultsPage,
    discoverySortBy,
    discoveryStockFilter,
    hasDiscoveryExplorationStarted,
    highlightedDiscoveryMarkerKey,
    highlightedStoreSlug,
    isMobileResultsCollapsed,
    isDiscoveryNavMenuOpen,
    isDiscoveryNoMatchToastActive,
    isDiscoverySearchFocused,
    isStoreListVisible,
    loadingDiscoveryLocations,
    openDiscoveryFaqIndex,
    selectedMapPin,
    viewMode,
    renderDiscoveryResetButton,
    searchRef,
    setActiveDiscoveryFilterDropdown,
    setActiveDiscoveryNavItem,
    setDiscoveryAppliedFilters,
    setDiscoveryAvailabilityFilter,
    setDiscoveryCategoryFilter,
    setDiscoveryCoords,
    setDiscoveryDistanceFilter,
    setDiscoveryIncludeMatchMeta,
    setDiscoveryLocationMap,
    setDiscoveryOpenFilter,
    setDiscoveryPinScope,
    setDiscoveryRatingFilter,
    setDiscoveryResultMode,
    setDiscoveryResultsPage,
    setDiscoverySortBy,
    setDiscoveryStockFilter,
    setHasDiscoveryExplorationStarted,
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug,
    setIsMobileResultsCollapsed,
    setIsDiscoveryNavMenuOpen,
    setIsDiscoveryNoMatchToastActive,
    setIsDiscoverySearchFocused,
    setIsStoreListVisible,
    setLoadingDiscoveryLocations,
    setOpenDiscoveryFaqIndex,
    setRenderDiscoveryResetButton,
    setSelectedMapPin,
    setShowDiscoveryResetButton,
    setViewMode,
    showDiscoveryResetButton,
    stores,
    loadingStores,
    storesError,
    setStores,
    setLoadingStores,
    setStoresError
  };
}
