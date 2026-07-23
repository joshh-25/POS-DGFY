/**
 * checkoutSlice — fulfillment/customer/payment fields, `handleCheckout`,
 * `handleQuote`, promo, OTP, and checkout auth-resume.
 *
 * SCAFFOLD ONLY (Wave 0). Populated in Wave 3 ([QA-REQUIRED]) — money path,
 * migrated verbatim, behavior-preserving, unit-tested. Shape follows uiSlice.js.
 */

export const checkoutInitialState = {
  checkout: {}
};

// eslint-disable-next-line no-unused-vars -- `set`/`get` used once Wave 3 populates actions
export const createCheckoutSlice = (set, get) => ({
  ...checkoutInitialState
});
