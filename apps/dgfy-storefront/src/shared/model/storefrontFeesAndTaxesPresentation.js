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
// not a post-discount recomputation. `service_fee_amount` remains a separate, additive, non-VAT
// compatibility field. New Storefront orders resolve it to zero, so the customer-facing fee row
// is omitted while the already-inclusive VAT figure remains an informational disclosure.

export const VAT_DISCLOSURE_LABEL = 'VAT (included in item prices)';

export const VAT_DISCLOSURE_NOTE = 'VAT shown above is already included in item prices and is calculated before any promo or voucher discount.';

/**
 * OrderSummaryCard/mobile-SummaryRow-shaped rows ({label, value}) replacing the old single
 * combined "Fees & Taxes" row. Positive legacy service-fee amounts remain renderable for older
 * order/quote responses, while the zero-valued Phase 333 Storefront fee is omitted. The VAT row is
 * informational and is never added into the total because it is already included in subtotal_amount.
 */
export const buildFeeAndVatSummaryRows = ({ totals = {}, money } = {}) => {
  if (typeof money !== 'function') return [];
  const serviceFeeAmount = Number(totals.service_fee_amount || 0);
  const vatAmount = Number(totals.vat_amount || 0);
  const rows = serviceFeeAmount > 0
    ? [{ label: totals.service_fee_label || 'Service Fee', value: money(serviceFeeAmount) }]
    : [];
  rows.push({ label: VAT_DISCLOSURE_LABEL, value: money(vatAmount) });
  return rows;
};
