import { useCallback, useMemo } from 'react';

/**
 * Props bundle for the Default/Retail mode's own DefaultProductCartFab/DefaultProductCartDrawer
 * pair. Mirrors modes/simple/checkout/hooks/useSimpleCartDrawerProps.js's shape, reusing the
 * same shared, mode-agnostic cart state/handlers (cart, removeCartItem, updateQty, etc.) that
 * already exist in StorefrontApp.jsx — no new state, no backend change.
 *
 * `onCheckout` navigates to the Default/Retail order page (`goStoreOrderPage`, the same
 * mode-agnostic pushState navigation F&B/MSME already use) — navigation only, no backend call.
 */
export function useDefaultProductCartDrawerProps({
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
    toggleDrawer,
    updateQty,
    withAssetOrigin
  ]);
}
