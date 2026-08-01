import { SimpleCheckoutCustomerStep } from '../components/SimpleCheckoutCustomerStep.jsx';
import { SimpleCheckoutFulfillmentStep } from '../components/SimpleCheckoutFulfillmentStep.jsx';
import { SimpleCheckoutJourneyHeader } from '../components/SimpleCheckoutJourneyHeader.jsx';
import { SimpleCheckoutMobileSummaryPanel } from '../components/SimpleCheckoutMobileSummaryPanel.jsx';
import { SimpleCheckoutPaymentStep } from '../components/SimpleCheckoutPaymentStep.jsx';
import { SimpleCheckoutStoreHeader } from '../components/SimpleCheckoutStoreHeader.jsx';
import { SimpleCheckoutSuccessStep } from '../components/SimpleCheckoutSuccessStep.jsx';
import { SimpleCheckoutSummaryContent } from '../components/SimpleCheckoutSummaryContent.jsx';

export function SimpleCheckoutRoutePage({
  canAddPinnedLocation = false,
  canUseGuestCheckoutFlow = false,
  cart = [],
  cartCount = 0,
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  checkoutResult = null,
  customerPin = null,
  deliveryLocationAction = 'saved',
  deliveryLocationDisplayAddress = '',
  deliverySavedLocations = [],
  DropdownComponent,
  fnbPaymentType = 'cash',
  fnbScheduleMode = 'asap',
  fnbScheduledFor = '',
  fnbSpecialInstructions = '',
  isDeliveryOrder = false,
  isDesktopCheckout = false,
  isDgfyCustomerSignedIn = false,
  isMobileViewport = false,
  money,
  orderMethod = 'delivery',
  pinLocationError = '',
  pinLocationLoading = false,
  promoDiscountSummaryRow = null,
  quoteError = '',
  quoteResult = null,
  renderAccountOwnedIdentitySummary,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  renderPromoCodePanel,
  renderStorefrontClosedNotice,
  requireQuoteForCheckout = false,
  selectedLocation = null,
  selectedSavedLocationId = '',
  selectedStore = null,
  servicesBodyFont,
  servicesDisplayFont,
  showExpandedDeliveryMap = false,
  showSimpleMobileAddressModal = false,
  showSimpleMobileOrderSummary = false,
  simpleCheckoutAllowed = false,
  simpleCustomerStepComplete = false,
  simpleOrderMethodOptions = [],
  simpleOrderStep = 1,
  simpleStepOneReady = false,
  storefrontClosedByHours = false,
  totalsForDisplay,
  withAssetOrigin,
  onAddPinnedLocation,
  onBackToCatalog,
  onCheckout,
  onCloseExpandedMap,
  onDownloadCheckoutImage,
  onImageError,
  onOpenExpandedMap,
  onOrderMethodChange,
  onPaymentTypeChange,
  onPinChange,
  onPinMyLocation,
  onQuote,
  onScheduleModeChange,
  onScheduledForChange,
  onSelectAddress,
  onSetCheckoutResult,
  onSetSimpleOrderStep,
  onSpecialInstructionsChange,
  onStartMapPin,
  setShowSimpleMobileAddressModal,
  setShowSimpleMobileOrderSummary
}) {
  const totals = totalsForDisplay || {};
  const stepGridStyle = {
    display: 'grid',
    gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.45fr) minmax(300px, 380px)' : '1fr',
    gap: 14,
    alignItems: 'start'
  };
  const scheduleLabel = fnbScheduleMode === 'schedule' && fnbScheduledFor
    ? new Date(fnbScheduledFor).toLocaleString()
    : 'NOW';

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: '100%', width: '100%', padding: isMobileViewport ? '0px 0px 18px' : '0px 0px 28px' }}>
      <SimpleCheckoutStoreHeader
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        onBackToCatalog={onBackToCatalog}
        selectedStore={selectedStore}
        servicesBodyFont={servicesBodyFont}
        servicesDisplayFont={servicesDisplayFont}
        withAssetOrigin={withAssetOrigin}
      />

      <div style={{ display: 'grid', gap: 18, maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? (checkoutResult ? '0 16px' : '0 16px calc(env(safe-area-inset-bottom, 0px) + 196px)') : '0 40px', boxSizing: 'border-box' }}>
      <SimpleCheckoutJourneyHeader
        activeStep={simpleOrderStep}
        cartCount={cartCount}
        cartHasItems={cart.length > 0}
        isCustomerStepComplete={simpleCustomerStepComplete}
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        displayFont={servicesDisplayFont}
        onStepChange={onSetSimpleOrderStep}
        signedIn={isDgfyCustomerSignedIn}
      />

      {simpleOrderStep === 1 && (
        <div style={stepGridStyle}>
          <SimpleCheckoutCustomerStep
            canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
            isDeliveryOrder={isDeliveryOrder}
            isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
            isMobileViewport={isMobileViewport}
            renderAccountOwnedIdentitySummary={renderAccountOwnedIdentitySummary}
            renderGuestCheckoutEntry={renderGuestCheckoutEntry}
            renderGuestIdentityFields={renderGuestIdentityFields}
            simpleCustomerStepComplete={simpleCustomerStepComplete}
            onBackToCatalog={onBackToCatalog}
            onContinue={() => onSetSimpleOrderStep(2)}
          />
          {!isMobileViewport && (
            <SimpleCheckoutSummaryContent
              bodyFont={servicesBodyFont}
              cart={cart}
              cartCount={cartCount}
              cartImageErrors={cartImageErrors}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              isSticky={isDesktopCheckout}
              money={money}
              onImageError={onImageError}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              promoPanel={renderPromoCodePanel({ compact: true, accentColor: '#0f766e', bodyFont: servicesBodyFont })}
              scheduleLabel={scheduleLabel}
              totals={totals}
              withAssetOrigin={withAssetOrigin}
            />
          )}
        </div>
      )}

      {simpleOrderStep === 2 && (
        <div style={stepGridStyle}>
          <SimpleCheckoutFulfillmentStep
            canAddPinnedLocation={canAddPinnedLocation}
            canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
            customerPin={customerPin}
            deliveryLocationAction={deliveryLocationAction}
            deliveryLocationDisplayAddress={deliveryLocationDisplayAddress}
            deliverySavedLocations={deliverySavedLocations}
            fnbScheduleMode={fnbScheduleMode}
            isDeliveryOrder={isDeliveryOrder}
            isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
            isMobileViewport={isMobileViewport}
            orderMethod={orderMethod}
            pinLocationError={pinLocationError}
            pinLocationLoading={pinLocationLoading}
            renderGuestCheckoutEntry={renderGuestCheckoutEntry}
            scheduledFor={fnbScheduledFor}
            selectedLocation={selectedLocation}
            selectedSavedLocationId={selectedSavedLocationId}
            servicesBodyFont={servicesBodyFont}
            servicesDisplayFont={servicesDisplayFont}
            showExpandedDeliveryMap={showExpandedDeliveryMap}
            showSimpleMobileAddressModal={showSimpleMobileAddressModal}
            simpleOrderMethodOptions={simpleOrderMethodOptions}
            simpleStepOneReady={simpleStepOneReady}
            specialInstructions={fnbSpecialInstructions}
            onAddPinnedLocation={onAddPinnedLocation}
            onBack={() => onSetSimpleOrderStep(1)}
            onCloseExpandedMap={onCloseExpandedMap}
            onCloseMobileAddressModal={() => setShowSimpleMobileAddressModal(false)}
            onContinue={() => onSetSimpleOrderStep(3)}
            onOpenExpandedMap={onOpenExpandedMap}
            onOpenMobileAddressList={() => setShowSimpleMobileAddressModal(true)}
            onOrderMethodChange={onOrderMethodChange}
            onPinChange={onPinChange}
            onPinMyLocation={onPinMyLocation}
            onScheduleModeChange={onScheduleModeChange}
            onScheduledForChange={onScheduledForChange}
            onSelectAddress={onSelectAddress}
            onSpecialInstructionsChange={onSpecialInstructionsChange}
            onStartMapPin={onStartMapPin}
          />
          {!isMobileViewport && (
            <SimpleCheckoutSummaryContent
              bodyFont={servicesBodyFont}
              cart={cart}
              cartCount={cartCount}
              cartImageErrors={cartImageErrors}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              isSticky={isDesktopCheckout}
              money={money}
              onImageError={onImageError}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              promoPanel={renderPromoCodePanel({ compact: true, accentColor: '#0f766e', bodyFont: servicesBodyFont })}
              scheduleLabel={scheduleLabel}
              totals={totals}
              withAssetOrigin={withAssetOrigin}
            />
          )}
        </div>
      )}

      {simpleOrderStep === 3 && !checkoutResult && (
        <div style={stepGridStyle}>
          <SimpleCheckoutPaymentStep
            bodyFont={servicesBodyFont}
            cart={cart}
            cartImageErrors={cartImageErrors}
            checkoutError={checkoutError}
            checkoutLoading={checkoutLoading}
            DropdownComponent={DropdownComponent}
            isMobileViewport={isMobileViewport}
            money={money}
            onImageError={onImageError}
            paymentType={fnbPaymentType}
            paymentOptions={[
              { value: 'cash', label: 'Cash on delivery/pickup' }
            ]}
            quoteError={quoteError}
            quoteResult={quoteResult}
            requireQuoteForCheckout={requireQuoteForCheckout}
            selectedStore={selectedStore}
            simpleCheckoutAllowed={simpleCheckoutAllowed}
            storefrontClosedNotice={storefrontClosedByHours ? renderStorefrontClosedNotice({ accent: '#9a3412', background: '#fff7ed', border: '#fdba74' }) : null}
            withAssetOrigin={withAssetOrigin}
            onBack={() => onSetSimpleOrderStep(2)}
            onCheckout={onCheckout}
            onPaymentTypeChange={onPaymentTypeChange}
            onQuote={onQuote}
          />
          {!isMobileViewport && (
            <SimpleCheckoutSummaryContent
              bodyFont={servicesBodyFont}
              cart={cart}
              cartCount={cartCount}
              cartImageErrors={cartImageErrors}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              isSticky={isDesktopCheckout}
              money={money}
              onImageError={onImageError}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              promoPanel={null}
              scheduleLabel={scheduleLabel}
              totals={totals}
              withAssetOrigin={withAssetOrigin}
            />
          )}
        </div>
      )}

      {simpleOrderStep === 4 && checkoutResult && (
        <SimpleCheckoutSuccessStep
          checkoutResult={checkoutResult}
          displayFont={servicesDisplayFont}
          fulfillmentLabel={isDeliveryOrder ? 'Delivery' : 'Pickup'}
          isDesktopCheckout={isDesktopCheckout}
          isMobileViewport={isMobileViewport}
          money={money}
          paymentType={fnbPaymentType}
          totalAmount={totals.total_amount}
          onBackToCatalog={() => {
            onSetCheckoutResult(null);
            onSetSimpleOrderStep(1);
            onBackToCatalog();
          }}
          onDownload={onDownloadCheckoutImage}
        />
      )}

      {isMobileViewport && !checkoutResult && (
        <SimpleCheckoutMobileSummaryPanel
          cart={cart}
          cartCount={cartCount}
          cartImageErrors={cartImageErrors}
          checkoutAllowed={simpleCheckoutAllowed}
          checkoutLoading={checkoutLoading}
          customerStepComplete={simpleCustomerStepComplete}
          fulfillmentStepComplete={simpleStepOneReady}
          isDeliveryOrder={isDeliveryOrder}
          money={money}
          onBackToCatalog={onBackToCatalog}
          onCheckout={onCheckout}
          onImageError={onImageError}
          onStepChange={onSetSimpleOrderStep}
          orderStep={simpleOrderStep}
          promoDiscountSummaryRow={promoDiscountSummaryRow}
          promoPanel={simpleOrderStep === 3 ? null : renderPromoCodePanel({ compact: true, accentColor: '#0f766e', bodyFont: servicesBodyFont, isMobile: true })}
          scheduleLabel={scheduleLabel}
          setSummaryOpen={setShowSimpleMobileOrderSummary}
          showSummary={showSimpleMobileOrderSummary}
          totals={totals}
          withAssetOrigin={withAssetOrigin}
        />
      )}
      </div>
    </div>
  );
}
