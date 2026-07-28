import { useCallback, useRef } from 'react';

import { resolveDiscoveryCategoryFilterValue } from '../../features/discovery/utils/storefrontDiscoveryNormalization.js';

const DISCOVERY_LOCATION_PERMISSION_KEY = 'dgfy_storefront_discovery_location_permission_v1';

export function useDiscoverySearchActions({
  loadStores,
  search,
  searchRef,
  setDebouncedDiscoverySearch,
  setDiscoveryCategoryFilter,
  setDiscoveryPinScope,
  setHasDiscoveryExplorationStarted,
  setIsMobileResultsCollapsed,
  setIsStoreListVisible,
  setSearch,
  setSelectedMapPin
}) {
  const lastSubmittedSearchRef = useRef(null);

  const handleNearMe = useCallback(() => {
    const currentSearch = String(searchRef.current || search || '').trim();
    setHasDiscoveryExplorationStarted(true);
    setIsMobileResultsCollapsed(false);
    setDiscoveryPinScope('nearest_matching_branch');

    if (!navigator?.geolocation) {
      setDebouncedDiscoverySearch(currentSearch);
      loadStores(undefined, { useImmediateSearch: true, pinScope: 'nearest_matching_branch' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.localStorage?.setItem(DISCOVERY_LOCATION_PERMISSION_KEY, 'granted');
        setDebouncedDiscoverySearch(currentSearch);
        loadStores({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }, { useImmediateSearch: true, pinScope: 'nearest_matching_branch' });
      },
      () => {
        setDebouncedDiscoverySearch(currentSearch);
        loadStores(undefined, { useImmediateSearch: true, pinScope: 'nearest_matching_branch' });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000
      }
    );
  }, [
    loadStores,
    search,
    searchRef,
    setDebouncedDiscoverySearch,
    setDiscoveryPinScope,
    setHasDiscoveryExplorationStarted,
    setIsMobileResultsCollapsed
  ]);

  const handleDiscoverySearch = useCallback(() => {
    const currentSearch = String(searchRef.current || search || '').trim();
    setHasDiscoveryExplorationStarted(true);
    setIsStoreListVisible(false);
    setIsMobileResultsCollapsed(false);
    setSelectedMapPin(null);
    setDebouncedDiscoverySearch(currentSearch);
    setDiscoveryPinScope('tenant_primary');
    if (lastSubmittedSearchRef.current === currentSearch) {
      return;
    }
    lastSubmittedSearchRef.current = currentSearch;
    loadStores(null, { useImmediateSearch: true, pinScope: 'tenant_primary' });
  }, [
    loadStores,
    search,
    searchRef,
    setDebouncedDiscoverySearch,
    setDiscoveryPinScope,
    setHasDiscoveryExplorationStarted,
    setIsMobileResultsCollapsed,
    setIsStoreListVisible,
    setSelectedMapPin
  ]);

  const handlePopularDiscoveryCategory = useCallback((query) => {
    const normalized = String(query || '').trim();
    const categoryFilterValue = resolveDiscoveryCategoryFilterValue(normalized);
    const nextSearch = categoryFilterValue === 'all' ? '' : normalized;
    setHasDiscoveryExplorationStarted(true);
    setIsMobileResultsCollapsed(false);
    setSearch(nextSearch);
    searchRef.current = nextSearch;
    setDebouncedDiscoverySearch(nextSearch);
    setDiscoveryCategoryFilter(categoryFilterValue);
    handleDiscoverySearch();
  }, [
    handleDiscoverySearch,
    searchRef,
    setDebouncedDiscoverySearch,
    setDiscoveryCategoryFilter,
    setHasDiscoveryExplorationStarted,
    setIsMobileResultsCollapsed,
    setSearch
  ]);

  return {
    handleDiscoverySearch,
    handleNearMe,
    handlePopularDiscoveryCategory
  };
}
