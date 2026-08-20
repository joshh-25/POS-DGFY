import { useCallback, useMemo } from 'react';

export function useSimpleCartDrawerProps({
  activeOrderMethodLabel,
  cart,
  cartCount,
  cartImageErrors,
  cartSubtotal,
  cartTotal,
  goStoreCatalogPage,
  goStoreOrderPage,
  isCheckoutOpen,
  isMobileViewport,
  money,
  removeCartItem,
  renderPromoCodePanel,
  serviceCartFabRef,
  servicesBodyFont,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadowStrong,
  setCartImageErrors,
  setIsCheckoutOpen,
  updateQty,
  promoDiscountAmount = 0,
  promoDiscountLabel = '',
  quoteNeedsRefresh = false,
  voucherDiscountAmount = 0,
  withAssetOrigin
}) {
  const closeDrawer = useCallback(() => {
    setIsCheckoutOpen(false);
  }, [setIsCheckoutOpen]);

  const toggleDrawer = useCallback(() => {
    setIsCheckoutOpen((previous) => !previous);
  }, [setIsCheckoutOpen]);

  const handleImageError = useCallback((itemId) => {
    const normalizedLineItemId = Number(itemId);
    if (!Number.isFinite(normalizedLineItemId)) return;

    setCartImageErrors((previous) => {
      const next = new Set(previous);
      next.add(normalizedLineItemId);
      return next;
    });
  }, [setCartImageErrors]);

  return useMemo(() => ({
    floatingButtonProps: {
      cartCount,
      fabRef: serviceCartFabRef,
      isOpen: isCheckoutOpen,
      isMobileViewport,
      onToggle: toggleDrawer
    },
    drawerSurfaceProps: {
      activeOrderMethodLabel,
      cart,
      cartCount,
      cartImageErrors,
      cartSubtotal,
      cartTotal,
      goStoreCatalogPage,
      isMobileViewport,
      isOpen: isCheckoutOpen,
      money,
      onCheckout: goStoreOrderPage,
      onClose: closeDrawer,
      onImageError: handleImageError,
      onRemoveItem: removeCartItem,
      onUpdateQuantity: updateQty,
      renderPromoCodePanel,
      servicesBodyFont,
      servicesPrimary,
      servicesPrimaryDark,
      servicesPrimaryShadowStrong,
      promoDiscountAmount,
      promoDiscountLabel,
      quoteNeedsRefresh,
      voucherDiscountAmount,
      withAssetOrigin
    }
  }), [
    activeOrderMethodLabel,
    cart,
    cartCount,
    cartImageErrors,
    cartSubtotal,
    cartTotal,
    closeDrawer,
    goStoreCatalogPage,
    goStoreOrderPage,
    handleImageError,
    isCheckoutOpen,
    isMobileViewport,
    money,
    removeCartItem,
    renderPromoCodePanel,
    serviceCartFabRef,
    servicesBodyFont,
    servicesPrimary,
    servicesPrimaryDark,
    servicesPrimaryShadowStrong,
    toggleDrawer,
    updateQty,
    promoDiscountAmount,
    promoDiscountLabel,
    quoteNeedsRefresh,
    voucherDiscountAmount,
    withAssetOrigin
  ]);
}
