export function formatTrackingDrawerDate(value) {
  if (!value) return 'Today';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today';
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export function resolveTrackingDrawerStatus(rawStatus) {
  const status = String(rawStatus || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (status.includes('confirm')) return { bg: '#f0fdf4', border: '#86efac', color: '#15803d', dot: '#22c55e', label: 'Confirmed by store' };
  if (status.includes('prepar')) return { bg: '#fff7ed', border: '#fdba74', color: '#c2410c', dot: '#f97316', label: 'Preparing' };
  if (status.includes('pickup') || status.includes('ready')) return { bg: '#faf5ff', border: '#d8b4fe', color: '#7e22ce', dot: '#a855f7', label: 'Ready for Pickup' };
  if (status.includes('delivered') && !status.includes('out')) return { bg: '#f0fdf4', border: '#86efac', color: '#15803d', dot: '#22c55e', label: 'Delivered' };
  if (status.includes('out')) return { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8', dot: '#3b82f6', label: 'Out for delivery' };
  if (status.includes('cancel')) return { bg: '#fff1f2', border: '#fca5a5', color: '#b91c1c', dot: '#ef4444', label: 'Cancelled' };
  if (status.includes('placed') || status.includes('pending')) return { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', dot: '#3b82f6', label: 'Order placed' };
  return { bg: '#f8fafc', border: '#cbd5e1', color: '#475569', dot: '#94a3b8', label: rawStatus || 'In Progress' };
}

export function deriveTrackingDrawerItems(entry = {}) {
  const detailedItems = Array.isArray(entry.items)
    ? entry.items.filter((item) => String(item?.name || '').trim())
    : [];
  if (detailedItems.length > 0) return detailedItems;
  const itemName = String(entry.item_name || '').trim();
  if (!itemName) return [];
  const itemCount = Number.isFinite(Number(entry.item_count)) ? Math.max(1, Number(entry.item_count)) : 1;
  return [{
    name: itemName,
    qty: itemCount,
    amount: Number.isFinite(Number(entry.total_amount)) ? Number(entry.total_amount) : null,
    subtitle: itemCount > 1 ? `${itemCount} items in this order` : 'Order summary'
  }];
}

export function deriveTrackingDrawerTotals(entry = {}, money) {
  const discountAmount = Number(entry.discount_amount ?? entry.discountAmount);
  const hasDiscount = Number.isFinite(discountAmount) && discountAmount > 0;
  return {
    totalAmount: money(entry.total_amount || 0),
    specialInstructions: String(entry.special_instructions || entry.specialInstructions || '').trim(),
    subtotal: entry.subtotal != null ? money(entry.subtotal) : null,
    discount: hasDiscount ? `- ${money(discountAmount)}` : null,
    discountLabel: String(entry.discount_label || entry.discountLabel || 'Promo / Discount').trim(),
    deliveryFee: entry.delivery_fee != null ? money(entry.delivery_fee) : null,
    serviceFee: entry.service_fee != null ? money(entry.service_fee) : null
  };
}
