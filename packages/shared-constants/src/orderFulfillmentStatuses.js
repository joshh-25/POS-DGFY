// Keep this vocabulary aligned with PosTransaction.fulfillment_status.
// The API guard test checks the model enum so a new status cannot silently
// disappear from queues or customer activity lists.
export const ONLINE_FULFILLMENT_STATUSES = Object.freeze([
    'placed',
    'confirmed',
    'preparing',
    'packed',
    'ready_for_rider',
    'ready_for_pickup',
    'out_for_delivery',
    'completed',
    'cancelled',
    'rejected'
]);

export const TERMINAL_FULFILLMENT_STATUSES = Object.freeze([
    'completed', 'cancelled', 'rejected'
]);

export const ACTIVE_FULFILLMENT_STATUSES = Object.freeze(
    ONLINE_FULFILLMENT_STATUSES.filter((status) => !TERMINAL_FULFILLMENT_STATUSES.includes(status))
);
