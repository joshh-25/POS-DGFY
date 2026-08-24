/**
 * Shapes the shared tracking drawer contract for the Simple storefront.
 * The drawer presentation remains shared; Simple's tracking adapter and full
 * tracking route remain owned by this mode.
 */
export function buildSimpleTrackingDrawerProps({
  canOpenTrackingDrawer,
  expandedPins,
  isAccountTracking,
  isMobileViewport,
  isOpen,
  isStandaloneTrackingPage,
  money,
  onClose,
  onExpandedPinsChange,
  openFullTrackingForPin,
  trackingDrawerOrders,
  selectedStore,
  withAssetOrigin
}) {
  return {
    canOpen: canOpenTrackingDrawer && !isStandaloneTrackingPage,
    expandedPins,
    isAccountTracking,
    isMobileViewport,
    isOpen,
    money,
    onClose,
    onExpandedPinsChange,
    openFullTrackingForPin,
    orders: trackingDrawerOrders,
    selectedStore,
    withAssetOrigin
  };
}
