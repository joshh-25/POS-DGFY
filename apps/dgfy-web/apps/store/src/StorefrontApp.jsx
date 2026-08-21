import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Plus,
  Copy,
  X,
  Navigation,
  Map,
  ChevronRight,
  Info,
  Maximize,
} from 'lucide-react';
import {
  haversineDistanceKm,
  toNumberOrNull
} from './features/discovery/utils/discoveryMapMath.js';
import { makePinElement } from './features/discovery/utils/discoveryMapMarkers.js';
import {
  createStorePopupNode,
  normalizeDiscoveryCategoryKey,
  normalizeStorefrontCategories,
  normalizeStorefrontDeliveryPartners,
  normalizeStorefrontGallery,
  normalizeStorefrontReviewSummary
} from './features/discovery/utils/storefrontDiscoveryNormalization.js';
import {
  normalizeStorefrontErrorMessage
} from './shared/model/storefrontErrorMessages.js';
import {
  getLineModifiersTotal,
  getLineTotal
} from './shared/model/storefrontCartModel.js';
import { isDocumentVisibleAndOnline } from './shared/utils/browserAvailability.js';
import { copyTextToClipboard as copyTextToClipboardUtil } from './shared/utils/clipboard.js';
import { useCartMutations } from './shared/hooks/useCartMutations.js';
import { useCheckoutAuthResumeRestore } from './shared/hooks/useCheckoutAuthResumeRestore.js';
import { useCheckoutSubmission } from './shared/hooks/useCheckoutSubmission.js';
import { useCustomerAuthNavigation } from './shared/hooks/useCustomerAuthNavigation.js';
import { useDefaultOrderPageProps } from './shared/hooks/useDefaultOrderPageProps.js';
import { useRetailOrderPageProps } from './modes/retail/checkout/hooks/useRetailOrderPageProps.js';
import { useDefaultProductCartDrawerProps } from './shared/hooks/useDefaultProductCartDrawerProps.js';
import { useDeliveryPinResolution } from './shared/hooks/useDeliveryPinResolution.js';
import { useServiceBookingViewModel } from './shared/hooks/useServiceBookingViewModel.js';
import { useStorefrontCartPersistence } from './shared/hooks/useStorefrontCartPersistence.js';
import { useStorefrontCatalog } from './shared/hooks/useStorefrontCatalog.js';
import { useStoreCatalogLoader } from './shared/hooks/useStoreCatalogLoader.js';
import { useStorefrontSession } from './shared/hooks/useStorefrontSession.js';
import { useStorefrontNavigation } from './shared/hooks/useStorefrontNavigation.js';
import { useGuestCustomerIdentity } from './shared/hooks/useGuestCustomerIdentity.js';
import { useStorefrontUiChrome } from './shared/hooks/useStorefrontUiChrome.js';
import { useStorefrontTrackingIntent } from './shared/hooks/useStorefrontTrackingIntent.js';
import { useAffiliateAttributionCapture } from './shared/hooks/useAffiliateAttributionCapture.js';
import { setAnalyticsContext } from '../../../src/observability/analyticsClient.js';
import { setSentryContext } from '../../../src/observability/sentryClient.js';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../src/observability/analyticsEvents.js';
import {
  buildCustomerFullName,
  clearCheckoutAuthResumeDraft,
  maskValue,
  normalizeSavedCustomerDetails,
  persistRecentStore,
  readCheckoutAuthResumeDraft,
  readLastStoreSlug,
  readSavedCustomerDetails,
  splitCustomerName,
  writeCheckoutAuthResumeDraft,
  writeSavedCustomerDetails
} from './shared/model/storefrontCustomerStorage.js';
import {
  buildStockExceededMessage,
  extractStockViolation,
  isItemAvailable,
  trimAddressCountrySuffix
} from './shared/model/storefrontCatalogModel.js';
import { DGFY_BRAND_NAME } from './shared/model/storefrontConstants.js';
import { formatStorefrontHoursLabel } from './shared/model/storefrontHoursModel.js';
import { buildCartSignature } from './shared/model/cartSignature.js';
import { parseBooleanFlag } from './shared/model/storefrontJsonModel.js';
import {
  canUseCheckout,
  getInventoryDisplayLabel,
  getStorefrontAccessBlockMessage
} from './shared/model/customerAccess.js';
import { buildStorefrontCheckoutPaymentOptions } from './shared/model/storefrontCheckoutPaymentOptions.js';
import { Badge, GhostButton, PrimaryButton } from './shared/components/StorefrontActionPrimitives.jsx';
import { useStorefrontCheckoutSummaryProps } from './shared/hooks/useStorefrontCheckoutSummaryProps.js';
import { StorefrontCatalogRouteContainer } from './app/pages/StorefrontCatalogRouteContainer.jsx';
import { useStorefrontCatalogRouteProps } from './app/hooks/useStorefrontCatalogRouteProps.js';
import { StorefrontHeroBandContainer } from './app/pages/StorefrontHeroBandContainer.jsx';
import { useStorefrontHeroBandProps } from './app/hooks/useStorefrontHeroBandProps.js';
import { StorefrontCartDrawerShellContainer } from './app/pages/StorefrontCartDrawerShellContainer.jsx';
import { useStorefrontCartDrawerShellProps } from './app/hooks/useStorefrontCartDrawerShellProps.js';
import { StorefrontLoadBoundary } from './shared/components/storefront/StorefrontLoadBoundary.jsx';
import { openStorefrontActionLink, sanitizeExternalLink } from './shared/utils/externalLinks.js';
import { money, toSlug } from './shared/utils/storefrontFormatters.js';
import { createStorefrontIdempotencyKey } from './shared/utils/idempotency.js';
import {
  buildTicketImage,
  downloadDataUrl,
  formatTicketDate
} from './shared/utils/storefrontTicketImage.js';
import {
  getDiscoveryEmptyStateMessage,
  getDiscoveryMatchBadges,
  getPreferredDiscoveryLocationId,
  selectDiscoveryPinLocations
} from './discovery/model/discoveryPresentation.js';
import { createSharedCoordinatePreviewNode, getDiscoveryMarkerKey, makeClusterElement } from './discovery/model/discoveryMapDom.js';
import {
  buildKnownStoreRouteCandidates
} from './app/routing/defaultStorefrontRoute.js';
import { createStoreMarkerPreviewNode } from './discovery/model/storefrontMarkerPreview.js';
import { buildFnbMobileLayout } from './modes/fnb/storefront/model/fnbMobileLayout.js';
import { FNB_RECOMMENDED_LOCATION } from './modes/fnb/checkout/model/fnbCheckoutAddressLocations.js';
import { useCheckoutTotalsAndGating } from './modes/fnb/checkout/hooks/useCheckoutTotalsAndGating.js';
import { useSignedInCheckoutAddresses } from './modes/fnb/checkout/hooks/useSignedInCheckoutAddresses.js';
import { useFnbTrackingDrawerPresentation } from './modes/fnb/tracking/hooks/useFnbTrackingDrawerPresentation.js';
import { useFnbTrackingRuntime } from './modes/fnb/tracking/hooks/useFnbTrackingRuntime.js';
import { useSimpleTrackingRuntime } from './modes/simple/tracking/hooks/useSimpleTrackingRuntime.js';
import { useRetailTrackingRuntime } from './modes/retail/tracking/hooks/useRetailTrackingRuntime.js';
import { useFnbCheckoutPresentation } from './modes/fnb/checkout/hooks/useFnbCheckoutPresentation.js';
import { useFnbCheckoutQuote } from './modes/fnb/checkout/hooks/useFnbCheckoutQuote.js';
import { useFnbCheckoutRouteState } from './modes/fnb/checkout/hooks/useFnbCheckoutRouteState.js';
import { useFnbCheckoutSubmission } from './modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js';
import { useFnbCheckoutPromoRenderers } from './modes/fnb/checkout/hooks/useFnbCheckoutPromoRenderers.jsx';
import { useFnbCartDrawerRouteProps } from './modes/fnb/checkout/hooks/useFnbCartDrawerRouteProps.js';
import { useFnbCheckoutRouteProps } from './modes/fnb/checkout/hooks/useFnbCheckoutRouteProps.js';
import { useGuestCheckoutOtp } from './shared/checkout/hooks/useGuestCheckoutOtp.js';
import { useCustomerDashboardIdentity } from './customer-dashboard/hooks/useCustomerDashboardIdentity.js';
import { isStorefrontOnlinePaymentType } from './shared/services/storefrontOnlinePaymentSession.js';
import { useCustomerDashboardRuntime } from './customer-dashboard/hooks/useCustomerDashboardRuntime.js';
import { useCustomerDashboardStorefrontBridge } from './customer-dashboard/pages/useCustomerDashboardStorefrontBridge.js';
import { useCustomerDashboardRouteFlags } from './customer-dashboard/pages/useCustomerDashboardRouteFlags.js';
import { useCustomerDashboardRouteOutlet } from './customer-dashboard/pages/useCustomerDashboardRouteOutlet.jsx';
import {
  readRouteSlug,
  readStoreItemId,
  readStoreReviewToken,
  readStoreServiceItemId,
  readStoreSubpage,
  readStoreVoucherCode,
  readTrackingPinFromQuery,
  setCustomStorefrontRouteContext,
  STORE_BOOKING_SUBPAGE,
  STORE_ITEM_SUBPAGE,
  STORE_ORDER_SUBPAGE,
  STORE_SERVICE_SUBPAGE,
  STORE_TRACK_SUBPAGE,
  storePath
} from './app/routing/storefrontRouting.js';
import {
  buildCatalogTarget,
  buildItemDetailTarget,
  buildOrderTarget,
  buildStorefrontHistoryState,
  buildTrackTarget,
  isCurrentStorefrontTarget
} from './app/routing/storefrontNavigation.js';
import {
  appBasePath,
  buildPublicStorefrontUrl,
  buildStamp,
  serviceWorkerUrl,
  withApiOrigin,
  withAssetOrigin
} from './app/runtime/storefrontRuntime.js';
import {
  DEFAULT_CENTER,
  TILING_SERVER,
  tileTransformRequest
} from './app/runtime/storefrontMapRuntime.js';
import { DeliveryPinMap } from './features/locations/components/DeliveryPinMapLazy.jsx';
import { createAddressPinEditorRenderer } from './features/locations/renderers/addressPinEditorRenderer.jsx';
import {
  buildPinnedDeliveryAddress,
  formatReverseGeocodedAddress,
  isGeneratedPinnedDeliveryAddress,
  normalizeCoordinatePair,
  reverseGeocodeDeliveryPin
} from './features/locations/utils/pinnedDeliveryAddress.js';
import { StorefrontDropdown } from './features/shared-storefront/components/StorefrontDropdown.jsx';
import { useStorefrontClosedNotice } from './shared/hooks/useStorefrontClosedNotice.js';
import { useStorefrontShareActions } from './shared/hooks/useStorefrontShareActions.js';
import { StorefrontPaymentUnavailableModal } from './shared/components/storefront/StorefrontPaymentUnavailableModal.jsx';
import {
  formatFollowersLabel,
  getStorefrontContactIcon,
  maskReviewerName
} from './features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { StorefrontExpandedMapModal } from './discovery/components/StorefrontExpandedMapModal.jsx';
import { DiscoveryHomePage } from './discovery/pages/DiscoveryHomePage.jsx';
import {
  STYLES
} from './shared/theme/storefrontStyleTokens.js';
import { ServicesDiscoveryDetailModal } from './modes/services/storefront/components/ServicesDiscoveryDetailModal.jsx';
import {
  buildServiceBookingFieldPlan,
  buildServicePaymentOptions,
  isBookingFieldComplete,
  normalizeServiceFormFields
} from './modes/services/booking/model/serviceBookingFields.js';
import { combineDateAndTimeParts } from './modes/services/booking/model/serviceBookingSchedule.js';
import { buildServiceBookingSummaryModel } from './modes/services/booking/model/serviceBookingSummary.js';
import { useServiceBookingDerivations } from './modes/services/booking/hooks/useServiceBookingDerivations.js';
import { useServiceBookingFieldFocus } from './modes/services/booking/hooks/useServiceBookingFieldFocus.js';
import { useServiceBookingReviewProps } from './modes/services/booking/hooks/useServiceBookingReviewProps.js';
import { SERVICES_BODY_FONT, SERVICES_DISPLAY_FONT } from './modes/services/servicesTypography.js';
import { useServiceCartDrawerProps } from './modes/services/booking/hooks/useServiceCartDrawerProps.js';
import { useSimpleCartDrawerProps } from './modes/simple/checkout/hooks/useSimpleCartDrawerProps.js';
import { useSimpleCheckoutGating } from './modes/simple/checkout/hooks/useSimpleCheckoutGating.js';
import { useSimpleCheckoutRouteProps } from './modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js';
import { StoresMap } from './discovery/components/StoresMapLazy.jsx';
import {
  DISCOVERY_CATEGORY_FILTER_OPTIONS,
  DISCOVERY_CATEGORY_MATCHERS,
  POPULAR_DISCOVERY_CATEGORIES
} from './discovery/model/discoveryFilterOptions.js';
import { useDiscoveryCategoryRail } from './discovery/hooks/useDiscoveryCategoryRail.js';
import { useDiscoveryExplorationOutsideClick } from './discovery/hooks/useDiscoveryExplorationOutsideClick.js';
import { useDiscoveryFilterDropdown } from './discovery/hooks/useDiscoveryFilterDropdown.js';
import { useDiscoveryFilterOptions } from './discovery/hooks/useDiscoveryFilterOptions.js';
import { useDiscoveryFeaturedMerchants } from './discovery/hooks/useDiscoveryFeaturedMerchants.jsx';
import { useDiscoveryDerivedResults } from './discovery/hooks/useDiscoveryDerivedResults.js';
import { useDiscoveryHighlightSync } from './discovery/hooks/useDiscoveryHighlightSync.js';
import { useDiscoveryNavActions } from './discovery/hooks/useDiscoveryNavActions.js';
import { useDiscoveryResultsRoute } from './discovery/hooks/useDiscoveryResultsRoute.js';
import { useDiscoverySearchActions } from './discovery/hooks/useDiscoverySearchActions.js';
import { useDiscoveryState } from './discovery/hooks/useDiscoveryState.js';
import { useDiscoveryStoreLoader } from './discovery/hooks/useDiscoveryStoreLoader.js';
import { useDiscoveryViewport } from './discovery/hooks/useDiscoveryViewport.js';
import { useFnbCatalogRuntime } from './modes/fnb/storefront/hooks/useFnbCatalogRuntime.js';
import { useFnbProductDetailsRoute } from './modes/fnb/storefront/hooks/useFnbProductDetailsRoute.js';
import { useFnbProductDetailsRouteProps } from './modes/fnb/storefront/hooks/useFnbProductDetailsRouteProps.js';
import { useFnbProductDetailNavigation } from './modes/fnb/storefront/hooks/useFnbProductDetailNavigation.js';
import { useFnbProductDetailActions } from './modes/fnb/storefront/hooks/useFnbProductDetailActions.js';
import { useFnbProductDetailsReviewProps } from './modes/fnb/storefront/hooks/useFnbProductDetailsReviewProps.js';
import { useFnbItemReviewRuntime } from './modes/fnb/storefront/hooks/useFnbItemReviewRuntime.js';
import { useFnbProductModifiers } from './modes/fnb/storefront/hooks/useFnbProductModifiers.js';
import { createTrackingAdapterRegistry } from './tracking/core.js';
import {
  fnbTrackingAdapter,
  getCompletedTrackingLabel,
  getTrackingFlowForOrderMethod
} from './modes/fnb/tracking/model/fnbTrackingAdapter.js';
import { serviceTrackingAdapter } from './modes/services/tracking/model/serviceTrackingAdapter.js';
import { buildServicesTrackingRouteProps } from './modes/services/tracking/model/buildServicesTrackingRouteProps.js';
import { ServicesTrackingRouteContainer } from './modes/services/tracking/pages/ServicesTrackingRouteContainer.jsx';
import {
  advanceServicesLocalSimulation as advanceLocalServicesSimulation,
  createServicesLocalSimulation
} from './modes/services/tracking/model/servicesLocalSimulation.js';
import {
  getServicesLocalFlowDefinition,
  isServicesLocalSimulationMethod,
  SERVICES_LOCAL_SIMULATION_ENABLED
} from './modes/services/booking/model/servicesLocalFlow.js';
import {
  simpleTrackingAdapter,
  getSimpleCompletedTrackingLabel,
  getSimpleTrackingFlowForOrderMethod
} from './modes/simple/tracking/model/simpleTrackingAdapter.js';
import {
  RetailTrackingAdapter,
  getCompletedTrackingLabel as getRetailCompletedTrackingLabel,
  getTrackingFlowForOrderMethod as getRetailTrackingFlowForOrderMethod
} from './modes/retail/tracking/model/retailTrackingAdapter.js';
import {
  mergeTrackedOrderEntries,
  normalizeTrackedOrderEntry,
  readLastTrackingPinForStore,
  readServiceHandoffForBooking,
  readTrackedOrdersForStore,
  TERMINAL_TRACKING_STATUSES,
  writeLastTrackingPinForStore,
  writeServiceHandoffForBooking
} from './tracking/storage.js';
import {
  deriveAccountActivityCollections,
  EMPTY_ACCOUNT_PANEL,
  mapAccountActivityToTrackedOrderEntry,
  mergeAccountPanelActivity,
  resolveStorefrontRouteSlug
} from './tracking/accountActivity.js';
import {
  shouldHydrateSavedGuestCustomerDetails
} from './checkout/guestCustomerDetailsState.js';
import {
  WORKFLOW_MODE_LABELS,
  WORKFLOW_MODE_SELECT_VALUES
} from '../../../src/features/settings/workflowMode.js';
import {
  buildBusinessRegistrationUrl,
  buildDgfyAuthUrl,
  buildPosAppUrl
} from './shared/utils/businessRegistrationUrl.js';
import { resolveStorefrontAccountUrl } from '../../../src/features/dgfyRouteHelpers.js';
import {
  createDgfyHandoff,
  startDgfyPosSession,
  startDgfyTenantSession
} from '../../../src/services/dgfyAuthService.js';
import {
  buildPosDgfyHandoffUrl,
  buildSkupervisorHandoffUrl
} from '../../../src/features/pos/utils/skupervisorHandoff.js';
import {
  clearDgfyAuthToken,
  clearStoreAuthToken,
  hasDgfyExplicitSignOut,
  markDgfyExplicitSignOut,
  readDgfyAuthToken,
  readDgfySignedOutEmail,
  readStoreAuthToken,
  rememberDgfySignedOutEmail,
  writeStoreAuthToken
} from './auth/storefrontSessionStorage.js';
import { requestJson } from './services/requestJson.js';
import { isKnownDgfyPlatformHost } from './shared/utils/storefrontPlatformHost.js';
import { hasCustomerName, hasPrimaryContact, isCustomerStepComplete } from './checkout/checkoutValidation.js';
import { buildFnbTrackingRouteProps } from './modes/fnb/tracking/model/buildFnbTrackingRouteProps.js';
import { buildSimpleTrackingRouteProps } from './modes/simple/tracking/model/buildSimpleTrackingRouteProps.js';
import { buildSimpleTrackingDrawerProps } from './modes/simple/tracking/model/buildSimpleTrackingDrawerProps.js';
import { buildRetailTrackingRouteProps } from './modes/retail/tracking/model/buildRetailTrackingRouteProps.js';
import {
  formatServicesBookingFailureMessage,
  resolveServicesBookingSubmitContract
} from './services/servicesBookingContract.js';
import { useStorefrontStore } from './store/useStorefrontStore.js';
import {
  selectIsOnlinePaymentModalOpen,
  selectViewportWidth
} from './store/selectors/uiSelectors.js';
// Issue #282, Phase E: no longer imported here -- it shipped maplibre-gl's
// CSS on every storefront page load regardless of whether any map ever
// rendered. Colocated instead with the library import in DeliveryPinMap.jsx,
// StoresMap.jsx, and TrackingRouteMap.jsx, which are now only reached
// through their respective *Lazy.jsx wrappers' dynamic import().

/* Legacy storefront contract anchors (frontend-only compatibility)
id: 'reservation'
/api/v1/store/fnb/reservations
fnb_modifier_groups
Allergens:
getDefaultFnbLineModifiers
line_modifiers
Ready for pickup
Out for delivery
Order confirmed
Confirmed by store
Preparing
Delivered
Picked up
*/
// NOTE: the anchors that used to sit here for service-booking batch/availability/hold
// endpoints (/api/v1/store/services/bookings/batch, /availability, /holds, etc.) were
// removed with the vacuous serviceBookingMultiplicity.contract.test.js that only ever
// asserted against this comment, not real code (see Phase 7 of the Unified Product
// Domain initiative). Those endpoints are being mounted and wired into the storefront
// in a later phase; real behavior tests belong there, once the frontend actually calls
// them.

export const __storefrontTrackingTestUtils = {
  normalizeTrackedOrderEntry,
  mapAccountActivityToTrackedOrderEntry
};

// #746: how long the storefront waits after the last cart/code change before re-quoting. Long
// enough to collapse a burst of quantity taps into one request, short enough that the total settles
// while the shopper is still looking at the drawer.
const AUTO_QUOTE_DEBOUNCE_MS = 350;
const dgfyHeaderLogo = '/dgfy-logo.png';
const dgfySymbolLogo = '/dgfy-symbologo.png';
const dgfyBusinessOwnerPhoto = '/man.webp';
const DGFY_HEADER_LOGO_URL = dgfyHeaderLogo;
const DGFY_LOGO_ICON_URL = dgfySymbolLogo;
const DISCOVERY_LOCATION_PERMISSION_KEY = 'dgfy_storefront_discovery_location_permission_v1';
const QRPH_PAYMENT_POLL_INTERVAL_MS = 4000;

export default function StorefrontApp() {
  const [routeSlug, setRouteSlug] = useState(() => readRouteSlug());
  const [routeSubpage, setRouteSubpage] = useState(() => readStoreSubpage());
  const [routeServiceItemId, setRouteServiceItemId] = useState(() => readStoreServiceItemId());
  const [routeItemId, setRouteItemId] = useState(() => readStoreItemId());
  const [routeReviewToken, setRouteReviewToken] = useState(() => readStoreReviewToken());
  const previousRouteSlugRef = useRef(routeSlug);

  useAffiliateAttributionCapture({ routeSlug });

  useEffect(() => {
    if (routeSlug || typeof window === 'undefined') return undefined;
    // This probe only ever resolves a context on an actual customer custom
    // domain -- the backend's own hostname policy guarantees a 404 on
    // dgfy.ph and its subdomains (see hostnamePolicy.js), which the frontend
    // then discards anyway (see the `.then` chain below). Skipping it here
    // avoids a false-positive 404 in the console/error dashboards on every
    // anonymous root landing on the platform's own domain.
    if (isKnownDgfyPlatformHost(window.location.hostname)) return undefined;
    let cancelled = false;

    fetch('/api/v1/store/domain-context', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        return payload?.data || null;
      })
      .then((context) => {
        if (cancelled || !context?.slug) return;

        if (context.routing_mode === 'custom_domain_alias' && context.redirect_to) {
          const target = new URL(context.redirect_to);
          target.pathname = window.location.pathname;
          target.search = window.location.search;
          target.hash = window.location.hash;
          window.location.replace(target.toString());
          return;
        }

        if (context.routing_mode !== 'custom_domain') return;
        setCustomStorefrontRouteContext(context);
        setRouteSlug(toSlug(context.slug));
        setRouteSubpage(readStoreSubpage());
        setRouteServiceItemId(readStoreServiceItemId());
        setRouteItemId(readStoreItemId());
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [routeSlug]);

  const viewportWidth = useStorefrontStore(selectViewportWidth);
  const setViewportWidth = useStorefrontStore((s) => s.uiSetViewportWidth);
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

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedDiscoverySearch, setDebouncedDiscoverySearch] = useState('');
  const {
    activeDiscoveryFilterDropdown,
    activeDiscoveryNavItem,
    discoveryAppliedFilters,
    discoveryAvailabilityFilter,
    discoveryCategoryFilter,
    discoveryCoords,
    discoveryCoordsRef,
    discoveryDistanceFilter,
    discoveryIncludeMatchMeta,
    discoveryLocationMap,
    discoveryOpenFilter,
    discoveryPinScope,
    discoveryRatingFilter,
    discoveryResultMode,
    discoveryResultsPage,
    discoverySortBy,
    discoveryStockFilter,
    hasDiscoveryExplorationStarted,
    highlightedDiscoveryMarkerKey,
    highlightedStoreSlug,
    isMobileResultsCollapsed,
    isDiscoveryNavMenuOpen,
    isDiscoveryNoMatchToastActive,
    isDiscoverySearchFocused,
    isStoreListVisible,
    loadingDiscoveryLocations,
    openDiscoveryFaqIndex,
    renderDiscoveryResetButton,
    searchRef,
    viewMode,
    setActiveDiscoveryFilterDropdown,
    setActiveDiscoveryNavItem,
    setDiscoveryAppliedFilters,
    setDiscoveryAvailabilityFilter,
    setDiscoveryCategoryFilter,
    setDiscoveryCoords,
    setDiscoveryDistanceFilter,
    setDiscoveryIncludeMatchMeta,
    setDiscoveryLocationMap,
    setDiscoveryOpenFilter,
    setDiscoveryPinScope,
    setDiscoveryRatingFilter,
    setDiscoveryResultMode,
    setDiscoveryResultsPage,
    setDiscoverySortBy,
    setDiscoveryStockFilter,
    setHasDiscoveryExplorationStarted,
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug,
    setIsMobileResultsCollapsed,
    setIsDiscoveryNavMenuOpen,
    setIsDiscoveryNoMatchToastActive,
    setIsDiscoverySearchFocused,
    setIsStoreListVisible,
    setLoadingDiscoveryLocations,
    setOpenDiscoveryFaqIndex,
    setRenderDiscoveryResetButton,
    setSelectedMapPin,
    setShowDiscoveryResetButton,
    setViewMode,
    showDiscoveryResetButton
  } = useDiscoveryState({ search });
  const { discoveryFilterToolbarRef } = useDiscoveryFilterDropdown({
    setActiveDiscoveryFilterDropdown
  });
  const { loadStores, retryLoadStores } = useDiscoveryStoreLoader({
    debouncedDiscoverySearch,
    discoveryCoordsRef,
    discoveryIncludeMatchMeta,
    discoveryPinScope,
    discoveryResultMode,
    discoveryStockFilter,
    requestJson,
    searchRef,
    setDiscoveryAppliedFilters,
    setDiscoveryCoords,
    setDiscoveryLocationMap,
    setLoadingDiscoveryLocations,
    setLoadingStores,
    setStores,
    setStoresError,
    stores,
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
    searchRef,
    setDebouncedDiscoverySearch,
    setDiscoveryCategoryFilter,
    setDiscoveryPinScope,
    setHasDiscoveryExplorationStarted,
    setIsMobileResultsCollapsed,
    setIsStoreListVisible,
    setSearch,
    setSelectedMapPin
  });
  const [catalogSearch, setCatalogSearch] = useState('');
  const {
    featuredCarouselRef,
    featuredCategoryFilter,
    featuredCategoryOptions,
    featuredCategoryRailRef,
    featuredSectionRef,
    featuredVisibleStores,
    handleFeaturedCategoryFilter,
    setFeaturedBaseStores
  } = useDiscoveryFeaturedMerchants({ normalizeStorefrontCategories });
  const [selectedStore, setSelectedStore] = useState(null);
  const isStorePage = Boolean(routeSlug);
  // AnalyticsRouteTracker (apps/store/src/main.jsx) already fires a
  // $pageview for every route, including the discovery home -- this named
  // event exists separately so "landed on discovery" reads as a funnel
  // entry step in the PostHog UI rather than requiring a $pageview filter.
  useEffect(() => {
    if (isStorePage) return;
    trackFunnelEvent(ANALYTICS_EVENTS.DISCOVERY_VIEWED, {
      path: typeof window === 'undefined' ? '/' : (window.location.pathname || '/')
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStorePage]);
  const currentPathSubpage = readStoreSubpage();
  const currentPathname = typeof window === 'undefined' ? '/' : (window.location.pathname || '/');
  const isBookingSubpage = routeSubpage === STORE_BOOKING_SUBPAGE;
  const isOrderSubpage = routeSubpage === STORE_ORDER_SUBPAGE;
  const isTrackSubpage = routeSubpage === STORE_TRACK_SUBPAGE;
  const isServiceDetailsSubpage = routeSubpage === STORE_SERVICE_SUBPAGE;
  const isFnbDetailsSubpage = routeSubpage === STORE_ITEM_SUBPAGE;
  const isResolvedOrderSubpage = isOrderSubpage || isTrackSubpage || currentPathSubpage === STORE_ORDER_SUBPAGE || currentPathSubpage === STORE_TRACK_SUBPAGE;

  const [selectedServiceDetail, setSelectedServiceDetail] = useState(null);
  const [selectedServiceCartLineId, setSelectedServiceCartLineId] = useState('');
  const [editingFnbCartLine, setEditingFnbCartLine] = useState(null);
  const [serviceDraftQuantity, setServiceDraftQuantity] = useState(1);
  const [serviceDraftNotes, setServiceDraftNotes] = useState('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewSubmitLoading, setReviewSubmitLoading] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({
    name: '',
    anonymous: false,
    rating: 0,
    message: ''
  });
  const [itemReviewSummary, setItemReviewSummary] = useState(null);
  const [itemReviewCards, setItemReviewCards] = useState([]);
  const [itemReviewsLoading, setItemReviewsLoading] = useState(false);
  const [itemReviewInviteContext, setItemReviewInviteContext] = useState(null);
  const [itemReviewSectionHighlighted, setItemReviewSectionHighlighted] = useState(false);
  const serviceCartFabRef = useRef(null);
  const {
    discoveryBusinessModeOptions,
    discoveryDistanceFilterOptions,
    discoverySortLabelByValue
  } = useDiscoveryFilterOptions({
    workflowModeLabels: WORKFLOW_MODE_LABELS,
    workflowModeSelectValues: WORKFLOW_MODE_SELECT_VALUES
  });
  const [activeServiceTab, setActiveServiceTab] = useState(null);
  const [serviceSortOption, setServiceSortOption] = useState('recommended');
  const [isServiceFilterOpen, setIsServiceFilterOpen] = useState(false);
  const [serviceAvailabilityFilter, setServiceAvailabilityFilter] = useState('all');
  const [serviceAreaFilter, setServiceAreaFilter] = useState('all');
  const [serviceDurationFilter, setServiceDurationFilter] = useState('all');
  const [serviceBookingStep, setServiceBookingStep] = useState(1);
  const [serviceOrderMethod, setServiceOrderMethod] = useState('delivery');
  const [serviceScheduleMode, setServiceScheduleMode] = useState('now');
  const [serviceSpecialInstructions, setServiceSpecialInstructions] = useState('');
  const {
    bookingPreferredDateInputRef,
    jumpToBookingField,
    openPreferredBookingDatePicker,
    registerBookingFieldRef
  } = useServiceBookingFieldFocus({ serviceBookingStep, setServiceBookingStep });
  const [servicePage, setServicePage] = useState(1);
  const [servicePageSize, setServicePageSize] = useState(8);

  const {
    fnbOrderStep,
    fnbPaymentType,
    qrphIdempotencyKey,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    fnbScheduledFor,
    fnbScheduleMode,
    fnbSpecialInstructions,
    setFnbOrderStep,
    setFnbPaymentType,
    setQrphIdempotencyKey,
    setQrphPaymentSession,
    setQrphPaymentStatusLoading,
    setFnbScheduledFor,
    setFnbScheduleMode,
    setFnbSpecialInstructions,
    setShowMobileAddressModal,
    showMobileAddressModal,
  } = useFnbCheckoutRouteState();
  const [simpleOrderStep, setSimpleOrderStep] = useState(1);
  const paymentReturnSessionRef = useRef('');
  const [showSimpleMobileOrderSummary, setShowSimpleMobileOrderSummary] = useState(false);
  const [showSimpleMobileAddressModal, setShowSimpleMobileAddressModal] = useState(false);
  const isOnlinePaymentModalOpen = useStorefrontStore(selectIsOnlinePaymentModalOpen);
  const uiOpenOnlinePaymentModal = useStorefrontStore((s) => s.uiOpenOnlinePaymentModal);
  const uiCloseOnlinePaymentModal = useStorefrontStore((s) => s.uiCloseOnlinePaymentModal);

  const resetQrphPaymentSession = useCallback(() => {
    setQrphPaymentSession(null);
    setQrphIdempotencyKey(globalThis.crypto?.randomUUID?.() || `store-qrph-${Date.now()}`);
  }, [setQrphIdempotencyKey, setQrphPaymentSession]);

  // Phase 142 (#823): the first enabled online rail, for a downpayment-required store where
  // plain 'cash' is not a valid selection (the backend 422s DOWNPAYMENT_CAPTURE_NOT_AVAILABLE on
  // it -- see storeCheckoutPaymentOptions.js's hideCash option, which removes it from the list
  // this reads). Falls back to 'qrph' if the store's payment_capabilities haven't loaded yet.
  const resolveDefaultDownpaymentRail = useCallback(() => (
    buildStorefrontCheckoutPaymentOptions(selectedStore?.payment_capabilities, { hideCash: true })[0]?.value || 'qrph'
  ), [selectedStore?.payment_capabilities]);

  const handlePaymentTypeChange = useCallback((val) => {
    const isDownpaymentStore = selectedStore?.payment_mode === 'downpayment_required';
    if (val === 'online') {
      uiOpenOnlinePaymentModal();
      // Phase 142 (#823): this legacy value opens the "online payment unavailable" modal and
      // used to always reset to 'cash' -- wrong at a downpayment store, where 'cash' isn't a
      // choice at all. Reset to a valid rail instead so the selector never lands on cash there.
      setFnbPaymentType(isDownpaymentStore ? resolveDefaultDownpaymentRail() : 'cash');
    } else {
      if (!isStorefrontOnlinePaymentType(val)) resetQrphPaymentSession();
      setFnbPaymentType(val);
    }
  }, [resolveDefaultDownpaymentRail, resetQrphPaymentSession, selectedStore?.payment_mode, setFnbPaymentType, uiOpenOnlinePaymentModal]);

  // Phase 142 (#823): every mode's paymentType state defaults to 'cash' (useFnbCheckoutRouteState.js
  // / RetailOrderPage.jsx's own local state) -- not a valid choice once a store resolves to
  // downpayment_required. Self-heals a stale 'cash' selection (a restored guest draft, a store that
  // just flipped modes, or simply the unchanged default) to the first enabled rail. No-op for a
  // full_payment store.
  useEffect(() => {
    if (selectedStore?.payment_mode !== 'downpayment_required' || fnbPaymentType !== 'cash') return;
    setFnbPaymentType(resolveDefaultDownpaymentRail());
  }, [selectedStore?.payment_mode, selectedStore?.payment_capabilities, fnbPaymentType, resolveDefaultDownpaymentRail, setFnbPaymentType]);
  const [checkoutPromoCode, setCheckoutPromoCode] = useState('');
  // #672/#768: seeded from a shareable `?voucher=` link on first load, then persisted per
  // store+mode alongside the cart lines (useStorefrontCartPersistence, below) -- promo code rides
  // the same snapshot. Retail/F&B/services only; see that hook's `enabled` condition.
  const [checkoutVoucherCode, setCheckoutVoucherCode] = useState(() => readStoreVoucherCode());

  const [preferredStoreLocationSelection, setPreferredStoreLocationSelection] = useState(() => {
    if (!routeSlug || typeof window === 'undefined') return null;
    const locationId = Number(new URLSearchParams(window.location.search).get('location_id'));
    return Number.isInteger(locationId) && locationId > 0
      ? { slug: routeSlug, locationId }
      : null;
  });
  const {
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
  } = useStoreCatalogLoader({
    routeSlug,
    routeSubpage,
    routeServiceItemId,
    routeItemId,
    isStorePage,
    selectedStore,
    setSelectedStore,
    setRouteSlug,
    preferredStoreLocationSelection,
    voucherCode: checkoutVoucherCode
  });

  const [orderMethod, setOrderMethod] = useState('delivery');
  const cart = useStorefrontStore((s) => s.cart.items);
  const setCart = useStorefrontStore((s) => s.cartSet);
  const [cartImageErrors, setCartImageErrors] = useState(() => new Set());
  const [guestCheckoutUnlocked, setGuestCheckoutUnlocked] = useState(false);
  const [rememberCustomerDetails, setRememberCustomerDetails] = useState(() => Boolean(readStoreAuthToken()));
  const [guestDetailsEditMode, setGuestDetailsEditMode] = useState(false);
  const [isUsingDifferentGuestDetails, setIsUsingDifferentGuestDetails] = useState(false);
  const [customerAddress, setCustomerAddress] = useState('');
  const [serviceLocationLandmarkNote, setServiceLocationLandmarkNote] = useState('');
  const [serviceUnitType, setServiceUnitType] = useState('');
  const [customerPin, setCustomerPin] = useState(null);
  const [resolvedDeliveryAddress, setResolvedDeliveryAddress] = useState('');
  const [resolvingPinnedDeliveryAddress, setResolvingPinnedDeliveryAddress] = useState(false);
  const [deliveryLocationAction, setDeliveryLocationAction] = useState('saved');
  const [showExpandedDeliveryMap, setShowExpandedDeliveryMap] = useState(false);
  const [savedPinnedLocations, setSavedPinnedLocations] = useState([]);
  const [selectedSavedLocationId, setSelectedSavedLocationId] = useState(FNB_RECOMMENDED_LOCATION.id);
  const [serviceAppointmentAt, setServiceAppointmentAt] = useState('');
  const [servicePaymentTiming, setServicePaymentTiming] = useState('postpaid');
  const [servicePaymentPreviewMethod, setServicePaymentPreviewMethod] = useState('qr');
  const [servicePaymentPreviewCard, setServicePaymentPreviewCard] = useState({
    cardholder: '',
    cardNumber: '',
    expiry: '',
    cvv: ''
  });
  const [servicePaymentPreviewReceiptName, setServicePaymentPreviewReceiptName] = useState('');
  const [serviceIntakeResponses, setServiceIntakeResponses] = useState({});
  const [pinLocationLoading, setPinLocationLoading] = useState(false);
  const [pinLocationError, setPinLocationError] = useState('');
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteNeedsRefresh, setQuoteNeedsRefresh] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  // #746: the cart the last successful quote was computed against. Compared with the live cart to
  // decide whether that quote's discounts still describe what the shopper sees -- see
  // shared/model/cartSignature.js for why this replaces the old `!quoteNeedsRefresh` gate.
  const [quotedCartSignature, setQuotedCartSignature] = useState(null);
  const cartSignature = useMemo(() => buildCartSignature(cart), [cart]);
  // True when the last quote no longer describes the current cart -- the display-validity signal for
  // every voucher/promo discount surface.
  const isQuoteStale = quotedCartSignature === null || quotedCartSignature !== cartSignature;
  const fnbAutoQuoteSyncKeyRef = useRef('');
  const [checkoutResult, setCheckoutResult] = useState(null);

  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showOrderSuccessAnimation, setShowOrderSuccessAnimation] = useState(false);
  const orderSuccessAnimationTimerRef = useRef(null);

  const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false);
  const {
    setDgfyAuthTokenState,
    dgfySessionAccount,
    setDgfySessionAccount,
    storefrontVisitorId,
    dgfyAuthToken,
    isDgfyCustomerSignedIn,
    isStorefrontAccountAuthenticated,
    isDgfySessionResolved,
    closeAccountDrawer
  } = useStorefrontSession({ setIsAccountDrawerOpen });
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  // isCheckoutOpen has many true-setting call sites (cart-add auto-open, hero
  // CTAs, tracking-intent resume, guest-checkout-auth resume) with no single
  // "start checkout" function to instrument -- watching its state origin
  // here is the one chokepoint that covers all of them without duplicating
  // the event at every call site.
  useEffect(() => {
    if (!isCheckoutOpen) return;
    trackFunnelEvent(ANALYTICS_EVENTS.CHECKOUT_STARTED, { store_slug: selectedStore?.slug });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckoutOpen]);
  const [checkoutTab, setCheckoutTab] = useState('checkout');
  const [pendingOrderInitialTab, setPendingOrderInitialTab] = useState('');
  const [hasAppliedCheckoutAuthResume, setHasAppliedCheckoutAuthResume] = useState(false);
  const {
    handleDiscoveryExploreClick,
    handleDiscoveryMenuToggle,
    handleDiscoveryNavItemClick
  } = useDiscoveryNavActions({
    activeDiscoveryNavItem,
    isDiscoveryMobileViewport,
    setActiveDiscoveryNavItem,
    setIsDiscoveryNavMenuOpen
  });
  const {
    desktopCategoryRailRef,
    hasDesktopCategoryOverflow,
    isCategoryRowExpanded,
    mobileCategoryGroupIndex,
    mobileCategoryRailRef,
    setIsCategoryRowExpanded,
    setMobileCategoryGroupIndex,
    showDesktopCategoryOverflowCue
  } = useDiscoveryCategoryRail({ isDiscoveryMobileViewport });

  const {
    isServicesMode,
    isFnbMode,
    isSimpleMode,
    isHospitalityMode,
    isRetailMode,
    modeAdapter,
    servicesViewModel,
    fnbViewModel,
    servicesLayoutMode,
    heroSectionModel,
    filteredCatalog,
    filteredFnbViewModel,
    promoSectionModel,
    selectedLocation,
    accessCapabilities,
    catalogPermitted,
    productCartPermitted,
    checkoutPermitted,
    bookingPermitted,
    serviceHeroModel,
    fnbCommunityModel,
    simpleStorefrontModel,
    defaultStorefrontModel,
    catalogState
  } = useStorefrontCatalog({
    selectedStore,
    catalog,
    catalogSearch,
    storeLocations,
    selectedLocationId,
    loadingCatalog,
    catalogError,
    hasCatalogSearchQuery: catalogSearch.trim().length > 0
  });
  const fnbCatalogRuntime = useFnbCatalogRuntime({
    activeSection: activeServiceTab,
    catalogSearch,
    fnbViewModel: filteredFnbViewModel,
    routeSlug,
    selectedLocationId
  });
  const {
    catalogPresentation: fnbCatalogPresentation,
    fnbCategoryDropdownRef,
    fnbPage,
    fnbPageSize,
    fnbSortOption,
    fnbViewMode,
    isFnbCategoryDropdownOpen,
    setFnbPage,
    setFnbPageSize,
    setFnbSortOption,
    setFnbViewMode,
    setIsFnbCategoryDropdownOpen
  } = fnbCatalogRuntime;
  const fnbProductDetailsRuntime = useFnbProductDetailsRoute({
    catalog,
    editingCartLine: editingFnbCartLine,
    filteredCatalog,
    filteredFnbViewModel,
    isFnbMode,
    isSimpleMode,
    routeItemId
  });
  const {
    detailPageFnbAllergens,
    detailPageFnbItem,
    detailPageFnbModifierCounts,
    detailPageFnbModifierGroups,
    detailPageFnbNutritionCards,
    detailPageFnbRelatedItems,
    selectedFnbDetail,
    selectedFnbDetailQuantity,
    selectedFnbLineModifiers,
    setSelectedFnbDetail,
    setSelectedFnbDetailQuantity,
    setSelectedFnbLineModifiers
  } = fnbProductDetailsRuntime;
  const { closeFnbDetail, openFnbDetail } = useFnbProductDetailNavigation({
    buildCatalogTarget,
    buildHistoryState: buildStorefrontHistoryState,
    buildItemDetailTarget,
    isCurrentTarget: isCurrentStorefrontTarget,
    itemSubpage: STORE_ITEM_SUBPAGE,
    routeSlug,
    selectedStoreSlug: selectedStore?.slug,
    setFnbDetail: setSelectedFnbDetail,
    setFnbDetailQuantity: setSelectedFnbDetailQuantity,
    setFnbLineModifiers: setSelectedFnbLineModifiers,
    setFnbOrderStep,
    setIsCheckoutOpen,
    setItemReviewInviteContext,
    setRouteItemId,
    setRouteReviewToken,
    setRouteServiceItemId,
    setRouteSlug,
    setRouteSubpage,
    setSimpleOrderStep,
    toSlug
  });
  const isFnbOrderSubpage = isFnbMode && (isOrderSubpage || isTrackSubpage);
  const isServicesTrackingPage = isServicesMode && isTrackSubpage;
  // checkoutTab only gets set to 'track' as a side effect of goStoreTrackPage() (e.g. after a
  // successful checkout). A direct/cold load of the track route (a refresh, or a bookmarked
  // tracking link) never calls that function, so checkoutTab would stay at its 'checkout'
  // default and the tracking polling effect below would never activate. Sync it here instead,
  // for every mode that can reach the track subpage.
  useEffect(() => {
    if (isTrackSubpage && checkoutTab !== 'track') setCheckoutTab('track');
  }, [isTrackSubpage, checkoutTab]);
  useStorefrontCartPersistence({
    cart,
    // #768 scope: retail / F&B / services only -- simple mode has no cart persistence layer, so
    // an applied voucher/promo code is still session-only there (PR #769 RF-3).
    enabled: isFnbMode || isServicesMode || isRetailMode,
    mode: isFnbMode ? 'fnb' : (isServicesMode ? 'services' : (isRetailMode ? 'retail' : '')),
    // #768: rides along in the same snapshot as the cart lines -- see that hook's own note.
    promoCode: checkoutPromoCode,
    setCart,
    setPromoCode: setCheckoutPromoCode,
    setVoucherCode: setCheckoutVoucherCode,
    // Route state changes synchronously when another storefront is selected.
    // Prefer it over the previous async profile so cart hydration/clearing
    // targets the destination store immediately.
    storeSlug: routeSlug || selectedStore?.slug,
    voucherCode: checkoutVoucherCode
  });
  const isStandaloneTrackingPage = isTrackSubpage || (isOrderSubpage && checkoutTab === 'track');
  const isSimpleOrderSubpage = isSimpleMode && (isTrackSubpage || (isOrderSubpage && checkoutTab === 'track'));
  const canUseGuestCheckoutFlow = !isDgfyCustomerSignedIn && guestCheckoutUnlocked;
  const isGuestStorefrontUser = !isStorefrontAccountAuthenticated;
  const {
    canOpen: canOpenTrackingDrawer,
    expandedPins: expandedGuestDrawerPins,
    isOpen: isGuestTrackingDrawerOpen,
    setExpandedPins: setExpandedGuestDrawerPins,
    setIsOpen: setIsGuestTrackingDrawerOpen
  } = useFnbTrackingDrawerPresentation({
    isGuestStorefrontUser,
    isSignedIn: isDgfyCustomerSignedIn,
    isStandaloneTrackingPage,
    selectedStoreSlug: selectedStore?.slug
  });
  // The F&B runtime is kept F&B-only. Services uses the dedicated runtime
  // immediately below, even though both hooks must be instantiated here to
  // preserve React hook ordering across storefront modes.
  const fnbTrackingMode = 'fnb';
  const fnbTrackingAdapterRegistry = useMemo(
    () => createTrackingAdapterRegistry([fnbTrackingAdapter]),
    []
  );
  const fnbTrackingRuntime = useFnbTrackingRuntime({
    checkoutTab,
    isFnbOrderSubpage,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
    requestJson,
    routeSlug,
    selectedStore,
    toSlug,
    trackingAdapterRegistry: fnbTrackingAdapterRegistry,
    trackingMode: fnbTrackingMode
  });
  const servicesTrackingAdapterRegistry = useMemo(
    () => createTrackingAdapterRegistry([serviceTrackingAdapter]),
    []
  );
  const servicesTrackingRuntime = useFnbTrackingRuntime({
    checkoutTab,
    isFnbOrderSubpage: isServicesTrackingPage,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
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
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
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
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
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
  const {
    buildTrackedOrderEntryFromTrackingPayload,
    fetchTrackingPayload,
    guestTrackedOrders,
    handleTrack,
    isTrackingRefreshing,
    selectedTrackingPin,
    setSelectedTrackingPin,
    setTrackingError,
    setTrackingPinInput,
    setTrackingResult,
    showCompletedTrackingCard,
    syncTrackedOrderSnapshot,
    trackingError,
    trackingPinInput,
    trackingResult
  } = activeTrackingRuntime;
  const advanceServicesLocalTracking = useCallback((reference) => {
    const storeSlug = selectedStore?.slug || routeSlug;
    const updated = advanceLocalServicesSimulation(storeSlug, reference);
    if (!updated) return;
    setTrackingPinInput(updated.tracking_pin);
    setSelectedTrackingPin(updated.tracking_pin);
    void handleTrack();
  }, [handleTrack, routeSlug, selectedStore?.slug, setSelectedTrackingPin, setTrackingPinInput]);
  const servicesPrimary = modeAdapter?.heroTheme?.accent || '#0f766e';
  const servicesPrimaryDark = modeAdapter?.heroTheme?.accentDark || '#134e4a';
  const servicesPrimarySoft = modeAdapter?.heroTheme?.accentSoft || '#ecfeff';
  const servicesBodyFont = modeAdapter?.heroTheme?.bodyFont || SERVICES_BODY_FONT;
  const servicesDisplayFont = modeAdapter?.heroTheme?.displayFont || modeAdapter?.heroTheme?.bodyFont || SERVICES_DISPLAY_FONT;
  const servicesPrimaryBorder = `${servicesPrimary}33`;
  const servicesPrimaryShadow = isSimpleMode ? 'rgba(23,107,58,0.16)' : 'rgba(15,118,110,0.24)';
  const servicesPrimaryShadowStrong = isSimpleMode ? 'rgba(23,107,58,0.24)' : 'rgba(15,118,110,0.32)';
  const servicesHighlight = '#f59e0b';
  const servicesHighlightSoft = '#fffbeb';
  const {
    isGlobalAccountPage,
    isTenantAccountPage,
    isStandaloneAccountPage
  } = useCustomerDashboardRouteFlags({
    currentPathname,
    currentPathSubpage,
    routeSubpage
  });
  const knownStoreRouteCandidates = useMemo(
    () => buildKnownStoreRouteCandidates(selectedStore, stores),
    [selectedStore, stores]
  );
  const {
    accountPanel,
    accountOrderActionReference,
    accountAddressActionId,
    trackedCustomerActivity,
    customerTrackLoadingReference,
    customerTrackError,
    activeCustomerOrders,
    activeCustomerOrderCount,
    accountTrackedOrders,
    resolveStorefrontMetaForAccountEntry,
    openStorefrontFromAccountEntry,
    submitAccountReviewFromDashboard,
    useAccountAddressForCheckout,
    renderAddressPinEditor,
    handleLoadAccountPanel,
    handleTrackCustomerReference,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    requestDgfyBusinessSecurityCode,
    handleAcceptDgfyCompanyInvitation,
    handleRejectDgfyCompanyInvitation,
    handleLeaveDgfyCompany,
    switchDgfyCompanyFromStorefront,
    handleSaveAccountAddress,
    handleSetDefaultAccountAddress,
    handleDeleteAccountAddress,
    refreshAccountAddresses,
    handleStorefrontSignOut,
    handleOpenBusinessInventory,
    handleOpenBusinessPos,
    getOwnBusinessDayCloseStatus,
    configureOwnBusinessDayClosePin
  } = useCustomerDashboardRuntime({
    EMPTY_ACCOUNT_PANEL,
    selectedStore,
    routeSlug,
    routeSubpage,
    currentPathSubpage,
    knownStoreRouteCandidates,
    isDgfyCustomerSignedIn,
    isGuestTrackingDrawerOpen,
    isAccountDrawerOpen,
    isStandaloneAccountPage,
    dgfySessionAccount,
    setDgfySessionAccount,
    setDgfyAuthTokenState,
    setIsAccountDrawerOpen,
    setDeliveryLocationAction,
    setSelectedSavedLocationId,
    setPinLocationError,
    setResolvedDeliveryAddress,
    setCustomerAddress,
    setCustomerPin,
    DeliveryPinMap,
    createAddressPinEditorRenderer,
    reverseGeocodeDeliveryPin,
    normalizeCoordinatePair,
    buildPinnedDeliveryAddress,
    isMobileViewport,
    servicesBodyFont,
    servicesDisplayFont,
    getFetchTrackingPayload: () => fetchTrackingPayload,
    getBuildTrackedOrderEntryFromTrackingPayload: () => buildTrackedOrderEntryFromTrackingPayload,
    mapAccountActivityToTrackedOrderEntry,
    mergeTrackedOrderEntries,
    mergeAccountPanelActivity,
    resolveStorefrontRouteSlug,
    toSlug,
    storePath,
    withAssetOrigin,
    withApiOrigin,
    requestJson,
    normalizeStorefrontErrorMessage,
    deriveAccountActivityCollections,
    readDgfyAuthToken,
    readStoreAuthToken,
    clearDgfyAuthToken,
    clearStoreAuthToken,
    rememberDgfySignedOutEmail,
    markDgfyExplicitSignOut,
    clearCheckoutAuthResumeDraft,
    buildSkupervisorHandoffUrl,
    buildPosDgfyHandoffUrl,
    createDgfyHandoff,
    buildPosAppUrl,
    startDgfyPosSession,
    startDgfyTenantSession,
    getGoStoreTrackPage: () => goStoreTrackPage,
    onTrackedActivityUpdated: (activity) => {
      const normalizedReference = String(activity?.reference || '').trim().toUpperCase();
      if (!normalizedReference) return;
      setTrackingResult((previous) => {
        const previousPin = String(previous?.tracking_pin || previous?.order?.tracking_pin || '').trim().toUpperCase();
        if (previousPin !== normalizedReference) return previous;
        return {
          ...previous,
          status: activity.status || previous?.status,
          status_label: activity.status_label || activity.status || previous?.status_label,
          updated_at: activity.updated_at || activity.occurred_at || previous?.updated_at
        };
      });
    }
  });
  const {
    accountDisplayName,
    accountIdentityRawName,
    accountIdentityRawPhone,
    accountIdentityRawEmail,
    accountIdentityName,
    accountIdentityContact,
    accountIdentityInitials
  } = useCustomerDashboardIdentity({
    accountPanel,
    dgfySessionAccount,
    // `savedCustomerDetails` is now owned by `useGuestCustomerIdentity`, which is called
    // below (after `accountIdentityRawName`/Phone/Email exist, since its identity-sync
    // effect needs them as real reactive dependencies). Reading storage directly here
    // avoids a TDZ reference to that hook's not-yet-declared state; every mutation path
    // for saved customer details also writes through to this same storage, so the value
    // is equivalent to the reactive state for this render.
    savedCustomerDetails: readSavedCustomerDetails(),
    maskValue
  });
  const isGuestAccountDrawerState = !isStorefrontAccountAuthenticated;
  // The tracking runtime setup above stays here rather than moving into
  // useStorefrontTrackingIntent: this hook can only be called after
  // `accountTrackedOrders`/`guestTrackedOrders` exist (required for
  // `trackingDrawerOrders`), which is after `useFnbTrackingRuntime` already needed
  // them. Genuine ordering cycle, not a plain TDZ — see useStorefrontTrackingIntent.js.
  const {
    trackingDrawerOrders,
    openTrackPanel,
    openFullTrackingForPin
  } = useStorefrontTrackingIntent({
    accountTrackedOrders,
    canOpenTrackingDrawer,
    getGoStoreTrackPage: () => goStoreTrackPage,
    guestTrackedOrders,
    handleLoadAccountPanel,
    isDgfyCustomerSignedIn,
    isServicesMode,
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
  });

  const {
    customerFirstName,
    setCustomerFirstName,
    customerLastName,
    setCustomerLastName,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerEmail,
    setCustomerEmail,
    savedCustomerDetails,
    setSavedCustomerDetails,
    maskedSavedCustomerPreview,
    hasSavedCustomerDetails,
    applySavedCustomerDetails,
    handleApplyGuestDetails,
    clearSavedCustomerDetailsForDevice,
    renderGuestIdentityFields,
    renderGuestCheckoutEntry,
    renderAccountOwnedIdentitySummary
  } = useGuestCustomerIdentity({
    accountIdentityRawName,
    accountIdentityRawPhone,
    accountIdentityRawEmail,
    isDgfyCustomerSignedIn,
    rememberCustomerDetails,
    guestDetailsEditMode,
    setGuestDetailsEditMode,
    setIsUsingDifferentGuestDetails,
    isMobileViewport,
    servicesBodyFont,
    servicesDisplayFont,
    checkoutAccent: isServicesMode ? servicesPrimary : undefined,
    checkoutAccentDark: isServicesMode ? servicesPrimaryDark : undefined,
    checkoutAccentShadow: isServicesMode ? servicesPrimaryShadow : undefined,
    customerAddress,
    setCustomerAddress,
    setRememberCustomerDetails,
    setGuestCheckoutUnlocked,
    // `openCheckoutAuthFlow`/`handleRequestGuestCheckoutOtp` are declared later in this
    // component (they depend on state that in turn depends on this hook), so they can
    // only be handed to the hook as lazy getters - the same forward-reference idiom
    // already used for `getGoStoreTrackPage`/`getFetchTrackingPayload` above.
    getOpenCheckoutAuthFlow: () => openCheckoutAuthFlow,
    getHandleSendGuestCheckoutOtp: () => handleRequestGuestCheckoutOtp
  });
  const customerNameParts = useMemo(() => splitCustomerName(customerName), [customerName]);
  const resolvedCustomerFirstName = String(customerFirstName || customerNameParts.firstName || '').trim();
  const resolvedCustomerLastName = String(customerLastName || customerNameParts.lastName || '').trim();
  useEffect(() => {
    if (isDgfyCustomerSignedIn) return;
    const mergedGuestName = buildCustomerFullName(customerFirstName, customerLastName);
    if (mergedGuestName !== String(customerName || '').trim()) {
      setCustomerName(mergedGuestName);
    }
  }, [customerFirstName, customerLastName, customerName, isDgfyCustomerSignedIn, setCustomerName]);
  useEffect(() => {
    if (isDgfyCustomerSignedIn) {
      setGuestCheckoutUnlocked(false);
      setIsUsingDifferentGuestDetails(false);
    }
  }, [isDgfyCustomerSignedIn]);
  useEffect(() => {
    if (isDgfyCustomerSignedIn || !guestCheckoutUnlocked) {
      setGuestDetailsEditMode(false);
      setIsUsingDifferentGuestDetails(false);
      return;
    }
    setGuestDetailsEditMode(!hasSavedCustomerDetails);
  }, [guestCheckoutUnlocked, hasSavedCustomerDetails, isDgfyCustomerSignedIn]);
  useEffect(() => {
    if (!shouldHydrateSavedGuestCustomerDetails({
      isDgfyCustomerSignedIn,
      guestCheckoutUnlocked,
      hasSavedCustomerDetails: Boolean(savedCustomerDetails),
      isUsingDifferentGuestDetails
    })) return;
    const splitName = splitCustomerName(savedCustomerDetails.name || '');
    const nextFirstName = String(savedCustomerDetails.firstName || splitName.firstName || '').trim();
    const nextLastName = String(savedCustomerDetails.lastName || splitName.lastName || '').trim();
    const nextName = String(savedCustomerDetails.name || buildCustomerFullName(nextFirstName, nextLastName) || '').trim();
    const nextPhone = String(savedCustomerDetails.phone || '').trim();
    const nextEmail = String(savedCustomerDetails.email || '').trim();
    if (nextFirstName && !String(customerFirstName || '').trim()) {
      setCustomerFirstName(nextFirstName);
    }
    if (nextLastName && !String(customerLastName || '').trim()) {
      setCustomerLastName(nextLastName);
    }
    if (nextName && !String(customerName || '').trim()) {
      setCustomerName(nextName);
    }
    if (nextPhone && !String(customerPhone || '').trim()) {
      setCustomerPhone(nextPhone);
    }
    if (nextEmail && !String(customerEmail || '').trim()) {
      setCustomerEmail(nextEmail);
    }
  }, [
    customerEmail,
    customerFirstName,
    customerLastName,
    customerName,
    customerPhone,
    guestCheckoutUnlocked,
    isUsingDifferentGuestDetails,
    isDgfyCustomerSignedIn,
    savedCustomerDetails,
    setCustomerEmail,
    setCustomerFirstName,
    setCustomerLastName,
    setCustomerName,
    setCustomerPhone
  ]);
  useEffect(() => {
    if (!selectedStore?.slug) {
      setGuestCheckoutUnlocked(false);
    }
  }, [selectedStore?.slug]);
  useEffect(() => {
    if (isStorePage) return;
    setCatalogSearch('');
  }, [isStorePage]);

  useEffect(() => {
    const previousRouteSlug = previousRouteSlugRef.current;
    const currentRouteSlug = routeSlug;
    if (previousRouteSlug && currentRouteSlug && previousRouteSlug !== currentRouteSlug) {
      setCatalogSearch('');
      setActiveServiceTab(null);
      setServiceSortOption('recommended');
      setServiceAvailabilityFilter('all');
      setServiceAreaFilter('all');
      setServiceDurationFilter('all');
      setServicePage(1);
      setIsServiceFilterOpen(false);
    }
    previousRouteSlugRef.current = currentRouteSlug;
  }, [routeSlug]);

  useEffect(() => {
    if (
      editingFnbCartLine
      && (!isFnbDetailsSubpage || String(editingFnbCartLine.item_id) !== String(routeItemId))
    ) {
      setEditingFnbCartLine(null);
    }
  }, [editingFnbCartLine, isFnbDetailsSubpage, routeItemId]);

  const {
    isAboutExpanded,
    setIsAboutExpanded,
    isServiceGalleryExpanded,
    setIsServiceGalleryExpanded
  } = useStorefrontUiChrome({
    appBasePath,
    isAccountDrawerOpen,
    isCheckoutOpen,
    isFnbOrderSubpage,
    isGuestTrackingDrawerOpen,
    isStandaloneAccountPage,
    orderSuccessAnimationTimerRef,
    serviceWorkerUrl,
    setViewportWidth
  });

  useEffect(() => {
    if (!isFnbOrderSubpage && !isServicesTrackingPage) return;
    const resolvedSlug = toSlug(selectedStore?.slug || routeSlug);
    const persistedTrackedOrders = readTrackedOrdersForStore(resolvedSlug).filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    const persistedTrackingPin = readLastTrackingPinForStore(resolvedSlug);
    const routeTrackingPin = readTrackingPinFromQuery();
    const routeWantsTrack = routeSubpage === STORE_TRACK_SUBPAGE || currentPathSubpage === STORE_TRACK_SUBPAGE;
    const preferredPin = String(routeTrackingPin || persistedTrackedOrders[0]?.tracking_pin || persistedTrackingPin || '').trim().toUpperCase();
    const preferredTab = pendingOrderInitialTab || (routeWantsTrack && preferredPin ? 'track' : 'checkout');
    if (!trackingPinInput && preferredPin) {
      setTrackingPinInput(preferredPin);
    }
    if (!selectedTrackingPin && preferredPin) setSelectedTrackingPin(preferredPin);
    setCheckoutTab(preferredTab);
    setPendingOrderInitialTab('');
    setIsCheckoutOpen(false);
  }, [currentPathSubpage, isFnbOrderSubpage, isServicesTrackingPage, pendingOrderInitialTab, routeSlug, routeSubpage, selectedStore?.slug, selectedTrackingPin, setSelectedTrackingPin, setTrackingPinInput, trackingPinInput]);

  useEffect(() => {
    // Phase 142 (#823): Retail joins Simple here -- a downpayment-required Retail order can only
    // be placed by paying online, so it needs the same PayMongo-return rehydration path Simple
    // already has. Retail's own step state is local to RetailOrderPage.jsx (not hoisted here like
    // simpleOrderStep), so it self-resumes to its payment step by watching qrphPaymentSession
    // (see RetailOrderPage.jsx) rather than needing a setRetailOrderStep call here.
    const supportsProductPaymentReturn = isFnbOrderSubpage || ((isSimpleMode || isRetailMode) && isResolvedOrderSubpage);
    if (!supportsProductPaymentReturn || typeof window === 'undefined' || qrphPaymentSession) return;
    const params = new URLSearchParams(window.location.search);
    const paymentSessionId = String(params.get('payment_session') || '').trim().toUpperCase();
    if (!/^CPS-[A-Z0-9]{10}$/.test(paymentSessionId)) return;
    if (paymentReturnSessionRef.current === paymentSessionId) return;
    const paymentMethod = String(params.get('payment_method') || '').trim().toLowerCase();
    if (!isStorefrontOnlinePaymentType(paymentMethod)) return;
    paymentReturnSessionRef.current = paymentSessionId;
    const returnedStatus = String(params.get('payment_status') || '').trim().toLowerCase();
    if (isFnbOrderSubpage) setFnbOrderStep(4);
    if (isSimpleMode && isResolvedOrderSubpage) setSimpleOrderStep(3);
    setCheckoutTab('checkout');
    setFnbPaymentType(paymentMethod);
    setQrphPaymentSession({
      payment_session_id: paymentSessionId,
      payment_method: paymentMethod,
      status: returnedStatus === 'cancelled' ? 'cancelled' : 'awaiting_payment'
    });
  }, [isFnbOrderSubpage, isResolvedOrderSubpage, isRetailMode, isSimpleMode, qrphPaymentSession, setCheckoutTab, setFnbOrderStep, setFnbPaymentType, setQrphPaymentSession, setSimpleOrderStep]);

  useEffect(() => {
    const isSignedIn = Boolean(readStoreAuthToken() || readDgfyAuthToken() || dgfySessionAccount?.id);
    setRememberCustomerDetails((previous) => (previous ? true : isSignedIn));
  }, [accountPanel.me, dgfySessionAccount?.id]);

  useEffect(() => {
    const me = accountPanel?.me;
    if (!me || typeof me !== 'object') return;
    const profileFromAccount = normalizeSavedCustomerDetails({
      firstName: me.first_name || '',
      lastName: me.last_name || '',
      name: me.customer_name || me.name || '',
      phone: me.customer_phone || me.phone || me.mobile || '',
      email: me.customer_email || me.email || '',
      source: 'account',
      updatedAt: Date.now()
    });
    if (!profileFromAccount) return;
    setSavedCustomerDetails(profileFromAccount);
    writeSavedCustomerDetails(profileFromAccount);
  }, [accountPanel.me, setSavedCustomerDetails]);

  const goStoreOrderForDiscovery = (slug, locationId = null, storeContext = null) => {
    const normalized = toSlug(slug);
    if (!normalized || typeof window === 'undefined') return;
    // An external listing (entity_type: 'external_listing') transacts on a different
    // platform — it has no DGFY storefront/checkout to open. Redirect off-platform via
    // the sanitized opener instead of routing into this app's storefront shell, which
    // would otherwise present the off-platform store as if it were a DGFY tenant.
    if (storeContext?.entity_type === 'external_listing') {
      openStorefrontActionLink(sanitizeExternalLink(storeContext.storefront_url || storeContext.external_storefront_url));
      return;
    }
    // Always land discovery's "Order Now" on the storefront's catalog section —
    // never jump straight into checkout, which would otherwise present an empty
    // cart to a visitor who hasn't picked anything yet. F&B previously was the
    // only mode routed here; every mode now behaves the same way regardless of
    // whether the store supports checkout.
    goStore(normalized, locationId);
    if (!canUseCheckout(storeContext)) {
      const message = getStorefrontAccessBlockMessage(storeContext);
      if (message) toast.error(message);
    }
    window.requestAnimationFrame(() => {
      document.getElementById('storefront-catalog-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  };
  const goStoreOrderPage = ({ initialTab } = {}) => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const persistedTrackedOrders = readTrackedOrdersForStore(normalized).filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    const resolvedInitialTab = initialTab || 'checkout';
    const target = buildOrderTarget(normalized);
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({
        storeSlug: normalized,
        storeSubpage: STORE_ORDER_SUBPAGE
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
  };
  const goStoreTrackPage = ({ pin = '', storeSlug = '', serviceHandoff = '' } = {}) => {
    const normalized = toSlug(storeSlug || selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const normalizedPin = String(pin || selectedTrackingPin || trackingPinInput || readLastTrackingPinForStore(normalized) || '').trim().toUpperCase();
    const target = buildTrackTarget(normalized, normalizedPin);
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({
        storeSlug: normalized,
        storeSubpage: STORE_TRACK_SUBPAGE
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
      if (isServicesMode) {
        writeServiceHandoffForBooking(normalized, normalizedPin, serviceHandoff);
      }
    }
    setFnbOrderStep(checkoutResult ? 4 : 3);
    setSimpleOrderStep(checkoutResult ? 4 : 1);
    setCheckoutTab('track');
    setIsCheckoutOpen(false);
  };
  const {
    addToCart,
    cartAddOnsTotal,
    cartCount,
    cartSubtotal,
    cartTotal,
    getCartFlySourceRect,
    hasMixedServiceCart,
    hasServiceCart,
    productCartLines,
    replaceCartLine,
    removeCartItem,
    serviceCartCount,
    serviceCartFlyAnimations,
    serviceCartLines,
    serviceCartTotal,
    updateQty
  } = useCartMutations({
    bookingPermitted,
    cart,
    isFnbMode,
    isRetailMode,
    isServicesMode,
    isSimpleMode,
    productCartPermitted,
    serviceCartFabRef,
    servicePaymentTiming,
    setCart,
    setCartImageErrors,
    setCheckoutTab,
    setIsCheckoutOpen
  });

  const handleFnbCartLineEdited = useCallback(() => {
    setEditingFnbCartLine(null);
    closeFnbDetail();
    setCheckoutTab('cart');
    setIsCheckoutOpen(true);
  }, [closeFnbDetail, setCheckoutTab, setIsCheckoutOpen]);

  const handleEditFnbCartLine = useCallback((line) => {
    const item = (Array.isArray(catalog) ? catalog : []).find((entry) => Number(entry?.item_id) === Number(line?.item_id));
    if (!item) {
      toast.error('This menu item is no longer available to edit.');
      return;
    }
    setEditingFnbCartLine(line);
    setIsCheckoutOpen(false);
    openFnbDetail(item);
  }, [catalog, openFnbDetail, setIsCheckoutOpen]);

  const hasDiscoverySearch = debouncedDiscoverySearch.trim().length > 0;
  const { discoveryInteractiveAreaRef } = useDiscoveryExplorationOutsideClick({
    hasDiscoveryExplorationStarted,
    hasDiscoverySearch,
    isDiscoverySearchFocused,
    setHasDiscoveryExplorationStarted
  });
  const {
    activeDiscoveryMapPins,
    discoveryPinsBySlug,
    discoveryResultStores,
    discoveryResultsMapKey,
    filteredDiscoveryStores,
    highlightedStore,
    searchedDiscoveryMapPins,
    stableHeroDiscoveryMapPins,
    storesWithNearestBranch
  } = useDiscoveryDerivedResults({
    DEFAULT_CENTER,
    DISCOVERY_CATEGORY_MATCHERS,
    debouncedDiscoverySearch,
    discoveryAvailabilityFilter,
    discoveryCategoryFilter,
    discoveryCoords,
    discoveryDistanceFilter,
    discoveryLocationMap,
    discoveryOpenFilter,
    discoveryPinScope,
    discoveryRatingFilter,
    discoverySortBy,
    hasDiscoverySearch,
    haversineDistanceKm,
    highlightedStoreSlug,
    isDiscoveryNoMatchToastActive,
    loadingStores,
    normalizeDiscoveryCategoryKey,
    normalizeStorefrontCategories,
    normalizeStorefrontReviewSummary,
    search,
    selectDiscoveryPinLocations,
    setIsDiscoveryNoMatchToastActive,
    stores,
    storesError,
    toNumberOrNull,
    toSlug,
    toast
  });
  const hasMultipleStoreBranches = Array.isArray(storeLocations) && storeLocations.length > 1;
  useEffect(() => {
    setIsAboutExpanded(false);
    setIsServiceGalleryExpanded(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore?.slug, selectedLocationId]);
  useEffect(() => {
    setHasSelectedBranchFromMenu(false);
  }, [selectedStore?.slug]);
  // Registers store/tenant/business-mode as PostHog super properties + groups
  // (and the Sentry equivalent as tags) once a store resolves, so every
  // event fired afterwards (funnel events, autocapture, pageviews, and now
  // Sentry issues) can be sliced by "which store" / "which tenant" without a
  // join -- this is what answers "which stores do visitors most often come
  // from" in the PostHog UI, and groups Sentry issues by tenant.
  useEffect(() => {
    if (!selectedStore?.slug) return;
    const businessMode = selectedStore.workflow_mode || selectedStore.ops_workflow_mode || selectedStore.business_mode;
    setAnalyticsContext({
      storeSlug: selectedStore.slug,
      storeName: selectedStore.tenant_name,
      tenantId: selectedStore.tenant_id,
      businessMode,
      locationId: selectedLocationId
    });
    setSentryContext({
      storeSlug: selectedStore.slug,
      tenantId: selectedStore.tenant_id,
      businessMode,
      locationId: selectedLocationId
    });
    trackFunnelEvent(ANALYTICS_EVENTS.STORE_VIEWED, {
      store_slug: selectedStore.slug,
      business_mode: businessMode,
      location_id: selectedLocationId
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore?.slug, selectedStore?.tenant_id, selectedStore?.workflow_mode, selectedLocationId]);

  // Catalog search is purely client-side filtering (no network call, no
  // existing debounce), so this is debounced here specifically to avoid
  // firing an event per keystroke.
  const catalogFilterEventTimerRef = useRef(null);
  useEffect(() => {
    if (!catalogSearch.trim()) return undefined;
    clearTimeout(catalogFilterEventTimerRef.current);
    catalogFilterEventTimerRef.current = setTimeout(() => {
      trackFunnelEvent(ANALYTICS_EVENTS.STORE_CATALOG_FILTERED, {
        query: catalogSearch.trim(),
        store_slug: selectedStore?.slug
      });
    }, 600);
    return () => clearTimeout(catalogFilterEventTimerRef.current);
  }, [catalogSearch, selectedStore?.slug]);
  const {
    submitFnbItemReview,
    openFnbItemReviewFromInvite,
    resetFnbItemReviewDraft,
    syncFnbItemReviewSectionIntoView
  } = useFnbItemReviewRuntime({
    buildHistoryState: buildStorefrontHistoryState,
    buildItemDetailTarget,
    catalog,
    customerName,
    detailItem: detailPageFnbItem,
    isDetailsRoute: isFnbDetailsSubpage,
    isFnbMode,
    itemReviewInviteContext,
    itemSubpage: STORE_ITEM_SUBPAGE,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
    onOpenDetail: openFnbDetail,
    requestJson,
    reviewDraft,
    reviewSubmitLoading,
    routeItemId,
    routeReviewToken,
    routeSlug,
    savedCustomerName: savedCustomerDetails?.name,
    selectedStore,
    setInviteContext: setItemReviewInviteContext,
    setIsReviewModalOpen,
    setReviewCards: setItemReviewCards,
    setReviewDraft,
    setReviewLoading: setItemReviewsLoading,
    setReviewSectionHighlighted: setItemReviewSectionHighlighted,
    setReviewSummary: setItemReviewSummary,
    setReviewSubmitLoading,
    setRouteReviewToken,
    toast,
    toSlug
  });
  useEffect(() => {
    setIsReviewModalOpen(false);
    setReviewSubmitLoading(false);
    resetFnbItemReviewDraft();
    setItemReviewSummary(null);
    setItemReviewCards([]);
    setItemReviewsLoading(false);
    setItemReviewInviteContext(null);
    setItemReviewSectionHighlighted(false);
  }, [resetFnbItemReviewDraft, selectedStore?.slug]);
  const { toggleFnbDetailModifier, setFnbDetailModifierQuantity } = useFnbProductModifiers({
    setSelectedModifiers: setSelectedFnbLineModifiers
  });
  const hasCatalogSearchQuery = catalogSearch.trim().length > 0;
  const isDeliveryOrder = orderMethod === 'delivery';
  const isServicesCartDrawerMode = isServicesMode && !isBookingSubpage;
  const isSimpleCartSurfaceMode = isSimpleMode && !isResolvedOrderSubpage;
  const {
    accountStepComplete,
    activeBookingService,
    activeServiceCartLine,
    bookingCalendarDateOptions,
    bookingDateOptions,
    bookingFieldPlan,
    bookingPageIntakeFields,
    bookingPageMissingRequiredIntake,
    bookingPagePaymentOptions,
    bookingStepOneAdditionalFields,
    bookingSummaryAmount,
    bookingSummaryQuantity,
    bookingTimeSlotOptions,
    firstServiceLine,
    fulfillmentStepComplete,
    groupedServiceLineItems,
    missingCustomerInformation,
    missingRequiredSelectedServiceIntake,
    missingScheduleAndServiceInfo,
    missingStepOneAdditionalFields,
    reviewServiceLines,
    selectedServiceDatePart,
    selectedServiceIntakeFields,
    selectedServicePaymentOptions,
    selectedServiceTimePart,
    serviceBookingSummaryLineItems,
    serviceBookingSummaryRows,
    serviceBookingSummarySchedule,
    serviceBookingSummaryTitle,
    serviceIntakeFields,
    serviceLocationSummaryDraft,
    serviceFlow,
    servicePaymentOptions,
    getPreferredBookingTimeForDate,
    stepOneComplete
  } = useServiceBookingDerivations({
    customerAddress,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    hasServiceCart,
    isServicesMode,
    money,
    resolvedDeliveryAddress,
    selectedServiceCartLineId,
    selectedServiceDetail,
    serviceAppointmentAt,
    serviceCartLines,
    serviceCartTotal,
    serviceDraftQuantity,
    serviceIntakeResponses,
    serviceOrderMethod,
    servicePaymentTiming,
    serviceUnitType,
    storefrontHours: selectedStore?.storefront_hours
  });
  const isDesktopCheckout = isDesktopViewport;
  const isStorefrontV2 = parseBooleanFlag(selectedStore?.storefront_ui_v2_enabled, false);
  const followEnabledForStore = parseBooleanFlag(selectedStore?.storefront_follow_enabled, false);
  const { followState, handleFollowAction, handleShareAction } = useStorefrontShareActions({
    selectedStore,
    isStorePage,
    isStorefrontV2,
    followEnabledForStore,
    storefrontVisitorId
  });
  const {
    followUiEnabledForStore,
    renderStorefrontClosedNotice,
    shareEnabledForStore,
    storefrontClosedByHours,
    storefrontClosedMessageBody,
    storefrontClosedToastMessage,
    storefrontHoursLabel
  } = useStorefrontClosedNotice({ followEnabledForStore, followState, selectedStore });
  const {
    activeOrderMethodLabel,
    appliedPromoDiscountText,
    appliedVoucherDiscountText,
    checkoutAllowed,
    checkoutBlockReason,
    fnbCartStatusLabel,
    hasStockViolation,
    promoDiscountSummaryRow,
    promoStatusMessage,
    promoStatusTone,
    voucherDiscountSummaryRow,
    voucherStatusMessage,
    voucherStatusTone,
    requireQuoteForCheckout,
    serviceCartValidationIssues,
    simpleOrderMethodOptions,
    totalsForDisplay
  } = useCheckoutTotalsAndGating({
    accessCapabilities,
    cart,
    cartCount,
    cartTotal,
    checkoutError,
    checkoutLoading,
    checkoutResult,
    hasMixedServiceCart,
    hasServiceCart,
    isFnbMode,
    isRetailMode,
    isSimpleMode,
    money,
    orderMethod,
    quoteError,
    quoteNeedsRefresh,
    quoteResult,
    selectedStore,
    serviceAppointmentAt,
    serviceCartLines,
    storefrontClosedByHours
  });
  useEffect(() => {
    if (productCartPermitted && checkoutPermitted && bookingPermitted) return;
    if (cart.length === 0 && !quoteResult && !isCheckoutOpen) return;
    setCart([]);
    setQuoteResult(null);
    setQuoteNeedsRefresh(true);
    setIsCheckoutOpen(false);
  }, [productCartPermitted, checkoutPermitted, bookingPermitted, cart.length, quoteResult, isCheckoutOpen]);
  useEffect(() => {
    if (!isBookingSubpage) return;
    setIsCheckoutOpen(false);
  }, [isBookingSubpage]);

  useDiscoveryHighlightSync({
    activeDiscoveryMapPins,
    filteredDiscoveryStores,
    getDiscoveryMarkerKey,
    highlightedDiscoveryMarkerKey,
    highlightedStoreSlug,
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug
  });
  useEffect(() => {
    if (!isStorePage) return;
    setQuoteNeedsRefresh(true);
  }, [cart, orderMethod, selectedLocationId, customerPin, serviceAppointmentAt, servicePaymentTiming, checkoutPromoCode, checkoutVoucherCode, isStorePage]);
  useEffect(() => {
    if (!isSimpleMode) return;
    if (orderMethod === 'pickup' || orderMethod === 'delivery') return;
    setOrderMethod('pickup');
  }, [isSimpleMode, orderMethod]);
  useEffect(() => {
    setServicePage(1);
  }, [catalogSearch, activeServiceTab, serviceSortOption, serviceAvailabilityFilter, serviceAreaFilter, serviceDurationFilter, servicePageSize, routeSlug, selectedLocationId]);
  useEffect(() => {
    if (!hasServiceCart) return;
    if (!servicePaymentOptions.some((option) => option.value === servicePaymentTiming)) {
      setServicePaymentTiming(servicePaymentOptions[0]?.value || 'postpaid');
    }
  }, [hasServiceCart, servicePaymentOptions, servicePaymentTiming]);
  useEffect(() => {
    if (!selectedServiceDetail) return;
    if (!selectedServicePaymentOptions.some((option) => option.value === servicePaymentTiming)) {
      setServicePaymentTiming(selectedServicePaymentOptions[0]?.value || 'postpaid');
    }
  }, [selectedServiceDetail, selectedServicePaymentOptions, servicePaymentTiming]);
  useEffect(() => {
    if (!selectedServiceDetail) return;
    const matchesCurrentService = Number(selectedServiceDetail.item_id) === Number(activeServiceCartLine?.item_id);
    setServiceDraftQuantity(matchesCurrentService ? Math.max(1, Number(activeServiceCartLine?.quantity || 1)) : 1);
    setServiceDraftNotes(matchesCurrentService ? String(activeServiceCartLine?.service_notes || '') : '');
    if (!matchesCurrentService) {
      setServiceAppointmentAt('');
      setServiceIntakeResponses({});
      setServiceUnitType('');
    }
  }, [selectedServiceDetail, activeServiceCartLine]);
  useEffect(() => {
    setServiceIntakeResponses({});
    setServiceUnitType('');
    setServicePaymentPreviewMethod('qr');
    setServicePaymentPreviewCard({ cardholder: '', cardNumber: '', expiry: '', cvv: '' });
    setServicePaymentPreviewReceiptName('');
  }, [activeServiceCartLine?.cart_line_id]);
  useEffect(() => {
    if (!hasServiceCart || !activeServiceCartLine) {
      setServiceDraftQuantity(1);
      setServiceDraftNotes('');
      if (!selectedServiceDetail) {
        setServiceAppointmentAt('');
        setServiceIntakeResponses({});
      }
      return;
    }
    setServiceDraftQuantity(Math.max(1, Number(activeServiceCartLine.quantity || 1)));
    setServiceDraftNotes(String(activeServiceCartLine.service_notes || ''));
    setServiceAppointmentAt(String(activeServiceCartLine.service_schedule_at || ''));
    setServiceIntakeResponses(activeServiceCartLine?.intake_responses && typeof activeServiceCartLine.intake_responses === 'object'
      ? activeServiceCartLine.intake_responses
      : {});
    setServicePaymentTiming(String(activeServiceCartLine.payment_timing || servicePaymentOptions[0]?.value || 'postpaid'));
  }, [hasServiceCart, activeServiceCartLine, selectedServiceDetail, servicePaymentOptions]);
  useEffect(() => {
    if (!isBookingSubpage) return;
    if (activeBookingService) {
      setServiceBookingStep(1);
    }
  }, [isBookingSubpage, hasServiceCart, activeBookingService?.item_id]);
  useEffect(() => {
    if (serviceCartLines.length === 0) {
      if (selectedServiceCartLineId) setSelectedServiceCartLineId('');
      return;
    }
    const hasSelectedLine = serviceCartLines.some((line) => String(line.cart_line_id || '') === String(selectedServiceCartLineId || ''));
    if (!hasSelectedLine) {
      setSelectedServiceCartLineId(String(serviceCartLines[0]?.cart_line_id || ''));
    }
  }, [selectedServiceCartLineId, serviceCartLines]);
  useEffect(() => {
    if (bookingFieldPlan.customerNameField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.customerNameField.id] === customerName
          ? previous
          : { ...previous, [bookingFieldPlan.customerNameField.id]: customerName }
      ));
    }
    if (bookingFieldPlan.contactNumberField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.contactNumberField.id] === customerPhone
          ? previous
          : { ...previous, [bookingFieldPlan.contactNumberField.id]: customerPhone }
      ));
    }
    if (bookingFieldPlan.emailField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.emailField.id] === customerEmail
          ? previous
          : { ...previous, [bookingFieldPlan.emailField.id]: customerEmail }
      ));
    }
    if (bookingFieldPlan.addressField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.addressField.id] === customerAddress
          ? previous
          : { ...previous, [bookingFieldPlan.addressField.id]: customerAddress }
      ));
    }
    if (bookingFieldPlan.preferredDateField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.preferredDateField.id] === selectedServiceDatePart
          ? previous
          : { ...previous, [bookingFieldPlan.preferredDateField.id]: selectedServiceDatePart }
      ));
    }
    if (bookingFieldPlan.preferredTimeField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.preferredTimeField.id] === selectedServiceTimePart
          ? previous
          : { ...previous, [bookingFieldPlan.preferredTimeField.id]: selectedServiceTimePart }
      ));
    }
    if (bookingFieldPlan.unitTypeField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.unitTypeField.id] === serviceUnitType
          ? previous
          : { ...previous, [bookingFieldPlan.unitTypeField.id]: serviceUnitType }
      ));
    }
    if (bookingFieldPlan.unitCountField?.id) {
      const nextQuantity = String(Math.max(1, Number(serviceDraftQuantity || 1)));
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.unitCountField.id] === nextQuantity
          ? previous
          : { ...previous, [bookingFieldPlan.unitCountField.id]: nextQuantity }
      ));
    }
  }, [
    bookingFieldPlan.addressField?.id,
    bookingFieldPlan.contactNumberField?.id,
    bookingFieldPlan.customerNameField?.id,
    bookingFieldPlan.emailField?.id,
    bookingFieldPlan.preferredDateField?.id,
    bookingFieldPlan.preferredTimeField?.id,
    bookingFieldPlan.unitCountField?.id,
    bookingFieldPlan.unitTypeField?.id,
    customerAddress,
    customerEmail,
    customerName,
    customerPhone,
    selectedServiceDatePart,
    selectedServiceTimePart,
    serviceDraftQuantity,
    serviceUnitType
  ]);
  useEffect(() => {
    if (!isBookingSubpage || !activeBookingService || !serviceFlow.requiresSchedule) return;
    const firstDate = bookingDateOptions[0]?.value || '';
    if (!firstDate) {
      if (serviceAppointmentAt) setServiceAppointmentAt('');
      return;
    }
    const currentTimeIsValid = bookingTimeSlotOptions.some((option) => option.value === selectedServiceTimePart);
    if (selectedServiceDatePart && currentTimeIsValid) return;
    if (selectedServiceDatePart && !selectedServiceTimePart) return;
    const nextTime = getPreferredBookingTimeForDate(activeBookingService, firstDate, selectedServiceTimePart);
    const nextAppointment = combineDateAndTimeParts(firstDate, nextTime);
    if (nextAppointment !== serviceAppointmentAt) setServiceAppointmentAt(nextAppointment);
  }, [
    isBookingSubpage,
    activeBookingService,
    bookingCalendarDateOptions,
    bookingDateOptions,
    bookingTimeSlotOptions,
    getPreferredBookingTimeForDate,
    selectedServiceDatePart,
    selectedServiceTimePart,
    serviceAppointmentAt,
    serviceFlow.requiresSchedule
  ]);
  useEffect(() => {
    if (!isServiceDetailsSubpage) return;
    if (!routeServiceItemId) {
      setSelectedServiceDetail(null);
      return;
    }
    const matchedService = (Array.isArray(catalog) ? catalog : []).find((item) => String(item?.item_id) === String(routeServiceItemId));
    if (matchedService) {
      setSelectedServiceDetail((previous) => (String(previous?.item_id) === String(matchedService.item_id) ? previous : matchedService));
    } else if (!loadingCatalog) {
      setSelectedServiceDetail(null);
    }
  }, [catalog, isServiceDetailsSubpage, loadingCatalog, routeServiceItemId]);
  useEffect(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) {
      if (selectedLocationId != null) setSelectedLocationId(null);
      return;
    }
    const exists = storeLocations.some((location) => Number(location.location_id) === Number(selectedLocationId));
    if (!exists) {
      const primaryLocation = primaryLocationId == null
        ? null
        : (storeLocations.find((location) => Number(location.location_id) === Number(primaryLocationId)) || null);
      const firstOpenLocation = storeLocations.find((location) => location?.is_open !== false) || null;
      const fallbackLocationId = (firstOpenLocation?.location_id ?? primaryLocation?.location_id ?? storeLocations[0]?.location_id ?? null);
      setSelectedLocationId(fallbackLocationId);
    }
  }, [storeLocations, selectedLocationId, primaryLocationId]);

  const fnbProductDetailActions = useFnbProductDetailActions({
    addToCart,
    editingCartLineId: editingFnbCartLine?.cart_line_id || '',
    goStoreOrderPage,
    item: detailPageFnbItem,
    modifierGroups: detailPageFnbModifierGroups,
    onEditComplete: handleFnbCartLineEdited,
    quantity: selectedFnbDetailQuantity,
    replaceCartLine,
    selectedModifiers: selectedFnbLineModifiers,
    toast
  });
  const fnbProductDetailsReviewProps = useFnbProductDetailsReviewProps({
    customerName,
    isFnbMode,
    itemReviewCards,
    itemReviewInviteContext,
    itemReviewSectionHighlighted,
    itemReviewSummary,
    itemReviewsLoading,
    savedCustomerName: savedCustomerDetails?.name,
    setIsReviewModalOpen,
    setReviewDraft,
    syncFnbItemReviewSectionIntoView
  });
  const fnbProductDetailsRouteProps = useFnbProductDetailsRouteProps({
    actions: fnbProductDetailActions,
    detailRuntime: fnbProductDetailsRuntime,
    isItemAvailable,
    isMobileViewport,
    modeAdapter,
    onToggleModifier: toggleFnbDetailModifier,
    onModifierQuantityChange: setFnbDetailModifierQuantity,
    navigation: {
      onBack: closeFnbDetail,
      onSelectRelatedItem: openFnbDetail
    },
    reviewProps: fnbProductDetailsReviewProps,
    selectedLocation,
    selectedStore,
    withAssetOrigin
  });
  const {
    handleServicesCartCheckout,
    openServiceBookingPanel,
    openServiceCartEditor,
    saveServiceBookingDraft,
    syncServiceBookingDraft
  } = useServiceBookingViewModel({
    accessCapabilities,
    bookingPermitted,
    cart,
    createStorefrontIdempotencyKey,
    getGoStoreBookingPage: () => goStoreBookingPage,
    hasMixedServiceCart,
    hasServiceCart,
    isServicesMode,
    missingRequiredSelectedServiceIntake,
    selectedServiceCartLineId,
    selectedServiceDetail,
    selectedServiceIntakeFields,
    serviceAppointmentAt,
    serviceCartLines,
    serviceDraftNotes,
    serviceDraftQuantity,
    serviceIntakeResponses,
    serviceRequiresSchedule: getServicesLocalFlowDefinition(serviceOrderMethod).requiresSchedule,
    servicePaymentOptions,
    servicePaymentTiming,
    setCart,
    setCheckoutError,
    setCheckoutTab,
    setIsCheckoutOpen,
    setQuoteError,
    setQuoteNeedsRefresh,
    setQuoteResult,
    setSelectedServiceCartLineId,
    setSelectedServiceDetail,
    setServiceAppointmentAt,
    setServiceDraftNotes,
    setServiceDraftQuantity,
    setServiceIntakeResponses,
    setServicePaymentTiming,
    storefrontClosedByHours,
    storefrontClosedMessageBody,
    storefrontClosedToastMessage,
    toast,
    withAssetOrigin
  });
  const serviceBookingReviewProps = useServiceBookingReviewProps({
    cartImageErrors,
    cartTotal,
    firstServiceLine,
    isDesktopCheckout,
    isMobileViewport,
    money,
    openServiceCartEditor,
    removeCartItem,
    serviceBookingSummarySchedule,
    serviceIntakeFields,
    serviceIntakeResponses,
    servicePaymentOptions,
    servicePaymentTiming,
    servicesPrimary,
    servicesPrimaryDark,
    setCartImageErrors,
    setCheckoutTab,
    withAssetOrigin
  });
  const {
    buildCustomerDashboardReturnUrl,
    openBusinessRegistrationFlow,
    openCanonicalDgfyAuth,
    openCheckoutAuthFlow,
    openCustomerDashboard,
    openStorefrontHeaderAccount
  } = useCustomerAuthNavigation({
    activeServiceCartLine,
    buildBusinessRegistrationUrl,
    buildDgfyAuthUrl,
    cart,
    checkoutTab,
    customerAddress,
    customerPin,
    deliveryLocationAction,
    dgfyAuthToken,
    firstServiceLine,
    fnbOrderStep,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    hasDgfyExplicitSignOut,
    isDgfyCustomerSignedIn,
    normalizeStorefrontErrorMessage,
    orderMethod,
    readDgfySignedOutEmail,
    requestJson,
    resolveStorefrontAccountUrl,
    resolvedDeliveryAddress,
    routeSlug,
    selectedLocationId,
    selectedSavedLocationId,
    selectedServiceDetail,
    selectedStore,
    serviceAppointmentAt,
    serviceBookingStep,
    serviceIntakeResponses,
    serviceLocationLandmarkNote,
    servicePaymentTiming,
    setIsCheckoutOpen,
    setIsGuestTrackingDrawerOpen,
    simpleOrderStep,
    toast,
    writeCheckoutAuthResumeDraft
  });
  const {
    guestCheckoutIntentId,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    guestCheckoutProof,
    handleGuestCheckoutOtpCodeChange,
    handleRequestGuestCheckoutOtp,
    handleVerifyGuestCheckoutOtp,
    isGuestCheckoutOtpCooldownActive,
  } = useGuestCheckoutOtp({
    customerEmail,
    isDgfyCustomerSignedIn,
    requestJson,
    selectedStore,
    toast,
  });
  const handleApplyGuestDetailsAndRequestOtp = useCallback(() => {
    handleApplyGuestDetails();
    // The session identity is ready to review before OTP verification.
    setGuestDetailsEditMode(false);
    handleRequestGuestCheckoutOtp();
  }, [handleApplyGuestDetails, handleRequestGuestCheckoutOtp]);
  const serviceAccountStepComplete = accountStepComplete
    && (isDgfyCustomerSignedIn || guestCheckoutOtpVerified);
  const {
    buildPayload: checkoutPayload,
    handlePromoCardApply,
    handleVoucherCardApply,
    requestQuote,
  } = useFnbCheckoutQuote({
    accessCapabilities,
    cart,
    cartSignature,
    checkoutPermitted,
    checkoutPromoCode,
    checkoutVoucherCode,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryAddress: resolvedDeliveryAddress || customerAddress || buildPinnedDeliveryAddress(customerPin),
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    isDeliveryOrder,
    isDgfyCustomerSignedIn,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
    orderMethod,
    readDgfyAuthToken,
    readStoreAuthToken,
    requestJson,
    selectedLocationId,
    selectedStore,
    setCheckoutPromoCode,
    setCheckoutVoucherCode,
    setQuoteError,
    setQuotedCartSignature,
    setQuoteNeedsRefresh,
    setQuoteResult,
    storefrontClosedByHours,
    storefrontHoursLabel,
    toast,
    buildStockExceededMessage,
    extractStockViolation,
  });
  const handleFnbCheckout = useFnbCheckoutSubmission({
    buildPayload: checkoutPayload,
    buildStockExceededMessage,
    cart,
    checkoutBlockReason,
    clearCheckoutAuthResumeDraft,
    customerEmail,
    customerName,
    customerPhone,
    extractStockViolation,
    fnbPaymentType,
    goStoreTrackPage,
    guestCheckoutIntentId,
    guestCheckoutOtpVerified,
    guestCheckoutProof,
    handleLoadAccountPanel,
    isDgfyCustomerSignedIn,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
    orderMethod,
    orderSuccessAnimationTimerRef,
    qrphIdempotencyKey,
    qrphPaymentSession,
    readDgfyAuthToken,
    readStoreAuthToken,
    rememberCustomerDetails,
    requestJson,
    requireQuoteForCheckout,
    resolvedCustomerFirstName,
    resolvedCustomerLastName,
    selectedStore,
    setCart,
    setCheckoutError,
    setCheckoutLoading,
    setCheckoutPromoCode,
    setCheckoutResult,
    setFnbOrderStep,
    setQuoteNeedsRefresh,
    setQuoteResult,
    setQrphPaymentSession,
    setSavedCustomerDetails,
    setSelectedTrackingPin,
    setShowOrderSuccessAnimation,
    setTrackingPinInput,
    storefrontClosedMessageBody,
    storefrontClosedToastMessage,
    syncTrackedOrderSnapshot,
    toast,
    totalsForDisplay,
    writeSavedCustomerDetails,
  });
  const handleRefreshQrphPaymentSession = useCallback(async ({ silent = false } = {}) => {
    const paymentSessionId = String(qrphPaymentSession?.payment_session_id || '').trim();
    if (!paymentSessionId || !selectedStore?.slug || qrphPaymentStatusLoading) return;

    setQrphPaymentStatusLoading(true);
    if (!silent) setCheckoutError('');
    try {
      const data = await requestJson(
        `/api/v1/store/checkout/payment-sessions/${encodeURIComponent(paymentSessionId)}`,
        {
          storeSlug: selectedStore.slug,
          authToken: isDgfyCustomerSignedIn
            ? (readDgfyAuthToken() || readStoreAuthToken())
            : readStoreAuthToken(),
          cache: 'no-store'
        }
      );
      const paymentSession = data?.payment_session || null;
      setQrphPaymentSession(paymentSession);

      if (paymentSession?.status === 'finalized' && paymentSession?.tracking_pin) {
        const trackingPin = String(paymentSession.tracking_pin).trim().toUpperCase();
        setTrackingPinInput(trackingPin);
        setSelectedTrackingPin(trackingPin);
        syncTrackedOrderSnapshot({
          tracking_pin: trackingPin,
          status: 'placed',
          status_label: 'Order placed',
          order_method: orderMethod,
          order: null,
          order_name: cart[0]?.name || '',
          // Phase 142 (#823): prefer the finalized session's own order_total_amount (the full
          // order value, widened onto serializePaymentSession alongside this poll's data) over
          // the client's pre-payment quote snapshot -- more authoritative, and never the
          // captured (downpayment) amount for a downpayment session, where paymentSession.total_amount
          // means something else entirely (see storefrontDownpaymentPresentation.js). Null for a
          // full_payment session, so the quote-based fallback still applies there unchanged.
          total_amount: paymentSession.order_total_amount ?? totalsForDisplay?.total_amount ?? 0
        }, trackingPin);
        setCart([]);
        setQuoteResult(null);
        setQuoteNeedsRefresh(true);
        setCheckoutPromoCode('');
        resetQrphPaymentSession();
        goStoreTrackPage({ pin: trackingPin });
        toast.success('Payment confirmed. Your order has been placed.');
        return;
      }

      if (paymentSession?.status === 'paid') {
        if (!silent) toast.success('Payment received. Your order is being finalized.');
      } else if (paymentSession?.status === 'paid_manual_resolution_required') {
        const message = paymentSession?.failure_reason || 'Payment was received but requires review before the order can be completed.';
        setCheckoutError(message);
        if (!silent) toast.error(message);
      } else if (['failed', 'expired', 'cancelled'].includes(paymentSession?.status)) {
        const message = paymentSession?.failure_reason || 'This online payment can no longer be completed.';
        setCheckoutError(message);
        if (!silent) toast.error(message);
      } else if (!silent) {
        toast.info('Payment is still awaiting confirmation.');
      }
    } catch (error) {
      const message = normalizeStorefrontErrorMessage(error, 'Unable to refresh PayMongo payment status.');
      if (!silent) {
        setCheckoutError(message);
        toast.error(message);
      }
    } finally {
      setQrphPaymentStatusLoading(false);
    }
  }, [
    cart,
    goStoreTrackPage,
    isDgfyCustomerSignedIn,
    normalizeStorefrontErrorMessage,
    orderMethod,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    readDgfyAuthToken,
    readStoreAuthToken,
    requestJson,
    resetQrphPaymentSession,
    selectedStore,
    setCart,
    setCheckoutError,
    setCheckoutPromoCode,
    setQrphPaymentSession,
    setQrphPaymentStatusLoading,
    setQuoteNeedsRefresh,
    setQuoteResult,
    setSelectedTrackingPin,
    setTrackingPinInput,
    syncTrackedOrderSnapshot,
    toast,
    totalsForDisplay
  ]);
  const handleConfirmQrphTestPayment = useCallback(async () => {
    const paymentSessionId = String(qrphPaymentSession?.payment_session_id || '').trim();
    if (!paymentSessionId || !selectedStore?.slug) return;

    setCheckoutError('');
    try {
      await requestJson(
        `/api/v1/store/checkout/payment-sessions/${encodeURIComponent(paymentSessionId)}/confirm-test`,
        {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken: isDgfyCustomerSignedIn
            ? (readDgfyAuthToken() || readStoreAuthToken())
            : readStoreAuthToken(),
          body: {},
          cache: 'no-store'
        }
      );
      toast.success('PayMongo test payment approved. Waiting for webhook confirmation.');
    } catch (error) {
      const message = normalizeStorefrontErrorMessage(error, 'Unable to confirm the PayMongo test payment.');
      setCheckoutError(message);
      toast.error(message);
      throw error;
    }
  }, [
    isDgfyCustomerSignedIn,
    normalizeStorefrontErrorMessage,
    qrphPaymentSession,
    readDgfyAuthToken,
    readStoreAuthToken,
    requestJson,
    selectedStore,
    setCheckoutError,
    toast
  ]);
  useEffect(() => {
    if (!['awaiting_payment', 'paid'].includes(qrphPaymentSession?.status)) return undefined;
    const pollPaymentStatus = () => {
      if (isDocumentVisibleAndOnline()) {
        handleRefreshQrphPaymentSession({ silent: true });
      }
    };
    pollPaymentStatus();
    const timer = window.setInterval(pollPaymentStatus, QRPH_PAYMENT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [handleRefreshQrphPaymentSession, qrphPaymentSession?.status]);
  const {
    activePinnedDeliveryAddress,
    applySavedDeliveryLocation,
    canAddPinnedLocation,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    handleAddPinnedLocation,
    handleRemoveDeliveryAddress,
    handleSetDefaultDeliveryAddress,
    hasPinnedDeliveryLocation,
    refreshDgfyCheckoutAddresses
  } = useSignedInCheckoutAddresses({
    accountAddresses: accountPanel.addresses,
    authToken: dgfyAuthToken,
    customerAddress,
    customerPin,
    deliveryLocationAction,
    isDeliveryOrder,
    isFnbMode,
    isSignedIn: isDgfyCustomerSignedIn,
    landmarkNote: serviceLocationLandmarkNote,
    refreshAccountAddresses,
    requestJson,
    resolvedDeliveryAddress,
    savedPinnedLocations,
    selectedSavedLocationId,
    setCustomerAddress,
    setCustomerPin,
    setDeliveryLocationAction,
    setPinLocationError,
    setResolvedDeliveryAddress,
    setSavedPinnedLocations,
    setSelectedSavedLocationId,
    toast,
    trimAddressCountrySuffix,
    normalizeErrorMessage: normalizeStorefrontErrorMessage
  });

  const { activeServiceLocationSummary, handlePinMyLocation } = useDeliveryPinResolution({
    customerAddress,
    customerPin,
    deliveryLocationDisplayAddress,
    hasPinnedDeliveryLocation,
    isDeliveryOrder,
    resolvedDeliveryAddress,
    setCustomerAddress,
    setCustomerPin,
    setDeliveryLocationAction,
    setPinLocationError,
    setPinLocationLoading,
    setResolvedDeliveryAddress,
    setResolvingPinnedDeliveryAddress,
    setSelectedSavedLocationId
  });

  const {
    renderPromoCodePanel
  } = useFnbCheckoutPromoRenderers({
    appliedPromoDiscountText,
    appliedVoucherDiscountText,
    checkoutPromoCode,
    checkoutVoucherCode,
    handlePromoCardApply,
    handleVoucherCardApply,
    promoSectionModel,
    promoStatusMessage,
    promoStatusTone,
    voucherStatusMessage,
    voucherStatusTone,
    servicesBodyFont,
    setCheckoutPromoCode,
    setCheckoutVoucherCode
  });

  const serviceCartDrawerProps = useServiceCartDrawerProps({
    cartButtonRef: serviceCartFabRef,
    cartImageErrors,
    handleServicesCartCheckout,
    hasMixedServiceCart,
    hasServiceCart,
    isCheckoutOpen,
    isMobileViewport,
    money,
    openServiceCartEditor,
    productCartLines,
    renderPromoCodePanel,
    removeCartItem,
    serviceCartCount,
    serviceCartLines,
    serviceCartTotal,
    servicesDisplayFont,
    servicesPrimary,
    servicesPrimaryDark,
    servicesPrimarySoft,
    servicesPrimaryBorder,
    servicesPrimaryShadow,
    servicesPrimaryShadowStrong,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    withAssetOrigin
  });

  const copyTextToClipboard = useCallback((value, successMessage = 'Copied.') => (
    copyTextToClipboardUtil(toast, value, successMessage)
  ), []);

  const {
    handleCheckout,
    handleDownloadCheckoutImage,
    handleQuote
  } = useCheckoutSubmission({
    accessCapabilities,
    activeBookingService,
    activeServiceCartLine,
    bookingFieldPlan,
    bookingPageIntakeFields,
    bookingPageMissingRequiredIntake,
    buildStockExceededMessage,
    buildTicketImage,
    cart,
    checkoutBlockReason,
    checkoutPayload,
    checkoutPermitted,
    checkoutResult,
    clearCheckoutAuthResumeDraft,
    createStorefrontIdempotencyKey,
    customerAddress,
    customerEmail,
    customerName,
    customerPhone,
    DGFY_BRAND_NAME,
    downloadDataUrl,
    extractStockViolation,
    fnbPaymentType,
    formatServicesBookingFailureMessage,
    goStoreTrackPage,
    guestCheckoutIntentId,
    guestCheckoutOtpVerified,
    guestCheckoutProof,
    handleFnbCheckout,
    handleLoadAccountPanel,
    hasServiceCart,
    isDgfyCustomerSignedIn,
    isFnbMode,
    isRetailMode,
    isServicesMode,
    isSimpleMode,
    missingCustomerInformation,
    missingScheduleAndServiceInfo,
    normalizeStorefrontErrorMessage,
    orderMethod,
    orderSuccessAnimationTimerRef,
    productCartLines,
    qrphIdempotencyKey,
    qrphPaymentSession,
    readDgfyAuthToken,
    readStoreAuthToken,
    rememberCustomerDetails,
    requestJson,
    requestQuote,
    requireQuoteForCheckout,
    resolveServicesBookingSubmitContract,
    resolvedCustomerFirstName,
    resolvedCustomerLastName,
    routeSlug,
    selectedLocationId,
    selectedStore,
    serviceOrderMethod,
    servicesLocalSimulationEnabled: SERVICES_LOCAL_SIMULATION_ENABLED,
    isServicesLocalSimulationMethod,
    createServicesLocalSimulation,
    serviceAppointmentAt,
    serviceCartLines,
    serviceCartValidationIssues,
    serviceDraftQuantity,
    servicePaymentTiming,
    serviceIntakeResponses,
    setCart,
    setCheckoutError,
    setCheckoutLoading,
    setCheckoutPromoCode,
    setCheckoutResult,
    setCheckoutTab,
    setFnbOrderStep,
    setQuoteError,
    setQuoteNeedsRefresh,
    setQuoteResult,
    setQrphPaymentSession,
    setSavedCustomerDetails,
    setSelectedServiceCartLineId,
    setSelectedTrackingPin,
    setServiceAppointmentAt,
    setServiceDraftNotes,
    setServiceDraftQuantity,
    setServiceIntakeResponses,
    setServicePaymentPreviewCard,
    setServicePaymentPreviewMethod,
    setServicePaymentPreviewReceiptName,
    setShowOrderSuccessAnimation,
    setSimpleOrderStep,
    setTrackingPinInput,
    storefrontClosedByHours,
    storefrontClosedMessageBody,
    storefrontClosedToastMessage,
    syncTrackedOrderSnapshot,
    toast,
    totalsForDisplay,
    withAssetOrigin,
    writeLastTrackingPinForStore,
    writeSavedCustomerDetails
  });

  useEffect(() => {
    const routeWantsTrack = routeSubpage === STORE_TRACK_SUBPAGE || currentPathSubpage === STORE_TRACK_SUBPAGE;
    if (!routeWantsTrack || !isFnbMode || !canOpenTrackingDrawer || trackingResult) return;
    if (isDgfyCustomerSignedIn) {
      void handleLoadAccountPanel();
    }
    setIsCheckoutOpen(false);
    setIsGuestTrackingDrawerOpen(true);
    if (!selectedTrackingPin) {
      setCheckoutTab('checkout');
    }
  }, [canOpenTrackingDrawer, currentPathSubpage, isDgfyCustomerSignedIn, isFnbMode, routeSubpage, selectedTrackingPin, trackingResult]);
  useCheckoutAuthResumeRestore({
    catalog,
    clearCheckoutAuthResumeDraft,
    hasAppliedCheckoutAuthResume,
    isDgfyCustomerSignedIn,
    readCheckoutAuthResumeDraft,
    routeSlug,
    selectedStore,
    setCart,
    setCheckoutTab,
    setCustomerAddress,
    setCustomerPin,
    setDeliveryLocationAction,
    setFnbOrderStep,
    setFnbScheduleMode,
    setFnbScheduledFor,
    setFnbSpecialInstructions,
    setHasAppliedCheckoutAuthResume,
    setIsCheckoutOpen,
    setOrderMethod,
    setResolvedDeliveryAddress,
    setSelectedLocationId,
    setSelectedSavedLocationId,
    setSelectedServiceDetail,
    setServiceAppointmentAt,
    setServiceBookingStep,
    setServiceIntakeResponses,
    setServiceLocationLandmarkNote,
    setServicePaymentTiming,
    setSimpleOrderStep,
    toSlug,
    toast
  });
  const {
    activeFnbOrderStepMeta,
    dgfyIceBlue,
    dgfyIceBlueBorder,
    dgfyProgressComplete,
    fnbCheckoutContentPadding,
    fnbCustomerStepComplete: fnbCustomerIdentityStepComplete,
    fnbFulfillmentStepComplete,
    fnbMobileSummaryItemCountLabel,
    fnbOrderBrand,
    fnbOrderBrandBorder,
    fnbOrderBrandDark,
    fnbOrderBrandShadow,
    fnbOrderBrandShadowStrong,
    fnbOrderBrandSoft,
    fnbOrderBrandTint,
    fnbOrderMobileActionButtonHeight,
    fnbOrderMobileOptionHeight,
    fnbOrderMobileOptionIconBox,
    fnbOrderMobileOptionTextSize,
    fnbOrderMutedBlueText,
    fnbOrderStepRenderKey,
    fnbOrderTextOnBrand,
    fnbScheduleSummaryLabel,
    fnbSummaryFeeAndTaxes,
    isFnbOrderHandset,
    isFnbOrderResponsiveFlow,
    setShowFnbMobileOrderSummary,
    showFnbMobileOrderSummary,
  } = useFnbCheckoutPresentation({
    activePinnedDeliveryAddress,
    cartCount,
    checkoutResult,
    customerEmail,
    customerName,
    customerPhone,
    fnbOrderStep,
    fnbScheduleMode,
    fnbScheduledFor,
    hasPinnedDeliveryLocation,
    isDeliveryOrder,
    isDesktopCheckout,
    isFnbMode,
    isFnbOrderSubpage,
    totalsForDisplay,
    viewportWidth,
  });
  const {
    openServiceDetail,
    closeServiceDetail,
    goStore,
    goStoreBookingPage,
    goStoreCatalogPage,
    goDiscovery
  } = useStorefrontNavigation({
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
    setCheckoutTab,
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
  });
  const fnbCartDrawerRouteProps = useFnbCartDrawerRouteProps({
    cart,
    cartAddOnsTotal,
    cartCount,
    cartImageErrors,
    cartSubtotal,
    cartTotal,
    voucherDiscountAmount: totalsForDisplay.voucher_discount_amount,
    isQuoteStale,
    promoDiscountAmount: totalsForDisplay.discount_amount,
    promoDiscountLabel: totalsForDisplay.discount_label,
    checkoutTab,
    fnbOrderBrand,
    getLineTotal,
    goStoreCatalogPage,
    goStoreOrderPage,
    isDesktopCheckout,
    isFnbMode,
    isFnbOrderSubpage,
    isCheckoutOpen,
    isMobileViewport,
    money,
    onEditCartLine: handleEditFnbCartLine,
    removeCartItem,
    renderPromoCodePanel,
    servicesBodyFont,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    withAssetOrigin
  });
  const simpleCartDrawerProps = useSimpleCartDrawerProps({
    activeOrderMethodLabel,
    cart,
    cartCount,
    cartImageErrors,
    cartSubtotal,
    cartTotal,
    voucherDiscountAmount: totalsForDisplay.voucher_discount_amount,
    isQuoteStale,
    promoDiscountAmount: totalsForDisplay.discount_amount,
    promoDiscountLabel: totalsForDisplay.discount_label,
    goStoreCatalogPage,
    goStoreOrderPage,
    isCheckoutOpen,
    isMobileViewport,
    money,
    removeCartItem,
    renderPromoCodePanel,
    serviceCartFabRef,
    servicesBodyFont,
    servicesPrimary,
    servicesPrimaryDark,
    servicesPrimaryShadowStrong,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    withAssetOrigin
  });
  const defaultProductCartDrawerProps = useDefaultProductCartDrawerProps({
    activeOrderMethodLabel,
    cart,
    cartCount,
    cartImageErrors,
    cartSubtotal,
    cartTotal,
    voucherDiscountAmount: totalsForDisplay.voucher_discount_amount,
    isQuoteStale,
    promoDiscountAmount: totalsForDisplay.discount_amount,
    promoDiscountLabel: totalsForDisplay.discount_label,
    goStoreCatalogPage,
    goStoreOrderPage,
    isCheckoutOpen,
    isMobileViewport,
    isRetailMode,
    money,
    removeCartItem,
    renderPromoCodePanel,
    serviceCartFabRef,
    servicesBodyFont,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    withAssetOrigin
  });
  const defaultOrderRouteProps = useDefaultOrderPageProps({
    cart,
    cartCount,
    isMobileViewport,
    money,
    selectedStore,
    servicesBodyFont,
    servicesDisplayFont,
    goStoreCatalogPage,
    withAssetOrigin
  });
  const retailOrderRouteProps = useRetailOrderPageProps({
    canAddPinnedLocation,
    canUseGuestCheckoutFlow,
    cart,
    cartCount,
    cartImageErrors,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryLocationAction,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    handleAddPinnedLocation,
    handleApplyGuestDetailsAndRequestOtp,
    handleGuestCheckoutOtpCodeChange,
    handlePinMyLocation,
    handleRequestGuestCheckoutOtp,
    handleVerifyGuestCheckoutOtp,
    applySavedDeliveryLocation,
    isDesktopCheckout,
    isDgfyCustomerSignedIn,
    isGuestCheckoutOtpCooldownActive,
    isMobileViewport,
    money,
    orderMethod,
    promoDiscountSummaryRow,
    voucherDiscountSummaryRow,
    pinLocationError,
    pinLocationLoading,
    renderAccountOwnedIdentitySummary,
    renderGuestCheckoutEntry,
    renderGuestIdentityFields,
    renderPromoCodePanel,
    renderStorefrontClosedNotice,
    selectedStore,
    selectedSavedLocationId,
    servicesBodyFont,
    servicesDisplayFont,
    setCustomerPin,
    setDeliveryLocationAction,
    setOrderMethod,
    setPinLocationError,
    setResolvedDeliveryAddress,
    setSelectedSavedLocationId,
    setShowExpandedDeliveryMap,
    showExpandedDeliveryMap,
    storefrontClosedByHours,
    totalsForDisplay,
    goStoreCatalogPage,
    setCartImageErrors,
    withAssetOrigin,
    handleCheckout,
    checkoutLoading,
    checkoutError,
    fnbPaymentType,
    handlePaymentTypeChange,
    handleConfirmQrphTestPayment,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    resetQrphPaymentSession
  });
  const isFnbCartDrawerSurfaceOpen = Boolean(fnbCartDrawerRouteProps.isActive);
  const fnbCustomerStepComplete = fnbCustomerIdentityStepComplete && guestCheckoutOtpVerified;
  const fnbCheckoutRouteProps = useFnbCheckoutRouteProps({
    activeFnbOrderStepMeta,
    applySavedDeliveryLocation,
    canAddPinnedLocation,
    canUseGuestCheckoutFlow,
    cart,
    cartCount,
    cartImageErrors,
    checkoutAllowed,
    checkoutError,
    checkoutLoading,
    checkoutResult,
    checkoutTab,
    customerPin,
    deliveryLocationAction,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    dgfyIceBlue,
    dgfyIceBlueBorder,
    dgfyProgressComplete,
    fnbCheckoutContentPadding,
    fnbCustomerStepComplete,
    fnbFulfillmentStepComplete,
    fnbMobileSummaryItemCountLabel,
    fnbOrderBrand,
    fnbOrderBrandBorder,
    fnbOrderBrandDark,
    fnbOrderBrandShadow,
    fnbOrderBrandShadowStrong,
    fnbOrderBrandSoft,
    fnbOrderBrandTint,
    fnbOrderMobileOptionHeight,
    fnbOrderMobileOptionIconBox,
    fnbOrderMobileOptionTextSize,
    fnbOrderMutedBlueText,
    fnbOrderStep,
    fnbOrderStepRenderKey,
    fnbOrderTextOnBrand,
    fnbPaymentType,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbScheduleSummaryLabel,
    fnbSpecialInstructions,
    fnbSummaryFeeAndTaxes,
    goStoreCatalogPage,
    goStoreTrackPage,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    handleAddPinnedLocation,
    handleApplyGuestDetailsAndRequestOtp,
    handleCheckout,
    handleDownloadCheckoutImage,
    handleGuestCheckoutOtpCodeChange,
    handlePaymentTypeChange,
    handleConfirmQrphTestPayment,
    handlePinMyLocation,
    handleRemoveDeliveryAddress,
    handleRequestGuestCheckoutOtp,
    handleSetDefaultDeliveryAddress,
    handleVerifyGuestCheckoutOtp,
    isDeliveryOrder,
    isDesktopCheckout,
    isDgfyCustomerSignedIn,
    isFnbMode,
    isFnbOrderResponsiveFlow,
    isFnbOrderSubpage,
    isGuestCheckoutOtpCooldownActive,
    isMobileViewport,
    money,
    orderMethod,
    pinLocationError,
    pinLocationLoading,
    promoDiscountSummaryRow,
    voucherDiscountSummaryRow,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    quoteError,
    renderAccountOwnedIdentitySummary,
    renderGuestCheckoutEntry,
    renderGuestIdentityFields,
    renderPromoCodePanel,
    renderStorefrontClosedNotice,
    resetQrphPaymentSession,
    resolvingPinnedDeliveryAddress,
    selectedSavedLocationId,
    selectedStore,
    servicesBodyFont,
    servicesDisplayFont,
    setCartImageErrors,
    setCheckoutResult,
    setCheckoutTab,
    setCustomerAddress,
    setCustomerPin,
    setDeliveryLocationAction,
    setFnbOrderStep,
    setFnbScheduleMode,
    setFnbScheduledFor,
    setFnbSpecialInstructions,
    setIsCheckoutOpen,
    setOrderMethod,
    setPinLocationError,
    setResolvedDeliveryAddress,
    setSelectedSavedLocationId,
    setSelectedTrackingPin,
    setShowExpandedDeliveryMap,
    setShowFnbMobileOrderSummary,
    setShowMobileAddressModal,
    setTrackingPinInput,
    showExpandedDeliveryMap,
    showFnbMobileOrderSummary,
    showMobileAddressModal,
    storefrontClosedByHours,
    totalsForDisplay,
    withAssetOrigin
  });
  useEffect(() => {
    const normalizedPromoCode = String(checkoutPromoCode || '').trim().toUpperCase();
    const normalizedVoucherCode = String(checkoutVoucherCode || '').trim().toUpperCase();
    const shouldAutoSyncFnbQuote = (
      isFnbMode
      && isStorePage
      && !hasServiceCart
      && fnbOrderStep === 4
      && quoteNeedsRefresh
      && Boolean(selectedStore)
      && cart.length > 0
      && checkoutPermitted
      && accessCapabilities.quote !== false
      && !storefrontClosedByHours
      && !hasStockViolation
      && fnbCustomerStepComplete
      && fnbFulfillmentStepComplete
    );

    // #746 (second occurrence): the F&B arm above is gated on `fnbOrderStep === 4` and the two
    // step-complete flags, so it NEVER fires from the cart drawer -- and simple/retail/services had
    // no auto-quote at all. That is why an applied voucher's discount, once invalidated by any cart
    // edit, could never come back: nothing re-quoted from the drawer, in any mode.
    //
    // This arm is mode-agnostic and deliberately requires none of the checkout-step conditions. It
    // fires only when a discount code is actually applied, so a shopper with no code sees exactly
    // the request pattern they did before this change. It also repairs the "apply a code on an empty
    // cart from the catalog toolbar, then add items" path, which previously never quoted at all.
    const hasAppliedDiscountCode = Boolean(normalizedPromoCode || normalizedVoucherCode);
    const shouldAutoSyncDiscountQuote = (
      isStorePage
      && !hasServiceCart
      && hasAppliedDiscountCode
      && Boolean(selectedStore)
      && cart.length > 0
      && checkoutPermitted
      && accessCapabilities.quote !== false
      && !storefrontClosedByHours
      && !hasStockViolation
    );

    // Phase 142 (#823): a downpayment-required store's checkout needs the server-resolved split
    // (payment_mode/downpayment_amount/balance_due_amount) before the customer ever reaches the
    // payment step -- and Simple/Retail never quote at all without a discount code (the gap the
    // discount arm's own comment above documents). Mode-agnostic and structured exactly like that
    // arm, deliberately WITHOUT the F&B arm's quoteNeedsRefresh/step-complete gates -- like the
    // discount arm, re-fire prevention for an unchanged cart comes from the syncKey below, not
    // from quoteNeedsRefresh. Gated purely on the store's catalog-resolved payment_mode, so a
    // full_payment store's request pattern is completely unchanged by this addition.
    const shouldAutoSyncDownpaymentQuote = (
      isStorePage
      && !hasServiceCart
      && selectedStore?.payment_mode === 'downpayment_required'
      && Boolean(selectedStore)
      && cart.length > 0
      && checkoutPermitted
      && accessCapabilities.quote !== false
      && !storefrontClosedByHours
      && !hasStockViolation
    );

    if (!shouldAutoSyncFnbQuote && !shouldAutoSyncDiscountQuote && !shouldAutoSyncDownpaymentQuote) {
      fnbAutoQuoteSyncKeyRef.current = '';
      return undefined;
    }

    const syncKey = [
      selectedStore?.slug || '',
      selectedLocationId || '',
      orderMethod || '',
      fnbScheduleMode || '',
      fnbScheduledFor || '',
      normalizedPromoCode,
      normalizedVoucherCode,
      cartSignature,
      activePinnedDeliveryAddress || ''
    ].join('::');
    if (fnbAutoQuoteSyncKeyRef.current === syncKey) return undefined;

    fnbAutoQuoteSyncKeyRef.current = syncKey;
    let cancelled = false;
    let fired = false;
    setQuoteError('');
    // #746: debounce. Quantity +/- lives inside the cart drawer, so a shopper adjusting an item
    // three times would otherwise send three quotes. The sync-key guard alone can't collapse these
    // -- each tap is a genuinely different cart signature.
    const timer = setTimeout(() => {
      fired = true;
      requestQuote({ promoCodeOverride: normalizedPromoCode, voucherCodeOverride: normalizedVoucherCode, silent: true }).catch((error) => {
        if (cancelled) return;
        fnbAutoQuoteSyncKeyRef.current = '';
        const violation = extractStockViolation(error);
        if (violation) {
          setQuoteError(buildStockExceededMessage(violation));
          return;
        }
        setQuoteError(normalizeStorefrontErrorMessage(error, 'Unable to update order totals.'));
      });
    }, AUTO_QUOTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Superseded before the request went out -- release the key so the next cart state is allowed
      // to quote. Leaving it set would silently suppress the quote for a cart that never got one.
      if (!fired) fnbAutoQuoteSyncKeyRef.current = '';
    };
  }, [
    accessCapabilities.quote,
    activePinnedDeliveryAddress,
    buildStockExceededMessage,
    cart.length,
    checkoutPermitted,
    checkoutPromoCode,
    checkoutVoucherCode,
    extractStockViolation,
    cartSignature,
    fnbCustomerStepComplete,
    fnbFulfillmentStepComplete,
    fnbOrderStep,
    fnbScheduleMode,
    fnbScheduledFor,
    hasServiceCart,
    hasStockViolation,
    isFnbMode,
    isStorePage,
    normalizeStorefrontErrorMessage,
    orderMethod,
    quoteNeedsRefresh,
    requestQuote,
    selectedLocationId,
    selectedStore,
    setQuoteError,
    storefrontClosedByHours,
  ]);
  const {
    simpleCheckoutAllowed,
    simpleCustomerStepComplete,
    simpleHasCustomerIdentity,
    simpleHasPrimaryIdentityContact,
    simpleStepOneReady
  } = useSimpleCheckoutGating({
    cart,
    checkoutAllowed,
    customerAddress,
    customerEmail,
    customerName,
    customerPhone,
    fnbScheduleMode,
    fnbScheduledFor,
    guestCheckoutOtpVerified,
    isDeliveryOrder
  });
  const simpleCheckoutRouteProps = useSimpleCheckoutRouteProps({
    applySavedDeliveryLocation,
    canAddPinnedLocation,
    canUseGuestCheckoutFlow,
    cart,
    cartCount,
    cartImageErrors,
    checkoutError,
    checkoutLoading,
    checkoutResult,
    customerAddress,
    customerPin,
    deliveryLocationAction,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    DropdownComponent: StorefrontDropdown,
    fnbPaymentType,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownActive: isGuestCheckoutOtpCooldownActive,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    goStoreCatalogPage,
    handleAddPinnedLocation,
    handleApplyGuestDetailsAndRequestOtp,
    handleCheckout,
    handleDownloadCheckoutImage,
    handleGuestCheckoutOtpCodeChange,
    handlePaymentTypeChange,
    handleConfirmQrphTestPayment,
    handlePinMyLocation,
    handleRequestGuestCheckoutOtp,
    handleVerifyGuestCheckoutOtp,
    handleRemoveDeliveryAddress,
    handleSetDefaultDeliveryAddress,
    isDeliveryOrder,
    isDesktopCheckout,
    isDgfyCustomerSignedIn,
    isGuestCheckoutOtpCooldownActive,
    isMobileViewport,
    money,
    orderMethod,
    pinLocationError,
    pinLocationLoading,
    promoDiscountSummaryRow,
    voucherDiscountSummaryRow,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    renderAccountOwnedIdentitySummary,
    renderGuestCheckoutEntry,
    renderGuestIdentityFields,
    renderPromoCodePanel,
    renderStorefrontClosedNotice,
    selectedLocation,
    selectedLocationId,
    selectedSavedLocationId,
    selectedStore,
    servicesBodyFont,
    servicesDisplayFont,
    setCartImageErrors,
    setCheckoutResult,
    setCustomerAddress,
    setCustomerPin,
    setDeliveryLocationAction,
    setFnbScheduledFor,
    setFnbScheduleMode,
    setFnbSpecialInstructions,
    setOrderMethod,
    setPinLocationError,
    setResolvedDeliveryAddress,
    setSelectedLocationId,
    setSelectedSavedLocationId,
    setShowExpandedDeliveryMap,
    setSimpleOrderStep,
    showExpandedDeliveryMap,
    simpleCheckoutAllowed: simpleCheckoutAllowed && (isDgfyCustomerSignedIn || guestCheckoutOtpVerified),
    simpleCustomerStepComplete: simpleCustomerStepComplete && (isDgfyCustomerSignedIn || guestCheckoutOtpVerified),
    simpleHasCustomerIdentity,
    simpleHasPrimaryIdentityContact,
    setShowSimpleMobileAddressModal,
    setShowSimpleMobileOrderSummary,
    resetQrphPaymentSession,
    showSimpleMobileAddressModal,
    showSimpleMobileOrderSummary,
    simpleOrderMethodOptions,
    simpleOrderStep,
    simpleStepOneReady,
    storefrontClosedByHours,
    storeLocations,
    totalsForDisplay,
    withAssetOrigin
  });
  const {
    discoveryResultsRendererProps,
    isClusterResultsActive
  } = useDiscoveryResultsRoute({
    activeDiscoveryFilterDropdown,
    debouncedDiscoverySearch,
    discoveryAvailabilityFilter,
    discoveryBusinessModeOptions,
    discoveryCategoryFilter,
    discoveryCoords,
    discoveryDistanceFilter,
    discoveryDistanceFilterOptions,
    discoveryFilterToolbarRef,
    discoveryLayout,
    discoveryPinsBySlug,
    discoveryOpenFilter,
    discoveryRatingFilter,
    discoveryResultStores,
    discoveryResultsMapKey,
    discoveryResultsPage,
    discoverySortBy,
    discoverySortLabelByValue,
    discoveryViewportMode,
    filteredDiscoveryStores,
    formatStorefrontHoursLabel,
    getDiscoveryEmptyStateMessage,
    getDiscoveryMarkerKey,
    getPreferredDiscoveryLocationId,
    goStore,
    goStoreOrderForDiscovery,
    handleNearMe,
    hasDiscoverySearch,
    highlightedDiscoveryMarkerKey,
    highlightedStoreSlug,
    isBrandingImageBlocked,
    isDiscoveryMobileViewport,
    isDiscoveryTabletViewport,
    isStoreListVisible,
    loadingStores,
    markBrandingImageError,
    normalizeStorefrontCategories,
    normalizeStorefrontReviewSummary,
    renderDiscoveryResetButton,
    retryLoadStores,
    search,
    searchedDiscoveryMapPins,
    setActiveDiscoveryFilterDropdown,
    setDiscoveryAvailabilityFilter,
    setDiscoveryCategoryFilter,
    setDiscoveryDistanceFilter,
    setDiscoveryOpenFilter,
    setDiscoveryRatingFilter,
    setDiscoveryResultsPage,
    setDiscoverySortBy,
    setFeaturedBaseStores,
    setHasDiscoveryExplorationStarted,
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug,
    setIsMobileResultsCollapsed,
    setIsStoreListVisible,
    setRenderDiscoveryResetButton,
    setShowDiscoveryResetButton,
    setSelectedMapPin,
    setViewMode,
    showDiscoveryResetButton,
    StoresMap,
    storesError,
    storesWithNearestBranch,
    toSlug,
    viewMode,
    withAssetOrigin
  });
  const {
    sources: customerDashboardRouteSources,
    guestAuth: customerDashboardGuestAuthProps
  } = useCustomerDashboardStorefrontBridge({
    accountIdentityInitials,
    accountIdentityName,
    accountIdentityContact,
    accountPanel,
    hasSavedCustomerDetails,
    maskedSavedCustomerPreview,
    activeCustomerOrders,
    activeCustomerOrderCount,
    trackedCustomerActivity,
    customerTrackLoadingReference,
    customerTrackError,
    accountOrderActionReference,
    accountAddressActionId,
    handleLoadAccountPanel,
    handleTrackCustomerReference,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleStorefrontSignOut,
    openBusinessRegistrationFlow,
    requestDgfyBusinessSecurityCode,
    handleAcceptDgfyCompanyInvitation,
    handleRejectDgfyCompanyInvitation,
    handleLeaveDgfyCompany,
    switchDgfyCompanyFromStorefront,
    clearSavedCustomerDetailsForDevice,
    useAccountAddressForCheckout,
    handleSaveAccountAddress,
    handleDeleteAccountAddress,
    handleSetDefaultAccountAddress,
    renderAddressPinEditor,
    openStorefrontFromAccountEntry,
    submitAccountReviewFromDashboard,
    handleOpenBusinessInventory,
    handleOpenBusinessPos,
    getOwnBusinessDayCloseStatus,
    configureOwnBusinessDayClosePin,
    resolveStorefrontMetaForAccountEntry,
    withAssetOrigin,
    savedCustomerDetails,
    applySavedCustomerDetails,
    closeAccountDrawer,
    openCanonicalDgfyAuth
  });
  const {
    standaloneRouteNode: customerDashboardStandaloneRouteNode,
    drawerRouteNode: customerDashboardDrawerRouteNode
  } = useCustomerDashboardRouteOutlet({
    currentPathname,
    currentPathSubpage,
    routeSubpage,
    routeSlug,
    isSignedIn: isDgfyCustomerSignedIn,
    isSessionResolved: isDgfySessionResolved,
    isDrawerOpen: isAccountDrawerOpen,
    isGuestDrawerState: isGuestAccountDrawerState,
    isMobileViewport,
    onCloseDrawer: closeAccountDrawer,
    onCloseCheckout: () => setIsCheckoutOpen(false),
    onCloseGuestTrackingDrawer: () => setIsGuestTrackingDrawerOpen(false),
    onLoadAccountPanel: handleLoadAccountPanel,
    onGoDiscovery: goDiscovery,
    onGoStore: goStore,
    resolveAccountUrl: buildCustomerDashboardReturnUrl,
    sources: customerDashboardRouteSources,
    guestAuth: customerDashboardGuestAuthProps
  });

  const fnbTrackingRouteProps = buildFnbTrackingRouteProps({
    canOpenTrackingDrawer,
    checkoutTab,
    copyTextToClipboard,
    expandedPins: expandedGuestDrawerPins,
    formatTicketDate,
    getCompletedTrackingLabel,
    getTrackingFlowForOrderMethod,
    goStoreCatalogPage,
    goStoreOrderPage,
    isAccountTracking: isDgfyCustomerSignedIn,
    isMobileViewport,
    isOpen: isGuestTrackingDrawerOpen,
    isStandaloneTrackingPage,
    money,
    onClose: () => setIsGuestTrackingDrawerOpen(false),
    onExpandedPinsChange: setExpandedGuestDrawerPins,
    openFnbItemReviewFromInvite,
    openFullTrackingForPin,
    primaryLocationId,
    routeSlug,
    selectedLocationId,
    selectedStore,
    selectedTrackingPin: fnbTrackingRuntime.selectedTrackingPin,
    servicesBodyFont,
    servicesDisplayFont,
    setCheckoutTab,
    showCompletedTrackingCard: fnbTrackingRuntime.showCompletedTrackingCard,
    storeLocations,
    storePath,
    tileTransformRequest,
    tilingServer: TILING_SERVER,
    toSlug,
    trackingDrawerOrders,
    trackingError: fnbTrackingRuntime.trackingError,
    trackingPinInput: fnbTrackingRuntime.trackingPinInput,
    trackingResult: fnbTrackingRuntime.trackingResult,
    withAssetOrigin
  });
  const simpleTrackingRouteProps = buildSimpleTrackingRouteProps({
    checkoutTab,
    copyTextToClipboard,
    formatTicketDate,
    getCompletedTrackingLabel: getSimpleCompletedTrackingLabel,
    getTrackingFlowForOrderMethod: getSimpleTrackingFlowForOrderMethod,
    goStoreCatalogPage,
    isMobileViewport,
    money,
    primaryLocationId,
    routeSlug,
    selectedLocationId,
    selectedStore,
    selectedTrackingPin: simpleTrackingRuntime.selectedTrackingPin,
    servicesBodyFont,
    servicesDisplayFont,
    setCheckoutTab,
    showCompletedTrackingCard: simpleTrackingRuntime.showCompletedTrackingCard,
    storeLocations,
    storePath,
    tileTransformRequest,
    tilingServer: TILING_SERVER,
    toSlug,
    trackingError: simpleTrackingRuntime.trackingError,
    trackingPinInput: simpleTrackingRuntime.trackingPinInput,
    trackingResult: simpleTrackingRuntime.trackingResult,
    withAssetOrigin
  });
  const simpleTrackingDrawerProps = buildSimpleTrackingDrawerProps({
    canOpenTrackingDrawer,
    expandedPins: expandedGuestDrawerPins,
    isAccountTracking: isDgfyCustomerSignedIn,
    isMobileViewport,
    isOpen: isGuestTrackingDrawerOpen,
    isStandaloneTrackingPage,
    money,
    onClose: () => setIsGuestTrackingDrawerOpen(false),
    onExpandedPinsChange: setExpandedGuestDrawerPins,
    openFullTrackingForPin,
    selectedStore,
    trackingDrawerOrders,
    withAssetOrigin
  });
  const retailTrackingRouteProps = buildRetailTrackingRouteProps({
    canOpenTrackingDrawer,
    checkoutTab,
    copyTextToClipboard,
    expandedPins: expandedGuestDrawerPins,
    formatTicketDate,
    getCompletedTrackingLabel: getRetailCompletedTrackingLabel,
    getTrackingFlowForOrderMethod: getRetailTrackingFlowForOrderMethod,
    goStoreCatalogPage,
    goStoreOrderPage,
    isAccountTracking: isDgfyCustomerSignedIn,
    isMobileViewport,
    isOpen: isGuestTrackingDrawerOpen,
    isStandaloneTrackingPage,
    money,
    onClose: () => setIsGuestTrackingDrawerOpen(false),
    onExpandedPinsChange: setExpandedGuestDrawerPins,
    openRetailItemReviewFromInvite: openFnbItemReviewFromInvite,
    openFullTrackingForPin,
    primaryLocationId,
    routeSlug,
    selectedLocationId,
    selectedStore,
    selectedTrackingPin: retailTrackingRuntime.selectedTrackingPin,
    servicesBodyFont,
    servicesDisplayFont,
    setCheckoutTab,
    showCompletedTrackingCard: retailTrackingRuntime.showCompletedTrackingCard,
    storeLocations,
    storePath,
    tileTransformRequest,
    tilingServer: TILING_SERVER,
    toSlug,
    trackingDrawerOrders,
    trackingError: retailTrackingRuntime.trackingError,
    trackingPinInput: retailTrackingRuntime.trackingPinInput,
    trackingResult: retailTrackingRuntime.trackingResult,
    withAssetOrigin
  });
  const servicesTrackingRouteProps = buildServicesTrackingRouteProps({
    accountIdentityInitials,
    accountIdentityName,
    accountIdentityRawEmail,
    advanceServicesLocalTracking,
    catalog,
    copyTextToClipboard,
    formatTicketDate,
    goStoreCatalogPage,
    goStoreTrackPage,
    handleTrack,
    isMobileViewport,
    isTrackingRefreshing,
    money,
    openAccountPanel: openStorefrontHeaderAccount,
    servicesBodyFont,
    servicesDisplayFont,
    servicesPrimary,
    servicesPrimaryBorder,
    servicesPrimaryDark,
    servicesPrimarySoft,
    selectedLocation,
    serviceHandoff: readServiceHandoffForBooking(
      selectedStore?.slug || routeSlug,
      trackingResult?.tracking_pin || trackingPinInput
    ) || serviceOrderMethod,
    selectedStore,
    setTrackingPinInput,
    tileTransformRequest,
    tilingServer: TILING_SERVER,
    trackingError,
    trackingPinInput,
    trackingResult,
    withAssetOrigin
  });
  const storefrontCheckoutSummaryProps = useStorefrontCheckoutSummaryProps({
    accessCapabilities,
    activeOrderMethodLabel,
    cart,
    cartCount,
    cartImageErrors,
    checkoutAllowed,
    checkoutError,
    checkoutLoading,
    checkoutPermitted,
    checkoutResult,
    customerAddress,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    handleCheckout,
    handleDownloadCheckoutImage,
    handlePinMyLocation,
    handleQuote,
    hasMixedServiceCart,
    hasServiceCart,
    hasStockViolation,
    isDeliveryOrder,
    isDesktopCheckout,
    isDgfyCustomerSignedIn,
    isFnbMode,
    money,
    orderMethod,
    pinLocationError,
    pinLocationLoading,
    quoteError,
    quoteNeedsRefresh,
    quoteResult,
    removeCartItem,
    renderGuestCheckoutEntry,
    renderStorefrontClosedNotice,
    selectedLocation,
    selectedLocationId,
    selectedStore,
    serviceAppointmentAt,
    serviceBookingStep,
    serviceIntakeFields,
    serviceIntakeResponses,
    servicePaymentOptions,
    servicePaymentTiming,
    servicesPrimary,
    setCartImageErrors,
    setCustomerAddress,
    setCustomerEmail,
    setCustomerName,
    setCustomerPhone,
    setCustomerPin,
    setOrderMethod,
    setPinLocationError,
    setSelectedLocationId,
    setServiceAppointmentAt,
    setServiceIntakeResponses,
    setServicePaymentTiming,
    storefrontClosedByHours,
    storeLocations,
    totalsForDisplay,
    updateQty,
    withAssetOrigin
  });
  const storefrontCatalogRouteProps = useStorefrontCatalogRouteProps({
    accountStepComplete: serviceAccountStepComplete,
    fulfillmentStepComplete,
    isServicesMode,
    servicesViewModel,
    activeServiceTab,
    fnbCatalogPresentation,
    isFnbMode,
    filteredFnbViewModel,
    filteredCatalog,
    fnbPageSize,
    isSimpleMode,
    isFnbDetailsSubpage,
    fnbProductDetailsRouteProps,
    activeBookingService,
    activeServiceLocationSummary,
    addToCart,
    bookingCalendarDateOptions,
    bookingDateOptions,
    bookingFieldPlan,
    bookingPagePaymentOptions,
    bookingPreferredDateInputRef,
    bookingStepOneAdditionalFields,
    bookingSummaryAmount,
    bookingSummaryQuantity,
    bookingTimeSlotOptions,
    canAddPinnedLocation,
    canUseGuestCheckoutFlow,
    catalog,
    catalogError,
    catalogSearch,
    checkoutError,
    checkoutLoading,
    checkoutPromoCode,
    checkoutVoucherCode,
    setCheckoutVoucherCode,
    handleVoucherCardApply,
    checkoutResult,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryLocationAction,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    applySavedDeliveryLocation,
    getCartFlySourceRect,
    goStoreCatalogPage,
    goStoreTrackPage,
    handleAddPinnedLocation,
    handleCheckout,
    handlePinMyLocation,
    handlePromoCardApply,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    handleApplyGuestDetailsAndRequestOtp,
    handleGuestCheckoutOtpCodeChange,
    handleRequestGuestCheckoutOtp,
    handleVerifyGuestCheckoutOtp,
    hasServiceCart,
    isBookingSubpage,
    isDgfyCustomerSignedIn,
    isGuestCheckoutOtpCooldownActive,
    isMobileViewport,
    isReviewModalOpen,
    isServiceDetailsSubpage,
    isServiceFilterOpen,
    jumpToBookingField,
    loadingCatalog,
    missingCustomerInformation,
    missingScheduleAndServiceInfo,
    missingStepOneAdditionalFields,
    openPreferredBookingDatePicker,
    openServiceCartEditor,
    openServiceDetail,
    pinLocationError,
    pinLocationLoading,
    promoSectionModel,
    refreshStorePageForTenantSetup,
    registerBookingFieldRef,
    renderAccountOwnedIdentitySummary,
    renderGuestCheckoutEntry,
    renderGuestIdentityFields,
    reviewDraft,
    reviewServiceLines,
    routeServiceItemId,
    selectedLocation,
    selectedSavedLocationId,
    selectedServiceCartLineId,
    selectedServiceDatePart,
    selectedServiceDetail,
    selectedServiceTimePart,
    serviceAreaFilter,
    serviceAvailabilityFilter,
    serviceBookingStep,
    serviceBookingSummaryLineItems,
    serviceBookingSummaryRows,
    serviceBookingSummarySchedule,
    serviceBookingSummaryTitle,
    serviceCartLines,
    serviceDraftQuantity,
    serviceDurationFilter,
    serviceHeroModel,
    serviceIntakeResponses,
    groupedServiceLineItems,
    serviceSpecialInstructions,
    setServiceSpecialInstructions,
    serviceLocationLandmarkNote,
    serviceLocationSummaryDraft,
    serviceOrderMethod,
    setServiceOrderMethod,
    serviceScheduleMode,
    setServiceScheduleMode,
    servicePage,
    servicePageSize,
    servicePaymentPreviewCard,
    servicePaymentPreviewMethod,
    servicePaymentPreviewReceiptName,
    servicePaymentTiming,
    serviceSortOption,
    serviceUnitType,
    servicesBodyFont,
    servicesDisplayFont,
    servicesLayoutMode,
    servicesPrimary,
    servicesPrimaryBorder,
    servicesPrimaryDark,
    servicesPrimaryShadow,
    servicesPrimaryShadowStrong,
    servicesPrimarySoft,
    setActiveServiceTab,
    setCatalogSearch,
    setCheckoutResult,
    setCustomerPin,
    setDeliveryLocationAction,
    setIsReviewModalOpen,
    setIsServiceFilterOpen,
    setReviewDraft,
    setSelectedSavedLocationId,
    setServiceAppointmentAt,
    setServiceAreaFilter,
    setServiceAvailabilityFilter,
    setServiceBookingStep,
    setServiceDraftQuantity,
    setServiceDurationFilter,
    setServiceIntakeResponses,
    setServiceLocationLandmarkNote,
    setServicePage,
    setServicePageSize,
    setServicePaymentPreviewCard,
    setServicePaymentPreviewMethod,
    setServicePaymentPreviewReceiptName,
    setServicePaymentTiming,
    setServiceSortOption,
    setServiceUnitType,
    setShowExpandedDeliveryMap,
    showExpandedDeliveryMap,
    stepOneComplete,
    storefrontClosedByHours,
    storefrontClosedMessageBody,
    syncServiceBookingDraft,
    submitFnbItemReview,
    viewportWidth,
    catalogState,
    fnbCategoryDropdownRef,
    fnbCommunityModel,
    fnbMobileCatalogInlinePadding,
    fnbMobileMenuInnerWidth,
    fnbSortOption,
    fnbViewMode,
    hasCatalogSearchQuery,
    isCompactPaginationViewport,
    isDesktopViewport,
    isFnbCategoryDropdownOpen,
    isOrderSubpage,
    isResolvedOrderSubpage,
    isTabletPaginationViewport,
    modeAdapter,
    openFnbDetail,
    reviewSubmitLoading,
    selectedStore,
    setFnbPage,
    setFnbPageSize,
    setFnbSortOption,
    setFnbViewMode,
    setIsFnbCategoryDropdownOpen,
    simpleCheckoutRouteProps,
    simpleStorefrontModel,
    defaultStorefrontModel,
    defaultOrderRouteProps,
    isRetailMode,
    retailOrderRouteProps,
    isTrackSubpage,
    fnbTrackingRouteProps,
    simpleTrackingRouteProps,
    retailTrackingRouteProps
  });
  const storefrontHeroBandProps = useStorefrontHeroBandProps({
    selectedStore,
    withAssetOrigin,
    routeSlug,
    filteredCatalog,
    hasCatalogSearchQuery,
    isServicesMode,
    isBookingSubpage,
    isServiceDetailsSubpage,
    serviceHeroModel,
    isMobileViewport,
    viewportWidth,
    hasMultipleStoreBranches,
    hasSelectedBranchFromMenu,
    selectedLocationId,
    handleBranchMenuSelection,
    storeLocations,
    catalogSearch,
    setCatalogSearch,
    goDiscovery,
    goStore,
    goStoreCatalogPage,
    goStoreOrderPage,
    hasServiceCart,
    goStoreBookingPage,
    cartCount,
    modeAdapter,
    isBrandingImageBlocked,
    markBrandingImageError,
    selectedLocation,
    isAboutExpanded,
    setIsAboutExpanded,
    isServiceGalleryExpanded,
    setIsServiceGalleryExpanded,
    openStorefrontActionLink,
    openTrackPanel,
    openStorefrontHeaderAccount,
    openBusinessRegistrationFlow,
    isStorefrontAccountAuthenticated,
    activeCustomerOrderCount,
    accountIdentityName,
    accountIdentityRawEmail,
    accountIdentityContact,
    accountIdentityInitials,
    followUiEnabledForStore,
    shareEnabledForStore,
    followState,
    handleFollowAction,
    isFnbMode,
    isSimpleMode,
    isRetailMode,
    isOrderSubpage,
    isFnbDetailsSubpage,
    heroSectionModel,
    fnbViewModel,
    setIsCheckoutOpen,
    handleShareAction,
    isResolvedOrderSubpage,
    simpleStorefrontModel,
    setSelectedLocationId,
    isHospitalityMode
  });
  const storefrontCartDrawerShellProps = useStorefrontCartDrawerShellProps({
    selectedStore,
    isFnbMode,
    isServicesMode,
    isMobileViewport,
    isAccountDrawerOpen,
    isServicesCartDrawerMode,
    serviceCartDrawerProps,
    serviceCartFlyAnimations,
    isSimpleCartSurfaceMode,
    simpleCartDrawerProps,
    defaultProductCartDrawerProps,
    serviceCartFabRef,
    isDesktopViewport,
    hasServiceCart,
    isFnbOrderSubpage,
    isFnbDetailsSubpage,
    isBookingSubpage,
    isCheckoutOpen,
    isRetailMode,
    isSimpleMode,
    isResolvedOrderSubpage,
    goStoreBookingPage,
    setIsCheckoutOpen,
    setCheckoutTab,
    servicesPrimary,
    serviceBookingSummaryTitle,
    cartCount,
    serviceBookingSummarySchedule,
    servicePaymentOptions,
    servicePaymentTiming,
    money,
    cartTotal,
    fnbCartDrawerRouteProps,
    isDesktopCheckout,
    isFnbCartDrawerSurfaceOpen,
    servicesDisplayFont,
    routeSlug,
    activeOrderMethodLabel,
    fnbCartStatusLabel,
    goStoreCatalogPage,
    checkoutTab,
    fnbCheckoutRouteProps,
    serviceBookingReviewProps,
    storefrontCheckoutSummaryProps,
    fnbTrackingRouteProps,
    servicesTrackingRouteProps,
    retailTrackingRouteProps,
    simpleTrackingDrawerProps,
    showOrderSuccessAnimation
  });
  if (isStandaloneAccountPage) return customerDashboardStandaloneRouteNode;

  return (
    <main
      data-storefront-mode={isServicesMode ? 'services' : undefined}
      style={{
        '--services-body-font': servicesBodyFont,
        '--services-display-font': servicesDisplayFont,
        fontFamily: isFnbMode ? (modeAdapter.heroTheme?.bodyFont || "'Inter', 'Segoe UI', sans-serif") : (isServicesMode ? servicesBodyFont : STYLES.fonts.body),
        background: isStorePage ? (isFnbMode ? '#fff' : (isServicesMode ? 'radial-gradient(circle at 20% 0%, #ecfeff 0%, #f8fafc 48%, #ffffff 100%)' : (isRetailMode ? 'radial-gradient(circle at 20% 0%, #EEF4FB 0%, #F8FAFC 42%, #EFF4F9 100%)' : (isSimpleMode ? 'radial-gradient(circle at 20% 0%, #FFFDF7 0%, #FFF7E6 42%, #F8FAFC 100%)' : 'radial-gradient(circle at 20% 0%, #fff7ed 0%, #f8fafc 40%, #eef2f7 100%)')))) : '#ffffff',
        minHeight: '100vh',
        color: '#0f172a',
        overflowX: 'clip'
      }}
    >
      <div style={{
        maxWidth: 1320,
        width: '100%',
        boxSizing: 'border-box',
        margin: '0 auto',
        paddingTop: isStorePage && (isServicesMode || isFnbMode || isSimpleMode || isRetailMode || (isResolvedOrderSubpage && !isServicesMode && !isFnbMode && !isSimpleMode)) ? 0 : (isMobileViewport ? 6 : 10),
        paddingRight: isStorePage && (isServicesMode || isFnbMode || isSimpleMode || isRetailMode) ? 0 : (isMobileViewport ? 12 : 20),
        paddingLeft: isStorePage && (isServicesMode || isFnbMode || isSimpleMode || isRetailMode) ? 0 : (isMobileViewport ? 12 : 20),
        paddingBottom: isStorePage ? ((isServicesMode || isFnbMode || isSimpleMode || !hasDiscoverySearch) ? 0 : (isMobileViewport ? 96 : 120)) : 0
      }}>
        {!isStorePage && (
          <>
            <DiscoveryHomePage
              accountIdentityContact={accountIdentityContact}
              accountIdentityInitials={accountIdentityInitials}
              accountIdentityName={accountIdentityName}
              accountIdentityRawEmail={accountIdentityRawEmail}
              activeDiscoveryNavItem={activeDiscoveryNavItem}
              desktopCategoryRailRef={desktopCategoryRailRef}
              dgfyBusinessOwnerPhoto={dgfyBusinessOwnerPhoto}
              dgfyHeaderLogo={dgfyHeaderLogo}
              dgfySymbolLogo={dgfySymbolLogo}
              discoveryCoords={discoveryCoords}
              discoveryInteractiveAreaRef={discoveryInteractiveAreaRef}
              discoveryLayout={discoveryLayout}
              discoveryPinsBySlug={discoveryPinsBySlug}
              discoveryResultsRendererProps={discoveryResultsRendererProps}
              discoveryViewportMode={discoveryViewportMode}
              featuredCarouselRef={featuredCarouselRef}
              featuredCategoryFilter={featuredCategoryFilter}
              featuredCategoryOptions={featuredCategoryOptions}
              featuredCategoryRailRef={featuredCategoryRailRef}
              featuredSectionRef={featuredSectionRef}
              featuredVisibleStores={featuredVisibleStores}
              formatStorefrontHoursLabel={formatStorefrontHoursLabel}
              getDiscoveryMarkerKey={getDiscoveryMarkerKey}
              getPreferredDiscoveryLocationId={getPreferredDiscoveryLocationId}
              goDiscovery={goDiscovery}
              goStore={goStore}
              handleDiscoveryExploreClick={handleDiscoveryExploreClick}
              handleDiscoveryMenuToggle={handleDiscoveryMenuToggle}
              handleDiscoveryNavItemClick={handleDiscoveryNavItemClick}
              handleDiscoverySearch={handleDiscoverySearch}
              handleFeaturedCategoryFilter={handleFeaturedCategoryFilter}
              handleNearMe={handleNearMe}
              handlePopularDiscoveryCategory={handlePopularDiscoveryCategory}
              hasDesktopCategoryOverflow={hasDesktopCategoryOverflow}
              hasDiscoveryExplorationStarted={hasDiscoveryExplorationStarted}
              hasDiscoverySearch={hasDiscoverySearch}
              highlightedDiscoveryMarkerKey={highlightedDiscoveryMarkerKey}
              isBrandingImageBlocked={isBrandingImageBlocked}
              isCategoryRowExpanded={isCategoryRowExpanded}
              isClusterResultsActive={isClusterResultsActive}
              isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
              isDiscoveryMobileViewport={isDiscoveryMobileViewport}
              isDiscoveryNavMenuOpen={isDiscoveryNavMenuOpen}
              isDiscoverySearchFocused={isDiscoverySearchFocused}
              isDiscoveryTabletViewport={isDiscoveryTabletViewport}
              isMobileViewport={isMobileViewport}
              loadStores={loadStores}
              markBrandingImageError={markBrandingImageError}
              mobileCategoryGroupIndex={mobileCategoryGroupIndex}
              mobileCategoryRailRef={mobileCategoryRailRef}
              normalizeStorefrontCategories={normalizeStorefrontCategories}
              normalizeStorefrontReviewSummary={normalizeStorefrontReviewSummary}
              openBusinessRegistrationFlow={openBusinessRegistrationFlow}
              openCanonicalDgfyAuth={openCanonicalDgfyAuth}
              openCustomerDashboard={openCustomerDashboard}
              openDiscoveryFaqIndex={openDiscoveryFaqIndex}
              search={search}
              searchRef={searchRef}
              setDebouncedDiscoverySearch={setDebouncedDiscoverySearch}
              setHasDiscoveryExplorationStarted={setHasDiscoveryExplorationStarted}
              setHighlightedDiscoveryMarkerKey={setHighlightedDiscoveryMarkerKey}
              setHighlightedStoreSlug={setHighlightedStoreSlug}
              setIsCategoryRowExpanded={setIsCategoryRowExpanded}
              setIsDiscoveryNavMenuOpen={setIsDiscoveryNavMenuOpen}
              setIsDiscoverySearchFocused={setIsDiscoverySearchFocused}
              setMobileCategoryGroupIndex={setMobileCategoryGroupIndex}
              setOpenDiscoveryFaqIndex={setOpenDiscoveryFaqIndex}
              setSearch={setSearch}
              showDesktopCategoryOverflowCue={showDesktopCategoryOverflowCue}
              stableHeroDiscoveryMapPins={stableHeroDiscoveryMapPins}
              storesWithNearestBranch={storesWithNearestBranch}
              toSlug={toSlug}
              withAssetOrigin={withAssetOrigin}
            />





                  <ServicesDiscoveryDetailModal
                    Badge={Badge}
                    GhostButton={GhostButton}
                    PrimaryButton={PrimaryButton}
                    STYLES={STYLES}
                    servicesPrimary={servicesPrimary}
                    servicesPrimaryDark={servicesPrimaryDark}
                    servicesPrimaryShadow={servicesPrimaryShadow}
                    checkoutError={checkoutError}
                    closeServiceDetail={closeServiceDetail}
                    isBookingSubpage={isBookingSubpage}
                    isMobileViewport={isMobileViewport}
                    isServiceDetailsSubpage={isServiceDetailsSubpage}
                    missingRequiredSelectedServiceIntake={missingRequiredSelectedServiceIntake}
                    money={money}
                    renderStorefrontClosedNotice={renderStorefrontClosedNotice}
                    saveServiceBookingDraft={saveServiceBookingDraft}
                    selectedServiceDetail={selectedServiceDetail}
                    selectedServiceIntakeFields={selectedServiceIntakeFields}
                    selectedServicePaymentOptions={selectedServicePaymentOptions}
                    serviceAppointmentAt={serviceAppointmentAt}
                    serviceDraftNotes={serviceDraftNotes}
                    serviceDraftQuantity={serviceDraftQuantity}
                    serviceIntakeResponses={serviceIntakeResponses}
                    servicePaymentTiming={servicePaymentTiming}
                    setServiceAppointmentAt={setServiceAppointmentAt}
                    setServiceDraftNotes={setServiceDraftNotes}
                    setServiceDraftQuantity={setServiceDraftQuantity}
                    setServiceIntakeResponses={setServiceIntakeResponses}
                    setServicePaymentTiming={setServicePaymentTiming}
                    storefrontClosedByHours={storefrontClosedByHours}
                    withAssetOrigin={withAssetOrigin}
                  />

          </>
        )}

        {isStorePage && (
          <StorefrontLoadBoundary
            errorMessage={catalogError}
            hasStoreProfile={Boolean(selectedStore)}
            isLoading={loadingCatalog}
            onBackToDiscovery={goDiscovery}
            onRetry={refreshStorePageForTenantSetup}
          >
            <>
            {isServicesTrackingPage ? (
              <ServicesTrackingRouteContainer {...servicesTrackingRouteProps} />
            ) : null}
            {!isServicesTrackingPage && !isFnbDetailsSubpage && (
              <StorefrontHeroBandContainer {...storefrontHeroBandProps} />
            )}


            {/* ZONE 4: Catalog Grid with Sidebar */}
            {!isServicesTrackingPage && (isFnbDetailsSubpage || loadingCatalog || catalogError || catalogPermitted) && (
              <StorefrontCatalogRouteContainer {...storefrontCatalogRouteProps} />
            )}
            </>
          </StorefrontLoadBoundary>
        )}

      </div>

  { isStorePage && selectedStore && !isServicesTrackingPage && (checkoutPermitted || bookingPermitted || productCartPermitted) && (
    <StorefrontCartDrawerShellContainer {...storefrontCartDrawerShellProps} />
  )}
      {customerDashboardDrawerRouteNode}


      <StorefrontPaymentUnavailableModal
        open={isOnlinePaymentModalOpen}
        onClose={uiCloseOnlinePaymentModal}
      />
    </main >
  );
}
