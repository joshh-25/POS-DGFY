import {
    acceptDgfyInvitationUseCase,
    changeDgfyPasswordUseCase,
    completeDgfyPasswordResetUseCase,
    createDgfyHandoffUseCase,
    exchangeDgfyHandoffUseCase,
    getDgfyLegalTermsUseCase,
    listDgfyAccountCompaniesUseCase,
    registerDgfyAccountUseCase,
    loginDgfyAccountUseCase,
    getDgfyMeUseCase,
    requestDgfyBusinessStepUpUseCase,
    requestDgfyPasswordResetUseCase,
    requestDgfyEmailVerificationUseCase,
    startDgfyTenantSessionUseCase,
    switchDgfyCompanyUseCase,
    updateDgfyProfileUseCase,
    verifyDgfyEmailUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { blacklistToken } from '../../../services/authService.js';
import {
    clearSessionCookie,
    getCookie,
    SESSION_COOKIE_NAMES,
    setTenantSessionCookies,
    setBearerSessionCookie
} from '../../../utils/browserSessionCookies.js';

const setDgfyCookieFromResult = (res, result) => {
    const token = result?.data?.payload?.data?.token || result?.data?.token;
    if (token) setBearerSessionCookie(res, SESSION_COOKIE_NAMES.dgfy, token);
};

const buildRequestMetadata = (req) => ({
    request_id: req.headers['x-request-id'] || req.requestId || null,
    ip_address: req.ip || null,
    user_agent: req.get?.('user-agent') || req.headers['user-agent'] || null
});

const stripTenantSessionRefreshPayload = (result, fallbackMessage = 'SKUpervisor session started.') => {
    const session = { ...(result.data?.payload?.data || {}) };
    delete session.refreshToken;
    return {
        success: true,
        data: session,
        message: result.data?.payload?.message || fallbackMessage
    };
};

export const getDgfyLegalTerms = async (req, res) => {
    const result = await getDgfyLegalTermsUseCase();
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY legal terms lookup failed'
    });
};

export const registerDgfyAccount = async (req, res) => {
    const result = await registerDgfyAccountUseCase({
        body: req.body,
        metadata: {
            request_id: req.headers['x-request-id'] || req.requestId || null,
            ip_address: req.ip || null,
            user_agent: req.get?.('user-agent') || req.headers['user-agent'] || null
        }
    });
    setDgfyCookieFromResult(res, result);
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY account registration failed'
    });
};

export const loginDgfyAccount = async (req, res) => {
    const result = await loginDgfyAccountUseCase({ body: req.body });
    setDgfyCookieFromResult(res, result);
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY login failed'
    });
};

export const getDgfyMe = async (req, res) => {
    const result = await getDgfyMeUseCase({ account: req.dgfyAccount });
    return sendUseCaseResult(res, result);
};

export const listDgfyAccountCompanies = async (req, res) => {
    const result = await listDgfyAccountCompaniesUseCase({
        account: req.dgfyAccount,
        currentTenantToken: req.headers?.['x-company-token'] || getCookie(req, SESSION_COOKIE_NAMES.tenantContext) || req.tenant?.company_token || ''
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY company list lookup failed'
    });
};

export const requestDgfyBusinessStepUp = async (req, res) => {
    const result = await requestDgfyBusinessStepUpUseCase({
        account: req.dgfyAccount,
        metadata: buildRequestMetadata(req)
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY business security code request failed'
    });
};

export const updateDgfyProfile = async (req, res) => {
    const result = await updateDgfyProfileUseCase({
        account: req.dgfyAccount,
        body: req.body
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY profile update failed'
    });
};

export const changeDgfyPassword = async (req, res) => {
    const result = await changeDgfyPasswordUseCase({
        account: req.dgfyAccount,
        body: req.body
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY password change failed'
    });
};

export const requestDgfyEmailVerification = async (req, res) => {
    const result = await requestDgfyEmailVerificationUseCase({
        account: req.dgfyAccount,
        metadata: {
            request_id: req.headers['x-request-id'] || null,
            ip_address: req.ip || null
        }
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY email verification request failed'
    });
};

export const verifyDgfyEmail = async (req, res) => {
    const result = await verifyDgfyEmailUseCase({
        account: req.dgfyAccount,
        body: req.body
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY email verification failed'
    });
};

export const requestDgfyPasswordReset = async (req, res) => {
    const result = await requestDgfyPasswordResetUseCase({
        body: req.body,
        metadata: {
            request_id: req.headers['x-request-id'] || null,
            ip_address: req.ip || null
        }
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY password reset request failed'
    });
};

export const completeDgfyPasswordReset = async (req, res) => {
    const result = await completeDgfyPasswordResetUseCase({ body: req.body });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY password reset failed'
    });
};

export const createDgfyHandoff = async (req, res) => {
    const result = await createDgfyHandoffUseCase({ account: req.dgfyAccount });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY handoff creation failed'
    });
};

export const exchangeDgfyHandoff = async (req, res) => {
    const result = await exchangeDgfyHandoffUseCase({ body: req.body });
    setDgfyCookieFromResult(res, result);
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY handoff exchange failed'
    });
};

export const logoutDgfyAccount = async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : getCookie(req, SESSION_COOKIE_NAMES.dgfy);
    if (token) {
        await blacklistToken(token);
    }
    clearSessionCookie(res, SESSION_COOKIE_NAMES.dgfy);
    return res.status(200).json({
        success: true,
        data: null,
        message: 'DGFY logout successful',
        timestamp: new Date().toISOString()
    });
};

export const acceptDgfyInvitation = async (req, res) => {
    const result = await acceptDgfyInvitationUseCase({
        account: req.dgfyAccount,
        membershipId: req.params.membership_id,
        body: req.body,
        metadata: buildRequestMetadata(req)
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY invitation acceptance failed'
    });
};

export const switchDgfyCompany = async (req, res) => {
    const result = await switchDgfyCompanyUseCase({
        account: req.dgfyAccount,
        tenantId: req.params.tenant_id,
        body: req.body,
        metadata: buildRequestMetadata(req)
    });

    if (result?.success) {
        setTenantSessionCookies(res, {
            refreshToken: result.data?.payload?.data?.refreshToken,
            tenantToken: result.data?.payload?.data?.company?.token || null
        });
    }

    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY company switch failed',
        successPayloadResolver: (resolvedResult) => stripTenantSessionRefreshPayload(resolvedResult, 'Company switched.')
    });
};

export const startDgfyTenantSession = async (req, res) => {
    const result = await startDgfyTenantSessionUseCase({
        account: req.dgfyAccount,
        body: req.body
    });

    if (result?.success) {
        setTenantSessionCookies(res, {
            refreshToken: result.data?.payload?.data?.refreshToken,
            tenantToken: result.data?.payload?.data?.company?.token || req.body?.company_token || null
        });
    }

    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY tenant session handoff failed',
        successPayloadResolver: () => {
            return stripTenantSessionRefreshPayload(result, 'SKUpervisor session started.');
        }
    });
};
