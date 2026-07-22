const ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze([
  { value: 'cash', label: 'Cash on delivery/pickup' }
]);

export const isEnabledStorefrontCheckoutPaymentType = (paymentType) => paymentType === 'cash';

export const STOREFRONT_CHECKOUT_PAYMENT_OPTIONS = Object.freeze(
  ALL_STOREFRONT_CHECKOUT_PAYMENT_OPTIONS.filter((option) => isEnabledStorefrontCheckoutPaymentType(option.value))
);
