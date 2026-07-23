import { writeLastTrackingPinForStore } from '../../tracking/storage.js';
import { toSlug } from '../utils/storefrontFormatters.js';

/**
 * Hook that owns `trackingDrawerOrders` and the two tracking-drawer
 * entry-point actions. Moved verbatim from `StorefrontApp.jsx`:
 * `trackingDrawerOrders`, `openTrackPanel`, and `openFullTrackingForPin`.
 *
 * `trackingMode`/`trackingAdapterRegistry` stay in the shell at their
 * original earlier position, feeding the unmoved `useFnbTrackingRuntime`
 * call — that call happens BEFORE `guestTrackedOrders` exists, and
 * `guestTrackedOrders` is itself one of `trackingDrawerOrders`' two inputs
 * (the other, `accountTrackedOrders`, doesn't exist until the later,
 * also-unmoved `useCustomerDashboardRuntime` call returns). This hook can
 * only be called after both of those inputs exist, so it's a genuine
 * ordering cycle, not a plain TDZ — `trackingMode`/`trackingAdapterRegistry`
 * are out of scope for this hook.
 *
 * `isDgfyCustomerSignedIn`/`accountTrackedOrders`/`guestTrackedOrders`
 * (external, read-only), `isStorePage`/`canOpenTrackingDrawer` (external,
 * read-only), `handleLoadAccountPanel` (external function, called not
 * owned), `setIsGuestTrackingDrawerOpen`/`setIsCheckoutOpen`/
 * `setCheckoutTab`/`setSelectedTrackingPin`/`setTrackingPinInput`/
 * `setTrackingResult`/`setTrackingError` (external setters), and
 * `selectedStore`/`routeSlug` (external, read-only) are all taken as plain
 * external params.
 *
 * `getGoStoreTrackPage` is a lazy getter (the same forward-reference idiom
 * used for `getGoStoreTrackPage`/`getFetchTrackingPayload` in
 * `useCustomerDashboardRuntime`/`useCustomerDashboardTracking`): in the
 * shell, `goStoreTrackPage` is declared AFTER this hook is called, so the
 * shell can only hand this hook a closure that reads it later - by the time
 * `openFullTrackingForPin` actually calls it (a user action, always after
 * the render that declared `goStoreTrackPage` has completed), the real
 * function is always already assigned.
 */
export function useStorefrontTrackingIntent({
  accountTrackedOrders,
  canOpenTrackingDrawer,
  getGoStoreTrackPage,
  guestTrackedOrders,
  handleLoadAccountPanel,
  isDgfyCustomerSignedIn,
  isStorePage,
  routeSlug,
  selectedStore,
  setCheckoutTab,
  setIsCheckoutOpen,
  setIsGuestTrackingDrawerOpen,
  setSelectedTrackingPin,
  setTrackingError,
  setTrackingPinInput,
  setTrackingResult
}) {
  const trackingDrawerOrders = isDgfyCustomerSignedIn ? accountTrackedOrders : guestTrackedOrders;

  const openTrackPanel = () => {
    if (isStorePage || canOpenTrackingDrawer) {
      if (isDgfyCustomerSignedIn) {
        handleLoadAccountPanel();
      }
      setIsGuestTrackingDrawerOpen(true);
      setIsCheckoutOpen(false);
      return;
    }
    setCheckoutTab('track');
    setIsCheckoutOpen(true);
  };
  const openFullTrackingForPin = (pin = '') => {
    const normalizedPin = String(pin || '').trim().toUpperCase();
    const matchedEntry = trackingDrawerOrders.find((entry) => String(entry?.tracking_pin || '').trim().toUpperCase() === normalizedPin);
    const targetSlug = toSlug(matchedEntry?.store_slug || selectedStore?.slug || routeSlug);
    if (normalizedPin) {
      setSelectedTrackingPin(normalizedPin);
      setTrackingPinInput(normalizedPin);
      writeLastTrackingPinForStore(targetSlug, normalizedPin);
      setTrackingResult(null);
      setTrackingError('');
    }
    setIsGuestTrackingDrawerOpen(false);
    const goStoreTrackPage = getGoStoreTrackPage();
    goStoreTrackPage({ pin: normalizedPin, storeSlug: targetSlug });
  };

  return {
    trackingDrawerOrders,
    openTrackPanel,
    openFullTrackingForPin
  };
}
