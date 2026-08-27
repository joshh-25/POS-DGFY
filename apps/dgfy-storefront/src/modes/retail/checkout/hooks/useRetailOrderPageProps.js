import { RETAIL_ORDER_METHOD_OPTIONS } from '../components/RetailOrderFulfillmentStep.jsx';
import {
  buildStorefrontOrderMethodOptions,
  resolveLocationFulfillmentSupport
} from '../../../../shared/model/storefrontOrderMethodOptions.js';

// Plain pass-through props bundle for RetailOrderPage. Real, already-existing shared state is
// threaded through here: cart display, store info, navigation, viewport, the shared
// guest/DGFY-account identity + guest email OTP infrastructure (useGuestCustomerIdentity.js,
// useGuestCheckoutOtp.js), and the shared saved-address/map-pin infrastructure
// (useSignedInCheckoutAddresses.js, useDeliveryPinResolution.js) — all instantiated once in
// StorefrontApp.jsx and already consumed by F&B/MSME. Schedule mode/time and special
// instructions remain intentionally local state owned by RetailOrderPage itself, since neither
// is wired to the backend yet. Retail-only — the other default-like workflow modes keep using
// useDefaultOrderPageProps.js unmodified.
//
// #1093: also resolves `orderMethodOptions`, narrowing RETAIL_ORDER_METHOD_OPTIONS (the mode's
// delivery/pickup candidate set) down to what the customer's resolved fulfillment location
// actually supports -- mirrors the server's own checkout-time enforcement
// (assertCheckoutLocationOperationalReadiness, storeUseCases.js) so retail checkout never offers
// a method the server is about to 409 on.
export function useRetailOrderPageProps({
  canAddPinnedLocation,
  canUseGuestCheckoutFlow,
  guestCheckoutAllowed,
  cart,
  cartCount,
  cartImageErrors,
  customerEmail,
  customerName,
  customerPhone,
  customerPin,
  deliveryLocationAction,
  deliveryLocationDisplayAddress,
  deliverySavedLocations,
  goStoreCatalogPage,
  guestCheckoutOtpCode,
  guestCheckoutOtpCooldownLabel,
  guestCheckoutOtpError,
  guestCheckoutOtpLoading,
  guestCheckoutOtpVerified,
  handleAddPinnedLocation,
  handleApplyGuestDetailsAndRequestOtp,
  handleGuestCheckoutOtpCodeChange,
  handlePinMyLocation,
  handleRequestGuestCheckoutOtp,
  handleVerifyGuestCheckoutOtp,
  applySavedDeliveryLocation,
  isDesktopCheckout,
  isDgfyCustomerSignedIn,
  isGuestCheckoutOtpCooldownActive,
  isMobileViewport,
  money,
  orderMethod,
  promoDiscountSummaryRow,
  voucherDiscountSummaryRow,
  pinLocationError,
  pinLocationLoading,
  renderAccountOwnedIdentitySummary,
  renderBillingEmailPrompt,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  renderPromoCodePanel,
  renderStorefrontClosedNotice,
  selectedStore,
  selectedSavedLocationId,
  storeLocations,
  selectedLocationId,
  servicesBodyFont,
  servicesDisplayFont,
  setCartImageErrors,
  setCustomerPin,
  setDeliveryLocationAction,
  setOrderMethod,
  setPinLocationError,
  setResolvedDeliveryAddress,
  setSelectedSavedLocationId,
  setShowExpandedDeliveryMap,
  showExpandedDeliveryMap,
  storefrontClosedByHours,
  totalsForDisplay,
  withAssetOrigin,
  handleCheckout,
  checkoutLoading,
  checkoutError,
  // Phase 142 (#823): Retail's payment step was a local, disconnected cash-only placeholder --
  // wired to the same shared online-payment-session state F&B/MSME already coordinate on
  // through StorefrontApp.jsx (useFnbCheckoutRouteState.js), same rename convention already used
  // by useSimpleCheckoutRouteProps.js (handleConfirmQrphTestPayment -> onConfirmQrphTestPayment).
  fnbPaymentType,
  handlePaymentTypeChange,
  handleConfirmQrphTestPayment,
  qrphPaymentSession,
  qrphPaymentStatusLoading,
  resetQrphPaymentSession,
  // Phase 150 (#866): same coordination point as fnbPaymentType/handlePaymentTypeChange above --
  // StorefrontApp.jsx's paymentElection/setElected, threaded through unrenamed since there's no
  // legacy name to reconcile with here (unlike fnbPaymentType, this is new).
  paymentElection,
  onPaymentElectionChange
}) {
  const orderMethodOptions = buildStorefrontOrderMethodOptions(
    RETAIL_ORDER_METHOD_OPTIONS,
    resolveLocationFulfillmentSupport({ selectedStore, storeLocations, selectedLocationId })
  );

  return {
    canAddPinnedLocation,
    canUseGuestCheckoutFlow,
    guestCheckoutAllowed,
    cart,
    cartCount,
    cartImageErrors,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryLocationAction,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    handleAddPinnedLocation,
    handleApplyGuestDetailsAndRequestOtp,
    handleGuestCheckoutOtpCodeChange,
    handlePinMyLocation,
    handleRequestGuestCheckoutOtp,
    handleVerifyGuestCheckoutOtp,
    isDesktopCheckout,
    isDgfyCustomerSignedIn,
    isGuestCheckoutOtpCooldownActive,
    isMobileViewport,
    money,
    onSelectAddress: applySavedDeliveryLocation,
    orderMethod,
    orderMethodOptions,
    promoDiscountSummaryRow,
  voucherDiscountSummaryRow,
    pinLocationError,
    pinLocationLoading,
    renderAccountOwnedIdentitySummary,
    renderBillingEmailPrompt,
    renderGuestCheckoutEntry,
    renderGuestIdentityFields,
    renderPromoCodePanel,
    renderStorefrontClosedNotice,
    selectedStore,
    selectedSavedLocationId,
    servicesBodyFont,
    servicesDisplayFont,
    setCustomerPin,
    setDeliveryLocationAction,
    setOrderMethod,
    setPinLocationError,
    setResolvedDeliveryAddress,
    setSelectedSavedLocationId,
    setShowExpandedDeliveryMap,
    showExpandedDeliveryMap,
    storefrontClosedByHours,
    totalsForDisplay,
    withAssetOrigin,
    checkoutLoading,
    checkoutError,
    onBackToCatalog: goStoreCatalogPage,
    onCheckout: handleCheckout,
    paymentType: fnbPaymentType,
    onPaymentTypeChange: handlePaymentTypeChange,
    paymentElection,
    onPaymentElectionChange,
    onConfirmQrphTestPayment: handleConfirmQrphTestPayment,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    resetQrphPaymentSession,
    onImageError: (itemId) => {
      const normalizedLineItemId = Number(itemId);
      if (!Number.isFinite(normalizedLineItemId)) return;
      setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
    }
  };
}
