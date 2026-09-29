import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import {
    resolveBusinessAdminAccess,
    userHasBusinessAdminPermission
} from '../domain/businessAdminAccessPolicy.js';

export const BUSINESS_ADMIN_EXPENSE_CATEGORIES = Object.freeze([
    'supplies',
    'utilities',
    'rent',
    'payroll',
    'transport',
    'marketing',
    'maintenance',
    'other'
]);

export const BUSINESS_ADMIN_EXPENSE_PAYMENT_METHODS = Object.freeze([
    'cash',
    'bank_transfer',
    'card',
    'gcash',
    'maya',
    'other'
]);

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,4})?$/;
const PAGE_SIZES = new Set([20, 50, 100]);
const STATUS_VALUES = new Set(['posted', 'voided']);

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

const normalizeText = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength);

const isAdminLike = (user = {}) => (
    user?.is_master_admin === true
    || String(user?.role || '').trim().toLowerCase() === 'admin'
);

const canUseExpensePermission = (user, permission) => (
    isAdminLike(user) || userHasBusinessAdminPermission(user, permission)
);

const authorizeExpenseAccess = async ({ user, businessAdminOverviewRepository, permission, branchId = null, requireBranch = false }) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return {
            error: fail(
                DomainErrorCode.AUTHORIZATION_FAILED,
                access.reason,
                403,
                { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }
            )
        };
    }
    if (!canUseExpensePermission(user, permission)) {
        return {
            error: fail(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Your account is not authorized to use the expense ledger.',
                403,
                { reason_code: 'BUSINESS_ADMIN_EXPENSE_PERMISSION_DENIED' }
            )
        };
    }

    const allowedLocationIds = access.scope === 'all'
        ? null
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && allowedLocationIds.length === 0) {
        return {
            error: fail(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'No branch access is assigned to this user.',
                403,
                { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }
            )
        };
    }
    if (branchId && Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(branchId)) {
        return {
            error: fail(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'This user is not assigned to the selected branch.',
                403,
                { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }
            )
        };
    }
    if (requireBranch && !branchId && access.scope !== 'all') {
        return {
            error: fail(
                DomainErrorCode.VALIDATION_FAILED,
                'Select a branch before recording an expense.',
                422,
                { reason_code: 'BUSINESS_ADMIN_EXPENSE_BRANCH_REQUIRED' }
            )
        };
    }
    return { access, allowedLocationIds };
};

const normalizeDateFilters = (query = {}) => {
    const dateFrom = parseDate(query.date_from);
    const dateTo = parseDate(query.date_to);
    if (dateFrom === null || dateTo === null) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'date_from and date_to must use YYYY-MM-DD format.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_DATE_INVALID' }) };
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return { error: fail(DomainErrorCode.VALIDATION_FAILED, 'date_from must be earlier than or equal to date_to.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_DATE_RANGE_INVALID' }) };
    }
    return { dateFrom, dateTo };
};

const normalizeAmount = (value) => {
    const normalized = String(value ?? '').trim();
    if (!MONEY_PATTERN.test(normalized)) return null;
    const number = Number(normalized);
    return number > 0 && number <= 9999999999.9999
        ? number.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
        : null;
};

const sameExpenseRequest = (existing, values) => (
    existing?.expense_date === values.expense_date
    && existing?.location_id === (values.location_id || null)
    && existing?.category === values.category
    && existing?.description === values.description
    && Number(existing?.amount) === Number(values.amount)
    && existing?.payment_method === values.payment_method
    && (existing?.vendor_name || '') === (values.vendor_name || '')
    && (existing?.reference || '') === (values.reference || '')
    && (existing?.notes || '') === (values.notes || '')
);

const buildFilters = ({ query, branchId, allowedLocationIds, dateFrom, dateTo }) => ({
    page: Math.max(Number.parseInt(query.page, 10) || 1, 1),
    limit: Number.parseInt(query.limit, 10) || 20,
    branchId,
    allowedLocationIds,
    dateFrom,
    dateTo,
    status: String(query.status || '').trim().toLowerCase(),
    search: normalizeText(query.search, 100)
});

export const buildListBusinessAdminExpensesUseCase = ({ businessAdminExpenseRepository, businessAdminOverviewRepository }) => async ({ query = {}, user = {} } = {}) => {
    const dateFilters = normalizeDateFilters(query);
    if (dateFilters.error) return dateFilters.error;

    const rawBranchId = String(query.branch_id ?? '').trim();
    const branchId = rawBranchId ? parsePositiveInt(rawBranchId) : null;
    if (rawBranchId && !branchId) return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_BRANCH_INVALID' });

    const limit = Number.parseInt(query.limit, 10) || 20;
    if (!PAGE_SIZES.has(limit)) return fail(DomainErrorCode.VALIDATION_FAILED, 'limit must be one of: 20, 50, or 100.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_LIMIT_INVALID' });
    const status = String(query.status || '').trim().toLowerCase();
    if (status && !STATUS_VALUES.has(status)) return fail(DomainErrorCode.VALIDATION_FAILED, 'status must be posted or voided.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_STATUS_INVALID' });

    const authorization = await authorizeExpenseAccess({
        user,
        businessAdminOverviewRepository,
        permission: PERMISSIONS.EXPENSES.actions.VIEW,
        branchId
    });
    if (authorization.error) return authorization.error;

    const filters = buildFilters({
        query: { ...query, limit, status },
        branchId,
        allowedLocationIds: authorization.allowedLocationIds,
        dateFrom: dateFilters.dateFrom,
        dateTo: dateFilters.dateTo
    });
    const [result, summary] = await Promise.all([
        businessAdminExpenseRepository.list({ filters }),
        businessAdminExpenseRepository.getSummary({ filters })
    ]);

    return ok({
        ...result,
        summary,
        categories: BUSINESS_ADMIN_EXPENSE_CATEGORIES,
        payment_methods: BUSINESS_ADMIN_EXPENSE_PAYMENT_METHODS,
        filters: {
            date_from: dateFilters.dateFrom || null,
            date_to: dateFilters.dateTo || null,
            branch_id: branchId,
            status: status || null,
            search: filters.search || ''
        },
        meta: {
            currency: 'PHP',
            timezone: 'Asia/Manila',
            scope: authorization.access.scope,
            source: 'business_admin_operational_expense_ledger',
            profit_after_expenses: 'deferred',
            statutory_accounting: 'deferred'
        }
    });
};

export const buildCreateBusinessAdminExpenseUseCase = ({ businessAdminExpenseRepository, businessAdminOverviewRepository }) => async ({ body = {}, user = {}, auditContext = {} } = {}) => {
    const rawBranchId = String(body.branch_id ?? '').trim();
    const branchId = rawBranchId ? parsePositiveInt(rawBranchId) : null;
    if (rawBranchId && !branchId) return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_BRANCH_INVALID' });

    const authorization = await authorizeExpenseAccess({
        user,
        businessAdminOverviewRepository,
        permission: PERMISSIONS.EXPENSES.actions.CREATE,
        branchId,
        requireBranch: true
    });
    if (authorization.error) return authorization.error;

    const expenseDate = parseDate(body.expense_date);
    const category = normalizeText(body.category, 80).toLowerCase();
    const description = normalizeText(body.description, 255);
    const amount = normalizeAmount(body.amount);
    const paymentMethod = normalizeText(body.payment_method || 'cash', 30).toLowerCase();
    const vendorName = normalizeText(body.vendor_name, 160);
    const reference = normalizeText(body.reference, 120);
    const notes = normalizeText(body.notes, 500);
    const idempotencyKey = normalizeText(body.idempotency_key, 120);

    if (!expenseDate) return fail(DomainErrorCode.VALIDATION_FAILED, 'expense_date must use a valid YYYY-MM-DD date.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_DATE_REQUIRED' });
    if (!BUSINESS_ADMIN_EXPENSE_CATEGORIES.includes(category)) return fail(DomainErrorCode.VALIDATION_FAILED, 'Choose a valid expense category.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_CATEGORY_INVALID' });
    if (!description) return fail(DomainErrorCode.VALIDATION_FAILED, 'A description is required.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_DESCRIPTION_REQUIRED' });
    if (!amount) return fail(DomainErrorCode.VALIDATION_FAILED, 'Amount must be greater than zero and have up to four decimal places.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_AMOUNT_INVALID' });
    if (!BUSINESS_ADMIN_EXPENSE_PAYMENT_METHODS.includes(paymentMethod)) return fail(DomainErrorCode.VALIDATION_FAILED, 'Choose a valid payment method.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_PAYMENT_METHOD_INVALID' });
    if (!idempotencyKey) return fail(DomainErrorCode.VALIDATION_FAILED, 'A request idempotency key is required.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_IDEMPOTENCY_REQUIRED' });

    let location = null;
    if (branchId) {
        [location] = await businessAdminOverviewRepository.listActiveLocations({
            branchId,
            allowedLocationIds: authorization.allowedLocationIds
        });
        if (!location) return fail(DomainErrorCode.RESOURCE_NOT_FOUND, 'The selected branch is not available.', 404, { reason_code: 'BUSINESS_ADMIN_EXPENSE_BRANCH_NOT_FOUND' });
    }

    const values = {
        expense_date: expenseDate,
        location_id: branchId || null,
        location_name_snapshot: location?.name || null,
        category,
        description,
        amount,
        currency: 'PHP',
        payment_method: paymentMethod,
        vendor_name: vendorName || null,
        reference: reference || null,
        notes: notes || null,
        status: 'posted',
        created_by: user.user_id,
        idempotency_key: idempotencyKey
    };

    const existing = await businessAdminExpenseRepository.findByIdempotencyKey({ idempotencyKey });
    if (existing) {
        if (!sameExpenseRequest(existing, values)) {
            return fail(DomainErrorCode.CONFLICT, 'This request key was already used for a different expense.', 409, { reason_code: 'BUSINESS_ADMIN_EXPENSE_IDEMPOTENCY_CONFLICT' });
        }
        return ok({ expense: existing, idempotent: true });
    }

    let expense;
    try {
        expense = await businessAdminExpenseRepository.create({ values });
    } catch (error) {
        // The unique idempotency key is the final concurrency guard. If two
        // requests race between the read and insert, resolve the winner as the
        // same safe retry instead of returning an avoidable 500 response.
        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
        const concurrentExpense = await businessAdminExpenseRepository.findByIdempotencyKey({ idempotencyKey });
        if (!concurrentExpense || !sameExpenseRequest(concurrentExpense, values)) throw error;
        return ok({ expense: concurrentExpense, idempotent: true });
    }
    await businessAdminExpenseRepository.appendAudit({
        user,
        expense,
        action: 'CREATE',
        eventType: 'business_admin_expense_created',
        changes: { after: expense },
        auditContext
    });
    return ok({ expense, idempotent: false });
};

export const buildVoidBusinessAdminExpenseUseCase = ({ businessAdminExpenseRepository, businessAdminOverviewRepository }) => async ({ expenseId, body = {}, user = {}, auditContext = {} } = {}) => {
    const normalizedExpenseId = parsePositiveInt(expenseId);
    if (!normalizedExpenseId) return fail(DomainErrorCode.VALIDATION_FAILED, 'expense id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_ID_INVALID' });

    const authorization = await authorizeExpenseAccess({
        user,
        businessAdminOverviewRepository,
        permission: PERMISSIONS.EXPENSES.actions.VOID
    });
    if (authorization.error) return authorization.error;

    const current = await businessAdminExpenseRepository.findRawById({ expenseId: normalizedExpenseId });
    if (!current) return fail(DomainErrorCode.RESOURCE_NOT_FOUND, 'Expense not found.', 404, { reason_code: 'BUSINESS_ADMIN_EXPENSE_NOT_FOUND' });
    if (Array.isArray(authorization.allowedLocationIds) && (!current.location_id || !authorization.allowedLocationIds.includes(Number(current.location_id)))) {
        return fail(DomainErrorCode.RESOURCE_NOT_FOUND, 'Expense not found.', 404, { reason_code: 'BUSINESS_ADMIN_EXPENSE_NOT_FOUND' });
    }
    if (current.status === 'voided') return fail(DomainErrorCode.CONFLICT, 'This expense is already voided.', 409, { reason_code: 'BUSINESS_ADMIN_EXPENSE_ALREADY_VOIDED' });

    const voidReason = normalizeText(body.reason, 500);
    if (!voidReason) return fail(DomainErrorCode.VALIDATION_FAILED, 'A reason is required when voiding an expense.', 422, { reason_code: 'BUSINESS_ADMIN_EXPENSE_VOID_REASON_REQUIRED' });

    const before = {
        expense_id: current.business_admin_expense_id,
        status: current.status,
        amount: current.amount,
        location_id: current.location_id
    };
    const expense = await businessAdminExpenseRepository.voidPosted({
        expenseId: normalizedExpenseId,
        voidedBy: user.user_id,
        voidReason
    });
    if (!expense) return fail(DomainErrorCode.CONFLICT, 'The expense changed before it could be voided. Refresh and try again.', 409, { reason_code: 'BUSINESS_ADMIN_EXPENSE_VOID_CONFLICT' });

    await businessAdminExpenseRepository.appendAudit({
        user,
        expense,
        action: 'UPDATE',
        eventType: 'business_admin_expense_voided',
        reason: voidReason,
        changes: { before, after: { expense_id: expense.expense_id, status: expense.status, void_reason: voidReason } },
        auditContext
    });
    return ok({ expense });
};
