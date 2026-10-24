import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { ONLINE_FULFILLMENT_STATUSES } from '../../shared/constants/orderFulfillmentStatuses.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = new Set(['in_store', 'online_store']);
const PAYMENT_TYPES = new Set(['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph']);
const PAYMENT_STATUSES = new Set(['unpaid', 'payment_pending', 'paid', 'failed', 'refund_pending', 'partial_refunded', 'refunded']);
const TRANSACTION_STATUSES = new Set(['completed', 'voided']);
const FULFILLMENT_STATUSES = new Set(ONLINE_FULFILLMENT_STATUSES);
const RECEIPT_TYPES = new Set(['sales', 'refund', 'voided']);

const fail = (code, message, statusCode = 400, details = null) => ({ success: false, error: new DomainError(code, message, { statusCode, details }) });
const parsePositiveInt = (value) => { const parsed = Number.parseInt(value, 10); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; };
const normalizeOptionalEnum = (value, permitted, label) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return { value: '' };
    if (!permitted.has(normalized)) return { error: `${label} is invalid.` };
    return { value: normalized };
};
const manilaRange = ({ dateFrom, dateTo }) => ({
    startAt: new Date(`${dateFrom || '1970-01-01'}T00:00:00.000+08:00`),
    endAt: new Date(`${dateTo || '2999-12-31'}T23:59:59.999+08:00`)
});

const resolveScope = async ({ user, repository, branchId = null }) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }) };
    const allowedLocationIds = access.scope === 'all' ? null : await repository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && allowedLocationIds.length === 0) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }) };
    if (branchId && Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(branchId)) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }) };
    return { allowedLocationIds };
};

export const buildListBusinessAdminOrdersUseCase = ({ businessAdminOrderCenterRepository, businessAdminOverviewRepository }) => async ({ query = {}, user = {} } = {}) => {
    const branchId = query.branch_id ? parsePositiveInt(query.branch_id) : null;
    if (query.branch_id && !branchId) return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422);
    const itemId = query.item_id ? parsePositiveInt(query.item_id) : null;
    if (query.item_id && !itemId) return fail(DomainErrorCode.VALIDATION_FAILED, 'item_id must be a positive integer.', 422);
    const scope = await resolveScope({ user, repository: businessAdminOverviewRepository, branchId });
    if (scope.error) return scope.error;
    const enumFilters = [
        ['source', SOURCES, 'source'], ['payment_type', PAYMENT_TYPES, 'payment_type'], ['payment_status', PAYMENT_STATUSES, 'payment_status'], ['status', TRANSACTION_STATUSES, 'status'], ['fulfillment_status', FULFILLMENT_STATUSES, 'fulfillment_status'], ['receipt_type', RECEIPT_TYPES, 'receipt_type']
    ];
    const normalized = {};
    for (const [key, permitted, label] of enumFilters) {
        const result = normalizeOptionalEnum(query[key], permitted, label);
        if (result.error) return fail(DomainErrorCode.VALIDATION_FAILED, result.error, 422);
        normalized[key] = result.value;
    }
    const dateFrom = String(query.date_from || '').trim();
    const dateTo = String(query.date_to || '').trim();
    if ((dateFrom && !DATE_ONLY_PATTERN.test(dateFrom)) || (dateTo && !DATE_ONLY_PATTERN.test(dateTo))) return fail(DomainErrorCode.VALIDATION_FAILED, 'date_from and date_to must use YYYY-MM-DD format.', 422);
    if (dateFrom && dateTo && dateFrom > dateTo) return fail(DomainErrorCode.VALIDATION_FAILED, 'date_from must be earlier than or equal to date_to.', 422);
    const terminalId = String(query.terminal_id || '').trim().toUpperCase();
    const cashierId = query.cashier_id ? parsePositiveInt(query.cashier_id) : null;
    if (query.cashier_id && !cashierId) return fail(DomainErrorCode.VALIDATION_FAILED, 'cashier_id must be a positive integer.', 422);
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), 100);
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const search = String(query.search || '').trim().slice(0, 100);
    const { startAt, endAt } = manilaRange({ dateFrom, dateTo });
    const data = await businessAdminOrderCenterRepository.listOrders({
        allowedLocationIds: scope.allowedLocationIds,
        filters: { page, limit, branchId, itemId, terminalId, cashierId, source: normalized.source, paymentType: normalized.payment_type, paymentStatus: normalized.payment_status, transactionStatus: normalized.status, fulfillmentStatus: normalized.fulfillment_status, receiptType: normalized.receipt_type, search, startAt, endAt }
    });
    return { success: true, data };
};

export const buildGetBusinessAdminOrderDetailUseCase = ({ businessAdminOrderCenterRepository, businessAdminOverviewRepository }) => async ({ transactionId, user = {} } = {}) => {
    const normalizedId = parsePositiveInt(transactionId);
    if (!normalizedId) return fail(DomainErrorCode.VALIDATION_FAILED, 'transactionId must be a positive integer.', 422);
    const scope = await resolveScope({ user, repository: businessAdminOverviewRepository });
    if (scope.error) return scope.error;
    const data = await businessAdminOrderCenterRepository.getOrderDetail(normalizedId, { allowedLocationIds: scope.allowedLocationIds });
    if (!data) return fail(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order not found or not available in your branch scope.', 404);
    return { success: true, data };
};
