export const ORDER_METHOD_LABELS = Object.freeze({
  dine_in: 'Dine In',
  takeout: 'Takeout',
  pickup: 'Pickup',
  delivery: 'Delivery',
  online: 'Online'
});

export const PAYMENT_TYPE_LABELS = Object.freeze({
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  card: 'Card',
  bank_transfer: 'Bank Transfer'
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
