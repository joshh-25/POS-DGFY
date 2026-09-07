import { useEffect, useMemo, useRef, useState } from 'react';

import { selectViewportWidth } from '../../store/selectors/uiSelectors.js';
import { useStorefrontStore } from '../../store/useStorefrontStore.js';
import { buildFnbMobileLayout } from '../../modes/fnb/storefront/model/fnbMobileLayout.js';
import { useDiscoveryFeaturedMerchants } from '../../discovery/hooks/useDiscoveryFeaturedMerchants.jsx';
import { useDiscoveryFilterDropdown } from '../../discovery/hooks/useDiscoveryFilterDropdown.js';
import { useDiscoverySearchActions } from '../../discovery/hooks/useDiscoverySearchActions.js';
import { useDiscoveryState } from '../../discovery/hooks/useDiscoveryState.js';
import { useDiscoveryStoreLoader } from '../../discovery/hooks/useDiscoveryStoreLoader.js';
import { useDiscoveryViewport } from '../../discovery/hooks/useDiscoveryViewport.js';

const DISCOVERY_LOCATION_PERMISSION_KEY = 'dgfy_storefront_discovery_location_permission_v1';

/**
 * Coordinates discovery-only state and loaders for the app shell.
 *
 * This is intentionally a runtime hook rather than a page component: the
 * discovery page still receives the same props and the existing map modules
 * keep ownership of map instances, markers, and viewport behavior.
 */
export function useStorefrontDiscoveryRuntime({
  routeSlug,
  normalizeStorefrontCategories,
  requestJson,
  toSlug
}) {
  const viewportWidth = useStorefrontStore(selectViewportWidth);
  const isMobileViewport = viewportWidth < 840;
  const isDesktopViewport = viewportWidth >= 1024;
  const isCompactPaginationViewport = viewportWidth < 768;
  const isTabletPaginationViewport = viewportWidth >= 768 && viewportWidth < 1024;
  const fnbMobileLayout = useMemo(() => buildFnbMobileLayout(isMobileViewport), [isMobileViewport]);
  const fnbMobileSectionTrailingInset = fnbMobileLayout.sectionTrailingInset;
  const fnbMobileCatalogInlinePadding = fnbMobileLayout.catalogInlinePadding;
  const fnbMobileMenuInnerWidth = fnbMobileLayout.menuInnerWidth;
  const {
    discoveryLayout,
    discoveryViewportMode,
    isDiscoveryMobileViewport,
    isDiscoveryTabletViewport
  } = useDiscoveryViewport(viewportWidth);

  const [search, setSearch] = useState('');
  const [debouncedDiscoverySearch, setDebouncedDiscoverySearch] = useState('');
  const discoveryState = useDiscoveryState({ search });
  const { discoveryFilterToolbarRef } = useDiscoveryFilterDropdown({
    setActiveDiscoveryFilterDropdown: discoveryState.setActiveDiscoveryFilterDropdown
  });
  const { loadStores, retryLoadStores } = useDiscoveryStoreLoader({
    debouncedDiscoverySearch,
    discoveryCoordsRef: discoveryState.discoveryCoordsRef,
    discoveryIncludeMatchMeta: discoveryState.discoveryIncludeMatchMeta,
    discoveryPinScope: discoveryState.discoveryPinScope,
    discoveryResultMode: discoveryState.discoveryResultMode,
    discoveryStockFilter: discoveryState.discoveryStockFilter,
    requestJson,
    searchRef: discoveryState.searchRef,
    setDiscoveryAppliedFilters: discoveryState.setDiscoveryAppliedFilters,
    setDiscoveryCoords: discoveryState.setDiscoveryCoords,
    setDiscoveryLocationMap: discoveryState.setDiscoveryLocationMap,
    setLoadingDiscoveryLocations: discoveryState.setLoadingDiscoveryLocations,
    setLoadingStores: discoveryState.setLoadingStores,
    setStores: discoveryState.setStores,
    setStoresError: discoveryState.setStoresError,
    stores: discoveryState.stores,
    toSlug
  });

  const hasRestoredDiscoveryLocationRef = useRef(false);
  useEffect(() => {
    if (routeSlug || hasRestoredDiscoveryLocationRef.current) return;
    hasRestoredDiscoveryLocationRef.current = true;

    const geolocation = window.navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) return;

    let cancelled = false;
    const restoreLocation = () => {
      geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          window.localStorage?.setItem(DISCOVERY_LOCATION_PERMISSION_KEY, 'granted');
          loadStores({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }, { pinScope: 'tenant_primary' });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    };

    const permissions = window.navigator?.permissions;
    if (permissions?.query) {
      permissions.query({ name: 'geolocation' })
        .then((status) => {
          if (!cancelled && status?.state === 'granted') restoreLocation();
        })
        .catch(() => {});
    } else if (window.localStorage?.getItem(DISCOVERY_LOCATION_PERMISSION_KEY) === 'granted') {
      restoreLocation();
    }

    return () => {
      cancelled = true;
    };
  }, [loadStores, routeSlug]);

  const {
    handleDiscoverySearch,
    handleNearMe,
    handlePopularDiscoveryCategory
  } = useDiscoverySearchActions({
    loadStores,
    search,
    searchRef: discoveryState.searchRef,
    setDebouncedDiscoverySearch,
    setDiscoveryCategoryFilter: discoveryState.setDiscoveryCategoryFilter,
    setDiscoveryPinScope: discoveryState.setDiscoveryPinScope,
    setHasDiscoveryExplorationStarted: discoveryState.setHasDiscoveryExplorationStarted,
    setIsMobileResultsCollapsed: discoveryState.setIsMobileResultsCollapsed,
    setIsStoreListVisible: discoveryState.setIsStoreListVisible,
    setSearch,
    setSelectedMapPin: discoveryState.setSelectedMapPin
  });

  const catalogSearch = useStorefrontStore((state) => state.catalog.search);
  const setCatalogSearch = useStorefrontStore((state) => state.catalogSetSearch);
  const featuredMerchants = useDiscoveryFeaturedMerchants({ normalizeStorefrontCategories });

  return {
    ...discoveryState,
    ...featuredMerchants,
    activeDiscoveryFilterDropdown: discoveryState.activeDiscoveryFilterDropdown,
    catalogSearch,
    debouncedDiscoverySearch,
    discoveryFilterToolbarRef,
    fnbMobileCatalogInlinePadding,
    fnbMobileLayout,
    fnbMobileMenuInnerWidth,
    fnbMobileSectionTrailingInset,
    isCompactPaginationViewport,
    isDesktopViewport,
    isDiscoveryMobileViewport,
    isDiscoveryTabletViewport,
    isMobileViewport,
    isTabletPaginationViewport,
    loadStores,
    handleDiscoverySearch,
    handleNearMe,
    handlePopularDiscoveryCategory,
    retryLoadStores,
    search,
    setCatalogSearch,
    setDebouncedDiscoverySearch,
    setSearch,
    discoveryLayout,
    discoveryViewportMode
  };
}
