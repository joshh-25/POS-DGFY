// Maps a push_delivery_logs row to one operator-facing state. These labels describe what the
// provider pipeline reported; none of them claims a notification was shown or seen on a device.
export const DELIVERY_STATES = Object.freeze({
    NO_PROVIDER: 'no_provider',
    PENDING_DISPATCH: 'pending_dispatch',
    SEND_FAILED: 'send_failed',
    REJECTED_BY_EXPO: 'rejected_by_expo',
    ACCEPTED_RECEIPT_PENDING: 'accepted_receipt_pending',
    RECEIPT_OK: 'receipt_ok',
    RECEIPT_ERROR: 'receipt_error',
    RECEIPT_OTHER: 'receipt_other'
});

export const deriveDeliveryState = (row = {}) => {
    const status = String(row.status || '').toLowerCase();
    if (status === 'unconfigured' || row.simulated === true) return DELIVERY_STATES.NO_PROVIDER;
    if (status === 'pending') return DELIVERY_STATES.PENDING_DISPATCH;
    if (status === 'failed') return DELIVERY_STATES.SEND_FAILED;
    if (status === 'rejected') return DELIVERY_STATES.REJECTED_BY_EXPO;
    if (status === 'accepted') {
        const receipt = String(row.receipt_status || '').toLowerCase();
        if (!receipt) return DELIVERY_STATES.ACCEPTED_RECEIPT_PENDING;
        if (receipt === 'ok') return DELIVERY_STATES.RECEIPT_OK;
        if (receipt === 'error') return DELIVERY_STATES.RECEIPT_ERROR;
        return DELIVERY_STATES.RECEIPT_OTHER;
    }
    return DELIVERY_STATES.SEND_FAILED;
};

export default deriveDeliveryState;
