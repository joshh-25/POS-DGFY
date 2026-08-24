/**
 * Shapes the Simple tracking runtime into the Simple route presentation
 * contract. Navigation and data fetching remain outside the page renderer.
 */
export function buildSimpleTrackingRouteProps({
  checkoutTab,
  copyTextToClipboard,
  formatTicketDate,
  getCompletedTrackingLabel,
  getTrackingFlowForOrderMethod,
  goStoreCatalogPage,
  isMobileViewport,
  money,
  primaryLocationId,
  routeSlug,
  selectedLocationId,
  selectedStore,
  selectedTrackingPin,
  servicesBodyFont,
  servicesDisplayFont,
  setCheckoutTab,
  showCompletedTrackingCard,
  storeLocations,
  storePath,
  tileTransformRequest,
  tilingServer,
  toSlug,
  trackingError,
  trackingPinInput,
  trackingResult,
  withAssetOrigin
}) {
  return {
    visible: checkoutTab === 'track',
    route: {
      displayFont: servicesDisplayFont,
      goStoreCatalogPage,
      isMobileViewport,
      routeSlug,
      selectedStore,
      storePath,
      toSlug,
      withAssetOrigin
    },
    page: {
      actions: { copyTextToClipboard, goStoreCatalogPage, setCheckoutTab },
      formatters: {
        formatTicketDate,
        money,
        servicesBodyFont,
        servicesDisplayFont,
        TILING_SERVER: tilingServer,
        tileTransformRequest
      },
      getCompletedTrackingLabel,
      getTrackingFlowForOrderMethod,
      isMobileViewport,
      presentation: {
        backLabel: 'Back to Items',
        returnToCatalog: true,
        showTrustStrip: false
      },
      primaryLocationId,
      selectedLocationId,
      selectedStore,
      selectedTrackingPin,
      showCompletedTrackingCard,
      storeLocations,
      trackingError,
      trackingPinInput,
      trackingResult,
      withAssetOrigin
    }
  };
}
