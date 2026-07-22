import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNormalizedTrackingEntity } from '../../../../tracking/core.js';
import {
  readLastTrackingPinForStore,
  readTrackedOrdersAcrossStores,
  readTrackedOrdersForStore,
  TERMINAL_TRACKING_STATUSES,
  upsertTrackedOrderForStore,
  writeLastTrackingPinForStore,
  writeTrackedOrdersForStore
} from '../../../../tracking/storage.js';
import { buildFnbTrackedOrderEntry, toFnbTrackingViewState } from '../model/fnbTrackingPayload.js';

export function useFnbTrackingRuntime({ checkoutTab, isFnbOrderSubpage, normalizeErrorMessage, requestJson, routeSlug, selectedStore, toSlug, trackingAdapterRegistry, trackingMode }) {
  const [trackingPinInput, setTrackingPinInput] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [isTrackingRefreshing, setIsTrackingRefreshing] = useState(false);
  const [guestTrackedOrders, setGuestTrackedOrders] = useState([]);
  const [selectedTrackingPin, setSelectedTrackingPin] = useState('');
  const [showCompletedTrackingCard, setShowCompletedTrackingCard] = useState(false);
  const completedTimerRef = useRef(null);

  const fetchTrackingPayload = useCallback(async (pin) => {
    const normalizedPin = String(pin || '').trim().toUpperCase();
    if (!normalizedPin || !selectedStore?.slug) throw new Error('Select a storefront and enter a valid tracking pin.');
    const input = { mode: trackingMode, storeSlug: selectedStore.slug, rawReference: normalizedPin };
    const adapterResult = await fetchNormalizedTrackingEntity({ registry: trackingAdapterRegistry, input, requestJson });
    if (adapterResult) return adapterResult;
    const raw = await requestJson(`/api/v1/store/track/${encodeURIComponent(normalizedPin)}`, { storeSlug: selectedStore.slug });
    return { adapterMode: null, raw, normalized: null };
  }, [requestJson, selectedStore?.slug, trackingAdapterRegistry, trackingMode]);

  const buildTrackedOrderEntryFromTrackingPayload = useCallback((payload, fallbackPin = '', normalizedEntity = null, fallbackStore = null) => (
    buildFnbTrackedOrderEntry({ fallbackPin, normalizedEntity, payload, fallbackStore: fallbackStore || selectedStore, routeSlug, toSlug })
  ), [routeSlug, selectedStore, toSlug]);

  const syncTrackedOrderSnapshot = useCallback((payload, fallbackPin = '', normalizedEntity = null) => {
    const storeSlug = toSlug(selectedStore?.slug || routeSlug);
    if (!storeSlug) return;
    const nextEntry = buildTrackedOrderEntryFromTrackingPayload(payload, fallbackPin, normalizedEntity, selectedStore);
    if (!nextEntry?.tracking_pin) return;
    upsertTrackedOrderForStore(storeSlug, { ...nextEntry, store_slug: storeSlug });
    setGuestTrackedOrders(readTrackedOrdersAcrossStores().filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase())));
    writeLastTrackingPinForStore(storeSlug, nextEntry.tracking_pin);
  }, [buildTrackedOrderEntryFromTrackingPayload, routeSlug, selectedStore, toSlug]);

  const handleTrack = useCallback(async () => {
    setTrackingError('');
    setIsTrackingRefreshing(true);
    try {
      const pin = trackingPinInput.trim().toUpperCase();
      const payload = await fetchTrackingPayload(pin);
      setTrackingResult(toFnbTrackingViewState(payload));
      setSelectedTrackingPin(pin);
      syncTrackedOrderSnapshot(payload.raw, pin, payload.normalized);
    } catch (error) {
      setTrackingError(normalizeErrorMessage(error, 'Tracking failed.'));
    } finally {
      setIsTrackingRefreshing(false);
    }
  }, [fetchTrackingPayload, normalizeErrorMessage, syncTrackedOrderSnapshot, trackingPinInput]);

  useEffect(() => () => {
    if (completedTimerRef.current) window.clearTimeout(completedTimerRef.current);
  }, []);

  useEffect(() => {
    const completed = String(trackingResult?.status || '').trim().toLowerCase() === 'completed';
    if (!completed) { setShowCompletedTrackingCard(false); return; }
    completedTimerRef.current = window.setTimeout(() => setShowCompletedTrackingCard(true), 250);
    return () => window.clearTimeout(completedTimerRef.current);
  }, [trackingResult?.status]);

  useEffect(() => {
    const storeSlug = toSlug(selectedStore?.slug || routeSlug);
    if (!storeSlug) { setGuestTrackedOrders([]); return; }
    const activeStoreEntries = readTrackedOrdersForStore(storeSlug).filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    writeTrackedOrdersForStore(storeSlug, activeStoreEntries);
    const activeEntries = readTrackedOrdersAcrossStores().filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    setGuestTrackedOrders(activeEntries);
    const nextPin = String(activeStoreEntries[0]?.tracking_pin || readLastTrackingPinForStore(storeSlug) || '').trim().toUpperCase();
    if (!trackingPinInput && nextPin) setTrackingPinInput(nextPin);
    if (!selectedTrackingPin && nextPin) setSelectedTrackingPin(nextPin);
  }, [routeSlug, selectedStore?.slug, selectedTrackingPin, toSlug, trackingPinInput]);

  useEffect(() => {
    if (!(checkoutTab === 'track' && isFnbOrderSubpage) || !selectedStore?.slug) return undefined;
    const selectedPin = String(selectedTrackingPin || trackingPinInput || '').trim().toUpperCase();
    const backgroundPins = guestTrackedOrders.map((entry) => String(entry.tracking_pin || '').trim().toUpperCase()).filter((pin) => pin && pin !== selectedPin);
    if (!selectedPin && backgroundPins.length === 0) return undefined;
    let cancelled = false;
    const refresh = async (pin, selected) => {
      try {
        if (selected) setIsTrackingRefreshing(true);
        const payload = await fetchTrackingPayload(pin);
        if (cancelled) return;
        syncTrackedOrderSnapshot(payload.raw, pin, payload.normalized);
        if (selected) { setTrackingResult(toFnbTrackingViewState(payload)); setTrackingError(''); }
      } catch (error) {
        if (!cancelled && selected) setTrackingError(normalizeErrorMessage(error, 'Tracking failed.'));
      } finally { if (!cancelled && selected) setIsTrackingRefreshing(false); }
    };
    void refresh(selectedPin, true);
    backgroundPins.forEach((pin) => { void refresh(pin, false); });
    const selectedTimer = selectedPin ? window.setInterval(() => void refresh(selectedPin, true), document.hidden ? 8000 : 2000) : null;
    const backgroundTimer = backgroundPins.length ? window.setInterval(() => backgroundPins.forEach((pin) => { void refresh(pin, false); }), document.hidden ? 30000 : 12000) : null;
    return () => { cancelled = true; if (selectedTimer) window.clearInterval(selectedTimer); if (backgroundTimer) window.clearInterval(backgroundTimer); };
  }, [checkoutTab, fetchTrackingPayload, guestTrackedOrders, isFnbOrderSubpage, normalizeErrorMessage, selectedStore?.slug, selectedTrackingPin, syncTrackedOrderSnapshot, trackingPinInput]);

  return { buildTrackedOrderEntryFromTrackingPayload, fetchTrackingPayload, guestTrackedOrders, handleTrack, isTrackingRefreshing, selectedTrackingPin, setGuestTrackedOrders, setSelectedTrackingPin, setTrackingError, setTrackingPinInput, setTrackingResult, showCompletedTrackingCard, syncTrackedOrderSnapshot, trackingError, trackingPinInput, trackingResult };
}
