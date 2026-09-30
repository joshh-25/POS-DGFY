import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const TENANT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SETTLED_SESSION_STATUSES = new Set(['finalized', 'paid', 'refund_pending', 'partial_refunded', 'refunded']);
const EXCEPTION_SESSION_STATUSES = new Set(['failed', 'expired', 'cancelled', 'paid_manual_resolution_required', 'split_failed_manual_settlement_required']);
const UNFINALIZED_PAID_SESSION_STATUSES = new Set(['paid', 'paid_manual_resolution_required']);

const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const normalizeTenantId = (tenant = {}) => {
    const value = String(tenant?.id || tenant?.tenant_id || '').trim().toLowerCase();
    return TENANT_UUID_PATTERN.test(value) ? value : null;
};

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const businessDayStart = (value, inclusive = true) => {
    if (!value) return null;
    const normalized = String(value).trim();
    if (!BUSINESS_DATE_PATTERN.test(normalized)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Payment monitoring dates must use YYYY-MM-DD.', { statusCode: 422 });
    }
    const boundary = new Date(`${normalized}T00:00:00.000+08:00`);
    if (Number.isNaN(boundary.getTime())) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Payment monitoring date is invalid.', { statusCode: 422 });
    }
    if (!inclusive) boundary.setUTCDate(boundary.getUTCDate() + 1);
    return boundary;
};

const normalizeMonitoringFilters = (query = {}) => {
    const dateFrom = String(query.date_from || '').trim();
    const dateTo = String(query.date_to || '').trim();
    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Payment monitoring start date cannot be after end date.', { statusCode: 422 });
    }
    return {
        eventAtFrom: businessDayStart(dateFrom, true),
        eventAtTo: businessDayStart(dateTo, false)
    };
};

const serializePaymentAccount = (account = null) => {
    if (!account) return null;
    return {
        provider: account.provider,
        wallet_status: account.wallet_status || 'unknown',
        onboarding_status: account.onboarding_status || 'pending',
        qrph_enabled: account.qrph_enabled === true,
        split_enabled: account.split_enabled === true,
        charges_enabled: account.charges_enabled === true,
        requirements_due: account.requirements_due || null,
        wallet_verified_at: account.wallet_verified_at || null,
        last_synced_at: account.last_synced_at || null,
        updated_at: account.updated_at || null
    };
};

const serializeSession = (session = {}, refunds = []) => ({
    payment_session_id: session.public_reference,
    target_type: session.target_type,
    status: session.status,
    total_amount_centavos: Number(session.total_amount_centavos || 0),
    platform_fee_centavos: Number(session.platform_fee_centavos || 0),
    paid_at: session.paid_at || null,
    finalized_at: session.finalized_at || null,
    pos_transaction_id: session.pos_transaction_id || null,
    failure_code: session.failure_code || null,
    failure_reason: session.failure_reason || null,
    created_at: session.created_at || null,
    refunds: refunds.map((refund) => ({
        refund_id: refund.public_reference,
        amount_centavos: Number(refund.amount_centavos || 0),
        status: refund.status,
        reason: refund.reason,
        failure_code: refund.failure_code || null,
        failure_reason: refund.failure_reason || null,
        created_at: refund.created_at || null
    }))
});

export const buildGetBusinessAdminCommerceMonitoringUseCase = ({ commercePaymentRepository }) => async ({ user = {}, tenant = null, query = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
    }
    if (access.scope !== 'all') {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant-wide Business Admin access is required for payment monitoring.', 403, { reason_code: 'BUSINESS_ADMIN_TENANT_WIDE_SCOPE_REQUIRED' });
    }
    const tenantId = normalizeTenantId(tenant);
    if (!tenantId) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant context is required for payment monitoring.', 403, { reason_code: 'BUSINESS_ADMIN_TENANT_CONTEXT_REQUIRED' });
    }

    try {
        const filters = { tenantId, provider: 'paymongo', ...normalizeMonitoringFilters(query) };
        const [paymentAccount, sessions, totalSessionCount, sessionSummaryRows, refundSummaryRows] = await Promise.all([
            commercePaymentRepository.findTenantPaymentAccount({ tenantId, provider: 'paymongo' }),
            commercePaymentRepository.listSessions(filters, { limit: 50, offset: 0 }),
            commercePaymentRepository.countSessions(filters),
            commercePaymentRepository.listSessionSummary(filters),
            commercePaymentRepository.listRefundSummary(filters)
        ]);
        const rows = await Promise.all((sessions || []).map(async (session) => (
            serializeSession(session, await commercePaymentRepository.listRefundsBySession(session.session_id))
        )));
        const summary = (sessionSummaryRows || []).reduce((result, row) => {
            const status = String(row.status || '').toLowerCase();
            const sessionCount = Number(row.session_count || 0);
            result.session_count += sessionCount;
            result.by_status[status] = (result.by_status[status] || 0) + sessionCount;
            if (SETTLED_SESSION_STATUSES.has(status)) {
                result.collected_amount_centavos += Number(row.total_amount_centavos || 0);
                result.platform_fee_centavos += Number(row.platform_fee_centavos || 0);
            }
            if (EXCEPTION_SESSION_STATUSES.has(status)) result.exception_count += sessionCount;
            if (UNFINALIZED_PAID_SESSION_STATUSES.has(status)) {
                result.paid_unfinalized_count += sessionCount;
                result.paid_unfinalized_amount_centavos += Number(row.total_amount_centavos || 0);
            }
            if (status === 'split_failed_manual_settlement_required') {
                result.manual_settlement_count += sessionCount;
                result.manual_settlement_amount_centavos += Number(row.total_amount_centavos || 0);
            }
            return result;
        }, {
            session_count: 0,
            collected_amount_centavos: 0,
            platform_fee_centavos: 0,
            succeeded_refund_centavos: 0,
            pending_refund_centavos: 0,
            exception_count: 0,
            paid_unfinalized_count: 0,
            paid_unfinalized_amount_centavos: 0,
            manual_settlement_count: 0,
            manual_settlement_amount_centavos: 0,
            by_status: {}
        });
        (refundSummaryRows || []).forEach((row) => {
            const status = String(row.status || '').toLowerCase();
            const amount = Number(row.amount_centavos || 0);
            const count = Number(row.refund_count || 0);
            if (status === 'succeeded') summary.succeeded_refund_centavos += amount;
            if (status === 'pending') summary.pending_refund_centavos += amount;
            if (['failed', 'manual_review_required'].includes(status)) summary.exception_count += count;
        });
        summary.merchant_net_before_provider_fees_centavos = Math.max(0, summary.collected_amount_centavos - summary.platform_fee_centavos - summary.succeeded_refund_centavos);
        return {
            success: true,
            data: {
                payment_account: serializePaymentAccount(paymentAccount),
                payment_sessions: rows,
                payment_sessions_page: {
                    count: rows.length,
                    limit: 50,
                    total: Number(totalSessionCount || 0)
                },
                reconciliation: {
                    ...summary,
                    date_from: String(query.date_from || '').trim() || null,
                    date_to: String(query.date_to || '').trim() || null,
                    scope: 'Stored payment-session evidence only; this is not a PayMongo payout ledger or a confirmation of bank settlement.',
                    as_of: new Date().toISOString()
                }
            }
        };
    } catch (error) {
        if (error instanceof DomainError) {
            return { success: false, error };
        }
        return fail(DomainErrorCode.INTERNAL_ERROR, 'Unable to load payment monitoring data.', 500);
    }
};
