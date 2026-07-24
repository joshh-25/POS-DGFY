import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { dgfyAffiliateRepository } from '../repositories/dgfyAffiliateRepository.js';
import { resolveTenantByStoreSlug } from '../../../services/storefrontTenantResolver.js';

const MAX_RATE_BPS = 10000; // 100.00%
const MIN_ATTRIBUTION_WINDOW_DAYS = 1;
const MAX_ATTRIBUTION_WINDOW_DAYS = 365;
const ENROLLMENT_STATUS_VALUES = new Set(['active', 'suspended', 'revoked']);
const PAYOUT_METHOD_TYPES = new Set(['bank', 'gcash', 'maya']);

const mapError = (error, fallbackMessage) => {
    if (error instanceof DomainError) return error;
    return new DomainError(DomainErrorCode.INTERNAL_ERROR, fallbackMessage, {
        statusCode: error?.statusCode || 500,
        details: error?.details || null
    });
};

const ensureAccount = (account) => {
    if (!account?.id) {
        throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'DGFY account authentication is required.', { statusCode: 401 });
    }
    return account;
};

const ensureTenantId = (tenantId) => {
    const value = String(tenantId || '').trim();
    if (!value) {
        throw new DomainError(DomainErrorCode.TENANT_CONTEXT_MISSING, 'Tenant context is required.', { statusCode: 400 });
    }
    return value;
};

const parseOptionalRateBps = (value, { field = 'commission_rate_bps' } = {}) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_RATE_BPS) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${field} must be an integer between 0 and ${MAX_RATE_BPS} (basis points).`, { statusCode: 422 });
    }
    return parsed;
};

const parseRequiredRateBps = (value, { field = 'default_rate_bps' } = {}) => {
    const parsed = parseOptionalRateBps(value, { field });
    if (parsed === undefined || parsed === null) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${field} is required.`, { statusCode: 422 });
    }
    return parsed;
};

const parseOptionalPositiveInt = (value, { field, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${field} must be an integer between ${min} and ${max}.`, { statusCode: 422 });
    }
    return parsed;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

// requireAllFields=true (create) enforces the fields the chosen method_type needs; false (update)
// only validates whatever fields were actually sent, since an update may not touch method_type.
const validatePayoutMethodPayload = (body = {}, { requireAllFields = false } = {}) => {
    const updates = {};
    if (body.method_type !== undefined || requireAllFields) {
        const methodType = String(body.method_type || '').trim().toLowerCase();
        if (!PAYOUT_METHOD_TYPES.has(methodType)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `method_type must be one of: ${[...PAYOUT_METHOD_TYPES].join(', ')}.`, { statusCode: 422 });
        }
        updates.method_type = methodType;
    }
    if (body.label !== undefined) updates.label = body.label ? String(body.label).trim().slice(0, 100) : null;
    if (body.bank_name !== undefined) updates.bank_name = body.bank_name ? String(body.bank_name).trim() : null;
    if (body.account_name !== undefined) updates.account_name = body.account_name ? String(body.account_name).trim() : null;
    if (body.account_number !== undefined) updates.account_number = body.account_number ? String(body.account_number).trim() : null;
    if (body.mobile_number !== undefined) updates.mobile_number = body.mobile_number ? String(body.mobile_number).trim() : null;
    if (body.is_default !== undefined) updates.is_default = body.is_default === true;

    if (requireAllFields) {
        if (updates.method_type === 'bank' && (!updates.bank_name || !updates.account_name || !updates.account_number)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'bank_name, account_name, and account_number are required for a bank payout method.', { statusCode: 422 });
        }
        if ((updates.method_type === 'gcash' || updates.method_type === 'maya') && !updates.mobile_number) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'mobile_number is required for a GCash/Maya payout method.', { statusCode: 422 });
        }
    }
    return updates;
};

const buildAffiliateShareUrl = ({ slug, shortCode }) => {
    const origin = String(process.env.STOREFRONT_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
    if (!slug) return { path: null, url: null };
    const path = `/${encodeURIComponent(String(slug).trim().toLowerCase())}?p=${encodeURIComponent(shortCode)}`;
    return { path, url: origin ? `${origin}${path}` : null };
};

// --- Admin (tenant staff/owner, gated by AFFILIATES permissions in routes) ---

export const buildGetAffiliateSettingsUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            return ok({ settings: await repository.getSettings(tenant) });
        } catch (error) {
            return fail(mapError(error, 'Failed to load affiliate settings'));
        }
    }
);

export const buildUpdateAffiliateSettingsUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const updates = {};
            if (body.program_enabled !== undefined) updates.program_enabled = body.program_enabled === true;
            if (body.default_rate_bps !== undefined) updates.default_rate_bps = parseRequiredRateBps(body.default_rate_bps, { field: 'default_rate_bps' });
            if (body.attribution_window_days !== undefined) {
                updates.attribution_window_days = parseOptionalPositiveInt(body.attribution_window_days, {
                    field: 'attribution_window_days',
                    min: MIN_ATTRIBUTION_WINDOW_DAYS,
                    max: MAX_ATTRIBUTION_WINDOW_DAYS
                });
            }
            if (body.min_cashout_centavos !== undefined) {
                updates.min_cashout_centavos = parseOptionalPositiveInt(body.min_cashout_centavos, { field: 'min_cashout_centavos', min: 0 });
            }
            if (body.auto_approve_enrollment !== undefined) updates.auto_approve_enrollment = body.auto_approve_enrollment === true;

            const settings = await repository.upsertSettings(tenant, updates);
            return ok({ settings });
        } catch (error) {
            return fail(mapError(error, 'Failed to update affiliate settings'));
        }
    }
);

export const buildListAffiliatesUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const enrollments = await repository.listEnrollmentsForTenant(tenant);
            const withEarnings = await Promise.all(enrollments.map(async (enrollment) => ({
                ...enrollment,
                earnings: await repository.getEarningsSummary(enrollment.dgfy_account_id, tenant)
            })));
            return ok({ affiliates: withEarnings });
        } catch (error) {
            return fail(mapError(error, 'Failed to list affiliates'));
        }
    }
);

export const buildProvisionAffiliateUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const rateBps = parseOptionalRateBps(body.commission_rate_bps, { field: 'commission_rate_bps' });

            const dgfyAccountId = String(body.dgfy_account_id || '').trim();
            const email = normalizeEmail(body.email);
            if (!dgfyAccountId && !email) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'dgfy_account_id or email is required.', { statusCode: 422 });
            }

            const account = dgfyAccountId
                ? await repository.findAccountById(dgfyAccountId)
                : await repository.findAccountByEmail(email);
            if (!account) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'No DGFY account matches that email or ID yet. The affiliate needs an existing DGFY account before they can be provisioned.',
                    { statusCode: 404 }
                );
            }

            const existing = await repository.findEnrollmentByAccountAndTenant(account.id, tenant);
            if (existing) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'This DGFY account is already enrolled as an affiliate for this store.', { statusCode: 409 });
            }

            const { shortCode, shareCodeHash } = await repository.generateUniqueShareCode();
            const enrollment = await repository.createEnrollment({
                dgfyAccountId: account.id,
                tenantId: tenant,
                shortCode,
                shareCodeHash,
                commissionRateBps: rateBps ?? null,
                status: 'active',
                source: 'admin_provisioned',
                invitedEmail: account.email,
                activatedAt: new Date()
            });
            return ok({ enrollment });
        } catch (error) {
            return fail(mapError(error, 'Failed to provision affiliate'));
        }
    }
);

export const buildUpdateAffiliateEnrollmentUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, enrollmentId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const updates = {};
            if (body.commission_rate_bps !== undefined) {
                updates.commission_rate_bps = parseOptionalRateBps(body.commission_rate_bps, { field: 'commission_rate_bps' });
            }
            if (body.status !== undefined) {
                const status = String(body.status || '').trim();
                if (!ENROLLMENT_STATUS_VALUES.has(status)) {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `status must be one of: ${[...ENROLLMENT_STATUS_VALUES].join(', ')}.`, { statusCode: 422 });
                }
                updates.status = status;
            }
            if (Object.keys(updates).length === 0) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'No updatable fields were provided.', { statusCode: 422 });
            }

            const enrollment = await repository.updateEnrollment(tenant, enrollmentId, updates);
            if (!enrollment) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
            }
            return ok({ enrollment });
        } catch (error) {
            return fail(mapError(error, 'Failed to update affiliate enrollment'));
        }
    }
);

export const buildGetAffiliateQrPayloadUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, enrollmentId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const enrollment = await repository.findEnrollmentById(tenant, enrollmentId);
            if (!enrollment) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
            }
            const slug = await repository.getStorefrontSlug(tenant);
            const { path, url } = buildAffiliateShareUrl({ slug, shortCode: enrollment.short_code });
            return ok({
                short_code: enrollment.short_code,
                param: 'p',
                slug,
                path,
                url
            });
        } catch (error) {
            return fail(mapError(error, 'Failed to build affiliate share link'));
        }
    }
);

// --- Affiliate self-service (authenticateDgfyAccount) ---

export const buildListMyAffiliateEnrollmentsUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ account }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            return ok({ enrollments: await repository.listEnrollmentsForAccount(dgfyAccount.id) });
        } catch (error) {
            return fail(mapError(error, 'Failed to list your affiliate enrollments'));
        }
    }
);

export const buildEnrollSelfServeAffiliateUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ account, body = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const tenant = ensureTenantId(body.tenant_id);

            const settings = await repository.getSettings(tenant);
            if (!settings.program_enabled || !settings.auto_approve_enrollment) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Self-serve affiliate enrollment is not open for this store yet.', { statusCode: 403 });
            }

            const existing = await repository.findEnrollmentByAccountAndTenant(dgfyAccount.id, tenant);
            if (existing) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'You are already enrolled as an affiliate for this store.', { statusCode: 409 });
            }

            const { shortCode, shareCodeHash } = await repository.generateUniqueShareCode();
            const enrollment = await repository.createEnrollment({
                dgfyAccountId: dgfyAccount.id,
                tenantId: tenant,
                shortCode,
                shareCodeHash,
                commissionRateBps: null,
                status: 'active',
                source: 'self_serve',
                invitedEmail: dgfyAccount.email,
                activatedAt: new Date()
            });
            return ok({ enrollment });
        } catch (error) {
            return fail(mapError(error, 'Failed to enroll as an affiliate'));
        }
    }
);

export const buildGetAffiliateEarningsUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ account, query = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const tenantId = String(query.tenant_id || '').trim() || null;

            if (tenantId) {
                const enrollment = await repository.findEnrollmentByAccountAndTenant(dgfyAccount.id, tenantId);
                if (!enrollment) {
                    throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'You are not enrolled as an affiliate for this store.', { statusCode: 404 });
                }
                return ok({ earnings: await repository.getEarningsSummary(dgfyAccount.id, tenantId) });
            }

            const enrollments = await repository.listEnrollmentsForAccount(dgfyAccount.id);
            const [overall, byStore] = await Promise.all([
                repository.getEarningsSummary(dgfyAccount.id, null),
                Promise.all(enrollments.map(async (enrollment) => ({
                    tenant_id: enrollment.tenant_id,
                    tenant: enrollment.tenant,
                    earnings: await repository.getEarningsSummary(dgfyAccount.id, enrollment.tenant_id)
                })))
            ]);
            return ok({ earnings: overall, by_store: byStore });
        } catch (error) {
            return fail(mapError(error, 'Failed to load your affiliate earnings'));
        }
    }
);

// --- Payout methods (self-service, account-level - not tenant-scoped) ---

export const buildManageAffiliatePayoutMethodsUseCases = ({ repository = dgfyAffiliateRepository } = {}) => ({
    list: async ({ account }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            return ok({ payout_methods: await repository.listPayoutMethods(dgfyAccount.id) });
        } catch (error) {
            return fail(mapError(error, 'Failed to list payout methods'));
        }
    },
    create: async ({ account, body = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const updates = validatePayoutMethodPayload(body, { requireAllFields: true });
            const payoutMethod = await repository.createPayoutMethod(dgfyAccount.id, updates);
            return ok({ payout_method: payoutMethod });
        } catch (error) {
            return fail(mapError(error, 'Failed to save payout method'));
        }
    },
    update: async ({ account, payoutMethodId, body = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const updates = validatePayoutMethodPayload(body, { requireAllFields: false });
            if (Object.keys(updates).length === 0) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'No updatable fields were provided.', { statusCode: 422 });
            }
            const payoutMethod = await repository.updatePayoutMethod(dgfyAccount.id, payoutMethodId, updates);
            if (!payoutMethod) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payout method not found.', { statusCode: 404 });
            return ok({ payout_method: payoutMethod });
        } catch (error) {
            return fail(mapError(error, 'Failed to update payout method'));
        }
    },
    setDefault: async ({ account, payoutMethodId }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const payoutMethod = await repository.updatePayoutMethod(dgfyAccount.id, payoutMethodId, { is_default: true });
            if (!payoutMethod) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payout method not found.', { statusCode: 404 });
            return ok({ payout_method: payoutMethod });
        } catch (error) {
            return fail(mapError(error, 'Failed to set default payout method'));
        }
    },
    remove: async ({ account, payoutMethodId }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const deleted = await repository.deletePayoutMethod(dgfyAccount.id, payoutMethodId);
            if (!deleted) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payout method not found.', { statusCode: 404 });
            return ok({ deleted: true, payout_method_id: parsePositiveInt(payoutMethodId) });
        } catch (error) {
            return fail(mapError(error, 'Failed to delete payout method'));
        }
    }
});

// --- Cashouts: affiliate self-service (request/list/cancel) ---

export const buildRequestAffiliateCashoutUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ account, body = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const tenant = ensureTenantId(body.tenant_id);

            const enrollment = await repository.findEnrollmentByAccountAndTenant(dgfyAccount.id, tenant);
            if (!enrollment) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'You are not enrolled as an affiliate for this store.', { statusCode: 404 });
            }

            const payoutMethods = await repository.listPayoutMethods(dgfyAccount.id);
            const requestedMethodId = body.payout_method_id !== undefined ? parsePositiveInt(body.payout_method_id) : null;
            const payoutMethod = requestedMethodId
                ? payoutMethods.find((method) => method.payout_method_id === requestedMethodId)
                : (payoutMethods.find((method) => method.is_default) || payoutMethods[0]);
            if (!payoutMethod) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Add a payout method before requesting a cashout.', { statusCode: 422 });
            }

            const settings = await repository.getSettings(tenant);
            const earnings = await repository.getEarningsSummary(dgfyAccount.id, tenant);
            const minCashoutCentavos = settings.min_cashout_centavos ?? 20000;
            if (earnings.available_centavos < minCashoutCentavos) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Your available balance must be at least ${minCashoutCentavos} centavos to request a cashout.`,
                    { statusCode: 422 }
                );
            }

            const cashout = await repository.requestCashout({
                enrollmentId: enrollment.enrollment_id,
                tenantId: tenant,
                dgfyAccountId: dgfyAccount.id,
                payoutMethodId: payoutMethod.payout_method_id,
                payoutSnapshot: payoutMethod
            });
            if (!cashout) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'No available balance to cash out right now.', { statusCode: 409 });
            }
            return ok({ cashout });
        } catch (error) {
            return fail(mapError(error, 'Failed to request a cashout'));
        }
    }
);

export const buildListMyAffiliateCashoutsUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ account, query = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const tenantId = String(query.tenant_id || '').trim() || null;
            return ok({ cashouts: await repository.listCashoutsForAccount(dgfyAccount.id, { tenantId }) });
        } catch (error) {
            return fail(mapError(error, 'Failed to list your cashout requests'));
        }
    }
);

export const buildCancelAffiliateCashoutUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ account, cashoutId }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const { cashout, reason } = await repository.cancelCashout(cashoutId, { dgfyAccountId: dgfyAccount.id });
            if (!cashout) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Cashout request not found.', { statusCode: 404 });
            if (reason === 'invalid_status') throw new DomainError(DomainErrorCode.CONFLICT, 'Only a pending cashout request can be cancelled.', { statusCode: 409 });
            return ok({ cashout });
        } catch (error) {
            return fail(mapError(error, 'Failed to cancel cashout request'));
        }
    }
);

// --- Cashouts: owner/admin (approve / mark-paid / reject queue) ---

export const buildListAffiliateCashoutsUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, query = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const status = String(query.status || '').trim() || null;
            return ok({ cashouts: await repository.listCashoutsForTenant(tenant, { status }) });
        } catch (error) {
            return fail(mapError(error, 'Failed to list cashout requests'));
        }
    }
);

export const buildApproveAffiliateCashoutUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, cashoutId, approvedByUserId = null }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const { cashout, reason } = await repository.approveCashout(cashoutId, { tenantId: tenant, approvedByUserId });
            if (!cashout) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Cashout request not found.', { statusCode: 404 });
            if (reason === 'invalid_status') throw new DomainError(DomainErrorCode.CONFLICT, 'Only a requested cashout can be approved.', { statusCode: 409 });
            return ok({ cashout });
        } catch (error) {
            return fail(mapError(error, 'Failed to approve cashout request'));
        }
    }
);

export const buildMarkAffiliateCashoutPaidUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, cashoutId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const externalPaymentRef = String(body.external_payment_ref || '').trim();
            if (!externalPaymentRef) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'external_payment_ref is required to mark a cashout as paid.', { statusCode: 422 });
            }
            const { cashout, reason } = await repository.markCashoutPaid(cashoutId, { tenantId: tenant, externalPaymentRef });
            if (!cashout) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Cashout request not found.', { statusCode: 404 });
            if (reason === 'invalid_status') throw new DomainError(DomainErrorCode.CONFLICT, 'Only an approved cashout can be marked as paid.', { statusCode: 409 });
            return ok({ cashout });
        } catch (error) {
            return fail(mapError(error, 'Failed to mark cashout as paid'));
        }
    }
);

export const buildRejectAffiliateCashoutUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, cashoutId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const rejectionReason = body.rejection_reason ? String(body.rejection_reason).trim().slice(0, 500) : null;
            const { cashout, reason } = await repository.rejectCashout(cashoutId, { tenantId: tenant, rejectionReason });
            if (!cashout) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Cashout request not found.', { statusCode: 404 });
            if (reason === 'invalid_status') throw new DomainError(DomainErrorCode.CONFLICT, 'Only a requested or approved cashout can be rejected.', { statusCode: 409 });
            return ok({ cashout });
        } catch (error) {
            return fail(mapError(error, 'Failed to reject cashout request'));
        }
    }
);

// Public, unauthenticated capture: resolves a store (by tenant_id directly, or by store_slug via
// the storefront discovery index) and an affiliate's public short code, records a `link` channel
// attribution audit row, and reports back what to cookie. Soft-fails (captured: false) rather than
// throwing on a bad/unknown code or store - this is an anonymous visitor endpoint with no
// authentication boundary, so it must never leak which codes/stores exist via error responses.
export const buildCaptureAffiliateAttributionUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId = null, storeSlug = null, shortCode, visitorFingerprint = null }) => {
        try {
            const code = String(shortCode || '').trim();
            if (!code) {
                return ok({ captured: false });
            }

            let resolvedTenantId = String(tenantId || '').trim() || null;
            if (!resolvedTenantId && storeSlug) {
                const tenant = await resolveTenantByStoreSlug(storeSlug);
                resolvedTenantId = tenant?.id ? String(tenant.id) : null;
            }
            if (!resolvedTenantId) {
                return ok({ captured: false });
            }

            const settings = await repository.getSettings(resolvedTenantId);
            if (!settings?.program_enabled) {
                return ok({ captured: false });
            }

            const enrollment = await repository.findActiveEnrollmentByShareCode(resolvedTenantId, code);
            if (!enrollment) {
                return ok({ captured: false });
            }

            await repository.recordAttribution({
                tenantId: resolvedTenantId,
                enrollmentId: enrollment.enrollment_id,
                channel: 'link',
                storeSlug: storeSlug ? String(storeSlug).trim().toLowerCase() : null,
                visitorFingerprint
            });

            return ok({
                captured: true,
                tenant_id: resolvedTenantId,
                enrollment_id: enrollment.enrollment_id
            });
        } catch (error) {
            return fail(mapError(error, 'Failed to capture affiliate attribution'));
        }
    }
);

export default {
    buildGetAffiliateSettingsUseCase,
    buildUpdateAffiliateSettingsUseCase,
    buildListAffiliatesUseCase,
    buildProvisionAffiliateUseCase,
    buildUpdateAffiliateEnrollmentUseCase,
    buildGetAffiliateQrPayloadUseCase,
    buildListMyAffiliateEnrollmentsUseCase,
    buildEnrollSelfServeAffiliateUseCase,
    buildGetAffiliateEarningsUseCase,
    buildManageAffiliatePayoutMethodsUseCases,
    buildRequestAffiliateCashoutUseCase,
    buildListMyAffiliateCashoutsUseCase,
    buildCancelAffiliateCashoutUseCase,
    buildListAffiliateCashoutsUseCase,
    buildApproveAffiliateCashoutUseCase,
    buildMarkAffiliateCashoutPaidUseCase,
    buildRejectAffiliateCashoutUseCase,
    buildCaptureAffiliateAttributionUseCase
};
