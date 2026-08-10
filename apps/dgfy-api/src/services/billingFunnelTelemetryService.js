const mergeMetadata = ({
    baseMetadata = {},
    metadata = {},
    route = null,
    outcome = null,
    failureCode = null,
    failureReason = null,
    httpStatus = null
} = {}) => {
    const merged = {
        ...(baseMetadata || {}),
        ...(metadata || {})
    };

    if (route && !Object.prototype.hasOwnProperty.call(merged, 'route')) {
        merged.route = route;
    }

    if (outcome) {
        merged.outcome = outcome;
    }

    if (failureCode) {
        merged.failure_code = failureCode;
    }

    if (failureReason) {
        merged.failure_reason = failureReason;
    }

    if (Number.isInteger(httpStatus)) {
        merged.http_status = httpStatus;
    }

    return merged;
};

export const emitBillingFunnelEvent = async ({
    trackEngagementEvent,
    eventType,
    source,
    requestId = null,
    traceId = null,
    tenantId = null,
    userId = null,
    subscriptionId = null,
    correlationId = null,
    providerEventId = null,
    providerEventTime = null,
    sessionId = null,
    experimentKey = null,
    variantKey = null,
    exposureId = null,
    metadata = {},
    baseMetadata = {},
    route = null,
    outcome = null,
    failureCode = null,
    failureReason = null,
    httpStatus = null,
    eventTime = new Date(),
    useIdempotency = true
} = {}) => {
    if (typeof trackEngagementEvent !== 'function' || !eventType) {
        return { created: false, skipped: true, reason: 'tracker_unavailable' };
    }

    return trackEngagementEvent({
        eventType,
        eventCategory: 'billing_funnel',
        eventVersion: 1,
        tenantId,
        userId,
        source,
        subscriptionId,
        correlationId,
        requestId: requestId || correlationId || null,
        traceId,
        outcome,
        failureCode,
        failureReason,
        providerEventId,
        providerEventTime,
        environment: process.env.NODE_ENV || 'development',
        surface: route,
        actorType: userId ? 'user' : 'system',
        isInternalActor: false,
        isBotSuspected: false,
        sessionId,
        experimentKey,
        variantKey,
        exposureId,
        metadata: mergeMetadata({
            baseMetadata,
            metadata,
            route,
            outcome,
            failureCode,
            failureReason,
            httpStatus
        }),
        eventTime,
        useIdempotency
    });
};

export const createBillingFunnelTracker = ({
    trackEngagementEvent,
    eventPrefix,
    source,
    route = null,
    requestId = null,
    traceId = null,
    tenantId = null,
    userId = null,
    subscriptionId = null,
    correlationId = null,
    baseMetadata = {},
    useIdempotency = true
} = {}) => {
    const emit = async (eventType, options = {}) => emitBillingFunnelEvent({
        trackEngagementEvent,
        eventType,
        source: options.source || source,
        route: options.route || route,
        requestId: options.requestId ?? requestId,
        traceId: options.traceId ?? traceId,
        tenantId: options.tenantId ?? tenantId,
        userId: options.userId ?? userId,
        subscriptionId: options.subscriptionId ?? subscriptionId,
        correlationId: options.correlationId ?? correlationId,
        providerEventId: options.providerEventId ?? null,
        providerEventTime: options.providerEventTime ?? null,
        sessionId: options.sessionId ?? null,
        experimentKey: options.experimentKey ?? null,
        variantKey: options.variantKey ?? null,
        exposureId: options.exposureId ?? null,
        baseMetadata,
        metadata: options.metadata || {},
        outcome: options.outcome || null,
        failureCode: options.failureCode || null,
        failureReason: options.failureReason || null,
        httpStatus: options.httpStatus ?? null,
        eventTime: options.eventTime || new Date(),
        useIdempotency: options.useIdempotency ?? useIdempotency
    });

    return {
        attempt: (options = {}) => emit(`${eventPrefix}_attempted`, {
            ...options,
            outcome: options.outcome || 'attempted'
        }),
        blocked: (reason, options = {}) => emit(`${eventPrefix}_blocked_${reason}`, {
            ...options,
            outcome: options.outcome || 'blocked',
            failureCode: options.failureCode || reason
        }),
        failed: (options = {}) => emit(`${eventPrefix}_failed`, {
            ...options,
            outcome: options.outcome || 'failed'
        }),
        failedSpecific: (reason, options = {}) => emit(`${eventPrefix}_failed_${reason}`, {
            ...options,
            outcome: options.outcome || 'failed',
            failureCode: options.failureCode || reason
        }),
        succeeded: (options = {}) => emit(`${eventPrefix}_succeeded`, {
            ...options,
            outcome: options.outcome || 'succeeded'
        }),
        custom: (eventType, options = {}) => emit(eventType, options)
    };
};

export default {
    emitBillingFunnelEvent,
    createBillingFunnelTracker
};
