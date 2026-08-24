import { ChevronLeft } from 'lucide-react';
import { GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE } from '../../../../shared/checkout/model/guestCheckoutOtp.js';

const SIMPLE_BRAND = '#176B3A';

export function SimpleCheckoutPaymentActions({
  checkoutError = '',
  checkoutLoading = false,
  guestCheckoutVerificationRequired = false,
  isMobileViewport = false,
  submitLabel = '',
  storefrontClosedNotice = null,
  simpleCheckoutAllowed = false,
  onBack,
  onCheckout,
  onSignInToCheckout
}) {
  const actionHeight = isMobileViewport ? 44 : 46;
  const actionFontSize = isMobileViewport ? 14 : 15;
  const showGuestCheckoutVerificationNotice = guestCheckoutVerificationRequired
    && (!checkoutError || checkoutError === GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE);

  return (
    <>
      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ minHeight: actionHeight, borderRadius: 12, border: `1px solid ${SIMPLE_BRAND}`, background: '#fff', color: SIMPLE_BRAND, fontWeight: 700, cursor: 'pointer', fontSize: actionFontSize, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ChevronLeft size={18} /> Back
          </button>
          <button type="button" onClick={onCheckout} disabled={!simpleCheckoutAllowed || guestCheckoutVerificationRequired} style={{ minHeight: actionHeight, borderRadius: 12, border: 'none', background: simpleCheckoutAllowed && !guestCheckoutVerificationRequired ? SIMPLE_BRAND : '#cbd5e1', color: '#fff', fontWeight: 700, cursor: simpleCheckoutAllowed && !guestCheckoutVerificationRequired ? 'pointer' : 'not-allowed', fontSize: actionFontSize }}>
            {checkoutLoading ? 'Processing...' : (submitLabel || 'Place Order')}
          </button>
        </div>
      )}
      {storefrontClosedNotice}
      {checkoutError && checkoutError !== GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
      {showGuestCheckoutVerificationNotice && (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE}</p>
          {typeof onSignInToCheckout === 'function' && (
            <button
              type="button"
              onClick={onSignInToCheckout}
              style={{ minHeight: actionHeight, borderRadius: 12, border: `1px solid ${SIMPLE_BRAND}`, background: '#fff', color: SIMPLE_BRAND, fontWeight: 700, cursor: 'pointer', fontSize: actionFontSize }}
            >
              Sign in with my DGFY account
            </button>
          )}
        </div>
      )}
    </>
  );
}
