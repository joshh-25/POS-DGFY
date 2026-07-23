import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import SavedAddressCard from './shared/components/checkout/SavedAddressCard.jsx';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Plus,
  Sparkles,
  Copy,
  Trash2,
  X,
  Navigation,
  Map,
  ChevronRight,
  Info,
  Maximize,
} from 'lucide-react';
import { canCheckout, getCheckoutBlockReason } from './shared/model/checkoutRules.js';
import { filterCatalogItems } from './shared/model/catalogSearch.js';
import {
  haversineDistanceKm,
  toNumberOrNull
} from './features/discovery/utils/discoveryMapMath.js';
import { makePinElement } from './features/discovery/utils/discoveryMapMarkers.js';
import {
  createStorePopupNode,
  locationsMatchProfileSnapshot,
  normalizeDiscoveryCategoryKey,
  normalizeProfileLocations,
  normalizeStorefrontCategories,
  normalizeStorefrontDeliveryPartners,
  normalizeStorefrontGallery,
  normalizeStorefrontReviewSummary
} from './features/discovery/utils/storefrontDiscoveryNormalization.js';
import {
  classifyStoreCatalogError,
  normalizeStorefrontErrorMessage
} from './shared/model/storefrontErrorMessages.js';
import {
  buildCartTotals,
  getLineModifiersTotal,
  getLineTotal
} from './shared/model/storefrontCartModel.js';
import { useStorefrontCartPersistence } from './shared/hooks/useStorefrontCartPersistence.js';
import {
  buildCustomerFullName,
  buildMaskedSavedCustomerPreview,
  clearCheckoutAuthResumeDraft,
  clearSavedCustomerDetails,
  getOrCreateStorefrontVisitorId,
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
  formatStorefrontAddress,
  isItemAvailable,
  isServiceCatalogItem,
  trimAddressCountrySuffix
} from './shared/model/storefrontCatalogModel.js';
import {
  DGFY_ACRONYM,
  DGFY_BRAND_NAME,
  DGFY_CONVENIENCE_FEE_LABEL,
  DGFY_CONVENIENCE_FEE_RATE,
  ORDER_METHOD_OPTIONS
} from './shared/model/storefrontConstants.js';
import {
  getStorefrontClosedBody,
  getStorefrontClosedToastMessage
} from './shared/model/storefrontClosedState.js';
import { formatStorefrontHoursLabel } from './shared/model/storefrontHoursModel.js';
import { parseBooleanFlag, parseOptionalObject } from './shared/model/storefrontJsonModel.js';
import {
  buildAccessPolicyStorePatch,
  canUseBooking,
  canUseCheckout,
  canUseProductCart,
  canViewCatalog,
  getAccessCapabilities,
  getInventoryDisplayLabel,
  getStorefrontAccessBlockMessage
} from './shared/model/customerAccess.js';
import { getFoodBeverageStorefrontViewModel } from './modes/fnb/storefront/model/fnbStorefrontViewModel.js';
import { buildFnbCommunityModel } from './modes/fnb/storefront/model/fnbCommunityModel.js';
import { FNB_CATEGORY_ICON_MAP } from './modes/fnb/storefront/model/fnbStorefrontPresentation.js';
import { Badge, GhostButton, PrimaryButton } from './shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontCheckoutDrawerFrame } from './shared/components/StorefrontCheckoutDrawerFrame.jsx';
import { StorefrontCartFlyAnimations } from './shared/components/StorefrontCartFlyAnimations.jsx';
import { createStorefrontClosedNoticeRenderer } from './shared/components/StorefrontClosedNotice.jsx';
import { DefaultStorefrontHero } from './shared/components/DefaultStorefrontHero.jsx';
import { StorefrontHeroShell } from './shared/components/StorefrontHeroShell.jsx';
import {
  buildGoogleMapsDirectionsUrl,
  buildVisibleStorefrontContactRows
} from './shared/utils/storefrontContactPresentation.js';
import { openStorefrontActionLink } from './shared/utils/externalLinks.js';
import { money, round4, toSlug } from './shared/utils/storefrontFormatters.js';
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
import { normalizeStorefrontPageModel } from './app/runtime/normalizeStorefrontPageModel.js';
import {
  buildKnownStoreRouteCandidates,
  buildStorefrontSlugFallbackQueries,
  findCanonicalStorefrontSlug
} from './app/routing/defaultStorefrontRoute.js';
import { createStoreMarkerPreviewNode } from './discovery/model/storefrontMarkerPreview.js';
import { FnbProductDetailsRoute } from './modes/fnb/storefront/pages/FnbProductDetailsRoute.jsx';
import { buildFnbMobileLayout } from './modes/fnb/storefront/model/fnbMobileLayout.js';
import { FNB_RECOMMENDED_LOCATION } from './modes/fnb/checkout/model/fnbCheckoutAddressLocations.js';
import { buildFnbCartStatusLabel } from './modes/fnb/checkout/model/fnbCartPresentation.js';
import {
  isEnabledStorefrontCheckoutPaymentType,
  STOREFRONT_CHECKOUT_PAYMENT_OPTIONS
} from './modes/fnb/checkout/model/fnbCheckoutPaymentOptions.js';
import { useSignedInCheckoutAddresses } from './modes/fnb/checkout/hooks/useSignedInCheckoutAddresses.js';
import { useFnbTrackingDrawerPresentation } from './modes/fnb/tracking/hooks/useFnbTrackingDrawerPresentation.js';
import { useFnbTrackingRuntime } from './modes/fnb/tracking/hooks/useFnbTrackingRuntime.js';
import { useFnbCheckoutPresentation } from './modes/fnb/checkout/hooks/useFnbCheckoutPresentation.js';
import { useFnbCheckoutQuote } from './modes/fnb/checkout/hooks/useFnbCheckoutQuote.js';
import { useFnbCheckoutRouteState } from './modes/fnb/checkout/hooks/useFnbCheckoutRouteState.js';
import { useFnbCheckoutSubmission } from './modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js';
import { useFnbCheckoutPromoRenderers } from './modes/fnb/checkout/hooks/useFnbCheckoutPromoRenderers.jsx';
import { useFnbCartDrawerRouteProps } from './modes/fnb/checkout/hooks/useFnbCartDrawerRouteProps.js';
import { useFnbGuestCheckoutOtp } from './modes/fnb/checkout/hooks/useFnbGuestCheckoutOtp.js';
import { FnbCheckoutConfirmation } from './modes/fnb/checkout/components/FnbCheckoutConfirmation.jsx';
import { FnbCheckoutCustomerStepView } from './modes/fnb/checkout/components/FnbCheckoutCustomerStepView.jsx';
import { FnbCheckoutCustomerStep } from './modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx';
import { FnbCheckoutDesktopSummary } from './modes/fnb/checkout/components/FnbCheckoutDesktopSummary.jsx';
import { FnbCheckoutFulfillmentStep } from './modes/fnb/checkout/components/FnbCheckoutFulfillmentStep.jsx';
import { FnbCheckoutFulfillmentStepView } from './modes/fnb/checkout/components/FnbCheckoutFulfillmentStepView.jsx';
import { FnbCheckoutMobileSummaryPanel } from './modes/fnb/checkout/components/FnbCheckoutMobileSummaryPanel.jsx';
import { FnbCheckoutPaymentStepView } from './modes/fnb/checkout/components/FnbCheckoutPaymentStepView.jsx';
import { FnbCheckoutPaymentStep } from './modes/fnb/checkout/components/FnbCheckoutPaymentStep.jsx';
import { FnbCheckoutRouteBody } from './modes/fnb/checkout/components/FnbCheckoutRouteBody.jsx';
import { FnbCheckoutFulfillmentChoices } from './modes/fnb/checkout/components/FnbCheckoutFulfillmentChoices.jsx';
import { FnbGuestEmailVerification } from './modes/fnb/checkout/components/FnbGuestEmailVerification.jsx';
import { FnbCheckoutExpandedMapModal } from './modes/fnb/checkout/components/FnbCheckoutExpandedMapModal.jsx';
import { FnbCheckoutSavedAddressSelector } from './modes/fnb/checkout/components/FnbCheckoutSavedAddressSelector.jsx';
import { FnbCartDrawerHeader } from './modes/fnb/checkout/components/FnbCartDrawerHeader.jsx';
import { FnbCheckoutSummaryContent } from './modes/fnb/checkout/components/FnbCheckoutSummaryContent.jsx';
import { FnbCartDrawerSurface } from './modes/fnb/checkout/pages/FnbCartDrawerSurface.jsx';
import { FnbCheckoutRouteMount } from './modes/fnb/checkout/pages/FnbCheckoutRouteMount.jsx';
import { useCustomerDashboardIdentity } from './customer-dashboard/hooks/useCustomerDashboardIdentity.js';
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
  readTrackingPinFromQuery,
  STORE_BOOKING_SUBPAGE,
  STORE_ITEM_SUBPAGE,
  STORE_ORDER_SUBPAGE,
  STORE_SERVICE_SUBPAGE,
  STORE_TRACK_SUBPAGE,
  storePath,
  TENANT_STORE_BASE_PATH
} from './app/routing/storefrontRouting.js';
import {
  buildBookingTarget,
  buildCanonicalStorefrontTarget,
  buildCatalogTarget,
  buildItemDetailTarget,
  buildOrderTarget,
  buildServiceDetailTarget,
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
import { createCustomerIdentityRenderers } from './features/checkout/renderers/customerIdentityRenderers.jsx';
import { DeliveryPinMap } from './features/locations/components/DeliveryPinMap.jsx';
import { createAddressPinEditorRenderer } from './features/locations/renderers/addressPinEditorRenderer.jsx';
import {
  buildPinnedDeliveryAddress,
  formatReverseGeocodedAddress,
  isGeneratedPinnedDeliveryAddress,
  normalizeCoordinatePair,
  reverseGeocodeDeliveryPin
} from './features/locations/utils/pinnedDeliveryAddress.js';
import { StoreCatalogEmptyStates } from './features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { StorefrontExpandableBusinessHours } from './features/shared-storefront/components/StorefrontExpandableBusinessHours.jsx';
import { StorefrontDropdown } from './features/shared-storefront/components/StorefrontDropdown.jsx';
import { StorefrontFollowFloatingAction } from './shared/components/storefront/StorefrontFollowFloatingAction.jsx';
import { useStorefrontShareActions } from './shared/hooks/useStorefrontShareActions.js';
import { StorefrontOrderSuccessOverlay } from './shared/components/storefront/StorefrontOrderSuccessOverlay.jsx';
import { StorefrontReviewModal } from './shared/components/storefront/StorefrontReviewModal.jsx';
import { StorefrontCartFab } from './shared/components/storefront/StorefrontCartFab.jsx';
import { StorefrontPaymentUnavailableModal } from './shared/components/storefront/StorefrontPaymentUnavailableModal.jsx';
import {
  deriveStorefrontRegistrationYear,
  formatRatingSummary,
  formatFollowersLabel,
  getDeliveryPlatformLinks,
  getPreferredSocialContact,
  getStorefrontContactFooterLinks,
  getStorefrontContactIcon,
  getStorefrontSocialFooterLinks,
  maskReviewerName
} from './features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { StorefrontExpandedMapModal } from './discovery/components/StorefrontExpandedMapModal.jsx';
import { DiscoveryHomePage } from './discovery/pages/DiscoveryHomePage.jsx';
import {
  HERO_CANVAS_MAX_WIDTH,
  MAX_STOREFRONT_WHY_CHOOSE_US,
  MOBILE_DROPDOWN_MENU_STYLE,
  MOBILE_DROPDOWN_OPTION_STYLE,
  MOBILE_NATIVE_SELECT_STYLE,
  STOREFRONT_CONTACT_INFO_COLUMNS,
  STOREFRONT_INFO_ICON_COLUMN,
  STOREFRONT_INFO_PANEL_MAX_WIDTH,
  STOREFRONT_INFO_ROW_GAP,
  STYLES
} from './shared/theme/storefrontStyleTokens.js';
import { ServicesDiscoveryDetailModal } from './modes/services/storefront/components/ServicesDiscoveryDetailModal.jsx';
import { ServicesHero } from './modes/services/storefront/components/ServicesHero.jsx';
import { buildServiceFallbackReasons } from './modes/services/storefront/model/servicesHeroPresentation.js';
import { SERVICE_CATEGORY_ICON_MAP } from './modes/services/storefront/model/serviceCategoryIconMap.jsx';
import {
  buildServiceBookingFieldPlan,
  buildServicePaymentOptions,
  isBookingFieldComplete,
  normalizeServiceFormFields
} from './modes/services/booking/model/serviceBookingFields.js';
import {
  buildServiceDateOptions,
  buildServiceTimeSlotOptions,
  combineDateAndTimeParts,
  formatServiceAppointmentSummary,
  getDatePartFromAppointment,
  getPreferredBookingTimeForDate,
  getTimePartFromAppointment
} from './modes/services/booking/model/serviceBookingSchedule.js';
import { buildServiceBookingSummaryModel } from './modes/services/booking/model/serviceBookingSummary.js';
import { useServiceBookingFieldFocus } from './modes/services/booking/hooks/useServiceBookingFieldFocus.js';
import { useServiceCartDrawerProps } from './modes/services/booking/hooks/useServiceCartDrawerProps.js';
import { buildServiceCartValidationIssues } from './modes/services/booking/model/serviceBookingValidation.js';
import { SimpleProductCard } from './modes/simple/storefront/components/SimpleProductCard.jsx';
import { ServiceProductCard } from './modes/services/storefront/components/ServiceProductCard.jsx';
import { ServicesPerformanceSidebar } from './modes/services/storefront/components/ServicesPerformanceSidebar.jsx';
import { StorefrontServicesCatalog } from './modes/services/storefront/components/StorefrontServicesCatalog.jsx';
import { SimpleHero } from './modes/simple/storefront/components/SimpleHero.jsx';
import { SimpleCartFloatingButton } from './modes/simple/checkout/components/SimpleCartFloatingButton.jsx';
import { SimpleCartDrawerSurface } from './modes/simple/checkout/components/SimpleCartDrawerSurface.jsx';
import { SimpleCheckoutRoutePage } from './modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx';
import { useSimpleCartDrawerProps } from './modes/simple/checkout/hooks/useSimpleCartDrawerProps.js';
import { useSimpleCheckoutRouteProps } from './modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js';
import { buildSimpleFallbackReasons } from './modes/simple/storefront/model/simpleStorefrontPresentation.js';
import { StoresMap } from './discovery/components/StoresMap.jsx';
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
import { StorefrontPromoSection as SharedStorefrontPromoSection } from './shared/components/storefront/sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection as SharedStorefrontReviewsSection } from './shared/components/storefront/sections/StorefrontReviewsSection.jsx';
import { StorefrontFooterSection as SharedStorefrontFooterSection } from './shared/components/storefront/sections/StorefrontFooterSection.jsx';
import { FnbCatalogToolbar } from './modes/fnb/storefront/components/FnbCatalogToolbar.jsx';
import { FnbHero } from './modes/fnb/storefront/components/FnbHero.jsx';
import { useFnbCatalogRuntime } from './modes/fnb/storefront/hooks/useFnbCatalogRuntime.js';
import { useFnbProductDetailsRoute } from './modes/fnb/storefront/hooks/useFnbProductDetailsRoute.js';
import { useFnbProductDetailsRouteProps } from './modes/fnb/storefront/hooks/useFnbProductDetailsRouteProps.js';
import { useFnbProductDetailNavigation } from './modes/fnb/storefront/hooks/useFnbProductDetailNavigation.js';
import { useFnbProductDetailActions } from './modes/fnb/storefront/hooks/useFnbProductDetailActions.js';
import { useFnbProductDetailsReviewProps } from './modes/fnb/storefront/hooks/useFnbProductDetailsReviewProps.js';
import { useFnbItemReviewRuntime } from './modes/fnb/storefront/hooks/useFnbItemReviewRuntime.js';
import { useFnbProductModifiers } from './modes/fnb/storefront/hooks/useFnbProductModifiers.js';
import { buildFnbPromoSectionModel } from './modes/fnb/promos/model/fnbPromoModel.js';
import { FnbProductCard } from './modes/fnb/storefront/components/FnbProductCard.jsx';
import { FnbItemReviewModal } from './modes/fnb/storefront/components/FnbItemReviewModal.jsx';
import { createTrackingAdapterRegistry } from './tracking/core.js';
import {
  fnbTrackingAdapter,
  getCompletedTrackingLabel,
  getTrackingFlowForOrderMethod
} from './modes/fnb/tracking/model/fnbTrackingAdapter.js';
import {
  mergeTrackedOrderEntries,
  normalizeTrackedOrderEntry,
  readLastTrackingPinForStore,
  readTrackedOrdersForStore,
  TERMINAL_TRACKING_STATUSES,
  writeLastTrackingPinForStore
} from './tracking/storage.js';
import {
  deriveAccountActivityCollections,
  EMPTY_ACCOUNT_PANEL,
  mapAccountActivityToTrackedOrderEntry,
  mergeAccountPanelActivity,
  resolveStorefrontRouteSlug
} from './tracking/accountActivity.js';
import HospitalityBookingPanel from './modes/hospitality/booking/components/HospitalityBookingPanel.jsx';
import {
  createBlankGuestCustomerIdentity,
  shouldHydrateSavedGuestCustomerDetails
} from './checkout/guestCustomerDetailsState.js';
import {
  WORKFLOW_MODE_LABELS,
  WORKFLOW_MODE_SELECT_VALUES
} from '../../../src/features/settings/workflowMode.js';
import {
  buildBusinessLoginUrl,
  buildBusinessRegistrationUrl,
  buildDgfyAuthUrl,
  buildPosAppUrl
} from './shared/utils/businessRegistrationUrl.js';
import { resolveStorefrontAccountUrl } from '../../../src/features/dgfyRouteHelpers.js';
import {
  markDgfySessionActive,
  startDgfyPosSession,
  startDgfyTenantSession
} from '../../../src/services/dgfyAuthService.js';
import { buildSkupervisorPath } from '../../../src/features/pos/utils/skupervisorHandoff.js';
import {
  clearDgfyAuthToken,
  clearStoreAuthToken,
  hasDgfyExplicitSignOut,
  markDgfyExplicitSignOut,
  readDgfyAuthToken,
  readDgfySignedOutEmail,
  readStoreAuthToken,
  rememberDgfySignedOutEmail,
  writeDgfyAuthToken,
  writeStoreAuthToken
} from './auth/storefrontSessionStorage.js';
import { requestJson } from './services/requestJson.js';
import { hasCustomerName, hasPrimaryContact, isCustomerStepComplete } from './checkout/checkoutValidation.js';
import { PaymentMethodSelectorBlock } from './shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { FnbTrackingRouteContainer } from './modes/fnb/tracking/pages/FnbTrackingRouteContainer.jsx';
import { buildFnbTrackingRouteProps } from './modes/fnb/tracking/model/buildFnbTrackingRouteProps.js';
import { ServiceCartDrawer } from './modes/services/booking/components/ServiceCartDrawer.jsx';
import { FnbCommunitySection } from './modes/fnb/storefront/components/FnbCommunitySection.jsx';
import {
  formatServicesBookingFailureMessage,
  resolveServicesBookingSubmitContract
} from './services/servicesBookingContract.js';
import { useStorefrontStore } from './store/useStorefrontStore.js';
import {
  selectIsOnlinePaymentModalOpen,
  selectViewportWidth
} from './store/selectors/uiSelectors.js';
import 'maplibre-gl/dist/maplibre-gl.css';

/* Legacy storefront contract anchors (frontend-only compatibility)
id: 'reservation'
/api/v1/store/fnb/reservations
fnb_modifier_groups
Allergens:
getDefaultFnbLineModifiers
line_modifiers
/api/v1/store/services/bookings/batch
bookings: heldServiceCartLines.map
quantity: Math.max(1, Number(line.quantity || 1))
idempotency_key: createStorefrontIdempotencyKey('service-batch')
serviceBatchFailureMessage(error, serviceCartLines)
/api/v1/store/services/availability?
Ready for pickup
Out for delivery
Order confirmed
Confirmed by store
Preparing
Delivered
Picked up
buildServiceAvailabilitySlotOptions
serviceAvailabilityMessage
Live capacity checked
No available slots for this date and quantity
This quantity needs a service resource with more capacity.
/api/v1/store/services/holds
replace_hold_token
hasFreshServiceHold
ensureServiceBookingHold(line)
service_hold_token
Reserving...
openServiceCartEditor(line)
serviceCartValidationIssues
line?.intake_responses || {}
Booking references
checkoutResult.payments.filter
cart_line_id
*/

export const __storefrontTrackingTestUtils = {
  normalizeTrackedOrderEntry,
  mapAccountActivityToTrackedOrderEntry
};

const dgfyHeaderLogo = '/dgfy-logo.png';
const dgfySymbolLogo = '/dgfy-symbologo.png';
const dgfyBusinessOwnerPhoto = '/man.png';
const DGFY_HEADER_LOGO_URL = dgfyHeaderLogo;
const DGFY_LOGO_ICON_URL = dgfySymbolLogo;

export default function StorefrontApp() {
  const [routeSlug, setRouteSlug] = useState(() => readRouteSlug());
  const [routeSubpage, setRouteSubpage] = useState(() => readStoreSubpage());
  const [routeServiceItemId, setRouteServiceItemId] = useState(() => readStoreServiceItemId());
  const [routeItemId, setRouteItemId] = useState(() => readStoreItemId());
  const [routeReviewToken, setRouteReviewToken] = useState(() => readStoreReviewToken());
  const previousRouteSlugRef = useRef(routeSlug);
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
  const { loadStores } = useDiscoveryStoreLoader({
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
  const [serviceCartFlyAnimations, setServiceCartFlyAnimations] = useState([]);
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
    discoverySortLabelByValue
  } = useDiscoveryFilterOptions({
    workflowModeLabels: WORKFLOW_MODE_LABELS,
    workflowModeSelectValues: WORKFLOW_MODE_SELECT_VALUES
  });
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
  const [activeServiceTab, setActiveServiceTab] = useState(null);
  const [serviceSortOption, setServiceSortOption] = useState('recommended');
  const [isServiceFilterOpen, setIsServiceFilterOpen] = useState(false);
  const [serviceAvailabilityFilter, setServiceAvailabilityFilter] = useState('all');
  const [serviceAreaFilter, setServiceAreaFilter] = useState('all');
  const [serviceDurationFilter, setServiceDurationFilter] = useState('all');
  const [serviceBookingStep, setServiceBookingStep] = useState(1);
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
    fnbScheduledFor,
    fnbScheduleMode,
    fnbSpecialInstructions,
    setFnbOrderStep,
    setFnbPaymentType,
    setFnbScheduledFor,
    setFnbScheduleMode,
    setFnbSpecialInstructions,
    setShowMobileAddressModal,
    showMobileAddressModal,
  } = useFnbCheckoutRouteState();
  const [simpleOrderStep, setSimpleOrderStep] = useState(1);
  const isOnlinePaymentModalOpen = useStorefrontStore(selectIsOnlinePaymentModalOpen);
  const uiOpenOnlinePaymentModal = useStorefrontStore((s) => s.uiOpenOnlinePaymentModal);
  const uiCloseOnlinePaymentModal = useStorefrontStore((s) => s.uiCloseOnlinePaymentModal);

  const handlePaymentTypeChange = useCallback((val) => {
    if (val === 'online') {
      uiOpenOnlinePaymentModal();
      setFnbPaymentType('cash');
    } else {
      setFnbPaymentType(val);
    }
  }, []);
  const [checkoutPromoCode, setCheckoutPromoCode] = useState('');

  const [isAboutExpanded, setIsAboutExpanded] = useState(false);
  const [isServiceGalleryExpanded, setIsServiceGalleryExpanded] = useState(false);
  const [storeLocations, setStoreLocations] = useState([]);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [hasSelectedBranchFromMenu, setHasSelectedBranchFromMenu] = useState(false);

  const [preferredStoreLocationSelection, setPreferredStoreLocationSelection] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogErrorGuidance, setCatalogErrorGuidance] = useState('');

  const [orderMethod, setOrderMethod] = useState('delivery');
  const cart = useStorefrontStore((s) => s.cart.items);
  const setCart = useStorefrontStore((s) => s.cartSet);
  const [catalogImageErrors, setCatalogImageErrors] = useState(() => new Set());
  const [cartImageErrors, setCartImageErrors] = useState(() => new Set());
  const [brandingImageErrors, setBrandingImageErrors] = useState(() => new Set());
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [guestCheckoutUnlocked, setGuestCheckoutUnlocked] = useState(false);
  const [rememberCustomerDetails, setRememberCustomerDetails] = useState(() => Boolean(readStoreAuthToken()));
  const [savedCustomerDetails, setSavedCustomerDetails] = useState(() => readSavedCustomerDetails());
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
  const fnbAutoQuoteSyncKeyRef = useRef('');
  const [checkoutResult, setCheckoutResult] = useState(null);

  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showOrderSuccessAnimation, setShowOrderSuccessAnimation] = useState(false);
  const orderSuccessAnimationTimerRef = useRef(null);

  const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false);
  const [dgfyAuthTokenState, setDgfyAuthTokenState] = useState(() => readDgfyAuthToken());
  const [dgfySessionAccount, setDgfySessionAccount] = useState(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutTab, setCheckoutTab] = useState('checkout');
  const [pendingOrderInitialTab, setPendingOrderInitialTab] = useState('');
  const [hasAppliedCheckoutAuthResume, setHasAppliedCheckoutAuthResume] = useState(false);
  const storefrontVisitorId = useMemo(() => getOrCreateStorefrontVisitorId(), []);
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
  useEffect(() => {
    let cancelled = false;

    const bootstrapDgfyCookieSession = async () => {
      let consumedHandoff = false;
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        const handoffToken = String(currentUrl.searchParams.get('handoff_token') || '').trim();
        if (handoffToken) {
          currentUrl.searchParams.delete('handoff_token');
          window.history.replaceState({}, '', currentUrl.toString());
          try {
            const handoffPayload = await requestJson('/api/v1/dgfy/auth/handoff/exchange', {
              method: 'POST',
              cache: 'no-store',
              body: {
                handoff_token: handoffToken,
                soft_fail: true
              }
            });
            consumedHandoff = handoffPayload?.status !== 'invalid';
            if (consumedHandoff) {
              const handoffTokenValue = String(handoffPayload?.token || '').trim();
              const handoffAccount = handoffPayload?.account && typeof handoffPayload.account === 'object'
                ? handoffPayload.account
                : null;
              if (handoffTokenValue) {
                writeDgfyAuthToken(handoffTokenValue);
                setDgfyAuthTokenState(handoffTokenValue);
              } else {
                clearDgfyAuthToken();
                setDgfyAuthTokenState('');
              }
              if (handoffAccount) {
                setDgfySessionAccount(handoffAccount);
              }
              markDgfySessionActive();
            } else {
              clearDgfyAuthToken();
              setDgfyAuthTokenState('');
            }
          } catch {
            clearDgfyAuthToken();
            setDgfyAuthTokenState('');
          }
          if (cancelled) return;
        }
      }

      if (!consumedHandoff && hasDgfyExplicitSignOut()) {
        clearDgfyAuthToken();
        clearStoreAuthToken();
        setDgfyAuthTokenState('');
        setDgfySessionAccount(null);
        return;
      }

      const legacyToken = readDgfyAuthToken();
      try {
        const payload = await requestJson('/api/v1/dgfy/auth/me', { cache: 'no-store' });
        if (cancelled) return;
        const account = payload?.account || payload || null;
        setDgfySessionAccount(account && typeof account === 'object' ? account : null);
        if (account && typeof account === 'object') {
          clearDgfyAuthToken();
          setDgfyAuthTokenState('');
          markDgfySessionActive();
        }
      } catch {
        if (cancelled) return;
        if (legacyToken && !consumedHandoff) {
          try {
            const payload = await requestJson('/api/v1/dgfy/auth/me', {
              authToken: legacyToken,
              cache: 'no-store'
            });
            if (cancelled) return;
            const account = payload?.account || payload || null;
            setDgfySessionAccount(account && typeof account === 'object' ? account : null);
            if (account && typeof account === 'object') markDgfySessionActive();
            return;
          } catch {
            if (cancelled) return;
          }
        }
        clearDgfyAuthToken();
        setDgfyAuthTokenState('');
        if (cancelled) return;
        setDgfySessionAccount(null);
      }
    };

    bootstrapDgfyCookieSession();
    return () => {
      cancelled = true;
    };
  }, []);
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

  const pageModel = useMemo(() => (
    normalizeStorefrontPageModel({
      selectedStore,
      catalog
    })
  ), [selectedStore, catalog]);
  const {
    isServicesMode,
    isFnbMode,
    isSimpleMode,
    isHospitalityMode,
    modeAdapter,
    servicesViewModel,
    fnbViewModel,
    servicesLayoutMode,
    hero: heroSectionModel,
    overview: overviewSectionModel,
    supporting: supportingSectionModel
  } = pageModel;
  const filteredCatalog = useMemo(() => filterCatalogItems(catalog, catalogSearch), [catalog, catalogSearch]);
  const baseFilteredFnbViewModel = useMemo(() => getFoodBeverageStorefrontViewModel(filteredCatalog), [filteredCatalog]);
  const filteredFnbCatalog = useMemo(() => (
    Array.isArray(baseFilteredFnbViewModel?.menuItems) ? baseFilteredFnbViewModel.menuItems : []
  ), [baseFilteredFnbViewModel]);
  const filteredFnbViewModel = useMemo(() => getFoodBeverageStorefrontViewModel(filteredFnbCatalog), [filteredFnbCatalog]);
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
  useStorefrontCartPersistence({
    cart,
    enabled: isFnbMode || isServicesMode,
    mode: isFnbMode ? 'fnb' : (isServicesMode ? 'services' : ''),
    setCart,
    storeSlug: selectedStore?.slug || routeSlug
  });
  const isStandaloneTrackingPage = isTrackSubpage || (isOrderSubpage && checkoutTab === 'track');
  const storeAuthToken = readStoreAuthToken();
  const dgfyAuthToken = String(dgfyAuthTokenState || '').trim();
  const isDgfyCustomerSignedIn = Boolean(dgfyAuthToken || dgfySessionAccount?.id);
  const canUseGuestCheckoutFlow = !isDgfyCustomerSignedIn && guestCheckoutUnlocked;
  const isStorefrontAccountAuthenticated = Boolean(storeAuthToken || dgfyAuthToken || dgfySessionAccount?.id);
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
  const trackingMode = isFnbMode ? 'fnb' : (isServicesMode ? 'services' : 'simple');
  const trackingAdapterRegistry = useMemo(
    () => createTrackingAdapterRegistry([fnbTrackingAdapter]),
    []
  );
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
  } = useFnbTrackingRuntime({
    checkoutTab,
    isFnbOrderSubpage,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
    requestJson,
    routeSlug,
    selectedStore,
    toSlug,
    trackingAdapterRegistry,
    trackingMode
  });
  const promoSectionModel = useMemo(() => buildFnbPromoSectionModel({
    catalog,
    selectedStore,
    supportingPromo: supportingSectionModel?.promo,
    maxItems: 3
  }), [catalog, selectedStore, supportingSectionModel?.promo]);
  const servicesPrimary = modeAdapter?.heroTheme?.accent || '#0f766e';
  const servicesPrimaryDark = modeAdapter?.heroTheme?.accentDark || '#134e4a';
  const servicesPrimarySoft = modeAdapter?.heroTheme?.accentSoft || '#ecfeff';
  const servicesBodyFont = modeAdapter?.heroTheme?.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif";
  const servicesDisplayFont = modeAdapter?.heroTheme?.displayFont || servicesBodyFont;
  const servicesPrimaryBorder = `${servicesPrimary}33`;
  const servicesPrimaryShadow = 'rgba(15,118,110,0.24)';
  const servicesPrimaryShadowStrong = 'rgba(15,118,110,0.32)';
  const servicesHighlight = '#f59e0b';
  const servicesHighlightSoft = '#fffbeb';
  const maskedSavedCustomerPreview = useMemo(
    () => buildMaskedSavedCustomerPreview(savedCustomerDetails),
    [savedCustomerDetails]
  );
  const hasSavedCustomerDetails = Boolean(savedCustomerDetails && (savedCustomerDetails.name || savedCustomerDetails.phone || savedCustomerDetails.email));
  const customerNameParts = useMemo(() => splitCustomerName(customerName), [customerName]);
  const resolvedCustomerFirstName = String(customerFirstName || customerNameParts.firstName || '').trim();
  const resolvedCustomerLastName = String(customerLastName || customerNameParts.lastName || '').trim();
  const {
    isGlobalAccountPage,
    isTenantAccountPage,
    isStandaloneAccountPage
  } = useCustomerDashboardRouteFlags({
    currentPathname,
    currentPathSubpage,
    routeSubpage
  });
  const closeAccountDrawer = useCallback(() => {
    setIsAccountDrawerOpen(false);
  }, []);
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
    handleOpenBusinessPos
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
    buildSkupervisorPath,
    buildPosAppUrl,
    startDgfyTenantSession,
    startDgfyPosSession,
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
    savedCustomerDetails,
    maskValue
  });
  const isGuestAccountDrawerState = !isStorefrontAccountAuthenticated;
  const trackingDrawerOrders = isDgfyCustomerSignedIn ? accountTrackedOrders : guestTrackedOrders;

  const applySavedCustomerDetails = useCallback(() => {
    if (!savedCustomerDetails) return;
    const splitName = splitCustomerName(savedCustomerDetails.name || '');
    setCustomerFirstName(savedCustomerDetails.firstName || splitName.firstName || '');
    setCustomerLastName(savedCustomerDetails.lastName || splitName.lastName || '');
    setCustomerName(savedCustomerDetails.name || '');
    setCustomerPhone(savedCustomerDetails.phone || '');
    setCustomerEmail(savedCustomerDetails.email || '');
    toast.success('Saved details applied.');
  }, [savedCustomerDetails]);

  const handleGuestCustomerNameChange = useCallback((nextName) => {
    const normalizedName = String(nextName || '').replace(/\s+/g, ' ').trimStart();
    const splitName = splitCustomerName(normalizedName);
    setCustomerName(normalizedName);
    setCustomerFirstName(splitName.firstName || '');
    setCustomerLastName(splitName.lastName || '');
  }, []);

  const handleOpenGuestDetailsEditor = useCallback(() => {
    const blankGuestIdentity = createBlankGuestCustomerIdentity();
    setCustomerFirstName(blankGuestIdentity.firstName);
    setCustomerLastName(blankGuestIdentity.lastName);
    setCustomerName(blankGuestIdentity.name);
    setCustomerPhone(blankGuestIdentity.phone);
    setCustomerEmail(blankGuestIdentity.email);
    setIsUsingDifferentGuestDetails(true);
    setGuestDetailsEditMode(true);
  }, []);

  const handleCancelGuestDetailsEditor = useCallback(() => {
    if (hasSavedCustomerDetails) {
      applySavedCustomerDetails();
      setIsUsingDifferentGuestDetails(false);
      setGuestDetailsEditMode(false);
      return;
    }
    handleGuestCustomerNameChange(buildCustomerFullName(customerFirstName, customerLastName));
  }, [applySavedCustomerDetails, customerFirstName, customerLastName, handleGuestCustomerNameChange, hasSavedCustomerDetails]);

  const handleApplyGuestDetails = useCallback(() => {
    handleGuestCustomerNameChange(buildCustomerFullName(customerFirstName, customerLastName) || customerName);
    if (hasSavedCustomerDetails) {
      setGuestDetailsEditMode(false);
    }
  }, [customerFirstName, customerLastName, customerName, handleGuestCustomerNameChange, hasSavedCustomerDetails]);

  const clearSavedCustomerDetailsForDevice = useCallback(() => {
    clearSavedCustomerDetails();
    setSavedCustomerDetails(null);
    toast.success('Saved details cleared.');
  }, []);
  useEffect(() => {
    if (!isDgfyCustomerSignedIn) return;
    if (accountIdentityRawName && !String(customerName || '').trim()) {
      const splitName = splitCustomerName(accountIdentityRawName);
      setCustomerFirstName((current) => current || splitName.firstName || '');
      setCustomerLastName((current) => current || splitName.lastName || '');
      setCustomerName(accountIdentityRawName);
    }
    if (accountIdentityRawPhone && !String(customerPhone || '').trim()) {
      setCustomerPhone(accountIdentityRawPhone);
    }
    if (accountIdentityRawEmail && !String(customerEmail || '').trim()) {
      setCustomerEmail(accountIdentityRawEmail);
    }
  }, [
    accountIdentityRawEmail,
    accountIdentityRawName,
    accountIdentityRawPhone,
    customerFirstName,
    customerEmail,
    customerLastName,
    customerName,
    customerPhone,
    isDgfyCustomerSignedIn
  ]);
  useEffect(() => {
    if (isDgfyCustomerSignedIn) return;
    const mergedGuestName = buildCustomerFullName(customerFirstName, customerLastName);
    if (mergedGuestName !== String(customerName || '').trim()) {
      setCustomerName(mergedGuestName);
    }
  }, [customerFirstName, customerLastName, customerName, isDgfyCustomerSignedIn]);
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
    savedCustomerDetails
  ]);
  useEffect(() => {
    if (!selectedStore?.slug) {
      setGuestCheckoutUnlocked(false);
    }
  }, [selectedStore?.slug]);
  const openStoreBySlug = useCallback(async (slug) => {
    const normalized = toSlug(slug);
    if (!normalized) return;
    const requestSequence = ++storeLoadRequestSequenceRef.current;

    setLoadingCatalog(true);
    setCatalogError('');
    setCatalogErrorGuidance('');
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    try {
      let profile;
      try {
        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(normalized)}`, { cache: 'no-store' });
      } catch (profileError) {
        if (Number(profileError?.status) !== 404) throw profileError;

        let canonicalSlug = '';
        for (const fallbackQuery of buildStorefrontSlugFallbackQueries(normalized)) {
          const discoveryFallback = await requestJson(`/api/v1/storefront/discovery?search=${encodeURIComponent(fallbackQuery)}&limit=20&result_mode=union&stock_filter=include_out_of_stock&pin_scope=tenant_primary&include_match_meta=true`, { cache: 'no-store' });
          const fallbackStores = Array.isArray(discoveryFallback?.stores) ? discoveryFallback.stores : [];
          canonicalSlug = findCanonicalStorefrontSlug(normalized, fallbackStores)
            || findCanonicalStorefrontSlug(fallbackQuery, fallbackStores);
          if (canonicalSlug) break;
        }
        if (!canonicalSlug) throw profileError;

        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(canonicalSlug)}`, { cache: 'no-store' });
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

      try {
        const locationsData = await requestJson('/api/v1/store/locations', { storeSlug: profile.slug, cache: 'no-store' });
        if (requestSequence !== storeLoadRequestSequenceRef.current) return;
        const apiLocations = Array.isArray(locationsData?.locations) ? locationsData.locations : [];
        const useProfileSnapshot = !locationsMatchProfileSnapshot(apiLocations, profile);
        const locations = useProfileSnapshot ? profileLocations : apiLocations;
        const nextPrimaryLocationId = useProfileSnapshot
          ? (profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null)
          : (locationsData?.primary_location_id ?? null);
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
        const fallbackPrimaryLocationId = profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null;
        setStoreLocations(profileLocations);
        setPrimaryLocationId(fallbackPrimaryLocationId);
        resolvedCatalogLocationId = fallbackPrimaryLocationId;
        setSelectedLocationId(fallbackPrimaryLocationId);
      }

      const catalogQuery = resolvedCatalogLocationId == null
        ? '/api/v1/store/catalog?limit=120'
        : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(resolvedCatalogLocationId)}`;
      const catalogData = await requestJson(catalogQuery, { storeSlug: profile.slug, cache: 'no-store' });
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;
      const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
      if (accessPatch) {
        setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch } : prev));
      }
      setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
    } catch (error) {
      if (requestSequence !== storeLoadRequestSequenceRef.current) return;
      const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant storefront page.');
      setSelectedStore(null);
      setStoreLocations([]);
      setCatalog([]);
      setCatalogError(normalizedError.message);
      setCatalogErrorGuidance(normalizedError.guidance);
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
    let cancelled = false;
    const requestSequence = ++locationCatalogRequestSequenceRef.current;
    const loadLocationAwareCatalog = async () => {
      if (!isStorePage || !selectedStore?.slug) return;
      setLoadingCatalog(true);
      setCatalogError('');
      setCatalogErrorGuidance('');
      try {
        const catalogQuery = selectedLocationId == null
          ? '/api/v1/store/catalog?limit=120'
          : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(selectedLocationId)}`;
        const catalogData = await requestJson(catalogQuery, { storeSlug: selectedStore.slug, cache: 'no-store' });
        if (cancelled || requestSequence !== locationCatalogRequestSequenceRef.current) return;
        const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
        if (accessPatch) {
          setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch } : prev));
        }
        setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
      } catch (error) {
        if (cancelled || requestSequence !== locationCatalogRequestSequenceRef.current) return;
        const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant catalog for selected location.');
        setCatalog([]);
        setCatalogError(normalizedError.message);
        setCatalogErrorGuidance(normalizedError.guidance);
      } finally {
        if (!cancelled && requestSequence === locationCatalogRequestSequenceRef.current) setLoadingCatalog(false);
      }
    };

    loadLocationAwareCatalog();
    return () => {
      cancelled = true;
    };
  }, [isStorePage, selectedStore?.slug, selectedLocationId]);

  useEffect(() => {
    setCatalogImageErrors(new Set());
  }, [catalog]);

  useEffect(() => {
    if (!isFnbMode) return;
    if (!routeItemId) {
      setSelectedFnbDetail(null);
      setSelectedFnbDetailQuantity(1);
      setSelectedFnbLineModifiers([]);
      return;
    }
    const matchedItem = catalog.find((entry) => String(entry?.item_id) === String(routeItemId)) || null;
    setSelectedFnbDetail(matchedItem);
    setSelectedFnbDetailQuantity(1);
    setSelectedFnbLineModifiers([]);
  }, [catalog, isFnbMode, routeItemId]);

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

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const lockBodyScroll = isFnbOrderSubpage || isCheckoutOpen || isGuestTrackingDrawerOpen || (isAccountDrawerOpen && !isStandaloneAccountPage);
    if (!lockBodyScroll) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousHeight = document.body.style.height;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'manipulation';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.height = previousHeight;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [isAccountDrawerOpen, isCheckoutOpen, isFnbOrderSubpage, isGuestTrackingDrawerOpen, isStandaloneAccountPage]);

  useEffect(() => {
    if (!isFnbOrderSubpage) return;
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
  }, [currentPathSubpage, isFnbOrderSubpage, pendingOrderInitialTab, routeSlug, routeSubpage, selectedStore?.slug, trackingPinInput, selectedTrackingPin]);

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
  }, [accountPanel.me]);

  useEffect(() => () => {
    if (orderSuccessAnimationTimerRef.current) {
      window.clearTimeout(orderSuccessAnimationTimerRef.current);
      orderSuccessAnimationTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => { });
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(
            keys
              .filter((k) => k.startsWith('sku-store-shell-') || k.startsWith('sku-store-runtime-'))
              .map((k) => caches.delete(k))
          ))
          .catch(() => { });
      }
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' });
        const contentType = String(probe.headers.get('content-type') || '').toLowerCase();
        const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript');
        if (!probe.ok || !scriptLike) {
          console.warn('[StorefrontPWA] Skipping service worker registration due to invalid script response', {
            status: probe.status,
            contentType
          });
          return;
        }
        await navigator.serviceWorker.register(serviceWorkerUrl, {
          scope: appBasePath === '/' ? '/' : `${appBasePath}/`,
          updateViaCache: 'none'
        });
      } catch (error) {
        console.warn('[StorefrontPWA] Service worker registration failed', {
          error: error?.message || 'unknown_error'
        });
      }
    };

    registerServiceWorker();
  }, []);

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
  const goStoreOrderForDiscovery = (slug, locationId = null, storeContext = null) => {
    const normalized = toSlug(slug);
    if (!normalized || typeof window === 'undefined') return;
    const contextWorkflowMode = String(storeContext?.workflow_mode || storeContext?.business_mode || '').trim().toLowerCase();
    const hasStoreContext = storeContext && typeof storeContext === 'object';
    const shouldUseCanonicalStorefront = hasStoreContext && (contextWorkflowMode === 'fnb' || !canUseCheckout(storeContext));
    if (shouldUseCanonicalStorefront) {
      goStore(normalized, locationId);
      if (!canUseCheckout(storeContext)) {
        const message = getStorefrontAccessBlockMessage(storeContext);
        if (message) toast.error(message);
      }
      window.requestAnimationFrame(() => {
        document.getElementById('storefront-catalog-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    const persistedTrackedOrders = readTrackedOrdersForStore(normalized).filter((entry) => !TERMINAL_TRACKING_STATUSES.has(String(entry.status || '').trim().toLowerCase()));
    const persistedTrackingPin = readLastTrackingPinForStore(normalized);
    const resolvedInitialTab = 'checkout';
    setPreferredStoreLocationSelection(locationId == null ? null : {
      slug: normalized,
      locationId: Number(locationId)
    });
    const targetSubpage = STORE_ORDER_SUBPAGE;
    const target = buildOrderTarget(normalized);
    if (!isCurrentStorefrontTarget(target)) {
      window.history.pushState(buildStorefrontHistoryState({
        storeSlug: normalized,
        storeSubpage: targetSubpage
      }), '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(targetSubpage);
    setRouteServiceItemId(null);
    setRouteItemId(null);
    setPendingOrderInitialTab(resolvedInitialTab);
    const preferredPin = String(persistedTrackedOrders[0]?.tracking_pin || persistedTrackingPin || '').trim().toUpperCase();
    if (!trackingPinInput && preferredPin) {
      setTrackingPinInput(preferredPin);
    }
    if (!selectedTrackingPin && preferredPin) setSelectedTrackingPin(preferredPin);
    setFnbOrderStep(checkoutResult ? 4 : 3);
    setSimpleOrderStep(checkoutResult ? 4 : 1);
    setCheckoutTab(resolvedInitialTab);
    setIsCheckoutOpen(false);
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
  const goStoreTrackPage = ({ pin = '', storeSlug = '' } = {}) => {
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
    }
    setFnbOrderStep(checkoutResult ? 4 : 3);
    setSimpleOrderStep(checkoutResult ? 4 : 1);
    setCheckoutTab('track');
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
    setCatalogErrorGuidance('');
    setDiscoveryAppliedFilters(null);
    setIsCheckoutOpen(false);
    setActiveDiscoveryNavItem('Explore');
  };

  const handleBranchMenuSelection = useCallback((nextValue) => {
    const nextLocationId = nextValue ? Number(nextValue) : null;
    setSelectedLocationId(nextLocationId);
    setHasSelectedBranchFromMenu(true);
  }, []);

  const cartTotals = useMemo(() => buildCartTotals(cart), [cart]);
  const cartSubtotal = cartTotals.subtotal;
  const cartAddOnsTotal = cartTotals.addOnsTotal;
  const cartTotal = cartTotals.total;
  const cartCount = cartTotals.count;
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
  const selectedLocation = useMemo(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) return null;
    if (selectedLocationId == null) return null;
    return storeLocations.find((location) => Number(location.location_id) === Number(selectedLocationId)) || null;
  }, [storeLocations, selectedLocationId]);
  const hasMultipleStoreBranches = Array.isArray(storeLocations) && storeLocations.length > 1;
  const accessCapabilities = useMemo(() => getAccessCapabilities(selectedStore), [selectedStore]);
  const catalogPermitted = canViewCatalog(selectedStore);
  const productCartPermitted = canUseProductCart(selectedStore);
  const checkoutPermitted = canUseCheckout(selectedStore);
  const bookingPermitted = canUseBooking(selectedStore);
  const serviceHeroModel = useMemo(() => {
    if (!selectedStore || !isServicesMode) return null;
    const mapStores = storeLocations.length > 0
      ? storeLocations.map((location) => ({ ...location, tenant_name: selectedStore?.tenant_name }))
      : [selectedStore];
    const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
    const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
    const galleryPreview = Array.isArray(supportingSectionModel?.galleryImages)
      ? supportingSectionModel.galleryImages.slice(0, 4).map((entry) => withAssetOrigin(entry.url || entry.path)).filter(Boolean)
      : [];
    const reviewSummary = supportingSectionModel?.reviewSummary || null;
    const serviceGroups = Array.isArray(servicesViewModel?.serviceGroups) ? servicesViewModel.serviceGroups : [];
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const preferredSocialContact = getPreferredSocialContact({ messengerLink, facebookLink });
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const hours = formatStorefrontHoursLabel(
      selectedStore?.storefront_hours,
      heroSectionModel?.hours || selectedStore?.storefront_hours_status?.display || ''
    );
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    const directionsUrl = buildGoogleMapsDirectionsUrl({
      latitude: selectedLocation?.latitude ?? selectedStore?.latitude,
      longitude: selectedLocation?.longitude ?? selectedStore?.longitude,
      addressLine
    });
    const mergedGalleryImages = [...new Set(galleryPreview)];
    const mergedGalleryPreview = mergedGalleryImages.slice(0, 4);
    const whyChooseUs = Array.isArray(overviewSectionModel?.whyChooseUs) && overviewSectionModel.whyChooseUs.length > 0
      ? overviewSectionModel.whyChooseUs.slice(0, 4)
      : buildServiceFallbackReasons({
        serviceGroups,
        servicesViewModel,
        categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories : []
      });
    const ratingLabel = formatRatingSummary(reviewSummary);
    const reviewCount = Number((reviewSummary?.total_count ?? reviewSummary?.totalCount) || 0);
    const serviceCounts = {
      total: Number(servicesViewModel?.totalServices || 0),
      families: Number(servicesViewModel?.serviceFamilyCount || 0),
      onSite: Number(servicesViewModel?.onSiteCount || 0)
    };
    const quickStats = [
      serviceCounts.total > 0 ? { label: 'Services', value: String(serviceCounts.total) } : null,
      serviceCounts.families > 0 ? { label: 'Categories', value: String(serviceCounts.families) } : null,
      reviewCount > 0 ? { label: 'Reviews', value: String(reviewCount) } : null
    ].filter(Boolean);

    return {
      coverImageUrl: withAssetOrigin(heroSectionModel?.coverImageUrl),
      profileImageUrl: withAssetOrigin(heroSectionModel?.profileImageUrl),
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      statusLabel: heroSectionModel?.statusLabel || (selectedStore?.storefront_open ? 'Open' : 'Closed'),
      ratingLabel,
      modeLabel: heroSectionModel?.primaryCategoryLabel || modeAdapter.heroEyebrow,
      locationLabel: addressLine || locationName || 'Location details coming soon',
      aboutText: heroSectionModel?.aboutText || '',
      sectionAboutText: heroSectionModel?.aboutText || '',
      categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories.slice(0, 3) : [],
      whyChooseUs,
      galleryImages: mergedGalleryImages,
      galleryPreview: mergedGalleryPreview,
      galleryOverflowCount: Math.max(0, (Array.isArray(supportingSectionModel?.galleryImages) ? supportingSectionModel.galleryImages.length : mergedGalleryPreview.length) - mergedGalleryPreview.length),
      reviewSummary,
      reviewHighlights: Array.isArray(supportingSectionModel?.reviewHighlights) ? supportingSectionModel.reviewHighlights : [],
      reviewCount,
      quickStats,
      serviceCounts,
      servicesLayoutMode,
      servicesWithRequiredIntakeCount: Number(servicesViewModel?.servicesWithRequiredIntakeCount || 0),
      servicesWithAvailabilityCount: Number(servicesViewModel?.servicesWithAvailabilityCount || 0),
      servicesWithStructuredScheduleCount: Number(servicesViewModel?.servicesWithStructuredScheduleCount || 0),
      prepaidServiceCount: Number(servicesViewModel?.prepaidServiceCount || 0),
      postpaidServiceCount: Number(servicesViewModel?.postpaidServiceCount || 0),
      hours,
      contactRows: [
        phone ? { icon: null, label: 'Call', value: phone, href: `tel:${phone}` } : null,
        preferredSocialContact ? { icon: null, label: preferredSocialContact.label, value: preferredSocialContact.value, href: preferredSocialContact.href } : null,
        email ? { icon: null, label: 'Email', value: email, href: `mailto:${email}` } : null
      ].filter(Boolean),
      actions: {
        canCall: Boolean(phone),
        callHref: phone ? `tel:${phone}` : '',
        canMessage: Boolean(messengerLink || email),
        messageHref: messengerLink || (email ? `mailto:${email}` : ''),
        canOrder: bookingPermitted || checkoutPermitted,
        orderLabel: modeAdapter.primaryActionLabel || 'Order Now'
      },
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean),
      mapStores,
      mapSelectedKey: selectedLocation?.location_id != null ? `loc-${selectedLocation.location_id}` : null,
      addressLine,
      facebookLink,
      directionsUrl,
      serviceGroups,
      registrationYear
    };
  }, [
    selectedStore,
    isServicesMode,
    storeLocations,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    servicesViewModel,
    servicesLayoutMode,
    heroSectionModel,
    modeAdapter.heroDescription,
    modeAdapter.heroEyebrow,
    modeAdapter.primaryActionLabel,
    bookingPermitted,
    checkoutPermitted
  ]);
  useEffect(() => {
    setIsAboutExpanded(false);
    setIsServiceGalleryExpanded(false);
  }, [selectedStore?.slug, selectedLocationId]);
  useEffect(() => {
    setHasSelectedBranchFromMenu(false);
  }, [selectedStore?.slug]);
  const fnbCommunityModel = useMemo(() => buildFnbCommunityModel({
    selectedStore,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    heroSectionModel,
    filteredFnbViewModel,
    fallbackDescription: modeAdapter.heroDescription
  }), [
    selectedStore,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    heroSectionModel,
    filteredFnbViewModel,
    modeAdapter.heroDescription
  ]);
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
  const { toggleFnbDetailModifier } = useFnbProductModifiers({
    setSelectedModifiers: setSelectedFnbLineModifiers
  });
  const simpleStorefrontModel = useMemo(() => {
    if (!selectedStore || !isSimpleMode) return null;
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const preferredSocialContact = getPreferredSocialContact({ messengerLink, facebookLink });
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const hours = formatStorefrontHoursLabel(
      selectedStore?.storefront_hours,
      heroSectionModel?.hours || selectedStore?.storefront_hours_status?.display || ''
    );
    const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
    const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
    const reviewSummary = supportingSectionModel?.reviewSummary || parseOptionalObject(selectedStore?.storefront_review_summary) || null;
    const reviewHighlights = Array.isArray(supportingSectionModel?.reviewHighlights)
      ? supportingSectionModel.reviewHighlights.filter(Boolean)
      : [];
    const productGroups = [...new Set(
      (Array.isArray(catalog) ? catalog : [])
        .map((item) => String(item?.categoryMeta?.label || item?.category_name || item?.category || '').trim())
        .filter(Boolean)
    )].slice(0, 5);
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    const mapStores = storeLocations.length > 0
      ? storeLocations.map((location) => ({ ...location, tenant_name: selectedStore?.tenant_name }))
      : [selectedStore];
    const whyChooseUs = Array.isArray(overviewSectionModel?.whyChooseUs) && overviewSectionModel.whyChooseUs.length > 0
      ? overviewSectionModel.whyChooseUs.slice(0, 4)
      : buildSimpleFallbackReasons({
          categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories : [],
          catalog
        });
    const directionsUrl = buildGoogleMapsDirectionsUrl({
      latitude: selectedLocation?.latitude ?? selectedStore?.latitude,
      longitude: selectedLocation?.longitude ?? selectedStore?.longitude,
      addressLine
    });
    return {
      coverImageUrl: withAssetOrigin(heroSectionModel?.coverImageUrl),
      profileImageUrl: withAssetOrigin(heroSectionModel?.profileImageUrl),
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      statusLabel: heroSectionModel?.statusLabel || (selectedStore?.storefront_open ? 'Open' : 'Closed'),
      ratingLabel: formatRatingSummary(reviewSummary),
      modeLabel: heroSectionModel?.primaryCategoryLabel || modeAdapter.heroEyebrow,
      locationLabel: addressLine || locationName || 'Location details coming soon',
      addressLine,
      aboutText: heroSectionModel?.aboutText || '',
      whyChooseUs,
      hours,
      reviewSummary,
      reviewHighlights,
      productGroups,
      registrationYear,
      directionsUrl,
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean),
      contactRows: [
        phone ? { icon: null, label: 'Call', value: phone, href: `tel:${phone}` } : null,
        preferredSocialContact ? { icon: null, label: preferredSocialContact.label, value: preferredSocialContact.value, href: preferredSocialContact.href } : null,
        email ? { icon: null, label: 'Email', value: email, href: `mailto:${email}` } : null
      ].filter(Boolean),
      actions: {
        canCall: Boolean(phone),
        callHref: phone ? `tel:${phone}` : '',
        canMessage: Boolean(messengerLink || email),
        messageHref: messengerLink || (email ? `mailto:${email}` : ''),
        canOrder: checkoutPermitted || productCartPermitted,
        orderLabel: modeAdapter.primaryActionLabel || 'Start Ordering'
      },
      mapStores,
      mapSelectedKey: selectedLocation?.location_id != null ? `loc-${selectedLocation.location_id}` : null
    };
  }, [
    selectedStore,
    isSimpleMode,
    heroSectionModel,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    catalog,
    storeLocations,
    modeAdapter.heroDescription,
    modeAdapter.heroEyebrow,
    modeAdapter.primaryActionLabel,
    checkoutPermitted,
    productCartPermitted
  ]);
  const hasCatalogSearchQuery = catalogSearch.trim().length > 0;
  const catalogState = useMemo(() => {
    if (loadingCatalog && catalog.length === 0) return 'empty_setup';
    if (loadingCatalog) return 'loading';
    if (catalogError) return 'error';
    if (!hasCatalogSearchQuery && filteredCatalog.length === 0) return 'empty_setup';
    if (catalog.length === 0 && hasCatalogSearchQuery) return 'empty_search_on_zero';
    if (catalog.length === 0) return 'empty_setup';
    if (hasCatalogSearchQuery && filteredCatalog.length === 0) return 'empty_no_match';
    return 'ready';
  }, [loadingCatalog, catalogError, catalog.length, hasCatalogSearchQuery, filteredCatalog.length]);
  const isDeliveryOrder = orderMethod === 'delivery';
  const serviceCartLines = useMemo(() => cart.filter((line) => line.category === 'service'), [cart]);
  const productCartLines = useMemo(() => cart.filter((line) => line.category !== 'service'), [cart]);
  const serviceCartCount = useMemo(() => serviceCartLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [serviceCartLines]);
  const serviceCartTotal = useMemo(() => serviceCartLines.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.price || 0)), 0), [serviceCartLines]);
  const hasServiceCart = serviceCartLines.length > 0;
  const hasMixedServiceCart = hasServiceCart && serviceCartLines.length !== cart.length;
  const firstServiceLine = serviceCartLines[0] || null;
  const activeServiceCartLine = useMemo(() => {
    if (!hasServiceCart) return null;
    const selectedLine = serviceCartLines.find((line) => String(line.cart_line_id || '') === String(selectedServiceCartLineId || ''));
    return selectedLine || firstServiceLine;
  }, [firstServiceLine, hasServiceCart, selectedServiceCartLineId, serviceCartLines]);
  const isServicesCartDrawerMode = isServicesMode && !isBookingSubpage;
  const isSimpleCartSurfaceMode = isSimpleMode && !isResolvedOrderSubpage;
  const servicePaymentPolicy = activeServiceCartLine?.service_detail?.payment_policy || 'customer_choice';
  const selectedServicePaymentPolicy = selectedServiceDetail?.service_detail?.payment_policy || 'customer_choice';
  const serviceIntakeFields = useMemo(() => {
    return normalizeServiceFormFields(activeServiceCartLine?.service_detail?.intake_form_schema);
  }, [activeServiceCartLine]);
  const selectedServiceIntakeFields = useMemo(() => (
    normalizeServiceFormFields(selectedServiceDetail?.service_detail?.intake_form_schema)
  ), [selectedServiceDetail]);
  const missingRequiredIntake = useMemo(() => (
    serviceIntakeFields.filter((field) => {
      if (!field.required) return false;
      const value = serviceIntakeResponses[field.id];
      return field.type === 'checkbox' ? value !== true : !String(value || '').trim();
    })
  ), [serviceIntakeFields, serviceIntakeResponses]);
  const missingRequiredSelectedServiceIntake = useMemo(() => (
    selectedServiceIntakeFields.filter((field) => {
      if (!field.required) return false;
      const value = serviceIntakeResponses[field.id];
      return field.type === 'checkbox' ? value !== true : !String(value || '').trim();
    })
  ), [selectedServiceIntakeFields, serviceIntakeResponses]);
  const servicePaymentOptions = useMemo(() => {
    return buildServicePaymentOptions(servicePaymentPolicy);
  }, [servicePaymentPolicy]);
  const selectedServicePaymentOptions = useMemo(() => (
    buildServicePaymentOptions(selectedServicePaymentPolicy)
  ), [selectedServicePaymentPolicy]);
  const hasStockViolation = useMemo(() => (
    cart.some((line) => Number(line.quantity) > Number(line.max_stock ?? Number.POSITIVE_INFINITY))
  ), [cart]);
  const totalsForDisplay = useMemo(() => {
    const subtotal = quoteResult?.subtotal_amount != null ? Number(quoteResult.subtotal_amount) : cartTotal;
    const discountAmount = quoteResult?.discount_amount != null ? Number(quoteResult.discount_amount) : 0;
    const serviceFee = quoteResult?.service_fee_amount != null
      ? Number(quoteResult.service_fee_amount)
      : round4(Math.max(0, subtotal) * DGFY_CONVENIENCE_FEE_RATE);
    const deliveryFee = quoteResult?.delivery_fee != null ? Number(quoteResult.delivery_fee) : 0;
    const totalAmount = quoteResult?.total_amount != null ? Number(quoteResult.total_amount) : subtotal - discountAmount + deliveryFee + serviceFee;
    return {
      subtotal_amount: subtotal,
      discount_amount: discountAmount,
      discount_label: quoteResult?.discount_label || 'Promo Discount',
      discount_rate: quoteResult?.discount_rate != null ? Number(quoteResult.discount_rate) : 0,
      service_fee_amount: serviceFee,
      service_fee_label: quoteResult?.service_fee_label || DGFY_CONVENIENCE_FEE_LABEL,
      delivery_fee: deliveryFee,
      vatable_sales: quoteResult?.vatable_sales != null ? Number(quoteResult.vatable_sales) : 0,
      vat_amount: quoteResult?.vat_amount != null ? Number(quoteResult.vat_amount) : 0,
      vat_exempt_sales: quoteResult?.vat_exempt_sales != null ? Number(quoteResult.vat_exempt_sales) : 0,
      zero_rated_sales: quoteResult?.zero_rated_sales != null ? Number(quoteResult.zero_rated_sales) : 0,
      total_amount: totalAmount
    };
  }, [quoteResult, cartTotal]);
  const activePromoFeedback = checkoutResult?.promo_feedback || quoteResult?.promo_feedback || null;
  const promoStatusMessage = checkoutError || quoteError || activePromoFeedback?.message || '';
  const promoStatusTone = checkoutError || quoteError
    ? 'error'
    : (activePromoFeedback?.applied ? 'success' : 'idle');
  const appliedPromoDiscountText = totalsForDisplay.discount_amount > 0
    ? `${money(totalsForDisplay.discount_amount)} off`
    : '';
  const promoDiscountSummaryRow = totalsForDisplay.discount_amount > 0
    ? { label: totalsForDisplay.discount_label || 'Promo Discount', value: `- ${money(totalsForDisplay.discount_amount)}` }
    : null;
  const activeOrderMethodLabel = ORDER_METHOD_OPTIONS.find((option) => option.value === orderMethod)?.label || 'Checkout';
  const simpleOrderMethodOptions = ORDER_METHOD_OPTIONS.filter((option) => option.value === 'pickup' || option.value === 'delivery');
  const isDesktopCheckout = isDesktopViewport;
  const requireQuoteForCheckout = !hasServiceCart && !isFnbMode && !isSimpleMode;
  const isStorefrontV2 = parseBooleanFlag(selectedStore?.storefront_ui_v2_enabled, false);
  const followEnabledForStore = parseBooleanFlag(selectedStore?.storefront_follow_enabled, false);
  const { followState, handleFollowAction, handleShareAction } = useStorefrontShareActions({
    selectedStore,
    isStorePage,
    isStorefrontV2,
    followEnabledForStore,
    storefrontVisitorId
  });
  const followUiEnabledForStore = followEnabledForStore && followState.supported !== false;
  const shareEnabledForStore = parseBooleanFlag(selectedStore?.storefront_share_enabled, true);
  const storefrontHoursStatus = selectedStore?.storefront_hours_status || null;
  const storefrontClosedByHours = storefrontHoursStatus?.is_open_now === false;
  const storefrontHoursLabel = formatStorefrontHoursLabel(
    selectedStore?.storefront_hours,
    storefrontHoursStatus?.display || ''
  );
  const storefrontClosedMessageBody = getStorefrontClosedBody(storefrontHoursLabel);
  const storefrontClosedToastMessage = getStorefrontClosedToastMessage(storefrontHoursLabel);
  const renderStorefrontClosedNotice = useMemo(
    () => createStorefrontClosedNoticeRenderer(storefrontClosedMessageBody),
    [storefrontClosedMessageBody]
  );
  const checkoutBlockReason = getCheckoutBlockReason({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh,
    requireQuote: requireQuoteForCheckout
  });
  const serviceCartValidationIssues = useMemo(
    () => buildServiceCartValidationIssues(serviceCartLines),
    [serviceCartLines]
  );
  const checkoutAllowed = canCheckout({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh,
    requireQuote: requireQuoteForCheckout
  }) && !hasMixedServiceCart && (!hasServiceCart || serviceCartValidationIssues.length === 0);
  const fnbCartStatusLabel = useMemo(() => buildFnbCartStatusLabel({
    cartCount,
    storefrontClosedByHours,
    hasStockViolation,
    isFnbMode,
    quoteResult,
    quoteNeedsRefresh,
    checkoutAllowed
  }), [cartCount, storefrontClosedByHours, hasStockViolation, isFnbMode, quoteResult, quoteNeedsRefresh, checkoutAllowed]);
  const activeBookingService = activeServiceCartLine || selectedServiceDetail || null;
  const bookingPageIntakeFields = hasServiceCart ? serviceIntakeFields : selectedServiceIntakeFields;
  const bookingPageMissingRequiredIntake = hasServiceCart ? missingRequiredIntake : missingRequiredSelectedServiceIntake;
  const bookingPagePaymentOptions = hasServiceCart ? servicePaymentOptions : selectedServicePaymentOptions;
  const bookingFieldPlan = useMemo(() => (
    buildServiceBookingFieldPlan({
      fields: bookingPageIntakeFields,
      serviceItem: activeBookingService
    })
  ), [bookingPageIntakeFields, activeBookingService]);
  const bookingStepOneAdditionalFields = useMemo(() => (
    [bookingFieldPlan.instructionField, ...bookingFieldPlan.remainingFields].filter(Boolean)
  ), [bookingFieldPlan.instructionField, bookingFieldPlan.remainingFields]);
  const selectedServiceDatePart = getDatePartFromAppointment(serviceAppointmentAt);
  const selectedServiceTimePart = getTimePartFromAppointment(serviceAppointmentAt);
  const bookingDateOptions = useMemo(() => buildServiceDateOptions(activeBookingService), [activeBookingService]);
  const bookingTimeSlotOptions = useMemo(() => buildServiceTimeSlotOptions(activeBookingService, selectedServiceDatePart), [activeBookingService, selectedServiceDatePart]);
  const missingStepOneAdditionalFields = useMemo(() => (
    bookingStepOneAdditionalFields.filter((field) => !isBookingFieldComplete(field, serviceIntakeResponses[field.id]))
  ), [bookingStepOneAdditionalFields, serviceIntakeResponses]);
  const isAddressRequired = bookingFieldPlan.addressField?.required === true || bookingFieldPlan.requiresAddress;
  const serviceLocationSummaryDraft = useMemo(() => (
    trimAddressCountrySuffix(
      resolvedDeliveryAddress
      || customerAddress
      || buildPinnedDeliveryAddress(customerPin)
      || ''
    )
  ), [customerAddress, customerPin, resolvedDeliveryAddress]);
  const missingCustomerInformation = useMemo(() => {
    const missing = [];
    if (!String(customerName || '').trim()) missing.push('Customer Name');
    if (!String(customerPhone || '').trim()) missing.push('Contact Number');
    if (bookingFieldPlan.emailField?.required && !String(customerEmail || '').trim()) missing.push('Email');
    if (isAddressRequired && !String(serviceLocationSummaryDraft || '').trim()) missing.push('Service Location');
    return missing;
  }, [bookingFieldPlan.emailField?.required, customerEmail, customerName, customerPhone, isAddressRequired, serviceLocationSummaryDraft]);
  const missingScheduleAndServiceInfo = useMemo(() => {
    const missing = [];
    if (!selectedServiceDatePart) missing.push('Preferred Date');
    if (!selectedServiceTimePart) missing.push('Preferred Time Slot');
    if (bookingFieldPlan.unitTypeField && bookingFieldPlan.unitTypeField.required && !String(serviceUnitType || '').trim()) {
      missing.push(bookingFieldPlan.unitTypeField.label);
    }
    if (bookingFieldPlan.unitCountField && bookingFieldPlan.unitCountField.required && !(Number(serviceDraftQuantity || 0) > 0)) {
      missing.push(bookingFieldPlan.unitCountField.label);
    }
    return missing;
  }, [bookingFieldPlan.unitCountField, bookingFieldPlan.unitTypeField, selectedServiceDatePart, selectedServiceTimePart, serviceDraftQuantity, serviceUnitType]);
  const stepOneComplete = missingCustomerInformation.length === 0
    && missingScheduleAndServiceInfo.length === 0
    && missingStepOneAdditionalFields.length === 0;
  const paymentStepComplete = Boolean(servicePaymentTiming);
  const reviewStepReady = stepOneComplete;
  const {
    bookingSummaryAmount,
    bookingSummaryQuantity,
    reviewServiceLines,
    serviceBookingSummaryLineItems,
    serviceBookingSummaryRows,
    serviceBookingSummarySchedule,
    serviceBookingSummaryTitle
  } = useMemo(() => buildServiceBookingSummaryModel({
    activeBookingService,
    bookingPagePaymentOptions,
    firstServiceLine,
    hasServiceCart,
    money,
    serviceAppointmentAt,
    serviceCartLines,
    serviceCartTotal,
    serviceDraftQuantity,
    serviceIntakeResponses,
    serviceLocationSummaryDraft,
    servicePaymentTiming
  }), [
    activeBookingService,
    bookingPagePaymentOptions,
    firstServiceLine,
    hasServiceCart,
    serviceAppointmentAt,
    serviceCartLines,
    serviceCartTotal,
    serviceDraftQuantity,
    serviceIntakeResponses,
    serviceLocationSummaryDraft,
    servicePaymentTiming
  ]);
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
  }, [cart, orderMethod, selectedLocationId, customerPin, serviceAppointmentAt, servicePaymentTiming, checkoutPromoCode, isStorePage]);
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
    if (!isBookingSubpage || !activeBookingService || selectedServiceDatePart) return;
    const firstDate = bookingDateOptions[0]?.value || '';
    if (!firstDate) return;
    setServiceAppointmentAt(combineDateAndTimeParts(firstDate, getPreferredBookingTimeForDate(activeBookingService, firstDate, selectedServiceTimePart)));
  }, [isBookingSubpage, activeBookingService, bookingDateOptions, selectedServiceDatePart, selectedServiceTimePart]);
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

  const playCartAddedSound = () => {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const audioContext = new AudioContextCtor();
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.connect(audioContext.destination);

      const notes = [
        { frequency: 523.25, start: 0, duration: 0.09 },
        { frequency: 659.25, start: 0.1, duration: 0.12 }
      ];

      notes.forEach((note) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, audioContext.currentTime + note.start);
        oscillator.connect(gainNode);
        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime + note.start);
        gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + note.start + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + note.start + note.duration);
        oscillator.start(audioContext.currentTime + note.start);
        oscillator.stop(audioContext.currentTime + note.start + note.duration);
      });

      window.setTimeout(() => {
        try {
          audioContext.close();
        } catch {
          // Ignore close failures.
        }
      }, 320);
    } catch {
      // Ignore sound failures and keep cart interaction silent.
    }
  };

  const getCartFlySourceRect = (event) => {
    const trigger = event?.currentTarget?.closest?.('[data-cart-fly-origin="true"]') || event?.currentTarget || null;
    const rect = trigger?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  };

  const animateCartCardToFab = (sourceRect) => {
    if (!(isServicesMode || isFnbMode) || !sourceRect || !serviceCartFabRef.current || typeof window === 'undefined') return;
    const targetRect = serviceCartFabRef.current.getBoundingClientRect();
    const animationId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const size = Math.max(40, Math.min(84, Math.round(Math.min(sourceRect.width, sourceRect.height))));
    const startX = sourceRect.left + (sourceRect.width / 2) - (size / 2);
    const startY = sourceRect.top + (sourceRect.height / 2) - (size / 2);
    const endX = targetRect.left + (targetRect.width / 2) - (size / 2);
    const endY = targetRect.top + (targetRect.height / 2) - (size / 2);
    setServiceCartFlyAnimations((prev) => [...prev, {
      id: animationId,
      startX,
      startY,
      deltaX: endX - startX,
      deltaY: endY - startY,
      size
    }]);
    window.setTimeout(() => {
      setServiceCartFlyAnimations((prev) => prev.filter((entry) => entry.id !== animationId));
    }, 650);
  };

  const addToCart = (item, options = {}) => {
    if (isServiceCatalogItem(item) ? !bookingPermitted : !productCartPermitted) {
      toast.error('This storefront is not accepting online checkout right now.');
      return;
    }
    const requestedQuantity = Math.max(1, Number(options?.quantity || 1));
    const lineModifiers = (Array.isArray(options?.line_modifiers) ? options.line_modifiers : [])
      .map((entry) => ({
        modifier_group_id: entry?.modifier_group_id,
        modifier_option_id: entry?.modifier_option_id,
        option_name: String(entry?.option_name || '').trim(),
        price_delta: Number(entry?.price_delta || 0) || 0
      }))
      .filter((entry) => entry.modifier_group_id != null && entry.modifier_option_id != null);
    const modifierKey = JSON.stringify(lineModifiers.map((entry) => ({
      modifier_group_id: entry.modifier_group_id,
      modifier_option_id: entry.modifier_option_id
    })));
    let stockWarning = '';
    const normalizedItemId = Number(item?.item_id);
    if (Number.isFinite(normalizedItemId)) {
      setCartImageErrors((prev) => {
        if (!prev.has(normalizedItemId)) return prev;
        const next = new Set(prev);
        next.delete(normalizedItemId);
        return next;
      });
    }
    const price = Number(item.default_sale_price ?? 0);
    const maxStock = isItemAvailable(item) ? Number.POSITIVE_INFINITY : 0;
    const baseLine = {
      item_id: item.item_id,
      cart_line_id: options?.cart_line_id || `${item.item_id}:${modifierKey || 'default'}`,
      name: item.name,
      variantName: item.variantName || '',
      category: isServiceCatalogItem(item) ? 'service' : String(item.category || '').trim().toLowerCase(),
      service_detail: item.service_detail || null,
      quantity: requestedQuantity,
      price,
      image_url: withAssetOrigin(item.image_url) || null,
      unit_of_measure: item.unit_of_measure || '',
      max_stock: maxStock,
      serviceAreaLabel: item.serviceAreaLabel || '',
      durationLabel: item.durationLabel || '',
      line_modifiers: lineModifiers
    };
    setCart((prev) => {
      if (isServiceCatalogItem(item)) {
        const serviceCartLineId = options?.cart_line_id || createStorefrontIdempotencyKey(`service-line-${item.item_id}`);
        return [...prev, {
          ...baseLine,
          cart_line_id: serviceCartLineId,
          quantity: requestedQuantity,
          service_notes: String(options?.service_notes || '').trim(),
          service_schedule_at: String(options?.service_schedule_at || ''),
          payment_timing: String(options?.payment_timing || servicePaymentTiming || 'postpaid'),
          intake_responses: options?.intake_responses && typeof options.intake_responses === 'object'
            ? options.intake_responses
            : null
        }];
      }
      const found = prev.find((l) => (
        Number(l.item_id) === Number(item.item_id)
        && JSON.stringify((Array.isArray(l.line_modifiers) ? l.line_modifiers : []).map((entry) => ({
          modifier_group_id: entry?.modifier_group_id,
          modifier_option_id: entry?.modifier_option_id
        }))) === modifierKey
      ));
      if (found) {
        const requestedQty = Number(found.quantity) + requestedQuantity;
        const safeQty = Math.max(0, Math.min(requestedQty, maxStock));
        if (requestedQty > maxStock) {
          stockWarning = buildStockExceededMessage({
            item_name: item.name,
            requested_qty: requestedQty,
            available_stock: maxStock,
            unit_of_measure: item.unit_of_measure || ''
          });
        }
        return prev.map((line) => Number(line.item_id) === Number(item.item_id)
          ? (
            line.cart_line_id === found.cart_line_id
              ? { ...line, quantity: safeQty, max_stock: maxStock }
              : line
          )
          : line);
      }
      return [...prev, {
        ...baseLine,
        quantity: maxStock > 0 ? requestedQuantity : 0
      }];
    });
    if (isServiceCatalogItem(item)) {
      setCheckoutTab('review');
      setIsCheckoutOpen(false);
      animateCartCardToFab(options?.sourceRect || null);
    } else {
      setCheckoutTab(isFnbMode ? 'cart' : 'review');
      const shouldOpenCartDrawer = Boolean(options?.openCart) || !isFnbMode;
      setIsCheckoutOpen(shouldOpenCartDrawer);
      if (isFnbMode && !shouldOpenCartDrawer) {
        animateCartCardToFab(options?.sourceRect || null);
      }
    }
    playCartAddedSound();
    toast.success(`${item?.variantName || item?.name || 'Item'} added successfully!`);
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };
  const fnbProductDetailActions = useFnbProductDetailActions({ addToCart, goStoreOrderPage, item: detailPageFnbItem, quantity: selectedFnbDetailQuantity, selectedModifiers: selectedFnbLineModifiers });
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
    onToggleModifier: toggleFnbDetailModifier,
    navigation: {
      onBack: closeFnbDetail,
      onSelectRelatedItem: openFnbDetail
    },
    reviewProps: fnbProductDetailsReviewProps,
    selectedLocation,
    selectedStore,
    withAssetOrigin
  });
  const handleServicesCartCheckout = () => {
    if (cart.length === 0) {
      toast.error('Your cart is empty.');
      return;
    }
    if (hasMixedServiceCart) {
      toast.error('Book services separately from regular product orders.');
      return;
    }
    if (!hasServiceCart || serviceCartLines.length === 0) {
      toast.error('Add a service to your cart first.');
      return;
    }
    setIsCheckoutOpen(false);
    goStoreBookingPage();
  };
  const openServiceBookingPanel = (nextTab = 'review') => {
    setCheckoutTab(nextTab);
    setIsCheckoutOpen(true);
  };
  const openServiceCartEditor = (line) => {
    if (!line) return;
    setSelectedServiceCartLineId(String(line.cart_line_id || ''));
    setSelectedServiceDetail({
      ...line,
      item_id: line.item_id,
      service_detail: line.service_detail || null
    });
    setServiceAppointmentAt(String(line.service_schedule_at || ''));
    setServiceDraftQuantity(Math.max(1, Number(line.quantity || 1)));
    setServiceDraftNotes(String(line.service_notes || ''));
    setServiceIntakeResponses(line?.intake_responses && typeof line.intake_responses === 'object' ? line.intake_responses : {});
    setServicePaymentTiming(String(line.payment_timing || servicePaymentOptions[0]?.value || 'postpaid'));
    if (isServicesMode) {
      goStoreBookingPage({ preserveSelectedService: true });
    }
  };
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
    goStoreTrackPage({ pin: normalizedPin, storeSlug: targetSlug });
  };
  const buildCustomerDashboardReturnUrl = useCallback(() => (
    resolveStorefrontAccountUrl()
  ), []);
  const openCustomerDashboard = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.location.href = buildCustomerDashboardReturnUrl();
  }, [buildCustomerDashboardReturnUrl]);
  const openAccountPanel = useCallback(() => {
    setIsCheckoutOpen(false);
    setIsGuestTrackingDrawerOpen(false);
    openCustomerDashboard();
  }, [openCustomerDashboard]);
  const buildContextualCustomerReturnUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const target = new URL(window.location.href);
    target.searchParams.set('dgfy_account', '1');
    return target.toString();
  }, []);
  const persistCheckoutAuthResume = useCallback((resumeTarget = {}) => {
    writeCheckoutAuthResumeDraft({
      routeSlug: selectedStore?.slug || routeSlug,
      returnTo: buildContextualCustomerReturnUrl(),
      checkoutTab: resumeTarget.checkoutTab || checkoutTab || 'checkout',
      fnbOrderStep: resumeTarget.fnbOrderStep ?? fnbOrderStep,
      simpleOrderStep: resumeTarget.simpleOrderStep ?? simpleOrderStep,
      serviceBookingStep: resumeTarget.serviceBookingStep ?? serviceBookingStep,
      selectedLocationId,
      selectedSavedLocationId,
      orderMethod,
      fnbScheduledFor,
      fnbScheduleMode,
      fnbSpecialInstructions,
      serviceAppointmentAt,
      servicePaymentTiming,
      customerAddress,
      serviceLocationLandmarkNote,
      resolvedDeliveryAddress,
      deliveryLocationAction,
      customerPin,
      serviceIntakeResponses,
      cart,
      selectedServiceItemId: selectedServiceDetail?.item_id || activeServiceCartLine?.item_id || firstServiceLine?.item_id || null,
      savedAt: Date.now()
    });
  }, [
    buildContextualCustomerReturnUrl,
    cart,
    checkoutTab,
    customerAddress,
    customerPin,
    deliveryLocationAction,
    fnbOrderStep,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    activeServiceCartLine?.item_id,
    firstServiceLine?.item_id,
    orderMethod,
    resolvedDeliveryAddress,
    routeSlug,
    selectedLocationId,
    selectedSavedLocationId,
    selectedServiceDetail?.item_id,
    selectedStore?.slug,
    serviceAppointmentAt,
    serviceBookingStep,
    serviceIntakeResponses,
    serviceLocationLandmarkNote,
    servicePaymentTiming,
    simpleOrderStep
  ]);
  const openCanonicalDgfyAuth = useCallback((intent = 'customer', mode = 'sign-in', { returnTarget = 'account', reason = '', email = '' } = {}) => {
    if (typeof window === 'undefined') return;
    const normalizedIntent = String(intent || '').trim() === 'register-business' ? 'register-business' : 'customer';
    const normalizedMode = String(mode || '').trim() === 'create-account' ? 'create-account' : 'sign-in';
    const signedOutEmail = readDgfySignedOutEmail();
    const explicitSignedOutLogin = normalizedIntent === 'customer'
      && normalizedMode === 'sign-in'
      && hasDgfyExplicitSignOut();
    window.location.href = buildDgfyAuthUrl({
      intent: normalizedIntent,
      mode: normalizedMode,
      returnTo: normalizedIntent === 'customer'
        ? (returnTarget === 'current' ? buildContextualCustomerReturnUrl() : buildCustomerDashboardReturnUrl())
        : '/register-company#business-registration'
        ,
      reason: reason || (explicitSignedOutLogin ? 'signed-out' : ''),
      email: email || (explicitSignedOutLogin ? signedOutEmail : '')
    });
  }, [buildContextualCustomerReturnUrl, buildCustomerDashboardReturnUrl]);
  const openStorefrontHeaderAccount = useCallback(() => {
    setIsCheckoutOpen(false);
    setIsGuestTrackingDrawerOpen(false);
    if (isDgfyCustomerSignedIn) {
      openCustomerDashboard();
      return;
    }
    openCanonicalDgfyAuth('customer');
  }, [isDgfyCustomerSignedIn, openCanonicalDgfyAuth, openCustomerDashboard]);
  const openCheckoutAuthFlow = useCallback((mode = 'create-account', resumeTarget = {}) => {
    persistCheckoutAuthResume(resumeTarget);
    openCanonicalDgfyAuth('customer', mode, { returnTarget: 'current' });
  }, [openCanonicalDgfyAuth, persistCheckoutAuthResume]);
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
  } = useFnbGuestCheckoutOtp({
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
  const {
    renderGuestIdentityFields,
    renderGuestCheckoutEntry,
    renderAccountOwnedIdentitySummary
  } = useMemo(() => createCustomerIdentityRenderers({
    hasSavedCustomerDetails,
    savedCustomerDetails,
    rememberCustomerDetails,
    maskedSavedCustomerPreview,
    guestDetailsEditMode,
    isMobileViewport,
    servicesBodyFont,
    servicesDisplayFont,
    customerName,
    customerFirstName,
    customerLastName,
    customerPhone,
    customerEmail,
    customerAddress,
    accountIdentityRawName,
    accountIdentityRawPhone,
    accountIdentityRawEmail,
    handleGuestCustomerNameChange,
    setCustomerFirstName,
    setCustomerLastName,
    setCustomerPhone,
    setCustomerEmail,
    setCustomerAddress,
    setRememberCustomerDetails,
    handleOpenGuestDetailsEditor,
    handleCancelGuestDetailsEditor,
    handleApplyGuestDetails,
    handleSendGuestCheckoutOtp: handleRequestGuestCheckoutOtp,
    openCheckoutAuthFlow,
    setGuestCheckoutUnlocked
  }), [
    hasSavedCustomerDetails,
    savedCustomerDetails,
    rememberCustomerDetails,
    maskedSavedCustomerPreview,
    guestDetailsEditMode,
    isMobileViewport,
    servicesBodyFont,
    servicesDisplayFont,
    customerName,
    customerFirstName,
    customerLastName,
    customerPhone,
    customerEmail,
    customerAddress,
    accountIdentityRawName,
    accountIdentityRawPhone,
    accountIdentityRawEmail,
    handleGuestCustomerNameChange,
    setCustomerFirstName,
    setCustomerLastName,
    setCustomerPhone,
    setCustomerEmail,
    setCustomerAddress,
    setRememberCustomerDetails,
    handleOpenGuestDetailsEditor,
    handleCancelGuestDetailsEditor,
    handleApplyGuestDetails,
    handleRequestGuestCheckoutOtp,
    openCheckoutAuthFlow,
    setGuestCheckoutUnlocked
  ]);
  const openBusinessRegistrationFlow = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!isDgfyCustomerSignedIn) {
      openCanonicalDgfyAuth('register-business');
      return;
    }
    try {
      const payload = await requestJson('/api/v1/dgfy/auth/handoff', {
        method: 'POST',
        authToken: dgfyAuthToken,
        cache: 'no-store'
      });
      window.location.href = buildBusinessRegistrationUrl(String(payload?.handoff_token || '').trim());
    } catch (error) {
      toast.error(normalizeStorefrontErrorMessage(error, 'Unable to start business registration.'));
    }
  }, [dgfyAuthToken, isDgfyCustomerSignedIn, openCanonicalDgfyAuth]);
  const saveServiceBookingDraft = (serviceItem = selectedServiceDetail, nextTab = 'review') => {
    if (!serviceItem) return;
    if (storefrontClosedByHours) {
      setCheckoutError(storefrontClosedMessageBody);
      toast.error(storefrontClosedToastMessage);
      return;
    }
    if (!bookingPermitted || accessCapabilities.booking === false) {
      const message = 'This storefront is not accepting service bookings right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (cart.some((line) => line.category !== 'service')) {
      const message = 'Book services separately from regular product orders.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!serviceAppointmentAt) {
      const message = 'Choose a preferred appointment date and time before adding this booking.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (missingRequiredSelectedServiceIntake.length > 0) {
      const message = `Complete required intake question: ${missingRequiredSelectedServiceIntake[0].label}`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    const targetCartLineId = String(selectedServiceCartLineId || '');
    const nextServiceLine = {
      item_id: serviceItem.item_id,
      cart_line_id: targetCartLineId || createStorefrontIdempotencyKey(`service-line-${serviceItem.item_id}`),
      name: serviceItem.name,
      variantName: serviceItem.variantName || '',
      category: 'service',
      service_detail: serviceItem.service_detail || null,
      quantity: Math.max(1, Number(serviceDraftQuantity || 1)),
      price: Number(serviceItem.default_sale_price ?? 0),
      image_url: withAssetOrigin(serviceItem.image_url) || null,
      unit_of_measure: serviceItem.unit_of_measure || '',
      max_stock: Number.POSITIVE_INFINITY,
      service_notes: String(serviceDraftNotes || '').trim(),
      service_schedule_at: serviceAppointmentAt,
      payment_timing: servicePaymentTiming,
      intake_responses: selectedServiceIntakeFields.length > 0 ? serviceIntakeResponses : null
    };
    setCart((previous) => {
      const hasExistingTarget = targetCartLineId
        && previous.some((line) => String(line.cart_line_id || '') === targetCartLineId);
      if (hasExistingTarget) {
        return previous.map((line) => (
          String(line.cart_line_id || '') === targetCartLineId
            ? nextServiceLine
            : line
        ));
      }
      return [...previous, nextServiceLine];
    });
    setSelectedServiceCartLineId(String(nextServiceLine.cart_line_id || ''));
    setCheckoutError('');
    setQuoteError('');
    setQuoteResult(null);
    setQuoteNeedsRefresh(true);
    setSelectedServiceDetail(null);
    if (isServicesMode) {
      goStoreBookingPage();
    } else {
      openServiceBookingPanel(nextTab);
    }
    toast.success(targetCartLineId ? 'Booking line updated.' : 'Service added to your booking summary.');
  };
  const removeCartItem = (itemId, cartLineId = '') => {
    setCart((prev) => prev.filter((line) => (
      cartLineId
        ? String(line.cart_line_id || '') !== String(cartLineId)
        : Number(line.item_id) !== Number(itemId)
    )));
  };

  const updateQty = (itemId, qty, cartLineId = '') => {
    const parsed = Number(qty);
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) {
      setCart((prev) => prev.filter((line) => (
        cartLineId
          ? String(line.cart_line_id || '') !== String(cartLineId)
          : Number(line.item_id) !== Number(itemId)
      )));
      return;
    }
    let stockWarning = '';
    setCart((prev) => prev.map((line) => {
      const isTargetLine = cartLineId
        ? String(line.cart_line_id || '') === String(cartLineId)
        : Number(line.item_id) === Number(itemId);
      if (!isTargetLine) return line;
      const maxStock = Number.isFinite(Number(line.max_stock)) ? Number(line.max_stock) : Number.POSITIVE_INFINITY;
      const safeQty = Math.min(parsed, maxStock);
      if (parsed > maxStock) {
        stockWarning = buildStockExceededMessage({
          item_name: line.name,
          requested_qty: parsed,
          available_stock: maxStock,
          unit_of_measure: line.unit_of_measure || ''
        });
      }
      return { ...line, quantity: safeQty };
    }));
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };

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
    removeCartItem,
    serviceCartCount,
    serviceCartLines,
    serviceCartTotal,
    servicesDisplayFont,
    servicesPrimary,
    servicesPrimaryDark,
    servicesPrimaryShadow,
    servicesPrimaryShadowStrong,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    withAssetOrigin
  });

  const {
    buildPayload: checkoutPayload,
    handlePromoCardApply,
    requestQuote,
  } = useFnbCheckoutQuote({
    accessCapabilities,
    cart,
    checkoutPermitted,
    checkoutPromoCode,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryAddress: resolvedDeliveryAddress || customerAddress || buildPinnedDeliveryAddress(customerPin),
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    isDeliveryOrder,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
    orderMethod,
    readStoreAuthToken,
    requestJson,
    selectedLocationId,
    selectedStore,
    setCheckoutPromoCode,
    setQuoteError,
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
    guestCheckoutProof,
    handleLoadAccountPanel,
    isDgfyCustomerSignedIn,
    normalizeErrorMessage: normalizeStorefrontErrorMessage,
    orderMethod,
    orderSuccessAnimationTimerRef,
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
  const handlePinMyLocation = () => {
    if (!navigator?.geolocation) {
      setPinLocationError('Geolocation is not supported on this device/browser.');
      return;
    }
    setDeliveryLocationAction('current');
    setSelectedSavedLocationId('');
    setPinLocationError('');
    setPinLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerPin({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        });
        setPinLocationLoading(false);
      },
      (error) => {
        const errorCode = Number(error?.code || 0);
        if (errorCode === 1) {
          setPinLocationError('Location permission is blocked. Pin your location on the map instead.');
        } else if (errorCode === 3) {
          setPinLocationError('Location request timed out. Pin your location on the map instead.');
        } else {
          setPinLocationError('Unable to get your current location.');
        }
        setPinLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

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

  const activeServiceLocationSummary = useMemo(() => (
    trimAddressCountrySuffix(
      deliveryLocationDisplayAddress
      || resolvedDeliveryAddress
      || customerAddress
      || buildPinnedDeliveryAddress(customerPin)
      || ''
    )
  ), [customerAddress, customerPin, deliveryLocationDisplayAddress, resolvedDeliveryAddress]);

  const {
    renderCheckoutPromoStack,
    renderPromoCodePanel
  } = useFnbCheckoutPromoRenderers({
    appliedPromoDiscountText,
    checkoutPromoCode,
    handlePromoCardApply,
    promoSectionModel,
    promoStatusMessage,
    promoStatusTone,
    servicesBodyFont,
    setCheckoutPromoCode
  });

  useEffect(() => {
    if (!isDeliveryOrder || !hasPinnedDeliveryLocation) {
      setResolvingPinnedDeliveryAddress(false);
      if (!isDeliveryOrder) {
        setResolvedDeliveryAddress('');
      }
      return;
    }
    const controller = new AbortController();
    const latitude = Number(customerPin.latitude);
    const longitude = Number(customerPin.longitude);
    const fallbackAddress = buildPinnedDeliveryAddress(customerPin);
    const resolveAddress = async () => {
      setResolvingPinnedDeliveryAddress(true);
      setPinLocationError('');
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&format=jsonv2&addressdetails=1`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/json'
          }
        });
        if (!response.ok) {
          throw new Error(`Reverse geocoding failed: ${response.status}`);
        }
        const payload = await response.json();
        const formattedAddress = formatReverseGeocodedAddress(payload) || fallbackAddress;
        setResolvedDeliveryAddress(formattedAddress);
        setCustomerAddress(formattedAddress);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setResolvedDeliveryAddress('');
        setCustomerAddress(fallbackAddress);
      } finally {
        setResolvingPinnedDeliveryAddress(false);
      }
    };
    resolveAddress();
    return () => controller.abort();
  }, [customerPin, hasPinnedDeliveryLocation, isDeliveryOrder]);

  const copyTextToClipboard = useCallback(async (value, successMessage = 'Copied.') => {
    const text = String(value || '').trim();
    if (!text) {
      toast.error('Nothing to copy.');
      return false;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success(successMessage);
        return true;
      }
    } catch {
      // Fall through to legacy copy path.
    }

    try {
      if (typeof document !== 'undefined') {
        const fallbackInput = document.createElement('textarea');
        fallbackInput.value = text;
        fallbackInput.setAttribute('readonly', '');
        fallbackInput.style.position = 'fixed';
        fallbackInput.style.opacity = '0';
        fallbackInput.style.left = '-9999px';
        document.body.appendChild(fallbackInput);
        fallbackInput.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(fallbackInput);
        if (copied) {
          toast.success(successMessage);
          return true;
        }
      }
    } catch {
      // handled below
    }

    toast.error('Copy failed. Please copy manually.');
    return false;
  }, []);

  const handleQuote = async () => {
    if (!selectedStore) return;
    setQuoteError('');
    if (storefrontClosedByHours) {
      setQuoteError(storefrontClosedMessageBody);
      toast.error(storefrontClosedToastMessage);
      return;
    }
    if (!checkoutPermitted || accessCapabilities.quote === false) {
      const message = 'This storefront is not accepting online checkout right now.';
      setQuoteError(message);
      toast.error(message);
      return;
    }
    try {
      await requestQuote();
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setQuoteError(message);
        toast.error(message);
        return;
      }
      const message = normalizeStorefrontErrorMessage(error, 'Unable to compute quote.');
      setQuoteError(message);
      toast.error(message);
    }
  };

  const handleCheckout = async () => {
    if (!selectedStore) return;
    if (isFnbMode && !hasServiceCart) {
      return handleFnbCheckout();
    }
    setCheckoutError('');
    setCheckoutResult(null);
    const serviceBookingLine = hasServiceCart
      ? activeServiceCartLine
      : (isServicesMode && activeBookingService
        ? {
          item_id: activeBookingService.item_id,
          name: activeBookingService.name,
          variantName: activeBookingService.variantName || '',
          category: 'service',
          service_detail: activeBookingService.service_detail || null,
          quantity: Math.max(1, Number(serviceDraftQuantity || 1)),
          price: Number(activeBookingService.default_sale_price ?? 0),
          image_url: withAssetOrigin(activeBookingService.image_url) || null,
          unit_of_measure: activeBookingService.unit_of_measure || '',
          max_stock: Number.POSITIVE_INFINITY,
          service_notes: '',
          service_schedule_at: serviceAppointmentAt,
          payment_timing: servicePaymentTiming,
          intake_responses: bookingPageIntakeFields.length > 0 ? serviceIntakeResponses : null
        }
        : null);
    if (checkoutBlockReason === 'stock_violation') {
      const message = 'Cannot checkout: one or more items exceed current stock.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'access_mode') {
      const message = 'This storefront is not accepting online checkout right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'business_hours') {
      setCheckoutError(storefrontClosedMessageBody);
      toast.error(storefrontClosedToastMessage);
      return;
    }
    if (requireQuoteForCheckout && !hasServiceCart && checkoutBlockReason === 'missing_quote') {
      const message = 'Please click Quote first before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (requireQuoteForCheckout && !hasServiceCart && checkoutBlockReason === 'stale_quote') {
      const message = 'Your cart changed. Please refresh Quote before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (hasMixedServiceCart) {
      const message = 'Book services separately from regular product orders.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!hasServiceCart && (isServicesMode && activeBookingService) && !serviceAppointmentAt) {
      const message = 'Choose an appointment date and time before booking.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if ((hasServiceCart && serviceCartValidationIssues.length > 0) || (!hasServiceCart && isServicesMode && bookingPageMissingRequiredIntake.length > 0)) {
      const message = hasServiceCart
        ? serviceCartValidationIssues[0]?.message || 'Complete the required booking details before continuing.'
        : `Complete required intake question: ${bookingPageMissingRequiredIntake[0].label}`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    const cartSnapshot = cart.map((line) => ({ ...line }));
    setCheckoutLoading(true);
    try {
      const authToken = isDgfyCustomerSignedIn
        ? (readDgfyAuthToken() || readStoreAuthToken())
        : readStoreAuthToken();
      const servicesSubmitContract = resolveServicesBookingSubmitContract({
        hasServiceCart,
        serviceCartLines,
        serviceBookingLine,
        customerName,
        customerEmail,
        customerPhone,
        selectedLocationId,
        storeLocationId: selectedStore?.location_id,
        paymentTiming: servicePaymentTiming,
        serviceIntakeResponses,
        bookingPageIntakeFields,
        customerAddress,
        bookingFieldPlan,
        createIdempotencyKey: createStorefrontIdempotencyKey
      });
      if ((hasServiceCart || (isServicesMode && serviceBookingLine)) && !servicesSubmitContract.compatible) {
        setCheckoutError(servicesSubmitContract.message);
        toast.error(servicesSubmitContract.message);
        return;
      }
      const data = (hasServiceCart || (isServicesMode && serviceBookingLine))
        ? await requestJson(servicesSubmitContract.route, {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken,
          body: servicesSubmitContract.body
        })
        : await requestJson('/api/v1/store/checkout', {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken,
          body: {
            ...checkoutPayload(),
            idempotency_key: window.crypto?.randomUUID?.() || `store-${Date.now()}`,
            payment_type: fnbPaymentType
          }
        });
      setCheckoutResult({
        ...data,
        cart_lines: hasServiceCart
          ? serviceCartLines
          : cartSnapshot,
        totals: totalsForDisplay
      });
      if (rememberCustomerDetails) {
        const persistedDetails = writeSavedCustomerDetails({
          firstName: resolvedCustomerFirstName,
          lastName: resolvedCustomerLastName,
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          source: isDgfyCustomerSignedIn ? 'account' : 'guest',
          updatedAt: Date.now()
        });
        if (persistedDetails) setSavedCustomerDetails(persistedDetails);
      }
      if (data?.tracking_pin) {
        setTrackingPinInput(data.tracking_pin);
        setSelectedTrackingPin(String(data.tracking_pin || '').trim().toUpperCase());
        syncTrackedOrderSnapshot({
          tracking_pin: data.tracking_pin,
          status: data?.order?.status || 'placed',
          status_label: data?.order?.status_label || 'Order placed',
          order_method: data?.order?.order_method || orderMethod,
          order: data?.order || null,
          order_name: cartSnapshot[0]?.variantName || cartSnapshot[0]?.name || '',
          total_amount: totalsForDisplay?.total_amount ?? 0
        }, data.tracking_pin);
        if (!isSimpleMode) {
          setCheckoutTab('track');
        }
      }
      if (data?.booking?.public_reference) {
        setTrackingPinInput(data.booking.public_reference);
        writeLastTrackingPinForStore(selectedStore?.slug || routeSlug, data.booking.public_reference);
      }
      if (hasServiceCart) {
        setCart((prev) => prev.filter((line) => line.category !== 'service'));
        setSelectedServiceCartLineId('');
      } else {
        setCart([]);
      }
      setQuoteResult(null);
      setQuoteNeedsRefresh(true);
      setCheckoutPromoCode('');
      setServiceAppointmentAt('');
      setServiceDraftQuantity(1);
      setServiceDraftNotes('');
      setServiceIntakeResponses({});
      setServicePaymentPreviewMethod('qr');
      setServicePaymentPreviewCard({ cardholder: '', cardNumber: '', expiry: '', cvv: '' });
      setServicePaymentPreviewReceiptName('');
      if (isDgfyCustomerSignedIn) {
        void handleLoadAccountPanel();
      }
      const submittedTrackingPin = String(data?.tracking_pin || '').trim().toUpperCase();
      if (submittedTrackingPin && !hasServiceCart) {
        setShowOrderSuccessAnimation(false);
        if (orderSuccessAnimationTimerRef.current) {
          window.clearTimeout(orderSuccessAnimationTimerRef.current);
          orderSuccessAnimationTimerRef.current = null;
        }
        setCheckoutResult(null);
        goStoreTrackPage({ pin: submittedTrackingPin });
      } else {
        setFnbOrderStep(4);
        if (isSimpleMode) {
          setSimpleOrderStep(4);
        }
      }
      clearCheckoutAuthResumeDraft();
      toast.success(
        hasServiceCart
          ? 'Bookings created.'
          : (data?.promo_feedback?.message || 'Checkout completed.')
      );
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setCheckoutError(message);
        toast.error(message);
        return;
      }
      const message = hasServiceCart
        ? formatServicesBookingFailureMessage(error, serviceCartLines)
        : normalizeStorefrontErrorMessage(error, 'Unable to complete checkout.');
      setCheckoutError(message);
      toast.error(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDownloadCheckoutImage = async () => {
    if (!checkoutResult) return;
    try {
      const reference = checkoutResult.booking?.public_reference || checkoutResult.tracking_pin || checkoutResult.order?.tracking_pin || 'ticket';
      const dataUrl = await buildTicketImage({
        result: checkoutResult,
        storeName: selectedStore?.tenant_name || routeSlug || DGFY_BRAND_NAME,
        cartLines: Array.isArray(checkoutResult.cart_lines) ? checkoutResult.cart_lines : cart,
        totals: checkoutResult.totals || totalsForDisplay
      });
      downloadDataUrl(dataUrl, `${String(reference).toLowerCase()}-ticket.png`);
    } catch {
      toast.error('Unable to generate ticket image.');
    }
  };

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
  useEffect(() => {
    if (typeof window === 'undefined' || hasAppliedCheckoutAuthResume || !isDgfyCustomerSignedIn) return;
    const draft = readCheckoutAuthResumeDraft();
    const normalizedDraftSlug = toSlug(draft?.routeSlug || '');
    const normalizedCurrentSlug = toSlug(selectedStore?.slug || routeSlug || '');
    if (!draft || !normalizedDraftSlug || !normalizedCurrentSlug || normalizedDraftSlug !== normalizedCurrentSlug) return;
    setCart(Array.isArray(draft.cart) ? draft.cart : []);
    if (draft.selectedLocationId != null) setSelectedLocationId(draft.selectedLocationId);
    if (draft.selectedSavedLocationId) setSelectedSavedLocationId(draft.selectedSavedLocationId);
    if (draft.orderMethod) setOrderMethod(draft.orderMethod);
    if (draft.fnbScheduledFor) setFnbScheduledFor(draft.fnbScheduledFor);
    if (draft.fnbScheduleMode) setFnbScheduleMode(draft.fnbScheduleMode);
    if (draft.fnbSpecialInstructions) setFnbSpecialInstructions(draft.fnbSpecialInstructions);
    if (draft.serviceAppointmentAt) setServiceAppointmentAt(draft.serviceAppointmentAt);
    if (draft.servicePaymentTiming) setServicePaymentTiming(draft.servicePaymentTiming);
    if (draft.customerAddress) setCustomerAddress(draft.customerAddress);
    if (draft.serviceLocationLandmarkNote) setServiceLocationLandmarkNote(draft.serviceLocationLandmarkNote);
    if (draft.resolvedDeliveryAddress) setResolvedDeliveryAddress(draft.resolvedDeliveryAddress);
    if (draft.deliveryLocationAction) setDeliveryLocationAction(draft.deliveryLocationAction);
    if (draft.customerPin) setCustomerPin(draft.customerPin);
    if (draft.serviceIntakeResponses && typeof draft.serviceIntakeResponses === 'object') {
      setServiceIntakeResponses(draft.serviceIntakeResponses);
    }
    const nextFnbStep = draft.checkoutTab === 'cart' ? 3 : null;
    const nextSimpleStep = draft.checkoutTab === 'checkout' && !draft.selectedServiceItemId ? 1 : null;
    const nextServiceStep = draft.selectedServiceItemId ? 1 : null;
    if (Number.isInteger(nextFnbStep) && nextFnbStep > 0) setFnbOrderStep(nextFnbStep);
    if (Number.isInteger(nextSimpleStep) && nextSimpleStep > 0) setSimpleOrderStep(nextSimpleStep);
    if (Number.isInteger(nextServiceStep) && nextServiceStep > 0) setServiceBookingStep(nextServiceStep);
    if (draft.checkoutTab) {
      setCheckoutTab(draft.selectedServiceItemId ? 'checkout' : draft.checkoutTab);
    }
    if (draft.selectedServiceItemId && Array.isArray(catalog) && catalog.length > 0) {
      const matchedService = catalog.find((item) => Number(item?.item_id) === Number(draft.selectedServiceItemId)) || null;
      if (matchedService) setSelectedServiceDetail(matchedService);
    }
    setIsCheckoutOpen(true);
    setHasAppliedCheckoutAuthResume(true);
    clearCheckoutAuthResumeDraft();
    toast.success('Signed in. Resuming your checkout.');
  }, [
    catalog,
    hasAppliedCheckoutAuthResume,
    isDgfyCustomerSignedIn,
    routeSlug,
    selectedStore?.slug
  ]);
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
  const fnbCartDrawerRouteProps = useFnbCartDrawerRouteProps({
    cart,
    cartAddOnsTotal,
    cartCount,
    cartImageErrors,
    cartSubtotal,
    cartTotal,
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
    cartTotal,
    goStoreOrderPage,
    isCheckoutOpen,
    isMobileViewport,
    money,
    removeCartItem,
    servicesDisplayFont,
    servicesPrimary,
    servicesPrimaryDark,
    servicesPrimaryShadowStrong,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    withAssetOrigin
  });
  const isFnbCartDrawerSurfaceOpen = Boolean(fnbCartDrawerRouteProps.isActive);
  const fnbCustomerStepComplete = fnbCustomerIdentityStepComplete && guestCheckoutOtpVerified;
  const fnbAutoQuoteCartSignature = useMemo(() => (
    cart.map((line) => [
      line?.cart_line_id || '',
      line?.item_id || '',
      Number(line?.quantity || 0),
      Number(line?.price || 0),
      Array.isArray(line?.line_modifiers)
        ? line.line_modifiers.map((entry) => `${entry?.modifier_group_id || ''}:${entry?.modifier_option_id || ''}`).join(',')
        : ''
    ].join(':')).join('|')
  ), [cart]);
  useEffect(() => {
    const normalizedPromoCode = String(checkoutPromoCode || '').trim().toUpperCase();
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

    if (!shouldAutoSyncFnbQuote) {
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
      fnbAutoQuoteCartSignature,
      activePinnedDeliveryAddress || ''
    ].join('::');
    if (fnbAutoQuoteSyncKeyRef.current === syncKey) return undefined;

    fnbAutoQuoteSyncKeyRef.current = syncKey;
    let cancelled = false;
    setQuoteError('');
    requestQuote({ promoCodeOverride: normalizedPromoCode, silent: true }).catch((error) => {
      if (cancelled) return;
      fnbAutoQuoteSyncKeyRef.current = '';
      const violation = extractStockViolation(error);
      if (violation) {
        setQuoteError(buildStockExceededMessage(violation));
        return;
      }
      setQuoteError(normalizeStorefrontErrorMessage(error, 'Unable to update order totals.'));
    });

    return () => {
      cancelled = true;
    };
  }, [
    accessCapabilities.quote,
    activePinnedDeliveryAddress,
    buildStockExceededMessage,
    cart.length,
    checkoutPermitted,
    checkoutPromoCode,
    extractStockViolation,
    fnbAutoQuoteCartSignature,
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
  const simpleCustomerStepComplete = isCustomerStepComplete({
    customerName,
    customerPhone,
    customerEmail,
    isDeliveryOrder,
    customerAddress,
    usePinnedAddress: false
  });
  const simpleHasCustomerIdentity = hasCustomerName(customerName);
  const simpleHasPrimaryIdentityContact = hasPrimaryContact({ phone: customerPhone, email: customerEmail });
  const simpleStepOneReady = cart.length > 0;
  const simpleCheckoutAllowed = checkoutAllowed && simpleCustomerStepComplete;
  const simpleCheckoutRouteProps = useSimpleCheckoutRouteProps({
    canUseGuestCheckoutFlow,
    cart,
    cartCount,
    checkoutError,
    checkoutLoading,
    checkoutResult,
    customerAddress,
    customerPin,
    DropdownComponent: StorefrontDropdown,
    fnbPaymentType,
    fnbScheduledFor,
    fnbSpecialInstructions,
    goStoreCatalogPage,
    handleCheckout,
    handleDownloadCheckoutImage,
    handlePaymentTypeChange,
    handlePinMyLocation,
    handleQuote,
    isDeliveryOrder,
    isDesktopCheckout,
    isDgfyCustomerSignedIn,
    isMobileViewport,
    money,
    orderMethod,
    pinLocationError,
    pinLocationLoading,
    promoDiscountSummaryRow,
    quoteError,
    quoteResult,
    renderAccountOwnedIdentitySummary,
    renderCheckoutPromoStack,
    renderGuestCheckoutEntry,
    renderGuestIdentityFields,
    renderStorefrontClosedNotice,
    requireQuoteForCheckout,
    selectedLocation,
    selectedLocationId,
    selectedStore,
    servicesBodyFont,
    servicesDisplayFont,
    setCheckoutResult,
    setCustomerAddress,
    setCustomerPin,
    setFnbScheduledFor,
    setFnbSpecialInstructions,
    setOrderMethod,
    setPinLocationError,
    setSelectedLocationId,
    setSimpleOrderStep,
    simpleCheckoutAllowed,
    simpleCustomerStepComplete,
    simpleHasCustomerIdentity,
    simpleHasPrimaryIdentityContact,
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
    selectedTrackingPin,
    servicesBodyFont,
    servicesDisplayFont,
    setCheckoutTab,
    showCompletedTrackingCard,
    storeLocations,
    storePath,
    tileTransformRequest,
    tilingServer: TILING_SERVER,
    toSlug,
    trackingDrawerOrders,
    trackingError,
    trackingPinInput,
    trackingResult,
    withAssetOrigin
  });
  if (isStandaloneAccountPage) return customerDashboardStandaloneRouteNode;

  return (
    <main style={{ fontFamily: isFnbMode ? (modeAdapter.heroTheme?.bodyFont || "'Inter', 'Segoe UI', sans-serif") : (isServicesMode ? servicesBodyFont : STYLES.fonts.body), background: isStorePage ? (isFnbMode ? '#fff' : 'radial-gradient(circle at 20% 0%, #fff7ed 0%, #f8fafc 40%, #eef2f7 100%)') : '#ffffff', minHeight: '100vh', color: '#0f172a', overflowX: 'clip' }}>
      <div style={{
        maxWidth: 1320,
        width: '100%',
        boxSizing: 'border-box',
        margin: '0 auto',
        paddingTop: isStorePage && (isServicesMode || isFnbMode || isSimpleMode) ? 0 : (isMobileViewport ? 6 : 10),
        paddingRight: isStorePage && (isServicesMode || isFnbMode || isSimpleMode) ? 0 : (isMobileViewport ? 12 : 20),
        paddingLeft: isStorePage && (isServicesMode || isFnbMode || isSimpleMode) ? 0 : (isMobileViewport ? 12 : 20),
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
              buildBusinessLoginUrl={buildBusinessLoginUrl}
              buildBusinessRegistrationUrl={buildBusinessRegistrationUrl}
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
          <>
            {selectedStore && (
              <div style={{ position: 'absolute', left: -99999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                {selectedStore.storefront_profile_image_url ? (
                  <img alt={`${selectedStore.tenant_name} profile`} src={withAssetOrigin(selectedStore.storefront_profile_image_url)} />
                ) : null}
                {selectedStore.storefront_cover_image_url ? (
                  <img alt={`${selectedStore.tenant_name} cover`} src={withAssetOrigin(selectedStore.storefront_cover_image_url)} />
                ) : null}
                <div>{`Tenant page: ${routeSlug}`}</div>
                {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 ? <div>Storefront items are not set up yet</div> : null}
                {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 ? <div>Customer checkout will be available once at least one storefront item is enabled.</div> : null}
                {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 && hasCatalogSearchQuery ? <div>No items are available to search yet</div> : null}
              </div>
            )}
            {isServicesMode && !isBookingSubpage && !isServiceDetailsSubpage && selectedStore && serviceHeroModel && (
              <ServicesHero
                  serviceHeroModel={serviceHeroModel}
                  selectedStore={selectedStore}
                  isMobileViewport={isMobileViewport}
                  viewportWidth={viewportWidth}
                  hasMultipleStoreBranches={hasMultipleStoreBranches}
                hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
                selectedLocationId={selectedLocationId}
                handleBranchMenuSelection={handleBranchMenuSelection}
                storeLocations={storeLocations}
                catalogSearch={catalogSearch}
                setCatalogSearch={setCatalogSearch}
                goDiscovery={goDiscovery}
                hasServiceCart={hasServiceCart}
                goStoreBookingPage={goStoreBookingPage}
                cartCount={cartCount}
                modeAdapter={modeAdapter}
                isBrandingImageBlocked={isBrandingImageBlocked}
                markBrandingImageError={markBrandingImageError}
                selectedLocation={selectedLocation}
                isAboutExpanded={isAboutExpanded}
                setIsAboutExpanded={setIsAboutExpanded}
                  isServiceGalleryExpanded={isServiceGalleryExpanded}
                  setIsServiceGalleryExpanded={setIsServiceGalleryExpanded}
                  openStorefrontActionLink={openStorefrontActionLink}
                  openTrackPanel={openTrackPanel}
                  openAccountPanel={openStorefrontHeaderAccount}
                  onRegisterBusiness={openBusinessRegistrationFlow}
                  isStorefrontAccountAuthenticated={isStorefrontAccountAuthenticated}
                  activeCustomerOrderCount={activeCustomerOrderCount}
                  accountIdentityName={accountIdentityName}
                  accountIdentityRawEmail={accountIdentityRawEmail}
                  accountIdentityContact={accountIdentityContact}
                  accountIdentityInitials={accountIdentityInitials}
                  followEnabled={followUiEnabledForStore}
                  shareEnabled={shareEnabledForStore}
                  followState={followState}
                  handleFollowAction={handleFollowAction}
                  ui={{
                    Badge,
                    GhostButton,
                    PrimaryButton,
                    StorefrontExpandableBusinessHours,
                    StorefrontHeroShell
                  }}
                  heroStyles={{
                    HERO_CANVAS_MAX_WIDTH,
                    MAX_STOREFRONT_WHY_CHOOSE_US,
                    MOBILE_DROPDOWN_MENU_STYLE,
                    MOBILE_DROPDOWN_OPTION_STYLE,
                    MOBILE_NATIVE_SELECT_STYLE,
                    STOREFRONT_CONTACT_INFO_COLUMNS,
                    STOREFRONT_INFO_ICON_COLUMN,
                    STOREFRONT_INFO_PANEL_MAX_WIDTH,
                    STOREFRONT_INFO_ROW_GAP,
                    STYLES
                  }}
                  helperFns={{
                    buildVisibleStorefrontContactRows,
                    getDeliveryPlatformLinks
                  }}
                />
            )}
            {!isServicesMode && (
              <>
                {/* ZONE 1: Navigation & Header */}
                {!isFnbMode && !isSimpleMode && (
                  <section style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <GhostButton onClick={goDiscovery} style={{ padding: '8px 16px', minHeight: 44, fontSize: 13 }}>
                      Back to Discovery
                    </GhostButton>
                    <div style={{ color: STYLES.colors.muted, fontSize: 13, fontWeight: 700 }}>{routeSlug} {' / '} {selectedStore?.tenant_name}</div>
                    <div style={{ position: 'absolute', left: -99999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                      Tenant page: {routeSlug}
                    </div>
                  </section>
                )}

                {/* ZONE 2: Hero Branding */}
                {isFnbMode && !isOrderSubpage && !isFnbDetailsSubpage ? (
                  <FnbHero
                    modeAdapter={modeAdapter}
                    heroSectionModel={heroSectionModel}
                    fnbViewModel={fnbViewModel}
                    selectedStore={selectedStore}
                    isMobileViewport={isMobileViewport}
                    cartCount={cartCount}
                    setIsCheckoutOpen={setIsCheckoutOpen}
                    goDiscovery={goDiscovery}
                    hasMultipleStoreBranches={hasMultipleStoreBranches}
                    hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
                    selectedLocationId={selectedLocationId}
                    handleBranchMenuSelection={handleBranchMenuSelection}
                    storeLocations={storeLocations}
                    catalogSearch={catalogSearch}
                    setCatalogSearch={setCatalogSearch}
                  isBrandingImageBlocked={isBrandingImageBlocked}
                  markBrandingImageError={markBrandingImageError}
                  selectedLocation={selectedLocation}
                    openStorefrontActionLink={openStorefrontActionLink}
                    openTrackPanel={openTrackPanel}
                    openAccountPanel={openStorefrontHeaderAccount}
                    onRegisterBusiness={openBusinessRegistrationFlow}
                    isStorefrontAccountAuthenticated={isStorefrontAccountAuthenticated}
                    activeCustomerOrderCount={activeCustomerOrderCount}
                    accountIdentityName={accountIdentityName}
                    accountIdentityRawEmail={accountIdentityRawEmail}
                    accountIdentityContact={accountIdentityContact}
                    accountIdentityInitials={accountIdentityInitials}
                    followEnabled={followUiEnabledForStore}
                    shareEnabled={shareEnabledForStore}
                    followState={followState}
                    handleFollowAction={handleFollowAction}
                    handleShareAction={handleShareAction}
                    ui={{ StorefrontExpandableBusinessHours }}
                    heroStyles={{ HERO_CANVAS_MAX_WIDTH, MAX_STOREFRONT_WHY_CHOOSE_US, MOBILE_DROPDOWN_MENU_STYLE, MOBILE_DROPDOWN_OPTION_STYLE, MOBILE_NATIVE_SELECT_STYLE, STOREFRONT_CONTACT_INFO_COLUMNS, STOREFRONT_INFO_ICON_COLUMN, STOREFRONT_INFO_ROW_GAP, STYLES }}
                    helperFns={{ getDeliveryPlatformLinks }}
                  />
                ) : isSimpleMode && !isResolvedOrderSubpage && simpleStorefrontModel ? (
                  <SimpleHero
                    simpleHeroModel={simpleStorefrontModel}
                    selectedStore={selectedStore}
                    isMobileViewport={isMobileViewport}
                    hasMultipleStoreBranches={hasMultipleStoreBranches}
                    hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
                    selectedLocationId={selectedLocationId}
                    handleBranchMenuSelection={handleBranchMenuSelection}
                    storeLocations={storeLocations}
                    catalogSearch={catalogSearch}
                    setCatalogSearch={setCatalogSearch}
                    goDiscovery={goDiscovery}
                    cartCount={cartCount}
                    setIsCheckoutOpen={setIsCheckoutOpen}
                    modeAdapter={modeAdapter}
                    isBrandingImageBlocked={isBrandingImageBlocked}
                    markBrandingImageError={markBrandingImageError}
                    selectedLocation={selectedLocation}
                    openStorefrontActionLink={openStorefrontActionLink}
                    openTrackPanel={openTrackPanel}
                    openAccountPanel={openStorefrontHeaderAccount}
                    onRegisterBusiness={openBusinessRegistrationFlow}
                    isStorefrontAccountAuthenticated={isStorefrontAccountAuthenticated}
                    activeCustomerOrderCount={activeCustomerOrderCount}
                    accountIdentityName={accountIdentityName}
                    accountIdentityRawEmail={accountIdentityRawEmail}
                    accountIdentityContact={accountIdentityContact}
                    accountIdentityInitials={accountIdentityInitials}
                    followEnabled={followUiEnabledForStore}
                    shareEnabled={shareEnabledForStore}
                    followState={followState}
                    handleFollowAction={handleFollowAction}
                    handleShareAction={handleShareAction}
                    ui={{ Badge, GhostButton, PrimaryButton, StorefrontExpandableBusinessHours, StorefrontHeroShell }}
                    heroStyles={{ HERO_CANVAS_MAX_WIDTH, MAX_STOREFRONT_WHY_CHOOSE_US, MOBILE_DROPDOWN_MENU_STYLE, MOBILE_DROPDOWN_OPTION_STYLE, MOBILE_NATIVE_SELECT_STYLE, STOREFRONT_CONTACT_INFO_COLUMNS, STOREFRONT_INFO_ICON_COLUMN, STOREFRONT_INFO_PANEL_MAX_WIDTH, STOREFRONT_INFO_ROW_GAP, STYLES }}
                    helperFns={{ buildVisibleStorefrontContactRows }}
                  />
                ) : (!isFnbMode && !isSimpleMode) ? (
                  <DefaultStorefrontHero
                    HERO_CANVAS_MAX_WIDTH={HERO_CANVAS_MAX_WIDTH}
                    STYLES={STYLES}
                    modeAdapter={modeAdapter}
                    selectedStore={selectedStore}
                    isMobileViewport={isMobileViewport}
                    handleShareAction={handleShareAction}
                    setIsCheckoutOpen={setIsCheckoutOpen}
                  />
                ) : null}
              </>
            )}

            {/* ZONE 3: Location Map Snapshot */}
            {!isServicesMode && !isFnbMode && !isSimpleMode && selectedStore && (
              <section style={{ background: '#fff', borderRadius: STYLES.radius.card, border: `1px solid ${STYLES.colors.border}`, padding: 16, marginBottom: 24, boxShadow: STYLES.shadow.sm }}>
                <StoresMap
                  stores={storeLocations.length > 0 ? storeLocations.map(l => ({ ...l, tenant_name: selectedStore?.tenant_name })) : [selectedStore]}
                  selectedKey={selectedLocationId != null ? `loc-${selectedLocationId}` : null}
                  onSelectStore={(l) => l?.location_id && setSelectedLocationId(l.location_id)}
                />
              </section>
            )}

            {isHospitalityMode && selectedStore && (
              <section style={{ marginBottom: 24 }}>
                <HospitalityBookingPanel
                  selectedStore={selectedStore}
                  selectedLocationId={selectedLocationId}
                  isMobileViewport={isMobileViewport}
                />
              </section>
            )}

            {/* ZONE 4: Catalog Grid with Sidebar */}
            {catalogPermitted && selectedStore && (() => {
              // --- Service Tab logic ---
              const isMultiGroup = isServicesMode && servicesViewModel.serviceGroups.length > 1;
              const resolvedTab = isMultiGroup
                ? (activeServiceTab && servicesViewModel.serviceGroups.some((g) => g.categoryKey === activeServiceTab)
                  ? activeServiceTab
                  : '')
                : '';
              const activeGroup = resolvedTab
                ? (servicesViewModel.serviceGroups.find((g) => g.categoryKey === resolvedTab) || null)
                : null;
              const fnbSections = fnbCatalogPresentation.menuSections;
              const resolvedFnbSection = fnbCatalogPresentation.resolvedSection;
              const activeFnbSection = fnbCatalogPresentation.activeSectionModel;
              const rawItemsToRender = isServicesMode
                ? (resolvedTab ? (activeGroup?.items || []) : servicesViewModel.allServices)
                : isFnbMode
                  ? (resolvedFnbSection ? (activeFnbSection?.items || []) : filteredFnbViewModel.menuItems)
                  : filteredCatalog;
              const itemsToRender = isFnbMode ? fnbCatalogPresentation.sortedItems : rawItemsToRender;
              const totalFnbPages = isFnbMode ? fnbCatalogPresentation.totalPages : 1;
              const resolvedFnbPage = isFnbMode ? fnbCatalogPresentation.resolvedPage : 1;
              const catalogItemsToRender = isFnbMode ? fnbCatalogPresentation.visibleItems : itemsToRender;
              const fnbPageStart = !isFnbMode || itemsToRender.length === 0 ? 0 : ((resolvedFnbPage - 1) * fnbPageSize) + 1;
              const fnbPageEnd = !isFnbMode ? itemsToRender.length : Math.min(itemsToRender.length, resolvedFnbPage * fnbPageSize);
              const activeGroupMeta = activeGroup?.categoryMeta;
              const ActiveServiceGroupIcon = activeGroupMeta?.iconToken ? (SERVICE_CATEGORY_ICON_MAP[activeGroupMeta.iconToken] || Sparkles) : Sparkles;

              if ((isFnbMode || isSimpleMode) && isFnbDetailsSubpage) {
                return (
                  <FnbProductDetailsRoute
                    isActive
                    {...fnbProductDetailsRouteProps}
                  />
                );
              }

              if (isServicesMode) {
                return (
                  <StorefrontServicesCatalog
                    DeliveryPinMap={DeliveryPinMap}
                    activeBookingService={activeBookingService}
                    activeServiceLocationSummary={activeServiceLocationSummary}
                    addToCart={addToCart}
                    bookingDateOptions={bookingDateOptions}
                    bookingFieldPlan={bookingFieldPlan}
                    bookingPagePaymentOptions={bookingPagePaymentOptions}
                    bookingPreferredDateInputRef={bookingPreferredDateInputRef}
                    bookingStepOneAdditionalFields={bookingStepOneAdditionalFields}
                    bookingSummaryAmount={bookingSummaryAmount}
                    bookingSummaryQuantity={bookingSummaryQuantity}
                    bookingTimeSlotOptions={bookingTimeSlotOptions}
                    canAddPinnedLocation={canAddPinnedLocation}
                    canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
                    catalog={catalog}
                    catalogError={catalogError}
                    catalogSearch={catalogSearch}
                    checkoutError={checkoutError}
                    checkoutPromoCode={checkoutPromoCode}
                    checkoutResult={checkoutResult}
                    customerEmail={customerEmail}
                    customerName={customerName}
                    customerPhone={customerPhone}
                    customerPin={customerPin}
                    deliveryLocationAction={deliveryLocationAction}
                    deliveryLocationDisplayAddress={deliveryLocationDisplayAddress}
                    deliverySavedLocations={deliverySavedLocations}
                    filteredCatalog={filteredCatalog}
                    getCartFlySourceRect={getCartFlySourceRect}
                    goStoreCatalogPage={goStoreCatalogPage}
                    handleAddPinnedLocation={handleAddPinnedLocation}
                    handleCheckout={handleCheckout}
                    handlePinMyLocation={handlePinMyLocation}
                    handlePromoCardApply={handlePromoCardApply}
                    hasServiceCart={hasServiceCart}
                    isBookingSubpage={isBookingSubpage}
                    isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
                    isMobileViewport={isMobileViewport}
                    isReviewModalOpen={isReviewModalOpen}
                    isServiceDetailsSubpage={isServiceDetailsSubpage}
                    isServiceFilterOpen={isServiceFilterOpen}
                    itemsToRender={itemsToRender}
                    jumpToBookingField={jumpToBookingField}
                    loadingCatalog={loadingCatalog}
                    missingCustomerInformation={missingCustomerInformation}
                    missingScheduleAndServiceInfo={missingScheduleAndServiceInfo}
                    missingStepOneAdditionalFields={missingStepOneAdditionalFields}
                    openPreferredBookingDatePicker={openPreferredBookingDatePicker}
                    openServiceCartEditor={openServiceCartEditor}
                    openServiceDetail={openServiceDetail}
                    pinLocationError={pinLocationError}
                    pinLocationLoading={pinLocationLoading}
                    promoSectionModel={promoSectionModel}
                    refreshStorePageForTenantSetup={refreshStorePageForTenantSetup}
                    registerBookingFieldRef={registerBookingFieldRef}
                    renderAccountOwnedIdentitySummary={renderAccountOwnedIdentitySummary}
                    renderGuestCheckoutEntry={renderGuestCheckoutEntry}
                    renderGuestIdentityFields={renderGuestIdentityFields}
                    resolvedTab={resolvedTab}
                    reviewDraft={reviewDraft}
                    reviewServiceLines={reviewServiceLines}
                    routeServiceItemId={routeServiceItemId}
                    selectedLocation={selectedLocation}
                    selectedSavedLocationId={selectedSavedLocationId}
                    selectedServiceCartLineId={selectedServiceCartLineId}
                    selectedServiceDatePart={selectedServiceDatePart}
                    selectedServiceDetail={selectedServiceDetail}
                    selectedServiceTimePart={selectedServiceTimePart}
                    serviceAreaFilter={serviceAreaFilter}
                    serviceAvailabilityFilter={serviceAvailabilityFilter}
                    serviceBookingStep={serviceBookingStep}
                    serviceBookingSummaryLineItems={serviceBookingSummaryLineItems}
                    serviceBookingSummaryRows={serviceBookingSummaryRows}
                    serviceBookingSummaryTitle={serviceBookingSummaryTitle}
                    serviceCartLines={serviceCartLines}
                    serviceDraftQuantity={serviceDraftQuantity}
                    serviceDurationFilter={serviceDurationFilter}
                    serviceHeroModel={serviceHeroModel}
                    serviceIntakeResponses={serviceIntakeResponses}
                    serviceLocationLandmarkNote={serviceLocationLandmarkNote}
                    servicePage={servicePage}
                    servicePageSize={servicePageSize}
                    servicePaymentPreviewCard={servicePaymentPreviewCard}
                    servicePaymentPreviewMethod={servicePaymentPreviewMethod}
                    servicePaymentPreviewReceiptName={servicePaymentPreviewReceiptName}
                    servicePaymentTiming={servicePaymentTiming}
                    serviceSortOption={serviceSortOption}
                    serviceUnitType={serviceUnitType}
                    servicesBodyFont={servicesBodyFont}
                    servicesDisplayFont={servicesDisplayFont}
                    servicesLayoutMode={servicesLayoutMode}
                    servicesPrimary={servicesPrimary}
                    servicesPrimaryBorder={servicesPrimaryBorder}
                    servicesPrimaryDark={servicesPrimaryDark}
                    servicesPrimaryShadow={servicesPrimaryShadow}
                    servicesPrimaryShadowStrong={servicesPrimaryShadowStrong}
                    servicesPrimarySoft={servicesPrimarySoft}
                    servicesViewModel={servicesViewModel}
                    setActiveServiceTab={setActiveServiceTab}
                    setCatalogSearch={setCatalogSearch}
                    setCheckoutResult={setCheckoutResult}
                    setCustomerPin={setCustomerPin}
                    setDeliveryLocationAction={setDeliveryLocationAction}
                    setIsReviewModalOpen={setIsReviewModalOpen}
                    setIsServiceFilterOpen={setIsServiceFilterOpen}
                    setReviewDraft={setReviewDraft}
                    setSelectedSavedLocationId={setSelectedSavedLocationId}
                    setServiceAppointmentAt={setServiceAppointmentAt}
                    setServiceAreaFilter={setServiceAreaFilter}
                    setServiceAvailabilityFilter={setServiceAvailabilityFilter}
                    setServiceBookingStep={setServiceBookingStep}
                    setServiceDraftQuantity={setServiceDraftQuantity}
                    setServiceDurationFilter={setServiceDurationFilter}
                    setServiceIntakeResponses={setServiceIntakeResponses}
                    setServiceLocationLandmarkNote={setServiceLocationLandmarkNote}
                    setServicePage={setServicePage}
                    setServicePageSize={setServicePageSize}
                    setServicePaymentPreviewCard={setServicePaymentPreviewCard}
                    setServicePaymentPreviewMethod={setServicePaymentPreviewMethod}
                    setServicePaymentPreviewReceiptName={setServicePaymentPreviewReceiptName}
                    setServicePaymentTiming={setServicePaymentTiming}
                    setServiceSortOption={setServiceSortOption}
                    setServiceUnitType={setServiceUnitType}
                    setShowExpandedDeliveryMap={setShowExpandedDeliveryMap}
                    showExpandedDeliveryMap={showExpandedDeliveryMap}
                    stepOneComplete={stepOneComplete}
                    storefrontClosedByHours={storefrontClosedByHours}
                    storefrontClosedMessageBody={storefrontClosedMessageBody}
                    submitFnbItemReview={submitFnbItemReview}
                    viewportWidth={viewportWidth}
                  />
                );
              }

return (
  <>
    <style>{`
      @keyframes promoCardFloatIn {
        0% {
          opacity: 0;
          transform: translateY(10px) scale(0.985);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `}</style>
  <div style={{
    display: 'grid',
    gap: isFnbMode ? 0 : 24,
    gridTemplateColumns: (isServicesMode && !isMobileViewport) ? '1fr 340px' : '1fr',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box'
  }}>
    <div style={{ display: 'grid', gap: isFnbMode ? 0 : 24, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {!(isSimpleMode && isResolvedOrderSubpage) && (
      <section id="storefront-catalog-section" style={{
        display: 'grid',
        gap: isFnbMode ? (isMobileViewport ? 16 : 24) : (isSimpleMode ? 22 : undefined),
        marginTop: isFnbMode
          ? (isMobileViewport ? 0 : 34)
          : (isSimpleMode ? (isMobileViewport ? 28 : 36) : undefined),
        background: isSimpleMode ? 'transparent' : '#fff',
        border: isFnbMode ? 'none' : (isSimpleMode ? 'none' : `1px solid ${STYLES.colors.border}`),
        borderRadius: isFnbMode ? 0 : (isSimpleMode ? 0 : STYLES.radius.card),
        padding: isFnbMode
          ? (isMobileViewport ? '20px 0 24px' : '32px 0 52px')
          : (isSimpleMode ? 0 : (isMobileViewport ? 16 : 32)),
        boxShadow: isFnbMode ? 'none' : (isSimpleMode ? 'none' : STYLES.shadow.sm),
        marginLeft: isFnbMode && !isMobileViewport ? 'calc(50% - 50vw)' : undefined,
        width: isFnbMode ? (isMobileViewport ? '100%' : '100vw') : undefined,
        maxWidth: isFnbMode && isMobileViewport ? '100%' : undefined,
        minWidth: isFnbMode && isMobileViewport ? 0 : undefined,
        boxSizing: 'border-box'
      }}>

        {isFnbMode && (
          <FnbCatalogToolbar
            FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP}
            STYLES={STYLES}
            catalogSearch={catalogSearch}
            filteredFnbViewModel={filteredFnbViewModel}
            fnbCategoryDropdownRef={fnbCategoryDropdownRef}
            fnbMobileMenuInnerWidth={fnbMobileMenuInnerWidth}
            fnbSortOption={fnbSortOption}
            fnbViewMode={fnbViewMode}
            isFnbCategoryDropdownOpen={isFnbCategoryDropdownOpen}
            isMobileViewport={isMobileViewport}
            modeAdapter={modeAdapter}
            resolvedFnbSection={resolvedFnbSection}
            setActiveServiceTab={setActiveServiceTab}
            setCatalogSearch={setCatalogSearch}
            setFnbSortOption={setFnbSortOption}
            setFnbViewMode={setFnbViewMode}
            setIsFnbCategoryDropdownOpen={setIsFnbCategoryDropdownOpen}
          />
        )}


        {/* Section header */}
        {((!isFnbMode && !isSimpleMode) || isMultiGroup) && (
          <div style={{ marginBottom: isMultiGroup ? 20 : 32 }}>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: STYLES.colors.dark }}>{modeAdapter.catalogHeading}</h2>
            <p style={{ margin: '4px 0 0 0', color: STYLES.colors.muted, fontSize: 15 }}>{modeAdapter.catalogSubtitle}</p>
          </div>
        )}

        {/* Service Family Tabs (only shown when multiple groups exist) */}
        {isMultiGroup && (
          <div style={{ marginBottom: 28 }}>
            {/* Tab scrollable strip */}
            <div style={{
              display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
              scrollbarWidth: 'none'
            }}>
              {servicesViewModel.serviceGroups.map(group => {
                const isActive = resolvedTab === group.categoryKey;
                const meta = group.categoryMeta;
                const GroupIcon = SERVICE_CATEGORY_ICON_MAP[meta?.iconToken] || Sparkles;
                return (
                  <button
                    key={group.categoryKey}
                    type="button"
                    onClick={() => setActiveServiceTab(group.categoryKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      flexShrink: 0,
                      padding: isMobileViewport ? '10px 16px' : '12px 20px',
                      borderRadius: 14,
                      border: isActive ? `2px solid ${meta.accent}` : `1.5px solid ${STYLES.colors.border}`,
                      background: isActive ? meta.accentBg || '#f0fdfa' : '#fff',
                      color: isActive ? meta.accent : STYLES.colors.text,
                      fontWeight: isActive ? 800 : 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      boxShadow: isActive ? `0 4px 16px ${meta.accent}22` : 'none'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      <GroupIcon size={18} />
                    </span>
                    <span>{meta.label}</span>
                    <span style={{
                      marginLeft: 4, padding: '2px 8px', borderRadius: 99,
                      fontSize: 11, fontWeight: 800,
                      background: isActive ? meta.accent : STYLES.colors.bg,
                      color: isActive ? '#fff' : STYLES.colors.muted
                    }}>
                      {group.items.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active tab description bar */}
            {activeGroupMeta && (
              <div style={{
                marginTop: 14, padding: '14px 18px',
                borderRadius: 14, border: `1px solid ${activeGroupMeta.accent}33`,
                background: activeGroupMeta.accentBg || '#f0fdfa',
                display: 'flex', alignItems: 'center', gap: 14
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: activeGroupMeta.accent }}>
                  <ActiveServiceGroupIcon size={26} />
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: activeGroupMeta.accent }}>{activeGroupMeta.label}</div>
                  <div style={{ fontSize: 13, color: STYLES.colors.text, marginTop: 2 }}>{activeGroupMeta.description}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: STYLES.colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Area</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: activeGroupMeta.accent }}>{activeGroupMeta.areaLabel}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {isSimpleMode && (
          <div style={{ display: 'grid', gap: 16, padding: isMobileViewport ? '0 4px' : '0 2px 4px' }}>
            <div style={{
              display: 'flex',
              alignItems: isMobileViewport ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexDirection: isMobileViewport ? 'column' : 'row'
            }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  color: modeAdapter.heroTheme?.accentDark || '#134e4a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em'
                }}>
                  <span style={{ width: 30, height: 1, background: modeAdapter.heroTheme?.accent || '#0f766e' }} />
                  Product Section
                </div>
                <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 34, fontWeight: 900, color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark, letterSpacing: '-0.03em', fontFamily: modeAdapter.heroTheme?.displayFont }}>
                  {modeAdapter.catalogHeading}
                </h2>
                <p style={{ margin: 0, color: modeAdapter.heroTheme?.textMuted || STYLES.colors.muted, fontSize: 15, maxWidth: 720, lineHeight: 1.6 }}>
                  {modeAdapter.catalogSubtitle}
                </p>
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 999,
                background: modeAdapter.heroTheme?.accentSoft || '#ecfeff',
                border: `1px solid ${modeAdapter.heroTheme?.borderSoft || '#bfe8e4'}`,
                color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark,
                fontSize: 13,
                fontWeight: 800
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: modeAdapter.heroTheme?.accent || '#0f766e' }} />
                {filteredCatalog.length} product{Number(filteredCatalog.length) === 1 ? '' : 's'} in this storefront
              </div>
            </div>
            <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(15,118,110,0.18) 0%, rgba(15,23,42,0.06) 100%)' }} />
          </div>
        )}

        {/* Catalog items grid */}
        {!isFnbMode && !isSimpleMode && (
          <div style={{ maxWidth: 1320, margin: `${isMobileViewport ? 12 : 16}px auto 0`, width: '100%', padding: isMobileViewport ? '0 16px' : '0 24px' }}>
            <input
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Search items in this store catalog..."
              style={{
                width: '100%',
                border: '1px solid #cbd5e1',
                borderRadius: 12,
                padding: '11px 12px',
                fontSize: 14,
                background: '#fff'
              }}
            />
          </div>
        )}

        <StoreCatalogEmptyStates
          catalogState={catalogState}
          catalogError={catalogError}
          catalogSearch={catalogSearch}
          filteredCatalog={filteredCatalog}
          hasCatalogSearchQuery={hasCatalogSearchQuery}
          isMobileViewport={isMobileViewport}
          isServicesMode={isServicesMode}
          onRefreshTenantPage={refreshStorePageForTenantSetup}
        />

        {(catalogState === 'ready' || catalogState === 'empty_no_match') && (
          <div style={isFnbMode ? {
            maxWidth: 1320,
            margin: `${isMobileViewport ? 20 : 28}px auto 0`,
            width: '100%',
            boxSizing: 'border-box',
            padding: isMobileViewport ? fnbMobileCatalogInlinePadding : '0 24px'
          } : undefined}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isMobileViewport ? 12 : 24, width: isMobileViewport ? fnbMobileMenuInnerWidth : '100%', maxWidth: '100%', justifyItems: isMobileViewport ? 'center' : 'stretch', margin: isMobileViewport ? '0 auto' : 0 }}>
              {catalogItemsToRender.map((item) => {
                const imageUrl = withAssetOrigin(item.image_url);
                const available = isItemAvailable(item);
                const ServiceCategoryIcon = SERVICE_CATEGORY_ICON_MAP[item.categoryMeta?.iconToken] || Sparkles;
                return (
                  isFnbMode ? (
                    <FnbProductCard
                      key={item.item_id + '-' + fnbViewMode}
                      item={item}
                      imageUrl={imageUrl}
                      available={available}
                      FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP}
                      addToCart={addToCart}
                      buttonTextOnAccent={(modeAdapter.heroTheme || {}).buttonTextOnAccent || '#fffdf9'}
                      getCartFlySourceRect={getCartFlySourceRect}
                      heroTheme={modeAdapter.heroTheme || {}}
                      isMobileViewport={isMobileViewport}
                      fnbViewMode={fnbViewMode}
                      money={money}
                      onViewDetails={openFnbDetail}
                    />
                  ) : isSimpleMode ? (
                    <SimpleProductCard
                      key={item.item_id}
                      Badge={Badge}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      accentDark={(modeAdapter.heroTheme || {}).accentDark || '#134e4a'}
                      accentSoft={(modeAdapter.heroTheme || {}).accentSoft || '#ecfeff'}
                      item={item}
                      imageUrl={imageUrl}
                      available={available}
                      addToCart={addToCart}
                      bodyFont={(modeAdapter.heroTheme || {}).bodyFont || "'Avenir Next', 'Segoe UI', sans-serif"}
                      displayFont={(modeAdapter.heroTheme || {}).displayFont || ((modeAdapter.heroTheme || {}).bodyFont || "'Avenir Next', 'Segoe UI', sans-serif")}
                      money={money}
                      onViewDetails={openFnbDetail}
                    />
                  ) : (
                    <ServiceProductCard
                      key={item.item_id}
                      item={item}
                      imageUrl={imageUrl}
                      available={available}
                      money={money}
                      styles={STYLES}
                      servicesPrimary={servicesPrimary}
                      servicesPrimaryDark={servicesPrimaryDark}
                      CategoryIcon={ServiceCategoryIcon}
                      Badge={Badge}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      addToCart={addToCart}
                      getCartFlySourceRect={getCartFlySourceRect}
                      onViewDetails={openServiceDetail}
                    />
                  )
                );
              })}
              {catalogItemsToRender.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: STYLES.colors.muted }}>
                  {isFnbMode
                    ? 'No menu items match the current search or section yet.'
                    : (isSimpleMode ? 'No simple-mode products match the current search yet.' : 'No products available in this category yet.')}
                </div>
              )}
            </div>

            {isFnbMode && itemsToRender.length > 0 && totalFnbPages > 1 && (
              <div style={{
                marginTop: isMobileViewport ? 20 : 36,
                display: 'grid',
                gap: isCompactPaginationViewport ? 8 : 12,
                padding: isCompactPaginationViewport ? '12px 0' : isTabletPaginationViewport ? '14px 0' : '16px 0',
                paddingBottom: isCompactPaginationViewport ? 20 : 12,
                width: isMobileViewport ? fnbMobileMenuInnerWidth : '100%',
                margin: isMobileViewport ? '0 auto' : 0,
                boxSizing: 'border-box'
              }}>
                {(() => {
                  const pageWindowSize = isCompactPaginationViewport ? 3 : 5;
                  const pageWindowOffset = isCompactPaginationViewport ? 1 : 2;
                  const compactVisiblePages = (() => {
                    if (!isCompactPaginationViewport || totalFnbPages <= 4) {
                      return [];
                    }
                    if (resolvedFnbPage <= 3) {
                      return [1, 2, 3];
                    }
                    if (resolvedFnbPage >= totalFnbPages - 2) {
                      return [Math.max(1, totalFnbPages - 3), Math.max(1, totalFnbPages - 2), Math.max(1, totalFnbPages - 1)];
                    }
                    return [resolvedFnbPage - 1, resolvedFnbPage, resolvedFnbPage + 1];
                  })();
                  const pageSliceStart = Math.max(0, resolvedFnbPage - pageWindowOffset - 1);
                  const visiblePages = isCompactPaginationViewport
                    ? (totalFnbPages <= 4
                      ? Array.from({ length: totalFnbPages }, (_, index) => index + 1)
                      : compactVisiblePages.filter((pageNumber, index, pages) => Number.isFinite(pageNumber) && pageNumber > 0 && pageNumber < totalFnbPages && pages.indexOf(pageNumber) === index))
                    : Array.from({ length: totalFnbPages }, (_, index) => index + 1)
                      .slice(pageSliceStart, pageSliceStart + pageWindowSize);
                  const showLeadingFirstPage = !isCompactPaginationViewport && visiblePages.length > 0 && visiblePages[0] > 1;
                  const showLeadingEllipsis = !isCompactPaginationViewport && visiblePages.length > 0 && visiblePages[0] > 2;
                  const showTrailingEllipsis = visiblePages.length > 0 && visiblePages[visiblePages.length - 1] < totalFnbPages - 1;
                  const showTrailingLastPage = visiblePages.length > 0 && visiblePages[visiblePages.length - 1] < totalFnbPages;
                  const paginationButtonBaseStyle = {
                    minWidth: isCompactPaginationViewport ? 36 : 40,
                    minHeight: isCompactPaginationViewport ? 36 : 40,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    color: STYLES.colors.dark,
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: 'pointer',
                    flexShrink: 0,
                    padding: isCompactPaginationViewport ? '0 10px' : '0 12px'
                  };

                  return (
                    <>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isDesktopViewport ? '1fr auto 1fr' : isCompactPaginationViewport ? 'minmax(0, 1fr) auto' : '1fr',
                        gap: isCompactPaginationViewport ? 8 : 12,
                        alignItems: 'center'
                      }}>
                        <div style={{
                          fontSize: 13,
                          color: STYLES.colors.muted,
                          lineHeight: 1.4,
                          textAlign: 'left',
                          minWidth: 0
                        }}>
                          Showing {fnbPageStart}-{fnbPageEnd} of {itemsToRender.length} {isCompactPaginationViewport ? 'items' : 'menu items'}
                        </div>

                        {isDesktopViewport && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <GhostButton
                              style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === 1 ? 0.5 : 1 }}
                              onClick={() => setFnbPage((previous) => Math.max(1, previous - 1))}
                              disabled={resolvedFnbPage === 1}
                            >
                              Previous
                            </GhostButton>
                            {showLeadingFirstPage && (
                              <button type="button" onClick={() => setFnbPage(1)} style={paginationButtonBaseStyle}>1</button>
                            )}
                            {showLeadingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                            {visiblePages.map((pageNumber) => (
                              <button
                                key={`fnb-page-${pageNumber}`}
                                type="button"
                                onClick={() => setFnbPage(pageNumber)}
                                style={{
                                  ...paginationButtonBaseStyle,
                                  border: `1px solid ${pageNumber === resolvedFnbPage ? '#f97316' : '#e5e7eb'}`,
                                  background: pageNumber === resolvedFnbPage ? '#f97316' : '#fff',
                                  color: pageNumber === resolvedFnbPage ? '#fff' : STYLES.colors.dark,
                                  boxShadow: pageNumber === resolvedFnbPage ? '0 8px 18px rgba(249,115,22,0.22)' : 'none'
                                }}
                              >
                                {pageNumber}
                              </button>
                            ))}
                            {showTrailingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                            {showTrailingLastPage && (
                              <button type="button" onClick={() => setFnbPage(totalFnbPages)} style={paginationButtonBaseStyle}>{totalFnbPages}</button>
                            )}
                            <GhostButton
                              style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === totalFnbPages ? 0.5 : 1 }}
                              onClick={() => setFnbPage((previous) => Math.min(totalFnbPages, previous + 1))}
                              disabled={resolvedFnbPage === totalFnbPages}
                            >
                              Next
                            </GhostButton>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: isDesktopViewport ? 'flex-end' : isCompactPaginationViewport ? 'flex-end' : 'flex-start' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: STYLES.colors.muted, flexShrink: 0 }}>
                            Per page
                            <StorefrontDropdown
                              value={fnbPageSize}
                              onChange={(nextValue) => setFnbPageSize(Number(nextValue) || 8)}
                              options={[4, 8, 12, 16].map((size) => ({ value: size, label: String(size) }))}
                              containerStyle={{ minWidth: isCompactPaginationViewport ? 66 : 72 }}
                              triggerStyle={{ minHeight: isCompactPaginationViewport ? 36 : 40, borderRadius: 12, minWidth: isCompactPaginationViewport ? 66 : 72, padding: '6px 34px 6px 12px' }}
                              menuStyle={{ borderRadius: 14 }}
                              selectedLabelStyle={{ fontSize: 13 }}
                            />
                          </label>
                        </div>
                      </div>

                      {!isDesktopViewport && (
                        <div
                          className="no-scrollbar"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: isCompactPaginationViewport ? 'flex-start' : 'center',
                            gap: isCompactPaginationViewport ? 6 : 8,
                            width: '100%',
                            flexWrap: 'nowrap',
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            WebkitOverflowScrolling: 'touch',
                            paddingBottom: 2
                          }}
                        >
                          <GhostButton
                            style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === 1 ? 0.5 : 1 }}
                            onClick={() => setFnbPage((previous) => Math.max(1, previous - 1))}
                            disabled={resolvedFnbPage === 1}
                          >
                            Previous
                          </GhostButton>
                          {showLeadingFirstPage && (
                            <button type="button" onClick={() => setFnbPage(1)} style={paginationButtonBaseStyle}>1</button>
                          )}
                          {showLeadingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                          {visiblePages.map((pageNumber) => (
                            <button
                              key={`fnb-page-mobile-${pageNumber}`}
                              type="button"
                              onClick={() => setFnbPage(pageNumber)}
                              style={{
                                ...paginationButtonBaseStyle,
                                border: `1px solid ${pageNumber === resolvedFnbPage ? '#f97316' : '#e5e7eb'}`,
                                background: pageNumber === resolvedFnbPage ? '#f97316' : '#fff',
                                color: pageNumber === resolvedFnbPage ? '#fff' : STYLES.colors.dark,
                                boxShadow: pageNumber === resolvedFnbPage ? '0 8px 18px rgba(249,115,22,0.22)' : 'none'
                              }}
                            >
                              {pageNumber}
                            </button>
                          ))}
                          {showTrailingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                          {showTrailingLastPage && (
                            <button type="button" onClick={() => setFnbPage(totalFnbPages)} style={paginationButtonBaseStyle}>{totalFnbPages}</button>
                          )}
                          <GhostButton
                            style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === totalFnbPages ? 0.5 : 1 }}
                            onClick={() => setFnbPage((previous) => Math.min(totalFnbPages, previous + 1))}
                            disabled={resolvedFnbPage === totalFnbPages}
                          >
                            Next
                          </GhostButton>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {isSimpleMode && isResolvedOrderSubpage && simpleStorefrontModel && (
        <SimpleCheckoutRoutePage {...simpleCheckoutRouteProps} />
      )}
      {isSimpleMode && !isResolvedOrderSubpage && simpleStorefrontModel && (
        <>
          <SharedStorefrontPromoSection
            items={promoSectionModel}
            isMobileViewport={isMobileViewport}
            layoutVariant="feature"
            palette="orange"
            titleFontFamily={modeAdapter.heroTheme?.displayFont}
            bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
            titleSize={isMobileViewport ? 28 : 36}
            subtitleSize={isMobileViewport ? 14 : 16}
            activePromoCode={checkoutPromoCode}
            onApplyPromo={handlePromoCardApply}
          />

          <SharedStorefrontReviewsSection
            isMobileViewport={isMobileViewport}
            viewportWidth={viewportWidth}
            title="Customer Reviews"
            subtitle="See what customers say about this storefront"
            onWriteReview={() => setIsReviewModalOpen(true)}
            reviewHighlights={simpleStorefrontModel.reviewHighlights}
            emptyMessage="Customer reviews will appear here once this storefront adds review data in SKUpervisor."
            titleFontFamily={modeAdapter.heroTheme?.displayFont}
            bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
            titleSize={isMobileViewport ? 28 : 36}
            subtitleSize={isMobileViewport ? 14 : 16}
            starSymbol="*"
          />

          <SharedStorefrontFooterSection
            isMobileViewport={isMobileViewport}
            name={simpleStorefrontModel.name}
            registrationYear={simpleStorefrontModel.registrationYear}
            description={simpleStorefrontModel.tagline || simpleStorefrontModel.aboutText || 'Simple storefront powered by SKUpervisor content.'}
            displayFont={modeAdapter.heroTheme?.displayFont}
            bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
            badgeLinks={getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks)}
            columns={[
              {
                title: 'Products',
                items: simpleStorefrontModel.productGroups.map((group) => ({ label: group })),
                emptyText: 'No product categories yet.'
              },
              {
                title: 'Socials',
                items: getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks).map((link) => ({ label: link.label, href: link.href })),
                emptyText: 'No social links yet.'
              },
              {
                title: 'Contact',
                items: [
                  ...getStorefrontContactFooterLinks(simpleStorefrontModel.footerLinks).map((link) => ({
                    label: link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', ''),
                    href: link.href
                  })),
                  ...(simpleStorefrontModel.hours ? [{ label: simpleStorefrontModel.hours }] : []),
                  { label: simpleStorefrontModel.locationLabel }
                ]
              }
            ]}
          />
        </>
      )}

      {isFnbMode && !isOrderSubpage && !isFnbDetailsSubpage && fnbCommunityModel && (
        <FnbCommunitySection
          fnbCommunityModel={fnbCommunityModel}
          promoSectionModel={promoSectionModel}
          isMobileViewport={isMobileViewport}
          viewportWidth={viewportWidth}
          modeAdapter={modeAdapter}
          checkoutPromoCode={checkoutPromoCode}
          onApplyPromo={handlePromoCardApply}
          onWriteReview={() => setIsReviewModalOpen(true)}
        />
      )}
    </div>

    {/* ZONE 5: Sidebar (Desktop) */}
    {isServicesMode && !isMobileViewport && (
      <ServicesPerformanceSidebar
        selectedStore={selectedStore}
        isMultiGroup={isMultiGroup}
        servicesViewModel={servicesViewModel}
        resolvedTab={resolvedTab}
        onSelectServiceTab={setActiveServiceTab}
      />
    )}

    {isReviewModalOpen && isSimpleMode && (
      <StorefrontReviewModal
        isMobileViewport={isMobileViewport}
        eyebrowColor={modeAdapter.heroTheme?.accent || '#0f766e'}
        starColor="#14b8a6"
        starBg="#ecfeff"
        starShadow="0 10px 20px rgba(20,184,166,0.16)"
        keyPrefix="simple-review-rating"
        messagePlaceholder="Tell customers what stood out about the product selection, ordering, or pickup experience."
        reviewDraft={reviewDraft}
        onReviewDraftChange={setReviewDraft}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmit={submitFnbItemReview}
      />
    )}

    {isReviewModalOpen && isFnbMode && (
      <FnbItemReviewModal
        isMobileViewport={isMobileViewport}
        isSubmitting={reviewSubmitLoading}
        onClose={() => setIsReviewModalOpen(false)}
        onDraftChange={(changes) => setReviewDraft((previous) => ({ ...previous, ...changes }))}
        onSubmit={submitFnbItemReview}
        reviewDraft={reviewDraft}
      />
    )}
  </div>
  </>
);
            })()}
          </>
        )}

      </div>

  { isStorePage && (checkoutPermitted || bookingPermitted || productCartPermitted) && (
    <>
      <StorefrontFollowFloatingAction
        enabled={isStorefrontV2 && selectedStore && !isFnbMode && !isServicesMode && parseBooleanFlag(selectedStore.storefront_follow_enabled, false)}
        followState={followState}
        isMobileViewport={isMobileViewport}
        onFollow={handleFollowAction}
      />
      {!isAccountDrawerOpen && isServicesCartDrawerMode && (
        <ServiceCartDrawer {...serviceCartDrawerProps} />
      )}
      {(isServicesMode || isFnbMode) && (
        <StorefrontCartFlyAnimations animations={serviceCartFlyAnimations} isFnbMode={isFnbMode} />
      )}
      {!isAccountDrawerOpen && isSimpleCartSurfaceMode && (
        <>
          <SimpleCartFloatingButton {...simpleCartDrawerProps.floatingButtonProps} />

          <SimpleCartDrawerSurface {...simpleCartDrawerProps.drawerSurfaceProps} />
        </>
      )}
      <StorefrontCartFab
        serviceCartFabRef={serviceCartFabRef}
        isFnbMode={isFnbMode}
        isServicesMode={isServicesMode}
        isMobileViewport={isMobileViewport}
        isDesktopViewport={isDesktopViewport}
        hasServiceCart={hasServiceCart}
        isAccountDrawerOpen={isAccountDrawerOpen}
        isServicesCartDrawerMode={isServicesCartDrawerMode}
        isFnbOrderSubpage={isFnbOrderSubpage}
        isFnbDetailsSubpage={isFnbDetailsSubpage}
        isCheckoutOpen={isCheckoutOpen}
        isSimpleMode={isSimpleMode}
        isResolvedOrderSubpage={isResolvedOrderSubpage}
        isSimpleCartSurfaceMode={isSimpleCartSurfaceMode}
        goStoreBookingPage={goStoreBookingPage}
        setIsCheckoutOpen={setIsCheckoutOpen}
        setCheckoutTab={setCheckoutTab}
        servicesPrimary={servicesPrimary}
        serviceBookingSummaryTitle={serviceBookingSummaryTitle}
        cartCount={cartCount}
        serviceBookingSummarySchedule={serviceBookingSummarySchedule}
        servicePaymentOptions={servicePaymentOptions}
        servicePaymentTiming={servicePaymentTiming}
        money={money}
        cartTotal={cartTotal}
      />

        <FnbCartDrawerSurface
          cartCount={cartCount}
          cartDrawerProps={fnbCartDrawerRouteProps}
          isDesktop={isDesktopCheckout}
          isMobileViewport={isMobileViewport}
          isOpen={isFnbCartDrawerSurfaceOpen}
          onClose={() => setIsCheckoutOpen(false)}
        />

        <StorefrontCheckoutDrawerFrame
          compactMode={isFnbMode || isSimpleMode}
          desktop={isDesktopCheckout}
          disabled={isFnbCartDrawerSurfaceOpen || isServicesCartDrawerMode || isSimpleCartSurfaceMode || (isSimpleMode && isResolvedOrderSubpage)}
          fullPage={isFnbOrderSubpage}
          headerContent={(
            <div>
                {isFnbMode ? (
                  <FnbCartDrawerHeader cartCount={cartCount} isMobileViewport={isMobileViewport} />
                ) : isSimpleMode ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product Cart</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#1e293b', fontFamily: servicesDisplayFont }}>Added products</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Review products, adjust quantities, then continue to checkout.</div>
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>
                    {isServicesMode && hasServiceCart ? 'Booking Journey' : `${DGFY_BRAND_NAME} Checkout`}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedStore?.tenant_name || routeSlug || 'Tenant'}</div>
                </>
              )}
              {!(isFnbMode && !isFnbOrderSubpage) && (
                <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', background: '#e6fffb', border: '1px solid #99f6e4', borderRadius: 999, padding: '3px 8px' }}>
                    {cartCount} {isServicesMode && hasServiceCart ? 'service' : 'item'}{cartCount === 1 ? '' : 's'}
                  </span>
                  {(!isServicesMode || !hasServiceCart) && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {activeOrderMethodLabel}
                    </span>
                  )}
                  {isFnbMode && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7c2d12', background: '#ffedd5', border: '1px solid #fdba74', borderRadius: 999, padding: '3px 8px' }}>
                      {fnbCartStatusLabel}
                    </span>
                  )}
                  {isServicesMode && hasServiceCart && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {serviceBookingSummarySchedule}
                    </span>
                    )}
                  </div>
                )}
              </div>
          )}
          hideBackdrop={isFnbOrderSubpage || (isSimpleMode && isResolvedOrderSubpage)}
          hideHeader={isFnbMode && isFnbOrderSubpage}
          isFnbMode={isFnbMode}
          onBack={goStoreCatalogPage}
          onClose={() => setIsCheckoutOpen(false)}
          open={isCheckoutOpen || isFnbOrderSubpage}
          tabBarContent={!isFnbMode ? (
              <div style={{ display: 'flex', gap: 8, padding: isDesktopCheckout ? '14px 18px 8px 18px' : '12px 14px 6px 14px', background: 'rgba(255,255,255,.72)' }}>
                {[
                  ...(isServicesMode && hasServiceCart ? [{ id: 'review', label: 'Booking Summary' }] : []),
                { id: 'checkout', label: isServicesMode && hasServiceCart ? 'Customer Details' : 'Checkout' },
                ...(!isFnbMode ? [
                  { id: 'track', label: 'Track' }
                ] : [])
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCheckoutTab(tab.id);
                  }}
                  style={{ borderRadius: 999, border: `1px solid ${checkoutTab === tab.id ? '#0f766e' : '#cbd5e1'}`, background: checkoutTab === tab.id ? '#e6fffb' : '#fff', color: checkoutTab === tab.id ? '#0f766e' : '#334155', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
        >
            <FnbCheckoutRouteMount
                isActive={isFnbOrderSubpage && isFnbMode && checkoutTab !== 'track'}
                brandColor={fnbOrderBrand}
                brandShadow={fnbOrderBrandShadowStrong}
                contentPadding={fnbCheckoutContentPadding}
                displayFont={servicesDisplayFont}
                isDeliveryOrder={isDeliveryOrder}
                isMobileViewport={isMobileViewport}
                isResponsiveFlow={isFnbOrderResponsiveFlow}
                onBack={goStoreCatalogPage}
                selectedStore={selectedStore}
                textOnBrand={fnbOrderTextOnBrand}
                withAssetOrigin={withAssetOrigin}
              >

                <FnbCheckoutRouteBody
                  journeyHeaderProps={{
                    activeStep: fnbOrderStep,
                    activeStepMeta: activeFnbOrderStepMeta,
                    accentBorder: dgfyIceBlueBorder,
                    accentColor: fnbOrderBrand,
                    accentSoft: dgfyIceBlue,
                    cartHasItems: cart.length > 0,
                    completeColor: dgfyProgressComplete,
                    completeTextColor: fnbOrderBrandDark,
                    displayFont: servicesDisplayFont,
                    isCustomerStepComplete: fnbCustomerStepComplete,
                    isFulfillmentStepComplete: fnbFulfillmentStepComplete,
                    isMobileViewport,
                    isResponsive: isFnbOrderResponsiveFlow,
                    onStepChange: setFnbOrderStep,
                    signedIn: isDgfyCustomerSignedIn
                  }}
                  stepRenderKey={fnbOrderStepRenderKey}
                >
                {fnbOrderStep === 2 && (
                  <FnbCheckoutFulfillmentStepView isDesktop={isDesktopCheckout}>
                    {isDgfyCustomerSignedIn || canUseGuestCheckoutFlow ? (
                    <FnbCheckoutFulfillmentStep
                      isMobileViewport={isMobileViewport}
                      isResponsive={isFnbOrderResponsiveFlow}
                    >
                      <FnbCheckoutFulfillmentChoices
                        fnbOrderBrand={fnbOrderBrand}
                        fnbOrderBrandBorder={fnbOrderBrandBorder}
                        fnbOrderBrandShadow={fnbOrderBrandShadow}
                        fnbOrderBrandShadowStrong={fnbOrderBrandShadowStrong}
                        fnbScheduleMode={fnbScheduleMode}
                        fnbScheduledFor={fnbScheduledFor}
                        isDeliveryOrder={isDeliveryOrder}
                        isMobileViewport={isMobileViewport}
                        isResponsive={isFnbOrderResponsiveFlow}
                        mobileOptionHeight={fnbOrderMobileOptionHeight}
                        mobileOptionIconBox={fnbOrderMobileOptionIconBox}
                        mobileOptionTextSize={fnbOrderMobileOptionTextSize}
                        onOrderMethodChange={setOrderMethod}
                        onScheduleModeChange={(nextMode) => {
                          setFnbScheduleMode(nextMode);
                          if (nextMode === 'asap') setFnbScheduledFor('');
                        }}
                        onScheduledForChange={(nextValue) => {
                          setFnbScheduleMode('schedule');
                          setFnbScheduledFor(nextValue);
                        }}
                        orderMethod={orderMethod}
                        scheduleHoursLabel={formatStorefrontHoursLabel(selectedStore?.storefront_hours, selectedStore?.storefront_hours_status?.display || '')}
                      />                      {isDeliveryOrder && (
                        <div style={{ display: 'grid', gap: 16 }}>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>3. Where should we deliver your order?</div>
                            <div style={{ fontSize: isFnbOrderResponsiveFlow ? 13 : 12, fontWeight: isFnbOrderResponsiveFlow ? 400 : 600, color: '#64748b', textTransform: isFnbOrderResponsiveFlow ? 'none' : 'uppercase', letterSpacing: isFnbOrderResponsiveFlow ? 'normal' : '0.04em', lineHeight: 1.5, fontFamily: servicesBodyFont }}>
                              {isFnbOrderResponsiveFlow ? 'Select or pin your location on the map.' : 'Saved locations'}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: isFnbOrderResponsiveFlow ? '1fr' : '280px minmax(0, 1fr)', gap: 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
                            <FnbCheckoutSavedAddressSelector
                              addresses={deliverySavedLocations}
                              brandBorder={fnbOrderBrandBorder}
                              brandColor={fnbOrderBrand}
                              brandShadow={fnbOrderBrandShadow}
                              brandTint={fnbOrderBrandTint}
                              deliveryLocationAction={deliveryLocationAction}
                              isResponsive={isFnbOrderResponsiveFlow}
                              onOpenMobileAddressList={() => setShowMobileAddressModal(true)}
                              onSelectAddress={(location) => {
                                applySavedDeliveryLocation(location);
                                if (typeof handleSetDefaultDeliveryAddress === 'function' && !location.isDefault) {
                                  handleSetDefaultDeliveryAddress(location);
                                }
                              }}
                              onStartMapPin={() => {
                                setDeliveryLocationAction('map');
                                setSelectedSavedLocationId('');
                                setPinLocationError('');
                                setResolvedDeliveryAddress('');
                                setCustomerAddress('');
                                setCustomerPin(null);
                              }}
                              selectedAddressId={selectedSavedLocationId}
                            />
                            <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
                              <div style={{ display: 'none' }} aria-hidden="true">Delivery orders need a pinned map location.</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, fontFamily: servicesBodyFont, display: isFnbOrderResponsiveFlow ? 'none' : 'block' }}>
                                  {resolvingPinnedDeliveryAddress
                                    ? 'Resolving address from your pinned location...'
                                    : 'Tap anywhere on the map, drag the pin, or use your current location.'}
                                </div>
                                <div id="delivery-location-map-panel" style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                                  <DeliveryPinMap
                                    pin={customerPin}
                                    onPinChange={(nextPin) => {
                                      setDeliveryLocationAction('map');
                                      setSelectedSavedLocationId('');
                                      setCustomerPin(nextPin);
                                    }}
                                    disabled={false}
                                    height={isMobileViewport ? 'clamp(230px, 34svh, 280px)' : 260}
                                    highlighted={deliveryLocationAction === 'map'}
                                    highlightColor={fnbOrderBrand}
                                    highlightGlow="rgba(26,78,141,0.16)"
                                    overlayControls={(
                                      <>
                                        <button
                                          type="button"
                                          onClick={handlePinMyLocation}
                                          disabled={pinLocationLoading}
                                          style={{
                                            position: 'absolute',
                                            top: 12,
                                            left: 12,
                                            maxWidth: isMobileViewport ? 'calc(100% - 68px)' : 'none',
                                            minHeight: 38,
                                            borderRadius: 999,
                                            border: `1px solid ${deliveryLocationAction === 'current' ? fnbOrderBrand : '#dbe5ee'}`,
                                            background: deliveryLocationAction === 'current' ? '#dbeafe' : '#ffffff',
                                            color: deliveryLocationAction === 'current' ? fnbOrderBrandDark : '#1e293b',
                                            padding: '0 12px',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: pinLocationLoading ? 'wait' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                                            zIndex: 11,
                                            fontFamily: servicesBodyFont,
                                            pointerEvents: 'auto',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                          }}
                                        >
                                          <Navigation size={15} />
                                          {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDeliveryLocationAction('map');
                                            setSelectedSavedLocationId('');
                                          }}
                                          style={{
                                            position: 'absolute',
                                            right: 12,
                                            bottom: 12,
                                            minHeight: 34,
                                            borderRadius: 999,
                                            border: `1px solid ${deliveryLocationAction === 'map' ? fnbOrderBrandBorder : '#dbe5ee'}`,
                                            background: deliveryLocationAction === 'map' ? '#dbeafe' : 'rgba(255,255,255,0.96)',
                                            color: deliveryLocationAction === 'map' ? fnbOrderBrandDark : '#334155',
                                            padding: '0 10px',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                                            zIndex: 11,
                                            fontFamily: servicesBodyFont,
                                            pointerEvents: 'auto'
                                          }}
                                        >
                                          <MapPin size={14} />
                                          Drag to adjust pin
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setShowExpandedDeliveryMap(true)}
                                          aria-label="Open large map"
                                          title="Open large map"
                                          style={{
                                            position: 'absolute',
                                            top: 12,
                                            right: 12,
                                            width: 36,
                                            height: 36,
                                            borderRadius: 10,
                                            background: '#fff',
                                            border: '1px solid #cbd5e1',
                                            boxShadow: '0 4px 12px rgba(15,23,42,0.1)',
                                            display: 'grid',
                                            placeItems: 'center',
                                            cursor: 'pointer',
                                            color: '#334155',
                                            zIndex: 12,
                                            pointerEvents: 'auto'
                                          }}
                                        >
                                          <Maximize size={18} />
                                        </button>
                                      </>
                                    )}
                                  />
                                </div>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                                    gap: 10,
                                    alignItems: 'center',
                                    width: '100%',
                                    maxWidth: '100%',
                                    minWidth: 0
                                  }}
                                >
                                  <div style={{
                                    minHeight: 38,
                                    borderRadius: 12,
                                    border: `1px solid ${(deliveryLocationAction === 'saved' || deliveryLocationAction === 'current' || deliveryLocationAction === 'map') && deliveryLocationDisplayAddress ? fnbOrderBrandSoft : '#dbe5ee'}`,
                                    background: '#fff',
                                    padding: '0 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    color: deliveryLocationDisplayAddress ? '#334155' : '#94a3b8',
                                    fontSize: 13,
                                    lineHeight: 1.4,
                                    fontFamily: servicesBodyFont,
                                    minWidth: 0
                                  }}>
                                    {isFnbOrderResponsiveFlow ? (
                                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#eff6ff', color: fnbOrderBrand, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
                                        <MapPin size={13} />
                                      </span>
                                    ) : null}
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', fontWeight: 600 }}>
                                      {deliveryLocationDisplayAddress || 'Pinned delivery address will appear here.'}
                                    </span>
                                  </div>
                                  <button type="button" onClick={handleAddPinnedLocation} disabled={!canAddPinnedLocation} style={{ minHeight: 38, borderRadius: 12, border: `1px solid ${fnbOrderBrand}`, background: canAddPinnedLocation ? fnbOrderBrand : '#f8fafc', color: canAddPinnedLocation ? '#fff' : '#94a3b8', padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: canAddPinnedLocation ? 'pointer' : 'not-allowed', minWidth: isFnbOrderResponsiveFlow ? 116 : 132, width: 'auto', boxShadow: canAddPinnedLocation ? '0 8px 16px rgba(26,78,141,0.15)' : 'none', fontFamily: servicesBodyFont }}>
                                    {isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location'}
                                  </button>
                                </div>
                                {isFnbOrderResponsiveFlow ? (
                                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, fontFamily: servicesBodyFont, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Info size={15} color="#64748b" />
                                    <span>This is the address where your order will be delivered.</span>
                                  </div>
                                ) : null}
                              </div>
                              {pinLocationError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</div>}
                            </div>
                          </div>
                        </div>
                      )}
                      <FnbCheckoutExpandedMapModal
                        bodyFont={servicesBodyFont}
                        displayFont={servicesDisplayFont}
                        isMobileViewport={isMobileViewport}
                        isOpen={isDeliveryOrder && showExpandedDeliveryMap}
                        onClose={() => setShowExpandedDeliveryMap(false)}
                      >
                            <DeliveryPinMap
                              pin={customerPin}
                              onPinChange={(nextPin) => {
                                setDeliveryLocationAction('map');
                                setSelectedSavedLocationId('');
                                setCustomerPin(nextPin);
                              }}
                              disabled={false}
                              height={isMobileViewport ? 'clamp(340px, min(70svh, calc(100svh - 220px)), 620px)' : 520}
                              highlighted
                              highlightColor={fnbOrderBrand}
                              highlightGlow="rgba(26,78,141,0.16)"
                              overlayControls={(
                                <>
                                  <button
                                    type="button"
                                    onClick={handlePinMyLocation}
                                    disabled={pinLocationLoading}
                                    style={{
                                      position: 'absolute',
                                      top: 12,
                                      left: 12,
                                      minHeight: 38,
                                      borderRadius: 999,
                                      border: `1px solid ${deliveryLocationAction === 'current' ? fnbOrderBrand : '#dbe5ee'}`,
                                      background: deliveryLocationAction === 'current' ? '#eff6ff' : '#ffffff',
                                      color: deliveryLocationAction === 'current' ? fnbOrderBrandDark : '#1e293b',
                                      padding: '0 12px',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: pinLocationLoading ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                                      zIndex: 11,
                                      fontFamily: servicesBodyFont,
                                      pointerEvents: 'auto',
                                      maxWidth: isMobileViewport ? 'calc(100% - 24px)' : 'none',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    <Navigation size={15} />
                                    {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeliveryLocationAction('map');
                                      setSelectedSavedLocationId('');
                                    }}
                                    style={{
                                      position: 'absolute',
                                      right: 12,
                                      bottom: 12,
                                      minHeight: 34,
                                      borderRadius: 999,
                                      border: `1px solid ${deliveryLocationAction === 'map' ? fnbOrderBrandBorder : '#dbe5ee'}`,
                                      background: deliveryLocationAction === 'map' ? '#ffffff' : 'rgba(255,255,255,0.96)',
                                      color: deliveryLocationAction === 'map' ? fnbOrderBrandDark : '#334155',
                                      padding: '0 10px',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                                      zIndex: 11,
                                      fontFamily: servicesBodyFont,
                                      pointerEvents: 'auto'
                                    }}
                                  >
                                    <MapPin size={14} />
                                    Drag to Pin
                                  </button>
                                </>
                              )}
                            />
                      </FnbCheckoutExpandedMapModal>
                      {!isFnbOrderResponsiveFlow && (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12, marginTop: 4 }}>
                          <button type="button" onClick={() => setFnbOrderStep(3)} style={{ minHeight: 50, borderRadius: 14, border: '1px solid #dbe5ee', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontFamily: servicesBodyFont }}><ArrowLeft size={17} strokeWidth={2.5} />Back</button>
                          <button type="button" onClick={() => setFnbOrderStep(4)} disabled={!fnbFulfillmentStepComplete} style={{ minHeight: 50, borderRadius: 14, border: 'none', background: fnbFulfillmentStepComplete ? `linear-gradient(135deg, ${fnbOrderBrand} 0%, ${fnbOrderBrandDark} 100%)` : '#cbd5e1', color: '#fff', fontWeight: 700, boxShadow: fnbFulfillmentStepComplete ? `0 14px 28px ${fnbOrderBrandShadowStrong}` : 'none', cursor: fnbFulfillmentStepComplete ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontFamily: servicesBodyFont }}>Continue <ChevronRight size={17} strokeWidth={2.5} /></button>
                        </div>
                      )}
                    </FnbCheckoutFulfillmentStep>
                    ) : renderGuestCheckoutEntry({
                      title: 'Continue to your order',
                      description: 'Create an account or continue as guest to continue this menu order.',
                      resumeTarget: {
                        checkoutTab: 'cart',
                        fnbOrderStep: 3
                      }
                    })}
                    <FnbCheckoutDesktopSummary isDesktop={isDesktopCheckout}>
                      <FnbCheckoutSummaryContent
                        accentColor={fnbOrderBrand}
                        accentSoft={fnbOrderBrandSoft}
                        accentTint={fnbOrderBrandTint}
                        bodyFont={servicesBodyFont}
                        cart={cart}
                        cartImageErrors={cartImageErrors}
                        cartCount={cartCount}
                        checkoutAllowed={checkoutAllowed}
                        displayFont={servicesDisplayFont}
                        isDeliveryOrder={isDeliveryOrder}
                        money={money}
                        onImageError={(itemId) => {
                          const normalizedLineItemId = Number(itemId);
                          if (!Number.isFinite(normalizedLineItemId)) return;
                          setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
                        }}
                        paymentStep={false}
                        promoDiscountSummaryRow={promoDiscountSummaryRow}
                        promoPanel={renderPromoCodePanel({ compact: true, accentColor: fnbOrderBrand, bodyFont: servicesBodyFont })}
                        scheduleLabel={fnbScheduleSummaryLabel}
                        totals={totalsForDisplay}
                        variant="compact"
                        withAssetOrigin={withAssetOrigin}
                      />
                    </FnbCheckoutDesktopSummary>
                  </FnbCheckoutFulfillmentStepView>
                )}

                {fnbOrderStep === 3 && (
                  <FnbCheckoutCustomerStepView isDesktop={isDesktopCheckout}>
                    {isDgfyCustomerSignedIn || canUseGuestCheckoutFlow ? (
                    <FnbCheckoutCustomerStep
                      bodyFont={servicesBodyFont}
                      brandColor={fnbOrderBrand}
                      brandDark={fnbOrderBrandDark}
                      canContinue={fnbCustomerStepComplete}
                      customerNotice={isDgfyCustomerSignedIn ? 'Your account details are already linked. Only order-specific instructions remain editable here.' : 'Guest checkout uses the details you entered for this order only.'}
                      guestEmailVerificationContent={!isDgfyCustomerSignedIn ? (
                        <FnbGuestEmailVerification
                          bodyFont={servicesBodyFont}
                          code={guestCheckoutOtpCode}
                          cooldownActive={isGuestCheckoutOtpCooldownActive}
                          cooldownLabel={guestCheckoutOtpCooldownLabel}
                          error={guestCheckoutOtpError}
                          isMobileViewport={isMobileViewport}
                          loading={guestCheckoutOtpLoading}
                          onCodeChange={handleGuestCheckoutOtpCodeChange}
                          onRequestCode={handleRequestGuestCheckoutOtp}
                          onVerifyCode={handleVerifyGuestCheckoutOtp}
                          verified={guestCheckoutOtpVerified}
                        />
                      ) : null}
                      identityContent={isDgfyCustomerSignedIn ? renderAccountOwnedIdentitySummary({ title: 'Customer Account', subtitle: 'These account details will be used for this order.' }) : renderGuestIdentityFields({
                        title: 'Guest Details',
                        subtitle: 'These guest details will be used for this order.',
                        includeAddress: false,
                        requireEmail: true,
                        layoutVariant: 'fnbGuest',
                        savedDetailsApplyLabel: 'Send Code and Apply Details',
                        onSavedDetailsApply: handleApplyGuestDetailsAndRequestOtp
                      })}
                      isMobileViewport={isMobileViewport}
                      isResponsive={isFnbOrderResponsiveFlow}
                      mutedTextColor={fnbOrderMutedBlueText}
                      onBack={goStoreCatalogPage}
                      onContinue={() => setFnbOrderStep(2)}
                      onSpecialInstructionsChange={setFnbSpecialInstructions}
                      specialInstructions={fnbSpecialInstructions}
                    />
                    ) : renderGuestCheckoutEntry({
                      title: 'Continue to your order',
                      description: 'Create an account or continue as guest to continue this menu order.',
                      resumeTarget: {
                        checkoutTab: 'cart',
                        fnbOrderStep: 3
                      }
                    })}
                    <FnbCheckoutDesktopSummary isDesktop={isDesktopCheckout}>
                      <FnbCheckoutSummaryContent
                        accentColor={fnbOrderBrand}
                        accentSoft={fnbOrderBrandSoft}
                        accentTint={fnbOrderBrandTint}
                        bodyFont={servicesBodyFont}
                        cart={cart}
                        cartImageErrors={cartImageErrors}
                        cartCount={cartCount}
                        checkoutAllowed={checkoutAllowed}
                        displayFont={servicesDisplayFont}
                        isDeliveryOrder={isDeliveryOrder}
                        money={money}
                        onImageError={(itemId) => {
                          const normalizedLineItemId = Number(itemId);
                          if (!Number.isFinite(normalizedLineItemId)) return;
                          setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
                        }}
                        paymentStep={false}
                        promoDiscountSummaryRow={promoDiscountSummaryRow}
                        promoPanel={renderPromoCodePanel({ compact: true, accentColor: fnbOrderBrand, bodyFont: servicesBodyFont })}
                        scheduleLabel={fnbScheduledFor ? new Date(fnbScheduledFor).toLocaleString() : 'NOW'}
                        totals={totalsForDisplay}
                        variant="customer"
                        withAssetOrigin={withAssetOrigin}
                      />
                    </FnbCheckoutDesktopSummary>
                  </FnbCheckoutCustomerStepView>
                )}

                {fnbOrderStep === 4 && !checkoutResult && (
                  <FnbCheckoutPaymentStepView
                    isDesktop={isDesktopCheckout}
                    stepKey={`fnb-order-payment-step-${isFnbOrderResponsiveFlow ? 'responsive' : 'desktop'}`}
                  >
                    <FnbCheckoutPaymentStep
                      brandColor={fnbOrderBrand}
                      canSubmit={checkoutAllowed}
                      checkoutError={checkoutError}
                      closedNotice={storefrontClosedByHours ? renderStorefrontClosedNotice({ accent: fnbOrderBrand, background: '#fff7ed', border: '#fdba74' }) : null}
                      isMobileViewport={isMobileViewport}
                      isResponsive={isFnbOrderResponsiveFlow}
                      onBack={() => setFnbOrderStep(2)}
                      onSubmit={handleCheckout}
                      paymentControl={(
                        <PaymentMethodSelectorBlock
                          label="Payment Type"
                          value={fnbPaymentType}
                          onChange={handlePaymentTypeChange}
                          options={STOREFRONT_CHECKOUT_PAYMENT_OPTIONS.filter((option) => isEnabledStorefrontCheckoutPaymentType(option.value))}
                          DropdownComponent={StorefrontDropdown}
                          triggerStyle={isFnbOrderResponsiveFlow ? { ...MOBILE_NATIVE_SELECT_STYLE, minHeight: 50, fontSize: 15, borderRadius: 16, padding: '0 44px 0 14px', boxSizing: 'border-box' } : { minHeight: 44, borderRadius: 12 }}
                          menuStyle={isFnbOrderResponsiveFlow ? MOBILE_DROPDOWN_MENU_STYLE : undefined}
                          optionStyle={isFnbOrderResponsiveFlow ? MOBILE_DROPDOWN_OPTION_STYLE : undefined}
                          selectedLabelStyle={isFnbOrderResponsiveFlow ? { fontSize: 15, fontWeight: 700 } : undefined}
                          showCashInfo={fnbPaymentType === 'cash'}
                          cashInfoAccent={fnbOrderBrand}
                          bodyFont={servicesBodyFont}
                        />
                      )}
                      processing={checkoutLoading}
                      quoteError={quoteError}
                    />
                    <FnbCheckoutDesktopSummary isDesktop={isDesktopCheckout}>
                      <FnbCheckoutSummaryContent
                        accentColor={fnbOrderBrand}
                        accentSoft={fnbOrderBrandSoft}
                        accentTint={fnbOrderBrandTint}
                        bodyFont={servicesBodyFont}
                        cart={cart}
                        cartImageErrors={cartImageErrors}
                        cartCount={cartCount}
                        checkoutAllowed={checkoutAllowed}
                        displayFont={servicesDisplayFont}
                        isDeliveryOrder={isDeliveryOrder}
                        money={money}
                        onImageError={(itemId) => {
                          const normalizedLineItemId = Number(itemId);
                          if (!Number.isFinite(normalizedLineItemId)) return;
                          setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
                        }}
                        paymentStep={true}
                        promoDiscountSummaryRow={promoDiscountSummaryRow}
                        promoPanel={null}
                        scheduleLabel={fnbScheduledFor ? new Date(fnbScheduledFor).toLocaleString() : 'NOW'}
                        totals={totalsForDisplay}
                        variant="payment"
                        withAssetOrigin={withAssetOrigin}
                      />
                    </FnbCheckoutDesktopSummary>
                  </FnbCheckoutPaymentStepView>
                )}

                {isFnbOrderResponsiveFlow && !checkoutResult && (
                  <FnbCheckoutMobileSummaryPanel
                    brandColor={fnbOrderBrand}
                    brandColorDark={fnbOrderBrandDark}
                    brandShadowStrong={fnbOrderBrandShadowStrong}
                    cart={cart}
                    cartImageErrors={cartImageErrors}
                    checkoutAllowed={checkoutAllowed}
                    checkoutLoading={checkoutLoading}
                    fnbCustomerStepComplete={fnbCustomerStepComplete}
                    fnbFulfillmentStepComplete={fnbFulfillmentStepComplete}
                    itemCountLabel={fnbMobileSummaryItemCountLabel}
                    money={money}
                    onBackToCart={() => {
                      goStoreCatalogPage();
                      setCheckoutTab('cart');
                      setIsCheckoutOpen(true);
                    }}
                    onCheckout={handleCheckout}
                    onDecreaseStep={() => setFnbOrderStep(fnbOrderStep === 2 ? 3 : 2)}
                    onImageError={(itemId) => {
                      const normalizedLineItemId = Number(itemId);
                      if (!Number.isFinite(normalizedLineItemId)) return;
                      setCartImageErrors((previous) => new Set(previous).add(normalizedLineItemId));
                    }}
                    onIncreaseStep={() => setFnbOrderStep(fnbOrderStep === 3 ? 2 : 4)}
                    onToggleSummary={() => setShowFnbMobileOrderSummary((previous) => !previous)}
                    orderStep={fnbOrderStep}
                    promoDiscountSummaryRow={promoDiscountSummaryRow}
                    setSummaryOpen={setShowFnbMobileOrderSummary}
                    showSummary={showFnbMobileOrderSummary}
                    totalFeeAndTaxes={fnbSummaryFeeAndTaxes}
                    totals={totalsForDisplay}
                    withAssetOrigin={withAssetOrigin}
                  />
                )}

                {showMobileAddressModal && isFnbOrderResponsiveFlow && (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ position: 'absolute', inset: 0 }} onClick={() => setShowMobileAddressModal(false)} />
                    <div style={{ position: 'relative', background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 16px max(24px, env(safe-area-inset-bottom))', display: 'grid', gap: 16, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', paddingTop: 6 }}>Saved Addresses</div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                          <button type="button" onClick={() => setShowMobileAddressModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
                            <X size={18} strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            aria-label="Add New Location"
                            onClick={() => {
                              setShowMobileAddressModal(false);
                              setDeliveryLocationAction('map');
                              setSelectedSavedLocationId('');
                              setPinLocationError('');
                              setResolvedDeliveryAddress('');
                              setCustomerAddress('');
                              setCustomerPin(null);
                            }}
                            style={{
                              height: 32,
                              borderRadius: 999,
                              border: 'none',
                              background: fnbOrderBrandTint,
                              padding: '0 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontWeight: 800,
                              color: fnbOrderBrand,
                              cursor: 'pointer',
                              fontSize: 13
                            }}
                          >
                            <Plus size={16} strokeWidth={2.5} />
                            Add New Location
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {deliverySavedLocations.map((location) => {
                          const isSelected = String(selectedSavedLocationId) === String(location.id) && deliveryLocationAction !== 'map' && deliveryLocationAction !== 'current';
                          return (
                            <SavedAddressCard
                              key={`modal-delivery-location-${location.id}`}
                              address={location}
                              isSelected={isSelected}
                              isBusy={false}
                              onSelect={() => {
                                applySavedDeliveryLocation(location);
                                if (typeof handleSetDefaultDeliveryAddress === 'function' && !location.isDefault) {
                                  handleSetDefaultDeliveryAddress(location);
                                }
                                setShowMobileAddressModal(false);
                              }}
                              onSetDefault={location.source === 'account' ? () => handleSetDefaultDeliveryAddress(location) : undefined}
                              onRemove={(location.source === 'account' || location.source === 'local') ? () => handleRemoveDeliveryAddress(location) : undefined}
                              showActions={false}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {fnbOrderStep === 4 && checkoutResult && (
                  <FnbCheckoutConfirmation
                    brandColor={fnbOrderBrand}
                    brandDark={fnbOrderBrandDark}
                    brandSoft={fnbOrderBrandSoft}
                    brandTint={fnbOrderBrandTint}
                    cartLines={Array.isArray(checkoutResult?.cart_lines) ? checkoutResult.cart_lines : []}
                    checkoutResult={checkoutResult}
                    isDeliveryOrder={isDeliveryOrder}
                    isMobileViewport={isMobileViewport}
                    money={money}
                    mutedTextColor={fnbOrderMutedBlueText}
                    onBackToMenu={() => { setCheckoutResult(null); setFnbOrderStep(2); goStoreCatalogPage(); }}
                    onDownload={handleDownloadCheckoutImage}
                    onOpenTracking={() => {
                      const trackingPin = checkoutResult?.tracking_pin || '';
                      setTrackingPinInput(trackingPin);
                      setSelectedTrackingPin(String(trackingPin || '').trim().toUpperCase());
                      goStoreTrackPage({ pin: trackingPin });
                    }}
                    paymentType={fnbPaymentType}
                    totalAmount={checkoutResult?.totals?.total_amount ?? totalsForDisplay.total_amount}
                  />
                )}
                </FnbCheckoutRouteBody>
              </FnbCheckoutRouteMount>

            {checkoutTab === 'review' && hasServiceCart && !isServicesMode && (
              <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.25fr) minmax(280px, 360px)' : '1fr', gap: 16, alignItems: 'start' }}>
                <section style={{ display: 'grid', gap: 14 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 18, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Review Your Booking</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>Confirm the selected service, schedule, and booking instructions before you continue.</div>
                      </div>
                      <button
                        type="button"
                        onClick={openServiceCartEditor}
                        style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Edit service
                      </button>
                    </div>

                    <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 18, padding: 16, background: '#fcfdff', display: 'grid', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '88px 1fr auto', gap: 14, alignItems: 'center' }}>
                        <div style={{ width: 88, height: 88, borderRadius: 18, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
                          {firstServiceLine?.image_url && !cartImageErrors.has(Number(firstServiceLine.item_id)) ? (
                            <img
                              src={withAssetOrigin(firstServiceLine.image_url)}
                              alt={firstServiceLine.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={() => {
                                const normalizedLineItemId = Number(firstServiceLine.item_id);
                                if (!Number.isFinite(normalizedLineItemId)) return;
                                setCartImageErrors((prev) => {
                                  const next = new Set(prev);
                                  next.add(normalizedLineItemId);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>No image</span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              {firstServiceLine?.service_detail?.service_type || firstServiceLine?.category || 'Service'}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 20, fontWeight: 900, color: '#0f172a' }}>
                              {firstServiceLine?.variantName || firstServiceLine?.name}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                              {firstServiceLine?.service_detail?.service_area_type || firstServiceLine?.serviceAreaLabel || 'Service'}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                              Qty {firstServiceLine?.quantity || 1}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                              {servicePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Payment pending'}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', textAlign: isMobileViewport ? 'left' : 'right' }}>
                          {money((Number(firstServiceLine?.price || 0) || 0) * Math.max(1, Number(firstServiceLine?.quantity || 1)))}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preferred schedule</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{serviceBookingSummarySchedule}</div>
                        </div>
                        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking instructions</div>
                          <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                            {String(firstServiceLine?.service_notes || '').trim() || 'No special instructions yet.'}
                          </div>
                        </div>
                        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Validation note</div>
                          <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                            SKUpervisor confirms conflicts, lead time, and other booking rules when you submit.
                          </div>
                        </div>
                      </div>

                      {serviceIntakeFields.length > 0 && (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Service requirements</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {serviceIntakeFields.map((field) => (
                              <div key={`review-${field.id}`} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '180px 1fr', gap: 10, padding: '10px 0', borderTop: '1px solid #edf2f7' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{field.label}</div>
                                <div style={{ fontSize: 13, color: '#334155' }}>
                                  {field.type === 'checkbox'
                                    ? (serviceIntakeResponses[field.id] === true ? 'Confirmed' : 'Not confirmed')
                                    : (String(serviceIntakeResponses[field.id] || '').trim() || 'Not provided')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <aside style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 16, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)', display: 'grid', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Booking Summary</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Move to customer details when the service details look correct.</div>
                    </div>
                    <div style={{ borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, opacity: .95 }}>Service total</span>
                        <strong style={{ fontSize: 18 }}>{money(cartTotal)}</strong>
                      </div>
                      <div style={{ fontSize: 12, opacity: .95 }}>
                        {serviceBookingSummarySchedule}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setCheckoutTab('checkout')}
                        style={{ borderRadius: 14, border: '1px solid rgba(15,118,110,.15)', background: '#0f766e', color: '#fff', padding: '12px 14px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        Continue to Checkout
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCartItem(firstServiceLine.item_id)}
                        style={{ borderRadius: 14, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', padding: '12px 14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      >
                        <Trash2 size={16} />
                        Remove Service
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {checkoutTab === 'checkout' && !isFnbOrderSubpage && !isFnbMode && !isServicesMode && !(isSimpleMode && isResolvedOrderSubpage) && (
              <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.5fr) minmax(340px, 420px)' : '1fr', gap: 16, alignItems: 'start' }}>
                {isDgfyCustomerSignedIn ? (
                <section style={{ display: 'grid', gap: 14 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{hasServiceCart ? 'Customer Details' : 'Delivery Details'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      {hasServiceCart
                        ? 'Finish the booking with the customer contact details required by the current storefront contract.'
                        : 'Group the must-fill fields together so checkout feels faster and calmer.'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                      {storeLocations.length > 0 && (
                        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                          Fulfillment Location
                          <select
                            value={selectedLocationId ?? ''}
                            onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                          >
                            {storeLocations.map((location) => (
                              <option key={location.location_id} value={location.location_id} disabled={location.is_open === false || location.is_active === false}>
                                {location.name} {location.is_primary_storefront ? '(Primary)' : ''} {location.is_open === false ? '(Closed)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!hasServiceCart && (
                        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                          Order Method
                          <select
                            value={orderMethod}
                            onChange={(e) => {
                              setOrderMethod(e.target.value);
                              setPinLocationError('');
                            }}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                          >
                            {ORDER_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </label>
                      )}
                      <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                        Customer Name
                        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who is receiving this?" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                      <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                        Phone Number
                        <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Mobile number" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                      <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                        Email
                        <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="For ticket or account linking" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                    </div>
                    {hasServiceCart && (
                      <>
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Appointment Date / Time
                            <input type="datetime-local" value={serviceAppointmentAt} onChange={(e) => setServiceAppointmentAt(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                          </label>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Payment Timing
                            <select value={servicePaymentTiming} onChange={(e) => setServicePaymentTiming(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}>
                              {servicePaymentOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {serviceIntakeFields.length > 0 && (
                          <section style={{ marginTop: 10, border: '1px solid #d9e4e8', borderRadius: 14, padding: 12, background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Service Intake</h3>
                            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                              {serviceIntakeFields.map((field) => (
                                <label key={field.id} style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                  {field.label}{field.required ? ' *' : ''}
                                  {field.type === 'textarea' ? (
                                    <textarea
                                      value={serviceIntakeResponses[field.id] || ''}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                      style={{ width: '100%', minHeight: 72, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                    />
                                  ) : field.type === 'select' ? (
                                    <select
                                      value={serviceIntakeResponses[field.id] || ''}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                      style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                    >
                                      <option value="">Select</option>
                                      {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                  ) : field.type === 'checkbox' ? (
                                    <input
                                      type="checkbox"
                                      checked={serviceIntakeResponses[field.id] === true}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                                      style={{ marginTop: 10 }}
                                    />
                                  ) : (
                                    <input
                                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                      value={serviceIntakeResponses[field.id] || ''}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                      style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                    />
                                  )}
                                </label>
                              ))}
                            </div>
                          </section>
                        )}
                      </>
                    )}
                    {!hasServiceCart && (
                      <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10 }}>
                        Delivery Address
                        <input
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          placeholder={isDeliveryOrder ? 'House number, street, landmark' : 'Address is only needed for delivery'}
                          disabled={!isDeliveryOrder}
                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: isDeliveryOrder ? '#fff' : '#f1f5f9' }}
                        />
                      </label>
                    )}
                    {selectedLocation?.is_open === false && (
                      <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                        Selected location is closed and cannot accept orders right now.
                      </div>
                    )}
                  </div>

                  {!hasServiceCart && (
                    <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: 'linear-gradient(180deg,#f8fffe 0%,#ffffff 100%)', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Location Pin</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {isDeliveryOrder ? 'Add a precise drop-off pin to help fulfillment.' : 'Pinning is available for delivery orders.'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={handlePinMyLocation}
                            disabled={!isDeliveryOrder || pinLocationLoading}
                            style={{ borderRadius: 12, border: '1px solid #0f766e', background: isDeliveryOrder ? '#fff' : '#f8fafc', color: '#0f766e', padding: '9px 12px', fontWeight: 700, cursor: isDeliveryOrder ? 'pointer' : 'not-allowed' }}
                          >
                            {pinLocationLoading ? 'Pinning...' : 'Pin My Location'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerPin(null)}
                            disabled={!isDeliveryOrder || !customerPin}
                            style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '9px 12px', fontWeight: 700, cursor: (!isDeliveryOrder || !customerPin) ? 'not-allowed' : 'pointer' }}
                          >
                            Clear Pin
                          </button>
                        </div>
                      </div>
                      <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                        {isDeliveryOrder
                          ? (customerPin
                            ? `Pinned at ${Number(customerPin.latitude).toFixed(6)}, ${Number(customerPin.longitude).toFixed(6)}`
                            : 'No pin selected yet. Tap the map or use your current location.')
                          : 'Switch order method to Delivery if you want to save a location pin.'}
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        <DeliveryPinMap
                          pin={customerPin}
                          onPinChange={setCustomerPin}
                          disabled={!isDeliveryOrder}
                        />
                        {pinLocationError && <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</p>}
                      </div>
                    </div>
                  )}
                </section>
                ) : renderGuestCheckoutEntry({
                  title: hasServiceCart ? 'Continue to your booking' : 'Continue to your order',
                  description: hasServiceCart
                    ? 'Create an account or continue as guest to continue this booking.'
                    : 'Create an account or continue as guest to continue this order.',
                  resumeTarget: {
                    checkoutTab: 'checkout',
                    serviceBookingStep: hasServiceCart ? 1 : serviceBookingStep
                  }
                })}

                <section style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 14, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{isFnbMode ? 'Cart Summary' : 'Order Summary'}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {isFnbMode ? 'Update quantities, then refresh the quote before checkout.' : 'Keep the total visible while editing.'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ maxHeight: isDesktopCheckout ? 320 : 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 16, padding: 10, marginTop: 12, background: '#fbfeff' }}>
                      {cart.length === 0 && (
                        <p style={{ margin: 0, color: '#64748b' }}>
                          {isFnbMode ? 'Your menu cart is empty. Add items from Menu Highlights to start an order.' : 'Cart is empty.'}
                        </p>
                      )}
                      {cart.map((line) => (
                        <div key={line.item_id} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 78px 96px', gap: 10, alignItems: 'center', marginBottom: 10, padding: 10, border: '1px solid #e6edf2', borderRadius: 14, background: '#fff' }}>
                          <div style={{ width: 58, height: 58, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
                              <img
                                src={withAssetOrigin(line.image_url)}
                                alt={line.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={() => {
                                  const normalizedLineItemId = Number(line.item_id);
                                  if (!Number.isFinite(normalizedLineItemId)) return;
                                  setCartImageErrors((prev) => {
                                    const next = new Set(prev);
                                    next.add(normalizedLineItemId);
                                    return next;
                                  });
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', padding: 6 }}>No Image</span>
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{line.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              Unit: {money(line.price)} {line.unit_of_measure ? `- ${line.unit_of_measure}` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#0f766e', fontWeight: 700 }}>
                              {line.category === 'service' ? 'Bookable appointment' : `${activeOrderMethodLabel} order item`}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCartItem(line.item_id)}
                              style={{ marginTop: 6, border: 'none', background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Remove
                            </button>
                          </div>
                          <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateQty(line.item_id, e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 10px', background: '#fff', fontWeight: 700 }} />
                          <span style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{money(line.quantity * line.price)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Items Subtotal</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.subtotal_amount)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>{totalsForDisplay.service_fee_label} (1%)</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.service_fee_amount)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Delivery Fee</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.delivery_fee)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Vatable Sales</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vatable_sales)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>VAT Amount</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_amount)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>VAT-Exempt Sales</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_exempt_sales)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Zero-Rated Sales</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.zero_rated_sales)}</strong>
                        </div>
                        <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.24)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 800 }}>Total Amount Due</span>
                          <strong style={{ fontSize: 22 }}>{money(totalsForDisplay.total_amount)}</strong>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, opacity: .95 }}>
                        {hasServiceCart
                          ? 'Service booking totals are estimated from the selected service. Complete appointment details to book.'
                          : quoteResult
                            ? (quoteNeedsRefresh ? 'Displayed totals are stale. Click Quote again to re-sync and unlock checkout.' : 'Totals are synced from the latest quote and checkout is enabled.')
                            : 'No quote yet. Click Quote to unlock checkout.'}
                      </div>
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {!hasServiceCart && checkoutPermitted && accessCapabilities.quote !== false && (
                          <button type="button" onClick={handleQuote} disabled={!selectedStore || cart.length === 0} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.55)', background: '#ffffff', color: '#0f766e', padding: '11px 12px', fontWeight: 800 }}>{isFnbMode ? 'Refresh Quote' : 'Quote'}</button>
                        )}
                        <button type="button" onClick={handleCheckout} disabled={!checkoutAllowed} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.2)', background: '#0b3d3a', color: '#fff', padding: '11px 12px', fontWeight: 800 }}>{checkoutLoading ? 'Processing...' : (hasServiceCart ? 'Submit Booking' : (isFnbMode ? 'Place Order' : 'Checkout'))}</button>
                      </div>
                    </div>
                    {hasStockViolation && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>
                        Cannot checkout: one or more lines exceed current stock.
                      </p>
                    )}
                    {!hasServiceCart && !quoteResult && cart.length > 0 && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Quote is required before checkout.
                      </p>
                    )}
                    {!hasServiceCart && quoteResult && quoteNeedsRefresh && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Cart changed after quote. Click Quote again to proceed.
                      </p>
                    )}
                    {hasMixedServiceCart && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Services must be booked separately from regular product orders.
                      </p>
                    )}
                    {hasServiceCart && !serviceAppointmentAt && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Choose an appointment date and time before booking.
                      </p>
                    )}
                    {quoteError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
                    {!hasServiceCart && quoteResult && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#0f766e' }}>
                        Quote synced. Total due: {money(totalsForDisplay.total_amount)}
                      </p>
                    )}
                    {storefrontClosedByHours && renderStorefrontClosedNotice({ accent: servicesPrimary, background: '#eff6ff', border: '#bfdbfe' })}
                    {checkoutError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
                    {(checkoutResult?.tracking_pin || checkoutResult?.booking?.public_reference) && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 8, border: '1px solid #99f6e4', background: '#ecfeff', borderRadius: 12, padding: '10px 12px' }}>
                        <p style={{ margin: 0, fontSize: 13, color: '#0f766e' }}>
                          {checkoutResult?.booking ? 'Booking created.' : 'Order placed.'} Reference: <strong>{checkoutResult.booking?.public_reference || checkoutResult.tracking_pin}</strong>
                        </p>
                        {checkoutResult?.account_action?.show_signup === true && (
                          <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                            You can sign in or register to save this latest transaction to your account.
                          </p>
                        )}
                        {checkoutResult?.payment?.checkout_url && (
                          <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 12px', fontWeight: 800, textDecoration: 'none' }}>
                            Pay Now
                          </a>
                        )}
                        {checkoutResult?.account_action?.show_signup !== true && (
                          <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                            This ticket can be kept as an image for your gallery.
                          </p>
                        )}
                        <button type="button" onClick={handleDownloadCheckoutImage} style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 800 }}>
                          Download Image
                        </button>
                      </div>
                    )}
                    <p style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>{DGFY_ACRONYM}</p>
                  </div>
                </section>
              </div>
            )}

            <FnbTrackingRouteContainer {...fnbTrackingRouteProps} renderDrawer={false} />

      </StorefrontCheckoutDrawerFrame>
      <FnbTrackingRouteContainer {...fnbTrackingRouteProps} visible={false} />
      <StorefrontOrderSuccessOverlay visible={showOrderSuccessAnimation} />
    </>
  )}
      {customerDashboardDrawerRouteNode}


      <StorefrontPaymentUnavailableModal
        open={isOnlinePaymentModalOpen}
        onClose={uiCloseOnlinePaymentModal}
      />
    </main >
  );
}
