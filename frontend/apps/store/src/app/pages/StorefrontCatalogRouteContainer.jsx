import React from 'react';
import { Sparkles } from 'lucide-react';
import { FnbProductDetailsRoute } from '../../modes/fnb/storefront/pages/FnbProductDetailsRoute.jsx';
import { StorefrontServicesCatalog } from '../../modes/services/storefront/components/StorefrontServicesCatalog.jsx';
import { StorefrontClassicCatalog } from '../../shared/components/storefront/StorefrontClassicCatalog.jsx';
import { SERVICE_CATEGORY_ICON_MAP } from '../../modes/services/storefront/model/serviceCategoryIconMap.jsx';
import { DeliveryPinMap } from '../../features/locations/components/DeliveryPinMap.jsx';

// ZONE 4: Catalog Grid with Sidebar — cross-mode dispatcher (fnb product-details route,
// services catalog, classic catalog). Moved verbatim out of StorefrontApp.jsx's ZONE 4 IIFE;
// the shell keeps the `catalogPermitted && selectedStore` guard and renders this container for
// the body only. See app/hooks/useStorefrontCatalogRouteProps.js for the props bundle.
export function StorefrontCatalogRouteContainer(props) {
  const {
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
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryLocationAction,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
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
    serviceBookingSummaryTitle,
    serviceCartLines,
    serviceDraftQuantity,
    serviceDurationFilter,
    serviceHeroModel,
    serviceIntakeResponses,
    serviceLocationLandmarkNote,
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
    simpleStorefrontModel
  } = props;

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

  if (isFnbDetailsSubpage) {
    return (
      <FnbProductDetailsRoute
        isActive
        {...fnbProductDetailsRouteProps}
        loadError={catalogError}
        loading={loadingCatalog || (!selectedStore && !catalogError)}
        onRetry={refreshStorePageForTenantSetup}
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
    <StorefrontClassicCatalog
      ActiveServiceGroupIcon={ActiveServiceGroupIcon}
      activeGroupMeta={activeGroupMeta}
      addToCart={addToCart}
      catalogError={catalogError}
      catalogItemsToRender={catalogItemsToRender}
      catalogSearch={catalogSearch}
      catalogState={catalogState}
      checkoutPromoCode={checkoutPromoCode}
      filteredCatalog={filteredCatalog}
      filteredFnbViewModel={filteredFnbViewModel}
      fnbCategoryDropdownRef={fnbCategoryDropdownRef}
      fnbCommunityModel={fnbCommunityModel}
      fnbMobileCatalogInlinePadding={fnbMobileCatalogInlinePadding}
      fnbMobileMenuInnerWidth={fnbMobileMenuInnerWidth}
      fnbPageEnd={fnbPageEnd}
      fnbPageSize={fnbPageSize}
      fnbPageStart={fnbPageStart}
      fnbSortOption={fnbSortOption}
      fnbViewMode={fnbViewMode}
      getCartFlySourceRect={getCartFlySourceRect}
      handlePromoCardApply={handlePromoCardApply}
      hasCatalogSearchQuery={hasCatalogSearchQuery}
      isCompactPaginationViewport={isCompactPaginationViewport}
      isDesktopViewport={isDesktopViewport}
      isFnbCategoryDropdownOpen={isFnbCategoryDropdownOpen}
      isFnbDetailsSubpage={isFnbDetailsSubpage}
      isFnbMode={isFnbMode}
      isMobileViewport={isMobileViewport}
      isMultiGroup={isMultiGroup}
      isOrderSubpage={isOrderSubpage}
      isResolvedOrderSubpage={isResolvedOrderSubpage}
      isReviewModalOpen={isReviewModalOpen}
      isServicesMode={isServicesMode}
      isSimpleMode={isSimpleMode}
      isTabletPaginationViewport={isTabletPaginationViewport}
      itemsToRender={itemsToRender}
      modeAdapter={modeAdapter}
      openFnbDetail={openFnbDetail}
      openServiceDetail={openServiceDetail}
      promoSectionModel={promoSectionModel}
      refreshStorePageForTenantSetup={refreshStorePageForTenantSetup}
      resolvedFnbPage={resolvedFnbPage}
      resolvedFnbSection={resolvedFnbSection}
      resolvedTab={resolvedTab}
      reviewDraft={reviewDraft}
      reviewSubmitLoading={reviewSubmitLoading}
      selectedStore={selectedStore}
      servicesPrimary={servicesPrimary}
      servicesPrimaryDark={servicesPrimaryDark}
      servicesViewModel={servicesViewModel}
      setActiveServiceTab={setActiveServiceTab}
      setCatalogSearch={setCatalogSearch}
      setFnbPage={setFnbPage}
      setFnbPageSize={setFnbPageSize}
      setFnbSortOption={setFnbSortOption}
      setFnbViewMode={setFnbViewMode}
      setIsFnbCategoryDropdownOpen={setIsFnbCategoryDropdownOpen}
      setIsReviewModalOpen={setIsReviewModalOpen}
      setReviewDraft={setReviewDraft}
      simpleCheckoutRouteProps={simpleCheckoutRouteProps}
      simpleStorefrontModel={simpleStorefrontModel}
      submitFnbItemReview={submitFnbItemReview}
      totalFnbPages={totalFnbPages}
      viewportWidth={viewportWidth}
    />
  );
}
