export const ACTIVE_CUSTOMER_ORDER_STATUSES = new Set([
  'placed',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'in_progress',
  'scheduled'
]);

export const COMPLETED_CUSTOMER_ORDER_STATUSES = new Set([
  'completed',
  'delivered',
  'picked_up'
]);
