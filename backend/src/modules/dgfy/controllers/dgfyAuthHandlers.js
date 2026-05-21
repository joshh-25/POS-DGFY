import {
    acceptDgfyInvitationUseCase,
    createDgfyHandoffUseCase,
    exchangeDgfyHandoffUseCase,
    registerDgfyAccountUseCase,
    loginDgfyAccountUseCase,
    getDgfyMeUseCase,
    requestDgfyEmailVerificationUseCase,
    verifyDgfyEmailUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { blacklistToken } from '../../../services/authService.js';

export const registerDgfyAccount = async (req, res) => {
    const result = await registerDgfyAccountUseCase({ body: req.body });
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
