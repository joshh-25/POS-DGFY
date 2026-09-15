import {
    issuePosDeviceActivationUseCase,
    activatePosDeviceUseCase,
    activatePosDeviceBootstrapUseCase,
    listPosDevicesUseCase,
    revokePosDeviceUseCase,
    replacePosDeviceUseCase,
    issuePosDeviceChallengeUseCase,
    verifyPosDeviceProofUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req?.requestId || res?.locals?.requestId || req?.headers?.['x-request-id'] || null;
const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.details?.error_code || failure.code,
    errors: failure.details || null,
    request_id: requestId(req, res),
    timestamp: timestamp()
});
const send = (req, res, result, message, statusCode = 200) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => statusCode,
    successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: result.message || message,
        timestamp: timestamp()
    }),
    errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
});

export const issueActivationCode = async (req, res, next) => {
    try {
        const result = await issuePosDeviceActivationUseCase({
            tenantId: req.tenant?.id,
            payload: req.validatedData || req.body,
            user: req.user,
            requestId: requestId(req, res)
        });
        return send(req, res, result, 'POS device activation code issued.', 201);
    } catch (error) {
        return next(error);
    }
};

export const activateDevice = async (req, res, next) => {
    try {
        const result = await activatePosDeviceUseCase({
            tenantId: req.tenant?.id,
            payload: req.validatedData || req.body,
            user: req.user,
            requestId: requestId(req, res)
        });
        return send(req, res, result, 'POS device activated.', 201);
    } catch (error) {
        return next(error);
    }
};

export const activateDeviceBootstrap = async (req, res, next) => {
    try {
        const result = await activatePosDeviceBootstrapUseCase({
            tenantId: req.tenant?.id,
            payload: req.validatedData || req.body,
            user: req.user || null,
            requestId: requestId(req, res)
        });
        return send(req, res, result, 'POS device activated.', 201);
    } catch (error) {
        return next(error);
    }
};

export const listDevices = async (req, res, next) => {
    try {
        const result = await listPosDevicesUseCase({
            tenantId: req.tenant?.id,
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return send(req, res, result, 'POS devices retrieved.');
    } catch (error) {
        return next(error);
    }
};

export const revokeDevice = async (req, res, next) => {
    try {
        const result = await revokePosDeviceUseCase({
            tenantId: req.tenant?.id,
            enrollmentId: req.validatedParams?.enrollmentId || req.params.enrollmentId,
            payload: req.validatedData || req.body,
            user: req.user,
            requestId: requestId(req, res)
        });
        return send(req, res, result, 'POS device revoked.');
    } catch (error) {
        return next(error);
    }
};

export const replaceDevice = async (req, res, next) => {
    try {
        const result = await replacePosDeviceUseCase({
            tenantId: req.tenant?.id,
            enrollmentId: req.validatedParams?.enrollmentId || req.params.enrollmentId,
            payload: req.validatedData || req.body,
            user: req.user,
            requestId: requestId(req, res)
        });
        return send(req, res, result, 'POS device replaced.', 201);
    } catch (error) {
        return next(error);
    }
};

export const issueChallenge = async (req, res, next) => {
    try {
        const result = await issuePosDeviceChallengeUseCase({
            tenantId: req.tenant?.id,
            payload: req.validatedData || req.body,
            user: req.user || null,
            requestId: requestId(req, res)
        });
        return send(req, res, result, 'POS device challenge issued.', 201);
    } catch (error) {
        return next(error);
    }
};

export const verifyProof = async (req, res, next) => {
    try {
        const result = await verifyPosDeviceProofUseCase({
            tenantId: req.tenant?.id,
            payload: req.validatedData || req.body,
            request: req,
            requestId: requestId(req, res)
        });
        return send(req, res, result, 'POS device proof verified.');
    } catch (error) {
        return next(error);
    }
};

export default {
    issueActivationCode,
    activateDevice,
    activateDeviceBootstrap,
    listDevices,
    revokeDevice,
    replaceDevice,
    issueChallenge,
    verifyProof
};
