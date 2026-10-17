import { deleteGuestPushTokenUseCase, registerGuestPushTokenUseCase } from '../../store/index.js';
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

export const registerStoreGuestPushToken = async (req, res, next) => {
    try {
        return send(res, await registerGuestPushTokenUseCase({
            tenantId: req.tenant?.id,
            trackingPin: req.params.tracking_pin,
            payload: req.validatedData || req.body
        }));
    } catch (error) {
        next(error);
    }
};

export const deleteStoreGuestPushToken = async (req, res, next) => {
    try {
        return send(res, await deleteGuestPushTokenUseCase({
            tenantId: req.tenant?.id,
            trackingPin: req.params.tracking_pin,
            payload: req.validatedData || req.body
        }));
    } catch (error) {
        next(error);
    }
};

export default { registerStoreGuestPushToken, deleteStoreGuestPushToken };
