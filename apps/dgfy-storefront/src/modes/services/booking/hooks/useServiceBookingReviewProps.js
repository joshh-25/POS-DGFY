/**
 * Moved verbatim from `StorefrontApp.jsx`: bundles the runtime values and
 * handlers consumed by the "Review Your Booking" summary card (now
 * `ServiceBookingReviewContainer`). Pure pass-through bundle - every value
 * already has a stable identity from its own upstream state/hook, so no
 * memoization is needed here (matches `useCheckoutTotalsAndGating`'s
 * precedent of returning a plain object).
 */
export function useServiceBookingReviewProps({
  cartImageErrors,
  cartTotal,
  firstServiceLine,
  isDesktopCheckout,
  isMobileViewport,
  money,
  openServiceCartEditor,
  removeCartItem,
  serviceBookingSummarySchedule,
  serviceIntakeFields,
  serviceIntakeResponses,
  servicePaymentOptions,
  servicePaymentTiming,
  servicesPrimary,
  servicesPrimaryDark,
  servicesDisplayFont,
  setCartImageErrors,
  setCheckoutTab,
  withAssetOrigin
}) {
  return {
    cartImageErrors,
    cartTotal,
    firstServiceLine,
    isDesktopCheckout,
    isMobileViewport,
    money,
    openServiceCartEditor,
    removeCartItem,
    serviceBookingSummarySchedule,
    serviceIntakeFields,
    serviceIntakeResponses,
    servicePaymentOptions,
    servicePaymentTiming,
    servicesPrimary,
    servicesPrimaryDark,
    servicesDisplayFont,
    setCartImageErrors,
    setCheckoutTab,
    withAssetOrigin
  };
}
