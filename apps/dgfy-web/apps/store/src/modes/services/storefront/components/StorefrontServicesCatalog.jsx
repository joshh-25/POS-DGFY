import React from 'react';
import {
  ArrowLeft,
  MessageCircle,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';
import { Badge, GhostButton, PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { StorefrontReviewModal } from '../../../../shared/components/storefront/StorefrontReviewModal.jsx';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { StorefrontPromoSection as SharedStorefrontPromoSection } from '../../../../shared/components/storefront/sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection as SharedStorefrontReviewsSection } from '../../../../shared/components/storefront/sections/StorefrontReviewsSection.jsx';
import { StorefrontFooterSection as SharedStorefrontFooterSection } from '../../../../shared/components/storefront/sections/StorefrontFooterSection.jsx';
import { filterCatalogItems } from '../../../../shared/model/catalogSearch.js';
import { isItemAvailable } from '../../../../shared/model/storefrontCatalogModel.js';
import { STOREFRONT_CLOSED_TITLE } from '../../../../shared/model/storefrontClosedState.js';
import { openStorefrontActionLink } from '../../../../shared/utils/externalLinks.js';
import { money } from '../../../../shared/utils/storefrontFormatters.js';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { SERVICE_CATEGORY_ICON_MAP } from '../model/serviceCategoryIconMap.jsx';
import {
  BOOKING_FIELD_STYLE,
  buildServicePaymentOptions,
  shouldBookingFieldSpanFullWidth
} from '../../booking/model/serviceBookingFields.js';
import {
  combineDateAndTimeParts,
  formatLongDateLabel,
  getPreferredBookingTimeForDate
} from '../../booking/model/serviceBookingSchedule.js';
import { ServiceBookingConfirmation } from '../../booking/components/ServiceBookingConfirmation.jsx';
import { ServiceBookingEmptyState } from '../../booking/components/ServiceBookingEmptyState.jsx';
import { ServiceBookingLocationSection } from '../../booking/components/ServiceBookingLocationSection.jsx';
import { ServiceBookingSummaryCard } from '../../booking/components/ServiceBookingSummaryCard.jsx';
import { ServiceBookingJourneyHeader } from '../../booking/components/ServiceBookingJourneyHeader.jsx';
import { ServiceBookingAddOnsStep } from '../../booking/components/ServiceBookingAddOnsStep.jsx';
import { ServiceBookingStepAccount, ServiceBookingStepFulfillment, ServiceBookingStepReviewPayment } from '../../booking/components/ServiceBookingSteps.jsx';
import { ServicesFilterModal } from './ServicesFilterModal.jsx';
import { ServicesPaginationBar } from './ServicesPaginationBar.jsx';

/**
 * StorefrontServicesCatalog — the full services-mode render branch: service
 * details subpage, booking subpage (multi-step), and the catalog grid
 * fallback (search/sort/filter, promo, reviews, review modal, footer).
 *
 * Pure view extracted verbatim from StorefrontApp.jsx (`if (isServicesMode)`).
 * `DeliveryPinMap` is received as a plain prop and passed straight through to
 * `ServiceBookingLocationSection` unchanged — this component does not own or
 * modify any map/discovery runtime behavior.
 */
export function StorefrontServicesCatalog({
  DeliveryPinMap,
  accountStepComplete,
  fulfillmentStepComplete,
  activeBookingService,
  addToCart,
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
  checkoutPromoCode,
  checkoutResult,
  customerPin,
  deliveryLocationAction,
  deliveryLocationDisplayAddress,
  deliverySavedLocations,
  applySavedDeliveryLocation,
  filteredCatalog,
  getCartFlySourceRect,
  goStoreCatalogPage,
  handleAddPinnedLocation,
  handleCheckout,
  handlePinMyLocation,
  handlePromoCardApply,
  hasServiceCart,
  isBookingSubpage,
  isDgfyCustomerSignedIn,
  isMobileViewport,
  isReviewModalOpen,
  isServiceDetailsSubpage,
  isServiceFilterOpen,
  itemsToRender,
  loadingCatalog,
  missingCustomerInformation,
  missingScheduleAndServiceInfo,
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
  resolvedTab,
  reviewDraft,
  routeServiceItemId,
  selectedSavedLocationId,
  selectedServiceDatePart,
  selectedServiceDetail,
  selectedServiceTimePart,
  serviceAreaFilter,
  serviceAvailabilityFilter,
  serviceBookingStep,
  serviceBookingSummaryLineItems,
  serviceBookingSummaryRows,
  serviceBookingSummaryTitle,
  serviceCartLines,
  serviceDraftQuantity,
  serviceDurationFilter,
  serviceHeroModel,
  serviceIntakeResponses,
  serviceLineAddOns,
  setServiceLineAddOns,
  groupedServiceLineItems,
  serviceSpecialInstructions,
  setServiceSpecialInstructions,
  serviceLocationLandmarkNote,
  serviceLocationSummaryDraft,
  serviceOrderMethod,
  setServiceOrderMethod,
  servicePage,
  servicePageSize,
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
  servicesViewModel,
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
  setServicePaymentTiming,
  setServiceSortOption,
  setServiceUnitType,
  setShowExpandedDeliveryMap,
  showExpandedDeliveryMap,
  storefrontClosedByHours,
  storefrontClosedMessageBody,
  submitFnbItemReview,
  viewportWidth
}) {
  const searchFilteredServices = filterCatalogItems(itemsToRender, catalogSearch);
  const availabilityFilteredServices = searchFilteredServices.filter((item) => {
    if (serviceAvailabilityFilter === 'available') return isItemAvailable(item);
    if (serviceAvailabilityFilter === 'unavailable') return !isItemAvailable(item);
    return true;
  });
  const areaFilteredServices = availabilityFilteredServices.filter((item) => {
    const areaType = String(item?.service_detail?.service_area_type || '').trim().toLowerCase();
    if (serviceAreaFilter === 'all') return true;
    return areaType === serviceAreaFilter;
  });
  const durationFilteredServices = areaFilteredServices.filter((item) => {
    const duration = Number(item?.service_detail?.duration_minutes || 0);
    if (serviceDurationFilter === 'all') return true;
    if (!Number.isFinite(duration) || duration <= 0) return false;
    if (serviceDurationFilter === 'short') return duration < 60;
    if (serviceDurationFilter === 'standard') return duration >= 60 && duration < 120;
    if (serviceDurationFilter === 'extended') return duration >= 120;
    return true;
  });
  const sortedServices = [...durationFilteredServices].sort((left, right) => {
    if (serviceSortOption === 'price_asc') return Number(left?.default_sale_price || 0) - Number(right?.default_sale_price || 0);
    if (serviceSortOption === 'price_desc') return Number(right?.default_sale_price || 0) - Number(left?.default_sale_price || 0);
    return String(left?.variantName || left?.name || '').localeCompare(String(right?.variantName || right?.name || ''));
  });
  const totalServicePages = Math.max(1, Math.ceil(sortedServices.length / Math.max(1, Number(servicePageSize || 8))));
  const resolvedServicePage = Math.min(Math.max(1, Number(servicePage || 1)), totalServicePages);
  const paginatedServices = sortedServices.slice((resolvedServicePage - 1) * servicePageSize, resolvedServicePage * servicePageSize);
  const servicePageStart = sortedServices.length === 0 ? 0 : ((resolvedServicePage - 1) * servicePageSize) + 1;
  const servicePageEnd = Math.min(sortedServices.length, resolvedServicePage * servicePageSize);
  const hasActiveFilters = serviceAvailabilityFilter !== 'all' || serviceAreaFilter !== 'all' || serviceDurationFilter !== 'all';
  const hasSearchQuery = catalogSearch.trim().length > 0;
  const reviewHighlights = Array.isArray(serviceHeroModel?.reviewHighlights) ? serviceHeroModel.reviewHighlights.filter(Boolean) : [];
  const reviewSummary = serviceHeroModel?.reviewSummary || null;
  const reviewScore = Number(reviewSummary?.score);
  const hasReviewSummary = Number.isFinite(reviewScore) && reviewScore > 0;
  const resolvedServicesLayoutMode = String(serviceHeroModel?.servicesLayoutMode || servicesLayoutMode || 'directory').trim().toLowerCase();
  const isLeadGenLayout = resolvedServicesLayoutMode === 'lead_gen';
  const isBookingHeavyLayout = resolvedServicesLayoutMode === 'booking_heavy';
  const controlRadius = 18;
  const serviceCategoryOptions = [
    {
      key: '',
      label: 'All Services',
      count: servicesViewModel.allServices.length,
      icon: Sparkles
    },
    ...servicesViewModel.serviceGroups.map((group) => ({
      key: group.categoryKey,
      label: group.categoryMeta?.label || group.categoryKey,
      count: group.items.length,
      icon: SERVICE_CATEGORY_ICON_MAP[group.categoryMeta?.iconToken] || Sparkles
    }))
  ];
  const detailPageServiceItem = selectedServiceDetail || (routeServiceItemId ? catalog.find((item) => String(item?.item_id) === String(routeServiceItemId)) || null : null);
  const detailPagePaymentOptions = buildServicePaymentOptions(detailPageServiceItem?.service_detail?.payment_policy || 'customer_choice');
  const servicesSectionTitle = isLeadGenLayout
    ? 'Service Highlights'
    : isBookingHeavyLayout
      ? 'Choose a Service'
      : 'Services';
  const servicesSectionSubtitle = isLeadGenLayout
    ? 'Start with the core services, then contact or book the team from the storefront.'
    : isBookingHeavyLayout
      ? 'Pick the service you need, review what to prepare, and continue to booking when you are ready.'
      : 'Browse available services from this storefront.';
  const servicesGridColumns = isMobileViewport
    ? '1fr'
    : isLeadGenLayout
      ? 'repeat(2, minmax(0, 1fr))'
      : (viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))');
  if (isServiceDetailsSubpage) {
    const supportHref = String(serviceHeroModel?.actions?.messageHref || serviceHeroModel?.actions?.callHref || '').trim();
    return (
      <section style={{ display: 'grid', gap: 0, paddingTop: 0 }}>
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          width: '100vw',
          marginLeft: 'calc(50% - 50vw)'
        }}>
          <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobileViewport ? '10px 16px' : '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 12 : 24, minWidth: 0, flex: 1 }}>
              <button type="button" onClick={goStoreCatalogPage} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: '#0f172a' }}>
                <ArrowLeft size={22} strokeWidth={2.5} />
              </button>
              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Service details
                </div>
                <div style={{ fontSize: isMobileViewport ? 14 : 16, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Review the service before booking
                </div>
              </div>
            </div>

            {!isMobileViewport && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'center' }}>
                {serviceHeroModel.profileImageUrl ? (
                  <img src={serviceHeroModel.profileImageUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', border: '1px solid #e2e8f0' }}>
                    <ShoppingBag size={18} color="#f97316" />
                  </div>
                )}
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.01em' }}>
                  {serviceHeroModel.name}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flex: 1 }}>
              {supportHref ? (
                <button type="button" onClick={() => openStorefrontActionLink(supportHref)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: isMobileViewport ? '0 12px' : '0 20px', borderRadius: 12, background: '#f97316', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)', whiteSpace: 'nowrap' }}>
                  <MessageCircle size={18} fill="currentColor" fillOpacity={0.2} />
                  {isMobileViewport ? 'Message' : 'Message Us'}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', background: '#eef4fb', padding: isMobileViewport ? '24px 0 40px' : '32px 0 56px' }}>
          <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobileViewport ? '0 16px' : '0 24px' }}>
            {!detailPageServiceItem ? (
              <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', padding: isMobileViewport ? 20 : 28, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 16, maxWidth: 760 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: STYLES.colors.dark }}>No service details available</div>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: STYLES.colors.muted }}>
                    Go back to the services page and choose a service to view its details.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <PrimaryButton onClick={goStoreCatalogPage} style={{ minHeight: 46 }}>Browse Services</PrimaryButton>
                </div>
              </section>
            ) : (
              <div style={{ display: 'grid', gap: 24 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Badge background="#fff7ed" color={STYLES.colors.brand} border="#fdba74">
                      {detailPageServiceItem.categoryMeta?.label || 'Service'}
                    </Badge>
                    <Badge background="#ffffff" color={STYLES.colors.dark} border="#dbe5ee">
                      {detailPageServiceItem.serviceAreaLabel}
                    </Badge>
                  </div>
                  <h1 style={{ margin: 0, fontSize: isMobileViewport ? 28 : 40, lineHeight: 1.05, fontWeight: 900, color: STYLES.colors.dark, letterSpacing: '-0.03em' }}>
                    {detailPageServiceItem.variantName || detailPageServiceItem.name}
                  </h1>
                  <p style={{ margin: 0, maxWidth: 760, fontSize: 15, lineHeight: 1.7, color: STYLES.colors.muted }}>
                    {detailPageServiceItem.description || 'Service details are synced from SKUpervisor. Review the service information below before continuing to booking.'}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(340px, 400px) minmax(0, 1fr)', gap: isMobileViewport ? 18 : 28, alignItems: 'start' }}>
                  <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', overflow: 'hidden', boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 0, position: isMobileViewport ? 'static' : 'sticky', top: isMobileViewport ? 'auto' : 96 }}>
                    <div style={{ width: '100%', height: isMobileViewport ? 260 : 240, background: '#f8fafc' }}>
                      {resolveStorefrontImageSources(detailPageServiceItem, { preferred: 'large' }).src ? (
                        <StorefrontResponsiveImage
                          alt={detailPageServiceItem.variantName || detailPageServiceItem.name}
                          imageSources={resolveStorefrontImageSources(detailPageServiceItem, { preferred: 'large' })}
                          loading="eager"
                          sizes={isMobileViewport ? '100vw' : '400px'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          width={400}
                          height={isMobileViewport ? 260 : 240}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: STYLES.colors.muted, fontSize: 14 }}>
                          No image
                        </div>
                      )}
                    </div>
                    <div style={{ padding: isMobileViewport ? 18 : 22, display: 'grid', gap: 18 }}>
                      <div style={{ display: 'grid', gap: 6, paddingTop: 2 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Starting at
                        </div>
                        <div style={{ fontSize: 30, fontWeight: 900, color: STYLES.colors.dark }}>
                          {money(detailPageServiceItem.default_sale_price ?? 0)}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
                        <PrimaryButton style={{ minHeight: 46 }} onClick={(event) => addToCart(detailPageServiceItem, { sourceRect: getCartFlySourceRect(event) })}>
                          Add to Cart
                        </PrimaryButton>
                        <GhostButton style={{ minHeight: 46 }} onClick={goStoreCatalogPage}>
                          Back to Services
                        </GhostButton>
                      </div>
                    </div>
                  </section>

                  <div style={{ display: 'grid', gap: 18 }}>
                    <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', padding: isMobileViewport ? 20 : 24, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 16 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: STYLES.colors.dark }}>
                          Service details
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.65, color: STYLES.colors.muted }}>
                          Core service information from SKUpervisor.
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                        <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Category</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPageServiceItem.categoryMeta?.label || 'Service'}</div>
                        </div>
                        <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service area</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPageServiceItem.serviceAreaLabel}</div>
                        </div>
                        <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated duration</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPageServiceItem.durationLabel}</div>
                        </div>
                        <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Payment options</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPagePaymentOptions.map((option) => option.label).join(' / ')}</div>
                        </div>
                      </div>
                    </section>

                    <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', padding: isMobileViewport ? 20 : 24, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 10 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: STYLES.colors.dark }}>Description</div>
                      <div style={{ fontSize: 14, lineHeight: 1.7, color: '#334155' }}>
                        {detailPageServiceItem.description || 'This service does not have a detailed description yet in SKUpervisor.'}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }
  if (isBookingSubpage) {
    const supportHref = String(serviceHeroModel?.actions?.messageHref || serviceHeroModel?.actions?.callHref || '').trim();
    const bookingConfirmation = checkoutResult?.booking || null;
    const confirmationLine = Array.isArray(checkoutResult?.cart_lines) ? checkoutResult.cart_lines[0] || null : null;
    const confirmationReference = String(bookingConfirmation?.public_reference || checkoutResult?.tracking_pin || '').trim();
    const confirmationServiceName = confirmationLine?.variantName || confirmationLine?.name || serviceBookingSummaryTitle;
    const confirmationAmount = bookingConfirmation?.total_amount ?? ((Number(confirmationLine?.price ?? 0) || 0) * Math.max(1, Number(confirmationLine?.quantity || 1)));
    const serviceLines = serviceBookingSummaryLineItems.map((line) => ({
      key: line.key,
      title: line.title,
      hasAddOns: Boolean(line.notes)
    }));
    const handleEditServiceLine = (line) => {
      if (hasServiceCart) {
        const rawCartLine = serviceCartLines.find((cartLine) => String(cartLine.cart_line_id || cartLine.item_id || '') === line.key);
        if (rawCartLine) openServiceCartEditor(rawCartLine);
      }
      setServiceBookingStep(3);
    };
    return (
      <section style={{ display: 'grid', gap: 0, paddingTop: 0 }}>
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          width: '100vw',
          marginLeft: 'calc(50% - 50vw)',
          boxSizing: 'border-box',
          boxShadow: '0 6px 18px rgba(15,23,42,.05)'
        }}>
          <div style={{
            maxWidth: 1240,
            margin: '0 auto',
            width: '100%',
            padding: isMobileViewport ? '12px 16px' : '18px 40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <button
                type="button"
                onClick={goStoreCatalogPage}
                aria-label="Back to services"
                style={{ width: isMobileViewport ? 44 : 40, height: isMobileViewport ? 44 : 40, borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}
              >
                <ArrowLeft size={18} />
              </button>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #dbe5ee', overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {serviceHeroModel.profileImageUrl ? (
                  <img src={serviceHeroModel.profileImageUrl} alt={`${serviceHeroModel.name} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>Logo</span>
                )}
              </div>
              <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {serviceOrderMethod === 'pickup' ? 'Pickup order' : 'Delivery order'}
                </div>
                <div style={{ fontSize: isMobileViewport ? 18 : 20, fontWeight: 900, color: '#1e293b', lineHeight: 1.2, fontFamily: servicesDisplayFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {serviceHeroModel.name}
                </div>
              </div>
            </div>
            {!isMobileViewport ? (
              <button
                type="button"
                onClick={() => openStorefrontActionLink(supportHref)}
                style={{ minHeight: 44, padding: '0 20px', borderRadius: 14, border: 'none', background: servicesPrimary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: `0 8px 22px ${servicesPrimaryShadow}`, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <MessageCircle size={16} />
                Message Us
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', background: '#fff' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? '24px 16px 40px' : '20px 40px 40px', boxSizing: 'border-box' }}>
            {bookingConfirmation ? (
              <ServiceBookingConfirmation
                isMobileViewport={isMobileViewport}
                confirmationReference={confirmationReference}
                confirmationServiceName={confirmationServiceName}
                confirmationAmount={confirmationAmount}
                checkoutResult={checkoutResult}
                money={money}
                onResetAndBackToServices={() => {
                  setCheckoutResult(null);
                  goStoreCatalogPage();
                }}
              />
            ) : !activeBookingService ? (
              <ServiceBookingEmptyState
                isMobileViewport={isMobileViewport}
                onBrowseServices={goStoreCatalogPage}
              />
            ) : (
            <>
            <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 18 }}>
              <ServiceBookingJourneyHeader
                accentColor={servicesPrimary}
                accentSoft={servicesPrimarySoft}
                accentBorder={servicesPrimaryBorder}
                completeColor={servicesPrimary}
                displayFont={servicesDisplayFont}
                activeStep={serviceBookingStep}
                onStepChange={setServiceBookingStep}
                bookingSummaryQuantity={bookingSummaryQuantity}
                accountStepComplete={accountStepComplete}
                fulfillmentStepComplete={fulfillmentStepComplete}
                isMobileViewport={isMobileViewport}
                serviceOrderMethod={serviceOrderMethod}
              />

              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.45fr) minmax(300px, 380px)', alignItems: 'start' }}>
                <section style={{ display: 'grid', gap: 18, minWidth: 0 }}>

                  {serviceBookingStep === 1 && (
                    <ServiceBookingStepAccount
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      renderAccountOwnedIdentitySummary={renderAccountOwnedIdentitySummary}
                      renderGuestIdentityFields={renderGuestIdentityFields}
                      renderGuestCheckoutEntry={renderGuestCheckoutEntry}
                      bookingFieldPlan={bookingFieldPlan}
                      activeBookingService={activeBookingService}
                      isMobileViewport={isMobileViewport}
                      isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
                      canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
                      missingCustomerInformation={missingCustomerInformation}
                      accountStepComplete={accountStepComplete}
                      toast={toast}
                      onBack={goStoreCatalogPage}
                      setServiceBookingStep={setServiceBookingStep}
                    />
                  )}

                  {serviceBookingStep === 2 && (
                    <ServiceBookingAddOnsStep
                      STYLES={STYLES}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      isMobileViewport={isMobileViewport}
                      servicesPrimary={servicesPrimary}
                      servicesPrimarySoft={servicesPrimarySoft}
                      servicesPrimaryBorder={servicesPrimaryBorder}
                      serviceLines={serviceLines}
                      onEditLine={handleEditServiceLine}
                      serviceLineAddOns={serviceLineAddOns}
                      setServiceLineAddOns={setServiceLineAddOns}
                      specialInstructions={serviceSpecialInstructions}
                      setSpecialInstructions={setServiceSpecialInstructions}
                      setServiceBookingStep={setServiceBookingStep}
                    />
                  )}

                  {serviceBookingStep === 3 && (
                    <ServiceBookingStepFulfillment
                      STYLES={STYLES}
                      BOOKING_FIELD_STYLE={BOOKING_FIELD_STYLE}
                      StorefrontDropdown={StorefrontDropdown}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      activeBookingService={activeBookingService}
                      bookingDateOptions={bookingDateOptions}
                      bookingFieldPlan={bookingFieldPlan}
                      bookingPreferredDateInputRef={bookingPreferredDateInputRef}
                      bookingStepOneAdditionalFields={bookingStepOneAdditionalFields}
                      bookingTimeSlotOptions={bookingTimeSlotOptions}
                      combineDateAndTimeParts={combineDateAndTimeParts}
                      formatLongDateLabel={formatLongDateLabel}
                      getPreferredBookingTimeForDate={getPreferredBookingTimeForDate}
                      openPreferredBookingDatePicker={openPreferredBookingDatePicker}
                      registerBookingFieldRef={registerBookingFieldRef}
                      isMobileViewport={isMobileViewport}
                      selectedServiceDatePart={selectedServiceDatePart}
                      selectedServiceTimePart={selectedServiceTimePart}
                      serviceDraftQuantity={serviceDraftQuantity}
                      serviceIntakeResponses={serviceIntakeResponses}
                      serviceUnitType={serviceUnitType}
                      servicesPrimary={servicesPrimary}
                      servicesPrimaryBorder={servicesPrimaryBorder}
                      servicesPrimaryShadow={servicesPrimaryShadow}
                      setServiceAppointmentAt={setServiceAppointmentAt}
                      setServiceDraftQuantity={setServiceDraftQuantity}
                      setServiceIntakeResponses={setServiceIntakeResponses}
                      setServiceUnitType={setServiceUnitType}
                      shouldBookingFieldSpanFullWidth={shouldBookingFieldSpanFullWidth}
                      serviceOrderMethod={serviceOrderMethod}
                      onOrderMethodChange={setServiceOrderMethod}
                      renderLocationSection={() => (
                        <ServiceBookingLocationSection
                          STYLES={STYLES}
                          servicesPrimary={servicesPrimary}
                          servicesPrimarySoft={servicesPrimarySoft}
                          servicesPrimaryBorder={servicesPrimaryBorder}
                          servicesDisplayFont={servicesDisplayFont}
                          servicesBodyFont={servicesBodyFont}
                          isMobileViewport={isMobileViewport}
                          DeliveryPinMap={DeliveryPinMap}
                          deliverySavedLocations={deliverySavedLocations}
                          applySavedDeliveryLocation={applySavedDeliveryLocation}
                          selectedSavedLocationId={selectedSavedLocationId}
                          setSelectedSavedLocationId={setSelectedSavedLocationId}
                          setDeliveryLocationAction={setDeliveryLocationAction}
                          customerPin={customerPin}
                          setCustomerPin={setCustomerPin}
                          serviceLocationLandmarkNote={serviceLocationLandmarkNote}
                          setServiceLocationLandmarkNote={setServiceLocationLandmarkNote}
                          handlePinMyLocation={handlePinMyLocation}
                          pinLocationLoading={pinLocationLoading}
                          deliveryLocationAction={deliveryLocationAction}
                          deliveryLocationDisplayAddress={deliveryLocationDisplayAddress}
                          handleAddPinnedLocation={handleAddPinnedLocation}
                          canAddPinnedLocation={canAddPinnedLocation}
                          isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
                          pinLocationError={pinLocationError}
                          showExpandedDeliveryMap={showExpandedDeliveryMap}
                          setShowExpandedDeliveryMap={setShowExpandedDeliveryMap}
                        />
                      )}
                      missingScheduleAndServiceInfo={missingScheduleAndServiceInfo}
                      fulfillmentStepComplete={fulfillmentStepComplete}
                      toast={toast}
                      setServiceBookingStep={setServiceBookingStep}
                    />
                  )}

                  {serviceBookingStep === 4 && (
                    <ServiceBookingStepReviewPayment
                      STYLES={STYLES}
                      BOOKING_FIELD_STYLE={BOOKING_FIELD_STYLE}
                      StorefrontDropdown={StorefrontDropdown}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      servicesPrimary={servicesPrimary}
                      servicesPrimarySoft={servicesPrimarySoft}
                      servicesPrimaryBorder={servicesPrimaryBorder}
                      money={money}
                      registerBookingFieldRef={registerBookingFieldRef}
                      isMobileViewport={isMobileViewport}
                      serviceOrderMethod={serviceOrderMethod}
                      serviceLocationSummaryDraft={serviceLocationSummaryDraft}
                      groupedServiceLineItems={groupedServiceLineItems}
                      selectedServiceDatePart={selectedServiceDatePart}
                      selectedServiceTimePart={selectedServiceTimePart}
                      specialInstructions={serviceSpecialInstructions}
                      servicePaymentTiming={servicePaymentTiming}
                      setServicePaymentTiming={setServicePaymentTiming}
                      bookingPagePaymentOptions={bookingPagePaymentOptions}
                      bookingSummaryAmount={bookingSummaryAmount}
                      servicesDisplayFont={servicesDisplayFont}
                      checkoutError={checkoutError}
                      storefrontClosedByHours={storefrontClosedByHours}
                      storefrontClosedTitle={STOREFRONT_CLOSED_TITLE}
                      storefrontClosedMessageBody={storefrontClosedMessageBody}
                      setServiceBookingStep={setServiceBookingStep}
                      toast={toast}
                      handleCheckout={handleCheckout}
                    />
                  )}
                </section>

                <ServiceBookingSummaryCard
                  isMobileViewport={isMobileViewport}
                  STYLES={STYLES}
                  servicesPrimary={servicesPrimary}
                  money={money}
                  bookingSummaryAmount={bookingSummaryAmount}
                  summaryRows={serviceBookingSummaryRows}
                  serviceLineItems={groupedServiceLineItems}
                />
              </div>
            </div>
            </>
            )}
          </div>
        </div>
      </section>
    );
  }
  return (
    <>
      <section
        id="storefront-catalog-section"
        style={{
          display: 'grid',
          gap: 18,
          background: '#ffffff',
          borderRadius: 0,
          padding: isMobileViewport ? '24px 0 44px' : '34px 0 64px',
          marginLeft: 'calc(50% - 50vw)',
          width: '100vw'
        }}
      >
        <div
          style={{
            maxWidth: 1320,
            width: '100%',
            margin: '0 auto',
            paddingLeft: isMobileViewport ? 16 : 24,
            paddingRight: isMobileViewport ? 16 : 24,
            display: 'grid',
            gap: 18
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: STYLES.colors.dark }}>
              {servicesSectionTitle}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: STYLES.colors.muted }}>{servicesSectionSubtitle}</p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: isMobileViewport ? 'column' : 'row',
              gap: 12,
              alignItems: isMobileViewport ? 'stretch' : 'center',
              width: '100%'
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1px solid #e5e7eb',
                borderRadius: controlRadius,
                background: '#f8fafc',
                padding: '0 12px 0 14px',
                minHeight: 44,
                width: '100%',
                flex: isMobileViewport ? '0 0 auto' : '1 1 0',
                maxWidth: isMobileViewport ? '100%' : 620
              }}
            >
              <Search size={16} color="#64748b" />
              <input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Search items in this store catalog..."
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  width: '100%',
                  minWidth: 0,
                  fontSize: 14,
                  color: STYLES.colors.text
                }}
              />
            </label>

            <div
              style={{
                display: 'flex',
                flexDirection: isMobileViewport ? 'column' : 'row',
                gap: 12,
                alignItems: isMobileViewport ? 'stretch' : 'center',
                marginLeft: isMobileViewport ? 0 : 'auto',
                width: isMobileViewport ? '100%' : 'auto',
                flexShrink: 0
              }}
            >
              <StorefrontDropdown
                value={resolvedTab}
                onChange={setActiveServiceTab}
                options={serviceCategoryOptions.map((option) => ({
                  value: option.key,
                  label: `${option.label} (${option.count})`,
                  icon: option.icon
                }))}
                triggerStyle={{
                  minHeight: 44,
                  borderRadius: controlRadius,
                  width: isMobileViewport ? '100%' : 240,
                  flexShrink: 0,
                  boxShadow: '0 10px 24px rgba(15,23,42,0.06)'
                }}
                containerStyle={{
                  width: isMobileViewport ? '100%' : 240,
                  flexShrink: 0
                }}
                menuStyle={{ borderRadius: 20 }}
              />

              <StorefrontDropdown
                value={serviceSortOption}
                onChange={setServiceSortOption}
                options={[
                  { value: 'recommended', label: 'Recommended' },
                  { value: 'price_asc', label: 'Price: Low to High' },
                  { value: 'price_desc', label: 'Price: High to Low' }
                ]}
                triggerStyle={{
                  minHeight: 44,
                  borderRadius: controlRadius,
                  width: isMobileViewport ? '100%' : 240,
                  flexShrink: 0,
                  boxShadow: '0 10px 24px rgba(15,23,42,0.06)'
                }}
                containerStyle={{
                  width: isMobileViewport ? '100%' : 240,
                  flexShrink: 0
                }}
                menuStyle={{ borderRadius: 20 }}
              />

              <button
                type="button"
                onClick={() => setIsServiceFilterOpen((prev) => !prev)}
                style={{
                  minHeight: 44,
                  borderRadius: controlRadius,
                  border: `1px solid ${servicesPrimary}`,
                  background: isServiceFilterOpen || hasActiveFilters ? servicesPrimaryDark : servicesPrimary,
                  color: '#ffffff',
                  padding: '0 18px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: isMobileViewport ? '100%' : 'auto',
                  minWidth: isMobileViewport ? 0 : 128,
                  flexShrink: 0,
                  boxShadow:
                    isServiceFilterOpen || hasActiveFilters
                      ? `0 10px 24px ${servicesPrimaryShadowStrong}`
                      : `0 8px 20px ${servicesPrimaryShadow}`
                }}
              >
                <SlidersHorizontal size={16} />
                Filters
              </button>
            </div>
          </div>
          {filteredCatalog.length === 0 && !loadingCatalog && !catalogError && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button
                type="button"
                onClick={refreshStorePageForTenantSetup}
                style={{ borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 700 }}
              >
                Check Again
              </button>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              flexWrap: 'wrap'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isMobileViewport ? 'flex-start' : 'flex-end',
                gap: 12,
                flexWrap: 'wrap',
                marginLeft: isMobileViewport ? 0 : 'auto'
              }}
            >
              <div style={{ fontSize: 13, color: STYLES.colors.muted }}>
                {sortedServices.length} service{sortedServices.length === 1 ? '' : 's'} shown
              </div>
              {sortedServices.length > 0 && (
                <div style={{ fontSize: 13, color: STYLES.colors.muted }}>
                  Showing {servicePageStart}-{servicePageEnd}
                </div>
              )}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setServiceAvailabilityFilter('all');
                    setServiceAreaFilter('all');
                    setServiceDurationFilter('all');
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: servicesPrimary,
                    fontSize: 13,
                    fontWeight: 700,
                    padding: 0,
                    cursor: 'pointer'
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {isServiceFilterOpen && (
            <ServicesFilterModal
              isMobileViewport={isMobileViewport}
              serviceAvailabilityFilter={serviceAvailabilityFilter}
              onAvailabilityChange={setServiceAvailabilityFilter}
              serviceAreaFilter={serviceAreaFilter}
              onAreaChange={setServiceAreaFilter}
              serviceDurationFilter={serviceDurationFilter}
              onDurationChange={setServiceDurationFilter}
              onClose={() => setIsServiceFilterOpen(false)}
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: servicesGridColumns, gap: 22 }}>
            {paginatedServices.map((item) => {
              const imageSources = resolveStorefrontImageSources(item, { preferred: 'medium' });
              const available = isItemAvailable(item);
              const ServiceCategoryIcon = SERVICE_CATEGORY_ICON_MAP[item.categoryMeta?.iconToken] || Sparkles;
              return (
                <div
                  key={item.item_id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 18,
                    overflow: 'hidden',
                    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer'
                  }}
                  onClick={() => openServiceDetail(item)}
                >
                  <div style={{ width: '100%', height: 184, minHeight: 184, maxHeight: 184, background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
                    {imageSources.src ? (
                      <StorefrontResponsiveImage
                        alt=""
                        imageSources={imageSources}
                        sizes="(max-width: 720px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        width={400}
                        height={184}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'grid',
                          placeItems: 'center',
                          color: STYLES.colors.muted,
                          fontSize: 13
                        }}
                      >
                        No image
                      </div>
                    )}
                    {!available && (
                      <div style={{ position: 'absolute', top: 12, right: 12 }}>
                        <Badge background="#fff7ed" color="#c2410c" border="#fdba74">
                          Unavailable
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 16, display: 'grid', gap: 10, flex: 1 }}>
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', marginBottom: 4 }}>
                        <ServiceCategoryIcon size={13} />
                        <span>{item.categoryMeta?.label || 'Service'}</span>
                      </div>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.25, color: STYLES.colors.dark }}>
                        {item.variantName || item.name}
                      </h4>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: STYLES.colors.text,
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {item.description || 'Professional service options synced from SKUpervisor.'}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 999, padding: '4px 8px' }}>
                        {item.serviceAreaLabel}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 999, padding: '4px 8px' }}>
                        {item.durationLabel}
                      </span>
                    </div>
                    <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
                      <div style={{ fontSize: 13, color: STYLES.colors.muted }}>Starting at</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: servicesPrimaryDark }}>{money(item.default_sale_price ?? 0)}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 8 }}>
                        <GhostButton style={{ minHeight: 38, fontSize: 13 }} onClick={(event) => { event.stopPropagation(); openServiceDetail(item); }}>
                          View Details
                        </GhostButton>
                        <PrimaryButton style={{ minHeight: 38, fontSize: 13 }} onClick={(event) => { event.stopPropagation(); addToCart(item, { sourceRect: getCartFlySourceRect(event) }); }} disabled={!available}>
                          Add to Cart
                        </PrimaryButton>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {sortedServices.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: isMobileViewport ? 24 : 48,
                  color: STYLES.colors.muted,
                  border: '1px dashed #cbd5e1',
                  borderRadius: 18,
                  background: '#f8fafc'
                }}
              >
                {hasSearchQuery ? 'No services found. Try another keyword.' : 'No services available in this category yet.'}
              </div>
            )}
          </div>

          {sortedServices.length > 0 && totalServicePages > 1 && (
            <ServicesPaginationBar
              isMobileViewport={isMobileViewport}
              resolvedServicePage={resolvedServicePage}
              totalServicePages={totalServicePages}
              servicePageSize={servicePageSize}
              onPageSizeChange={setServicePageSize}
              onPageChange={setServicePage}
              servicesPrimary={servicesPrimary}
            />
          )}
        </div>
      </section>

      <SharedStorefrontPromoSection
        items={promoSectionModel}
        isMobileViewport={isMobileViewport}
        layoutVariant="compact"
        palette="teal"
        titleFontFamily={servicesDisplayFont}
        bodyFontFamily={servicesBodyFont}
        sectionPadding={isMobileViewport ? '20px 0 24px' : '36px 0 40px'}
        contentMaxWidth={1280}
        sectionBackground="#ffffff"
        titleSize={isMobileViewport ? 28 : 36}
        subtitleSize={isMobileViewport ? 14 : 16}
        activePromoCode={checkoutPromoCode}
        onApplyPromo={handlePromoCardApply}
        collapseSpacing
      />

      <SharedStorefrontReviewsSection
        isMobileViewport={isMobileViewport}
        viewportWidth={viewportWidth}
        title="Customer Reviews"
        subtitle="See what customers say about this storefront"
        onWriteReview={() => setIsReviewModalOpen(true)}
        reviewSummary={reviewSummary}
        reviewHighlights={reviewHighlights}
        emptyMessage={hasReviewSummary
          ? 'Customer review highlights will appear here once detailed review entries are added in SKUpervisor.'
          : 'Customer reviews will appear here once this storefront adds review data in SKUpervisor.'}
        titleFontFamily={servicesDisplayFont}
        bodyFontFamily={servicesBodyFont}
        cardVariant="white"
        writeButtonColor={servicesPrimary}
        sectionPadding={isMobileViewport ? '20px 0 24px' : '36px 0 40px'}
        contentMaxWidth={1280}
        titleSize={isMobileViewport ? 28 : 36}
        subtitleSize={isMobileViewport ? 14 : 16}
        collapseSpacing
        summaryEnabled
        starSymbol="*"
      />

      {isReviewModalOpen && (
        <StorefrontReviewModal
          isMobileViewport={isMobileViewport}
          eyebrowColor={servicesPrimary}
          titleFontFamily={servicesDisplayFont}
          starColor="#f59e0b"
          starBg="#fff7ed"
          starShadow="0 10px 20px rgba(245,158,11,0.16)"
          keyPrefix="review-rating"
          messagePlaceholder="Tell customers what stood out about the service, response time, or booking experience."
          reviewDraft={reviewDraft}
          onReviewDraftChange={setReviewDraft}
          onClose={() => setIsReviewModalOpen(false)}
          onSubmit={submitFnbItemReview}
        />
      )}

      <SharedStorefrontFooterSection
        isMobileViewport={isMobileViewport}
        name={serviceHeroModel.name}
        registrationYear={serviceHeroModel.registrationYear}
        description={serviceHeroModel.tagline || serviceHeroModel.aboutText || 'Service storefront powered by SKUpervisor content.'}
        displayFont={servicesDisplayFont}
        bodyFontFamily={servicesBodyFont}
        sectionPadding={isMobileViewport ? '28px 16px 24px' : '48px 32px 36px'}
        badgeLinks={serviceHeroModel.footerLinks.filter((link) => ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'].includes(link.label))}
        columns={[
          {
            title: 'Services',
            items: (serviceHeroModel.serviceGroups || []).slice(0, 5).map((group) => ({
              label: group.categoryMeta?.label || group.categoryKey
            })),
            emptyText: 'No services yet.'
          },
          {
            title: 'Socials',
            items: serviceHeroModel.footerLinks
              .filter((link) => ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'].includes(link.label))
              .map((link) => ({ label: link.label, href: link.href })),
            emptyText: 'No social links yet.'
          },
          {
            title: 'Contact',
            items: [
              ...serviceHeroModel.footerLinks
                .filter((link) => ['Call', 'Email'].includes(link.label))
                .map((link) => ({
                  label: link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', ''),
                  href: link.href
                })),
              ...(serviceHeroModel.hours ? [{ label: serviceHeroModel.hours }] : []),
              { label: serviceHeroModel.locationLabel }
            ]
          }
        ]}
      />
    </>
  );
}
