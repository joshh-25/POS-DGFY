import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ACTIVITY_RANGE_DAYS = 366;

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const todayManilaDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());

const parseDate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (!DATE_ONLY_PATTERN.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
        ? normalized
        : null;
};

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const resolveDateRange = (query = {}) => {
    const today = todayManilaDate();
    const rawFrom = parseDate(query.date_from);
    const rawTo = parseDate(query.date_to);
    const dateFrom = rawFrom || today;
    const dateTo = rawTo || dateFrom;
    if (rawFrom === null || rawTo === null) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'date_from and date_to must use YYYY-MM-DD format.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_DATE' }) };
    }
    const startAt = new Date(`${dateFrom}T00:00:00.000+08:00`);
    const endAt = new Date(`${dateTo}T00:00:00.000+08:00`);
    if (startAt > endAt) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'date_from must be earlier than or equal to date_to.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_DATE_RANGE' }) };
    }
    const rangeDays = Math.floor((endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (rangeDays > MAX_ACTIVITY_RANGE_DAYS) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, `Activity analytics are limited to ${MAX_ACTIVITY_RANGE_DAYS} days per request.`, 422, { reason_code: 'BUSINESS_ADMIN_REPORT_DATE_RANGE_EXCEEDED' }) };
    }
    return { dateFrom, dateTo };
};

export const buildGetBusinessAdminPosActivityAnalyticsUseCase = ({
    businessAdminOverviewRepository,
    businessAdminPosActivityRepository
}) => async ({ query = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
    }

    const dateRange = resolveDateRange(query);
    if (dateRange.error) return dateRange.error;

    const branchId = parsePositiveInt(query.branch_id);
    if (String(query.branch_id || '').trim() && !branchId) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' });
    }

    const assignedLocationIds = access.scope === 'all'
        ? []
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && assignedLocationIds.length === 0) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' });
    }
    if (branchId && access.scope !== 'all' && !assignedLocationIds.includes(branchId)) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
    }

    const analytics = await businessAdminPosActivityRepository.getActivityAnalytics({
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        branchId: branchId || null,
        allowedLocationIds: access.scope === 'all' ? null : assignedLocationIds
    });

    return ok({
        ...analytics,
        meta: {
            as_of: new Date().toISOString(),
            timezone: 'Asia/Manila',
            source: 'pos_transaction_operational_ledger',
            date_from: dateRange.dateFrom,
            date_to: dateRange.dateTo,
            branch_id: branchId || null,
            scope: access.scope
        },
        definitions: {
            qualifying_sale: 'One completed POS transaction with payment_status paid. Split-tender allocations never multiply the sale; the persisted transaction total_amount is summed once per sale.',
            excluded: 'Voided transactions, refund-related or otherwise unpaid payment states, and online orders without completed fulfillment are excluded, following canonical POS reporting source rules.',
            distinct_linked_customers: 'Count of distinct store_customer_id values among qualifying sales — explicit tenant profile links only. Transactions without a linked profile are reported separately as unlinked_transaction_count and are never merged by name, email, or phone snapshot.',
            quiet_periods: 'Recurring weekday/hour slots ranked by average qualifying sales per weekday occurrence in the selected range. Payment and customer columns are context only; ranking uses the sale count average.'
        },
        guidance: {
            operating_hours_unknown: 'Branch operating schedules are not known to this view. A zero-activity slot may mean the branch was closed, not that demand was low.',
            historical_only: 'Quiet periods describe historical activity in the selected range. They are planning guidance only and do not establish that deployment, updates, or tests are currently safe.',
            live_safety_excluded: 'Live deployment safety would additionally require current terminal, checkout, and synchronization state, which this view does not assess.'
        },
        posthog_role: {
            operational_source: 'Server-side tenant-scoped POS transaction records above. PostHog browser events are consent-gated and lossy and must never recompute these metrics.',
            exploratory_use: 'PostHog remains useful for consent-gated exploratory behavior analysis: discovery_viewed, discovery_search_submitted, store_viewed, cart_item_added, checkout_started, checkout_step_completed, order_placed, checkout_failed, pos_order_completed, pos_payment_method_selected, and pos_offline_queue_flushed funnels and dashboards.'
        }
    });
};
