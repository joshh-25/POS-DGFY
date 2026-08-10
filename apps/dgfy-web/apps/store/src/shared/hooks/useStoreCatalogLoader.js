import { useCallback, useEffect, useRef, useState } from 'react';

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
import { buildAccessPolicyStorePatch } from '../model/customerAccess.js';
import { buildWorkflowCapabilityStorePatch } from '../model/workflowCapabilities.js';
import { classifyStoreCatalogError } from '../model/storefrontErrorMessages.js';

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
export function useStoreCatalogLoader({
  routeSlug,
  routeSubpage,
  routeServiceItemId,
  routeItemId,
  isStorePage,
  selectedStore,
  setSelectedStore,
  setRouteSlug,
  preferredStoreLocationSelection
}) {
  const [storeLocations, setStoreLocations] = useState([]);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [hasSelectedBranchFromMenu, setHasSelectedBranchFromMenu] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [brandingImageErrors, setBrandingImageErrors] = useState(() => new Set());

  const storeLoadRequestSequenceRef = useRef(0);
  const locationCatalogRequestSequenceRef = useRef(0);

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

  const openStoreBySlug = useCallback(async (slug) => {
    const normalized = toSlug(slug);
    if (!normalized) return;
    const requestSequence = ++storeLoadRequestSequenceRef.current;

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
        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(normalized)}`);
      } catch (profileError) {
        if (Number(profileError?.status) !== 404) throw profileError;

        let canonicalSlug = '';
        for (const fallbackQuery of buildStorefrontSlugFallbackQueries(normalized)) {
          const discoveryFallback = await requestJson(`/api/v1/storefront/discovery?search=${encodeURIComponent(fallbackQuery)}&limit=20&result_mode=union&stock_filter=include_out_of_stock&pin_scope=tenant_primary&include_match_meta=true`);
          const fallbackStores = Array.isArray(discoveryFallback?.stores) ? discoveryFallback.stores : [];
          canonicalSlug = findCanonicalStorefrontSlug(normalized, fallbackStores)
            || findCanonicalStorefrontSlug(fallbackQuery, fallbackStores);
          if (canonicalSlug) break;
        }
        if (!canonicalSlug) throw profileError;

        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(canonicalSlug)}`);
      }
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;

      if (profile?.slug && toSlug(profile.slug) !== normalized && typeof window !== 'undefined') {
        const canonicalPath = buildCanonicalStorefrontTarget({
          storeSlug: profile.slug,
          routeSubpage,
          routeServiceItemId,
          routeItemId
        });
        if (!isCurrentStorefrontTarget(canonicalPath)) {
          window.history.replaceState(buildStorefrontHistoryState({
            storeSlug: profile.slug,
            storeSubpage: routeSubpage
          }), '', canonicalPath);
        }
        setRouteSlug(toSlug(profile.slug));
      }
      setSelectedStore(profile);
      let resolvedCatalogLocationId = null;
      const profileLocations = normalizeProfileLocations(profile);
      const profileHasNoLocation = profile?.store_has_no_location === true
        || profile?.map_publication_disabled === true;

      try {
        // No `cache: 'no-store'` (issue #282, Phase B) -- see the profile
        // fetch above for why.
        const locationsData = await requestJson('/api/v1/store/locations', { storeSlug: profile.slug });
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
        }
      }

      const catalogQuery = resolvedCatalogLocationId == null
        ? '/api/v1/store/catalog?limit=120'
        : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(resolvedCatalogLocationId)}`;
      // No `cache: 'no-store'` (issue #282, Phase B) -- see the profile
      // fetch above for why.
      const catalogData = await requestJson(catalogQuery, { storeSlug: profile.slug });
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;
      const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
      const capabilityPatch = buildWorkflowCapabilityStorePatch(catalogData);
      const paymentCapabilitiesPatch = catalogData?.payment_capabilities
        ? { payment_capabilities: catalogData.payment_capabilities }
        : null;
      if (accessPatch || capabilityPatch || paymentCapabilitiesPatch) {
        setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch, ...capabilityPatch, ...paymentCapabilitiesPatch } : prev));
      }
      setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
    } catch (error) {
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;
      const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant storefront page.');
      setSelectedStore(null);
      setStoreLocations([]);
      setCatalog([]);
      setCatalogError(normalizedError.message);
    } finally {
      if (requestSequence === storeLoadRequestSequenceRef.current) {
        setLoadingCatalog(false);
      }
    }
  }, [preferredStoreLocationSelection, routeServiceItemId, routeSubpage]);

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
    const loadLocationAwareCatalog = async () => {
      if (!isStorePage || !selectedStore?.slug) return;
      setLoadingCatalog(true);
      setCatalogError('');
      try {
        const catalogQuery = selectedLocationId == null
          ? '/api/v1/store/catalog?limit=120'
          : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(selectedLocationId)}`;
        // No `cache: 'no-store'` (issue #282, Phase B) -- see openStoreBySlug's
        // profile fetch above for why.
        const catalogData = await requestJson(catalogQuery, { storeSlug: selectedStore.slug });
        if (cancelled || requestSequence !== locationCatalogRequestSequenceRef.current) return;
        const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
        const capabilityPatch = buildWorkflowCapabilityStorePatch(catalogData);
        const paymentCapabilitiesPatch = catalogData?.payment_capabilities
          ? { payment_capabilities: catalogData.payment_capabilities }
          : null;
        if (accessPatch || capabilityPatch || paymentCapabilitiesPatch) {
          setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch, ...capabilityPatch, ...paymentCapabilitiesPatch } : prev));
        }
        setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
      } catch (error) {
        if (cancelled || requestSequence !== locationCatalogRequestSequenceRef.current) return;
        const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant catalog for selected location.');
        setCatalog([]);
        setCatalogError(normalizedError.message);
      } finally {
        if (!cancelled && requestSequence === locationCatalogRequestSequenceRef.current) setLoadingCatalog(false);
      }
    };

    loadLocationAwareCatalog();
    return () => {
      cancelled = true;
    };
  }, [isStorePage, selectedStore?.slug, selectedLocationId]);

  const handleBranchMenuSelection = useCallback((nextValue) => {
    const nextLocationId = nextValue ? Number(nextValue) : null;
    setSelectedLocationId(nextLocationId);
    setHasSelectedBranchFromMenu(true);
  }, []);

  return {
    catalog,
    setCatalog,
    loadingCatalog,
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
