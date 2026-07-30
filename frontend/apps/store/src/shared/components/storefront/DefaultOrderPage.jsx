import { useState } from 'react';
import { DefaultOrderAccountStep } from './DefaultOrderAccountStep.jsx';
import { DefaultOrderFulfillmentStep } from './DefaultOrderFulfillmentStep.jsx';
import { DefaultOrderJourneyHeader } from './DefaultOrderJourneyHeader.jsx';
import { DefaultOrderPaymentStep } from './DefaultOrderPaymentStep.jsx';
import { DefaultOrderStoreHeader } from './DefaultOrderStoreHeader.jsx';

/**
 * Default/Retail order page (`/order`), reached from DefaultProductCartDrawer's "Order &
 * Purchase" button. Mirrors modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx's overall
 * structure (store header, journey header, 3 numbered step cards) but is this mode's own page,
 * per the "independent trees" pattern already used for checkout/cart elsewhere in this app.
 *
 * Account, Fulfillment (order method / schedule / saved addresses), and Payment are all local
 * placeholder state owned by this page — none of it is wired to the backend yet, per explicit
 * instruction. Only the cart/product list (passed in via useDefaultOrderPageProps.js) is real:
 * it's the same frontend cart state the rest of the app already uses, not a new backend
 * connection. The map in the Fulfillment step is real/interactive (MapLibre pin drop) — only
 * the saved-address *list* backing it is placeholder data.
 */
export function DefaultOrderPage({
  cart = [],
  cartCount = 0,
  isMobileViewport = false,
  money,
  onBackToCatalog,
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
  const [paymentType, setPaymentType] = useState('cash');

  const isDeliveryOrder = orderMethod === 'delivery';

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? '8px 16px 18px' : '18px 24px 28px' }}>
      <DefaultOrderStoreHeader
        isMobileViewport={isMobileViewport}
        onBackToCatalog={onBackToCatalog}
        selectedStore={selectedStore}
        servicesDisplayFont={servicesDisplayFont}
        withAssetOrigin={withAssetOrigin}
      />

      <DefaultOrderJourneyHeader
        activeStep={step}
        cartCount={cartCount}
        cartHasItems={cart.length > 0}
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        displayFont={servicesDisplayFont}
        onStepChange={setStep}
      />

      {step === 1 && (
        <DefaultOrderAccountStep
          isMobileViewport={isMobileViewport}
          servicesBodyFont={servicesBodyFont}
          servicesDisplayFont={servicesDisplayFont}
          onBackToCatalog={onBackToCatalog}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <DefaultOrderFulfillmentStep
          customerPin={customerPin}
          isMobileViewport={isMobileViewport}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
          onOrderMethodChange={setOrderMethod}
          onPinChange={setCustomerPin}
          onScheduleModeChange={(nextMode) => {
            setScheduleMode(nextMode);
            if (nextMode === 'asap') setScheduledFor('');
          }}
          onScheduledForChange={setScheduledFor}
          onSelectAddress={setSelectedAddressId}
          orderMethod={orderMethod}
          scheduleMode={scheduleMode}
          scheduledFor={scheduledFor}
          selectedAddressId={selectedAddressId}
        />
      )}

      {step === 3 && (
        <DefaultOrderPaymentStep
          cart={cart}
          isMobileViewport={isMobileViewport}
          money={money}
          onBack={() => setStep(2)}
          onPaymentTypeChange={setPaymentType}
          paymentType={paymentType}
          servicesBodyFont={servicesBodyFont}
        />
      )}
    </div>
  );
}
