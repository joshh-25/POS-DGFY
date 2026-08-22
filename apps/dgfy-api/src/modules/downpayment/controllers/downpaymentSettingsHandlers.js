import { getDownpaymentSettingsUseCase, updateDownpaymentSettingsUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();

const errorPayload = (failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    timestamp: timestamp()
});

const send = (res, result, { status = 200, message = null } = {}) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => status,
    successPayloadResolver: () => ({
        success: true,
        data: result.data,
        ...(message ? { message } : {}),
        timestamp: timestamp()
    }),
    errorPayloadResolver: errorPayload
});

export const getDownpaymentSettings = async (req, res, next) => {
    try {
        return send(res, await getDownpaymentSettingsUseCase({ tenantId: req.user?.tenant_id }));
    } catch (error) {
        next(error);
    }
};

export const updateDownpaymentSettings = async (req, res, next) => {
    try {
        return send(res, await updateDownpaymentSettingsUseCase({
            tenantId: req.user?.tenant_id,
            body: req.validatedData || req.body
        }), { message: 'Downpayment settings updated successfully' });
    } catch (error) {
        next(error);
    }
};
