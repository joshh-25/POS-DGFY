import { ok, fail } from '../../shared/contracts/applicationResult.js';

export const buildListAuditLogsUseCase = ({ auditRepository }) => async ({ query = {} } = {}) => {
    try {
        const data = await auditRepository.list(query);
        return ok(data, 'Audit history retrieved');
    } catch (error) {
        return fail(error);
    }
};
