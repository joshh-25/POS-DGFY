const ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze([
  { value: 'cash', label: 'Cash on delivery/pickup' },
  { value: 'qrph', label: 'Pay via QR Ph (PayMongo test)' }
]);

export const STOREFRONT_SANDBOX_QRPH_ENABLED = (
  import.meta.env.DEV
  && import.meta.env.VITE_STOREFRONT_SANDBOX_QRPH_ENABLED === 'true'
);

export const isEnabledStorefrontCheckoutPaymentType = (paymentType) => (
  paymentType === 'cash'
  || (paymentType === 'qrph' && STOREFRONT_SANDBOX_QRPH_ENABLED)
);

export const STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze(
  ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS.filter((option) => isEnabledStorefrontCheckoutPaymentType(option.value))
);
