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
