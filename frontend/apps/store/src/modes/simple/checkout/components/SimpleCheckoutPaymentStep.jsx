import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { SimpleCheckoutPaymentActions } from './SimpleCheckoutPaymentActions.jsx';
import { SimpleCheckoutReviewItemsList } from './SimpleCheckoutReviewItemsList.jsx';

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
