import { useEffect } from 'react';

import { toSlug } from '../utils/storefrontFormatters.js';
import {
  buildBookingTarget,
  buildCatalogTarget,
  buildServiceDetailTarget,
  buildStorefrontHistoryState,
  isCurrentStorefrontTarget
} from '../../app/routing/storefrontNavigation.js';
import {
  readRouteSlug,
  readStoreItemId,
  readStoreReviewToken,
  readStoreServiceItemId,
  readStoreSubpage,
  STORE_BOOKING_SUBPAGE,
  STORE_SERVICE_SUBPAGE,
  TENANT_STORE_BASE_PATH
} from '../../app/routing/storefrontRouting.js';

/**
 * Hook that owns storefront navigation functions and the popstate listener.
 * Moved verbatim from `StorefrontApp.jsx`: `openServiceDetail`,
 * `closeServiceDetail`, `goStore`, `goStoreBookingPage`, `goStoreCatalogPage`,
 * `goDiscovery`, and the popstate `useEffect`. This hook does not own any
 * state itself — the route state (`routeSlug`, `routeSubpage`,
 * `routeServiceItemId`, `routeItemId`, `routeReviewToken`) and every setter
 * it touches remain owned by the shell or by other hooks (`useStoreCatalogLoader`,
 * discovery state, etc.); they are taken here as explicit parameters. Branching,
 * history-state building, and slug-fallback logic are unchanged from the shell.
 */
export function useStorefrontNavigation({
  routeSlug,
  selectedStore,
  setRouteSlug,
  setRouteSubpage,
  setRouteServiceItemId,
  setRouteItemId,
  setRouteReviewToken,
  setSelectedServiceDetail,
  setPreferredStoreLocationSelection,
  setIsCheckoutOpen,
  setShowFnbMobileOrderSummary,
  setFnbOrderStep,
  setSimpleOrderStep,
  setSelectedStore,
  setStoreLocations,
  setPrimaryLocationId,
  setSelectedLocationId,
  setHasSelectedBranchFromMenu,
  setCatalog,
  setCatalogError,
  setDiscoveryAppliedFilters,
  setActiveDiscoveryNavItem
}) {
  const openServiceDetail = (service) => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    const serviceItemId = String(service?.item_id || '').trim();
    if (!normalized || !serviceItemId || typeof window === 'undefined') return;
    const target = buildServiceDetailTarget(normalized, serviceItemId);
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({
        storeSlug: normalized,
        storeSubpage: STORE_SERVICE_SUBPAGE,
        serviceItemId
      }), '', target);
    }
    setSelectedServiceDetail(service);
    setRouteSlug(normalized);
    setRouteSubpage(STORE_SERVICE_SUBPAGE);
    setRouteServiceItemId(serviceItemId);
  };
  const closeServiceDetail = () => {
    setSelectedServiceDetail(null);
    setRouteServiceItemId(null);
    goStoreCatalogPage();
  };

  const goStore = (slug, locationId = null) => {
    const normalized = toSlug(slug);
    if (!normalized) return;
    setPreferredStoreLocationSelection(locationId == null ? null : {
      slug: normalized,
      locationId: Number(locationId)
    });
    const target = buildCatalogTarget(normalized);
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({ storeSlug: normalized }), '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(null);
    setRouteServiceItemId(null);
    setRouteItemId(null);
  };
  const goStoreBookingPage = ({ preserveSelectedService = false } = {}) => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const target = buildBookingTarget(normalized);
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({
        storeSlug: normalized,
        storeSubpage: STORE_BOOKING_SUBPAGE
      }), '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(STORE_BOOKING_SUBPAGE);
    setRouteServiceItemId(null);
    setRouteItemId(null);
    if (!preserveSelectedService) {
      setSelectedServiceDetail(null);
    }
    setIsCheckoutOpen(false);
  };
  const goStoreCatalogPage = () => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const target = buildCatalogTarget(normalized);
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({ storeSlug: normalized }), '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(null);
    setRouteServiceItemId(null);
    setRouteItemId(null);
    setShowFnbMobileOrderSummary(false);
    setIsCheckoutOpen(false);
    setFnbOrderStep(3);
    setSimpleOrderStep(1);
  };

  const goDiscovery = () => {
    if (window.location.pathname !== TENANT_STORE_BASE_PATH) window.history.pushState({}, '', TENANT_STORE_BASE_PATH);
    setRouteSlug(null);
    setRouteSubpage(null);
    setRouteServiceItemId(null);
    setRouteItemId(null);
    setSelectedServiceDetail(null);
    setSelectedStore(null);
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    setHasSelectedBranchFromMenu(false);
    setPreferredStoreLocationSelection(null);
    setCatalog([]);
    setCatalogError('');
    setDiscoveryAppliedFilters(null);
    setIsCheckoutOpen(false);
    setActiveDiscoveryNavItem('Explore');
  };

  useEffect(() => {
    const onPopState = () => {
      setRouteSlug(readRouteSlug());
      setRouteSubpage(readStoreSubpage());
      setRouteServiceItemId(readStoreServiceItemId());
      setRouteItemId(readStoreItemId());
      setRouteReviewToken(readStoreReviewToken());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return {
    openServiceDetail,
    closeServiceDetail,
    goStore,
    goStoreBookingPage,
    goStoreCatalogPage,
    goDiscovery
  };
}
