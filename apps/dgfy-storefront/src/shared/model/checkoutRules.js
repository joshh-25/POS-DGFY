export const getCheckoutBlockReason = ({
  selectedStore = null,
  cartCount = 0,
  checkoutLoading = false,
  hasStockViolation = false,
  hasServiceCart = false,
  accessCapabilities = null,
  quoteResult = null,
  quoteNeedsRefresh = true,
  requireQuote = true,
  // Phase 150 (#866): the customer's pay-in-full-vs-downpayment election, only meaningful at a
  // payment_mode='customer_choice' store. Every existing caller (full_payment/downpayment_required)
  // omits this and is unaffected -- see the guard below.
  paymentElection = null
} = {}) => {
  if (!selectedStore) return 'missing_store';
  if (Number(cartCount) <= 0) return 'empty_cart';
  if (checkoutLoading) return 'checkout_loading';
  if (hasStockViolation) return 'stock_violation';
  if (selectedStore?.storefront_hours_status?.is_open_now === false) return 'business_hours';
  if (hasServiceCart && accessCapabilities?.booking === false) return 'access_mode';
  if (!hasServiceCart && (accessCapabilities?.checkout === false || accessCapabilities?.quote === false)) return 'access_mode';
  if (hasServiceCart) return null;
  if (!requireQuote) return null;
  if (!quoteResult) return 'missing_quote';
  if (quoteNeedsRefresh) return 'stale_quote';
  // Phase 142 (#823): a voucher/promo can fully discount a downpayment-required order to zero --
  // the backend then resolves the quote to full_payment (nothing to capture) while the catalog
  // still says downpayment_required, so cash stays hidden with no path to place the order at all.
  // Caught here rather than left as a dead end: block with a specific, actionable reason instead
  // of silently letting Place Order do nothing (or worse, appear enabled with no valid payment
  // option showing).
  //
  // Phase 150 (#866): widened to customer_choice + an actual 'downpayment' election -- the
  // identical dead end exists there. A customer_choice store with election 'full' is NEVER this
  // guard's business: quoteResult.payment_mode correctly reads full_payment for that election by
  // design (see downpaymentPolicy.js's resolveDownpaymentForTotal), so it must not trip here.
  const expectsDownpaymentCapture = selectedStore?.payment_mode === 'downpayment_required'
    || (selectedStore?.payment_mode === 'customer_choice' && paymentElection === 'downpayment');
  if (
    expectsDownpaymentCapture
    && quoteResult.payment_mode !== 'downpayment_required'
    && Number(quoteResult.total_amount) <= 0
  ) {
    return 'downpayment_zero_total';
  }
  return null;
};

export const canCheckout = (args = {}) => getCheckoutBlockReason(args) === null;
