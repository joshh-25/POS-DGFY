import { useEffect } from 'react';

import { readRouteSlug, readStoreLocationId } from '../../app/routing/storefrontRouting.js';
import { useStorefrontStore } from '../../store/useStorefrontStore.js';

const useCheckoutField = (field, suffix) => [
  useStorefrontStore((state) => state.checkout[field]),
  useStorefrontStore((state) => state[`checkoutSet${suffix}`])
];

/**
 * useState-compatible access to checkout draft and quote state.
 *
 * The field names intentionally match the shell's existing local names so
 * checkout hooks and mode route props do not need a second migration at the
 * same time. Business rules remain in the existing checkout hooks.
 */
export function useStorefrontCheckoutState() {
  const [elected, setElected] = useCheckoutField('elected', 'Elected');
  const [checkoutPromoCode, setCheckoutPromoCode] = useCheckoutField('promoCode', 'PromoCode');
  const [checkoutVoucherCode, setCheckoutVoucherCode] = useCheckoutField('voucherCode', 'VoucherCode');
  const [preferredStoreLocationSelection, setPreferredStoreLocationSelection] = useCheckoutField('preferredStoreLocationSelection', 'PreferredStoreLocationSelection');
  const [orderMethod, setOrderMethod] = useCheckoutField('orderMethod', 'OrderMethod');
  const [guestCheckoutUnlocked, setGuestCheckoutUnlocked] = useCheckoutField('guestCheckoutUnlocked', 'GuestCheckoutUnlocked');
  const [rememberCustomerDetails, setRememberCustomerDetails] = useCheckoutField('rememberCustomerDetails', 'RememberCustomerDetails');
  const [guestDetailsEditMode, setGuestDetailsEditMode] = useCheckoutField('guestDetailsEditMode', 'GuestDetailsEditMode');
  const [isUsingDifferentGuestDetails, setIsUsingDifferentGuestDetails] = useCheckoutField('isUsingDifferentGuestDetails', 'IsUsingDifferentGuestDetails');
  const [customerAddress, setCustomerAddress] = useCheckoutField('customerAddress', 'CustomerAddress');
  const [serviceLocationLandmarkNote, setServiceLocationLandmarkNote] = useCheckoutField('serviceLocationLandmarkNote', 'ServiceLocationLandmarkNote');
  const [serviceUnitType, setServiceUnitType] = useCheckoutField('serviceUnitType', 'ServiceUnitType');
  const [customerPin, setCustomerPin] = useCheckoutField('customerPin', 'CustomerPin');
  const [resolvedDeliveryAddress, setResolvedDeliveryAddress] = useCheckoutField('resolvedDeliveryAddress', 'ResolvedDeliveryAddress');
  const [resolvingPinnedDeliveryAddress, setResolvingPinnedDeliveryAddress] = useCheckoutField('resolvingPinnedDeliveryAddress', 'ResolvingPinnedDeliveryAddress');
  const [deliveryLocationAction, setDeliveryLocationAction] = useCheckoutField('deliveryLocationAction', 'DeliveryLocationAction');
  const [showExpandedDeliveryMap, setShowExpandedDeliveryMap] = useCheckoutField('showExpandedDeliveryMap', 'ShowExpandedDeliveryMap');
  const [savedPinnedLocations, setSavedPinnedLocations] = useCheckoutField('savedPinnedLocations', 'SavedPinnedLocations');
  const [selectedSavedLocationId, setSelectedSavedLocationId] = useCheckoutField('selectedSavedLocationId', 'SelectedSavedLocationId');
  const [serviceAppointmentAt, setServiceAppointmentAt] = useCheckoutField('serviceAppointmentAt', 'ServiceAppointmentAt');
  const [servicePaymentTiming, setServicePaymentTiming] = useCheckoutField('servicePaymentTiming', 'ServicePaymentTiming');
  const [servicePaymentPreviewMethod, setServicePaymentPreviewMethod] = useCheckoutField('servicePaymentPreviewMethod', 'ServicePaymentPreviewMethod');
  const [servicePaymentPreviewCard, setServicePaymentPreviewCard] = useCheckoutField('servicePaymentPreviewCard', 'ServicePaymentPreviewCard');
  const [servicePaymentPreviewReceiptName, setServicePaymentPreviewReceiptName] = useCheckoutField('servicePaymentPreviewReceiptName', 'ServicePaymentPreviewReceiptName');
  const [serviceIntakeResponses, setServiceIntakeResponses] = useCheckoutField('serviceIntakeResponses', 'ServiceIntakeResponses');
  const [pinLocationLoading, setPinLocationLoading] = useCheckoutField('pinLocationLoading', 'PinLocationLoading');
  const [pinLocationError, setPinLocationError] = useCheckoutField('pinLocationError', 'PinLocationError');
  const [quoteResult, setQuoteResult] = useCheckoutField('quoteResult', 'QuoteResult');
  const [quoteNeedsRefresh, setQuoteNeedsRefresh] = useCheckoutField('quoteNeedsRefresh', 'QuoteNeedsRefresh');
  const [quoteError, setQuoteError] = useCheckoutField('quoteError', 'QuoteError');
  const [quotedCartSignature, setQuotedCartSignature] = useCheckoutField('quotedCartSignature', 'QuotedCartSignature');
  const [checkoutResult, setCheckoutResult] = useCheckoutField('checkoutResult', 'CheckoutResult');
  const [checkoutError, setCheckoutError] = useCheckoutField('checkoutError', 'CheckoutError');
  const [checkoutLoading, setCheckoutLoading] = useCheckoutField('checkoutLoading', 'CheckoutLoading');
  const [isCheckoutOpen, setIsCheckoutOpen] = useCheckoutField('isCheckoutOpen', 'IsCheckoutOpen');
  const [checkoutTab, setCheckoutTab] = useCheckoutField('checkoutTab', 'CheckoutTab');
  const [pendingOrderInitialTab, setPendingOrderInitialTab] = useCheckoutField('pendingOrderInitialTab', 'PendingOrderInitialTab');
  const [hasAppliedCheckoutAuthResume, setHasAppliedCheckoutAuthResume] = useCheckoutField('hasAppliedCheckoutAuthResume', 'HasAppliedCheckoutAuthResume');
  const [simpleOrderStep, setSimpleOrderStep] = useCheckoutField('simpleOrderStep', 'SimpleOrderStep');
  const [showSimpleMobileOrderSummary, setShowSimpleMobileOrderSummary] = useCheckoutField('showSimpleMobileOrderSummary', 'ShowSimpleMobileOrderSummary');
  const [showSimpleMobileAddressModal, setShowSimpleMobileAddressModal] = useCheckoutField('showSimpleMobileAddressModal', 'ShowSimpleMobileAddressModal');

  // The store is a module singleton, while the route can be established after
  // the module is imported (including direct links and browser-history
  // navigation). Hydrate the location preference from the current URL once the
  // shell has rendered, preserving the former per-mount useState initializer.
  const routeSlug = readRouteSlug();
  const routeLocationId = readStoreLocationId();
  useEffect(() => {
    if (!routeSlug || routeLocationId == null) return;
    const currentSlug = String(preferredStoreLocationSelection?.slug || '').trim();
    const currentLocationId = preferredStoreLocationSelection?.locationId;
    if (currentSlug === routeSlug && Number(currentLocationId) === Number(routeLocationId)) return;
    setPreferredStoreLocationSelection({ slug: routeSlug, locationId: routeLocationId });
  }, [preferredStoreLocationSelection, routeLocationId, routeSlug, setPreferredStoreLocationSelection]);

  return {
    elected,
    setElected,
    checkoutPromoCode,
    setCheckoutPromoCode,
    checkoutVoucherCode,
    setCheckoutVoucherCode,
    preferredStoreLocationSelection,
    setPreferredStoreLocationSelection,
    orderMethod,
    setOrderMethod,
    guestCheckoutUnlocked,
    setGuestCheckoutUnlocked,
    rememberCustomerDetails,
    setRememberCustomerDetails,
    guestDetailsEditMode,
    setGuestDetailsEditMode,
    isUsingDifferentGuestDetails,
    setIsUsingDifferentGuestDetails,
    customerAddress,
    setCustomerAddress,
    serviceLocationLandmarkNote,
    setServiceLocationLandmarkNote,
    serviceUnitType,
    setServiceUnitType,
    customerPin,
    setCustomerPin,
    resolvedDeliveryAddress,
    setResolvedDeliveryAddress,
    resolvingPinnedDeliveryAddress,
    setResolvingPinnedDeliveryAddress,
    deliveryLocationAction,
    setDeliveryLocationAction,
    showExpandedDeliveryMap,
    setShowExpandedDeliveryMap,
    savedPinnedLocations,
    setSavedPinnedLocations,
    selectedSavedLocationId,
    setSelectedSavedLocationId,
    serviceAppointmentAt,
    setServiceAppointmentAt,
    servicePaymentTiming,
    setServicePaymentTiming,
    servicePaymentPreviewMethod,
    setServicePaymentPreviewMethod,
    servicePaymentPreviewCard,
    setServicePaymentPreviewCard,
    servicePaymentPreviewReceiptName,
    setServicePaymentPreviewReceiptName,
    serviceIntakeResponses,
    setServiceIntakeResponses,
    pinLocationLoading,
    setPinLocationLoading,
    pinLocationError,
    setPinLocationError,
    quoteResult,
    setQuoteResult,
    quoteNeedsRefresh,
    setQuoteNeedsRefresh,
    quoteError,
    setQuoteError,
    quotedCartSignature,
    setQuotedCartSignature,
    checkoutResult,
    setCheckoutResult,
    checkoutError,
    setCheckoutError,
    checkoutLoading,
    setCheckoutLoading,
    isCheckoutOpen,
    setIsCheckoutOpen,
    checkoutTab,
    setCheckoutTab,
    pendingOrderInitialTab,
    setPendingOrderInitialTab,
    hasAppliedCheckoutAuthResume,
    setHasAppliedCheckoutAuthResume,
    simpleOrderStep,
    setSimpleOrderStep,
    showSimpleMobileOrderSummary,
    setShowSimpleMobileOrderSummary,
    showSimpleMobileAddressModal,
    setShowSimpleMobileAddressModal
  };
}
