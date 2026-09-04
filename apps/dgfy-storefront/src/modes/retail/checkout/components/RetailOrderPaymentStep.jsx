import { ChevronLeft } from 'lucide-react';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { DownpaymentPaymentCallout } from '../../../../shared/components/checkout/DownpaymentPaymentCallout.jsx';
import { PaymentElectionSelector } from '../../../../shared/components/checkout/PaymentElectionSelector.jsx';
import { GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE } from '../../../../shared/checkout/model/guestCheckoutOtp.js';
import { requiresBillingEmail } from '../../../../checkout/checkoutValidation.js';
import { RetailOrderReviewItemsList } from './RetailOrderReviewItemsList.jsx';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';

/**
 * Retail order page's Review & Payment step. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx's layout (payment selector +
 * downpayment callout + online-payment panel + read-only item list). Wired to the
 * store's real `payment_capabilities` (Phase 142, #823) -- previously a hardcoded cash-only
 * placeholder list plus an inert "coming soon" online-payment card; see git history (this file,
 * pre-#823) for the exact prior shape. "Place Order"/"Pay downpayment" submits through
 * the same shared handleCheckout used by F&B/MSME (see useCheckoutSubmission.js) — on success it
 * navigates to the shared tracking/pickup page (FnbTrackingRouteContainer), same as before.
 */
export function RetailOrderPaymentStep({
  cart = [],
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  customerEmail = '',
  downpaymentDisplay = { active: false },
  guestCheckoutOtpVerified = false,
  isCustomerChoiceStore = false,
  isDeliveryOrder = false,
  isDgfyCustomerSignedIn = false,
  isMobileViewport = false,
  money,
  onBack,
  onBackToAccount,
  onCheckout,
  onImageError,
  onlinePaymentPanel = null,
  onPaymentElectionChange,
  onPaymentTypeChange,
  paymentElection = 'full',
  paymentOptions = [],
  paymentType = 'cash',
  renderBillingEmailPrompt,
  storefrontClosedNotice = null,
  withAssetOrigin
}) {
  const isDownpaymentActive = Boolean(downpaymentDisplay?.active);
  const submitLabel = isDownpaymentActive
    ? `Pay downpayment (${money(downpaymentDisplay.downpaymentAmount)})`
    : 'Place Order';
  const submitLoadingLabel = isDownpaymentActive ? 'Creating payment...' : 'Placing Order...';
  const guestCheckoutVerificationRequired = !isDgfyCustomerSignedIn && !guestCheckoutOtpVerified;
  // #963: same gating shape as guestCheckoutVerificationRequired above -- block submit, but also
  // render the input, since a signed-in phone-only account has no other way to supply an email.
  const billingEmailRequired = requiresBillingEmail({ paymentType, customerEmail });
  const displayedCheckoutError = guestCheckoutOtpVerified && checkoutError === GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE
    ? ''
    : checkoutError || (
    guestCheckoutVerificationRequired ? GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE : ''
    );
  const typography = getCheckoutStepTypography();

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14, fontFamily: CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.title, color: '#1e293b' }}>Step 3: Review &amp; Payment</div>
      <PaymentElectionSelector
        accentColor="#1a4e8d"
        active={isCustomerChoiceStore}
        onChange={onPaymentElectionChange}
        value={paymentElection}
      />
      <PaymentMethodSelectorBlock
        label={isDownpaymentActive ? 'Pay downpayment with' : 'Payment Type'}
        value={paymentType}
        onChange={onPaymentTypeChange}
        options={paymentOptions}
        DropdownComponent={StorefrontDropdown}
        labelStyle={{ ...typography.sectionTitle, color: '#1e293b', fontFamily: CHECKOUT_FONT_FAMILY }}
        triggerStyle={{ ...typography.control, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, fontFamily: CHECKOUT_FONT_FAMILY }}
        downpaymentCallout={(
          <DownpaymentPaymentCallout
            accentColor="#1a4e8d"
            display={downpaymentDisplay}
            money={money}
            orderMethod={isDeliveryOrder ? 'delivery' : 'pickup'}
          />
        )}
        notice={billingEmailRequired && typeof renderBillingEmailPrompt === 'function'
          ? renderBillingEmailPrompt({ invalid: Boolean(String(customerEmail || '').trim()) })
          : null}
      />
      {onlinePaymentPanel}
      <RetailOrderReviewItemsList
        cart={cart}
        cartImageErrors={cartImageErrors}
        isMobileViewport={isMobileViewport}
        money={money}
        onImageError={onImageError}
        withAssetOrigin={withAssetOrigin}
      />
      {displayedCheckoutError && (
        <div style={{ border: '1px solid #fecaca', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 600, padding: '10px 14px' }}>
          {displayedCheckoutError}
        </div>
      )}
      {guestCheckoutVerificationRequired && typeof onBackToAccount === 'function' && (
        <button
          type="button"
          onClick={onBackToAccount}
          style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: '1px solid #1a4e8d', background: '#fff', color: '#1a4e8d', cursor: 'pointer', fontFamily: CHECKOUT_FONT_FAMILY }}
        >
          Back to Account &amp; Verify Email
        </button>
      )}
      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: CHECKOUT_FONT_FAMILY }}><ChevronLeft size={18} /> Back</button>
          <button
            type="button"
            onClick={onCheckout}
            disabled={checkoutLoading || guestCheckoutVerificationRequired || billingEmailRequired}
            style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: 'none', background: checkoutLoading ? '#93b4d6' : (guestCheckoutVerificationRequired || billingEmailRequired) ? '#cbd5e1' : '#1a4e8d', color: '#fff', cursor: checkoutLoading ? 'wait' : (guestCheckoutVerificationRequired || billingEmailRequired) ? 'not-allowed' : 'pointer', fontFamily: CHECKOUT_FONT_FAMILY }}
          >
            {checkoutLoading ? submitLoadingLabel : submitLabel}
          </button>
        </div>
      )}
      {storefrontClosedNotice}
    </section>
  );
}
