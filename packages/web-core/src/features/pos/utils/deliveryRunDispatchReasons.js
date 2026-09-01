// Phase 228 (#1273/#1271). Pure reason_code -> operator message map for the delivery run dispatch
// endpoint's per-order `failed`/`skipped` reports and the whole-run 409 preconditions. Mirrors
// deliveryRunEligibility.js's own convention of keeping this kind of mapping as a standalone,
// dependency-free util so it is trivially unit-testable.

export const DELIVERY_RUN_DISPATCH_REASON_MESSAGES = Object.freeze({
  // Per-order `failed` reason codes (buildDispatchDeliveryRunUseCase's fan-out).
  ALREADY_DISPATCHED: 'Already dispatched.',
  DELIVERY_ORDER_REQUIRED: 'Not an online delivery order.',
  DELIVERY_JOB_REQUIRED: 'This order has no delivery job.',
  MANUAL_DELIVERY_JOB_REQUIRED: "This order's delivery job is not a manual delivery job.",
  ORDER_STATUS_TRANSITION_INVALID: "This order's current status can't move to out for delivery.",
  ORDER_METHOD_DELIVERY_REQUIRED: 'Only delivery orders can be dispatched.',
  DELIVERY_ASSIGNMENT_REQUIRED: 'Assign a delivery person to this order before dispatching.',
  DELIVERY_JOB_ASSIGNMENT_LOCKED: 'This order is no longer pending dispatch.',
  DELIVERY_RUN_LOCATION_MISMATCH: "This order's location does not match the run's location.",
  // Whole-run 409 preconditions (evaluated before the fan-out).
  DELIVERY_RUN_NOT_FOUND: 'This delivery run no longer exists.',
  DELIVERY_RUN_LOCKED: 'This run can no longer be dispatched.',
  DELIVERY_RUN_ACCOUNTABLE_REQUIRED: 'Set an accountable person on this run before dispatching.',
  DELIVERY_RUN_EMPTY: 'This run has no orders to dispatch.',
  DELIVERY_RUN_UNPACKED_MEMBERS: 'Every order must be packed before this run can be dispatched.'
});

export const getDeliveryRunDispatchReasonMessage = (reasonCode, fallback = 'This order could not be dispatched.') => (
  DELIVERY_RUN_DISPATCH_REASON_MESSAGES[reasonCode] || fallback
);

export default DELIVERY_RUN_DISPATCH_REASON_MESSAGES;
