import requestOutcomeLogger from '../config/requestOutcomeLogger.js';
import {
    getStatusClass,
    hashIp,
    isStructuredRequestLoggingEnabled,
    normalizeRouteForObservability,
    resolveSurface,
    resolveUserAgentFamily,
    STRUCTURED_REQUEST_LOG_EVENT
} from '../services/observabilityUtils.js';

export const buildRequestOutcome = (req, res, startedAt = Date.now()) => {
    const status = Number(res.statusCode) || 0;
    const durationMs = Math.max(Date.now() - startedAt, 0);
    const requestId = req.requestId || res.locals?.requestId || null;
    const traceId = req.traceId || res.locals?.traceId || requestId;

    return {
        event: STRUCTURED_REQUEST_LOG_EVENT,
        request_id: requestId,
        trace_id: traceId,
        method: req.method || 'UNKNOWN',
        route: normalizeRouteForObservability(req),
        status,
        status_class: getStatusClass(status),
        duration_ms: durationMs,
        surface: resolveSurface(req),
        tenant_id: req.tenant?.id || req.tenantId || res.locals?.tenantId || null,
        user_id: req.user?.user_id || req.user?.id || res.locals?.userId || null,
        error_code: res.locals?.errorCode || null,
        csrf_failure_reason: req.csrfFailureReason || null,
        ip_hash: hashIp(req.ip || req.connection?.remoteAddress),
        user_agent_family: resolveUserAgentFamily(req.get?.('user-agent'))
    };
};

export const createRequestOutcomeLogger = ({
    logger = requestOutcomeLogger,
    enabled = isStructuredRequestLoggingEnabled
} = {}) => (req, res, next) => {
    if (!enabled()) {
        return next();
    }

    const startedAt = Date.now();
    res.on('finish', () => {
        logger.info(STRUCTURED_REQUEST_LOG_EVENT, buildRequestOutcome(req, res, startedAt));
    });

    return next();
};

export default createRequestOutcomeLogger();
