import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { issueDgfyPosDeviceChallengeUseCase } from '../../dgfy/index.js';

export const issueDgfyPosDeviceChallenge = async (req, res, next) => {
    try {
        const result = await issueDgfyPosDeviceChallengeUseCase({
            account: req.dgfyAccount,
            tenantId: req.params.tenant_id,
            payload: req.validatedData || req.body || {},
            requestId: req.requestId || req.headers?.['x-request-id'] || null
        });
        return sendUseCaseResult(res, result, {
            fallbackErrorMessage: 'Unable to issue the DGFY POS device session challenge.',
            successStatusCodeResolver: () => 201,
            successPayloadResolver: (resolvedResult) => ({
                success: true,
                data: resolvedResult.data,
                message: resolvedResult.message || 'DGFY POS device session challenge issued.',
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        return next(error);
    }
};

export default { issueDgfyPosDeviceChallenge };
