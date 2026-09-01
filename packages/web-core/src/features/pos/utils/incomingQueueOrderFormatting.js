// Phase 229 (#1288). Extracted, behavior-preserving, from module-scope helpers that used to live
// only inside TerminalOperationsPanels.jsx. Both the existing card view and the new
// QueueOrderTableView.jsx need these -- pulling them into their own file (rather than exporting
// them from TerminalOperationsPanels.jsx, which itself imports QueueOrderTableView.jsx to render
// it) avoids a circular import between the two component files.

export const formatOrderDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};

export const formatOrderAmount = (value) => {
  const amount = Number(value || 0);
  return `PHP ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
};

export const humanizeOrderStatus = (value) => String(value || '-').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

// Phase 144 (#824): a downpayment order is persisted as COD (payment_type forced to 'cash' by
// Phase 141, because the balance IS collected in person) with payment_status 'partially_paid'.
// amount_paid/balance_due are already on the wire from listIncomingOnlineOrders -- this only reads
// them.
export const resolveOrderDownpaymentSplit = (order) => {
  const amountPaid = Number(order?.amount_paid || 0);
  const balanceDue = Number(order?.balance_due || 0);
  if (order?.payment_status !== 'partially_paid' || !(amountPaid > 0)) return null;
  return { amountPaid, balanceDue };
};

// Balance is always collected in person -- ADR 0069 clause 2 [binding], carried forward by ADR
// 0070. Mirrors the storefront's own resolveDownpaymentBalanceLabel so both surfaces word it the
// same way.
export const resolveBalanceCollectionLabel = (orderMethod) => (
  orderMethod === 'delivery' ? 'Collect on delivery' : 'Collect at pickup'
);

export const parseDeliveryCoords = (order = {}) => {
  if (
    order?.delivery_latitude === null
    || order?.delivery_latitude === undefined
    || order?.delivery_latitude === ''
    || order?.delivery_longitude === null
    || order?.delivery_longitude === undefined
    || order?.delivery_longitude === ''
  ) {
    return null;
  }
  const lat = Number(order?.delivery_latitude);
  const lng = Number(order?.delivery_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng
  };
};
