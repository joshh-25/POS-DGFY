import { ChevronLeft, Wallet } from 'lucide-react';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { RetailOrderReviewItemsList } from './RetailOrderReviewItemsList.jsx';

// Placeholder payment options — not connected to the backend yet. See RetailOrderPage.jsx's
// doc comment. Cash is the only option, matching F&B/MSME.
const PLACEHOLDER_PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash on delivery/pickup' }
];

/** Structural placeholder for Retail's future online payment options — no gateway exists
 * behind it yet, so this is deliberately inert (no onClick, not a real payment option).
 * Remove once Retail gets a real online payment method. Mirrors F&B/MSME's equivalent
 * copy/layout, kept as this mode's own component per the "independent trees" pattern. */
function RetailOnlinePaymentPlaceholder() {
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

/**
 * Retail order page's Review & Payment step. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx's layout (payment selector +
 * cash info + online-payment placeholder + read-only item list). Payment type is
 * placeholder-only local state; the item list shows the real cart. "Place Order" submits
 * through the same shared handleCheckout used by F&B/MSME (see useCheckoutSubmission.js) —
 * on success it navigates to the shared tracking/pickup page (FnbTrackingRouteContainer).
 */
export function RetailOrderPaymentStep({
  cart = [],
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  isMobileViewport = false,
  money,
  onBack,
  onCheckout,
  onImageError,
  onPaymentTypeChange,
  paymentType = 'cash',
  servicesBodyFont,
  storefrontClosedNotice = null,
  withAssetOrigin
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 3: Review &amp; Payment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Review the cart, then choose a payment method.</div>
      <PaymentMethodSelectorBlock
        label="Payment Type"
        value={paymentType}
        onChange={onPaymentTypeChange}
        options={PLACEHOLDER_PAYMENT_OPTIONS}
        DropdownComponent={StorefrontDropdown}
        triggerStyle={{ minHeight: 44, borderRadius: 12 }}
        showCashInfo={paymentType === 'cash'}
        cashInfoAccent="#1a4e8d"
        bodyFont={servicesBodyFont}
      />
      <RetailOnlinePaymentPlaceholder />
      <RetailOrderReviewItemsList
        cart={cart}
        cartImageErrors={cartImageErrors}
        isMobileViewport={isMobileViewport}
        money={money}
        onImageError={onImageError}
        withAssetOrigin={withAssetOrigin}
      />
      {checkoutError && (
        <div style={{ border: '1px solid #fecaca', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 600, padding: '10px 14px' }}>
          {checkoutError}
        </div>
      )}
      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
          <button
            type="button"
            onClick={onCheckout}
            disabled={checkoutLoading}
            style={{ minHeight: 46, borderRadius: 12, border: 'none', background: checkoutLoading ? '#93b4d6' : '#1a4e8d', color: '#fff', fontWeight: 700, cursor: checkoutLoading ? 'wait' : 'pointer' }}
          >
            {checkoutLoading ? 'Placing Order...' : 'Place Order'}
          </button>
        </div>
      )}
      {storefrontClosedNotice}
    </section>
  );
}
