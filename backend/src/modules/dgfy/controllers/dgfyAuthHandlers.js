import {
    acceptDgfyInvitationUseCase,
    changeDgfyPasswordUseCase,
    completeDgfyPasswordResetUseCase,
    createDgfyHandoffUseCase,
    exchangeDgfyHandoffUseCase,
    getDgfyLegalTermsUseCase,
    registerDgfyAccountUseCase,
    loginDgfyAccountUseCase,
    getDgfyMeUseCase,
    requestDgfyPasswordResetUseCase,
    requestDgfyEmailVerificationUseCase,
    updateDgfyProfileUseCase,
    verifyDgfyEmailUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { blacklistToken } from '../../../services/authService.js';

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
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY account registration failed'
    });
};

export const loginDgfyAccount = async (req, res) => {
    const result = await loginDgfyAccountUseCase({ body: req.body });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY login failed'
    });
};

export const getDgfyMe = async (req, res) => {
    const result = await getDgfyMeUseCase({ account: req.dgfyAccount });
    return sendUseCaseResult(res, result);
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
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY handoff exchange failed'
    });
};

export const logoutDgfyAccount = async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
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

export const acceptDgfyInvitation = async (req, res) => {
    const result = await acceptDgfyInvitationUseCase({
        account: req.dgfyAccount,
        membershipId: req.params.membership_id
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY invitation acceptance failed'
    });
};
