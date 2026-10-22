import { ACTIVE_FULFILLMENT_STATUSES } from '@sieitzz/shared-constants/orderFulfillmentStatuses';

export const ACTIVE_CUSTOMER_ORDER_STATUSES = new Set([
  ...ACTIVE_FULFILLMENT_STATUSES,
  'in_progress',
  'scheduled'
]);

export const COMPLETED_CUSTOMER_ORDER_STATUSES = new Set([
  'completed',
  'delivered',
  'picked_up'
]);
