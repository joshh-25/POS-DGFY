import React, { useState } from 'react';
import {
  ArrowLeft,
  MessageCircle,
  ShoppingBag
} from 'lucide-react';
import { toast } from 'sonner';

import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import { Badge, GhostButton, PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { StorefrontReviewModal } from '../../../../shared/components/storefront/StorefrontReviewModal.jsx';
import { ServiceImage } from '../../ServiceImage.jsx';
import { StorefrontPromoSection as SharedStorefrontPromoSection } from '../../../../shared/components/storefront/sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection as SharedStorefrontReviewsSection } from '../../../../shared/components/storefront/sections/StorefrontReviewsSection.jsx';
import { StorefrontFooterSection as SharedStorefrontFooterSection } from '../../../../shared/components/storefront/sections/StorefrontFooterSection.jsx';
import { filterCatalogItems } from '../../../../shared/model/catalogSearch.js';
import { isItemAvailable } from '../../../../shared/model/storefrontCatalogModel.js';
import { STOREFRONT_CLOSED_TITLE } from '../../../../shared/model/storefrontClosedState.js';
import { openStorefrontActionLink } from '../../../../shared/utils/externalLinks.js';
import { formatServiceMoney as money, formatServiceNumber } from '../../servicesFormatters.js';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import {
  BOOKING_FIELD_STYLE,
  buildServicePaymentOptions,
  shouldBookingFieldSpanFullWidth
} from '../../booking/model/serviceBookingFields.js';
import {
  combineDateAndTimeParts,
  formatLongDateLabel
} from '../../booking/model/serviceBookingSchedule.js';
import { ServiceBookingConfirmation } from '../../booking/components/ServiceBookingConfirmation.jsx';
import { ServiceBookingEmptyState } from '../../booking/components/ServiceBookingEmptyState.jsx';
import { ServiceBookingLocationSection } from '../../booking/components/ServiceBookingLocationSection.jsx';
import { ServiceBookingSummaryCard } from '../../booking/components/ServiceBookingSummaryCard.jsx';
import { ServiceBookingMobileSummaryPanel } from '../../booking/components/ServiceBookingMobileSummaryPanel.jsx';
import { ServiceBookingJourneyHeader } from '../../booking/components/ServiceBookingJourneyHeader.jsx';
import { ServiceBookingAddOnsStep } from '../../booking/components/ServiceBookingAddOnsStep.jsx';
import { ServiceBookingStepAccount, ServiceBookingStepFulfillment, ServiceBookingStepReviewPayment } from '../../booking/components/ServiceBookingSteps.jsx';
import { ServicesCatalogToolbar } from './ServicesCatalogToolbar.jsx';
import { ServiceCatalogCard } from './ServiceCatalogCard.jsx';
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
  updateServiceLineOptions,
  bookingCalendarDateOptions,
  bookingDateOptions,
  bookingFieldPlan,
  bookingPagePaymentOptions,
  bookingPreferredDateInputRef,
  bookingStepOneAdditionalFields,
  bookingSummaryAmount,
  bookingSummaryQuantity,
  bookingTimeSlotOptions,
  getPreferredBookingTimeForDate,
  canAddPinnedLocation,
  canUseGuestCheckoutFlow,
  guestCheckoutAllowed = true,
  catalog,
  catalogError,
  catalogSearch,
  checkoutError,
  checkoutLoading,
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
  onApplyGuestDetailsAndRequestOtp,
  onGuestCheckoutOtpCodeChange,
  onRequestGuestCheckoutOtp,
  onVerifyGuestCheckoutOtp,
  hasServiceCart,
  isBookingSubpage,
  isDgfyCustomerSignedIn,
  isGuestCheckoutOtpCooldownActive,
  isMobileViewport,
  isReviewModalOpen,
  isServiceDetailsSubpage,
  itemsToRender,
  loadingCatalog,
  missingCustomerInformation,
  missingScheduleAndServiceInfo,
  openPreferredBookingDatePicker,
  openServiceCartEditor,
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
  selectedLocation,
  selectedLocationId,
  storeLocations,
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
  groupedServiceLineItems,
  serviceSpecialInstructions,
  setServiceSpecialInstructions,
  serviceLocationSummaryDraft,
  serviceOrderMethod,
  serviceFlowMethod,
  serviceFlowProfileMethod,
  setServiceOrderMethod,
  serviceScheduleMode,
  setServiceScheduleMode,
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
  servicesPrimarySoft,
  servicesViewModel,
  setActiveServiceTab,
  setCatalogSearch,
  setCheckoutResult,
  setCustomerPin,
  setDeliveryLocationAction,
  setIsReviewModalOpen,
  setReviewDraft,
  setSelectedLocationId,
  setSelectedSavedLocationId,
  setServiceAppointmentAt,
  setServiceAreaFilter,
  setServiceAvailabilityFilter,
  setServiceBookingStep,
  setServiceDraftQuantity,
  setServiceDurationFilter,
  setServiceIntakeResponses,
  setServicePage,
  setServicePageSize,
  setServicePaymentTiming,
  setServiceSortOption,
  setServiceUnitType,
  setShowExpandedDeliveryMap,
  showExpandedDeliveryMap,
  storefrontClosedByHours,
  storefrontClosedMessageBody,
  syncServiceBookingDraft,
  submitFnbItemReview,
  viewportWidth
}) {
  const [servicesViewMode, setServicesViewMode] = useState('list');
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
  const hasActiveFilters = serviceAvailabilityFilter !== 'all' || serviceAreaFilter !== 'all' || serviceDurationFilter !== 'all';
  const hasSearchQuery = catalogSearch.trim().length > 0;
  const servicePrimaryButtonProps = {
    accentColor: servicesPrimary,
    accentDarkColor: servicesPrimaryDark,
    shadowColor: servicesPrimaryShadow
  };
  const reviewHighlights = Array.isArray(serviceHeroModel?.reviewHighlights) ? serviceHeroModel.reviewHighlights.filter(Boolean) : [];
  const reviewSummary = serviceHeroModel?.reviewSummary || null;
  const reviewScore = Number(reviewSummary?.score);
  const hasReviewSummary = Number.isFinite(reviewScore) && reviewScore > 0;
  const resolvedServicesLayoutMode = String(serviceHeroModel?.servicesLayoutMode || servicesLayoutMode || 'directory').trim().toLowerCase();
  const isLeadGenLayout = resolvedServicesLayoutMode === 'lead_gen';
  const catalogPresentation = serviceHeroModel?.catalogPresentation || {};
  const catalogMaxWidth = Number(catalogPresentation.maxWidth) || 1216;
  const catalogHorizontalPadding = Number.isFinite(Number(catalogPresentation.horizontalPadding))
    ? Number(catalogPresentation.horizontalPadding)
    : 24;
  const catalogUsesOuterGutter = catalogPresentation.usesOuterGutter === true;
  const catalogFrameWidth = !isMobileViewport && catalogUsesOuterGutter
    ? `calc(100% - ${catalogHorizontalPadding * 2}px)`
    : '100%';
  const detailPageServiceItem = selectedServiceDetail || (routeServiceItemId ? catalog.find((item) => String(item?.item_id) === String(routeServiceItemId)) || null : null);
  const detailPagePaymentOptions = buildServicePaymentOptions(detailPageServiceItem?.service_detail?.payment_policy || 'customer_choice');
  const servicesGridColumns = isMobileViewport
    ? '1fr'
    : isLeadGenLayout
      ? 'repeat(2, minmax(0, 1fr))'
      : (viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))');
  const servicesGridGap = isMobileViewport ? 18 : 24;
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
                <div style={{ fontSize: 11, fontWeight: 900, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Service details
                </div>
                <div style={{ fontSize: isMobileViewport ? 14 : 16, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Review the service before booking
                </div>
              </div>
            </div>

            {!isMobileViewport && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'center' }}>
                <ServiceImage
                  imageSources={serviceHeroModel.profileImageSources}
                  alt={`${serviceHeroModel.name} profile`}
                  sizes="34px"
                  width={34}
                  height={34}
                  fallbackLabel=""
                  fallbackStyle={{ borderRadius: '50%', border: '1px solid #e2e8f0' }}
                  fallbackIcon={<ShoppingBag size={18} color={servicesPrimary} />}
                />
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.01em' }}>
                  {serviceHeroModel.name}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flex: 1 }}>
              {supportHref ? (
                <button type="button" onClick={() => openStorefrontActionLink(supportHref)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: isMobileViewport ? '0 12px' : '0 20px', borderRadius: 12, background: servicesPrimary, color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: `0 4px 12px ${servicesPrimaryShadow}`, whiteSpace: 'nowrap' }}>
                  <MessageCircle size={18} fill="currentColor" fillOpacity={0.2} />
                  {isMobileViewport ? 'Message' : 'Message Us'}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', background: '#f8fafc', padding: isMobileViewport ? '24px 0 40px' : '32px 0 56px' }}>
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
                  <PrimaryButton {...servicePrimaryButtonProps} onClick={goStoreCatalogPage} style={{ minHeight: 46 }}>Browse Services</PrimaryButton>
                </div>
              </section>
            ) : (
              <div style={{ display: 'grid', gap: 24 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Badge background={servicesPrimarySoft} color={servicesPrimaryDark} border={servicesPrimaryBorder}>
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
                      <ServiceImage
                        item={detailPageServiceItem}
                        alt={detailPageServiceItem.variantName || detailPageServiceItem.name}
                        loading="eager"
                        sizes={isMobileViewport ? '100vw' : '400px'}
                        width={400}
                        height={isMobileViewport ? 260 : 240}
                        fallbackLabel="No service image"
                      />
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
                        <PrimaryButton {...servicePrimaryButtonProps} style={{ minHeight: 46 }} onClick={(event) => addToCart(detailPageServiceItem, { sourceRect: getCartFlySourceRect(event) })}>
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
    const bookingConfirmation = checkoutResult?.booking
      || (Array.isArray(checkoutResult?.bookings) ? checkoutResult.bookings[0] : null)
      || null;
    const confirmationLine = Array.isArray(checkoutResult?.cart_lines) ? checkoutResult.cart_lines[0] || null : null;
    const confirmationReference = String(bookingConfirmation?.public_reference || checkoutResult?.tracking_pin || '').trim();
    const confirmationServiceName = confirmationLine?.variantName || confirmationLine?.name || serviceBookingSummaryTitle;
    const confirmationAmount = bookingConfirmation?.total_amount ?? ((Number(confirmationLine?.price ?? 0) || 0) * Math.max(1, Number(confirmationLine?.quantity || 1)));
    const serviceLines = serviceBookingSummaryLineItems.map((line) => {
      const rawCartLine = serviceCartLines.find((cartLine) => String(cartLine.cart_line_id || cartLine.item_id || '') === line.key);
      const catalogService = catalog.find((item) => Number(item?.item_id) === Number(line.itemId || rawCartLine?.item_id));
      const serviceOptionGroups = Array.isArray(catalogService?.service_option_groups)
        ? catalogService.service_option_groups
        : line.serviceOptionGroups;
      return {
        key: line.key,
        title: line.title,
        selectedOptions: line.selectedOptions,
        serviceOptionGroups,
        hasAvailableAddOns: Array.isArray(serviceOptionGroups)
          && serviceOptionGroups.some((group) => group.group_type === 'addon' && Array.isArray(group.options) && group.options.length > 0)
      };
    });
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
                <ServiceImage
                  imageSources={serviceHeroModel.profileImageSources}
                  alt={`${serviceHeroModel.name} profile`}
                  sizes="40px"
                  width={40}
                  height={40}
                  fallbackLabel=""
                  fallbackStyle={{ borderRadius: '50%' }}
                  fallbackIcon={<ShoppingBag size={18} color={servicesPrimary} />}
                />
              </div>
              <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
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
          <div style={{ maxWidth: 1264, margin: '0 auto', width: '100%', padding: isMobileViewport ? '40px 16px calc(env(safe-area-inset-bottom, 0px) + 196px)' : '80px 24px 80px', boxSizing: 'border-box' }}>
            {bookingConfirmation ? (
              <ServiceBookingConfirmation
                isMobileViewport={isMobileViewport}
                confirmationReference={confirmationReference}
                confirmationServiceName={confirmationServiceName}
                confirmationAmount={confirmationAmount}
                checkoutResult={checkoutResult}
                money={money}
                servicesPrimary={servicesPrimary}
                servicesPrimaryDark={servicesPrimaryDark}
                servicesPrimarySoft={servicesPrimarySoft}
                servicesPrimaryBorder={servicesPrimaryBorder}
                servicesPrimaryShadow={servicesPrimaryShadow}
                servicesDisplayFont={servicesDisplayFont}
                onTrackBooking={() => goStoreTrackPage({ pin: confirmationReference, serviceHandoff: serviceOrderMethod })}
                onResetAndBackToServices={() => {
                  setCheckoutResult(null);
                  goStoreCatalogPage();
                }}
              />
            ) : !activeBookingService ? (
              <ServiceBookingEmptyState
                isMobileViewport={isMobileViewport}
                onBrowseServices={goStoreCatalogPage}
                servicesPrimary={servicesPrimary}
                servicesPrimaryDark={servicesPrimaryDark}
                servicesPrimaryShadow={servicesPrimaryShadow}
                servicesDisplayFont={servicesDisplayFont}
              />
            ) : (
            <>
            <div style={{ display: 'grid', gap: isMobileViewport ? 32 : 32 }}>
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
                serviceFlowMethod={serviceFlowMethod}
                serviceFlowProfileMethod={serviceFlowProfileMethod}
              />

              <div style={{ display: 'grid', gap: isMobileViewport ? 20 : 20, gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1fr) minmax(300px, 358.8px)', alignItems: 'start' }}>
                <section style={{ display: 'grid', gap: 18, minWidth: 0 }}>

                  {serviceBookingStep === 1 && (
                    <ServiceBookingStepAccount
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      primaryButtonProps={servicePrimaryButtonProps}
                      servicesPrimary={servicesPrimary}
                      renderAccountOwnedIdentitySummary={renderAccountOwnedIdentitySummary}
                      renderGuestIdentityFields={renderGuestIdentityFields}
                      renderGuestCheckoutEntry={renderGuestCheckoutEntry}
                      bookingFieldPlan={bookingFieldPlan}
                      activeBookingService={activeBookingService}
                      isMobileViewport={isMobileViewport}
                      isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
                      canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
                      guestCheckoutAllowed={guestCheckoutAllowed}
                      missingCustomerInformation={missingCustomerInformation}
                      accountStepComplete={accountStepComplete}
                      guestCheckoutOtpCode={guestCheckoutOtpCode}
                      guestCheckoutOtpCooldownLabel={guestCheckoutOtpCooldownLabel}
                      guestCheckoutOtpError={guestCheckoutOtpError}
                      guestCheckoutOtpLoading={guestCheckoutOtpLoading}
                      guestCheckoutOtpVerified={guestCheckoutOtpVerified}
                      isGuestCheckoutOtpCooldownActive={isGuestCheckoutOtpCooldownActive}
                      onApplyGuestDetailsAndRequestOtp={onApplyGuestDetailsAndRequestOtp}
                      onGuestCheckoutOtpCodeChange={onGuestCheckoutOtpCodeChange}
                      onRequestGuestCheckoutOtp={onRequestGuestCheckoutOtp}
                      onVerifyGuestCheckoutOtp={onVerifyGuestCheckoutOtp}
                      servicesBodyFont={servicesBodyFont}
                      servicesDisplayFont={servicesDisplayFont}
                      toast={toast}
                      onBack={goStoreCatalogPage}
                      setServiceBookingStep={setServiceBookingStep}
                      referenceStyle
                    />
                  )}

                  {serviceBookingStep === 2 && (
                    <ServiceBookingAddOnsStep
                      STYLES={STYLES}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      primaryButtonProps={servicePrimaryButtonProps}
                      isMobileViewport={isMobileViewport}
                      money={money}
                      servicesPrimary={servicesPrimary}
                      servicesPrimarySoft={servicesPrimarySoft}
                      servicesPrimaryBorder={servicesPrimaryBorder}
                      servicesDisplayFont={servicesDisplayFont}
                      serviceLines={serviceLines}
                      serviceOrderMethod={serviceOrderMethod}
                      onEditLine={handleEditServiceLine}
                      onUpdateLineOptions={updateServiceLineOptions}
                      specialInstructions={serviceSpecialInstructions}
                      setSpecialInstructions={setServiceSpecialInstructions}
                      setServiceBookingStep={setServiceBookingStep}
                      referenceStyle
                    />
                  )}

                  {serviceBookingStep === 3 && (
                    <ServiceBookingStepFulfillment
                      STYLES={STYLES}
                      BOOKING_FIELD_STYLE={BOOKING_FIELD_STYLE}
                      StorefrontDropdown={StorefrontDropdown}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      primaryButtonProps={servicePrimaryButtonProps}
                      activeBookingService={activeBookingService}
                      bookingCalendarDateOptions={bookingCalendarDateOptions}
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
                      serviceScheduleMode={serviceScheduleMode}
                      serviceFlowMethod={serviceFlowMethod}
                      serviceFlowProfileMethod={serviceFlowProfileMethod}
                      serviceDraftQuantity={serviceDraftQuantity}
                      serviceIntakeResponses={serviceIntakeResponses}
                      serviceUnitType={serviceUnitType}
                      servicesPrimary={servicesPrimary}
                      servicesPrimarySoft={servicesPrimarySoft}
                      servicesPrimaryBorder={servicesPrimaryBorder}
                      servicesDisplayFont={servicesDisplayFont}
                      servicesPrimaryShadow={servicesPrimaryShadow}
                      setServiceAppointmentAt={setServiceAppointmentAt}
                      setServiceScheduleMode={setServiceScheduleMode}
                      setServiceDraftQuantity={setServiceDraftQuantity}
                      setServiceIntakeResponses={setServiceIntakeResponses}
                      setServiceUnitType={setServiceUnitType}
                      shouldBookingFieldSpanFullWidth={shouldBookingFieldSpanFullWidth}
                      onOrderMethodChange={(nextMethod) => {
                        setServiceOrderMethod(nextMethod);
                        if (nextMethod === 'quote') setServiceAppointmentAt('');
                      }}
                      renderLocationSection={({ compactLayout = false } = {}) => (
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
                          serviceFlowMethod={serviceFlowMethod}
                          serviceFlowProfileMethod={serviceFlowProfileMethod}
                          selectedLocationId={selectedLocationId}
                          setSelectedLocationId={setSelectedLocationId}
                          storeLocations={storeLocations}
                          compactLayout={compactLayout}
                         />
                      )}
                      missingScheduleAndServiceInfo={missingScheduleAndServiceInfo}
                      fulfillmentStepComplete={fulfillmentStepComplete}
                      toast={toast}
                      syncServiceBookingDraft={syncServiceBookingDraft}
                      setServiceBookingStep={setServiceBookingStep}
                      referenceStyle
                    />
                  )}

                  {serviceBookingStep === 4 && (
                    <ServiceBookingStepReviewPayment
                      STYLES={STYLES}
                      BOOKING_FIELD_STYLE={BOOKING_FIELD_STYLE}
                      StorefrontDropdown={StorefrontDropdown}
                      GhostButton={GhostButton}
                      PrimaryButton={PrimaryButton}
                      primaryButtonProps={servicePrimaryButtonProps}
                      servicesPrimary={servicesPrimary}
                      servicesPrimarySoft={servicesPrimarySoft}
                      servicesPrimaryBorder={servicesPrimaryBorder}
                      money={money}
                      registerBookingFieldRef={registerBookingFieldRef}
                      isMobileViewport={isMobileViewport}
                      serviceOrderMethod={serviceOrderMethod}
                      serviceFlowMethod={serviceFlowMethod}
                      serviceFlowProfileMethod={serviceFlowProfileMethod}
                      serviceLocationSummaryDraft={serviceLocationSummaryDraft}
                      selectedLocation={selectedLocation}
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
                      referenceStyle
                    />
                  )}
                </section>

                {!isMobileViewport ? (
                  <ServiceBookingSummaryCard
                    isMobileViewport={isMobileViewport}
                    STYLES={STYLES}
                    servicesPrimary={servicesPrimary}
                    servicesPrimarySoft={servicesPrimarySoft}
                    servicesPrimaryBorder={servicesPrimaryBorder}
                    servicesDisplayFont={servicesDisplayFont}
                    money={money}
                    bookingSummaryAmount={bookingSummaryAmount}
                    summaryRows={serviceBookingSummaryRows}
                    serviceLineItems={groupedServiceLineItems}
                  />
                ) : null}
              </div>
              <ServiceBookingMobileSummaryPanel
                accountStepComplete={accountStepComplete}
                bookingSummaryAmount={bookingSummaryAmount}
                bookingSummaryQuantity={bookingSummaryQuantity}
                checkoutLoading={checkoutLoading}
                fulfillmentStepComplete={fulfillmentStepComplete}
                isMobileViewport={isMobileViewport}
                isQuoteFlow={serviceOrderMethod === 'quote'}
                money={money}
                onBack={() => {
                  if (serviceBookingStep <= 1) {
                    goStoreCatalogPage();
                    return;
                  }
                  setServiceBookingStep(serviceBookingStep - 1);
                }}
                onPrimary={() => {
                  if (serviceBookingStep < 4) {
                    setServiceBookingStep(serviceBookingStep + 1);
                    return;
                  }
                  handleCheckout();
                }}
                serviceBookingStep={serviceBookingStep}
                serviceLineItems={groupedServiceLineItems}
                servicePaymentTiming={servicePaymentTiming}
                servicesBodyFont={servicesBodyFont}
                servicesDisplayFont={servicesDisplayFont}
                servicesPrimary={servicesPrimary}
                servicesPrimaryDark={servicesPrimaryDark}
                servicesPrimaryShadow={servicesPrimaryShadow}
                summaryRows={serviceBookingSummaryRows}
              />
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
        <ServicesCatalogToolbar
          catalogSearch={catalogSearch}
          isMobileViewport={isMobileViewport}
          resolvedTab={resolvedTab}
          serviceSortOption={serviceSortOption}
          servicesBodyFont={servicesBodyFont}
          servicesDisplayFont={servicesDisplayFont}
          servicesPrimary={servicesPrimary}
          servicesPrimaryDark={servicesPrimaryDark}
          servicesPrimarySoft={servicesPrimarySoft}
          servicesPrimaryBorder={servicesPrimaryBorder}
          servicesPrimaryShadow={servicesPrimaryShadow}
          servicesViewMode={servicesViewMode}
          catalogPresentation={catalogPresentation}
          servicesViewModel={servicesViewModel}
          setActiveServiceTab={setActiveServiceTab}
          setCatalogSearch={setCatalogSearch}
          setServiceSortOption={setServiceSortOption}
          setServicesViewMode={setServicesViewMode}
          visibleServiceCount={sortedServices.length}
        />
        <div
          style={{
            maxWidth: catalogMaxWidth,
            width: catalogFrameWidth,
            margin: '0 auto',
            paddingLeft: isMobileViewport ? 16 : (catalogUsesOuterGutter ? 0 : catalogHorizontalPadding),
            paddingRight: isMobileViewport ? 16 : (catalogUsesOuterGutter ? 0 : catalogHorizontalPadding),
            boxSizing: 'border-box',
            display: 'grid',
            gap: 18
          }}
        >
          {filteredCatalog.length === 0 && !loadingCatalog && !catalogError && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button
                type="button"
                onClick={refreshStorePageForTenantSetup}
                style={{ borderRadius: 10, border: `1px solid ${servicesPrimary}`, background: '#fff', color: servicesPrimary, padding: '8px 12px', fontWeight: 700 }}
              >
                Check Again
              </button>
            </div>
          )}

          {hasActiveFilters ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setServiceAvailabilityFilter('all');
                  setServiceAreaFilter('all');
                  setServiceDurationFilter('all');
                }}
                style={{ border: 'none', background: 'transparent', color: servicesPrimary, fontSize: 13, fontWeight: 700, padding: 0, cursor: 'pointer' }}
              >
                Clear filters
              </button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: servicesGridColumns, gap: servicesGridGap }}>
            {paginatedServices.map((item) => {
              const imageSources = resolveStorefrontImageSources(item, { preferred: 'medium' });
              const available = isItemAvailable(item);
              return (
                <ServiceCatalogCard
                  key={item.item_id}
                  item={item}
                  imageSources={imageSources}
                  available={available}
                  isMobileViewport={isMobileViewport}
                  money={money}
                  servicesPrimary={servicesPrimary}
                  servicesPrimaryDark={servicesPrimaryDark}
                  servicesPrimarySoft={servicesPrimarySoft}
                  servicesPrimaryBorder={servicesPrimaryBorder}
                  servicesPrimaryShadow={servicesPrimaryShadow}
                  servicesViewMode={servicesViewMode}
                  servicesDisplayFont={servicesDisplayFont}
                  servicesBodyFont={servicesBodyFont}
                  addActionLabel={catalogPresentation.addActionLabel}
                  unavailableLabel={catalogPresentation.unavailableLabel}
                  missingImageLabel={catalogPresentation.missingImageLabel}
                  onAdd={(event, serviceOptions = {}) => addToCart(item, {
                    ...serviceOptions,
                    sourceRect: getCartFlySourceRect(event)
                  })}
                />
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
        palette="services"
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
        writeButtonColor={servicesPrimary}
        titleSize={isMobileViewport ? 28 : 36}
        subtitleSize={isMobileViewport ? 14 : 16}
        starSymbol="*"
        formatReviewCount={formatServiceNumber}
      />

      {isReviewModalOpen && (
        <StorefrontReviewModal
          isMobileViewport={isMobileViewport}
          eyebrowColor={servicesPrimary}
          titleFontFamily={servicesDisplayFont}
          starColor={SERVICES_PALETTE.warning}
          starBg={SERVICES_PALETTE.warningSoft}
          starShadow={`0 10px 20px ${SERVICES_PALETTE.warningShadow}`}
          submitButtonAccentColor={servicesPrimary}
          submitButtonAccentDarkColor={servicesPrimaryDark}
          submitButtonShadowColor={servicesPrimaryShadow}
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
