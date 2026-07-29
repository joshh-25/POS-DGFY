import { OrderSummaryCard } from '../../../../shared/components/checkout/OrderSummaryCard.jsx';
import { SimpleCheckoutCustomerStep } from '../components/SimpleCheckoutCustomerStep.jsx';
import { SimpleCheckoutFulfillmentStep } from '../components/SimpleCheckoutFulfillmentStep.jsx';
import { SimpleCheckoutJourneyHeader } from '../components/SimpleCheckoutJourneyHeader.jsx';
import { SimpleCheckoutPaymentStep } from '../components/SimpleCheckoutPaymentStep.jsx';
import { SimpleCheckoutStoreHeader } from '../components/SimpleCheckoutStoreHeader.jsx';
import { SimpleCheckoutSuccessStep } from '../components/SimpleCheckoutSuccessStep.jsx';
import { SimpleCheckoutSummaryCard } from '../components/SimpleCheckoutSummaryCard.jsx';

export function SimpleCheckoutRoutePage({
  canAddPinnedLocation = false,
  canUseGuestCheckoutFlow = false,
  cart = [],
  cartCount = 0,
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
  renderCheckoutPromoStack,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  renderStorefrontClosedNotice,
  requireQuoteForCheckout = false,
  selectedLocation = null,
  selectedSavedLocationId = '',
  selectedStore = null,
  servicesBodyFont,
  servicesDisplayFont,
  showExpandedDeliveryMap = false,
  simpleCheckoutAllowed = false,
  simpleCustomerStepComplete = false,
  simpleHasCustomerIdentity = false,
  simpleHasPrimaryIdentityContact = false,
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
  onStartMapPin
}) {
  const totals = totalsForDisplay || {};
  const stepGridStyle = {
    display: 'grid',
    gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.45fr) minmax(300px, 380px)' : '1fr',
    gap: 14,
    alignItems: 'start'
  };
  const promoStackOptions = {
    accentColor: '#0f766e',
    bodyFont: servicesBodyFont
  };

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? '8px 16px 18px' : '18px 24px 28px' }}>
      <SimpleCheckoutStoreHeader
        isMobileViewport={isMobileViewport}
        onBackToCatalog={onBackToCatalog}
        selectedStore={selectedStore}
        servicesDisplayFont={servicesDisplayFont}
        withAssetOrigin={withAssetOrigin}
      />

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
          {renderCheckoutPromoStack(
            <OrderSummaryCard
              accentColor="#0f766e"
              totalLabel="Order Summary"
              totalAmount={totals.total_amount}
              money={money}
              sticky={isDesktopCheckout}
              statusRows={[
                { label: 'Customer', value: simpleHasCustomerIdentity ? 'Ready' : 'Needed' },
                { label: 'Contact', value: simpleHasPrimaryIdentityContact ? 'Ready' : 'Needed' },
                { label: 'Status', value: simpleCustomerStepComplete ? 'Ready for fulfillment' : 'Waiting for details' }
              ]}
              bodyFont={servicesBodyFont}
              displayFont={servicesDisplayFont}
            />,
            promoStackOptions
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
            simpleOrderMethodOptions={simpleOrderMethodOptions}
            simpleStepOneReady={simpleStepOneReady}
            specialInstructions={fnbSpecialInstructions}
            onAddPinnedLocation={onAddPinnedLocation}
            onBack={() => onSetSimpleOrderStep(1)}
            onCloseExpandedMap={onCloseExpandedMap}
            onContinue={() => onSetSimpleOrderStep(3)}
            onOpenExpandedMap={onOpenExpandedMap}
            onOrderMethodChange={onOrderMethodChange}
            onPinChange={onPinChange}
            onPinMyLocation={onPinMyLocation}
            onScheduleModeChange={onScheduleModeChange}
            onScheduledForChange={onScheduledForChange}
            onSelectAddress={onSelectAddress}
            onSpecialInstructionsChange={onSpecialInstructionsChange}
            onStartMapPin={onStartMapPin}
          />
          {renderCheckoutPromoStack(
            <SimpleCheckoutSummaryCard
              amount={money(totals.total_amount)}
              isSticky={isDesktopCheckout}
              statusRows={[
                { label: 'Fulfillment', value: isDeliveryOrder ? 'Delivery' : 'Pickup' },
                { label: 'Schedule', value: fnbScheduledFor ? new Date(fnbScheduledFor).toLocaleString() : 'NOW' },
                { label: 'Status', value: 'Ready for review' }
              ]}
            />,
            promoStackOptions
          )}
        </div>
      )}

      {simpleOrderStep === 3 && !checkoutResult && (
        <div style={stepGridStyle}>
          <SimpleCheckoutPaymentStep
            bodyFont={servicesBodyFont}
            cart={cart}
            checkoutError={checkoutError}
            checkoutLoading={checkoutLoading}
            DropdownComponent={DropdownComponent}
            isMobileViewport={isMobileViewport}
            money={money}
            paymentType={fnbPaymentType}
            paymentOptions={[
              { value: 'cash', label: 'Cash on delivery/pickup' },
              { value: 'gcash', label: 'GCash' },
              { value: 'maya', label: 'Maya' },
              { value: 'card', label: 'Card' },
              { value: 'bank_transfer', label: 'Bank transfer' }
            ]}
            quoteError={quoteError}
            quoteResult={quoteResult}
            requireQuoteForCheckout={requireQuoteForCheckout}
            selectedStore={selectedStore}
            simpleCheckoutAllowed={simpleCheckoutAllowed}
            storefrontClosedNotice={storefrontClosedByHours ? renderStorefrontClosedNotice({ accent: '#9a3412', background: '#fff7ed', border: '#fdba74' }) : null}
            onBack={() => onSetSimpleOrderStep(2)}
            onCheckout={onCheckout}
            onPaymentTypeChange={onPaymentTypeChange}
            onQuote={onQuote}
          />
          {renderCheckoutPromoStack(
            <SimpleCheckoutSummaryCard
              amount={money(totals.total_amount)}
              isSticky={isDesktopCheckout}
              statusRows={[
                { label: 'Fulfillment', value: isDeliveryOrder ? 'Delivery' : 'Pickup' },
                { label: 'Schedule', value: fnbScheduledFor ? new Date(fnbScheduledFor).toLocaleString() : 'NOW' },
                { label: 'Payment', value: String(fnbPaymentType || 'cash').replace('_', ' ').toUpperCase() },
                { label: 'Status', value: simpleCheckoutAllowed ? 'Ready to submit' : (requireQuoteForCheckout ? 'Quote required' : 'Complete required fields') }
              ]}
              totalRows={[
                { label: 'Subtotal', value: money(totals.subtotal_amount) },
                ...(promoDiscountSummaryRow ? [promoDiscountSummaryRow] : []),
                { label: totals.service_fee_label, value: money(totals.service_fee_amount) },
                { label: 'Delivery Fee', value: money(totals.delivery_fee) }
              ]}
            />,
            promoStackOptions
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
    </div>
  );
}
