export const getCheckoutBlockReason = ({
  selectedStore = null,
  cartCount = 0,
  checkoutLoading = false,
  hasStockViolation = false,
  hasServiceCart = false,
  accessCapabilities = null,
  quoteResult = null,
  quoteNeedsRefresh = true
} = {}) => {
  if (!selectedStore) return 'missing_store';
  if (Number(cartCount) <= 0) return 'empty_cart';
  if (checkoutLoading) return 'checkout_loading';
  if (hasStockViolation) return 'stock_violation';
  if (hasServiceCart && accessCapabilities?.booking === false) return 'access_mode';
  if (!hasServiceCart && (accessCapabilities?.checkout === false || accessCapabilities?.quote === false)) return 'access_mode';
  if (hasServiceCart) return null;
  if (!quoteResult) return 'missing_quote';
  if (quoteNeedsRefresh) return 'stale_quote';
  return null;
};

export const canCheckout = (args = {}) => getCheckoutBlockReason(args) === null;
