import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import db from '../models/index.js';
import logger from '../config/logger.js';

const NO_TABLE_ERRORS = new Set(['ER_NO_SUCH_TABLE', 'SQLITE_ERROR', '42P01']);
const MAX_WRITE_AUDIT_ENTRIES = 500;
const writeAuditLog = [];
const LEGACY_COMPATIBILITY_ERROR_CODES = new Set(['ER_BAD_FIELD_ERROR', '42703']);

const buildIdempotencyKey = ({ eventType, tenantId, userId, subscriptionId, correlationId }) => {
    const base = [
        String(eventType || ''),
        String(tenantId || ''),
        String(userId || ''),
        String(subscriptionId || ''),
        String(correlationId || '')
    ].join('|');

    return crypto.createHash('sha256').update(base).digest('hex');
};

const recordWriteAudit = ({ eventType, status, reason = null, created = false, timestamp = new Date() }) => {
    writeAuditLog.push({
        eventType: eventType || null,
        status,
        reason,
        created,
        timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp)
    });

    if (writeAuditLog.length > MAX_WRITE_AUDIT_ENTRIES) {
        writeAuditLog.splice(0, writeAuditLog.length - MAX_WRITE_AUDIT_ENTRIES);
    }
};

const isUnknownColumnError = (error) => {
    const code = error?.original?.code || error?.original?.sqlState || error?.code;
    return LEGACY_COMPATIBILITY_ERROR_CODES.has(code)
        || /unknown column/i.test(error?.message || '')
        || /has no column named/i.test(error?.message || '');
};

const buildLegacyPayload = (payload) => ({
    event_type: payload.event_type,
    tenant_id: payload.tenant_id,
    user_id: payload.user_id,
    source: payload.source,
    subscription_id: payload.subscription_id,
    correlation_id: payload.correlation_id,
    idempotency_key: payload.idempotency_key,
    metadata: payload.metadata,
    event_time: payload.event_time
});

const insertLegacyPayload = async (sequelizeInstance, payload) => {
    await sequelizeInstance.query(
        `INSERT INTO engagement_events
        (id, event_type, tenant_id, user_id, source, subscription_id, correlation_id, idempotency_key, metadata, event_time, created_at)
        VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        {
            replacements: [
                payload.event_type,
                payload.tenant_id,
                payload.user_id,
                payload.source,
                payload.subscription_id,
                payload.correlation_id,
                payload.idempotency_key,
                JSON.stringify(payload.metadata || {}),
                payload.event_time
            ],
            type: QueryTypes.INSERT
        }
    );
};

const findLegacyEventByIdempotencyKey = async (sequelizeInstance, idempotencyKey) => {
    const rows = await sequelizeInstance.query(
        `SELECT id, event_type, tenant_id, user_id, source, subscription_id, correlation_id, idempotency_key, metadata, event_time
         FROM engagement_events
         WHERE idempotency_key = ?
         LIMIT 1`,
        {
            replacements: [idempotencyKey],
            type: QueryTypes.SELECT
        }
    );

    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};

export const getEngagementWriteAuditStats = ({
    now = new Date(),
    lookbackHours = 24
} = {}) => {
    const windowStart = new Date(now.getTime() - (lookbackHours * 60 * 60 * 1000));
    const relevantEntries = writeAuditLog.filter((entry) => entry.timestamp >= windowStart);

    const countByReason = (reason) => relevantEntries.filter((entry) => entry.reason === reason).length;

    return {
        windowStart: windowStart.toISOString(),
        windowEnd: now.toISOString(),
        totalTracked: relevantEntries.length,
        writeFailedCount: countByReason('write_failed'),
        tableMissingCount: countByReason('table_missing'),
        modelUnavailableCount: countByReason('model_unavailable'),
        missingEventTypeCount: countByReason('missing_event_type'),
        skippedCount: relevantEntries.filter((entry) => entry.status === 'skipped').length
    };
};

export const __resetEngagementWriteAuditForTests = () => {
    writeAuditLog.length = 0;
};

export const trackEngagementEvent = async ({
    eventType,
    eventCategory = null,
    eventVersion = 1,
    tenantId = null,
    userId = null,
    source = 'backend',
    subscriptionId = null,
    correlationId = null,
    requestId = null,
    traceId = null,
    outcome = null,
    failureCode = null,
    failureReason = null,
    providerEventId = null,
    providerEventTime = null,
    ingestedAt = new Date(),
    processedAt = null,
    environment = process.env.NODE_ENV || 'development',
    surface = null,
    platform = null,
    actorType = null,
    isInternalActor = null,
    isBotSuspected = null,
    sessionId = null,
    experimentKey = null,
    variantKey = null,
    exposureId = null,
    metadata = {},
    eventTime = new Date(),
    useIdempotency = false
} = {}) => {
    if (!eventType) {
        recordWriteAudit({
            eventType,
            status: 'skipped',
            reason: 'missing_event_type'
        });
        return { created: false, skipped: true, reason: 'missing_event_type' };
    }

    const EngagementEvent = global.__ENGAGEMENT_EVENT_MODEL_OVERRIDE__ || db?.EngagementEvent;

    if (!EngagementEvent) {
        logger.warn(`[Engagement] EngagementEvent model unavailable. eventType=${eventType}`);
        recordWriteAudit({
            eventType,
            status: 'skipped',
            reason: 'model_unavailable'
        });
        return { created: false, skipped: true, reason: 'model_unavailable' };
    }

    try {
        const payload = {
            event_type: eventType,
            event_category: eventCategory,
            event_version: eventVersion,
            tenant_id: tenantId,
            user_id: userId,
            source,
            subscription_id: subscriptionId,
            correlation_id: correlationId,
            request_id: requestId,
            trace_id: traceId,
            outcome,
            failure_code: failureCode,
            failure_reason: failureReason,
            provider_event_id: providerEventId,
            provider_event_time: providerEventTime,
            ingested_at: ingestedAt,
            processed_at: processedAt,
            environment,
            surface,
            platform,
            actor_type: actorType,
            is_internal_actor: isInternalActor,
            is_bot_suspected: isBotSuspected,
            session_id: sessionId,
            experiment_key: experimentKey,
            variant_key: variantKey,
            exposure_id: exposureId,
            metadata,
            event_time: eventTime
        };

        if (useIdempotency) {
            const idempotencyKey = buildIdempotencyKey({
                eventType,
                tenantId,
                userId,
                subscriptionId,
                correlationId
            });

            const defaults = { ...payload, idempotency_key: idempotencyKey };
            let event;
            let created;

            try {
                [event, created] = await EngagementEvent.findOrCreate({
                    where: { idempotency_key: idempotencyKey },
                    defaults
                });
            } catch (error) {
                if (!isUnknownColumnError(error)) {
                    throw error;
                }

                logger.warn(`[Engagement] Falling back to legacy engagement_events schema for ${eventType}`);
                const legacyPayload = buildLegacyPayload(defaults);
                const existing = await findLegacyEventByIdempotencyKey(db.sequelize, idempotencyKey);
                if (existing) {
                    event = existing;
                    created = false;
                } else {
                    await insertLegacyPayload(db.sequelize, legacyPayload);
                    event = legacyPayload;
                    created = true;
                }
            }

            recordWriteAudit({
                eventType,
                status: created ? 'created' : 'deduped',
                created
            });
            return { created, event };
        }

        let event;
        try {
            event = await EngagementEvent.create(payload);
        } catch (error) {
            if (!isUnknownColumnError(error)) {
                throw error;
            }

            logger.warn(`[Engagement] Falling back to legacy engagement_events schema for ${eventType}`);
            const legacyPayload = buildLegacyPayload(payload);
            await insertLegacyPayload(db.sequelize, legacyPayload);
            event = legacyPayload;
        }
        recordWriteAudit({
            eventType,
            status: 'created',
            created: true
        });
        return { created: true, event };
    } catch (error) {
        const code = error?.original?.code || error?.original?.sqlState || error?.code;
        if (NO_TABLE_ERRORS.has(code)) {
            logger.warn(`[Engagement] engagement_events table missing. eventType=${eventType}`);
            recordWriteAudit({
                eventType,
                status: 'skipped',
                reason: 'table_missing'
            });
            return { created: false, skipped: true, reason: 'table_missing' };
        }

        logger.warn(`[Engagement] Failed to track event ${eventType}: ${error.message}`);
        recordWriteAudit({
            eventType,
            status: 'failed',
            reason: 'write_failed'
        });
        return { created: false, skipped: true, reason: 'write_failed' };
    }
};

export default {
    trackEngagementEvent,
    getEngagementWriteAuditStats,
    __resetEngagementWriteAuditForTests
};
