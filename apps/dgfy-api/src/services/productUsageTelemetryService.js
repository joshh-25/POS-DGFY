import logger from '../config/logger.js';
import { trackEngagementEvent } from './engagementService.js';

const fallbackNow = () => new Date();

const normalizeHeaderValue = (value) => {
    if (Array.isArray(value)) {
        return value[0] || null;
    }
    return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const resolveRequestId = (req) => (
    req?.requestId
    || normalizeHeaderValue(req?.headers?.['x-request-id'])
    || normalizeHeaderValue(req?.headers?.['x-correlation-id'])
    || null
);

const resolveTraceId = (req) => (
    normalizeHeaderValue(req?.headers?.['x-trace-id'])
    || normalizeHeaderValue(req?.headers?.traceparent)
    || null
);

const resolveSessionId = (req) => (
    normalizeHeaderValue(req?.headers?.['x-session-id'])
    || normalizeHeaderValue(req?.headers?.['x-client-session-id'])
    || null
);

const resolveUserAgent = (req) => normalizeHeaderValue(req?.headers?.['user-agent']) || null;

const resolveRoute = (req) => req?.originalUrl || req?.baseUrl || req?.route?.path || null;

const resolveTenantId = ({ req, user, tenantId }) => (
    tenantId
    || req?.tenant?.id
    || req?.tenant?.tenant_id
    || user?.tenant_id
    || req?.user?.tenant_id
    || null
);

const resolveUserId = ({ req, user }) => user?.user_id || req?.user?.user_id || null;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isBotLikeUserAgent = (userAgent) => (
    typeof userAgent === 'string'
    && /(bot|crawler|spider|headless|playwright|puppeteer|lighthouse|curl|wget|postman|insomnia)/i.test(userAgent)
);

const resolveInternalActor = ({ req, user }) => Boolean(
    user?.is_master_admin
    || req?.user?.is_master_admin
);

const resolveActorType = ({ req, user }) => (
    resolveInternalActor({ req, user }) ? 'internal_admin' : 'authenticated_user'
);

export const buildTrackProductUsageEvent = ({
    engagementTracker = trackEngagementEvent,
    loggerInstance = logger,
    nowProvider = fallbackNow
} = {}) => {
    return async ({
        req,
        user,
        tenantId,
        eventType,
        surface,
        action,
        outcome = 'success',
        metadata = {},
        failureCode = null,
        failureReason = null
    }) => {
        if (!eventType || !surface || !action) {
            return { skipped: true, reason: 'missing_required_fields' };
        }

        const resolvedTenantId = resolveTenantId({ req, user, tenantId });
        const resolvedUserId = resolveUserId({ req, user });

        if (!resolvedTenantId || !resolvedUserId) {
            return { skipped: true, reason: 'missing_identity' };
        }

        const requestId = resolveRequestId(req);
        const correlationId = requestId || `product:${eventType}:${resolvedUserId}:${nowProvider().getTime()}`;
        const userAgent = resolveUserAgent(req);

        try {
            return await engagementTracker({
                eventType,
                eventCategory: 'product_usage',
                eventVersion: 1,
                tenantId: resolvedTenantId,
                userId: resolvedUserId,
                source: 'api',
                correlationId,
                requestId,
                traceId: resolveTraceId(req),
                outcome,
                failureCode,
                failureReason,
                environment: process.env.NODE_ENV || 'development',
                surface,
                platform: 'backend_api',
                actorType: resolveActorType({ req, user }),
                isInternalActor: resolveInternalActor({ req, user }),
                isBotSuspected: isBotLikeUserAgent(userAgent),
                sessionId: resolveSessionId(req),
                metadata: {
                    ...metadata,
                    surface,
                    action,
                    route: resolveRoute(req),
                    method: req?.method || null,
                    user_agent: userAgent
                }
            });
        } catch (error) {
            loggerInstance.warn(
                `[ProductUsageTelemetry] Failed to track ${eventType}: ${error.message}`
            );
            return { skipped: true, reason: 'tracker_failed' };
        }
    };
};

export const buildTrackProductUsageFromResult = ({
    trackProductUsageEvent
}) => {
    return async ({
        req,
        user,
        tenantId,
        eventType,
        surface,
        action,
        result,
        successMetadataResolver = () => ({}),
        failureMetadataResolver = () => ({})
    }) => {
        const isSuccess = result?.success !== false;

        if (isSuccess) {
            const successMetadata = successMetadataResolver(result?.data);
            return trackProductUsageEvent({
                req,
                user,
                tenantId,
                eventType,
                surface,
                action,
                outcome: 'success',
                metadata: isObject(successMetadata) ? successMetadata : {}
            });
        }

        const error = result?.error || result || {};
        const failureMetadata = failureMetadataResolver(error);
        return trackProductUsageEvent({
            req,
            user,
            tenantId,
            eventType,
            surface,
            action,
            outcome: 'failure',
            failureCode: error?.code || null,
            failureReason: error?.message || null,
            metadata: {
                ...(isObject(failureMetadata) ? failureMetadata : {}),
                status_code: error?.statusCode || null
            }
        });
    };
};

export const trackProductUsageEvent = buildTrackProductUsageEvent();
export const trackProductUsageFromResult = buildTrackProductUsageFromResult({
    trackProductUsageEvent
});
