export function SimpleCheckoutSuccessStep({
  checkoutResult,
  displayFont,
  fulfillmentLabel = 'Pickup',
  isDesktopCheckout = false,
  isMobileViewport = false,
  money,
  paymentType = 'cash',
  totalAmount = 0,
  onBackToCatalog,
  onDownload
}) {
  const confirmedLines = Array.isArray(checkoutResult?.cart_lines) ? checkoutResult.cart_lines : [];
  const receiptTotal = checkoutResult?.totals?.total_amount ?? totalAmount;
  const trackingPin = checkoutResult?.tracking_pin || 'Pending';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.45fr) minmax(300px, 380px)' : '1fr', gap: 14, alignItems: 'start' }}>
      <section style={{ border: '1px solid #99f6e4', borderRadius: 16, background: '#ecfeff', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order Confirmed</div>
        <div style={{ fontSize: isMobileViewport ? 24 : 30, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, fontFamily: displayFont }}>Your order is now in the storefront queue.</div>
        <div style={{ fontSize: 14, color: '#475569' }}>Reference: <strong>{trackingPin}</strong></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {confirmedLines.map((line) => {
            const quantity = Math.max(1, Number(line.quantity || 1));
            const subtotal = (Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0);

            return (
              <div key={`simple-confirm-line-${line.item_id}`} style={{ border: '1px solid #b6f2e9', borderRadius: 12, background: '#fff', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span>{line.name} x {quantity}</span>
                <strong>{money(subtotal)}</strong>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {checkoutResult?.payment?.checkout_url && (
            <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ minHeight: 42, borderRadius: 12, border: 'none', background: '#ea580c', color: '#fff', padding: '0 14px', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Pay Now
            </a>
          )}
          <button type="button" onClick={onDownload} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>
            Download Image
          </button>
          <button type="button" onClick={onBackToCatalog} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>
            Back to Catalog
          </button>
        </div>
      </section>
      <aside style={{ border: '1px solid #d9e4e8', borderRadius: 16, padding: 14, background: '#ffffff', boxShadow: '0 12px 24px rgba(15,23,42,.06)', display: 'grid', gap: 10, position: isDesktopCheckout ? 'sticky' : 'static', top: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Receipt Snapshot</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{money(receiptTotal)}</div>
        <div style={{ display: 'grid', gap: 6, fontSize: 13, color: '#334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>Tracking PIN</span><strong>{trackingPin}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>Payment</span><strong>{String(paymentType || 'cash').replace('_', ' ').toUpperCase()}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>Fulfillment</span><strong>{fulfillmentLabel}</strong></div>
        </div>
      </aside>
    </div>
  );
}
