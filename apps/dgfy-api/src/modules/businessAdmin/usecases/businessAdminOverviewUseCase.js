import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const normalizeDateOnly = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (!DATE_ONLY_PATTERN.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return normalized;
};

const todayManilaDate = () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(new Date());
};

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const resolveBusinessAdminOverviewDateRange = (query = {}) => {
    const today = todayManilaDate();
    const rawDateFrom = normalizeDateOnly(query.date_from);
    const rawDateTo = normalizeDateOnly(query.date_to);
    const dateFrom = rawDateFrom || today;
    const dateTo = rawDateTo || dateFrom;

    if (rawDateFrom === null || rawDateTo === null) {
        return {
            error: fail(
                DomainErrorCode.VALIDATION_FAILED,
                'date_from and date_to must use YYYY-MM-DD format.',
                422,
                { reason_code: 'BUSINESS_ADMIN_INVALID_DATE' }
            )
        };
    }

    const startAt = new Date(`${dateFrom}T00:00:00.000+08:00`);
    const endAt = new Date(new Date(`${dateTo}T00:00:00.000+08:00`).getTime() + MS_PER_DAY - 1);
    if (startAt > endAt) {
        return {
            error: fail(
                DomainErrorCode.VALIDATION_FAILED,
                'date_from must be earlier than or equal to date_to.',
                422,
                { reason_code: 'BUSINESS_ADMIN_INVALID_DATE_RANGE' }
            )
        };
    }

    return { dateFrom, dateTo, startAt, endAt };
};

export const buildGetBusinessAdminOverviewUseCase = ({ businessAdminOverviewRepository, businessAdminAlertSnapshotRepository = null }) => async ({
    query = {},
    user = {},
    tenant = null,
    includeScheduledAlerts = true
} = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            access.reason,
            403,
            { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }
        );
    }

    const dateRange = resolveBusinessAdminOverviewDateRange(query);
    if (dateRange.error) return dateRange.error;

    const branchId = parsePositiveInt(query.branch_id);
    if (String(query.branch_id || '').trim() && !branchId) {
        return fail(
            DomainErrorCode.VALIDATION_FAILED,
            'branch_id must be a positive integer.',
            422,
            { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' }
        );
    }

    const registerId = String(query.register_id || '').trim().toUpperCase();
    const assignedLocationIds = access.scope === 'all'
        ? []
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);

    if (access.scope !== 'all' && assignedLocationIds.length === 0) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'No branch access is assigned to this user.',
            403,
            { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }
        );
    }

    if (branchId && access.scope !== 'all' && !assignedLocationIds.includes(branchId)) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'This user is not assigned to the selected branch.',
            403,
            { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }
        );
    }

    const overview = await businessAdminOverviewRepository.getOverview({
        tenant,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        startAt: dateRange.startAt,
        endAt: dateRange.endAt,
        branchId,
        registerId,
        allowedLocationIds: access.scope === 'all' ? null : assignedLocationIds
    });

    // Overview consumes the same user-scoped notification projection as the
    // Notifications workspace. Keep the legacy `alerts` field as a response
    // compatibility alias, but do not create a second alert lifecycle here.
    const notificationBranchIds = branchId
        ? [branchId]
        : (access.scope === 'all' ? null : assignedLocationIds);
    const notifications = includeScheduledAlerts && businessAdminAlertSnapshotRepository
        ? await businessAdminAlertSnapshotRepository.list({
            userId: user.user_id,
            branchIds: notificationBranchIds,
            status: 'open',
            includeDismissed: false,
            limit: 8
        })
        : [];
    return ok({ ...overview, notifications, alerts: notifications });
};
