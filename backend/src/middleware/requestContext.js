import crypto from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';

export const requestContext = (req, res, next) => {
    const incomingRequestId = req.get(REQUEST_ID_HEADER);
    const requestId = typeof incomingRequestId === 'string' && incomingRequestId.trim().length > 0
        ? incomingRequestId.trim()
        : crypto.randomUUID();

    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
};

export default requestContext;
