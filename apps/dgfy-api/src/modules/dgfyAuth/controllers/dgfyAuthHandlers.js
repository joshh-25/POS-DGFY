import {
    changeDgfyPasswordUseCase,
    completeDgfyPasswordResetUseCase,
    getDgfyLegalTermsUseCase,
    getDgfyMeUseCase,
    loginDgfyAccountUseCase,
    preflightDgfyAccountRegistrationUseCase,
    registerDgfyAccountUseCase,
    requestDgfyEmailVerificationUseCase,
    requestDgfyPasswordResetUseCase,
    updateDgfyProfileUseCase,
    verifyDgfyEmailUseCase
} from '../index.js';
import { sendUseCaseResult } from '../contracts/useCaseResponder.js';
import { blacklistToken } from '../../../infra/tokenSession.js';

// Transport-only: mobile clients get the bearer token directly in the JSON
// body (result.data.payload.data.token) — no HttpOnly cookie is set here.
// Per ADR 0026, browser session cookie authority stays with the main
// backend; this service's session contract is bearer-token-only.
const buildRequestMetadata = (req) => ({
    request_id: req.headers['x-request-id'] || null,
    ip_address: req.ip || null,
    user_agent: req.get?.('user-agent') || req.headers['user-agent'] || null
});

export const getDgfyLegalTerms = async (req, res) => {
    const result = await getDgfyLegalTermsUseCase();
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY legal terms lookup failed' });
};

export const preflightDgfyAccountRegistration = async (req, res) => {
    const result = await preflightDgfyAccountRegistrationUseCase({ body: req.body });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY account registration preflight failed',
        errorPayloadResolver: (failure) => ({
            success: false,
            data: null,
            message: failure.message,
            error_code: failure.details?.error_code || failure.code || null,
            details: failure.details || null
        })
    });
};

export const registerDgfyAccount = async (req, res) => {
    const result = await registerDgfyAccountUseCase({ body: req.body, metadata: buildRequestMetadata(req) });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY account registration failed' });
};

export const loginDgfyAccount = async (req, res) => {
    const result = await loginDgfyAccountUseCase({ body: req.body });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY login failed' });
};

export const getDgfyMe = async (req, res) => {
    const result = await getDgfyMeUseCase({ account: req.dgfyAccount });
    return sendUseCaseResult(res, result);
};

export const updateDgfyProfile = async (req, res) => {
    const result = await updateDgfyProfileUseCase({ account: req.dgfyAccount, body: req.body });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY profile update failed' });
};

export const changeDgfyPassword = async (req, res) => {
    const result = await changeDgfyPasswordUseCase({ account: req.dgfyAccount, body: req.body });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY password change failed' });
};

export const requestDgfyEmailVerification = async (req, res) => {
    const result = await requestDgfyEmailVerificationUseCase({ account: req.dgfyAccount, metadata: buildRequestMetadata(req) });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY email verification request failed' });
};

export const verifyDgfyEmail = async (req, res) => {
    const result = await verifyDgfyEmailUseCase({ account: req.dgfyAccount, body: req.body });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY email verification failed' });
};

export const requestDgfyPasswordReset = async (req, res) => {
    const result = await requestDgfyPasswordResetUseCase({ body: req.body, metadata: buildRequestMetadata(req) });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY password reset request failed' });
};

export const completeDgfyPasswordReset = async (req, res) => {
    const result = await completeDgfyPasswordResetUseCase({ body: req.body });
    return sendUseCaseResult(res, result, { fallbackErrorMessage: 'DGFY password reset failed' });
};

export const logoutDgfyAccount = async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
    if (token) {
        await blacklistToken(token);
    }
    return res.status(200).json({
        success: true,
        data: null,
        message: 'DGFY logout successful',
        timestamp: new Date().toISOString()
    });
};
