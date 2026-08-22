import { resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';

/**
 * Pure F&B checkout success view. Submission, routing, and state ownership
 * stay in the F&B checkout view model or route container.
 */
export function FnbCheckoutConfirmation({
  brandColor,
  brandDark,
  brandSoft,
  brandTint,
  cartLines,
  checkoutResult,
  isDeliveryOrder,
  isMobileViewport,
  money,
  mutedTextColor,
  onBackToMenu,
  onDownload,
  onOpenTracking,
  paymentType,
  totalAmount,
}) {
  // Phase 142 (#823): order-sourced (see SimpleCheckoutSuccessStep.jsx's identical comment --
  // same caveat applies: in ordinary flow this rarely renders for a downpayment order at all).
  const downpaymentDisplay = resolveDownpaymentDisplay({ order: checkoutResult?.order });
  const paymentRowLabel = downpaymentDisplay.active
    ? `${String(paymentType || 'cash').toUpperCase()} DOWNPAYMENT`
    : String(paymentType || 'cash').toUpperCase();
  return (
    <section style={{ border: '1px solid #dbe5ee', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: brandColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Order Confirmation
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#1e293b' }}>Order submitted successfully</div>
      <div style={{ display: 'grid', gap: 8, border: `1px solid ${brandSoft}`, background: brandTint, borderRadius: 14, padding: '12px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: brandDark, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Fulfillment Handoff
        </div>
        <div style={{ fontSize: 14, color: mutedTextColor, lineHeight: 1.6 }}>
          {isDeliveryOrder
            ? 'Delivery orders move from confirmation to preparing, then out for delivery.'
            : 'Pickup orders move from confirmation to preparing, then ready for pickup.'}
        </div>
        <div style={{ fontSize: 13, color: brandDark, fontWeight: 700 }}>Next update: Confirmed by store</div>
      </div>
      <div style={{ display: 'grid', gap: 6, fontSize: 14, color: '#334155' }}>
        <div>Reference: <strong>{checkoutResult?.tracking_pin || 'Pending'}</strong></div>
        <div>Payment: <strong>{paymentRowLabel}</strong></div>
        <div>Total: <strong>{money(totalAmount)}</strong></div>
        {downpaymentDisplay.active && (
          <>
            <div>Paid now: <strong>{money(downpaymentDisplay.downpaymentAmount)}</strong></div>
            <div>{isDeliveryOrder ? 'Balance due on delivery' : 'Balance due at pickup'}: <strong>{money(downpaymentDisplay.balanceDueAmount)}</strong></div>
          </>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
        {cartLines.map((line) => (
          <div key={`fnb-confirm-line-${line.item_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
            <span>{line.name} x {Math.max(1, Number(line.quantity || 1))}</span>
            <strong>{money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}</strong>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {checkoutResult?.payment?.checkout_url && (
          <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ minHeight: 42, borderRadius: 12, border: 'none', background: brandColor, color: '#fff', padding: '0 14px', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Continue to Payment
          </a>
        )}
        <button type="button" onClick={onOpenTracking} style={{ minHeight: 42, borderRadius: 12, border: `1px solid ${brandColor}`, background: brandTint, color: brandDark, padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>
          Open Tracking
        </button>
        <button type="button" onClick={onDownload} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>
          Download Confirmation
        </button>
        <button type="button" onClick={onBackToMenu} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>
          Back to Menu
        </button>
      </div>
    </section>
  );
}
