import { useMemo } from 'react';

/**
 * Keeps F&B cart drawer route prop assembly out of the app shell while cart
 * state itself remains shared at the current root level.
 *
 * #1732: `isActive` intentionally does NOT gate on `checkoutTab`. `isFnbMode`
 * resolves asynchronously (an async store-info fetch), so a cart-drawer open
 * clicked before it resolves can leave `checkoutTab` stuck on
 * `StorefrontCartFab`'s non-F&B branch (`'checkout'`) with nothing re-syncing
 * it until the next cart mutation. That's safe to ignore here: whenever
 * `isCheckoutOpen && isFnbMode && !isFnbOrderSubpage` is true, no value of
 * `checkoutTab` has a legitimate competing view to show (the checkout-form
 * mount requires `isFnbOrderSubpage`, and `'track'` is only ever set together
 * with it), so dropping the `checkoutTab === 'cart'` requirement doesn't
 * newly permit any overlap — it just stops depending on state that can be
 * transiently wrong for reasons unrelated to what should be on screen.
 */
export function useFnbCartDrawerRouteProps({
  cart,
  cartAddOnsTotal,
  cartCount,
  cartImageErrors,
  cartSubtotal,
  cartTotal,
  fnbOrderBrand,
  getLineTotal,
  goStoreCatalogPage,
  goStoreOrderPage,
  isDesktopCheckout,
  isFnbMode,
  isFnbOrderSubpage,
  isCheckoutOpen,
  isMobileViewport,
  money,
  onEditCartLine,
  removeCartItem,
  renderPromoCodePanel,
  servicesBodyFont,
  setCartImageErrors,
  setIsCheckoutOpen,
  updateQty,
  promoDiscountAmount = 0,
  promoDiscountLabel = '',
  isQuoteStale = false,
  voucherDiscountAmount = 0,
  withAssetOrigin
}) {
  return useMemo(() => ({
    cart,
    cartAddOnsTotal,
    cartCount,
    cartImageErrors,
    cartSubtotal,
    cartTotal,
    fnbOrderBrand,
    getLineTotal,
    goStoreCatalogPage,
    goStoreOrderPage,
    isActive: Boolean(isCheckoutOpen && isFnbMode && !isFnbOrderSubpage),
    isDesktopCheckout,
    isMobileViewport,
    money,
    onEditCartLine,
    removeCartItem,
    renderPromoCodePanel,
    servicesBodyFont,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    promoDiscountAmount,
    promoDiscountLabel,
    isQuoteStale,
    voucherDiscountAmount,
    withAssetOrigin
  }), [
    cart,
    cartAddOnsTotal,
    cartCount,
    cartImageErrors,
    cartSubtotal,
    cartTotal,
    fnbOrderBrand,
    getLineTotal,
    goStoreCatalogPage,
    goStoreOrderPage,
    isDesktopCheckout,
    isFnbMode,
    isFnbOrderSubpage,
    isCheckoutOpen,
    isMobileViewport,
    money,
    onEditCartLine,
    removeCartItem,
    renderPromoCodePanel,
    servicesBodyFont,
    setCartImageErrors,
    setIsCheckoutOpen,
    updateQty,
    promoDiscountAmount,
    promoDiscountLabel,
    isQuoteStale,
    voucherDiscountAmount,
    withAssetOrigin
  ]);
}
