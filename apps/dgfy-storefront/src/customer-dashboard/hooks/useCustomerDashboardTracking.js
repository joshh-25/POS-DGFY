import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVE_CUSTOMER_ORDER_STATUSES } from '../model/customerOrderStatus.js';

export function useCustomerDashboardTracking({ accountPanel, setAccountPanel, selectedStore, routeSlug, knownStoreRouteCandidates, dgfySessionAccount, setIsAccountDrawerOpen, getFetchTrackingPayload, getBuildTrackedOrderEntryFromTrackingPayload, getGoStoreTrackPage, mapAccountActivityToTrackedOrderEntry, mergeTrackedOrderEntries, mergeAccountPanelActivity, resolveStorefrontRouteSlug, toSlug, withAssetOrigin, requestJson, normalizeStorefrontErrorMessage, readDgfyAuthToken, onTrackedActivityUpdated }) {
  const [trackedCustomerActivity, setTrackedCustomerActivity] = useState(null);
  const [customerTrackLoadingReference, setCustomerTrackLoadingReference] = useState('');
  const [customerTrackError, setCustomerTrackError] = useState('');
  const [overrides, setOverrides] = useState({});
  const mergeLiveAccountActivityRef = useRef(null);
  // Maps tracking_pin -> the status it was last enriched for, so a re-fetch is
  // only attempted again on an actual status transition, not on every poll
  // cycle (the account-panel live sync can bump updated_at every ~3s even
  // when nothing meaningful changed).
  const enrichmentAttemptsRef = useRef(new Map());
  const fetchGetterRef = useRef(getFetchTrackingPayload);
  const buildGetterRef = useRef(getBuildTrackedOrderEntryFromTrackingPayload);
  const navigateGetterRef = useRef(getGoStoreTrackPage);
  fetchGetterRef.current = getFetchTrackingPayload;
  buildGetterRef.current = getBuildTrackedOrderEntryFromTrackingPayload;
  navigateGetterRef.current = getGoStoreTrackPage;
  const activeCustomerOrders = useMemo(() => (Array.isArray(accountPanel?.orders) ? accountPanel.orders : []).filter((order) => ACTIVE_CUSTOMER_ORDER_STATUSES.has(String(order?.status || '').trim().toLowerCase())), [accountPanel?.orders]);
  const activeCustomerOrderCount = activeCustomerOrders.length;
  const fetchTrackingPayload = useCallback(async (...args) => {
    const getter = fetchGetterRef.current;
    const target = typeof getter === 'function' ? getter() : null;
    if (typeof target !== 'function') throw new Error('Tracking payload loader unavailable.');
    return target(...args);
  }, []);
  const buildTrackedEntry = useCallback((...args) => {
    const getter = buildGetterRef.current;
    const target = typeof getter === 'function' ? getter() : null;
    if (typeof target !== 'function') throw new Error('Tracking entry builder unavailable.');
    return target(...args);
  }, []);
  const navigateToTracking = useCallback((...args) => {
    const getter = navigateGetterRef.current;
    const target = typeof getter === 'function' ? getter() : null;
    return typeof target === 'function' ? target(...args) : undefined;
  }, []);
  const accountTrackedOrders = useMemo(() => mergeTrackedOrderEntries(activeCustomerOrders.map((order) => {
    const mapped = mapAccountActivityToTrackedOrderEntry(order, selectedStore, knownStoreRouteCandidates);
    if (!mapped?.tracking_pin) return mapped;
    return overrides[mapped.tracking_pin] ? { ...mapped, ...overrides[mapped.tracking_pin] } : mapped;
  }).filter(Boolean)), [activeCustomerOrders, knownStoreRouteCandidates, mapAccountActivityToTrackedOrderEntry, mergeTrackedOrderEntries, overrides, selectedStore]);
  const resolveStorefrontMetaForAccountEntry = useCallback((entry = {}) => {
    if (!entry || typeof entry !== 'object') return { slug: '', name: '', logoUrl: '' };
    const slug = resolveStorefrontRouteSlug(entry, selectedStore, knownStoreRouteCandidates);
    const entryName = String(entry.store_name || entry.store?.name || '').trim();
    const matched = [selectedStore, ...knownStoreRouteCandidates].filter(Boolean).find((store) => {
      const candidateSlug = toSlug(store?.slug || '');
      const candidateName = String(store?.tenant_name || store?.name || '').trim().toLowerCase();
      return (slug && candidateSlug === slug) || (entryName && candidateName === entryName.toLowerCase());
    });
    return { slug, name: String(matched?.tenant_name || matched?.name || entryName || '').trim(), logoUrl: withAssetOrigin(matched?.storefront_profile_image_url || matched?.profile_image_url || entry.store_logo || entry.storefront_profile_image_url || entry.profile_image_url || '') };
  }, [knownStoreRouteCandidates, resolveStorefrontRouteSlug, selectedStore, toSlug, withAssetOrigin]);
  const mergeLiveAccountActivity = useCallback((activity) => {
    if (!activity || typeof activity !== 'object') return;
    const reference = String(activity.reference || '').trim().toUpperCase();
    setAccountPanel((previous) => mergeAccountPanelActivity(previous, activity));
    setTrackedCustomerActivity((previous) => String(previous?.reference || '').trim().toUpperCase() === reference && reference ? { ...previous, ...activity } : previous);
    onTrackedActivityUpdated?.(activity);
  }, [mergeAccountPanelActivity, onTrackedActivityUpdated, setAccountPanel]);
  mergeLiveAccountActivityRef.current = mergeLiveAccountActivity;
  const handleTrackCustomerReference = useCallback(async (referenceOrOrder) => {
    const payload = referenceOrOrder && typeof referenceOrOrder === 'object' ? referenceOrOrder : null;
    const reference = String(payload?.reference || referenceOrOrder || '').trim().toUpperCase();
    if (!reference) return;
    const slug = resolveStorefrontRouteSlug(payload || {}, selectedStore, knownStoreRouteCandidates) || toSlug(selectedStore?.slug || routeSlug);
    if (slug) { setTrackedCustomerActivity(payload || null); setIsAccountDrawerOpen(false); navigateToTracking({ pin: reference, storeSlug: slug }); return; }
    const token = readDgfyAuthToken();
    if (!token && !dgfySessionAccount?.id) { setCustomerTrackError('Sign in to track account-linked activity.'); return; }
    setCustomerTrackError('');
    setCustomerTrackLoadingReference(reference);
    try {
      const response = await requestJson('/api/v1/dgfy/customer/track', { method: 'POST', authToken: token, cache: 'no-store', body: { reference } });
      const activity = response?.activity || null;
      setTrackedCustomerActivity(activity);
      const activitySlug = resolveStorefrontRouteSlug(activity || {}, selectedStore, knownStoreRouteCandidates) || toSlug(selectedStore?.slug || routeSlug);
      const activityReference = String(activity?.reference || reference).trim().toUpperCase();
      if (activitySlug && activityReference) { setIsAccountDrawerOpen(false); navigateToTracking({ pin: activityReference, storeSlug: activitySlug }); }
    } catch (error) { setCustomerTrackError(normalizeStorefrontErrorMessage(error, 'Unable to load tracked activity.')); setTrackedCustomerActivity(null); }
    finally { setCustomerTrackLoadingReference(''); }
  }, [dgfySessionAccount?.id, knownStoreRouteCandidates, navigateToTracking, normalizeStorefrontErrorMessage, readDgfyAuthToken, requestJson, resolveStorefrontRouteSlug, routeSlug, selectedStore, setIsAccountDrawerOpen, toSlug]);
  useEffect(() => {
    if (!selectedStore?.slug || accountTrackedOrders.length === 0) return undefined;
    const entries = accountTrackedOrders.filter((entry) => {
      if (!entry?.tracking_pin || (Array.isArray(entry.items) && entry.items.length > 0)) return false;
      const lastAttemptedStatus = enrichmentAttemptsRef.current.get(entry.tracking_pin);
      return lastAttemptedStatus === undefined || lastAttemptedStatus !== entry.status;
    });
    if (entries.length === 0) return undefined;
    let cancelled = false;
    void (async () => {
      for (const entry of entries) {
        enrichmentAttemptsRef.current.set(entry.tracking_pin, entry.status);
        try {
          const trackingPayload = await fetchTrackingPayload(entry.tracking_pin);
          if (cancelled) return;
          const next = buildTrackedEntry(trackingPayload.raw, entry.tracking_pin, trackingPayload.normalized, selectedStore);
          if (next?.tracking_pin) setOverrides((previous) => ({ ...previous, [next.tracking_pin]: { ...(previous[next.tracking_pin] || {}), ...next } }));
        } catch { if (cancelled) return; }
      }
    })();
    return () => { cancelled = true; };
  }, [accountTrackedOrders, buildTrackedEntry, fetchTrackingPayload, selectedStore]);
  return { trackedCustomerActivity, setTrackedCustomerActivity, customerTrackLoadingReference, setCustomerTrackLoadingReference, customerTrackError, setCustomerTrackError, activeCustomerOrders, activeCustomerOrderCount, accountTrackedOrders, resolveStorefrontMetaForAccountEntry, mergeLiveAccountActivityRef, handleTrackCustomerReference };
}
