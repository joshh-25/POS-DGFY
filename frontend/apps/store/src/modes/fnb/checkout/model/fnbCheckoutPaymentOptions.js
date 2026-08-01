const ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze([
  { value: 'cash', label: 'Cash on delivery/pickup' },
  { value: 'qrph', label: 'Pay via QR Ph' }
]);

export const STOREFRONT_SANDBOX_QRPH_ENABLED = (
  import.meta.env.VITE_STOREFRONT_SANDBOX_QRPH_ENABLED === 'true'
);

export const isEnabledStorefrontCheckoutPaymentType = (paymentType, paymentCapabilities = null) => (
  paymentType === 'cash'
  || (
    paymentType === 'qrph'
    && (
      paymentCapabilities?.qrph?.enabled === true
      || STOREFRONT_SANDBOX_QRPH_ENABLED
    )
  )
);

export const buildStorefrontCheckoutPaymentOptions = (paymentCapabilities = null) => (
  ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS
    .filter((option) => isEnabledStorefrontCheckoutPaymentType(option.value, paymentCapabilities))
    .map((option) => (
      option.value === 'qrph' && paymentCapabilities?.qrph?.environment === 'test'
        ? { ...option, label: 'Pay via QR Ph (PayMongo test)' }
        : option
    ))
);

export const STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze(
  buildStorefrontCheckoutPaymentOptions()
);
