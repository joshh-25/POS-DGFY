import { resolveDownpaymentBalanceLabel, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';

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
  // Phase 142 (#823): order-sourced (the most authoritative source once an order exists). In
  // ordinary flow a downpayment order is created only by the webhook finalizer -- the online/QR
  // path never reaches this success step (it goes straight to tracking on 'finalized') -- but
  // this stays correct defensively for any path that does land here with a partially_paid order.
  const downpaymentDisplay = resolveDownpaymentDisplay({ order: checkoutResult?.order });
  const paymentRowLabel = downpaymentDisplay.active
    ? `${String(paymentType || 'cash').replace(/_/g, ' ').toUpperCase()} DOWNPAYMENT`
    : String(paymentType || 'cash').replace(/_/g, ' ').toUpperCase();
  const fulfillmentCopy = fulfillmentLabel === 'Delivery'
    ? 'Your delivery order is confirmed and is now in the storefront queue.'
    : 'Your pickup order is confirmed and is now in the storefront queue.';
  const actionStyle = {
    minHeight: 42,
    borderRadius: 12,
    padding: '0 14px',
    fontSize: isMobileViewport ? 14 : 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    width: isMobileViewport ? '100%' : 'auto'
  };

  return (
    <div data-testid="simple-checkout-success" style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.45fr) minmax(300px, 380px)' : 'minmax(0, 1fr)', gap: 14, alignItems: 'start', width: '100%', minWidth: 0 }}>
      <section style={{ border: '1px solid #E4C98E', borderRadius: 16, background: '#FFF8E7', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#176B3A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order Confirmed</div>
        <div style={{ fontSize: isMobileViewport ? 22 : 30, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, fontFamily: displayFont, overflowWrap: 'anywhere' }}>{fulfillmentCopy}</div>
        <div style={{ fontSize: 14, color: '#475569', minWidth: 0 }}>Reference: <strong style={{ color: '#0f172a', overflowWrap: 'anywhere' }}>{trackingPin}</strong></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {confirmedLines.map((line) => {
            const quantity = Math.max(1, Number(line.quantity || 1));
            const subtotal = (Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0);

            return (
              <div key={`simple-confirm-line-${line.item_id}`} style={{ border: '1px solid #D8E8DC', borderRadius: 12, background: '#fff', padding: '10px 12px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'start', gap: 10, fontSize: 13, minWidth: 0 }}>
                <span style={{ color: '#334155', overflowWrap: 'anywhere' }}>{line.name} x {quantity}</span>
                <strong style={{ color: '#0f172a', whiteSpace: 'nowrap', textAlign: 'right' }}>{money(subtotal)}</strong>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, max-content)', gap: 10, alignItems: 'center' }}>
          {checkoutResult?.payment?.checkout_url && (
            <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ ...actionStyle, border: 'none', background: '#176B3A', color: '#fff', textDecoration: 'none' }}>
              Pay Now
            </a>
          )}
          <button type="button" onClick={onDownload} style={{ ...actionStyle, border: '1px solid #176B3A', background: '#fff', color: '#176B3A' }}>
            Download Image
          </button>
          <button type="button" onClick={onBackToCatalog} style={{ ...actionStyle, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a' }}>
            Back to Catalog
          </button>
        </div>
      </section>
      <aside style={{ border: '1px solid #D8E8DC', borderRadius: 16, padding: isMobileViewport ? 14 : 16, background: '#ffffff', boxShadow: '0 8px 18px rgba(23,107,58,.06)', display: 'grid', gap: 10, position: isDesktopCheckout ? 'sticky' : 'static', top: 8, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#176B3A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Receipt Snapshot</div>
        <div style={{ fontSize: isMobileViewport ? 30 : 38, fontWeight: 800, color: '#0f172a', lineHeight: 1.1, overflowWrap: 'anywhere' }}>{money(receiptTotal)}</div>
        <div style={{ display: 'grid', gap: 6, fontSize: 13, color: '#334155' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}><span>Tracking PIN</span><strong style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{trackingPin}</strong></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}><span>Payment</span><strong style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{paymentRowLabel}</strong></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}><span>Fulfillment</span><strong style={{ textAlign: 'right' }}>{fulfillmentLabel}</strong></div>
          {downpaymentDisplay.active && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}><span>Paid now</span><strong style={{ textAlign: 'right' }}>{money(downpaymentDisplay.downpaymentAmount)}</strong></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}><span>{resolveDownpaymentBalanceLabel(fulfillmentLabel === 'Delivery' ? 'delivery' : 'pickup')}</span><strong style={{ textAlign: 'right' }}>{money(downpaymentDisplay.balanceDueAmount)}</strong></div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
