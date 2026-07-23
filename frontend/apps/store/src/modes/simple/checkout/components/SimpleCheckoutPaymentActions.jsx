export function SimpleCheckoutPaymentActions({
  cartItemCount = 0,
  checkoutError = '',
  checkoutLoading = false,
  isMobileViewport = false,
  quoteError = '',
  quoteResult = null,
  storefrontClosedNotice = null,
  requireQuoteForCheckout = false,
  selectedStore = null,
  simpleCheckoutAllowed = false,
  onBack,
  onCheckout,
  onQuote
}) {
  const actionHeight = isMobileViewport ? 38 : 44;
  const actionFontSize = isMobileViewport ? 14 : 15;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button type="button" onClick={onQuote} disabled={!selectedStore || cartItemCount === 0} style={{ minHeight: actionHeight, borderRadius: 12, border: '1px solid #ea580c', background: '#fff', color: '#9a3412', fontWeight: 800, cursor: 'pointer', fontSize: actionFontSize }}>
          {quoteResult ? 'Refresh Quote' : 'Get Quote'}
        </button>
        <button type="button" onClick={onCheckout} disabled={!simpleCheckoutAllowed} style={{ minHeight: actionHeight, borderRadius: 12, border: 'none', background: simpleCheckoutAllowed ? '#ea580c' : '#cbd5e1', color: '#fff', fontWeight: 800, cursor: simpleCheckoutAllowed ? 'pointer' : 'not-allowed', fontSize: actionFontSize }}>
          {checkoutLoading ? 'Processing...' : 'Place Order'}
        </button>
      </div>
      <button type="button" onClick={onBack} style={{ justifySelf: 'start', minHeight: isMobileViewport ? 38 : 40, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 14px', fontWeight: 800, cursor: 'pointer', fontSize: actionFontSize }}>
        Back
      </button>
      {storefrontClosedNotice}
      {quoteError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
      {checkoutError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
      {requireQuoteForCheckout && !quoteResult && cartItemCount > 0 && (
        <div style={{ fontSize: 12, color: '#b45309' }}>Quote the order first so totals and fees are synced before checkout.</div>
      )}
    </>
  );
}
