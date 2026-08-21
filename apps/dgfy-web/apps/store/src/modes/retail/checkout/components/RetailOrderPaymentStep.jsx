import { ChevronLeft } from 'lucide-react';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { DownpaymentPaymentCallout } from '../../../../shared/components/checkout/DownpaymentPaymentCallout.jsx';
import { RetailOrderReviewItemsList } from './RetailOrderReviewItemsList.jsx';

/**
 * Retail order page's Review & Payment step. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx's layout (payment selector +
 * cash info / downpayment callout + online-payment panel + read-only item list). Wired to the
 * store's real `payment_capabilities` (Phase 142, #823) -- previously a hardcoded cash-only
 * placeholder list plus an inert "coming soon" online-payment card; see git history (this file,
 * pre-#823) for the exact prior shape. "Place Order"/"Pay downpayment" submits through
 * the same shared handleCheckout used by F&B/MSME (see useCheckoutSubmission.js) — on success it
 * navigates to the shared tracking/pickup page (FnbTrackingRouteContainer), same as before.
 */
export function RetailOrderPaymentStep({
  cart = [],
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  downpaymentDisplay = { active: false },
  isDeliveryOrder = false,
  isMobileViewport = false,
  money,
  onBack,
  onCheckout,
  onImageError,
  onlinePaymentPanel = null,
  onPaymentTypeChange,
  paymentOptions = [],
  paymentType = 'cash',
  servicesBodyFont,
  storefrontClosedNotice = null,
  withAssetOrigin
}) {
  const isDownpaymentActive = Boolean(downpaymentDisplay?.active);
  const submitLabel = isDownpaymentActive
    ? `Pay downpayment (${money(downpaymentDisplay.downpaymentAmount)})`
    : 'Place Order';
  const submitLoadingLabel = isDownpaymentActive ? 'Creating payment...' : 'Placing Order...';

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 3: Review &amp; Payment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Review the cart, then choose a payment method.</div>
      <PaymentMethodSelectorBlock
        label={isDownpaymentActive ? 'Pay downpayment with' : 'Payment Type'}
        value={paymentType}
        onChange={onPaymentTypeChange}
        options={paymentOptions}
        DropdownComponent={StorefrontDropdown}
        triggerStyle={{ minHeight: 44, borderRadius: 12 }}
        showCashInfo={!isDownpaymentActive && paymentType === 'cash'}
        cashInfoAccent="#1a4e8d"
        bodyFont={servicesBodyFont}
        downpaymentCallout={(
          <DownpaymentPaymentCallout
            accentColor="#1a4e8d"
            bodyFont={servicesBodyFont}
            display={downpaymentDisplay}
            money={money}
            orderMethod={isDeliveryOrder ? 'delivery' : 'pickup'}
          />
        )}
      />
      {onlinePaymentPanel}
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
          <button type="button" onClick={onBack} style={{ minHeight: isMobileViewport ? 44 : 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
          <button
            type="button"
            onClick={onCheckout}
            disabled={checkoutLoading}
            style={{ minHeight: isMobileViewport ? 44 : 46, borderRadius: 12, border: 'none', background: checkoutLoading ? '#93b4d6' : '#1a4e8d', color: '#fff', fontWeight: 700, cursor: checkoutLoading ? 'wait' : 'pointer' }}
          >
            {checkoutLoading ? submitLoadingLabel : submitLabel}
          </button>
        </div>
      )}
      {storefrontClosedNotice}
    </section>
  );
}
