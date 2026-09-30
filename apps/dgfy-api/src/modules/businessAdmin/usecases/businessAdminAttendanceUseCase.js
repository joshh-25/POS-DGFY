import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ATTENDANCE_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const parsePositiveInt = (value, fallback = null) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseDate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (!DATE_ONLY_PATTERN.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
        ? null
        : normalized;
};

const todayManilaDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());

const resolveDateRange = (query = {}) => {
    const rawFrom = parseDate(query.date_from);
    const rawTo = parseDate(query.date_to);
    if (rawFrom === null || rawTo === null) {
        return { error: fail(
            DomainErrorCode.VALIDATION_FAILED,
            'date_from and date_to must use YYYY-MM-DD format.',
            422,
            { reason_code: 'BUSINESS_ADMIN_INVALID_DATE' }
        ) };
    }

    const dateFrom = rawFrom || todayManilaDate();
    const dateTo = rawTo || dateFrom;
    const startAt = new Date(`${dateFrom}T00:00:00.000+08:00`);
    const endAt = new Date(`${dateTo}T00:00:00.000+08:00`);
    if (startAt > endAt) {
        return { error: fail(
            DomainErrorCode.VALIDATION_FAILED,
            'date_from must be earlier than or equal to date_to.',
            422,
            { reason_code: 'BUSINESS_ADMIN_INVALID_DATE_RANGE' }
        ) };
    }

    const rangeDays = Math.floor((endAt.getTime() - startAt.getTime()) / MS_PER_DAY) + 1;
    if (rangeDays > MAX_ATTENDANCE_RANGE_DAYS) {
        return { error: fail(
            DomainErrorCode.VALIDATION_FAILED,
            `Attendance is limited to ${MAX_ATTENDANCE_RANGE_DAYS} days per request.`,
            422,
            { reason_code: 'BUSINESS_ADMIN_ATTENDANCE_DATE_RANGE_EXCEEDED' }
        ) };
    }

    return { dateFrom, dateTo };
};

export const buildGetBusinessAdminAttendanceUseCase = ({
    businessAdminOverviewRepository,
    posRepository
}) => async ({ query = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            access.reason,
            403,
            { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }
        );
    }

    const dateRange = resolveDateRange(query);
    if (dateRange.error) return dateRange.error;

    const rawBranchId = String(query.branch_id ?? '').trim();
    const branchId = rawBranchId ? parsePositiveInt(rawBranchId) : null;
    if (rawBranchId && !branchId) {
        return fail(
            DomainErrorCode.VALIDATION_FAILED,
            'branch_id must be a positive integer.',
            422,
            { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' }
        );
    }

    const allowedLocationIds = access.scope === 'all'
        ? null
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && allowedLocationIds.length === 0) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'No branch access is assigned to this user.',
            403,
            { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }
        );
    }
    if (branchId && Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(branchId)) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'This user is not assigned to the selected branch.',
            403,
            { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }
        );
    }

    const lifecycle = await posRepository.getCashierLifecycleReport({
        date_from: dateRange.dateFrom,
        date_to: dateRange.dateTo,
        page: parsePositiveInt(query.page, 1),
        limit: Math.min(200, parsePositiveInt(query.limit, 50)),
        ...(branchId
            ? { location_id: branchId }
            : (access.scope === 'all' ? {} : { location_ids: allowedLocationIds }))
    });

    return {
        success: true,
        data: {
            attendance: lifecycle.attendance,
            operators: lifecycle.operators,
            filters: {
                date_from: dateRange.dateFrom,
                date_to: dateRange.dateTo,
                branch_id: branchId
            },
            meta: {
                timezone: 'Asia/Manila',
                source: 'pos_cashier_lifecycle_read_model',
                scope: access.scope
            }
        }
    };
};
