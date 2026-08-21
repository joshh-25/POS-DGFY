import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { SimpleCheckoutPaymentActions } from './SimpleCheckoutPaymentActions.jsx';
import { SimpleCheckoutReviewItemsList } from './SimpleCheckoutReviewItemsList.jsx';

export function SimpleCheckoutPaymentStep({
  bodyFont,
  cart = [],
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  downpaymentCallout = null,
  DropdownComponent,
  isDownpaymentActive = false,
  isMobileViewport = false,
  money,
  onImageError,
  paymentType = 'cash',
  paymentOptions = [],
  onlinePaymentPanel = null,
  simpleCheckoutAllowed = false,
  submitLabel = 'Place Order',
  storefrontClosedNotice = null,
  withAssetOrigin,
  onBack,
  onCheckout,
  onPaymentTypeChange
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Step 3: Review & Payment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Review the cart and calculated order total, then choose payment and submit the order.</div>
      <PaymentMethodSelectorBlock
        label={isDownpaymentActive ? 'Pay downpayment with' : 'Payment Type'}
        value={paymentType}
        onChange={onPaymentTypeChange}
        options={paymentOptions}
        DropdownComponent={DropdownComponent}
        triggerStyle={{ minHeight: 44, borderRadius: 12 }}
        showCashInfo={!isDownpaymentActive && paymentType === 'cash'}
        cashInfoAccent="#176B3A"
        bodyFont={bodyFont}
        downpaymentCallout={downpaymentCallout}
      />
      {onlinePaymentPanel}
      <SimpleCheckoutReviewItemsList
        cart={cart}
        cartImageErrors={cartImageErrors}
        isMobileViewport={isMobileViewport}
        money={money}
        onImageError={onImageError}
        withAssetOrigin={withAssetOrigin}
      />
      <SimpleCheckoutPaymentActions
        checkoutError={checkoutError}
        checkoutLoading={checkoutLoading}
        isMobileViewport={isMobileViewport}
        simpleCheckoutAllowed={simpleCheckoutAllowed}
        submitLabel={submitLabel}
        storefrontClosedNotice={storefrontClosedNotice}
        onBack={onBack}
        onCheckout={onCheckout}
      />
    </section>
  );
}
