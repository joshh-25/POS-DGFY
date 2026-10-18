import { deleteStaffPushTokenUseCase, registerStaffPushTokenUseCase } from '../index.js';
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

export const registerPosStaffPushToken = async (req, res, next) => {
    try {
        return send(res, await registerStaffPushTokenUseCase({
            tenantId: req.user?.tenant_id,
            userId: req.user?.user_id,
            payload: req.validatedData || req.body
        }));
    } catch (error) {
        next(error);
    }
};

export const deletePosStaffPushToken = async (req, res, next) => {
    try {
        const payload = req.validatedData || req.body || {};
        return send(res, await deleteStaffPushTokenUseCase({
            tenantId: req.user?.tenant_id,
            userId: req.user?.user_id,
            token: payload.token
        }));
    } catch (error) {
        next(error);
    }
};

export default { registerPosStaffPushToken, deletePosStaffPushToken };
