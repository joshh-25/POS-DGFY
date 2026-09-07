/**
 * Shapes the shared tracking drawer contract for the Simple storefront.
 * The drawer presentation remains shared; Simple's tracking adapter and full
 * tracking route remain owned by this mode.
 */
export function buildSimpleTrackingDrawerProps({
  canOpenTrackingDrawer,
  isAccountTracking,
  isMobileViewport,
  isOpen,
  isStandaloneTrackingPage,
  money,
  onClose,
  openFullTrackingForPin,
  trackingDrawerOrders,
  selectedStore,
  withAssetOrigin
}) {
  return {
    canOpen: canOpenTrackingDrawer && !isStandaloneTrackingPage,
    isAccountTracking,
    isMobileViewport,
    isOpen,
    money,
    onClose,
    openFullTrackingForPin,
    orders: trackingDrawerOrders,
    selectedStore,
    withAssetOrigin
  };
}
