import { Wallet } from 'lucide-react';
import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { SimpleCheckoutPaymentActions } from './SimpleCheckoutPaymentActions.jsx';
import { SimpleCheckoutReviewItemsList } from './SimpleCheckoutReviewItemsList.jsx';

/** Structural placeholder for MSME's future online payment options — no gateway exists
 * behind it yet, so this is deliberately inert (no onClick, not a real payment option).
 * Remove once MSME gets a real online payment method. Mirrors F&B's equivalent copy/layout,
 * kept as MSME's own component per the "two independent checkout trees" decision. */
function SimpleOnlinePaymentPlaceholder() {
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

export function SimpleCheckoutPaymentStep({
  bodyFont,
  cart = [],
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  DropdownComponent,
  isMobileViewport = false,
  money,
  onImageError,
  paymentType = 'cash',
  paymentOptions = [],
  quoteError = '',
  quoteResult = null,
  requireQuoteForCheckout = false,
  selectedStore = null,
  simpleCheckoutAllowed = false,
  storefrontClosedNotice = null,
  withAssetOrigin,
  onBack,
  onCheckout,
  onPaymentTypeChange,
  onQuote
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 3: Review & Payment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Review the cart, refresh the quote when needed, then choose payment and submit the order.</div>
      <PaymentMethodSelectorBlock
        label="Payment Type"
        value={paymentType}
        onChange={onPaymentTypeChange}
        options={paymentOptions}
        DropdownComponent={DropdownComponent}
        triggerStyle={{ minHeight: 44, borderRadius: 12 }}
        showCashInfo={paymentType === 'cash'}
        cashInfoAccent="#0f766e"
        bodyFont={bodyFont}
      />
      <SimpleOnlinePaymentPlaceholder />
      <SimpleCheckoutReviewItemsList
        cart={cart}
        cartImageErrors={cartImageErrors}
        isMobileViewport={isMobileViewport}
        money={money}
        onImageError={onImageError}
        withAssetOrigin={withAssetOrigin}
      />
      <SimpleCheckoutPaymentActions
        cartItemCount={cart.length}
        checkoutError={checkoutError}
        checkoutLoading={checkoutLoading}
        isMobileViewport={isMobileViewport}
        quoteError={quoteError}
        quoteResult={quoteResult}
        requireQuoteForCheckout={requireQuoteForCheckout}
        selectedStore={selectedStore}
        simpleCheckoutAllowed={simpleCheckoutAllowed}
        storefrontClosedNotice={storefrontClosedNotice}
        onBack={onBack}
        onCheckout={onCheckout}
        onQuote={onQuote}
      />
    </section>
  );
}
