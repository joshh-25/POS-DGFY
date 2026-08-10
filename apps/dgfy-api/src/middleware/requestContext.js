import crypto from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_ID_HEADER = 'x-trace-id';
const SENTRY_TRACE_HEADER = 'sentry-trace';
const SAFE_CONTEXT_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;
// `sentry-trace` is `<32-hex traceId>-<16-hex spanId>[-<0|1 sampled>]`. Only the
// trace id is useful here; the sampling flag and parent span are Sentry's own
// business (the SDK reads the raw header itself via httpIntegration).
const SENTRY_TRACE_PATTERN = /^([0-9a-f]{32})-/i;

export const normalizeContextId = (value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return SAFE_CONTEXT_ID_PATTERN.test(normalized) ? normalized : null;
};

// A browser that propagates distributed tracing sends `sentry-trace` on every
// API call. Adopting its trace id as our own `traceId` is what makes the
// `x-trace-id` response header (already in the CORS exposedHeaders list)
// paste-able straight into Sentry as a `trace:<id>` search -- one id spans the
// browser event and the backend event instead of two unrelated identifiers.
// Requests without the header (cron, internal callers, curl) keep the UUID, so
// the format is deliberately mixed; consumers must not assume UUID shape.
export const extractSentryTraceId = (value) => {
    if (typeof value !== 'string') return null;
    const match = SENTRY_TRACE_PATTERN.exec(value.trim());
    return match ? match[1].toLowerCase() : null;
};

export const requestContext = (req, res, next) => {
    const requestId = normalizeContextId(req.get(REQUEST_ID_HEADER)) || crypto.randomUUID();
    const traceId = normalizeContextId(req.get(TRACE_ID_HEADER))
        || extractSentryTraceId(req.get(SENTRY_TRACE_HEADER))
        || requestId;

    req.requestId = requestId;
    req.traceId = traceId;
    res.locals.requestId = requestId;
    res.locals.traceId = traceId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(TRACE_ID_HEADER, traceId);

    next();
};

export default requestContext;
