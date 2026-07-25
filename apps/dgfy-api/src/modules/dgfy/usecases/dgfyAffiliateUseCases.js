import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { dgfyAffiliateRepository } from '../repositories/dgfyAffiliateRepository.js';

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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const AFFILIATE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// The raw token only ever travels in the emailed magic link; never return token_hash to any caller.
const sanitizeInvite = (invite) => {
    if (!invite) return null;
    return {
        invite_id: invite.invite_id,
        tenant_id: invite.tenant_id,
        email: invite.email,
        status: invite.status,
        commission_rate_bps: invite.commission_rate_bps ?? null,
        expires_at: invite.expires_at,
        last_sent_at: invite.last_sent_at,
        accepted_at: invite.accepted_at,
        created_at: invite.created_at
    };
};

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
    // "/s/" is the short storefront-alias route (see storefrontRouting.js on the store
    // app) that resolves either the canonical or affiliate slug to a store.
    const path = `/s/${encodeURIComponent(String(slug).trim().toLowerCase())}?p=${encodeURIComponent(shortCode)}`;
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

// Invite an affiliate by email - works whether or not they already have a DGFY account. Existing
// accounts get a magic link to explicitly accept; brand-new invitees get a register link and are
// auto-enrolled on account creation (see mirrorPendingAffiliateInvitesForAccount). Email dispatch is
// best-effort: a mailer failure is reported in email_delivery but does not roll back the invite row,
// so the merchant can resend or share the link manually.
export const buildInviteAffiliateUseCase = ({
    repository = dgfyAffiliateRepository,
    hashInviteToken,
    sendAffiliateInviteEmail
} = {}) => (
    async ({ tenantId, body = {}, invitedBy = null }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const email = normalizeEmail(body.email);
            if (!email || !EMAIL_RE.test(email)) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid email address is required.', { statusCode: 422 });
            }
            const rateBps = parseOptionalRateBps(body.commission_rate_bps, { field: 'commission_rate_bps' });

            // If the email already maps to an account that is actively enrolled here, there's nothing
            // to invite. (A revoked enrollment can be re-invited.)
            const account = await repository.findAccountByEmail(email);
            if (account) {
                const existing = await repository.findEnrollmentByAccountAndTenant(account.id, tenant);
                if (existing && existing.status !== 'revoked') {
                    throw new DomainError(DomainErrorCode.CONFLICT, 'This email is already an affiliate for this store.', { statusCode: 409 });
                }
            }

            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = hashInviteToken(rawToken);
            const expiresAt = new Date(Date.now() + AFFILIATE_INVITE_TTL_MS);

            const existingInvite = await repository.findPendingInviteByTenantAndEmail(tenant, email);
            const invite = existingInvite
                ? await repository.refreshInvite(existingInvite.invite_id, { tokenHash, commissionRateBps: rateBps ?? null, expiresAt })
                : await repository.createInvite({ tenantId: tenant, email, tokenHash, commissionRateBps: rateBps ?? null, invitedBy, expiresAt });

            // Reload through the token-hash finder to pick up the tenant name for the email/link.
            const stored = await repository.findInviteByTokenHash(tokenHash);
            const businessName = stored?.tenant?.name || 'the store';
            const accountExists = Boolean(account);

            let emailDelivery = { sent: false };
            try {
                await sendAffiliateInviteEmail({ email, businessName, invitationToken: rawToken, accountExists });
                emailDelivery = { sent: true };
            } catch (deliveryError) {
                emailDelivery = { sent: false, error: deliveryError?.message || 'email_delivery_failed' };
            }

            return ok({
                invite: sanitizeInvite(invite),
                account_exists: accountExists,
                email_delivery: emailDelivery
            });
        } catch (error) {
            return fail(mapError(error, 'Failed to send affiliate invite'));
        }
    }
);

export const buildListAffiliateInvitesUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, status = null }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const invites = await repository.listInvitesByTenant(tenant, { status: status || null });
            return ok({ invites: invites.map(sanitizeInvite) });
        } catch (error) {
            return fail(mapError(error, 'Failed to list affiliate invites'));
        }
    }
);

export const buildCancelAffiliateInviteUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, inviteId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const invite = await repository.findInviteByIdForTenant(tenant, inviteId);
            if (!invite) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate invite not found.', { statusCode: 404 });
            }
            if (invite.status !== 'pending') {
                throw new DomainError(DomainErrorCode.CONFLICT, `This invite is already ${invite.status} and cannot be cancelled.`, { statusCode: 409 });
            }
            const cancelled = await repository.markInviteCancelled(invite.invite_id);
            return ok({ invite: sanitizeInvite(cancelled) });
        } catch (error) {
            return fail(mapError(error, 'Failed to cancel affiliate invite'));
        }
    }
);

// Public preview for the storefront accept/register page (no side effects, no auth): tells the page
// the inviting business, the locked email, and whether the invitee already has an account.
export const buildGetAffiliateInvitePreviewUseCase = ({ repository = dgfyAffiliateRepository, hashInviteToken } = {}) => (
    async ({ token }) => {
        try {
            const rawToken = String(token || '').trim();
            if (!rawToken) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'token is required.', { statusCode: 422 });
            }
            const invite = await repository.findInviteByTokenHash(hashInviteToken(rawToken));
            if (!invite) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'This invitation is invalid or has been removed.', { statusCode: 404 });
            }
            const expired = new Date(invite.expires_at).getTime() < Date.now();
            const account = await repository.findAccountByEmail(invite.email);
            return ok({
                business_name: invite?.tenant?.name || null,
                email: invite.email,
                status: invite.status,
                account_exists: Boolean(account),
                expired,
                valid: invite.status === 'pending' && !expired
            });
        } catch (error) {
            return fail(mapError(error, 'Failed to load invitation'));
        }
    }
);

// Explicit accept path for invitees who already have a DGFY account (authenticateDgfyAccount).
export const buildAcceptAffiliateInviteUseCase = ({ repository = dgfyAffiliateRepository, hashInviteToken } = {}) => (
    async ({ account, token }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const rawToken = String(token || '').trim();
            if (!rawToken) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'token is required.', { statusCode: 422 });
            }
            const invite = await repository.findInviteByTokenHash(hashInviteToken(rawToken));
            if (!invite) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'This invitation is invalid or has been removed.', { statusCode: 404 });
            }

            // Security: the accepting account's email must match the invited email exactly. This is
            // what stops a logged-in account from claiming an invite addressed to someone else.
            if (normalizeEmail(invite.email) !== normalizeEmail(dgfyAccount.email)) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'This invitation was sent to a different email address.', { statusCode: 403 });
            }

            if (invite.status === 'accepted') {
                // Idempotent: re-materialize (a no-op if the enrollment already exists) and return ok.
                const { enrollment } = await repository.materializeInviteEnrollment(invite, dgfyAccount);
                return ok({ enrollment, created: false });
            }
            if (invite.status !== 'pending') {
                throw new DomainError(DomainErrorCode.CONFLICT, `This invitation is ${invite.status} and can no longer be accepted.`, { statusCode: 409 });
            }
            if (new Date(invite.expires_at).getTime() < Date.now()) {
                await repository.markInviteExpired(invite.invite_id);
                throw new DomainError(DomainErrorCode.CONFLICT, 'This invitation has expired.', { statusCode: 410 });
            }

            const { enrollment, created } = await repository.materializeInviteEnrollment(invite, dgfyAccount);
            return ok({ enrollment, created });
        } catch (error) {
            return fail(mapError(error, 'Failed to accept affiliate invite'));
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
            const slug = await repository.getStorefrontAffiliateSlug(tenant);
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
            const enrollments = await repository.listEnrollmentsForAccount(dgfyAccount.id);
            // Enrich with the storefront share link so the customer dashboard can render a
            // "share this to earn" QR/link without a second round trip per enrollment.
            const enrichedEnrollments = await Promise.all(enrollments.map(async (enrollment) => {
                const slug = await repository.getStorefrontAffiliateSlug(enrollment.tenant_id);
                const { path, url } = buildAffiliateShareUrl({ slug, shortCode: enrollment.short_code });
                return { ...enrollment, store_slug: slug, share_path: path, share_url: url };
            }));
            return ok({ enrollments: enrichedEnrollments });
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
                resolvedTenantId = await repository.resolveTenantIdByStoreSlug(storeSlug);
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
