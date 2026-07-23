import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { dgfyAffiliateRepository } from '../repositories/dgfyAffiliateRepository.js';

const MAX_RATE_BPS = 10000; // 100.00%
const MIN_ATTRIBUTION_WINDOW_DAYS = 1;
const MAX_ATTRIBUTION_WINDOW_DAYS = 365;
const ENROLLMENT_STATUS_VALUES = new Set(['active', 'suspended', 'revoked']);

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

export default {
    buildGetAffiliateSettingsUseCase,
    buildUpdateAffiliateSettingsUseCase,
    buildListAffiliatesUseCase,
    buildProvisionAffiliateUseCase,
    buildUpdateAffiliateEnrollmentUseCase,
    buildGetAffiliateQrPayloadUseCase,
    buildListMyAffiliateEnrollmentsUseCase,
    buildEnrollSelfServeAffiliateUseCase,
    buildGetAffiliateEarningsUseCase
};
