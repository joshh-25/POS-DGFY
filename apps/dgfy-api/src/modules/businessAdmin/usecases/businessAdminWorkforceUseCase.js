import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const todayManilaDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const parseDate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (!DATE_ONLY_PATTERN.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? null : normalized;
};

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const buildGetBusinessAdminWorkforceUseCase = ({ businessAdminWorkforceRepository, businessAdminOverviewRepository }) => async ({ query = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });

    const dateFrom = parseDate(query.date_from);
    const dateTo = parseDate(query.date_to);
    if (dateFrom === null || dateTo === null) return fail(DomainErrorCode.VALIDATION_FAILED, 'date_from and date_to must use YYYY-MM-DD format.', 422);
    const normalizedFrom = dateFrom || todayManilaDate();
    const normalizedTo = dateTo || normalizedFrom;
    if (normalizedFrom > normalizedTo) return fail(DomainErrorCode.VALIDATION_FAILED, 'date_from must be earlier than or equal to date_to.', 422);

    const branchId = query.branch_id ? parsePositiveInt(query.branch_id) : null;
    if (query.branch_id && !branchId) return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422);
    const allowedLocationIds = access.scope === 'all' ? null : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && allowedLocationIds.length === 0) return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' });
    if (branchId && Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(branchId)) return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });

    const startAt = new Date(`${normalizedFrom}T00:00:00.000+08:00`);
    const endAt = new Date(new Date(`${normalizedTo}T00:00:00.000+08:00`).getTime() + MS_PER_DAY - 1);
    const employees = await businessAdminWorkforceRepository.getWorkforce({ startAt, endAt, branchId, allowedLocationIds });
    return {
        success: true,
        data: {
            employees,
            filters: { date_from: normalizedFrom, date_to: normalizedTo, branch_id: branchId },
            meta: { timezone: 'Asia/Manila', source: 'immutable_pos_activity_read_model' }
        }
    };
};
