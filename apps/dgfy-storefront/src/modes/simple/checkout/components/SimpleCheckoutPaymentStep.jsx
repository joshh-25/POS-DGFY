import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { PaymentElectionSelector } from '../../../../shared/components/checkout/PaymentElectionSelector.jsx';
import { SimpleCheckoutPaymentActions } from './SimpleCheckoutPaymentActions.jsx';
import { SimpleCheckoutReviewItemsList } from './SimpleCheckoutReviewItemsList.jsx';
import { requiresBillingEmail } from '../../../../checkout/checkoutValidation.js';

export function SimpleCheckoutPaymentStep({
  bodyFont,
  cart = [],
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  customerEmail = '',
  downpaymentCallout = null,
  DropdownComponent,
  guestCheckoutOtpVerified = false,
  isCustomerChoiceStore = false,
  isDgfyCustomerSignedIn = false,
  isDownpaymentActive = false,
  isMobileViewport = false,
  money,
  onImageError,
  paymentElection = 'full',
  paymentType = 'cash',
  paymentOptions = [],
  onlinePaymentPanel = null,
  renderBillingEmailPrompt,
  simpleCheckoutAllowed = false,
  submitLabel = 'Place Order',
  storefrontClosedNotice = null,
  withAssetOrigin,
  onBack,
  onCheckout,
  onPaymentElectionChange,
  onSignInToCheckout,
  onPaymentTypeChange
}) {
  const guestCheckoutVerificationRequired = !isDgfyCustomerSignedIn && !guestCheckoutOtpVerified;
  // #963: see RetailOrderPaymentStep.jsx for the rationale -- same gate, same shared helper.
  const billingEmailRequired = requiresBillingEmail({ paymentType, customerEmail });

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Step 3: Review & Payment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Review the cart and calculated order total, then choose payment and submit the order.</div>
      <PaymentElectionSelector
        accentColor="#176B3A"
        active={isCustomerChoiceStore}
        bodyFont={bodyFont}
        onChange={onPaymentElectionChange}
        value={paymentElection}
      />
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
        notice={billingEmailRequired && typeof renderBillingEmailPrompt === 'function'
          ? renderBillingEmailPrompt({ invalid: Boolean(String(customerEmail || '').trim()) })
          : null}
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
        guestCheckoutVerificationRequired={guestCheckoutVerificationRequired}
        isMobileViewport={isMobileViewport}
        simpleCheckoutAllowed={simpleCheckoutAllowed && !guestCheckoutVerificationRequired && !billingEmailRequired}
        submitLabel={submitLabel}
        storefrontClosedNotice={storefrontClosedNotice}
        onBack={onBack}
        onCheckout={onCheckout}
        onSignInToCheckout={onSignInToCheckout}
      />
    </section>
  );
}
