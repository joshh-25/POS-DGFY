import { EventEmitter } from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(0);

const channelForAccount = (dgfyAccountId) => `dgfy-customer:${String(dgfyAccountId || '').trim()}`;

export const publishDgfyCustomerEvent = (dgfyAccountId, eventType, payload = {}) => {
    const accountId = String(dgfyAccountId || '').trim();
    const type = String(eventType || '').trim();
    if (!accountId || !type) return false;
    bus.emit(channelForAccount(accountId), {
        type,
        payload,
        emitted_at: new Date().toISOString()
    });
    return true;
};

export const subscribeDgfyCustomerEvents = (dgfyAccountId, listener) => {
    const accountId = String(dgfyAccountId || '').trim();
    if (!accountId || typeof listener !== 'function') return () => {};
    const channel = channelForAccount(accountId);
    bus.on(channel, listener);
    return () => bus.off(channel, listener);
};

export default {
    publishDgfyCustomerEvent,
    subscribeDgfyCustomerEvents
};
