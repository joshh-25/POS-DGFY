// Phase 229 (#1289). Pure formatting/derivation helpers shared between TerminalOperationsPanels.jsx
// (Order History table + the reject-confirmation dialog copy) and IncomingQueueOrderList.jsx (the
// Active Queue / split-view order cards). Pulled out during the §2.7 list extraction so neither
// file needs to import the other -- both import from here instead, avoiding a circular import
// between TerminalOperationsPanels.jsx and the new IncomingQueueOrderList.jsx. Zero behavior
// change: every function here is copied verbatim from its prior location in
// TerminalOperationsPanels.jsx.

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

// Phase 144 (#824): a downpayment order is persisted as COD (payment_type forced to 'cash' by
// Phase 141, because the balance IS collected in person) with payment_status 'partially_paid'.
// Until now the card rendered exactly those two facts and nothing else, so staff handing over
// goods could not see how much cash to collect. amount_paid/balance_due are already on the wire
// from listIncomingOnlineOrders -- this only reads them.
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
