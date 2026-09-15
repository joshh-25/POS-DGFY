import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const resolvePosDevicePolicy = jest.fn();
const assertPosDeviceProof = jest.fn();

jest.unstable_mockModule('../src/modules/pos/services/posTerminalDeviceEnrollmentService.js', () => ({
    resolvePosDevicePolicy,
    assertPosDeviceProof,
    canonicalRequestPath: (value) => value
}));

let requirePosDeviceProof;
let requirePosDeviceSessionProof;
let requirePosDeviceProofIfStrict;

beforeAll(async () => {
    ({ requirePosDeviceProof, requirePosDeviceSessionProof, requirePosDeviceProofIfStrict } = await import('../src/middleware/posDeviceProof.js'));
});

const createResponse = () => {
    const res = {
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

const createRequest = (overrides = {}) => ({
    tenant: { id: 'tenant-a' },
    method: 'POST',
    path: '/checkouts',
    originalUrl: '/api/v1/pos/checkouts',
    body: { amount: 100 },
    headers: {
        'x-pos-terminal-id': 'COUNTER-01',
        'x-pos-device-id': 'device-a',
        'x-pos-device-challenge': 'challenge-a',
        'x-pos-device-signature': 'signature-a',
        'x-pos-device-session-id': 'session-a',
        'x-request-id': 'request-a'
    },
    ...overrides
});

describe('POS strict device proof middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: false, terminal_id: 'COUNTER-01' });
        assertPosDeviceProof.mockResolvedValue({ required: true, verified: true });
    });

    it('keeps policy-off requests compatible and bypasses only enrollment/recovery routes', async () => {
        const req = createRequest();
        const res = createResponse();
        const next = jest.fn();
        await requirePosDeviceProof(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(assertPosDeviceProof).not.toHaveBeenCalled();

        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: true });
        const controlReq = createRequest({ path: '/terminal/devices/activate' });
        await requirePosDeviceProof(controlReq, res, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(assertPosDeviceProof).not.toHaveBeenCalled();
    });

    it('requires and records a verified proof for strict protected requests', async () => {
        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: true, terminal_id: 'COUNTER-01' });
        const req = createRequest();
        const res = createResponse();
        const next = jest.fn();

        await requirePosDeviceProof(req, res, next);

        expect(assertPosDeviceProof).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-a',
            terminalId: 'COUNTER-01',
            deviceId: 'device-a',
            purpose: 'request',
            method: 'POST',
            path: '/api/v1/pos/checkouts',
            body: { amount: 100 }
        }));
        expect(req.posDeviceProof).toEqual({ required: true, verified: true });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns a stable error payload when a strict proof is missing or invalid', async () => {
        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: true, terminal_id: 'COUNTER-01' });
        const error = new Error('A complete POS device proof is required.');
        error.statusCode = 403;
        error.details = { error_code: 'POS_DEVICE_PROOF_INVALID' };
        assertPosDeviceProof.mockRejectedValue(error);
        const res = createResponse();
        const next = jest.fn();

        await requirePosDeviceProof(createRequest(), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error_code: 'POS_DEVICE_PROOF_INVALID',
            errors: { error_code: 'POS_DEVICE_PROOF_INVALID' }
        }));
    });

    it('rejects conflicting terminal claims before signature verification', async () => {
        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: true, terminal_id: 'COUNTER-01' });
        const req = createRequest({ body: { amount: 100, terminal_id: 'COUNTER-02' } });
        const res = createResponse();
        const next = jest.fn();

        await requirePosDeviceProof(req, res, next);

        expect(assertPosDeviceProof).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error_code: 'POS_DEVICE_TERMINAL_MISMATCH'
        }));
    });

    it('blocks a copied POS session that has no device proof headers', async () => {
        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: true, terminal_id: null });
        const proofError = new Error('A complete POS device proof is required.');
        proofError.statusCode = 403;
        proofError.details = { error_code: 'POS_DEVICE_PROOF_INVALID' };
        assertPosDeviceProof.mockRejectedValue(proofError);
        const req = createRequest({ headers: {} });
        const res = createResponse();
        const next = jest.fn();

        await requirePosDeviceProof(req, res, next);

        expect(assertPosDeviceProof).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-a',
            terminalId: ''
        }));
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error_code: 'POS_DEVICE_PROOF_INVALID'
        }));
    });

    it('uses the session purpose before cashier login and only gates shared refresh/logout when POS hints exist', async () => {
        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: true, terminal_id: 'COUNTER-01' });
        const req = createRequest({ path: '/auth/cashier-login', originalUrl: '/api/v1/pos/auth/cashier-login' });
        const res = createResponse();
        const next = jest.fn();
        await requirePosDeviceSessionProof(req, res, next);
        expect(assertPosDeviceProof).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'session' }));
        expect(next).toHaveBeenCalledTimes(1);

        jest.clearAllMocks();
        const refreshReq = createRequest({ headers: {} });
        await requirePosDeviceProofIfStrict(refreshReq, res, next);
        expect(resolvePosDevicePolicy).not.toHaveBeenCalled();

        resolvePosDevicePolicy.mockResolvedValue({ strict_enabled: true });
        await requirePosDeviceProofIfStrict(createRequest({ path: '/refresh-token', originalUrl: '/api/v1/auth/refresh-token' }), res, next);
        expect(assertPosDeviceProof).toHaveBeenCalledTimes(1);
    });
});
