export const hasCustomerName = (value = '') => String(value || '').trim().length > 0;

export const hasPrimaryContact = ({ phone = '', email = '' } = {}) => (
  String(phone || '').trim().length > 0 || String(email || '').trim().length > 0
);

export const hasDeliveryAddress = ({
  isDeliveryOrder = false,
  hasPinnedDeliveryLocation = false,
  activePinnedDeliveryAddress = '',
  customerAddress = '',
  usePinnedAddress = false
} = {}) => {
  if (!isDeliveryOrder) return true;
  if (usePinnedAddress) {
    return Boolean(hasPinnedDeliveryLocation) && String(activePinnedDeliveryAddress || '').trim().length > 0;
  }
  return String(customerAddress || '').trim().length > 0;
};

export const isCustomerStepComplete = ({
  customerName = '',
  customerPhone = '',
  customerEmail = '',
  isDeliveryOrder = false,
  hasPinnedDeliveryLocation = false,
  activePinnedDeliveryAddress = '',
  customerAddress = '',
  usePinnedAddress = false
} = {}) => (
  hasCustomerName(customerName)
  && hasPrimaryContact({ phone: customerPhone, email: customerEmail })
  && hasDeliveryAddress({
    isDeliveryOrder,
    hasPinnedDeliveryLocation,
    activePinnedDeliveryAddress,
    customerAddress,
    usePinnedAddress
  })
);

// #963: PayMongo's payment_methods create rejects a card without a billing email
// ("billing email required"), and that message reaches the customer verbatim. Guests always have
// one -- the guest OTP flow (shared/checkout/hooks/useGuestCheckoutOtp.js) can't complete without
// it -- but a signed-in customer can hold a phone-only account
// (dgfyCustomerUseCases.js: "A recovery email or phone is required"), and hasPrimaryContact above
// accepts either. Scoped to `card` on purpose: it's the only rail PayMongo demands an email for,
// and the direct-wallet path already receives real billing values from useCheckoutSubmission.js.
export const isValidCheckoutEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

export const requiresBillingEmail = ({ paymentType = '', customerEmail = '' } = {}) => (
  paymentType === 'card' && !isValidCheckoutEmail(customerEmail)
);
