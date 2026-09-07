import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { requestJson } from '../../services/requestJson.js';
import { toSlug } from '../utils/storefrontFormatters.js';
import {
  buildStorefrontSlugFallbackQueries,
  findCanonicalStorefrontSlug
} from '../../app/routing/defaultStorefrontRoute.js';
import {
  buildCanonicalStorefrontTarget,
  buildStorefrontHistoryState,
  isCurrentStorefrontTarget
} from '../../app/routing/storefrontNavigation.js';
import {
  locationsMatchProfileSnapshot,
  normalizeProfileLocations
} from '../../features/discovery/utils/storefrontDiscoveryNormalization.js';
import { normalizeBusinessMode } from '../../discovery/model/businessModePins.js';
import { buildAccessPolicyStorePatch } from '../model/customerAccess.js';
import { buildWorkflowCapabilityStorePatch } from '../model/workflowCapabilities.js';
import { buildPaymentModeStorePatch } from '../model/storefrontDownpaymentPresentation.js';
import { classifyStoreCatalogError } from '../model/storefrontErrorMessages.js';
import { buildStorefrontLoadFailureState } from '../model/storefrontLoadState.js';
import { useStorefrontStore } from '../../store/useStorefrontStore.js';

export const buildCatalogRequestUrl = ({ isServicesMode = false, locationId = null } = {}) => {
  const basePath = isServicesMode ? '/api/v1/store/services/catalog' : '/api/v1/store/catalog';
  const query = new URLSearchParams({ limit: '120' });
  if (locationId != null) query.set('location_id', String(locationId));
  return `${basePath}?${query.toString()}`;
};

const BRANCH_SWITCH_FEEDBACK_MIN_DURATION_MS = 300;

/**
 * Stateful hook that owns storefront catalog/location loading.
 * Moved verbatim from `StorefrontApp.jsx`: the store/catalog `useState`
 * declarations, the branding-image-error tracking callbacks, the
 * store-by-slug loader (with its slug-fallback/canonicalization flow),
 * the route-change effect that triggers it, the location-aware catalog
 * refetch effect, and the branch-menu selection handler. The async flow,
 * error handling, and request-sequencing guards are unchanged from the
 * shell.
 */
// #672: appends `voucher_code` to a catalog query string when present, deduplicating the identical
// param-append logic that would otherwise be repeated at all three fetch sites below.
const withVoucherCodeParam = (query, voucherCode) => {
  const normalized = String(voucherCode || '').trim();
  return normalized ? `${query}&voucher_code=${encodeURIComponent(normalized)}` : query;
};

export function useStoreCatalogLoader({
  routeSlug,
  routeSubpage,
  routeServiceItemId,
  routeItemId,
  isStorePage,
  selectedStore,
  setSelectedStore,
  setRouteSlug,
  preferredStoreLocationSelection,
  voucherCode
}) {
  const catalog = useStorefrontStore((state) => state.catalog.items);
  const setCatalog = useStorefrontStore((state) => state.catalogSetItems);
  const loadingCatalog = useStorefrontStore((state) => state.catalog.loading);
  const setLoadingCatalog = useStorefrontStore((state) => state.catalogSetLoading);
  const catalogError = useStorefrontStore((state) => state.catalog.error);
  const setCatalogError = useStorefrontStore((state) => state.catalogSetError);
  const storeLocations = useStorefrontStore((state) => state.catalog.storeLocations);
  const setStoreLocations = useStorefrontStore((state) => state.catalogSetStoreLocations);
  const selectedLocationId = useStorefrontStore((state) => state.catalog.selectedLocationId);
  const setSelectedLocationId = useStorefrontStore((state) => state.catalogSetSelectedLocationId);
  const primaryLocationId = useStorefrontStore((state) => state.catalog.primaryLocationId);
  const setPrimaryLocationId = useStorefrontStore((state) => state.catalogSetPrimaryLocationId);
  const hasSelectedBranchFromMenu = useStorefrontStore((state) => state.catalog.hasSelectedBranchFromMenu);
  const setHasSelectedBranchFromMenu = useStorefrontStore((state) => state.catalogSetHasSelectedBranchFromMenu);
  const branchSwitchFeedback = useStorefrontStore((state) => state.catalog.branchSwitchFeedback);
  const setBranchSwitchFeedback = useStorefrontStore((state) => state.catalogSetBranchSwitchFeedback);
  const [brandingImageErrors, setBrandingImageErrors] = useState(() => new Set());

  const storeLoadRequestSequenceRef = useRef(0);
  const locationCatalogRequestSequenceRef = useRef(0);
  // Issue #282, Phase C: while openStoreBySlug is running for the current
  // slug, it -- not the location-aware effect below -- owns the catalog
  // fetch. Without this, setSelectedStore(profile) commits mid-flight
  // (before /store/locations resolves), the effect's deps change, and it
  // fires its own /store/catalog request for the same store before
  // openStoreBySlug's own request has even landed: up to 3 catalog
  // requests on a single cold load, of which the last two are identical.
  const storeLoadInFlightRef = useRef(false);
  // The last `${slug}::${locationId}` pair a catalog fetch actually
  // completed for, so a redundant effect run (deps changed but resolve to
  // the same store+location) skips instead of refetching. Consulted only
  // by the effect below -- refreshStorePageForTenantSetup calls
  // openStoreBySlug directly, which never reads this ref, so it always
  // forces a real refetch.
  const lastCatalogKeyRef = useRef('');
  // Cancels the network request(s) of a superseded openStoreBySlug call
  // instead of merely ignoring their eventual response via the sequence
  // guard above -- an actual abort rather than a wasted in-flight request.
  const storeLoadAbortControllerRef = useRef(null);
  const branchSwitchFeedbackRef = useRef(null);
  const branchSwitchFeedbackTimerRef = useRef(null);
  const branchSwitchFeedbackSequenceRef = useRef(0);
  // #694: `openStoreBySlug` reads the CURRENT voucher code via this ref rather than depending on
  // the `voucherCode` prop directly. Before #694 nothing changed `voucherCode` after mount (it only
  // ever arrived once, from a `?voucher=` link), so `openStoreBySlug` depending on it was harmless.
  // Once a catalog-page voucher-entry button can change it live, that dependency would re-identify
  // this whole callback on every applied code -- and the effect below re-runs `openStoreBySlug` on
  // every identity change, firing a full store reload (profile + locations + catalog, clearing
  // `storeLocations`/`selectedLocationId` along the way) for what should be a catalog-only refetch.
  // The location-aware effect further down intentionally keeps `voucherCode` as a real dependency --
  // that one is exactly the codepath that SHOULD refetch on a voucher change.
  const voucherCodeRef = useRef(voucherCode);
  useEffect(() => {
    voucherCodeRef.current = voucherCode;
  }, [voucherCode]);

  // Shared by both catalog-fetch call sites (openStoreBySlug's own fetch and
  // the location-aware effect's) -- previously duplicated inline in each.
  const applyCatalogResponse = useCallback((catalogData) => {
    const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
    const capabilityPatch = buildWorkflowCapabilityStorePatch(catalogData);
    const paymentCapabilitiesPatch = catalogData?.payment_capabilities
      ? { payment_capabilities: catalogData.payment_capabilities }
      : null;
    // Phase 142 (#823): always applied (not conditional like the two above) -- see
    // buildPaymentModeStorePatch's own comment for why.
    const paymentModePatch = buildPaymentModeStorePatch(catalogData);
    if (accessPatch || capabilityPatch || paymentCapabilitiesPatch || paymentModePatch) {
      setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch, ...capabilityPatch, ...paymentCapabilitiesPatch, ...paymentModePatch } : prev));
    }
    setCatalog(
      Array.isArray(catalogData?.items)
        ? catalogData.items
        : (Array.isArray(catalogData?.services) ? catalogData.services : [])
    );
  }, [setCatalog, setSelectedStore]);

  const markBrandingImageError = useCallback((key) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    setBrandingImageErrors((previous) => {
      if (previous.has(normalizedKey)) return previous;
      const next = new Set(previous);
      next.add(normalizedKey);
      return next;
    });
  }, []);
  const isBrandingImageBlocked = useCallback((key) => brandingImageErrors.has(String(key || '').trim()), [brandingImageErrors]);

  const completeBranchSwitchFeedback = useCallback((locationId, { notify = false } = {}) => {
    const pending = branchSwitchFeedbackRef.current;
    if (!pending || Number(pending.locationId) !== Number(locationId)) return;

    const sequence = pending.sequence;
    const finish = () => {
      if (branchSwitchFeedbackRef.current?.sequence !== sequence) return;
      branchSwitchFeedbackRef.current = null;
      branchSwitchFeedbackTimerRef.current = null;
      setBranchSwitchFeedback(null);
      if (notify) toast.success(`Switched to ${pending.label}`);
    };

    if (branchSwitchFeedbackTimerRef.current) {
      clearTimeout(branchSwitchFeedbackTimerRef.current);
      branchSwitchFeedbackTimerRef.current = null;
    }
    const remainingMs = Math.max(
      0,
      BRANCH_SWITCH_FEEDBACK_MIN_DURATION_MS - (Date.now() - pending.startedAt)
    );
    if (remainingMs > 0) {
      branchSwitchFeedbackTimerRef.current = setTimeout(finish, remainingMs);
    } else {
      finish();
    }
  }, [setBranchSwitchFeedback]);

  const openStoreBySlug = useCallback(async (slug) => {
    const normalized = toSlug(slug);
    if (!normalized) return;
    const requestSequence = ++storeLoadRequestSequenceRef.current;
    storeLoadInFlightRef.current = true;
    // Cancel a superseded load's own in-flight requests rather than just
    // outliving them -- the sequence checks below already discard their
    // results, this additionally frees the network/server work.
    storeLoadAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    storeLoadAbortControllerRef.current = abortController;
    const { signal } = abortController;
    let loadedProfile = null;
    let loadedProfileLocations = [];

    setLoadingCatalog(true);
    setCatalogError('');
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    try {
      let profile;
      try {
        // No `cache: 'no-store'` here (issue #282, Phase B): the backend
        // marks this route `public, max-age=30, stale-while-revalidate=60`
        // with `Vary: X-Store-Slug`, so requestJson's default `cache:
        // 'default'` lets the browser actually use that caching instead of
        // discarding it on every navigation.
        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(normalized)}`, { signal });
      } catch (profileError) {
        if (Number(profileError?.status) !== 404) throw profileError;

        let canonicalSlug = '';
        for (const fallbackQuery of buildStorefrontSlugFallbackQueries(normalized)) {
          const discoveryFallback = await requestJson(`/api/v1/storefront/discovery?search=${encodeURIComponent(fallbackQuery)}&limit=20&result_mode=union&stock_filter=include_out_of_stock&pin_scope=tenant_primary&include_match_meta=true`, { signal });
          const fallbackStores = Array.isArray(discoveryFallback?.stores) ? discoveryFallback.stores : [];
          canonicalSlug = findCanonicalStorefrontSlug(normalized, fallbackStores)
            || findCanonicalStorefrontSlug(fallbackQuery, fallbackStores);
          if (canonicalSlug) break;
        }
        if (!canonicalSlug) throw profileError;

        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(canonicalSlug)}`, { signal });
      }
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;

      if (profile?.slug && toSlug(profile.slug) !== normalized && typeof window !== 'undefined') {
        const canonicalPath = buildCanonicalStorefrontTarget({
          storeSlug: profile.slug,
          routeSubpage,
          routeServiceItemId,
          routeItemId,
          locationId: preferredStoreLocationSelection?.locationId
        });
        if (!isCurrentStorefrontTarget(canonicalPath)) {
          window.history.replaceState(buildStorefrontHistoryState({
            storeSlug: profile.slug,
            storeSubpage: routeSubpage,
            serviceItemId: routeServiceItemId,
            itemId: routeItemId,
            locationId: preferredStoreLocationSelection?.locationId
          }), '', canonicalPath);
        }
        setRouteSlug(toSlug(profile.slug));
      }
      loadedProfile = profile;
      setSelectedStore(profile);
      const isServicesStorefront = normalizeBusinessMode(
        profile?.workflow_mode || profile?.ops_workflow_mode
      ) === 'services';
      const canonicalizeLocationUrl = (locationId) => {
        if (locationId == null || typeof window === 'undefined' || !profile?.slug) return;
        const canonicalPath = buildCanonicalStorefrontTarget({
          storeSlug: profile.slug,
          routeSubpage,
          routeServiceItemId,
          routeItemId,
          locationId
        });
        if (!isCurrentStorefrontTarget(canonicalPath)) {
          window.history.replaceState(buildStorefrontHistoryState({
            storeSlug: profile.slug,
            storeSubpage: routeSubpage,
            serviceItemId: routeServiceItemId,
            itemId: routeItemId,
            locationId
          }), '', canonicalPath);
        }
      };
      let resolvedCatalogLocationId = null;
      const profileLocations = normalizeProfileLocations(profile);
      loadedProfileLocations = profileLocations;
      const profileHasNoLocation = profile?.store_has_no_location === true
        || profile?.map_publication_disabled === true;

      // Issue #282, Phase C (item 5): fire the unscoped catalog request in
      // parallel with /store/locations instead of waiting for locations to
      // resolve first -- cuts the critical path from 3 sequential round
      // trips to 2 whenever the resolved location ends up needing no
      // location_id filter (single-location and no-location stores, the
      // common case). When a location_id *is* needed, this response goes
      // unused, but Phase B's caching means the request isn't wasted
      // against the scoped one that follows. Wrapped so it never rejects
      // (tagged result instead) -- nothing may ever await it if the
      // locations fetch itself throws before reaching the branch below.
      const speculativeCatalogPromise = requestJson(withVoucherCodeParam(buildCatalogRequestUrl({
        isServicesMode: isServicesStorefront
      }), voucherCodeRef.current), { storeSlug: profile.slug, signal })
        .then((data) => ({ data }))
        .catch((error) => ({ error }));

      try {
        // No `cache: 'no-store'` (issue #282, Phase B) -- see the profile
        // fetch above for why.
        const locationsData = await requestJson('/api/v1/store/locations', { storeSlug: profile.slug, signal });
        if (requestSequence !== storeLoadRequestSequenceRef.current) return;
        const storeHasNoLocation = profileHasNoLocation
          || locationsData?.store_has_no_location === true
          || locationsData?.map_publication_disabled === true;
        const apiLocations = Array.isArray(locationsData?.locations) ? locationsData.locations : [];
        const useProfileSnapshot = !storeHasNoLocation && !locationsMatchProfileSnapshot(apiLocations, profile);
        const locations = storeHasNoLocation ? [] : (useProfileSnapshot ? profileLocations : apiLocations);
        const nextPrimaryLocationId = useProfileSnapshot
          ? (profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null)
          : (storeHasNoLocation ? null : (locationsData?.primary_location_id ?? null));
        setStoreLocations(locations);
        setPrimaryLocationId(nextPrimaryLocationId);
        if (locations.length > 0) {
          const preferredLocationId = (
            preferredStoreLocationSelection?.slug
            && toSlug(preferredStoreLocationSelection.slug) === toSlug(profile.slug)
          )
            ? preferredStoreLocationSelection.locationId
            : null;
          const preferredLocation = preferredLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(preferredLocationId)) || null);
          const primaryLocation = nextPrimaryLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(nextPrimaryLocationId)) || null);
          const firstOpenLocation = locations.find((location) => location?.is_open !== false) || null;
          const fallbackLocationId = (
            preferredLocation?.location_id
            ?? firstOpenLocation?.location_id
            ?? primaryLocation?.location_id
            ?? locations[0]?.location_id
            ?? null
          );
          resolvedCatalogLocationId = fallbackLocationId;
          setSelectedLocationId(fallbackLocationId);
          canonicalizeLocationUrl(fallbackLocationId);
        } else {
          resolvedCatalogLocationId = null;
          setSelectedLocationId(null);
        }
      } catch {
        if (profileHasNoLocation) {
          setStoreLocations([]);
          setPrimaryLocationId(null);
          resolvedCatalogLocationId = null;
          setSelectedLocationId(null);
        } else {
        const fallbackPrimaryLocationId = profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null;
        setStoreLocations(profileLocations);
        setPrimaryLocationId(fallbackPrimaryLocationId);
        resolvedCatalogLocationId = fallbackPrimaryLocationId;
        setSelectedLocationId(fallbackPrimaryLocationId);
        canonicalizeLocationUrl(fallbackPrimaryLocationId);
        }
      }

      if (requestSequence !== storeLoadRequestSequenceRef.current) return;

      let catalogData;
      if (resolvedCatalogLocationId == null) {
        // Locations resolved to "no location_id filter needed" -- the
        // speculative request fired above already covers this; no third
        // round trip.
        const speculative = await speculativeCatalogPromise;
        if (speculative.error) throw speculative.error;
        catalogData = speculative.data;
      } else {
        // No `cache: 'no-store'` (issue #282, Phase B) -- see the profile
        // fetch above for why.
        catalogData = await requestJson(
          withVoucherCodeParam(buildCatalogRequestUrl({
            isServicesMode: isServicesStorefront,
            locationId: resolvedCatalogLocationId
          }), voucherCodeRef.current),
          { storeSlug: profile.slug, signal }
        );
      }
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;
      applyCatalogResponse(catalogData);
      lastCatalogKeyRef.current = `${profile.slug}::${resolvedCatalogLocationId ?? ''}::${voucherCodeRef.current || ''}`;
    } catch (error) {
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;
      const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant storefront page.');
      const failureState = buildStorefrontLoadFailureState({
        profile: loadedProfile,
        profileLocations: loadedProfileLocations,
        errorMessage: normalizedError.message
      });
      // Keep a successfully loaded profile visible when only the catalog
      // request fails. The hero still has the correct industry mode and can
      // render its honest catalog error state instead of falling back to the
      // generic "Storefront" shell.
      setSelectedStore(failureState.selectedStore);
      setStoreLocations(failureState.storeLocations);
      setCatalog(failureState.catalog);
      setCatalogError(failureState.catalogError);
    } finally {
      if (requestSequence === storeLoadRequestSequenceRef.current) {
        setLoadingCatalog(false);
        storeLoadInFlightRef.current = false;
      }
    }
  // voucherCode is deliberately NOT a dependency here -- see voucherCodeRef's own comment above.
  }, [applyCatalogResponse, preferredStoreLocationSelection, routeItemId, routeServiceItemId, routeSubpage, setCatalog, setCatalogError, setLoadingCatalog, setPrimaryLocationId, setRouteSlug, setSelectedLocationId, setSelectedStore, setStoreLocations]);

  const refreshStorePageForTenantSetup = useCallback(() => {
    if (!routeSlug) return;
    openStoreBySlug(routeSlug);
  }, [openStoreBySlug, routeSlug]);

  useEffect(() => {
    if (!routeSlug) return;
    openStoreBySlug(routeSlug);
  }, [routeSlug, openStoreBySlug]);

  useEffect(() => {
    let cancelled = false;
    const requestSequence = ++locationCatalogRequestSequenceRef.current;
    const abortController = new AbortController();
    const loadLocationAwareCatalog = async () => {
      if (!isStorePage || !selectedStore?.slug) return;
      // Issue #282, Phase C: openStoreBySlug owns the catalog fetch while a
      // full store load is in flight (see storeLoadInFlightRef above) --
      // without this guard, setSelectedStore/setSelectedLocationId commit
      // mid-flight and this effect's deps change before openStoreBySlug's
      // own catalog request has even landed, firing a redundant one.
      if (storeLoadInFlightRef.current) return;
      const catalogKey = `${selectedStore.slug}::${selectedLocationId ?? ''}::${voucherCode || ''}`;
      // Already fetched (by openStoreBySlug or a prior run of this effect)
      // -- a re-render that doesn't actually change the resolved
      // store+location shouldn't refetch. refreshStorePageForTenantSetup
      // bypasses this by calling openStoreBySlug directly, which never
      // reads lastCatalogKeyRef, so it still forces a real refetch.
      if (lastCatalogKeyRef.current === catalogKey) {
        // A matching pending manual switch is the only case that produces this toast.
        completeBranchSwitchFeedback(selectedLocationId, { notify: true });
        return;
      }

      setLoadingCatalog(true);
      setCatalogError('');
      try {
        const catalogQuery = withVoucherCodeParam(buildCatalogRequestUrl({
          isServicesMode: normalizeBusinessMode(
            selectedStore?.workflow_mode || selectedStore?.ops_workflow_mode
          ) === 'services',
          locationId: selectedLocationId
        }), voucherCode);
        // No `cache: 'no-store'` (issue #282, Phase B) -- see openStoreBySlug's
        // profile fetch above for why.
        const catalogData = await requestJson(catalogQuery, { storeSlug: selectedStore.slug, signal: abortController.signal });
        if (cancelled || requestSequence !== locationCatalogRequestSequenceRef.current) return;
        applyCatalogResponse(catalogData);
        lastCatalogKeyRef.current = catalogKey;
        // A matching pending manual switch is the only case that produces this toast.
        completeBranchSwitchFeedback(selectedLocationId, { notify: true });
      } catch (error) {
        if (cancelled || requestSequence !== locationCatalogRequestSequenceRef.current) return;
        const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant catalog for selected location.');
        setCatalog([]);
        setCatalogError(normalizedError.message);
        completeBranchSwitchFeedback(selectedLocationId);
      } finally {
        if (!cancelled && requestSequence === locationCatalogRequestSequenceRef.current) setLoadingCatalog(false);
      }
    };

    loadLocationAwareCatalog();
    return () => {
      cancelled = true;
      abortController.abort();
      // Superseded requests must also release any overlay for this effect's location.
      completeBranchSwitchFeedback(selectedLocationId);
    };
    }, [applyCatalogResponse, completeBranchSwitchFeedback, isStorePage, selectedStore?.ops_workflow_mode, selectedStore?.slug, selectedStore?.workflow_mode, selectedLocationId, setCatalog, setCatalogError, setLoadingCatalog, voucherCode]);

  const handleBranchMenuSelection = useCallback((nextValue) => {
    const requestedLocationId = nextValue ? Number(nextValue) : null;
    const nextLocation = storeLocations.find((location) => Number(location.location_id) === requestedLocationId);
    const nextLocationId = nextLocation?.location_id == null ? null : Number(nextLocation.location_id);
    if (nextLocationId == null) return;
    if (Number(selectedLocationId) === nextLocationId) return;
    if (branchSwitchFeedbackTimerRef.current) clearTimeout(branchSwitchFeedbackTimerRef.current);
    const nextSequence = branchSwitchFeedbackSequenceRef.current + 1;
    branchSwitchFeedbackSequenceRef.current = nextSequence;
    const nextLabel = String(nextLocation.name || nextLocation.address_line || `Branch ${nextLocationId}`).trim();
    branchSwitchFeedbackRef.current = {
      label: nextLabel,
      locationId: nextLocationId,
      sequence: nextSequence,
      startedAt: Date.now()
    };
    setBranchSwitchFeedback({ label: nextLabel });
    if (typeof window !== 'undefined' && selectedStore?.slug) {
      const canonicalPath = buildCanonicalStorefrontTarget({
        storeSlug: selectedStore.slug,
        routeSubpage,
        routeServiceItemId,
        routeItemId,
        locationId: nextLocationId
      });
      if (!isCurrentStorefrontTarget(canonicalPath)) {
        window.history.replaceState(buildStorefrontHistoryState({
          storeSlug: selectedStore.slug,
          storeSubpage: routeSubpage,
          serviceItemId: routeServiceItemId,
          itemId: routeItemId,
          locationId: nextLocationId
        }), '', canonicalPath);
      }
    }
    setSelectedLocationId(nextLocationId);
    setHasSelectedBranchFromMenu(true);
  }, [routeItemId, routeServiceItemId, routeSubpage, selectedLocationId, selectedStore?.slug, setBranchSwitchFeedback, setSelectedLocationId, setHasSelectedBranchFromMenu, storeLocations]);

  useEffect(() => () => {
    if (branchSwitchFeedbackTimerRef.current) clearTimeout(branchSwitchFeedbackTimerRef.current);
  }, []);

  return {
    catalog,
    setCatalog,
    loadingCatalog,
    branchSwitchFeedback,
    setLoadingCatalog,
    catalogError,
    setCatalogError,
    storeLocations,
    setStoreLocations,
    selectedLocationId,
    setSelectedLocationId,
    primaryLocationId,
    setPrimaryLocationId,
    hasSelectedBranchFromMenu,
    setHasSelectedBranchFromMenu,
    brandingImageErrors,
    markBrandingImageError,
    isBrandingImageBlocked,
    openStoreBySlug,
    refreshStorePageForTenantSetup,
    handleBranchMenuSelection
  };
}
