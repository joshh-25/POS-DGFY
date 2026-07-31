import { ChevronLeft, Wallet } from 'lucide-react';
import { FnbCheckoutReviewItemsList } from './FnbCheckoutReviewItemsList.jsx';

/** Structural placeholder for "Cash on Delivery/Online" copy — no gateway exists behind
 * gcash/maya/card/bank_transfer yet, so this is deliberately inert (no onClick, not a real
 * payment option). Remove once F&B gets a real online payment method. */
function FnbOnlinePaymentPlaceholder() {
  return (
    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 16, background: '#f8fafc', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Wallet size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Online payment</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Coming soon &mdash; cash is the only option for now.</div>
      </div>
    </div>
  );
}

/** F&B payment step view. The route ViewModel supplies payment controls and submit action. */
export function FnbCheckoutPaymentStep({
  canSubmit,
  brandColor,
  cart,
  cartImageErrors,
  checkoutError,
  closedNotice,
  isMobileViewport,
  isResponsive,
  money,
  onBack,
  onImageError,
  onSubmit,
  paymentControl,
  processing,
  quoteError,
  withAssetOrigin
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: isResponsive ? 20 : 16, background: '#fff', padding: isResponsive ? 16 : isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 3: Review &amp; Payment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Review the cart, refresh the quote when needed, then choose payment and submit the order.</div>
      {paymentControl}
      <FnbOnlinePaymentPlaceholder />
      <FnbCheckoutReviewItemsList
        accentColor={brandColor}
        cart={cart}
        cartImageErrors={cartImageErrors}
        isMobileViewport={isMobileViewport}
        money={money}
        onImageError={onImageError}
        withAssetOrigin={withAssetOrigin}
      />
      {!isResponsive ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" onClick={onBack} style={{ minHeight: 44, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
          <button type="button" onClick={onSubmit} disabled={!canSubmit} style={{ minHeight: 44, borderRadius: 12, border: 'none', background: canSubmit ? brandColor : '#cbd5e1', color: '#fff', fontWeight: 800, cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{processing ? 'Processing...' : 'Place Order'}</button>
        </div>
      ) : null}
      {closedNotice}
      {quoteError ? <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p> : null}
      {checkoutError ? <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p> : null}
    </section>
  );
}
