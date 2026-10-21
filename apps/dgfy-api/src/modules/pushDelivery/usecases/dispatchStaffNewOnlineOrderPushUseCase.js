import logger from '../../../config/logger.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import { hashExpoPushToken, toSafePushErrorCode } from '../utils/pushTokenSecurity.js';
import { pickReservationReason } from '../utils/dispatchEventRecorder.js';

const TOKEN_HOURLY_LIMIT = 10;
const ORDER_PURPOSE_LIMIT = 50;
const MAX_BATCH_SIZE = 100;
const POS_VIEW_PERMISSION = PERMISSIONS.POS.actions.VIEW_POS;

const chunk = (items, size) => {
    const result = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
};

const positiveId = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const activeUser = (user) => (
    (user?.is_active === true || user?.is_active === 1)
    && (user?.deleted_at === null || user?.deleted_at === undefined)
);

const canViewPos = (user) => (
    hasEffectivePermission(user, POS_VIEW_PERMISSION)
);

const logSafeWarning = (message, error) => logger.warn(message, {
    error_code: toSafePushErrorCode(error?.code || error?.name, 'push_dispatch_failed')
});

const buildMessage = ({ token, locationId, orderId }) => ({
    to: token,
    title: 'New online order',
    body: 'A new online order is waiting in POS.',
    data: {
        event: 'pos_new_online_order',
        order_id: orderId,
        location_id: locationId
    }
});

export const buildDispatchStaffNewOnlineOrderPushUseCase = ({
    deviceRepository,
    logRepository,
    audienceRepository,
    adapterResolver,
    resolveLocation,
    recordEvent = null,
    hashToken = hashExpoPushToken,
    now = () => new Date()
}) => {
    const run = async ({ tenantId, order } = {}) => {
        try {
            const normalizedTenantId = String(tenantId || '').trim();
            const orderId = positiveId(order?.pos_transaction_id);
            if (!normalizedTenantId || !orderId || String(order?.order_source || '').trim() !== 'online_store') {
                return { status: 'skipped', reason: 'missing_or_unsupported_order_identity' };
            }
            if (process.env.PUSH_DELIVERY_LOG_ENABLED === 'false') {
                return { status: 'skipped', reason: 'delivery_logging_disabled' };
            }

            const tokens = await deviceRepository.listActiveForStaffTenant(normalizedTenantId);
            if (!tokens.length) return { status: 'skipped', reason: 'no_active_tokens' };

            const users = await audienceRepository.listActiveStaffUsers();
            const usersById = new Map(users.map((user) => [Number(user.user_id), user]));
            const tokensByUser = new Map();
            for (const tokenRow of tokens) {
                const userId = positiveId(tokenRow?.staff_user_id);
                if (!userId || !tokenRow?.token || !usersById.has(userId)) continue;
                if (!tokensByUser.has(userId)) tokensByUser.set(userId, []);
                tokensByUser.get(userId).push(tokenRow);
            }

            const requestedLocationId = order?.location_id == null ? null : positiveId(order.location_id);
            if (order?.location_id != null && !requestedLocationId) {
                return { status: 'skipped', reason: 'invalid_order_location' };
            }
            const eligible = [];
            for (const [userId, userTokens] of tokensByUser) {
                const user = usersById.get(userId);
                if (!activeUser(user)) continue;
                try {
                    if (!canViewPos(user)) continue;
                    const location = await resolveLocation({
                        requestedLocationId,
                        userId,
                        operationLabel: 'new online-order push'
                    });
                    const locationId = positiveId(location?.location_id) || null;
                    for (const tokenRow of userTokens) eligible.push({ tokenRow, locationId });
                } catch {
                    // Eligibility is checked per user so one stale grant or tenant row does not drop
                    // notifications to other staff members.
                }
            }
            if (!eligible.length) return { status: 'skipped', reason: 'no_authorized_staff_tokens' };

            const currentTime = now();
            const messages = [];
            const reservationCounts = {};
            let hashFailures = 0;
            const seenTokens = new Set();
            for (const { tokenRow, locationId } of eligible) {
                if (seenTokens.has(tokenRow.token)) continue;
                seenTokens.add(tokenRow.token);

                let tokenHash;
                try {
                    tokenHash = hashToken(tokenRow.token);
                } catch (error) {
                    logSafeWarning('[Push] Token hashing failed; staff delivery was skipped', error);
                    hashFailures += 1;
                    continue;
                }

                const reservation = await logRepository.reservePending({
                    dedupe_key: `staff:order:${normalizedTenantId}:${orderId}:new_online_order:${tokenRow.id}`,
                    token_id: tokenRow.id,
                    token_hash: tokenHash,
                    purpose: 'staff_new_online_order',
                    status: 'pending',
                    simulated: false,
                    ticket_id: null,
                    receipt_status: null,
                    receipt_checked_at: null,
                    error_code: null,
                    tenant_id: normalizedTenantId,
                    reference: String(orderId),
                    sent_at: currentTime
                }, {
                    tokenSince: new Date(currentTime.getTime() - 60 * 60 * 1000),
                    tokenLimit: TOKEN_HOURLY_LIMIT,
                    orderLimit: ORDER_PURPOSE_LIMIT,
                    owner: {
                        staff_tenant_id: normalizedTenantId,
                        staff_user_id: Number(tokenRow.staff_user_id)
                    }
                });
                reservationCounts[reservation.status] = (reservationCounts[reservation.status] || 0) + 1;
                if (reservation.status === 'order_limit') break;
                if (reservation.status !== 'created' || !reservation.log) continue;
                messages.push({
                    log: reservation.log,
                    message: buildMessage({ token: tokenRow.token, locationId, orderId })
                });
            }

            const { mode, adapter } = adapterResolver({
                onProductionFakeBlocked: () => logger.warn('[Push] Fake provider is disabled in production')
            });
            for (const batch of chunk(messages, MAX_BATCH_SIZE)) {
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
                    const status = ['accepted', 'rejected', 'failed', 'unconfigured'].includes(providerMode)
                        ? providerMode
                        : 'failed';
                    const errorCode = outcome.errorCode ? toSafePushErrorCode(outcome.errorCode) : null;
                    await logRepository.updateById(item.log.id, {
                        status,
                        simulated: mode === 'fake' || outcome.simulated === true,
                        ticket_id: mode === 'expo' && status === 'accepted' ? outcome.ticketId || null : null,
                        error_code: errorCode
                    });
                    if (errorCode === 'devicenotregistered' || errorCode === 'device_not_registered') {
                        await deviceRepository.revokeTokenById(item.log.token_id, 'device_not_registered').catch(() => null);
                    }
                }
            }

            if (!messages.length) {
                return {
                    status: 'completed',
                    attempted: 0,
                    reason: hashFailures && !Object.keys(reservationCounts).length
                        ? 'token_hash_failed'
                        : pickReservationReason(reservationCounts)
                };
            }
            return { status: 'completed', attempted: messages.length };
        } catch (error) {
            logSafeWarning('[Push] New-online-order staff dispatch failed', error);
            return { status: 'failed', attempted: 0 };
        }
    };

    return async (args = {}) => {
        const result = await run(args);
        if (recordEvent) {
            await recordEvent({
                purpose: 'staff_new_online_order',
                result,
                tenantId: String(args?.tenantId || '').trim() || null,
                reference: positiveId(args?.order?.pos_transaction_id)
            });
        }
        return result;
    };
};

export default buildDispatchStaffNewOnlineOrderPushUseCase;
