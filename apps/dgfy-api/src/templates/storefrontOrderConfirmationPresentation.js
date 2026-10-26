/**
 * Pure presentation helpers for storefront order confirmation email.
 * Breakdown rows mirror the storefront's buildStorefrontOrderBreakdownRows spec:
 * they present persisted order values and intentionally never recompute totals.
 */

const asFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const formatOrderConfirmationMoney = (value) => {
  const amount = asFiniteNumber(value);
  if (amount === null) return '₱0.00';
  return `₱${new Intl.NumberFormat('en-PH', {
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)}`;
};

export const formatOrderQuantity = (value) => {
  const quantity = asFiniteNumber(value);
  if (quantity === null || quantity <= 0) return '0';
  const rounded = Math.round((quantity + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) return '0';
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export const buildOrderConfirmationBreakdownRows = (order = {}) => {
  const rows = [{ label: 'Subtotal', amount: order.subtotal_amount, kind: 'subtotal' }];
  const discount = asFiniteNumber(order.discount_amount);
  if (discount !== null && discount > 0) {
    rows.push({
      label: String(order.discount_label_snapshot || '').trim() || 'Discount',
      amount: order.discount_amount,
      kind: 'discount'
    });
  }

  const processingFee = asFiniteNumber(order.customer_processing_fee_amount);
  if (processingFee !== null && processingFee > 0) {
    rows.push({
      label: String(order.customer_processing_fee_label_snapshot || '').trim() || 'Item processing fee',
      amount: order.customer_processing_fee_amount,
      kind: 'fee'
    });
  }

  if (order.order_method === 'delivery') {
    rows.push({ label: 'Delivery Fee', amount: order.delivery_fee, kind: 'fee' });
  }

  if (asFiniteNumber(order.vat_amount) !== null) {
    rows.push({ label: 'VAT (included in item prices)', amount: order.vat_amount, kind: 'informational' });
  }

  rows.push({ label: 'Total', amount: order.total_amount, kind: 'total' });
  return rows;
};

export const resolveFulfillmentLabel = (orderMethod) => ({
  delivery: 'Delivery',
  pickup: 'Pickup',
  dine_in: 'Dine In'
}[orderMethod] || 'Pickup');

export const VAT_DISCLOSURE_NOTE = 'VAT shown above is already included in item prices and is calculated before any promo or voucher discount.';

export const resolveBalanceLabel = (orderMethod) => ({
  delivery: 'Balance due on delivery',
  dine_in: 'Balance due at dine-in',
  pickup: 'Balance due at pickup'
}[orderMethod] || 'Balance due at pickup');

export const formatOrderTime = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
};
