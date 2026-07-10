export const ORDER_METHOD_LABELS = Object.freeze({
  dine_in: 'Dine In',
  takeout: 'Takeout',
  pickup: 'Pickup',
  delivery: 'Delivery',
  appointment: 'Appointment',
  online: 'Online'
});

export const PAYMENT_TYPE_LABELS = Object.freeze({
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  qrph: 'QR Ph'
});

export const FULFILLMENT_STATUS_LABELS = Object.freeze({
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected'
});

export const getNextStatusActions = (order = {}) => {
  const current = String(order.fulfillment_status || '').trim();
  const method = String(order.order_method || '').trim();
  switch (current) {
  case 'placed':
    return ['confirmed', 'rejected'];
  case 'confirmed':
    return ['preparing'];
  case 'preparing':
    return method === 'delivery' ? ['out_for_delivery'] : ['ready_for_pickup'];
  case 'ready_for_pickup':
  case 'out_for_delivery':
    return ['completed'];
  default:
    return [];
  }
};

export const FULFILLMENT_ACTION_LABELS = Object.freeze({
  confirmed: 'Confirm',
  rejected: 'Reject',
  preparing: 'Start Preparing',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  completed: 'Complete'
});

export const getFulfillmentActionLabel = (status, order = {}) => {
  const normalizedStatus = String(status || '').trim();
  const orderMethod = String(order?.order_method || '').trim();
  if (normalizedStatus === 'ready_for_pickup') {
    if (orderMethod === 'takeout') return 'Ready for Collection';
    if (orderMethod === 'dine_in') return 'Ready to Serve';
    return 'Ready for Pickup';
  }
  if (normalizedStatus === 'completed') {
    if (orderMethod === 'delivery') return 'Delivered';
    if (orderMethod === 'takeout') return 'Collected';
    if (orderMethod === 'dine_in') return 'Served';
    if (orderMethod === 'pickup') return 'Picked Up';
  }
  return FULFILLMENT_ACTION_LABELS[normalizedStatus] || FULFILLMENT_STATUS_LABELS[normalizedStatus] || status;
};

export const getIncomingOrderUtilityActions = (order = {}) => {
  const current = String(order.fulfillment_status || '').trim();
  switch (current) {
  case 'placed':
  case 'confirmed':
  case 'preparing':
  case 'ready_for_pickup':
  case 'out_for_delivery':
    return ['open_order', 'print_order'];
  default:
    return [];
  }
};
