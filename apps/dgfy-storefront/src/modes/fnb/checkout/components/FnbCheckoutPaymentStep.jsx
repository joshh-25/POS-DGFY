import { ChevronLeft } from 'lucide-react';
import { FnbCheckoutReviewItemsList } from './FnbCheckoutReviewItemsList.jsx';
import { GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE } from '../../../../shared/checkout/model/guestCheckoutOtp.js';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';

/** F&B payment step view. The route ViewModel supplies payment controls and submit action. */
export function FnbCheckoutPaymentStep({
  canSubmit,
  brandColor,
  cart,
  cartImageErrors,
  checkoutError,
  closedNotice,
  guestCheckoutVerificationRequired = false,
  isMobileViewport,
  isResponsive,
  money,
  onBack,
  onBackToAccount,
  onImageError,
  onSubmit,
  paymentControl,
  processing,
  quoteError,
  submitLabel = 'Place Order',
  withAssetOrigin
}) {
  const typography = getCheckoutStepTypography();
  const displayedCheckoutError = guestCheckoutVerificationRequired && checkoutError === GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE
    ? ''
    : checkoutError;

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: isResponsive ? 20 : 16, background: '#fff', padding: isResponsive ? 16 : isMobileViewport ? 14 : 18, display: 'grid', gap: 14, fontFamily: CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.title, color: '#1e293b' }}>Step 3: Review &amp; Payment</div>
      {paymentControl}
      <FnbCheckoutReviewItemsList
        accentColor={brandColor}
        cart={cart}
        cartImageErrors={cartImageErrors}
        isMobileViewport={isMobileViewport}
        money={money}
        onImageError={onImageError}
        withAssetOrigin={withAssetOrigin}
      />
      {guestCheckoutVerificationRequired ? (
        <div style={{ display: 'grid', gap: 10, border: '1px solid #fecaca', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE}</p>
          {typeof onBackToAccount === 'function' ? (
            <button
              type="button"
              onClick={onBackToAccount}
              style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: '1px solid #1a4e8d', background: '#fff', color: '#1a4e8d', cursor: 'pointer', fontFamily: CHECKOUT_FONT_FAMILY }}
            >
              Back to Customer Details &amp; Verify Email
            </button>
          ) : null}
        </div>
      ) : null}
      {!isResponsive ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" onClick={onBack} style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: CHECKOUT_FONT_FAMILY }}><ChevronLeft size={18} /> Back</button>
          <button type="button" onClick={onSubmit} disabled={!canSubmit} style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: 'none', background: canSubmit ? brandColor : '#cbd5e1', color: '#fff', cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: CHECKOUT_FONT_FAMILY }}>{processing ? 'Processing...' : submitLabel}</button>
        </div>
      ) : null}
      {closedNotice}
      {quoteError ? <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p> : null}
      {displayedCheckoutError ? <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{displayedCheckoutError}</p> : null}
    </section>
  );
}
