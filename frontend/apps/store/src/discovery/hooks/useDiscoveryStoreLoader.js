import { useCallback, useEffect, useRef } from 'react';

export function useDiscoveryStoreLoader({
  debouncedDiscoverySearch,
  discoveryCoordsRef,
  discoveryIncludeMatchMeta,
  discoveryPinScope,
  discoveryResultMode,
  discoveryStockFilter,
  requestJson,
  searchRef,
  setDiscoveryAppliedFilters,
  setDiscoveryCoords,
  setDiscoveryLocationMap,
  setLoadingDiscoveryLocations,
  setLoadingStores,
  setStores,
  setStoresError,
  stores,
  toSlug
}) {
  const discoveryRequestSequenceRef = useRef(0);
  const discoveryAbortControllerRef = useRef(null);
  const lastImmediateDiscoveryRequestRef = useRef({ search: '', at: 0 });

  const loadStores = useCallback(async (coords = undefined, options = {}) => {
    const useImmediateSearch = options?.useImmediateSearch === true;
    const requestSearch = useImmediateSearch ? String(searchRef.current || '').trim() : debouncedDiscoverySearch.trim();

    if (useImmediateSearch) {
      lastImmediateDiscoveryRequestRef.current = { search: requestSearch, at: Date.now() };
    }

    const requestSequence = discoveryRequestSequenceRef.current + 1;
    discoveryRequestSequenceRef.current = requestSequence;
    discoveryAbortControllerRef.current?.abort?.();

    const discoveryController = typeof AbortController === 'function' ? new AbortController() : null;
    discoveryAbortControllerRef.current = discoveryController;
    setLoadingStores(true);
    setStoresError('');

    try {
      const resolvedCoords = coords === undefined ? discoveryCoordsRef.current : coords;
      const query = new URLSearchParams();
      if (requestSearch) query.set('search', requestSearch);
      query.set('result_mode', discoveryResultMode);
      query.set('stock_filter', discoveryStockFilter);
      query.set('pin_scope', options?.pinScope || discoveryPinScope);
      query.set('include_match_meta', discoveryIncludeMatchMeta ? 'true' : 'false');

      if (resolvedCoords?.latitude && resolvedCoords?.longitude) {
        query.set('latitude', String(resolvedCoords.latitude));
        query.set('longitude', String(resolvedCoords.longitude));

        const nextCoords = {
          latitude: Number(resolvedCoords.latitude),
          longitude: Number(resolvedCoords.longitude)
        };
        discoveryCoordsRef.current = nextCoords;
        setDiscoveryCoords((previous) => {
          if (
            previous
            && Number(previous.latitude) === Number(nextCoords.latitude)
            && Number(previous.longitude) === Number(nextCoords.longitude)
          ) {
            return previous;
          }
          return nextCoords;
        });
      } else {
        discoveryCoordsRef.current = null;
        setDiscoveryCoords(null);
      }

      query.set('limit', '100');
      const data = await requestJson(
        `/api/v1/storefront/discovery?${query.toString()}`,
        { retry: true, ...(discoveryController ? { signal: discoveryController.signal } : {}) }
      );

      if (requestSequence === discoveryRequestSequenceRef.current) {
        setStores(Array.isArray(data?.stores) ? data.stores : []);
        setDiscoveryAppliedFilters(data?.applied_filters || null);
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setDiscoveryAppliedFilters(null);
        setStoresError(error.message || 'Failed to load discovery stores.');
      }
    } finally {
      if (discoveryAbortControllerRef.current === discoveryController) {
        discoveryAbortControllerRef.current = null;
      }
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setLoadingStores(false);
      }
    }
  }, [
    debouncedDiscoverySearch,
    discoveryCoordsRef,
    discoveryIncludeMatchMeta,
    discoveryPinScope,
    discoveryResultMode,
    discoveryStockFilter,
    requestJson,
    searchRef,
    setDiscoveryAppliedFilters,
    setDiscoveryCoords,
    setLoadingStores,
    setStores,
    setStoresError
  ]);

  // Zero-arg wrapper for a manual "Try again" affordance. loadStores takes
  // `coords` positionally, so `onClick={loadStores}` would hand it a
  // PointerEvent as coords -- this exists so a retry button can never do
  // that by accident.
  const retryLoadStores = useCallback(
    () => loadStores(undefined, { useImmediateSearch: true }),
    [loadStores]
  );

  useEffect(() => {
    const lastImmediate = lastImmediateDiscoveryRequestRef.current;
    const debouncedSearch = debouncedDiscoverySearch.trim();
    if (
      debouncedSearch
      && lastImmediate?.search === debouncedSearch
      && Date.now() - Number(lastImmediate.at || 0) < 400
    ) {
      return;
    }
    loadStores();
  }, [loadStores, debouncedDiscoverySearch]);

  useEffect(() => {
    let cancelled = false;

    const loadDiscoveryLocations = async () => {
      if (!Array.isArray(stores) || stores.length === 0) {
        setDiscoveryLocationMap({});
        return;
      }

      setLoadingDiscoveryLocations(true);
      try {
        const locationPairs = await Promise.all(
          stores.map(async (store) => {
            const slug = toSlug(store?.slug);
            if (!slug) return [slug, { locations: [], primary_location_id: null }];
            try {
              const data = await requestJson('/api/v1/store/locations', { storeSlug: slug });
              const locations = Array.isArray(data?.locations) ? data.locations : [];
              return [slug, { locations, primary_location_id: data?.primary_location_id ?? null }];
            } catch {
              return [slug, { locations: [], primary_location_id: null }];
            }
          })
        );
        if (cancelled) return;
        setDiscoveryLocationMap(Object.fromEntries(locationPairs.filter(([slug]) => Boolean(slug))));
      } finally {
        if (!cancelled) setLoadingDiscoveryLocations(false);
      }
    };

    loadDiscoveryLocations();
    return () => {
      cancelled = true;
    };
  }, [requestJson, setDiscoveryLocationMap, setLoadingDiscoveryLocations, stores, toSlug]);

  return { loadStores, retryLoadStores };
}
