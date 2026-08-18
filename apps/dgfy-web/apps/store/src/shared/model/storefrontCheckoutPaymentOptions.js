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

export const buildStorefrontCheckoutPaymentOptions = (paymentCapabilities = null) => (
  ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS
    .filter((option) => isEnabledStorefrontCheckoutPaymentType(option.value, paymentCapabilities))
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
