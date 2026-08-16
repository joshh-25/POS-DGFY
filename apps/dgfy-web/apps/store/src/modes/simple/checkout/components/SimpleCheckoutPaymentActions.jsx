import { ChevronLeft, RefreshCw } from 'lucide-react';

const SIMPLE_BRAND = '#0f766e';

export function SimpleCheckoutPaymentActions({
  cartItemCount = 0,
  checkoutError = '',
  checkoutLoading = false,
  isMobileViewport = false,
  quoteError = '',
  quoteResult = null,
  submitLabel = 'Place Order',
  storefrontClosedNotice = null,
  requireQuoteForCheckout = false,
  selectedStore = null,
  simpleCheckoutAllowed = false,
  onBack,
  onCheckout,
  onQuote
}) {
  const actionHeight = isMobileViewport ? 44 : 46;
  const actionFontSize = isMobileViewport ? 14 : 15;

  return (
    <>
      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onQuote} disabled={!selectedStore || cartItemCount === 0} style={{ minHeight: actionHeight, borderRadius: 12, border: `1px solid ${SIMPLE_BRAND}`, background: '#fff', color: SIMPLE_BRAND, fontWeight: 700, cursor: 'pointer', fontSize: actionFontSize, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <RefreshCw size={16} /> {quoteResult ? 'Refresh Quote' : 'Get Quote'}
          </button>
          <button type="button" onClick={onCheckout} disabled={!simpleCheckoutAllowed} style={{ minHeight: actionHeight, borderRadius: 12, border: 'none', background: simpleCheckoutAllowed ? SIMPLE_BRAND : '#cbd5e1', color: '#fff', fontWeight: 700, cursor: simpleCheckoutAllowed ? 'pointer' : 'not-allowed', fontSize: actionFontSize }}>
            {checkoutLoading ? 'Processing...' : submitLabel}
          </button>
        </div>
      )}
      {!isMobileViewport && (
        <button type="button" onClick={onBack} style={{ justifySelf: 'start', minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '0 16px', fontWeight: 700, cursor: 'pointer', fontSize: actionFontSize, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ChevronLeft size={18} /> Back
        </button>
      )}
      {storefrontClosedNotice}
      {quoteError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
      {checkoutError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
      {requireQuoteForCheckout && !quoteResult && cartItemCount > 0 && (
        <div style={{ fontSize: 12, color: '#b45309' }}>Quote the order first so totals and fees are synced before checkout.</div>
      )}
    </>
  );
}
