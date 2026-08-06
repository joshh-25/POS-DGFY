import { useCallback, useMemo } from 'react';

export function useSimpleCartDrawerProps({
  activeOrderMethodLabel,
  cart,
  cartCount,
  cartImageErrors,
  cartTotal,
  goStoreOrderPage,
  isCheckoutOpen,
  isMobileViewport,
  money,
  removeCartItem,
  servicesDisplayFont,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadowStrong,
  setCartImageErrors,
  setIsCheckoutOpen,
  updateQty,
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
      isOpen: isCheckoutOpen,
      isMobileViewport,
      onToggle: toggleDrawer
    },
    drawerSurfaceProps: {
      activeOrderMethodLabel,
      cart,
      cartCount,
      cartImageErrors,
      cartTotal,
      isMobileViewport,
      isOpen: isCheckoutOpen,
      money,
      onCheckout: goStoreOrderPage,
      onClose: closeDrawer,
      onImageError: handleImageError,
      onRemoveItem: removeCartItem,
      onUpdateQuantity: updateQty,
      servicesDisplayFont,
      servicesPrimary,
      servicesPrimaryDark,
      servicesPrimaryShadowStrong,
      withAssetOrigin
    }
  }), [
    activeOrderMethodLabel,
    cart,
    cartCount,
    cartImageErrors,
    cartTotal,
    closeDrawer,
    goStoreOrderPage,
    handleImageError,
    isCheckoutOpen,
    isMobileViewport,
    money,
    removeCartItem,
    servicesDisplayFont,
    servicesPrimary,
    servicesPrimaryDark,
    servicesPrimaryShadowStrong,
    toggleDrawer,
    updateQty,
    withAssetOrigin
  ]);
}
