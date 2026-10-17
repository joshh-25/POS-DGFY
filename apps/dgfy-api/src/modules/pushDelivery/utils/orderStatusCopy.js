export const STATUS_COPY = Object.freeze({
    placed: ['Order placed', 'Your order was received by the store.'],
    confirmed: ['Order confirmed', 'The store confirmed your order.'],
    preparing: ['Order preparing', 'The store is preparing your order.'],
    ready_for_pickup: ['Ready for pickup', 'Your order is ready for pickup.'],
    out_for_delivery: ['Out for delivery', 'Your order is on the way.'],
    delivered: ['Order delivered', 'Your delivery was completed.'],
    picked_up: ['Order picked up', 'Your pickup order was completed.'],
    completed: ['Order completed', 'Your order was completed.'],
    cancelled: ['Order cancelled', 'Your order was cancelled.'],
    rejected: ['Order rejected', 'The store rejected your order.']
});

export const PUSH_NOTIFICATION_STATUSES = Object.freeze(new Set([
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'out_for_delivery',
    'completed',
    'rejected',
    'cancelled'
]));

export default STATUS_COPY;
