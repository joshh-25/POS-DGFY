import crypto from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_ID_HEADER = 'x-trace-id';
const SAFE_CONTEXT_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

export const normalizeContextId = (value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return SAFE_CONTEXT_ID_PATTERN.test(normalized) ? normalized : null;
};

export const requestContext = (req, res, next) => {
    const requestId = normalizeContextId(req.get(REQUEST_ID_HEADER)) || crypto.randomUUID();
    const traceId = normalizeContextId(req.get(TRACE_ID_HEADER)) || requestId;

    req.requestId = requestId;
    req.traceId = traceId;
    res.locals.requestId = requestId;
    res.locals.traceId = traceId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(TRACE_ID_HEADER, traceId);

    next();
};

export default requestContext;
