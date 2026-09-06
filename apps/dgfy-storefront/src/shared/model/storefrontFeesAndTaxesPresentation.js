// #1615: pure presentation helper that splits the checkout summary's fee/VAT figures into two
// separate rows instead of combining them into one "Fees & Taxes" total. Mirrors
// storefrontDownpaymentPresentation.js's own convention (pure, framework-free, independently
// unit-testable; shared/ never imports modes/) so all three storefront modes (F&B, Simple, Retail)
// render identical wording/logic instead of re-deriving it at each of the 6 render sites.
//
// Why the split matters, and why the VAT figure doesn't change when a voucher is applied:
// `vat_amount` (apps/dgfy-api/src/modules/store/usecases/storeUseCases.js) is computed inside
// prepareOrderLines from the gross vatable line prices -- BEFORE promo/voucher discounts are
// resolved -- so it always reflects VAT already included in the item prices as originally priced,
// not a post-discount recomputation. `service_fee_amount` is a separate, additive, non-VAT charge
// (ADR 0012 Decision 1) that legitimately participates in the Subtotal -> Total reconciliation.
// Combining the two into one row made the additive fee look like it included tax, and made the
// already-inclusive VAT figure look like it was being added on top of the subtotal a second time.
// Splitting them, and disclosing the pre-discount VAT basis in the UI, resolves both.

export const VAT_DISCLOSURE_LABEL = 'VAT (included in item prices)';

export const VAT_DISCLOSURE_NOTE = 'VAT shown above is already included in item prices and is calculated before any promo or voucher discount.';

/**
 * Two OrderSummaryCard/mobile-SummaryRow-shaped rows ({label, value}) replacing the old single
 * combined "Fees & Taxes" row: the additive service fee (participates in the Subtotal -> Total
 * reconciliation, unchanged), and the informational, already-included VAT disclosure (never added
 * into the total -- it's already inside subtotal_amount). Always returns both rows, including the
 * zero-fee (revenue-sharing) and zero-VAT (VAT-exempt) cases -- there is nothing to hide, only
 * numbers to show correctly.
 */
export const buildFeeAndVatSummaryRows = ({ totals = {}, money } = {}) => {
  if (typeof money !== 'function') return [];
  const serviceFeeAmount = Number(totals.service_fee_amount || 0);
  const vatAmount = Number(totals.vat_amount || 0);
  return [
    { label: totals.service_fee_label || 'Service Fee', value: money(serviceFeeAmount) },
    { label: VAT_DISCLOSURE_LABEL, value: money(vatAmount) }
  ];
};
