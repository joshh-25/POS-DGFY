// Plain pass-through props bundle for RetailOrderPage. Only real, already-existing shared
// state is threaded through here (cart display, store info, navigation, viewport) — matching
// the useSimpleCheckoutRouteProps.js precedent. Everything step-specific (account, fulfillment,
// payment) is intentionally local state owned by RetailOrderPage itself, since none of it is
// wired to the backend yet. Retail-only — the other default-like workflow modes keep using
// useDefaultOrderPageProps.js unmodified.
export function useRetailOrderPageProps({
  cart,
  cartCount,
  cartImageErrors,
  isDesktopCheckout,
  isMobileViewport,
  money,
  selectedStore,
  servicesBodyFont,
  servicesDisplayFont,
  goStoreCatalogPage,
  setCartImageErrors,
  withAssetOrigin
}) {
  return {
    cart,
    cartCount,
    cartImageErrors,
    isDesktopCheckout,
    isMobileViewport,
    money,
    selectedStore,
    servicesBodyFont,
    servicesDisplayFont,
    withAssetOrigin,
    onBackToCatalog: goStoreCatalogPage,
    onImageError: (itemId) => {
      const normalizedLineItemId = Number(itemId);
      if (!Number.isFinite(normalizedLineItemId)) return;
      setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
    }
  };
}
