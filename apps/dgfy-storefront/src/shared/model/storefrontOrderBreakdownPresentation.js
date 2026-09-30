export const STOREFRONT_ORDER_BREAKDOWN_LABELS = Object.freeze({
  subtotal: 'Subtotal',
  discount: 'Discount',
  deliveryFee: 'Delivery Fee',
  total: 'Total',
});

const hasAmount = (value) => (
  value !== null
  && value !== undefined
  && value !== ''
  && Number.isFinite(Number(value))
);

const normalizeOrderMethod = (value) => String(value || '').trim().toLowerCase().replace(/-/g, '_');

/**
 * Build the same customer-facing financial breakdown for checkout and order tracking.
 * Values are only formatted here; amounts are always supplied by the existing quote/order.
 */
export const buildStorefrontOrderBreakdownRows = ({
  discountRows = [],
  money,
  orderMethod,
  totals = {},
} = {}) => {
  if (typeof money !== 'function') return [];

  const rows = [];
  if (hasAmount(totals.subtotal_amount)) {
    rows.push({ label: STOREFRONT_ORDER_BREAKDOWN_LABELS.subtotal, value: money(totals.subtotal_amount) });
  }

  if (discountRows.length > 0) {
    rows.push(...discountRows);
  } else if (hasAmount(totals.discount_amount) && Number(totals.discount_amount) > 0) {
    rows.push({
      label: String(totals.discount_label || STOREFRONT_ORDER_BREAKDOWN_LABELS.discount).trim(),
      value: `- ${money(totals.discount_amount)}`,
      color: '#15803d',
    });
  }

  if (normalizeOrderMethod(orderMethod) === 'delivery' && hasAmount(totals.delivery_fee)) {
    rows.push({ label: STOREFRONT_ORDER_BREAKDOWN_LABELS.deliveryFee, value: money(totals.delivery_fee) });
  }

  if (hasAmount(totals.vat_amount)) {
    rows.push({ label: 'VAT (included in item prices)', value: money(totals.vat_amount), informational: true });
  }

  if (hasAmount(totals.total_amount)) {
    rows.push({
      label: STOREFRONT_ORDER_BREAKDOWN_LABELS.total,
      value: money(totals.total_amount),
      emphasis: true,
      borderTop: true,
    });
  }

  return rows;
};
