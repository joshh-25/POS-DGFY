import { useCallback } from 'react';
import { toast } from 'sonner';

import {
  buildOrderTarget,
  buildStorefrontHistoryState,
  buildTrackTarget,
  isCurrentStorefrontTarget
} from '../routing/storefrontNavigation.js';
import {
  STORE_ORDER_SUBPAGE,
  STORE_TRACK_SUBPAGE
} from '../routing/storefrontRouting.js';
import { toSlug } from '../../shared/utils/storefrontFormatters.js';
import { canUseCheckout, getStorefrontAccessBlockMessage } from '../../shared/model/customerAccess.js';
import { openStorefrontActionLink, sanitizeExternalLink } from '../../shared/utils/externalLinks.js';
import {
  readLastTrackingPinForStore,
  readTrackedOrdersForStore,
  TERMINAL_TRACKING_STATUSES,
  writeLastTrackingPinForStore,
  writeServiceHandoffForBooking
} from '../../tracking/storage.js';

/**
 * Route callbacks for order and tracking entry points shared by all storefront
 * modes. Page components receive these callbacks without needing to know URL or
 * tracking-storage details.
 */
export function useStorefrontOrderNavigation({
  checkoutResult,
  goStore,
  isServicesMode,
  routeSlug,
  selectedLocationId,
  selectedStore,
  selectedTrackingPin,
  setCheckoutTab,
  setFnbOrderStep,
  setIsCheckoutOpen,
  setPendingOrderInitialTab,
  setRouteItemId,
  setRouteServiceItemId,
  setRouteSlug,
  setRouteSubpage,
  setSelectedTrackingPin,
  setSimpleOrderStep,
  setTrackingPinInput,
  trackingPinInput
}) {
  const goStoreOrderForDiscovery = useCallback((slug, locationId = null, storeContext = null) => {
    const normalized = toSlug(slug);
    if (!normalized || typeof window === 'undefined') return;
    if (storeContext?.entity_type === 'external_listing') {
      openStorefrontActionLink(sanitizeExternalLink(storeContext.storefront_url || storeContext.external_storefront_url));
      return;
    }
    goStore(normalized, locationId);
    if (!canUseCheckout(storeContext)) {
      const message = getStorefrontAccessBlockMessage(storeContext);
      if (message) toast.error(message);
    }
    window.requestAnimationFrame(() => {
      document.getElementById('storefront-catalog-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }, [goStore]);

  const goStoreOrderPage = useCallback(({ initialTab } = {}) => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const persistedTrackedOrders = readTrackedOrdersForStore(normalized)
      .filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    const resolvedInitialTab = initialTab || 'checkout';
    const target = buildOrderTarget(normalized, { locationId: selectedLocationId });
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({
        storeSlug: normalized,
        storeSubpage: STORE_ORDER_SUBPAGE,
        locationId: selectedLocationId
      }), '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(STORE_ORDER_SUBPAGE);
    setRouteServiceItemId(null);
    setRouteItemId(null);
    setPendingOrderInitialTab(resolvedInitialTab);
    if (!trackingPinInput) {
      const preferredPin = String(persistedTrackedOrders[0]?.tracking_pin || readLastTrackingPinForStore(normalized) || '').trim().toUpperCase();
      if (preferredPin) {
        setTrackingPinInput(preferredPin);
        if (!selectedTrackingPin) setSelectedTrackingPin(preferredPin);
      }
    }
    setFnbOrderStep(checkoutResult ? 4 : 3);
    setSimpleOrderStep(checkoutResult ? 4 : 1);
    setCheckoutTab(resolvedInitialTab);
    setIsCheckoutOpen(false);
  }, [checkoutResult, routeSlug, selectedLocationId, selectedStore?.slug, selectedTrackingPin, setCheckoutTab, setFnbOrderStep, setIsCheckoutOpen, setPendingOrderInitialTab, setRouteItemId, setRouteServiceItemId, setRouteSlug, setRouteSubpage, setSelectedTrackingPin, setSimpleOrderStep, setTrackingPinInput, trackingPinInput]);

  const goStoreTrackPage = useCallback(({ pin = '', storeSlug = '', serviceHandoff = '' } = {}) => {
    const normalized = toSlug(storeSlug || selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const normalizedPin = String(pin || selectedTrackingPin || trackingPinInput || readLastTrackingPinForStore(normalized) || '').trim().toUpperCase();
    const target = buildTrackTarget(normalized, normalizedPin, { locationId: selectedLocationId });
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({
        storeSlug: normalized,
        storeSubpage: STORE_TRACK_SUBPAGE,
        locationId: selectedLocationId
      }), '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(STORE_TRACK_SUBPAGE);
    setRouteServiceItemId(null);
    setRouteItemId(null);
    setPendingOrderInitialTab('track');
    if (normalizedPin) {
      setSelectedTrackingPin(normalizedPin);
      setTrackingPinInput(normalizedPin);
      writeLastTrackingPinForStore(normalized, normalizedPin);
      if (isServicesMode) writeServiceHandoffForBooking(normalized, normalizedPin, serviceHandoff);
    }
    setFnbOrderStep(checkoutResult ? 4 : 3);
    setSimpleOrderStep(checkoutResult ? 4 : 1);
    setCheckoutTab('track');
    setIsCheckoutOpen(false);
  }, [checkoutResult, isServicesMode, routeSlug, selectedLocationId, selectedStore?.slug, selectedTrackingPin, setCheckoutTab, setFnbOrderStep, setIsCheckoutOpen, setPendingOrderInitialTab, setRouteItemId, setRouteServiceItemId, setRouteSlug, setRouteSubpage, setSelectedTrackingPin, setSimpleOrderStep, setTrackingPinInput, trackingPinInput]);

  return { goStoreOrderForDiscovery, goStoreOrderPage, goStoreTrackPage };
}
