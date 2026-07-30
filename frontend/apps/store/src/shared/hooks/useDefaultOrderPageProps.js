// Plain pass-through props bundle for DefaultOrderPage. Only real, already-existing shared
// state is threaded through here (cart display, store info, navigation, viewport) — matching
// the useSimpleCheckoutRouteProps.js precedent. Everything step-specific (account, fulfillment,
// payment) is intentionally local state owned by DefaultOrderPage itself, since none of it is
// wired to the backend yet.
export function useDefaultOrderPageProps({
  cart,
  cartCount,
  isMobileViewport,
  money,
  selectedStore,
  servicesBodyFont,
  servicesDisplayFont,
  goStoreCatalogPage,
  withAssetOrigin
}) {
  return {
    cart,
    cartCount,
    isMobileViewport,
    money,
    selectedStore,
    servicesBodyFont,
    servicesDisplayFont,
    withAssetOrigin,
    onBackToCatalog: goStoreCatalogPage
  };
}
