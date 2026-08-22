// Phase 150 (#866). Pure, no React (shared/ never imports modes/) -- the customer's checkout-time
// pay-in-full-vs-downpayment election at a payment_mode='customer_choice' store. Mirrors the shape
// of storefrontDownpaymentPresentation.js's other pure helpers: no I/O, independently unit-testable.

export const PAYMENT_ELECTION_FULL = 'full';
export const PAYMENT_ELECTION_DOWNPAYMENT = 'downpayment';

// The two options offered under customer_choice, in display order. Kept here (not inlined in the
// component) so the copy is unit-testable and reused identically everywhere the control renders.
export const PAYMENT_ELECTION_OPTIONS = Object.freeze([
  {
    value: PAYMENT_ELECTION_FULL,
    label: 'Pay in full',
    description: 'Pay the full order total now.'
  },
  {
    value: PAYMENT_ELECTION_DOWNPAYMENT,
    label: 'Pay a downpayment',
    description: 'Pay a downpayment now; the balance is settled on delivery/pickup.'
  }
]);

// Resolves what the customer's election actually is for a given store -- the single source of
// truth the rest of the checkout UI reads instead of scattered ternaries on payment_mode. Forces
// the answer for the two non-choice modes rather than trusting a stale `elected` value that might
// be left over from a previous store/session: a downpayment_required store is always
// 'downpayment' (the merchant decided, not the customer), a full_payment store is always 'full'.
// Only under customer_choice does the caller's own `elected` state actually matter.
export const resolvePaymentElection = (selectedStore, elected) => {
  const paymentMode = selectedStore?.payment_mode;
  if (paymentMode === 'downpayment_required') return PAYMENT_ELECTION_DOWNPAYMENT;
  if (paymentMode !== 'customer_choice') return PAYMENT_ELECTION_FULL;
  return elected === PAYMENT_ELECTION_DOWNPAYMENT ? PAYMENT_ELECTION_DOWNPAYMENT : PAYMENT_ELECTION_FULL;
};
