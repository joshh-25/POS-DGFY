import { useCallback, useEffect, useRef } from 'react';
import { normalizeProfileLocations } from '../../features/discovery/utils/storefrontDiscoveryNormalization.js';

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

  // Historically this fanned out one GET /api/v1/store/locations per store
  // in an unbounded Promise.all -- up to 100 simultaneous requests (the
  // discovery query above caps at limit=100), each resolving a different
  // tenant database against a fixed-size tenant connection cache. That is
  // what produced DGFY-STORE-X (prod 500) and its trail of network-failure
  // siblings; see #297.
  //
  // The discovery response already carries everything each store's branch
  // list needs, in `active_location_snapshot` (populated from the same
  // TenantLocation query `listActiveLocations` runs, mirrored into the
  // landlord-side storefront_discovery_index row for every store). So this
  // is now a pure derivation from `stores`, not a network effect: zero
  // requests, and nothing left to re-fire on every search keystroke.
  useEffect(() => {
    if (!Array.isArray(stores) || stores.length === 0) {
      setDiscoveryLocationMap({});
      setLoadingDiscoveryLocations(false);
      return;
    }

    const locationPairs = stores.map((store) => {
      const slug = toSlug(store?.slug);
      if (!slug) return [slug, { locations: [], primary_location_id: null }];
      return [slug, {
        locations: normalizeProfileLocations(store),
        primary_location_id: store?.location_id ?? null
      }];
    });
    setDiscoveryLocationMap(Object.fromEntries(locationPairs.filter(([slug]) => Boolean(slug))));
    setLoadingDiscoveryLocations(false);
  }, [setDiscoveryLocationMap, setLoadingDiscoveryLocations, stores, toSlug]);

  return { loadStores, retryLoadStores };
}
