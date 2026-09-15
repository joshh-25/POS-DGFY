import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZES = new Set([20, 50, 100]);
const SHIFT_STATUSES = new Set(['open', 'closed']);

const fail = (code, message, statusCode = 400, details = null) => ({ success: false, error: new DomainError(code, message, { statusCode, details }) });
const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const resolveScope = async ({ user, repository, branchId = null }) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }) };
    const allowedLocationIds = access.scope === 'all' ? null : await repository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && allowedLocationIds.length === 0) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }) };
    if (branchId && Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(branchId)) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }) };
    return { allowedLocationIds };
};

export const buildListBusinessAdminShiftsUseCase = ({ businessAdminShiftHistoryRepository, businessAdminOverviewRepository }) => async ({ query = {}, user = {} } = {}) => {
    const branchId = query.branch_id ? parsePositiveInt(query.branch_id) : null;
    if (query.branch_id && !branchId) return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422);
    const scope = await resolveScope({ user, repository: businessAdminOverviewRepository, branchId });
    if (scope.error) return scope.error;

    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const limit = Number.parseInt(query.limit, 10) || 20;
    if (!PAGE_SIZES.has(limit)) return fail(DomainErrorCode.VALIDATION_FAILED, 'limit must be one of: 20, 50, or 100.', 422);
    const status = String(query.status || '').trim().toLowerCase();
    if (status && !SHIFT_STATUSES.has(status)) return fail(DomainErrorCode.VALIDATION_FAILED, 'status must be open or closed.', 422);
    const dateFrom = String(query.date_from || '').trim();
    const dateTo = String(query.date_to || '').trim();
    if ((dateFrom && !DATE_ONLY_PATTERN.test(dateFrom)) || (dateTo && !DATE_ONLY_PATTERN.test(dateTo))) return fail(DomainErrorCode.VALIDATION_FAILED, 'date_from and date_to must use YYYY-MM-DD format.', 422);
    if (dateFrom && dateTo && dateFrom > dateTo) return fail(DomainErrorCode.VALIDATION_FAILED, 'date_from must be earlier than or equal to date_to.', 422);
    const terminalId = String(query.terminal_id || '').trim().toUpperCase();
    const search = String(query.search || '').trim().slice(0, 100);
    const filters = {
        page,
        limit,
        branchId,
        terminalId,
        status,
        search,
        startAt: dateFrom ? new Date(`${dateFrom}T00:00:00.000+08:00`) : null,
        endAt: dateTo ? new Date(`${dateTo}T23:59:59.999+08:00`) : null
    };
    const [result, summary] = await Promise.all([
        businessAdminShiftHistoryRepository.listShifts({ allowedLocationIds: scope.allowedLocationIds, filters }),
        businessAdminShiftHistoryRepository.getSummary({ allowedLocationIds: scope.allowedLocationIds, filters })
    ]);
    return { success: true, data: { ...result, summary } };
};
