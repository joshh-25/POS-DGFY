const PAYMENT_TIMING_VALUES = Object.freeze(['upfront', 'on_pickup', 'on_delivery']);

export const PAYMENT_TIMINGS = PAYMENT_TIMING_VALUES;

export const resolvePaymentTiming = ({ orderMethod, paymentType } = {}) => {
    const normalizedOrderMethod = String(orderMethod || '').trim().toLowerCase();
    const normalizedPaymentType = String(paymentType || '').trim().toLowerCase();

    if (normalizedOrderMethod === 'delivery' && normalizedPaymentType === 'cash') {
        return 'on_delivery';
    }
    if (normalizedOrderMethod === 'pickup' && normalizedPaymentType === 'cash') {
        return 'on_pickup';
    }
    return 'upfront';
};

export const isCodDelivery = ({ orderMethod, paymentType, paymentTiming } = {}) => (
    String(orderMethod || '').trim().toLowerCase() === 'delivery'
    && String(paymentType || '').trim().toLowerCase() === 'cash'
    && String(paymentTiming || '').trim().toLowerCase() === 'on_delivery'
);
