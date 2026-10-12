import { tenantIntakeUseCases } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

export const buildTenantIntakeHandlers = (useCases) => Object.fromEntries(Object.entries(useCases).map(([name, execute]) => [name,
    async (req, res, next) => {
        try {
            const result = await execute({ id: req.params.id, body: req.body, query: req.query, file: req.file,
                actor: { ...req.admin, id: req.admin?.admin_id || req.admin?.id } });
            return sendUseCaseResult(res, result, {
                errorPayloadResolver: (failure) => ({ success: false, message: failure.message, code: failure.code, errors: failure.details })
            });
        } catch (error) { next(error); }
    }
]));

export const tenantIntakeHandlers = buildTenantIntakeHandlers(tenantIntakeUseCases);
