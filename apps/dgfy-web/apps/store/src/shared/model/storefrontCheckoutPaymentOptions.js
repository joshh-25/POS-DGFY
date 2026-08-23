import {
  STOREFRONT_HOSTED_PAYMENT_TYPES
} from '../services/storefrontOnlinePaymentSession.js';

const ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze([
  { value: 'cash', label: 'Cash on delivery/pickup' },
  { value: 'card', label: 'Credit or debit card' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'grab_pay', label: 'GrabPay' },
  { value: 'shopeepay', label: 'ShopeePay' },
  { value: 'qrph', label: 'Pay via QR Ph' }
]);

const PAYMONGO_TEST_LABELS = Object.freeze({
  card: 'Card',
  gcash: 'GCash',
  maya: 'Maya',
  grab_pay: 'GrabPay',
  shopeepay: 'ShopeePay',
  qrph: 'Pay via QR Ph'
});
export const STOREFRONT_SANDBOX_QRPH_ENABLED = (
  import.meta.env.VITE_STOREFRONT_SANDBOX_QRPH_ENABLED === 'true'
);

export const isEnabledStorefrontCheckoutPaymentType = (paymentType, paymentCapabilities = null) => (
  paymentType === 'cash'
  || (paymentType === 'qrph' && (
    paymentCapabilities?.qrph?.enabled === true
    || STOREFRONT_SANDBOX_QRPH_ENABLED
  ))
  || (STOREFRONT_HOSTED_PAYMENT_TYPES.includes(paymentType) && paymentCapabilities?.[paymentType]?.enabled === true)
);

// Phase 142 (#823): hideCash lets a downpayment-required store's checkout drop the cash option
// from the list -- the backend 422s DOWNPAYMENT_CAPTURE_NOT_AVAILABLE on it, so offering it would
// just send the customer through a dead-end round trip. Deliberately NOT folded into
// isEnabledStorefrontCheckoutPaymentType -- cash stays a "capability" (it's always technically
// enabled) and hiding it here is a presentation decision, so callers that check the capability
// function directly (e.g. draft-restore validation) are unaffected.
//
// Phase 150 (#866): every call site now passes `hideCash: downpaymentDisplay.active ||
// isCustomerChoiceStore(selectedStore)`, not just the first half. A customer_choice store's ADR
// amendment states both its options capture online -- "pay in full" is "the full order total
// online", and plain COD-with-no-deposit is explicitly not offered under customer_choice -- so
// cash stays hidden regardless of which election is currently selected, not only once a
// downpayment happens to be active.
export const buildStorefrontCheckoutPaymentOptions = (paymentCapabilities = null, { hideCash = false } = {}) => (
  ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS
    .filter((option) => isEnabledStorefrontCheckoutPaymentType(option.value, paymentCapabilities))
    .filter((option) => !(hideCash && option.value === 'cash'))
    .map((option) => (
      option.value !== 'cash' && (
        option.value === 'qrph'
          ? paymentCapabilities?.qrph?.environment === 'test'
          : paymentCapabilities?.[option.value]?.environment === 'test'
        )
        ? { ...option, label: `${PAYMONGO_TEST_LABELS[option.value] || option.label} (PayMongo test)` }
        : option
    ))
);

export const STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze(
  buildStorefrontCheckoutPaymentOptions()
);
