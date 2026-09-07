import { useCallback, useMemo } from 'react';

import { createTrackingAdapterRegistry } from '../../tracking/core.js';
import { useFnbTrackingRuntime } from '../../modes/fnb/tracking/hooks/useFnbTrackingRuntime.js';
import { fnbTrackingAdapter } from '../../modes/fnb/tracking/model/fnbTrackingAdapter.js';
import { useSimpleTrackingRuntime } from '../../modes/simple/tracking/hooks/useSimpleTrackingRuntime.js';
import { simpleTrackingAdapter } from '../../modes/simple/tracking/model/simpleTrackingAdapter.js';
import { useRetailTrackingRuntime } from '../../modes/retail/tracking/hooks/useRetailTrackingRuntime.js';
import { RetailTrackingAdapter } from '../../modes/retail/tracking/model/retailTrackingAdapter.js';
import { serviceTrackingAdapter } from '../../modes/services/tracking/model/serviceTrackingAdapter.js';
import {
  advanceServicesLocalSimulation as advanceLocalServicesSimulation
} from '../../modes/services/tracking/model/servicesLocalSimulation.js';

/**
 * Composes the four storefront tracking runtimes in one stable hook boundary.
 * Every runtime is instantiated on every render so React hook ordering remains
 * stable when a tenant changes mode; only the active adapter result is selected.
 * Tracking requests, polling, storage, and map payloads remain owned by the
 * mode runtimes themselves.
 */
export function useStorefrontModeRuntime({
  checkoutTab,
  isFnbOrderSubpage,
  isRetailMode,
  isServicesMode,
  isSimpleMode,
  isSimpleOrderSubpage,
  isServicesTrackingPage,
  isStandaloneTrackingPage,
  normalizeErrorMessage,
  requestJson,
  routeSlug,
  selectedStore,
  toSlug
}) {
  const fnbTrackingAdapterRegistry = useMemo(
    () => createTrackingAdapterRegistry([fnbTrackingAdapter]),
    []
  );
  const fnbTrackingRuntime = useFnbTrackingRuntime({
    checkoutTab,
    isFnbOrderSubpage,
    normalizeErrorMessage,
    requestJson,
    routeSlug,
    selectedStore,
    toSlug,
    trackingAdapterRegistry: fnbTrackingAdapterRegistry,
    trackingMode: 'fnb'
  });

  const servicesTrackingAdapterRegistry = useMemo(
    () => createTrackingAdapterRegistry([serviceTrackingAdapter]),
    []
  );
  const servicesTrackingRuntime = useFnbTrackingRuntime({
    checkoutTab,
    isFnbOrderSubpage: isServicesTrackingPage,
    normalizeErrorMessage,
    requestJson,
    routeSlug,
    selectedStore,
    toSlug,
    trackingAdapterRegistry: servicesTrackingAdapterRegistry,
    trackingMode: 'services'
  });

  const simpleTrackingAdapterRegistry = useMemo(
    () => createTrackingAdapterRegistry([simpleTrackingAdapter]),
    []
  );
  const simpleTrackingRuntime = useSimpleTrackingRuntime({
    checkoutTab,
    enabled: isSimpleMode,
    isSimpleOrderSubpage,
    normalizeErrorMessage,
    requestJson,
    routeSlug,
    selectedStore,
    toSlug,
    trackingAdapterRegistry: simpleTrackingAdapterRegistry
  });

  const retailTrackingAdapterRegistry = useMemo(
    () => createTrackingAdapterRegistry([RetailTrackingAdapter]),
    []
  );
  const retailTrackingRuntime = useRetailTrackingRuntime({
    checkoutTab,
    isRetailOrderSubpage: isRetailMode && isStandaloneTrackingPage,
    normalizeErrorMessage,
    requestJson,
    routeSlug,
    selectedStore,
    toSlug,
    trackingAdapterRegistry: retailTrackingAdapterRegistry,
    trackingMode: 'retail'
  });

  const activeTrackingRuntime = isServicesMode
    ? servicesTrackingRuntime
    : (isSimpleMode ? simpleTrackingRuntime : (isRetailMode ? retailTrackingRuntime : fnbTrackingRuntime));

  // Keep the local simulation callback tied to the active runtime's methods,
  // rather than the runtime object itself. Each runtime returns a fresh
  // presentation object on render; depending on that object would recreate
  // this callback on every render and can retrigger consumers that watch it.
  const {
    handleTrack: activeHandleTrack,
    setSelectedTrackingPin: activeSetSelectedTrackingPin,
    setTrackingPinInput: activeSetTrackingPinInput
  } = activeTrackingRuntime;

  const advanceServicesLocalTracking = useCallback((reference) => {
    const storeSlug = selectedStore?.slug || routeSlug;
    const updated = advanceLocalServicesSimulation(storeSlug, reference);
    if (!updated) return;
    activeSetTrackingPinInput(updated.tracking_pin);
    activeSetSelectedTrackingPin(updated.tracking_pin);
    void activeHandleTrack();
  }, [activeHandleTrack, activeSetSelectedTrackingPin, activeSetTrackingPinInput, routeSlug, selectedStore?.slug]);

  return {
    activeTrackingRuntime,
    advanceServicesLocalTracking,
    fnbTrackingRuntime,
    servicesTrackingRuntime,
    simpleTrackingRuntime,
    retailTrackingRuntime
  };
}
