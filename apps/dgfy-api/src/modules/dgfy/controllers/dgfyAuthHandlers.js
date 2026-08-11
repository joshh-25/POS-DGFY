import {
    acceptDgfyInvitationUseCase,
    changeDgfyPasswordUseCase,
    configureDgfyCompanyDayClosePinUseCase,
    completeDgfyPasswordResetUseCase,
    createDgfyHandoffUseCase,
    createDgfyInvitationUseCase,
    exchangeDgfyHandoffUseCase,
    getDgfyLegalTermsUseCase,
    leaveDgfyCompanyUseCase,
    listDgfyAccountCompaniesUseCase,
    preflightDgfyAccountRegistrationUseCase,
    registerDgfyAccountUseCase,
    loginDgfyAccountUseCase,
    getDgfyMeUseCase,
    rejectDgfyInvitationUseCase,
    recordDgfyCompanySwitchOutcomeUseCase,
    requestDgfyBusinessStepUpUseCase,
    requestDgfyPasswordResetUseCase,
    requestDgfyEmailVerificationUseCase,
    searchDgfyBusinessAccountsUseCase,
    startDgfyPosSessionUseCase,
    startDgfyTenantSessionUseCase,
    switchDgfyCompanyUseCase,
    transferDgfyCompanyOwnershipUseCase,
    updateDgfyProfileUseCase,
    verifyDgfyEmailUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { blacklistToken } from '../../../services/authService.js';
import { buildLegacyDgfyLinkStatus } from '../../../services/dgfyLegacyAccessPolicy.js';
import {
    completeLegacyLink,
    requestLegacyLinkEmailOtp,
    startLegacyRegistrationHandoff
} from '../../../services/dgfyLegacyLinkService.js';
import {
    clearTenantSessionCookies,
    clearSessionCookie,
    getCookie,
    getTenantRefreshToken,
    isMobileClientRequest,
    SESSION_COOKIE_NAMES,
    setTenantSessionCookies,
    setBearerSessionCookie
} from '../../../utils/browserSessionCookies.js';

const setDgfyCookieFromResult = (res, result) => {
    const session = result?.data?.payload?.data || result?.data || {};
    const token = session?.token;
    const expiresInSeconds = Number(session?.expiresIn);
    if (token) {
        setBearerSessionCookie(res, SESSION_COOKIE_NAMES.dgfy, token, {
            maxAgeMs: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
                ? expiresInSeconds * 1000
                : undefined
        });
    }
};

const buildRequestMetadata = (req) => ({
    request_id: req.headers['x-request-id'] || req.requestId || null,
    ip_address: req.ip || null,
    user_agent: req.get?.('user-agent') || req.headers['user-agent'] || null
});

const revokePreviousTenantSession = async (req) => {
    const previousTokens = [
        getTenantRefreshToken(req),
        String(req.headers['x-previous-tenant-access-token'] || '').trim()
    ].filter(Boolean);

    await Promise.all(previousTokens.map((token) => blacklistToken(token)));
};

// Browser clients keep the existing httpOnly-cookie-only (more
// XSS-resistant) behavior. Mobile clients (React Native, no cookie jar)
// opt in via the x-client-platform header and get the refresh token back
// in the body so they can persist it themselves - see
// isMobileClientRequest in utils/browserSessionCookies.js.
const stripTenantSessionRefreshPayload = (result, fallbackMessage = 'SKUpervisor session started.', req = null) => {
    const session = { ...(result.data?.payload?.data || {}) };
    if (!isMobileClientRequest(req)) {
        delete session.refreshToken;
    }
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

export const preflightDgfyAccountRegistration = async (req, res) => {
    const result = await preflightDgfyAccountRegistrationUseCase({
        body: req.body
    });
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

export const getDgfyLegacyLinkStatus = async (req, res) => {
    const status = await buildLegacyDgfyLinkStatus({
        tenantId: req.tenant?.id || null,
        user: req.user
    });
    return res.status(200).json({
        success: true,
        data: status,
        message: 'DGFY legacy link status retrieved.',
        timestamp: new Date().toISOString()
    });
};

export const requestDgfyLegacyLinkEmailOtp = async (req, res, next) => {
    try {
        const payload = await requestLegacyLinkEmailOtp({
            req,
            metadata: buildRequestMetadata(req)
        });
        return res.status(202).json({
            success: true,
            data: payload,
            message: 'DGFY linking verification code sent.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return next(error);
    }
};

export const completeDgfyLegacyLink = async (req, res, next) => {
    try {
        const payload = await completeLegacyLink({
            req,
            body: req.body,
            metadata: buildRequestMetadata(req)
        });
        return res.status(200).json({
            success: true,
            data: payload,
            message: 'DGFY account linked.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return next(error);
    }
};

export const startDgfyLegacyRegistrationHandoff = async (req, res, next) => {
    try {
        const payload = await startLegacyRegistrationHandoff({ req });
        return res.status(200).json({
            success: true,
            data: payload,
            message: 'DGFY registration handoff prepared.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return next(error);
    }
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

export const configureDgfyCompanyDayClosePin = async (req, res) => {
    const result = await configureDgfyCompanyDayClosePinUseCase({
        account: req.dgfyAccount,
        tenantId: req.params?.tenant_id,
        body: req.body
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY Day Close PIN configuration failed'
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

export const rejectDgfyInvitation = async (req, res) => {
    const result = await rejectDgfyInvitationUseCase({
        account: req.dgfyAccount,
        membershipId: req.params.membership_id,
        metadata: buildRequestMetadata(req)
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY invitation rejection failed'
    });
};

export const createDgfyInvitation = async (req, res) => {
    const result = await createDgfyInvitationUseCase({
        tenant: req.tenant,
        adminUser: req.user,
        body: req.body,
        metadata: buildRequestMetadata(req)
    });
    return sendUseCaseResult(res, result, {
        successStatusCodeResolver: () => 201,
        fallbackErrorMessage: 'DGFY invitation creation failed'
    });
};

export const searchDgfyBusinessAccounts = async (req, res) => {
    const result = await searchDgfyBusinessAccountsUseCase({
        query: req.query?.query || req.query?.q || '',
        tenantId: req.tenant?.id || ''
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY account search failed'
    });
};

export const switchDgfyCompany = async (req, res) => {
    const metadata = buildRequestMetadata(req);
    const result = await switchDgfyCompanyUseCase({
        account: req.dgfyAccount,
        tenantId: req.params.tenant_id,
        body: req.body,
        metadata,
        currentTenantUserId: req.user?.user_id || null,
        currentTenantId: req.tenant?.id || req.user?.tenant_id || null,
        authSource: req.dgfyAuthSource || ''
    });

    if (result?.success) {
        const auditContext = result.auditContext || {};
        try {
            await revokePreviousTenantSession(req);
            clearTenantSessionCookies(res);
            setTenantSessionCookies(res, {
                refreshToken: result.data?.payload?.data?.refreshToken,
                tenantToken: result.data?.payload?.data?.company?.token || null
            });
        } catch (error) {
            await recordDgfyCompanySwitchOutcomeUseCase({
                ...auditContext,
                account: auditContext.account || req.dgfyAccount,
                tenantId: auditContext.tenantId || req.params.tenant_id,
                result: 'failure',
                reason: error?.message || 'Tenant session rotation failed.',
                metadata,
                evidence: {
                    ...auditContext.evidence,
                    previous_session_revoked: false,
                    new_session_issued: false,
                    session_rotated: false,
                    reason_code: 'SESSION_ROTATION_FAILED'
                }
            });
            throw error;
        }

        await recordDgfyCompanySwitchOutcomeUseCase({
            ...auditContext,
            account: auditContext.account || req.dgfyAccount,
            tenantId: auditContext.tenantId || req.params.tenant_id,
            result: 'success',
            metadata,
            evidence: {
                ...auditContext.evidence,
                previous_session_revoked: true,
                new_session_issued: true,
                session_rotated: true
            }
        });
    }

    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY company switch failed',
        successPayloadResolver: (resolvedResult) => stripTenantSessionRefreshPayload(resolvedResult, 'Company switched.', req)
    });
};

export const leaveDgfyCompany = async (req, res) => {
    const result = await leaveDgfyCompanyUseCase({
        account: req.dgfyAccount,
        tenantId: req.params.tenant_id,
        metadata: buildRequestMetadata(req)
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY company leave failed'
    });
};

export const transferDgfyCompanyOwnership = async (req, res) => {
    const result = await transferDgfyCompanyOwnershipUseCase({
        account: req.dgfyAccount,
        tenantId: req.params.tenant_id,
        body: req.body,
        metadata: buildRequestMetadata(req)
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY company ownership transfer failed'
    });
};

export const startDgfyPosSession = async (req, res) => {
    const result = await startDgfyPosSessionUseCase({
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
        fallbackErrorMessage: 'DGFY POS session failed',
        successPayloadResolver: (resolvedResult) => stripTenantSessionRefreshPayload(resolvedResult, 'POS session started.', req)
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
            return stripTenantSessionRefreshPayload(result, 'SKUpervisor session started.', req);
        }
    });
};
