import {
    acceptDgfyInvitationUseCase,
    registerDgfyAccountUseCase,
    loginDgfyAccountUseCase,
    getDgfyMeUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

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

export const acceptDgfyInvitation = async (req, res) => {
    const result = await acceptDgfyInvitationUseCase({
        account: req.dgfyAccount,
        membershipId: req.params.membership_id
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'DGFY invitation acceptance failed'
    });
};
