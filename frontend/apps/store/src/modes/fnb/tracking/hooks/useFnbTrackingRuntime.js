import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchNormalizedTrackingEntity } from '../../../../tracking/core.js';
import {
  buildTrackedOrdersSignature,
  readLastTrackingPinForStore,
  readTrackedOrdersAcrossStores,
  readTrackedOrdersForStore,
  TERMINAL_TRACKING_STATUSES,
  upsertTrackedOrderForStore,
  writeLastTrackingPinForStore,
  writeTrackedOrdersForStore
} from '../../../../tracking/storage.js';
import {
  buildTrackingPinKey,
  createCompletionTrackingScheduler,
  formatTrackingCooldown,
  getTrackingRetryAfterSeconds,
  resolveSelectedTrackingPollMs,
  resolveTrackingRetryDelayMs
} from '../../../../tracking/customerTrackingRefresh.js';
import { buildFnbTrackedOrderEntry, toFnbTrackingViewState } from '../model/fnbTrackingPayload.js';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../src/observability/analyticsEvents.js';

const BACKGROUND_PIN_POLL_MS = { visible: 60000, hidden: 120000 };

export function useFnbTrackingRuntime({ checkoutTab, isFnbOrderSubpage, normalizeErrorMessage, requestJson, routeSlug, selectedStore, toSlug, trackingAdapterRegistry, trackingMode }) {
  const [trackingPinInput, setTrackingPinInput] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [isTrackingRefreshing, setIsTrackingRefreshing] = useState(false);
  const [guestTrackedOrders, setGuestTrackedOrders] = useState([]);
  const [selectedTrackingPin, setSelectedTrackingPin] = useState('');
  const [showCompletedTrackingCard, setShowCompletedTrackingCard] = useState(false);
  const completedTimerRef = useRef(null);

  // Bails out (returns the previous array unchanged) when the new snapshot has
  // the same pins+statuses, so re-fetches that changed nothing don't produce a
  // new array identity that would retrigger effects keyed on guestTrackedOrders.
  const setGuestTrackedOrdersIfChanged = useCallback((next) => {
    setGuestTrackedOrders((previous) => (
      buildTrackedOrdersSignature(previous) === buildTrackedOrdersSignature(next) ? previous : next
    ));
  }, []);

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
    setGuestTrackedOrdersIfChanged(readTrackedOrdersAcrossStores().filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase())));
    writeLastTrackingPinForStore(storeSlug, nextEntry.tracking_pin);
  }, [buildTrackedOrderEntryFromTrackingPayload, routeSlug, selectedStore, setGuestTrackedOrdersIfChanged, toSlug]);

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
    if (!storeSlug) { setGuestTrackedOrdersIfChanged([]); return; }
    const activeStoreEntries = readTrackedOrdersForStore(storeSlug).filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    writeTrackedOrdersForStore(storeSlug, activeStoreEntries);
    const activeEntries = readTrackedOrdersAcrossStores().filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    setGuestTrackedOrdersIfChanged(activeEntries);
    const nextPin = String(activeStoreEntries[0]?.tracking_pin || readLastTrackingPinForStore(storeSlug) || '').trim().toUpperCase();
    if (!trackingPinInput && nextPin) setTrackingPinInput(nextPin);
    if (!selectedTrackingPin && nextPin) setSelectedTrackingPin(nextPin);
  }, [routeSlug, selectedStore?.slug, selectedTrackingPin, setGuestTrackedOrdersIfChanged, toSlug, trackingPinInput]);

  const selectedPin = String(selectedTrackingPin || trackingPinInput || '').trim().toUpperCase();
  const backgroundPinKey = useMemo(
    () => buildTrackingPinKey(guestTrackedOrders, { excludePin: selectedPin }),
    [guestTrackedOrders, selectedPin]
  );

  // `checkoutTab === 'track' && isFnbOrderSubpage` is the same gate the
  // polling effect below uses to decide the tracking view is actually on
  // screen -- reusing it here (rather than the store-slug effect above,
  // which also fires on unrelated store navigation) keeps this to one
  // event per time a visitor actually opens tracking.
  const isTrackingViewActive = checkoutTab === 'track' && isFnbOrderSubpage;
  useEffect(() => {
    if (!isTrackingViewActive) return;
    trackFunnelEvent(ANALYTICS_EVENTS.ORDER_TRACKING_VIEWED, {
      store_slug: selectedStore?.slug,
      tracking_pin: selectedPin || undefined
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingViewActive]);

  // Route unstable callbacks/closures (and the ever-changing tracking status)
  // through refs so the polling effect below only needs to depend on stable
  // primitives (selectedPin, backgroundPinKey) — otherwise every status
  // transition or re-render of these callbacks would tear down and recreate
  // the poll, defeating the scheduled delay entirely (this was the root cause
  // of the original runaway-request bug).
  const fetchTrackingPayloadRef = useRef(fetchTrackingPayload);
  fetchTrackingPayloadRef.current = fetchTrackingPayload;
  const syncTrackedOrderSnapshotRef = useRef(syncTrackedOrderSnapshot);
  syncTrackedOrderSnapshotRef.current = syncTrackedOrderSnapshot;
  const normalizeErrorMessageRef = useRef(normalizeErrorMessage);
  normalizeErrorMessageRef.current = normalizeErrorMessage;
  const trackingStatusRef = useRef('');
  trackingStatusRef.current = String(trackingResult?.status || '').trim().toLowerCase();

  useEffect(() => {
    if (!(checkoutTab === 'track' && isFnbOrderSubpage) || !selectedStore?.slug) return undefined;
    const backgroundPins = backgroundPinKey ? backgroundPinKey.split('|') : [];
    if (!selectedPin && backgroundPins.length === 0) return undefined;

    let lastStatus = trackingStatusRef.current;

    const refreshSelected = async () => {
      setIsTrackingRefreshing(true);
      try {
        const payload = await fetchTrackingPayloadRef.current(selectedPin);
        syncTrackedOrderSnapshotRef.current(payload.raw, selectedPin, payload.normalized);
        const viewState = toFnbTrackingViewState(payload);
        setTrackingResult(viewState);
        setTrackingError('');
        lastStatus = String(viewState?.status || '').trim().toLowerCase();
        return { status: lastStatus };
      } catch (error) {
        const retryAfterSeconds = getTrackingRetryAfterSeconds(error);
        setTrackingError(retryAfterSeconds
          ? `Too many refreshes. Retrying in ${formatTrackingCooldown(retryAfterSeconds)}.`
          : normalizeErrorMessageRef.current(error, 'Tracking failed.'));
        return { status: lastStatus, error };
      } finally {
        setIsTrackingRefreshing(false);
      }
    };

    const scheduler = createCompletionTrackingScheduler({
      poll: refreshSelected,
      resolveDelayMs: ({ result, error }) => {
        const normalDelayMs = resolveSelectedTrackingPollMs({
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'visible',
          status: result?.status
        });
        return resolveTrackingRetryDelayMs({ error: error || result?.error, normalDelayMs });
      }
    });
    if (selectedPin) scheduler.start();

    let backgroundTimerId = null;
    const scheduleBackground = () => {
      const delayMs = typeof document !== 'undefined' && document.visibilityState === 'hidden'
        ? BACKGROUND_PIN_POLL_MS.hidden
        : BACKGROUND_PIN_POLL_MS.visible;
      backgroundTimerId = window.setTimeout(async () => {
        await Promise.all(backgroundPins.map(async (pin) => {
          try {
            const payload = await fetchTrackingPayloadRef.current(pin);
            syncTrackedOrderSnapshotRef.current(payload.raw, pin, payload.normalized);
          } catch { /* background pins retry silently on the next tick */ }
        }));
        scheduleBackground();
      }, delayMs);
    };
    if (backgroundPins.length) scheduleBackground();

    const handleVisibilityChange = () => {
      if (!selectedPin) return;
      scheduler.stop();
      scheduler.start();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      scheduler.stop();
      if (backgroundTimerId) window.clearTimeout(backgroundTimerId);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [backgroundPinKey, checkoutTab, isFnbOrderSubpage, selectedPin, selectedStore?.slug]);

  return { buildTrackedOrderEntryFromTrackingPayload, fetchTrackingPayload, guestTrackedOrders, handleTrack, isTrackingRefreshing, selectedTrackingPin, setGuestTrackedOrders: setGuestTrackedOrdersIfChanged, setSelectedTrackingPin, setTrackingError, setTrackingPinInput, setTrackingResult, showCompletedTrackingCard, syncTrackedOrderSnapshot, trackingError, trackingPinInput, trackingResult };
}
