import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});
const positiveInt = (value, fallback = null) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildListBusinessAdminRecipesUseCase = ({ businessAdminRecipeRepository, businessAdminOverviewRepository }) => async ({ query = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });

    const branchId = positiveInt(query.branch_id);
    const allowedLocationIds = access.scope === 'all'
        ? null
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && branchId && !allowedLocationIds.includes(branchId)) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
    }
    if (access.scope !== 'all' && !branchId && allowedLocationIds.length === 0) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No assigned branches are available for this user.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_SCOPE_EMPTY' });
    }

    const page = positiveInt(query.page, 1);
    const limit = Math.min(200, positiveInt(query.limit, 50));
    const search = String(query.search || '').trim().slice(0, 120);
    try {
        return ok(await businessAdminRecipeRepository.listRecipes({
            branchId,
            allowedLocationIds,
            page,
            limit,
            search
        }));
    } catch (error) {
        throw new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Unable to load recipe visibility.', { statusCode: 500, cause: error });
    }
};
