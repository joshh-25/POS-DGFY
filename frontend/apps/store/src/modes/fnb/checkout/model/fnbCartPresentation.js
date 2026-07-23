export function buildFnbCartStatusLabel({
  cartCount,
  storefrontClosedByHours,
  hasStockViolation,
  isFnbMode,
  quoteResult,
  quoteNeedsRefresh,
  checkoutAllowed
}) {
  if (cartCount === 0) return 'Browse menu';
  if (storefrontClosedByHours) return 'Closed';
  if (hasStockViolation) return 'Update quantities';
  if (isFnbMode && (!quoteResult || quoteNeedsRefresh)) return 'Updating totals';
  if (!quoteResult) return 'Quote required';
  if (quoteNeedsRefresh) return 'Refresh quote';
  if (checkoutAllowed) return 'Ready to checkout';
  return 'Review order';
}

export function buildFnbCartActionLabel({
  cartCount,
  isCheckoutOpen,
  hasStockViolation,
  isFnbMode,
  isMobileViewport,
  quoteResult,
  quoteNeedsRefresh
}) {
  if (cartCount === 0) return 'Browse menu';
  if (isCheckoutOpen) return 'Close cart';
  if (hasStockViolation) return 'Review cart';
  if (isFnbMode) return isMobileViewport ? 'Checkout' : 'View cart and checkout';
  if (!quoteResult || quoteNeedsRefresh) return 'Review and quote';
  return isMobileViewport ? 'Checkout' : 'View cart and checkout';
}

export function buildFnbDrawerSupportLabel({
  cartCount,
  storefrontClosedByHours,
  storefrontClosedMessageBody,
  hasStockViolation,
  isFnbMode,
  quoteResult,
  quoteNeedsRefresh
}) {
  if (cartCount === 0) return 'Add menu items to start an order.';
  if (storefrontClosedByHours) {
    return storefrontClosedMessageBody;
  }
  if (hasStockViolation) return 'Adjust quantities that exceed available stock before checkout.';
  if (isFnbMode && (!quoteResult || quoteNeedsRefresh)) return 'Totals update automatically before you place the order.';
  if (!quoteResult) return 'Review the cart, then request a fresh quote before checkout.';
  if (quoteNeedsRefresh) return 'Cart changed. Refresh the quote to sync totals and enable checkout.';
  return 'Everything is synced. You can continue through checkout.';
}
