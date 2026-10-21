import { deleteAccountPushTokenUseCase, registerAccountPushTokenUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const send = (res, result) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => 200,
    successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
    errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        error_code: failure.code,
        errors: failure.details,
        timestamp: timestamp()
    })
});

export const registerDgfyAccountPushToken = async (req, res, next) => {
    try {
        return send(res, await registerAccountPushTokenUseCase({
            accountId: req.dgfyAccount?.id,
            payload: req.validatedData || req.body
        }));
    } catch (error) {
        next(error);
    }
};

export const deleteDgfyAccountPushToken = async (req, res, next) => {
    try {
        const payload = req.validatedData || req.body || {};
        return send(res, await deleteAccountPushTokenUseCase({ accountId: req.dgfyAccount?.id, token: payload.token }));
    } catch (error) {
        next(error);
    }
};

export default { registerDgfyAccountPushToken, deleteDgfyAccountPushToken };
