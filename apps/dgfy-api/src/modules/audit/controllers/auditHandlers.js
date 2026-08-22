import { auditListUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

export const listAuditLogs = async (req, res, next) => {
    try {
        const result = await auditListUseCase({ query: req.validatedQuery || req.query });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: result.message || 'Audit history retrieved',
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        return next(error);
    }
};
