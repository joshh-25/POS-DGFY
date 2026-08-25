// #963: the email regex is owned by checkout/checkoutValidation.js so the card-billing requirement
// and F&B's own contact validation can't drift apart. Kept as a named re-export rather than
// deleted -- this name is what F&B's call sites and tests already import.
export { isValidCheckoutEmail as isValidFnbCheckoutEmail } from '../../../../checkout/checkoutValidation.js';

export const isValidPhilippineMobileNumber = (value) => {
  const normalized = String(value || '').replace(/[\s()-]/g, '');
  return /^09\d{9}$/.test(normalized) || /^\+639\d{9}$/.test(normalized);
};
