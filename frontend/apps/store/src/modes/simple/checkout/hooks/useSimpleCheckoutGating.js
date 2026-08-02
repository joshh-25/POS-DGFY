import { hasCustomerName, hasPrimaryContact, isCustomerStepComplete } from '../../../../checkout/checkoutValidation.js';

// MSME (Simple) checkout step-gating. Extracted out of StorefrontApp.jsx so the shell stays
// a plain pass-through; mirrors the shape of useCheckoutTotalsAndGating's mode-specific
// branches without touching that shared F&B-housed file.
export function useSimpleCheckoutGating({
  cart = [],
  checkoutAllowed = false,
  customerAddress = '',
  customerEmail = '',
  customerName = '',
  customerPhone = '',
  fnbScheduleMode = 'asap',
  fnbScheduledFor = '',
  guestCheckoutOtpVerified = false,
  isDeliveryOrder = false
}) {
  const simpleCustomerStepComplete = isCustomerStepComplete({
    customerName,
    customerPhone,
    customerEmail,
    isDeliveryOrder,
    customerAddress,
    usePinnedAddress: false
  }) && guestCheckoutOtpVerified;
  const simpleHasCustomerIdentity = hasCustomerName(customerName);
  const simpleHasPrimaryIdentityContact = hasPrimaryContact({ phone: customerPhone, email: customerEmail });
  const simpleStepOneReady = cart.length > 0 && (fnbScheduleMode !== 'schedule' || Boolean(fnbScheduledFor));
  const simpleCheckoutAllowed = checkoutAllowed && simpleCustomerStepComplete;

  return {
    simpleCustomerStepComplete,
    simpleHasCustomerIdentity,
    simpleHasPrimaryIdentityContact,
    simpleStepOneReady,
    simpleCheckoutAllowed
  };
}
