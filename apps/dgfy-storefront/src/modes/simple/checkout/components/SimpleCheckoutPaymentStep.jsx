import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { PaymentElectionSelector } from '../../../../shared/components/checkout/PaymentElectionSelector.jsx';
import { SimpleCheckoutPaymentActions } from './SimpleCheckoutPaymentActions.jsx';
import { SimpleCheckoutReviewItemsList } from './SimpleCheckoutReviewItemsList.jsx';
import { requiresBillingEmail } from '../../../../checkout/checkoutValidation.js';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';

export function SimpleCheckoutPaymentStep({
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
  const typography = getCheckoutStepTypography();

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14, fontFamily: CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.title, color: '#1e293b' }}>Step 3: Review & Payment</div>
      <PaymentElectionSelector
        accentColor="#176B3A"
        active={isCustomerChoiceStore}
        onChange={onPaymentElectionChange}
        value={paymentElection}
      />
      <PaymentMethodSelectorBlock
        label={isDownpaymentActive ? 'Pay downpayment with' : 'Payment Type'}
        value={paymentType}
        onChange={onPaymentTypeChange}
        options={paymentOptions}
        DropdownComponent={DropdownComponent}
        labelStyle={{ ...typography.sectionTitle, color: '#1e293b', fontFamily: CHECKOUT_FONT_FAMILY }}
        triggerStyle={{ ...typography.control, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, fontFamily: CHECKOUT_FONT_FAMILY }}
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
