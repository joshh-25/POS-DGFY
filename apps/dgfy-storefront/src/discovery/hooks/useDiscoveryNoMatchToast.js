import { useEffect, useRef } from 'react';

export function useDiscoveryNoMatchToast({
  debouncedDiscoverySearch,
  discoveryAvailabilityFilter,
  discoveryCategoryFilter,
  discoveryDistanceFilter,
  discoveryOpenFilter,
  discoveryRatingFilter,
  filteredDiscoveryStoresLength,
  hasDiscoverySearch,
  loadingStores,
  search,
  setIsDiscoveryNoMatchToastActive,
  storesError,
  toast
}) {
  const lastDiscoveryNoMatchToastRef = useRef('');
  const discoveryNoMatchToastTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (discoveryNoMatchToastTimerRef.current) {
        window.clearTimeout(discoveryNoMatchToastTimerRef.current);
        discoveryNoMatchToastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!hasDiscoverySearch || loadingStores || storesError) {
      if (discoveryNoMatchToastTimerRef.current) {
        window.clearTimeout(discoveryNoMatchToastTimerRef.current);
        discoveryNoMatchToastTimerRef.current = null;
      }
      setIsDiscoveryNoMatchToastActive(false);
      lastDiscoveryNoMatchToastRef.current = '';
      return;
    }

    if (filteredDiscoveryStoresLength > 0) {
      if (discoveryNoMatchToastTimerRef.current) {
        window.clearTimeout(discoveryNoMatchToastTimerRef.current);
        discoveryNoMatchToastTimerRef.current = null;
      }
      setIsDiscoveryNoMatchToastActive(false);
      lastDiscoveryNoMatchToastRef.current = '';
      return;
    }

    const queryLabel = String(debouncedDiscoverySearch || search || discoveryCategoryFilter || '').trim() || 'your search';
    const toastKey = `${queryLabel}::${discoveryCategoryFilter}::${discoveryDistanceFilter}::${discoveryOpenFilter}::${discoveryRatingFilter}::${discoveryAvailabilityFilter}`;
    setIsDiscoveryNoMatchToastActive(true);

    if (discoveryNoMatchToastTimerRef.current) {
      window.clearTimeout(discoveryNoMatchToastTimerRef.current);
    }
    discoveryNoMatchToastTimerRef.current = window.setTimeout(() => {
      setIsDiscoveryNoMatchToastActive(false);
      discoveryNoMatchToastTimerRef.current = null;
    }, 2600);

    if (lastDiscoveryNoMatchToastRef.current === toastKey) return;
    lastDiscoveryNoMatchToastRef.current = toastKey;
    toast.info(`No storefronts matched "${queryLabel}". Try another category or broader search.`);
  }, [
    debouncedDiscoverySearch,
    discoveryAvailabilityFilter,
    discoveryCategoryFilter,
    discoveryDistanceFilter,
    discoveryOpenFilter,
    discoveryRatingFilter,
    filteredDiscoveryStoresLength,
    hasDiscoverySearch,
    loadingStores,
    search,
    setIsDiscoveryNoMatchToastActive,
    storesError,
    toast
  ]);
}
