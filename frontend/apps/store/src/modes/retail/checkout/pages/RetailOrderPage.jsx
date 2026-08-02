import { useState } from 'react';
import { buildCartTotals } from '../../../../shared/model/storefrontCartModel.js';
import { RetailOrderAccountStep } from '../components/RetailOrderAccountStep.jsx';
import { RetailOrderFulfillmentStep } from '../components/RetailOrderFulfillmentStep.jsx';
import { RetailOrderJourneyHeader } from '../components/RetailOrderJourneyHeader.jsx';
import { RetailOrderMobileSummaryPanel } from '../components/RetailOrderMobileSummaryPanel.jsx';
import { RetailOrderPaymentStep } from '../components/RetailOrderPaymentStep.jsx';
import { RetailOrderStoreHeader } from '../components/RetailOrderStoreHeader.jsx';
import { RetailOrderSummaryContent } from '../components/RetailOrderSummaryContent.jsx';

const RETAIL_ACCENT = '#1a4e8d';
const RETAIL_ACCENT_SHADOW = 'rgba(26,78,141,.28)';

/**
 * Retail order page (`/order`), reached from the retail cart drawer's "Order & Purchase"
 * button. Mirrors modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx's overall structure
 * (full-width store header, centered 1240px journey header + step cards, desktop sidebar
 * summary, mobile bottom-sheet summary panel) but is this mode's own page, per the
 * "independent trees" pattern already used for F&B/MSME checkout.
 *
 * Retail-only: other default-like workflow modes (hospitality, healthcare, manufacturing,
 * food_manufacturing, ticketing_transport, logistics_distribution, education_institutions)
 * continue to use shared/components/storefront/DefaultOrderPage.jsx, unmodified, since this
 * refined layout was built specifically for retail and hasn't been requested for the others.
 *
 * Account, Fulfillment (order method / schedule / saved addresses / special instructions), and
 * Payment are all local placeholder state owned by this page — none of it is wired to the
 * backend yet, per explicit instruction. Only the cart/product list (passed in via
 * useRetailOrderPageProps.js) is real: it's the same frontend cart state the rest of the app
 * already uses, not a new backend connection. The map in the Fulfillment step is
 * real/interactive (MapLibre pin drop) — only the saved-address *list* backing it is
 * placeholder data. Order totals (subtotal/total) are computed for real from the cart via the
 * shared buildCartTotals model; Delivery Fee and Fees & Taxes show as 0 since there's no
 * fee/quote backend yet.
 */
export function RetailOrderPage({
  cart = [],
  cartCount = 0,
  cartImageErrors,
  isDesktopCheckout = false,
  isMobileViewport = false,
  money,
  onBackToCatalog,
  onImageError,
  servicesBodyFont,
  servicesDisplayFont,
  selectedStore,
  withAssetOrigin
}) {
  const [step, setStep] = useState(1);
  const [orderMethod, setOrderMethod] = useState('delivery');
  const [scheduleMode, setScheduleMode] = useState('asap');
  const [scheduledFor, setScheduledFor] = useState('');
  const [customerPin, setCustomerPin] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState('placeholder-home');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const [showMobileAddressModal, setShowMobileAddressModal] = useState(false);

  const isDeliveryOrder = orderMethod === 'delivery';
  const cartTotals = buildCartTotals(cart);
  const totals = {
    subtotal_amount: cartTotals.subtotal,
    delivery_fee: 0,
    service_fee_amount: 0,
    total_amount: cartTotals.total
  };
  const scheduleLabel = scheduleMode === 'schedule' && scheduledFor
    ? new Date(scheduledFor).toLocaleString()
    : 'NOW';
  const stepGridStyle = {
    display: 'grid',
    gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.45fr) minmax(300px, 380px)' : '1fr',
    gap: 14,
    alignItems: 'start'
  };

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: '100%', width: '100%', padding: isMobileViewport ? '0px 0px 18px' : '0px 0px 28px' }}>
      <RetailOrderStoreHeader
        brandColor={RETAIL_ACCENT}
        brandShadow={RETAIL_ACCENT_SHADOW}
        displayFont={servicesDisplayFont}
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        isResponsiveFlow={!isDesktopCheckout}
        onBack={onBackToCatalog}
        selectedStore={selectedStore}
        textOnBrand="#fff"
        withAssetOrigin={withAssetOrigin}
      />

      <div style={{ display: 'grid', gap: 18, maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? '0 16px calc(env(safe-area-inset-bottom, 0px) + 196px)' : '0 40px', boxSizing: 'border-box' }}>
        <RetailOrderJourneyHeader
          activeStep={step}
          cartCount={cartCount}
          cartHasItems={cart.length > 0}
          isDeliveryOrder={isDeliveryOrder}
          isMobileViewport={isMobileViewport}
          displayFont={servicesDisplayFont}
          onStepChange={setStep}
        />

        {step === 1 && (
          <div style={stepGridStyle}>
            <RetailOrderAccountStep
              isMobileViewport={isMobileViewport}
              servicesBodyFont={servicesBodyFont}
              servicesDisplayFont={servicesDisplayFont}
              onBackToCatalog={onBackToCatalog}
              onContinue={() => setStep(2)}
            />
            {!isMobileViewport && (
              <RetailOrderSummaryContent
                bodyFont={servicesBodyFont}
                cart={cart}
                cartCount={cartCount}
                cartImageErrors={cartImageErrors}
                displayFont={servicesDisplayFont}
                isDeliveryOrder={isDeliveryOrder}
                isSticky
                money={money}
                onImageError={onImageError}
                scheduleLabel={scheduleLabel}
                totals={totals}
                withAssetOrigin={withAssetOrigin}
              />
            )}
          </div>
        )}

        {step === 2 && (
          <div style={stepGridStyle}>
            <RetailOrderFulfillmentStep
              customerPin={customerPin}
              isMobileViewport={isMobileViewport}
              onAddNewLocation={() => {
                setCustomerPin(null);
                setSelectedAddressId('');
                setShowMobileAddressModal(false);
              }}
              onBack={() => setStep(1)}
              onCloseMobileAddressModal={() => setShowMobileAddressModal(false)}
              onContinue={() => setStep(3)}
              onOpenMobileAddressList={() => setShowMobileAddressModal(true)}
              onOrderMethodChange={setOrderMethod}
              onPinChange={setCustomerPin}
              onScheduleModeChange={(nextMode) => {
                setScheduleMode(nextMode);
                if (nextMode === 'asap') setScheduledFor('');
              }}
              onScheduledForChange={setScheduledFor}
              onSelectAddress={setSelectedAddressId}
              onSpecialInstructionsChange={setSpecialInstructions}
              orderMethod={orderMethod}
              scheduleMode={scheduleMode}
              scheduledFor={scheduledFor}
              selectedAddressId={selectedAddressId}
              showMobileAddressModal={showMobileAddressModal}
              specialInstructions={specialInstructions}
            />
            {!isMobileViewport && (
              <RetailOrderSummaryContent
                bodyFont={servicesBodyFont}
                cart={cart}
                cartCount={cartCount}
                cartImageErrors={cartImageErrors}
                displayFont={servicesDisplayFont}
                isDeliveryOrder={isDeliveryOrder}
                isSticky
                money={money}
                onImageError={onImageError}
                scheduleLabel={scheduleLabel}
                totals={totals}
                withAssetOrigin={withAssetOrigin}
              />
            )}
          </div>
        )}

        {step === 3 && (
          <div style={stepGridStyle}>
            <RetailOrderPaymentStep
              cart={cart}
              cartImageErrors={cartImageErrors}
              isMobileViewport={isMobileViewport}
              money={money}
              onBack={() => setStep(2)}
              onImageError={onImageError}
              onPaymentTypeChange={setPaymentType}
              paymentType={paymentType}
              servicesBodyFont={servicesBodyFont}
              withAssetOrigin={withAssetOrigin}
            />
            {!isMobileViewport && (
              <RetailOrderSummaryContent
                bodyFont={servicesBodyFont}
                cart={cart}
                cartCount={cartCount}
                cartImageErrors={cartImageErrors}
                displayFont={servicesDisplayFont}
                isDeliveryOrder={isDeliveryOrder}
                isSticky
                money={money}
                onImageError={onImageError}
                scheduleLabel={scheduleLabel}
                totals={totals}
                withAssetOrigin={withAssetOrigin}
              />
            )}
          </div>
        )}

        {isMobileViewport && (
          <RetailOrderMobileSummaryPanel
            cart={cart}
            cartCount={cartCount}
            cartImageErrors={cartImageErrors}
            isDeliveryOrder={isDeliveryOrder}
            money={money}
            onBackToCatalog={onBackToCatalog}
            onImageError={onImageError}
            onStepChange={setStep}
            orderStep={step}
            scheduleLabel={scheduleLabel}
            setSummaryOpen={setShowMobileSummary}
            showSummary={showMobileSummary}
            totals={totals}
            withAssetOrigin={withAssetOrigin}
          />
        )}
      </div>
    </div>
  );
}
