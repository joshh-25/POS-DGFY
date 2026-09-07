/**
 * checkoutSlice — checkout draft, quote, and payment-session state.
 *
 * This is deliberately a state-only slice. Submission, quote calculation,
 * validation, and persistence remain in their existing hooks; the shell keeps
 * the previous useState-compatible names through the action bridge below.
 */

import {
  readRouteSlug,
  readStoreLocationId,
  readStoreVoucherCode
} from '../../app/routing/storefrontRouting.js';
import { readStoreAuthToken } from '../../auth/storefrontSessionStorage.js';
import { FNB_RECOMMENDED_LOCATION } from '../../modes/fnb/checkout/model/fnbCheckoutAddressLocations.js';

const readInitialPreferredStoreLocationSelection = () => {
  const slug = readRouteSlug();
  const locationId = readStoreLocationId();
  return slug && locationId != null ? { slug, locationId } : null;
};

export const checkoutInitialState = {
  checkout: {
    elected: 'full',
    promoCode: '',
    voucherCode: readStoreVoucherCode(),
    preferredStoreLocationSelection: readInitialPreferredStoreLocationSelection(),
    orderMethod: 'delivery',
    guestCheckoutUnlocked: false,
    rememberCustomerDetails: Boolean(readStoreAuthToken()),
    guestDetailsEditMode: false,
    isUsingDifferentGuestDetails: false,
    customerAddress: '',
    serviceLocationLandmarkNote: '',
    serviceUnitType: '',
    customerPin: null,
    resolvedDeliveryAddress: '',
    resolvingPinnedDeliveryAddress: false,
    deliveryLocationAction: 'saved',
    showExpandedDeliveryMap: false,
    savedPinnedLocations: [],
    selectedSavedLocationId: FNB_RECOMMENDED_LOCATION.id,
    serviceAppointmentAt: '',
    servicePaymentTiming: 'postpaid',
    servicePaymentPreviewMethod: 'qr',
    servicePaymentPreviewCard: {
      cardholder: '',
      cardNumber: '',
      expiry: '',
      cvv: ''
    },
    servicePaymentPreviewReceiptName: '',
    serviceIntakeResponses: {},
    pinLocationLoading: false,
    pinLocationError: '',
    quoteResult: null,
    quoteNeedsRefresh: true,
    quoteError: '',
    quotedCartSignature: null,
    checkoutResult: null,
    checkoutError: '',
    checkoutLoading: false,
    isCheckoutOpen: false,
    checkoutTab: 'checkout',
    pendingOrderInitialTab: '',
    hasAppliedCheckoutAuthResume: false,
    simpleOrderStep: 1,
    showSimpleMobileOrderSummary: false,
    showSimpleMobileAddressModal: false
  }
};

const updateCheckoutField = (set, key, next) => set((s) => ({
  checkout: {
    ...s.checkout,
    [key]: typeof next === 'function' ? next(s.checkout[key]) : next
  }
}));

const checkoutFields = {
  elected: 'Elected',
  promoCode: 'PromoCode',
  voucherCode: 'VoucherCode',
  preferredStoreLocationSelection: 'PreferredStoreLocationSelection',
  orderMethod: 'OrderMethod',
  guestCheckoutUnlocked: 'GuestCheckoutUnlocked',
  rememberCustomerDetails: 'RememberCustomerDetails',
  guestDetailsEditMode: 'GuestDetailsEditMode',
  isUsingDifferentGuestDetails: 'IsUsingDifferentGuestDetails',
  customerAddress: 'CustomerAddress',
  serviceLocationLandmarkNote: 'ServiceLocationLandmarkNote',
  serviceUnitType: 'ServiceUnitType',
  customerPin: 'CustomerPin',
  resolvedDeliveryAddress: 'ResolvedDeliveryAddress',
  resolvingPinnedDeliveryAddress: 'ResolvingPinnedDeliveryAddress',
  deliveryLocationAction: 'DeliveryLocationAction',
  showExpandedDeliveryMap: 'ShowExpandedDeliveryMap',
  savedPinnedLocations: 'SavedPinnedLocations',
  selectedSavedLocationId: 'SelectedSavedLocationId',
  serviceAppointmentAt: 'ServiceAppointmentAt',
  servicePaymentTiming: 'ServicePaymentTiming',
  servicePaymentPreviewMethod: 'ServicePaymentPreviewMethod',
  servicePaymentPreviewCard: 'ServicePaymentPreviewCard',
  servicePaymentPreviewReceiptName: 'ServicePaymentPreviewReceiptName',
  serviceIntakeResponses: 'ServiceIntakeResponses',
  pinLocationLoading: 'PinLocationLoading',
  pinLocationError: 'PinLocationError',
  quoteResult: 'QuoteResult',
  quoteNeedsRefresh: 'QuoteNeedsRefresh',
  quoteError: 'QuoteError',
  quotedCartSignature: 'QuotedCartSignature',
  checkoutResult: 'CheckoutResult',
  checkoutError: 'CheckoutError',
  checkoutLoading: 'CheckoutLoading',
  isCheckoutOpen: 'IsCheckoutOpen',
  checkoutTab: 'CheckoutTab',
  pendingOrderInitialTab: 'PendingOrderInitialTab',
  hasAppliedCheckoutAuthResume: 'HasAppliedCheckoutAuthResume',
  simpleOrderStep: 'SimpleOrderStep',
  showSimpleMobileOrderSummary: 'ShowSimpleMobileOrderSummary',
  showSimpleMobileAddressModal: 'ShowSimpleMobileAddressModal'
};

export const createCheckoutSlice = (set) => ({
  ...checkoutInitialState,
  ...Object.fromEntries(
    Object.entries(checkoutFields).map(([field, suffix]) => [
      `checkoutSet${suffix}`,
      (next) => updateCheckoutField(set, field, next)
    ])
  )
});
