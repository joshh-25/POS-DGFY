import logger from '../../../config/logger.js';
import { toSafePushErrorCode } from './pushTokenSecurity.js';

// Policy skips and rate caps are expected behavior; everything else that stops a push before
// a per-token delivery log exists is an operator-relevant skip (missing device, bad input).
const SUPPRESSED_REASONS = new Set([
    'status_not_notifiable',
    'notification_not_created',
    'delivery_logging_disabled',
    'token_limit',
    'order_limit',
    'duplicate'
]);

const RESERVATION_REASON_PRECEDENCE = ['order_limit', 'token_limit', 'duplicate', 'stale_token'];

export const pickReservationReason = (counts = {}) => (
    RESERVATION_REASON_PRECEDENCE.find((reason) => counts[reason] > 0) || 'no_deliveries_created'
);

export const classifyDispatchResult = (result = {}) => {
    if (result.status === 'completed') {
        const attempted = Number(result.attempted || 0);
        if (attempted > 0) return { outcome: 'dispatched', reasonCode: 'dispatched', count: attempted };
        const reasonCode = toSafePushErrorCode(result.reason, 'no_deliveries_created');
        return { outcome: SUPPRESSED_REASONS.has(reasonCode) ? 'suppressed' : 'skipped', reasonCode, count: 0 };
    }
    if (result.status === 'skipped') {
        const reasonCode = toSafePushErrorCode(result.reason, 'skipped');
        return { outcome: SUPPRESSED_REASONS.has(reasonCode) ? 'suppressed' : 'skipped', reasonCode, count: 0 };
    }
    return { outcome: 'failed', reasonCode: 'dispatch_failed', count: 0 };
};

/**
 * Builds a recorder that persists one dispatch decision. It never throws: ADR 0097 Decision 8
 * says provider and logging failures must not fail checkout or a status transition.
 */
export const buildDispatchEventRecorder = ({ repository } = {}) => async ({
    purpose, result, tenantId = null, reference = null
} = {}) => {
    if (!repository) return;
    try {
        const { outcome, reasonCode, count } = classifyDispatchResult(result);
        await repository.create({
            purpose,
            outcome,
            reason_code: reasonCode,
            tenant_id: tenantId || null,
            reference: reference ? String(reference).slice(0, 32) : null,
            eligible_token_count: count
        });
    } catch (error) {
        logger.warn('[Push] Dispatch event was not recorded', {
            error_code: toSafePushErrorCode(error?.code || error?.name, 'push_dispatch_event_failed')
        });
    }
};

export default buildDispatchEventRecorder;
