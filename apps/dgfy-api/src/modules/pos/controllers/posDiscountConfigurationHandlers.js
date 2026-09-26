import {
    createPosDiscountRuleUseCase,
    deletePosDiscountRuleUseCase,
    listPosDiscountRulesUseCase,
    updatePosDiscountRuleUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();

const auditContext = (req) => ({
    request_id: req.requestId || null,
    actor_username: req.user?.username || null,
    ip_address: req.ip || null,
    user_agent: req.get?.('user-agent') || null
});

const respond = (req, res, result, message, successStatusCode = 200) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => successStatusCode,
    successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message,
        timestamp: timestamp()
    }),
    errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        error_code: failure.code,
        errors: failure.details,
        request_id: req.requestId || res.locals?.requestId || null,
        timestamp: timestamp()
    })
});

export const listDiscountRules = async (req, res, next) => {
    try {
        return respond(
            req,
            res,
            await listPosDiscountRulesUseCase(),
            'Discount configurations retrieved successfully'
        );
    } catch (error) {
        return next(error);
    }
};

export const createDiscountRule = async (req, res, next) => {
    try {
        return respond(
            req,
            res,
            await createPosDiscountRuleUseCase({
                payload: req.validatedData,
                actorUserId: req.user.user_id,
                auditContext: auditContext(req)
            }),
            'Discount configuration created successfully',
            201
        );
    } catch (error) {
        return next(error);
    }
};

export const updateDiscountRule = async (req, res, next) => {
    try {
        return respond(
            req,
            res,
            await updatePosDiscountRuleUseCase({
                discountRuleId: req.validatedParams.discountRuleId,
                payload: req.validatedData,
                actorUserId: req.user.user_id,
                auditContext: auditContext(req)
            }),
            'Discount configuration updated successfully'
        );
    } catch (error) {
        return next(error);
    }
};

export const deleteDiscountRule = async (req, res, next) => {
    try {
        return respond(
            req,
            res,
            await deletePosDiscountRuleUseCase({
                discountRuleId: req.validatedParams.discountRuleId,
                actorUserId: req.user.user_id,
                auditContext: auditContext(req)
            }),
            'Discount configuration deleted successfully'
        );
    } catch (error) {
        return next(error);
    }
};
