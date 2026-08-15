import { ChevronLeft } from 'lucide-react';

const SIMPLE_BRAND = '#176B3A';

export function SimpleCheckoutPaymentActions({
  checkoutError = '',
  checkoutLoading = false,
  isMobileViewport = false,
  storefrontClosedNotice = null,
  simpleCheckoutAllowed = false,
  onBack,
  onCheckout
}) {
  const actionHeight = isMobileViewport ? 44 : 46;
  const actionFontSize = isMobileViewport ? 14 : 15;

  return (
    <>
      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ minHeight: actionHeight, borderRadius: 12, border: `1px solid ${SIMPLE_BRAND}`, background: '#fff', color: SIMPLE_BRAND, fontWeight: 700, cursor: 'pointer', fontSize: actionFontSize, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ChevronLeft size={18} /> Back
          </button>
          <button type="button" onClick={onCheckout} disabled={!simpleCheckoutAllowed} style={{ minHeight: actionHeight, borderRadius: 12, border: 'none', background: simpleCheckoutAllowed ? SIMPLE_BRAND : '#cbd5e1', color: '#fff', fontWeight: 700, cursor: simpleCheckoutAllowed ? 'pointer' : 'not-allowed', fontSize: actionFontSize }}>
            {checkoutLoading ? 'Processing...' : 'Place Order'}
          </button>
        </div>
      )}
      {storefrontClosedNotice}
      {checkoutError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
    </>
  );
}
