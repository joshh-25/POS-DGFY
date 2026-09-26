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
// compatibility field. It is intentionally not rendered in customer-facing Storefront UI;
// the already-inclusive VAT figure remains an informational disclosure.

export const VAT_DISCLOSURE_LABEL = 'VAT (included in item prices)';

export const VAT_DISCLOSURE_NOTE = 'VAT shown above is already included in item prices and is calculated before any promo or voucher discount.';

/**
 * OrderSummaryCard/mobile-SummaryRow-shaped rows ({label, value}) replacing the old single
 * combined "Fees & Taxes" row. Legacy service-fee amounts are deliberately ignored so an old
 * quote/order response cannot reintroduce the removed customer-facing fee. The VAT row is
 * informational and is never added into the total because it is already included in subtotal_amount.
 */
export const buildFeeAndVatSummaryRows = ({ totals = {}, money } = {}) => {
  if (typeof money !== 'function') return [];
  const vatAmount = Number(totals.vat_amount || 0);
  return [{ label: VAT_DISCLOSURE_LABEL, value: money(vatAmount) }];
};
