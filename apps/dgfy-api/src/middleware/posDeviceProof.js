import {
    assertPosDeviceProof,
    resolvePosDevicePolicy,
    canonicalRequestPath
} from '../modules/pos/services/posTerminalDeviceEnrollmentService.js';

const requestId = (req) => String(req?.headers?.['x-request-id'] || req?.requestId || '').trim() || null;
const header = (req, name) => String(req?.headers?.[name] || '').trim();
const bodyForProof = (req) => (
    req?.validatedData !== undefined ? req.validatedData : (req?.body === undefined ? null : req.body)
);
const normalizedClaim = (value) => String(value ?? '').trim().toUpperCase();
const terminalClaims = (req) => [
    header(req, 'x-pos-terminal-id'),
    req?.validatedData?.terminal_id,
    req?.body?.terminal_id,
    req?.query?.terminal_id
].map(normalizedClaim).filter(Boolean);
const terminalClaimsAgree = (req) => new Set(terminalClaims(req)).size <= 1;
const terminalIdForRequest = (req) => (
    header(req, 'x-pos-terminal-id')
    || String(req?.validatedData?.terminal_id || req?.body?.terminal_id || req?.query?.terminal_id || '').trim()
);
const locationIdForRequest = (req) => (
    req?.validatedData?.location_id
    ?? req?.body?.location_id
    ?? req?.query?.location_id
    ?? null
);
const proofForRequest = (req) => ({
    tenantId: req?.tenant?.id || req?.user?.tenant_id || null,
    terminalId: terminalIdForRequest(req),
    locationId: locationIdForRequest(req),
    deviceId: header(req, 'x-pos-device-id'),
    challenge: header(req, 'x-pos-device-challenge'),
    signature: header(req, 'x-pos-device-signature'),
    sessionId: header(req, 'x-pos-device-session-id'),
    purpose: 'request',
    method: req?.method || 'GET',
    path: req?.originalUrl || req?.path || '/',
    body: bodyForProof(req),
    requestId: requestId(req)
});

const isDeviceControlPath = (path) => {
    const normalized = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
    return normalized === '/terminal/devices'
        || normalized.startsWith('/terminal/devices/');
};

const sendFailure = (res, error) => {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 403;
    const errorCode = error?.details?.error_code || 'POS_DEVICE_PROOF_REQUIRED';
    return res.status(statusCode).json({
        success: false,
        data: null,
        message: error?.message || 'A valid POS device proof is required.',
        error_code: errorCode,
        errors: error?.details || { error_code: errorCode },
        timestamp: new Date().toISOString()
    });
};

const terminalMismatchError = () => {
    const error = new Error('POS terminal identity claims do not match.');
    error.statusCode = 403;
    error.details = { error_code: 'POS_DEVICE_TERMINAL_MISMATCH' };
    return error;
};

export const requirePosDeviceProof = async (req, res, next) => {
    if (isDeviceControlPath(req?.path)) return next();
    try {
        const proof = proofForRequest(req);
        const policy = await resolvePosDevicePolicy({ tenantId: proof.tenantId, terminalId: proof.terminalId });
        if (!policy.strict_enabled) return next();
        if (!terminalClaimsAgree(req)) throw terminalMismatchError();
        req.posDeviceProof = await assertPosDeviceProof(proof);
        return next();
    } catch (error) {
        return sendFailure(res, error);
    }
};

// Session establishment happens before `authenticate`, so it uses the same proof
// contract with purpose=session. This middleware is intentionally attached only to
// POS session/login routes, never to Storefront or generic account authentication.
export const requirePosDeviceSessionProof = async (req, res, next) => {
    try {
        const terminalId = terminalIdForRequest(req);
        const tenantId = req?.tenant?.id || null;
        const policy = await resolvePosDevicePolicy({ tenantId, terminalId });
        if (!policy.strict_enabled) return next();
        if (!terminalClaimsAgree(req)) throw terminalMismatchError();
        req.posDeviceProof = await assertPosDeviceProof({
            tenantId,
            terminalId,
            locationId: locationIdForRequest(req),
            deviceId: header(req, 'x-pos-device-id'),
            challenge: header(req, 'x-pos-device-challenge'),
            signature: header(req, 'x-pos-device-signature'),
            sessionId: header(req, 'x-pos-device-session-id'),
            purpose: 'session',
            method: req?.method || 'POST',
            path: req?.originalUrl || req?.path || '/',
            body: bodyForProof(req),
            requestId: requestId(req)
        });
        return next();
    } catch (error) {
        return sendFailure(res, error);
    }
};

// Refresh/logout are shared by Storefront and POS. A POS client that advertises
// a terminal/device is required to present proof; requests without POS headers
// remain compatible with generic Storefront account sessions and are still gated
// on their next authenticated POS request.
export const requirePosDeviceProofIfStrict = async (req, res, next) => {
    const terminalHint = terminalIdForRequest(req);
    const deviceHint = header(req, 'x-pos-device-id');
    if (!terminalHint && !deviceHint) return next();
    try {
        const proof = proofForRequest(req);
        const policy = await resolvePosDevicePolicy({ tenantId: proof.tenantId, terminalId: terminalHint });
        if (!policy.strict_enabled) return next();
        if (!terminalClaimsAgree(req)) throw terminalMismatchError();
        req.posDeviceProof = await assertPosDeviceProof(proof);
        return next();
    } catch (error) {
        return sendFailure(res, error);
    }
};

export const extractPosDeviceProof = proofForRequest;
export { canonicalRequestPath };

export default requirePosDeviceProof;
