// Phase 211 (#1180). `normalizeWorkflowMode` re-exported from @sieitzz/shared-constants/
// workflowModes via this settings module -- confirmed no import cycle (workflowMode.js does not
// import anything from features/pos).
import { normalizeWorkflowMode } from '../../settings/workflowMode.js';

export const ORDER_METHOD_LABELS = Object.freeze({
  dine_in: 'Dine In',
  takeout: 'Takeout',
  pickup: 'Pickup',
  delivery: 'Delivery',
  appointment: 'Appointment',
  walk_in: 'Walk-in',
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
  packed: 'Packed',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected'
});

export const getNextStatusActions = (order = {}, workflowMode = '') => {
  const current = String(order.fulfillment_status || '').trim();
  const method = String(order.order_method || '').trim();
  switch (current) {
  case 'placed':
    return ['confirmed', 'rejected'];
  case 'confirmed':
    // Phase 210 (#1179). A merchant who has already accepted an order can still discover it is
    // out-of-route and must be able to reject it with a reason. Mirrors
    // posUseCases.js's ONLINE_FULFILLMENT_TRANSITIONS.confirmed -- the server stays authoritative.
    return ['preparing', 'rejected'];
  case 'preparing': {
    // Phase 211 (#1180). Retail-only, additive: the existing next step is ALWAYS still offered,
    // `packed` is offered alongside it. Gate mirrors
    // TerminalOperationsWorkspace.jsx's own `normalizeWorkflowMode(...) === 'retail'` pattern.
    // `workflowMode` is a second, OPTIONAL parameter (defaulting to '') so the un-updated
    // TerminalSidebarPanel call site (no render site on develop, still calls this positionally)
    // keeps compiling and simply never offers the packed action.
    const handoffStatus = method === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup';
    return normalizeWorkflowMode(workflowMode) === 'retail' ? ['packed', handoffStatus] : [handoffStatus];
  }
  case 'packed':
    return [method === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup'];
  case 'ready_for_pickup':
    return ['completed'];
  case 'out_for_delivery':
    return String(order?.deliveryJob?.status || '').trim().toLowerCase() === 'delivered'
      ? ['completed']
      : [];
  default:
    return [];
  }
};

export const isCompletionPaymentPending = (order = {}) => {
  const fulfillmentStatus = String(order?.fulfillment_status || '').trim();
  const orderMethod = String(order?.order_method || '').trim();
  const paymentStatus = String(order?.payment_status || '').trim().toLowerCase();
  return (
    (orderMethod === 'pickup' && fulfillmentStatus === 'ready_for_pickup')
    || (orderMethod === 'delivery' && fulfillmentStatus === 'out_for_delivery' && String(order?.deliveryJob?.status || '').trim().toLowerCase() === 'delivered')
  ) && paymentStatus !== 'paid';
};

export const FULFILLMENT_ACTION_LABELS = Object.freeze({
  confirmed: 'Confirm',
  rejected: 'Reject',
  preparing: 'Start Preparing',
  packed: 'Mark Packed',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  completed: 'Complete'
});

export const DELIVERY_JOB_STATUS_LABELS = Object.freeze({
  pending_dispatch: 'Pending Dispatch',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled'
});

export const isManualDeliveryJob = (deliveryJob = {}) => (
  String(deliveryJob?.provider || 'manual').trim().toLowerCase() === 'manual'
);

export const hasCompleteDeliveryAssignment = (deliveryJob = {}) => Boolean(
  (Number(deliveryJob?.delivery_personnel_id) > 0 || String(deliveryJob?.delivery_personnel_name || '').trim())
  && Number(deliveryJob?.assigned_by) > 0
  && Number(deliveryJob?.assigned_shift_id) > 0
  && deliveryJob?.assigned_at
);

const DELIVERY_JOB_TRANSITIONS = Object.freeze({
  pending_dispatch: 'assigned',
  assigned: 'picked_up',
  picked_up: 'delivered'
});

export const getNextDeliveryJobStatus = (order = {}) => {
  if (String(order?.order_method || '').trim() !== 'delivery') return null;
  if (String(order?.fulfillment_status || '').trim() !== 'out_for_delivery') return null;
  const currentStatus = String(order?.deliveryJob?.status || '').trim();
  return DELIVERY_JOB_TRANSITIONS[currentStatus] || null;
};

export const getDeliveryJobActionLabel = (status) => {
  switch (String(status || '').trim()) {
  case 'assigned': return 'Assign Delivery';
  case 'picked_up': return 'Mark Picked Up';
  case 'delivered': return 'Mark Delivered';
  default: return DELIVERY_JOB_STATUS_LABELS[status] || status;
  }
};

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
    if (orderMethod === 'pickup') return 'Pickup';
  }
  return FULFILLMENT_ACTION_LABELS[normalizedStatus] || FULFILLMENT_STATUS_LABELS[normalizedStatus] || status;
};

export const getIncomingOrderUtilityActions = (order = {}) => {
  const current = String(order.fulfillment_status || '').trim();
  const method = String(order.order_method || '').trim();
  switch (current) {
  case 'placed':
    return ['open_order'];
  case 'confirmed':
    return ['print_order', 'open_order'];
  case 'preparing':
  case 'packed':
    return method === 'delivery'
      ? ['print_order', 'open_order']
      : ['print_receipt', 'open_order'];
  case 'ready_for_pickup':
  case 'out_for_delivery':
    return ['open_order'];
  default:
    return [];
  }
};
