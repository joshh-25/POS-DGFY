import { applyDeliveryAddressFieldChange, buildSearchSelectedPin, resolveAddressSearchBias } from '../../../../features/locations/utils/pinnedDeliveryAddress.js';
import { resolveLocationFulfillmentSupport } from '../../../../shared/model/storefrontOrderMethodOptions.js';
import { resolveOrderTimingPolicy } from '../../../../shared/model/storefrontOrderTimingPolicy.js';

export function useSimpleCheckoutRouteProps({
  applySavedDeliveryLocation,
  canAddPinnedLocation = false,
  canUseGuestCheckoutFlow = false,
  guestCheckoutAllowed = true,
  cart = [],
  cartCount = 0,
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  checkoutResult = null,
  customerAddress = '',
  customerEmail = '',
  customerName = '',
  customerPhone = '',
  customerPin = null,
  deliveryLocationAction = 'saved',
  deliveryLocationDisplayAddress = '',
  deliverySavedLocations = [],
  DropdownComponent,
  fnbPaymentType = 'cash',
  fnbScheduleMode = 'asap',
  fnbScheduledFor = '',
  fnbSpecialInstructions = '',
  goStoreCatalogPage,
  guestCheckoutOtpCode = '',
  guestCheckoutOtpCooldownLabel = '',
  guestCheckoutOtpError = '',
  guestCheckoutOtpLoading = false,
  guestCheckoutOtpVerified = false,
  handleAddPinnedLocation,
  handleApplyGuestDetailsAndRequestOtp,
  handleCheckout,
  handleDownloadCheckoutImage,
  handleGuestCheckoutOtpCodeChange,
  handlePaymentTypeChange,
  handleConfirmQrphTestPayment,
  handleCancelQrphPaymentSession,
  handlePinMyLocation,
  handleRemoveDeliveryAddress,
  handleRequestGuestCheckoutOtp,
  handleSetDefaultDeliveryAddress,
  handleVerifyGuestCheckoutOtp,
  onSignInToCheckout,
  isDeliveryOrder = false,
  isDesktopCheckout = false,
  isDgfyCustomerSignedIn = false,
  isGuestCheckoutOtpCooldownActive = false,
  isMobileViewport = false,
  money,
  onPaymentElectionChange,
  orderMethod = 'delivery',
  paymentElection = 'full',
  pinLocationError = '',
  pinLocationLoading = false,
  promoDiscountSummaryRow = null,
  voucherDiscountSummaryRow = null,
  qrphPaymentSession = null,
  qrphPaymentStatusLoading = false,
  cancellingPaymentSession = false,
  renderAccountOwnedIdentitySummary,
  renderBillingEmailPrompt,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  renderPromoCodePanel,
  renderStorefrontClosedNotice,
  resolvingPinnedDeliveryAddress = false,
  selectedLocation = null,
  selectedLocationId = null,
  selectedSavedLocationId = '',
  selectedStore = null,
  servicesBodyFont,
  servicesDisplayFont,
  setCartImageErrors,
  setCheckoutResult,
  setCustomerAddress,
  setCustomerPin,
  setDeliveryLocationAction,
  setFnbScheduledFor,
  setFnbScheduleMode,
  setFnbSpecialInstructions,
  setOrderMethod,
  setPinLocationError,
  setResolvedDeliveryAddress,
  setSelectedLocationId,
  setSelectedSavedLocationId,
  setShowExpandedDeliveryMap,
  setShowSimpleMobileAddressModal,
  setShowSimpleMobileOrderSummary,
  setSimpleOrderStep,
  resetQrphPaymentSession,
  showExpandedDeliveryMap = false,
  showSimpleMobileAddressModal = false,
  showSimpleMobileOrderSummary = false,
  simpleCheckoutAllowed = false,
  simpleCustomerStepComplete = false,
  simpleHasCustomerIdentity = false,
  simpleHasPrimaryIdentityContact = false,
  simpleOrderMethodOptions = [],
  simpleOrderStep = 1,
  simpleStepOneReady = false,
  storefrontClosedByHours = false,
  storeLocations = [],
  totalsForDisplay,
  withAssetOrigin
}) {
  const fulfillmentLocation = resolveLocationFulfillmentSupport({ selectedStore, storeLocations, selectedLocationId });
  const orderTimingPolicy = resolveOrderTimingPolicy(fulfillmentLocation);
  const startMapPin = () => {
    setDeliveryLocationAction('map');
    setSelectedSavedLocationId('');
    setPinLocationError('');
    setResolvedDeliveryAddress('');
    setCustomerAddress('');
    setCustomerPin(null);
  };
  return {
    addressSearchBias: resolveAddressSearchBias(fulfillmentLocation, customerPin),
    canAddPinnedLocation,
    canUseGuestCheckoutFlow,
    guestCheckoutAllowed,
    cart,
    cartCount,
    cartImageErrors,
    checkoutError,
    checkoutLoading,
    checkoutResult,
    customerAddress,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryLocationAction,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    DropdownComponent,
    fnbPaymentType,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    isDeliveryOrder,
    isDesktopCheckout,
    isDgfyCustomerSignedIn,
    isGuestCheckoutOtpCooldownActive,
    isMobileViewport,
    money,
    orderMethod,
    paymentElection,
    pinLocationError,
    pinLocationLoading,
    promoDiscountSummaryRow,
    voucherDiscountSummaryRow,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    renderAccountOwnedIdentitySummary,
    renderBillingEmailPrompt,
    renderGuestCheckoutEntry,
    renderGuestIdentityFields,
    renderPromoCodePanel,
    renderStorefrontClosedNotice,
    resolvingPinnedDeliveryAddress,
    selectedLocation,
    selectedLocationId,
    selectedSavedLocationId,
    selectedStore,
    orderTimingPolicy,
    servicesBodyFont,
    servicesDisplayFont,
    setDeliveryLocationAction,
    setSelectedSavedLocationId,
    setShowExpandedDeliveryMap,
    setShowSimpleMobileAddressModal,
    setShowSimpleMobileOrderSummary,
    showExpandedDeliveryMap,
    showSimpleMobileAddressModal,
    showSimpleMobileOrderSummary,
    simpleCheckoutAllowed,
    simpleCustomerStepComplete,
    simpleHasCustomerIdentity,
    simpleHasPrimaryIdentityContact,
    simpleOrderMethodOptions,
    simpleOrderStep,
    simpleStepOneReady,
    storefrontClosedByHours,
    storeLocations,
    totalsForDisplay,
    withAssetOrigin,
    onApplyGuestDetailsAndRequestOtp: handleApplyGuestDetailsAndRequestOtp,
    onBackToCatalog: goStoreCatalogPage,
    onCheckout: handleCheckout,
    onCustomerAddressChange: (value) => applyDeliveryAddressFieldChange(value, {
      setCustomerAddress,
      clearDeliveryLocation: startMapPin
    }),
    onDownloadCheckoutImage: handleDownloadCheckoutImage,
    onGuestCheckoutOtpCodeChange: handleGuestCheckoutOtpCodeChange,
    onOrderMethodChange: (nextOrderMethod) => {
      setOrderMethod(nextOrderMethod);
      setPinLocationError('');
    },
    onAddPinnedLocation: handleAddPinnedLocation,
    onCloseExpandedMap: () => setShowExpandedDeliveryMap(false),
    onImageError: (itemId) => {
      const normalizedLineItemId = Number(itemId);
      if (!Number.isFinite(normalizedLineItemId)) return;
      setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
    },
    onOpenExpandedMap: () => setShowExpandedDeliveryMap(true),
    onPaymentElectionChange,
    onPaymentTypeChange: handlePaymentTypeChange,
    onConfirmQrphTestPayment: handleConfirmQrphTestPayment,
    onCancelQrphPaymentSession: handleCancelQrphPaymentSession,
    cancellingPaymentSession,
    onPinChange: (nextPin) => {
      setDeliveryLocationAction('map');
      setSelectedSavedLocationId('');
      setCustomerPin(nextPin);
    },
    onPinClear: () => setCustomerPin(null),
    onPinMyLocation: handlePinMyLocation,
    onRemoveDeliveryAddress: handleRemoveDeliveryAddress,
    onRequestGuestCheckoutOtp: handleRequestGuestCheckoutOtp,
    onVerifyGuestCheckoutOtp: handleVerifyGuestCheckoutOtp,
    onSignInToCheckout,
    onScheduleModeChange: (nextMode) => {
      setFnbScheduleMode(nextMode);
      if (nextMode === 'asap' || nextMode === 'anytime') setFnbScheduledFor('');
    },
    onScheduledForChange: (nextScheduledFor) => {
      setFnbScheduledFor(nextScheduledFor);
      setFnbScheduleMode('schedule');
    },
    onSelectAddress: (location) => {
      applySavedDeliveryLocation(location);
      if (typeof handleSetDefaultDeliveryAddress === 'function' && !location.isDefault) {
        handleSetDefaultDeliveryAddress(location);
      }
    },
    // #759: choosing an address-search suggestion drops the pin there; its address line rides on
    // the pin so useDeliveryPinResolution keeps it instead of reverse-geocoding the point.
    onSelectSearchResult: (result) => {
      setDeliveryLocationAction('map');
      setSelectedSavedLocationId('');
      setPinLocationError('');
      setCustomerPin(buildSearchSelectedPin(result));
    },
    onSelectedLocationChange: setSelectedLocationId,
    onSetCheckoutResult: setCheckoutResult,
    onSetDefaultDeliveryAddress: handleSetDefaultDeliveryAddress,
    onSetSimpleOrderStep: setSimpleOrderStep,
    resetQrphPaymentSession,
    onSpecialInstructionsChange: setFnbSpecialInstructions,
    onStartMapPin: startMapPin
  };
}
