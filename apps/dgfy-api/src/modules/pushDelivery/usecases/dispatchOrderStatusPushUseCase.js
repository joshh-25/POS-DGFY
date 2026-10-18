import logger from '../../../config/logger.js';
import { PUSH_NOTIFICATION_STATUSES, STATUS_COPY } from '../utils/orderStatusCopy.js';
import { hashExpoPushToken, toSafePushErrorCode } from '../utils/pushTokenSecurity.js';

const TOKEN_HOURLY_LIMIT = 10;
const ORDER_LIFETIME_LIMIT = 15;
const MAX_BATCH_SIZE = 100;
const FINAL_STATUSES = new Set(['completed', 'cancelled', 'rejected']);
const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const normalizeReference = (value) => String(value || '').trim().toUpperCase();
const chunk = (items, size) => {
    const result = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
};

const eventKeyFor = (activity, status) => {
    const tenantId = String(activity?.tenant_id || 'tenant');
    const reference = normalizeReference(activity?.reference) || String(activity?.display_snapshot?.order_id || 'order');
    return `order:${activity?.activity_id || `${tenantId}:${reference}`}:${status}`;
};

const makeMessage = ({ token, title, body, trackingPin, storeSlug }) => ({
    to: token,
    title,
    body,
    data: {
        tracking_pin: trackingPin,
        ...(storeSlug ? { store_slug: storeSlug } : {})
    }
});

const logSafeWarning = (message, error) => logger.warn(message, {
    error_code: toSafePushErrorCode(error?.code || error?.name, 'push_dispatch_failed')
});

export const buildDispatchOrderStatusPushUseCase = ({
    deviceRepository,
    logRepository,
    adapterResolver,
    hashToken = hashExpoPushToken,
    now = () => new Date()
}) => {
    const dispatch = async ({ activity = {}, eventKey = null, ownerType } = {}) => {
        const status = normalizeStatus(activity.status);
        const reference = normalizeReference(activity.reference);
        const tenantId = String(activity.tenant_id || '').trim();
        const accountId = String(activity.dgfy_account_id || '').trim();
        const orderId = Number(activity.display_snapshot?.order_id || 0);
        const isGuestFinal = ownerType === 'guest' && FINAL_STATUSES.has(status);

        try {
            if (!PUSH_NOTIFICATION_STATUSES.has(status)) return { status: 'skipped', reason: 'status_not_notifiable' };
            if (!reference || !tenantId || (ownerType === 'account' && !accountId)) {
                return { status: 'skipped', reason: 'missing_order_identity' };
            }
            if (!orderId && ownerType === 'guest') return { status: 'skipped', reason: 'missing_order_id' };
            if (process.env.PUSH_DELIVERY_LOG_ENABLED === 'false') {
                return { status: 'skipped', reason: 'delivery_logging_disabled' };
            }

            let tokens = ownerType === 'account'
                ? await deviceRepository.listActiveForAccount(accountId)
                : await deviceRepository.listActiveForGuestOrder({ tenantId, reference, posTransactionId: orderId });
            const seenTokens = new Set();
            tokens = tokens.filter((row) => {
                const token = String(row?.token || '');
                if (!token || seenTokens.has(token)) return false;
                seenTokens.add(token);
                return true;
            });
            if (!tokens.length) return { status: 'skipped', reason: 'no_active_tokens' };

            const [title, body] = STATUS_COPY[status] || ['Order updated', 'Your order status changed.'];
            const storeSlug = await deviceRepository.findPublicStoreSlug({
                tenantId,
                locationId: activity.location_id || null
            }).catch(() => null);
            const messageKey = eventKey || eventKeyFor(activity, status);
            const deliveryRef = [];
            const currentTime = now();
            const expectedOwner = ownerType === 'account'
                ? { dgfy_account_id: accountId }
                : {
                    guest_tenant_id: tenantId,
                    guest_order_reference: reference,
                    guest_pos_transaction_id: orderId
                };

            for (const tokenRow of tokens) {
                const dedupeKey = `${messageKey}:${tokenRow.id}`;

                let tokenHash;
                try {
                    tokenHash = hashToken(tokenRow.token);
                } catch (error) {
                    logSafeWarning('[Push] Token hashing failed; delivery was skipped', error);
                    continue;
                }

                const reservation = await logRepository.reservePending({
                    dedupe_key: dedupeKey,
                    token_id: tokenRow.id,
                    token_hash: tokenHash,
                    purpose: 'order_status',
                    status: 'pending',
                    simulated: false,
                    ticket_id: null,
                    receipt_status: null,
                    receipt_checked_at: null,
                    error_code: null,
                    tenant_id: tenantId,
                    reference,
                    sent_at: currentTime
                }, {
                    tokenSince: new Date(currentTime.getTime() - 60 * 60 * 1000),
                    tokenLimit: TOKEN_HOURLY_LIMIT,
                    orderLimit: ORDER_LIFETIME_LIMIT,
                    owner: expectedOwner
                });
                if (reservation.status === 'order_limit') break;
                if (reservation.status !== 'created' || !reservation.log) continue;
                deliveryRef.push({
                    log: reservation.log,
                    message: makeMessage({
                        token: tokenRow.token,
                        title,
                        body,
                        trackingPin: reference,
                        storeSlug
                    })
                });
            }

            const { mode, adapter } = adapterResolver({
                onProductionFakeBlocked: () => logger.warn('[Push] Fake provider is disabled in production')
            });
            for (const batch of chunk(deliveryRef, MAX_BATCH_SIZE)) {
                let outcomes;
                try {
                    outcomes = await adapter.send(batch.map((item) => item.message));
                    if (!Array.isArray(outcomes)) outcomes = [];
                } catch (error) {
                    const errorCode = toSafePushErrorCode(error?.code, 'provider_send_failed');
                    for (const item of batch) {
                        await logRepository.updateById(item.log.id, { status: 'failed', error_code: errorCode }).catch(() => null);
                    }
                    continue;
                }

                for (let index = 0; index < batch.length; index += 1) {
                    const item = batch[index];
                    const outcome = outcomes[index] || { status: 'failed', errorCode: 'missing_ticket' };
                    const providerMode = mode === 'unconfigured' ? 'unconfigured' : outcome.status;
                    const statusValue = ['accepted', 'rejected', 'failed', 'unconfigured'].includes(providerMode)
                        ? providerMode
                        : 'failed';
                    const errorCode = outcome.errorCode ? toSafePushErrorCode(outcome.errorCode) : null;
                    await logRepository.updateById(item.log.id, {
                        status: statusValue,
                        simulated: mode === 'fake' || outcome.simulated === true,
                        ticket_id: mode === 'expo' && statusValue === 'accepted' ? outcome.ticketId || null : null,
                        error_code: errorCode
                    });
                    if (errorCode === 'devicenotregistered' || errorCode === 'device_not_registered') {
                        await deviceRepository.revokeTokenById(item.log.token_id, 'device_not_registered').catch(() => null);
                    }
                }
            }

            return { status: 'completed', attempted: deliveryRef.length };
        } catch (error) {
            logSafeWarning('[Push] Order-status dispatch failed', error);
            return { status: 'failed', attempted: 0 };
        } finally {
            if (isGuestFinal && tenantId && reference) {
                await deviceRepository.revokeGuestOrderTokens({
                    tenantId,
                    reference,
                    posTransactionId: orderId || null,
                    reason: 'order_final'
                }).catch(() => null);
            }
        }
    };

    return {
        dispatchAccount: (activity, { eventKey: key = null, created = false } = {}) => (
            created ? dispatch({ activity, eventKey: key, ownerType: 'account' }) : Promise.resolve({ status: 'skipped', reason: 'notification_not_created' })
        ),
        dispatchGuest: (activity) => dispatch({ activity, ownerType: 'guest' })
    };
};

export default buildDispatchOrderStatusPushUseCase;
