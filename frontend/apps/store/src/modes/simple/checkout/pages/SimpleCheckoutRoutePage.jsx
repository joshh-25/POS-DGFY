import { CheckoutHeroHeader } from '../../../../shared/components/checkout/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../../../../shared/components/checkout/CheckoutStepProgressHeader.jsx';
import { OrderSummaryCard } from '../../../../shared/components/checkout/OrderSummaryCard.jsx';
import { SimpleCheckoutCustomerStep } from '../components/SimpleCheckoutCustomerStep.jsx';
import { SimpleCheckoutFulfillmentStep } from '../components/SimpleCheckoutFulfillmentStep.jsx';
import { SimpleCheckoutPaymentStep } from '../components/SimpleCheckoutPaymentStep.jsx';
import { SimpleCheckoutStoreHeader } from '../components/SimpleCheckoutStoreHeader.jsx';
import { SimpleCheckoutSuccessStep } from '../components/SimpleCheckoutSuccessStep.jsx';
import { SimpleCheckoutSummaryCard } from '../components/SimpleCheckoutSummaryCard.jsx';

export function SimpleCheckoutRoutePage({
  canUseGuestCheckoutFlow = false,
  cart = [],
  cartCount = 0,
  checkoutError = '',
  checkoutLoading = false,
  checkoutResult = null,
  customerAddress = '',
  customerPin = null,
  DropdownComponent,
  fnbPaymentType = 'cash',
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
  selectedLocationId = null,
  selectedStore = null,
  servicesBodyFont,
  servicesDisplayFont,
  simpleCheckoutAllowed = false,
  simpleCustomerStepComplete = false,
  simpleHasCustomerIdentity = false,
  simpleHasPrimaryIdentityContact = false,
  simpleOrderMethodOptions = [],
  simpleOrderStep = 1,
  simpleStepOneReady = false,
  storefrontClosedByHours = false,
  storeLocations = [],
  totalsForDisplay,
  withAssetOrigin,
  onBackToCatalog,
  onCheckout,
  onCustomerAddressChange,
  onDownloadCheckoutImage,
  onOrderMethodChange,
  onPaymentTypeChange,
  onPinChange,
  onPinClear,
  onPinMyLocation,
  onQuote,
  onScheduledForChange,
  onSelectedLocationChange,
  onSetCheckoutResult,
  onSetSimpleOrderStep,
  onSpecialInstructionsChange
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

      <CheckoutHeroHeader
        eyebrow="Order Journey"
        title="Complete Your Product Order"
        description="Set fulfillment first, provide one reliable contact, then review payment and totals before submitting."
        badges={[
          { label: `${cartCount} item${cartCount === 1 ? '' : 's'}`, tone: 'pill' },
          { label: isDeliveryOrder ? 'Delivery order flow' : 'Pickup order flow' }
        ]}
        isMobileViewport={isMobileViewport}
        accentColor="#0f766e"
        accentSoft="#ecfeff"
        accentBorder="#99f6e4"
        displayFont={servicesDisplayFont}
      />

      <CheckoutStepProgressHeader
        steps={[
          { realStep: 1, displayStep: 1, label: isDgfyCustomerSignedIn ? 'Account' : 'Customer', allow: true },
          { realStep: 2, displayStep: 2, label: 'Fulfillment', allow: cart.length > 0 && simpleCustomerStepComplete },
          { realStep: 3, displayStep: 3, label: 'Review & Pay', allow: cart.length > 0 && simpleCustomerStepComplete },
          { realStep: 4, displayStep: 4, label: 'Confirmation', allow: Boolean(checkoutResult), completeWhen: () => Boolean(checkoutResult) }
        ]}
        activeStep={simpleOrderStep}
        onStepClick={(item) => {
          if (!item.allow) return;
          onSetSimpleOrderStep(item.realStep);
        }}
        variant="cards"
        isMobileViewport={isMobileViewport}
        accentColor="#0f766e"
        accentSoft="#ecfeff"
        accentBorder="#99f6e4"
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
            canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
            customerAddress={customerAddress}
            customerPin={customerPin}
            isDeliveryOrder={isDeliveryOrder}
            isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
            isMobileViewport={isMobileViewport}
            orderMethod={orderMethod}
            pinLocationError={pinLocationError}
            pinLocationLoading={pinLocationLoading}
            renderGuestCheckoutEntry={renderGuestCheckoutEntry}
            scheduledFor={fnbScheduledFor}
            selectedLocation={selectedLocation}
            selectedLocationId={selectedLocationId}
            simpleOrderMethodOptions={simpleOrderMethodOptions}
            simpleStepOneReady={simpleStepOneReady}
            specialInstructions={fnbSpecialInstructions}
            storeLocations={storeLocations}
            onBack={() => onSetSimpleOrderStep(1)}
            onContinue={() => onSetSimpleOrderStep(3)}
            onCustomerAddressChange={onCustomerAddressChange}
            onOrderMethodChange={onOrderMethodChange}
            onPinChange={onPinChange}
            onPinClear={onPinClear}
            onPinMyLocation={onPinMyLocation}
            onScheduledForChange={onScheduledForChange}
            onSelectedLocationChange={onSelectedLocationChange}
            onSpecialInstructionsChange={onSpecialInstructionsChange}
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
