import { DGFY_BACKEND_BASE_URL } from '../config/env.js';

const FORWARDED_HEADERS = [
    'authorization',
    'x-company-token',
    'x-request-id',
    'x-dgfy-auth-mode',
    'user-agent'
];

export const buildBackendUrl = (path) => `${DGFY_BACKEND_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const buildForwardHeaders = (req) => {
    const headers = {};
    for (const name of FORWARDED_HEADERS) {
        const value = req.headers?.[name];
        if (Array.isArray(value)) {
            headers[name] = value.join(', ');
        } else if (value) {
            headers[name] = value;
        }
    }
    return headers;
};

export const proxyBackendJson = async (req, res, {
    path,
    method = req.method,
    unavailableMessage = 'DGFY backend is temporarily unavailable.'
}) => {
    try {
        const upstreamResponse = await fetch(buildBackendUrl(path), {
            method,
            headers: buildForwardHeaders(req)
        });

        const rawBody = await upstreamResponse.text();
        const contentType = upstreamResponse.headers.get('content-type') || '';
        res.status(upstreamResponse.status);

        if (contentType.includes('application/json')) {
            return res.json(rawBody ? JSON.parse(rawBody) : null);
        }

        return res.json({
            success: upstreamResponse.ok,
            data: rawBody || null,
            message: upstreamResponse.statusText || ''
        });
    } catch (error) {
        return res.status(502).json({
            success: false,
            data: null,
            message: unavailableMessage
        });
    }
};
