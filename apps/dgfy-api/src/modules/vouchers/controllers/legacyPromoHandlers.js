import { listLegacyPromosUseCase, revokeLegacyPromoUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();

const respond = (req, res, result, message, successStatusCode = 200) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => successStatusCode,
    successPayloadResolver: () => ({ success: true, data: result.data, message, timestamp: timestamp() }),
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

export const listLegacyPromos = async (req, res, next) => {
    try {
        const result = await listLegacyPromosUseCase({});
        return respond(req, res, result, 'Legacy promos retrieved successfully');
    } catch (error) {
        return next(error);
    }
};

export const revokeLegacyPromo = async (req, res, next) => {
    try {
        const result = await revokeLegacyPromoUseCase({
            payload: req.validatedData,
            actorUser: req.user
        });
        return respond(req, res, result, 'Legacy promo revoked successfully');
    } catch (error) {
        return next(error);
    }
};
