import React from 'react';
import { Sparkles } from 'lucide-react';
import { FnbProductDetailsRoute } from '../../modes/fnb/storefront/pages/FnbProductDetailsRoute.jsx';
import { FnbCatalogRoutePage } from '../../modes/fnb/storefront/pages/FnbCatalogRoutePage.jsx';
import { FnbStorefrontRoutePage } from '../../modes/fnb/storefront/pages/FnbStorefrontRoutePage.jsx';
import { RetailStorefrontRouteContainer } from '../../modes/retail/storefront/pages/RetailStorefrontRouteContainer.jsx';
import { SimpleStorefrontRoutePage } from '../../modes/simple/storefront/pages/SimpleStorefrontRoutePage.jsx';
import { SimpleCatalogRoutePage } from '../../modes/simple/storefront/pages/SimpleCatalogRoutePage.jsx';
import { SimpleCheckoutRoutePage } from '../../modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx';
import { SimpleTrackingRouteContainer } from '../../modes/simple/tracking/pages/SimpleTrackingRouteContainer.jsx';
import { StorefrontServicesCatalog } from '../../modes/services/storefront/components/StorefrontServicesCatalog.jsx';
import { StorefrontClassicCatalog } from '../../shared/components/storefront/StorefrontClassicCatalog.jsx';
import { SERVICE_CATEGORY_ICON_MAP } from '../../modes/services/storefront/model/serviceCategoryIconMap.jsx';
import { DeliveryPinMap } from '../../features/locations/components/DeliveryPinMapLazy.jsx';

// ZONE 4: Catalog Grid with Sidebar — cross-mode dispatcher (fnb product-details route,
// services catalog, classic catalog). Moved verbatim out of StorefrontApp.jsx's ZONE 4 IIFE;
// the shell keeps the `catalogPermitted && selectedStore` guard and renders this container for
// the body only. See app/hooks/useStorefrontCatalogRouteProps.js for the props bundle.
export function StorefrontCatalogRouteContainer(props) {
  const {
    accountStepComplete,
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
    applySavedDeliveryLocation,
    getCartFlySourceRect,
    goStoreCatalogPage,
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
    serviceLineAddOns,
    setServiceLineAddOns,
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
  // F&B, Retail, and Simple/MSME consume the shared, mode-agnostic sectioned/sorted/
  // paginated view model (useFnbCatalogRuntime.js runs for every mode; the
  // "Fnb" naming predates it being reused outside F&B). Other modes still
  // render the raw filtered catalog with no sort/section/pagination applied.
  const usesSectionedCatalogPresentation = isFnbMode || isRetailMode || isSimpleMode;
  const resolvedFnbSection = fnbCatalogPresentation.resolvedSection;
  const activeFnbSection = fnbCatalogPresentation.activeSectionModel;
  const rawItemsToRender = isServicesMode
    ? (resolvedTab ? (activeGroup?.items || []) : servicesViewModel.allServices)
    : usesSectionedCatalogPresentation
      ? (resolvedFnbSection ? (activeFnbSection?.items || []) : filteredFnbViewModel.menuItems)
      // MSME's product card reads item.descriptionPreview (falls back to a generic
      // "Item available in this storefront." string when absent) — that field is only
      // populated by getFoodBeverageStorefrontViewModel's per-item enrichment, so MSME
      // must consume the same enriched list F&B/Retail use, not the raw filteredCatalog.
      : isSimpleMode
        ? filteredFnbViewModel.menuItems
        : filteredCatalog;
  const itemsToRender = usesSectionedCatalogPresentation ? fnbCatalogPresentation.sortedItems : rawItemsToRender;
  const totalFnbPages = usesSectionedCatalogPresentation ? fnbCatalogPresentation.totalPages : 1;
  const resolvedFnbPage = usesSectionedCatalogPresentation ? fnbCatalogPresentation.resolvedPage : 1;
  const catalogItemsToRender = usesSectionedCatalogPresentation ? fnbCatalogPresentation.visibleItems : itemsToRender;
  const fnbPageStart = !usesSectionedCatalogPresentation || itemsToRender.length === 0 ? 0 : ((resolvedFnbPage - 1) * fnbPageSize) + 1;
  const fnbPageEnd = !usesSectionedCatalogPresentation ? itemsToRender.length : Math.min(itemsToRender.length, resolvedFnbPage * fnbPageSize);
  const activeGroupMeta = activeGroup?.categoryMeta;
  const ActiveServiceGroupIcon = activeGroupMeta?.iconToken ? (SERVICE_CATEGORY_ICON_MAP[activeGroupMeta.iconToken] || Sparkles) : Sparkles;

  if (isRetailMode && isFnbDetailsSubpage) {
    return (
      <RetailStorefrontRouteContainer
        detailsProps={{
          ...fnbProductDetailsRouteProps,
          loadError: catalogError,
          loading: loadingCatalog || (!selectedStore && !catalogError),
          onRetry: refreshStorePageForTenantSetup
        }}
        isDetailsSubpage
      />
    );
  }

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
        accountStepComplete={accountStepComplete}
        fulfillmentStepComplete={fulfillmentStepComplete}
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
        applySavedDeliveryLocation={applySavedDeliveryLocation}
        filteredCatalog={filteredCatalog}
        getCartFlySourceRect={getCartFlySourceRect}
        goStoreCatalogPage={goStoreCatalogPage}
        handleAddPinnedLocation={handleAddPinnedLocation}
        handleCheckout={handleCheckout}
        handlePinMyLocation={handlePinMyLocation}
        handlePromoCardApply={handlePromoCardApply}
        guestCheckoutOtpCode={guestCheckoutOtpCode}
        guestCheckoutOtpCooldownLabel={guestCheckoutOtpCooldownLabel}
        guestCheckoutOtpError={guestCheckoutOtpError}
        guestCheckoutOtpLoading={guestCheckoutOtpLoading}
        guestCheckoutOtpVerified={guestCheckoutOtpVerified}
        onApplyGuestDetailsAndRequestOtp={handleApplyGuestDetailsAndRequestOtp}
        onGuestCheckoutOtpCodeChange={handleGuestCheckoutOtpCodeChange}
        onRequestGuestCheckoutOtp={handleRequestGuestCheckoutOtp}
        onVerifyGuestCheckoutOtp={handleVerifyGuestCheckoutOtp}
        hasServiceCart={hasServiceCart}
        isBookingSubpage={isBookingSubpage}
        isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
        isGuestCheckoutOtpCooldownActive={isGuestCheckoutOtpCooldownActive}
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
        serviceBookingSummarySchedule={serviceBookingSummarySchedule}
        serviceBookingSummaryTitle={serviceBookingSummaryTitle}
        serviceCartLines={serviceCartLines}
        serviceDraftQuantity={serviceDraftQuantity}
        serviceDurationFilter={serviceDurationFilter}
        serviceHeroModel={serviceHeroModel}
        serviceIntakeResponses={serviceIntakeResponses}
        serviceLineAddOns={serviceLineAddOns}
        setServiceLineAddOns={setServiceLineAddOns}
        groupedServiceLineItems={groupedServiceLineItems}
        serviceSpecialInstructions={serviceSpecialInstructions}
        setServiceSpecialInstructions={setServiceSpecialInstructions}
        serviceLocationLandmarkNote={serviceLocationLandmarkNote}
        serviceLocationSummaryDraft={serviceLocationSummaryDraft}
        serviceOrderMethod={serviceOrderMethod}
        setServiceOrderMethod={setServiceOrderMethod}
        serviceScheduleMode={serviceScheduleMode}
        setServiceScheduleMode={setServiceScheduleMode}
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
        syncServiceBookingDraft={syncServiceBookingDraft}
        submitFnbItemReview={submitFnbItemReview}
        viewportWidth={viewportWidth}
      />
    );
  }

  if (isSimpleMode && isTrackSubpage && simpleTrackingRouteProps) {
    return <SimpleTrackingRouteContainer {...simpleTrackingRouteProps} visible />;
  }

  if (isRetailMode) {
    return (
      <RetailStorefrontRouteContainer
        catalogProps={{
          addToCart,
          catalogError,
          catalogItems: catalogItemsToRender,
          catalogSearch,
          catalogState,
          categoryDropdownRef: fnbCategoryDropdownRef,
          filteredCatalog,
          filteredCatalogViewModel: filteredFnbViewModel,
          getCartFlySourceRect,
          hasCatalogSearchQuery,
          isCategoryDropdownOpen: isFnbCategoryDropdownOpen,
          isMobileViewport,
          mobileCatalogPadding: fnbMobileCatalogInlinePadding,
          mobileContentWidth: fnbMobileMenuInnerWidth,
          modeAdapter,
          onCategoryChange: setActiveServiceTab,
          onCategoryDropdownOpenChange: setIsFnbCategoryDropdownOpen,
          onPageChange: setFnbPage,
          onPageSizeChange: setFnbPageSize,
          onSearchChange: setCatalogSearch,
          onSortChange: setFnbSortOption,
          onViewDetails: openFnbDetail,
          onViewModeChange: setFnbViewMode,
          page: resolvedFnbPage,
          pageEnd: fnbPageEnd,
          pageSize: fnbPageSize,
          pageStart: fnbPageStart,
          refreshStorePageForTenantSetup,
          resolvedSection: resolvedFnbSection,
          sortOption: fnbSortOption,
          totalItems: itemsToRender.length,
          totalPages: totalFnbPages,
          viewMode: fnbViewMode,
          viewportWidth
        }}
        hasStorefrontModel={Boolean(defaultStorefrontModel)}
        isOrderSubpage={isResolvedOrderSubpage}
        isTrackSubpage={isTrackSubpage}
        orderProps={retailOrderRouteProps}
        sectionsProps={{
          checkoutPromoCode,
          handlePromoCardApply,
          isMobileViewport,
          isReviewModalOpen,
          modeAdapter,
          promoSectionModel,
          retailStorefrontModel: defaultStorefrontModel,
          reviewDraft,
          setIsReviewModalOpen,
          setReviewDraft,
          submitReview: submitFnbItemReview,
          viewportWidth
        }}
        trackingProps={retailTrackingRouteProps}
      />
    );
  }

  if (isFnbMode) {
    return (
      <>
        <FnbCatalogRoutePage
          addToCart={addToCart}
          catalogError={catalogError}
          catalogItems={catalogItemsToRender}
          catalogSearch={catalogSearch}
          catalogState={catalogState}
          categoryDropdownRef={fnbCategoryDropdownRef}
          filteredCatalog={filteredCatalog}
          filteredCatalogViewModel={filteredFnbViewModel}
          getCartFlySourceRect={getCartFlySourceRect}
          hasCatalogSearchQuery={hasCatalogSearchQuery}
          isCategoryDropdownOpen={isFnbCategoryDropdownOpen}
          isCompactPaginationViewport={isCompactPaginationViewport}
          isDesktopViewport={isDesktopViewport}
          isMobileViewport={isMobileViewport}
          isTabletPaginationViewport={isTabletPaginationViewport}
          modeAdapter={modeAdapter}
          mobileCatalogPadding={fnbMobileCatalogInlinePadding}
          mobileContentWidth={fnbMobileMenuInnerWidth}
          onCategoryChange={setActiveServiceTab}
          onCategoryDropdownOpenChange={setIsFnbCategoryDropdownOpen}
          onPageChange={setFnbPage}
          onPageSizeChange={setFnbPageSize}
          onSearchChange={setCatalogSearch}
          onSortChange={setFnbSortOption}
          onViewDetails={openFnbDetail}
          onViewModeChange={setFnbViewMode}
          page={resolvedFnbPage}
          pageEnd={fnbPageEnd}
          pageSize={fnbPageSize}
          pageStart={fnbPageStart}
          refreshStorePageForTenantSetup={refreshStorePageForTenantSetup}
          resolvedSection={resolvedFnbSection}
          sortOption={fnbSortOption}
          totalItems={itemsToRender.length}
          totalPages={totalFnbPages}
          viewMode={fnbViewMode}
        />
        <FnbStorefrontRoutePage
          checkoutPromoCode={checkoutPromoCode}
          fnbCommunityModel={fnbCommunityModel}
          handlePromoCardApply={handlePromoCardApply}
          isMobileViewport={isMobileViewport}
          isReviewModalOpen={isReviewModalOpen}
          modeAdapter={modeAdapter}
          onReviewDraftChange={(changes) => setReviewDraft((previous) => ({ ...previous, ...changes }))}
          onReviewModalClose={() => setIsReviewModalOpen(false)}
          onReviewSubmit={submitFnbItemReview}
          promoSectionModel={promoSectionModel}
          renderCommunity={Boolean(fnbCommunityModel) && !isOrderSubpage && !isFnbDetailsSubpage}
          reviewDraft={reviewDraft}
          reviewSubmitLoading={reviewSubmitLoading}
          setIsReviewModalOpen={setIsReviewModalOpen}
          viewportWidth={viewportWidth}
        />
      </>
    );
  }

  if (isSimpleMode && isResolvedOrderSubpage && simpleStorefrontModel) {
    return <SimpleCheckoutRoutePage {...simpleCheckoutRouteProps} />;
  }

  if (isSimpleMode && simpleStorefrontModel) {
    return (
      <>
        <SimpleCatalogRoutePage
          addToCart={addToCart}
          catalogError={catalogError}
          catalogItems={catalogItemsToRender}
          catalogSearch={catalogSearch}
          catalogState={catalogState}
          categoryDropdownRef={fnbCategoryDropdownRef}
          filteredCatalog={filteredCatalog}
          filteredCatalogViewModel={filteredFnbViewModel}
          getCartFlySourceRect={getCartFlySourceRect}
          hasCatalogSearchQuery={hasCatalogSearchQuery}
          isCategoryDropdownOpen={isFnbCategoryDropdownOpen}
          isMobileViewport={isMobileViewport}
          mobileContentWidth={fnbMobileMenuInnerWidth}
          modeAdapter={modeAdapter}
          onCategoryChange={setActiveServiceTab}
          onCategoryDropdownOpenChange={setIsFnbCategoryDropdownOpen}
          onPageChange={setFnbPage}
          onPageSizeChange={setFnbPageSize}
          onSearchChange={setCatalogSearch}
          onSortChange={setFnbSortOption}
          onViewDetails={openFnbDetail}
          onViewModeChange={setFnbViewMode}
          page={resolvedFnbPage}
          pageEnd={fnbPageEnd}
          pageSize={fnbPageSize}
          pageStart={fnbPageStart}
          refreshStorePageForTenantSetup={refreshStorePageForTenantSetup}
          resolvedSection={resolvedFnbSection}
          sortOption={fnbSortOption}
          totalItems={itemsToRender.length}
          totalPages={totalFnbPages}
          viewMode={fnbViewMode}
        />
        <SimpleStorefrontRoutePage
          checkoutPromoCode={checkoutPromoCode}
          handlePromoCardApply={handlePromoCardApply}
          isMobileViewport={isMobileViewport}
          isReviewModalOpen={isReviewModalOpen}
          modeAdapter={modeAdapter}
          promoSectionModel={promoSectionModel}
          reviewDraft={reviewDraft}
          setIsReviewModalOpen={setIsReviewModalOpen}
          setReviewDraft={setReviewDraft}
          simpleStorefrontModel={simpleStorefrontModel}
          submitReview={submitFnbItemReview}
          viewportWidth={viewportWidth}
        />
      </>
    );
  }

  const classicCatalog = (
    <StorefrontClassicCatalog
      activeGroupMeta={activeGroupMeta}
      addToCart={addToCart}
      catalogError={catalogError}
      catalogItemsToRender={catalogItemsToRender}
      catalogSearch={catalogSearch}
      catalogState={catalogState}
      checkoutPromoCode={checkoutPromoCode}
      filteredCatalog={filteredCatalog}
      getCartFlySourceRect={getCartFlySourceRect}
      handlePromoCardApply={handlePromoCardApply}
      hasCatalogSearchQuery={hasCatalogSearchQuery}
      isDesktopViewport={isDesktopViewport}
      isMobileViewport={isMobileViewport}
      isMultiGroup={isMultiGroup}
      isReviewModalOpen={isReviewModalOpen}
      isServicesMode={isServicesMode}
      itemsToRender={itemsToRender}
      modeAdapter={modeAdapter}
      openServiceDetail={openServiceDetail}
      promoSectionModel={promoSectionModel}
      refreshStorePageForTenantSetup={refreshStorePageForTenantSetup}
      resolvedTab={resolvedTab}
      reviewDraft={reviewDraft}
      selectedStore={selectedStore}
      servicesPrimary={servicesPrimary}
      servicesPrimaryDark={servicesPrimaryDark}
      servicesViewModel={servicesViewModel}
      setActiveServiceTab={setActiveServiceTab}
      setCatalogSearch={setCatalogSearch}
      setIsReviewModalOpen={setIsReviewModalOpen}
      setReviewDraft={setReviewDraft}
      defaultStorefrontModel={defaultStorefrontModel}
      defaultOrderRouteProps={defaultOrderRouteProps}
      submitReview={submitFnbItemReview}
      viewportWidth={viewportWidth}
    />
  );

  return classicCatalog;
}
