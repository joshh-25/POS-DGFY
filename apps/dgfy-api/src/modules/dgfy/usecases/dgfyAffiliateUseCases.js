import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { dgfyAffiliateRepository } from '../repositories/dgfyAffiliateRepository.js';
import {
    AFFILIATE_SELLING_PRICE_RULE_TYPES,
    AFFILIATE_COMMISSION_RULE_TYPES,
    AFFILIATE_SETTLEMENT_POLICIES,
    validateAffiliatePriceRule
} from '../../shared/utils/affiliatePricingPolicy.js';
// #449 (Phase 208) - resolveEarningsCap is the same pair-resolution ladder the accrual util uses,
// reused here so the read surface (buildListAffiliatesUseCase) reports exactly what accrual sees.
import { resolveEarningsCap } from '../utils/affiliateCommissionAccrual.js';

const MAX_RATE_BPS = 10000; // 100.00%
const MIN_ATTRIBUTION_WINDOW_DAYS = 1;
const MAX_ATTRIBUTION_WINDOW_DAYS = 365;
const ENROLLMENT_STATUS_VALUES = new Set(['active', 'suspended', 'revoked']);
// #450 (Phase 199) - statuses that record a revocation-audit stamp when actually transitioned
// into (see buildUpdateAffiliateEnrollmentUseCase, D2).
const REVOCATION_STAMP_STATUSES = new Set(['revoked', 'suspended']);
// #1191 (Phase 207) - the only statuses a reactivation may transition OUT of. 'pending' is a real
// reachable enum value on DgfyAffiliateEnrollment (the model's own default) but has never been
// activated, so promoting it is an activation, not a reactivation - out of scope for this endpoint.
const REACTIVATABLE_STATUSES = new Set(['suspended', 'revoked']);
const PAYOUT_METHOD_TYPES = new Set(['bank', 'gcash', 'maya']);
const COMMISSION_TYPE_VALUES = new Set(AFFILIATE_COMMISSION_RULE_TYPES);
const SETTLEMENT_POLICY_VALUES = new Set(AFFILIATE_SETTLEMENT_POLICIES);
const PRICE_RULE_TYPE_VALUES = new Set(AFFILIATE_SELLING_PRICE_RULE_TYPES);
// Sentinel meaning "applies to all" for enrollment_id/item_id - see
// backend/migrations/20260729000003-add-affiliate-price-rules.cjs.
const PRICE_RULE_SCOPE_ALL = 0;

// #448 (Phase 209) - a SEPARATE named constant from PRICE_RULE_SCOPE_ALL (see
// dgfyAffiliateRepository.js's own comment on this) so the two tables' sentinels can diverge later
// without a silent coupling.
const CATEGORY_RATE_SCOPE_ALL = 0;

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

// #449 (Phase 208) - shared parsing for the two cap fields, used by both the tenant-settings and
// per-enrollment update use cases. `undefined` leaves the field untouched (PATCH semantics);
// `null`/`''` clears it. parseOptionalPositiveInt has no `null` branch of its own, so the explicit
// clear must be handled before delegating to it.
const parseCapCentavosField = (value, field) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return parseOptionalPositiveInt(value, { field, min: 0 });
};

const parseCapActiveUntilField = (value, field = 'earnings_cap_active_until') => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${field} must be a valid ISO 8601 date-time.`, { statusCode: 422 });
    }
    return parsed;
};

// #449 (Phase 208), §2.3 - an end date with nothing to attach to is a no-op that looks like it
// worked. `resultingCap`/`resultingActiveUntil` are the MERGED (current row + this update's
// changes) values, never the update payload alone - a PATCH that only touches the date must still
// be checked against whatever cap is already on the row.
const assertCapDateHasCap = (resultingCap, resultingActiveUntil) => {
    if (resultingActiveUntil !== null && resultingActiveUntil !== undefined && (resultingCap === null || resultingCap === undefined)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'earnings_cap_active_until cannot be set without max_lifetime_earnings_centavos.',
            { statusCode: 422, details: { reason_code: 'EARNINGS_CAP_DATE_WITHOUT_CAP' } }
        );
    }
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

// Exported (not just internal) so affiliateShareCodeResolve.unit.test.js can pin the emitted
// /s/{short_code} shape directly, the same way this module already exports hashAffiliateShareCode
// for its own unit coverage.
export const buildAffiliateShareUrl = ({ shortCode }) => {
    const origin = String(process.env.STOREFRONT_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
    const code = String(shortCode || '').trim().toUpperCase();
    if (!code) return { path: null, url: null };
    // #452 (Phase 212): the short code IS the path segment now -- "/s/{short_code}" resolves to
    // the affiliate+store pair server-side via GET /affiliate/s/:short_code. The store slug is no
    // longer carried in the share URL (it was never load-bearing for resolution), and "?p=" is
    // retired entirely, both from emission and from the storefront's read path (#452 E1 decision,
    // 2026-08-30: no back-compat shim -- ?p= links are not meaningfully in circulation yet).
    const path = `/s/${encodeURIComponent(code)}`;
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

            // #449 (Phase 208) - tenant-wide default lifetime earnings cap.
            if (body.max_lifetime_earnings_centavos !== undefined) {
                updates.max_lifetime_earnings_centavos = parseCapCentavosField(body.max_lifetime_earnings_centavos, 'max_lifetime_earnings_centavos');
            }
            if (body.earnings_cap_active_until !== undefined) {
                updates.earnings_cap_active_until = parseCapActiveUntilField(body.earnings_cap_active_until);
            }

            // Phase 1 affiliate pricing rule engine (see
            // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).
            if (body.commission_type !== undefined) {
                const commissionType = String(body.commission_type || '').trim();
                if (!COMMISSION_TYPE_VALUES.has(commissionType)) {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `commission_type must be one of: ${[...COMMISSION_TYPE_VALUES].join(', ')}.`, { statusCode: 422 });
                }
                updates.commission_type = commissionType;
            }
            if (body.settlement_policy !== undefined) {
                if (body.settlement_policy === null || body.settlement_policy === '') {
                    updates.settlement_policy = null;
                } else {
                    const settlementPolicy = String(body.settlement_policy || '').trim();
                    if (!SETTLEMENT_POLICY_VALUES.has(settlementPolicy)) {
                        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `settlement_policy must be one of: ${[...SETTLEMENT_POLICY_VALUES].join(', ')}.`, { statusCode: 422 });
                    }
                    updates.settlement_policy = settlementPolicy;
                }
            }
            if (body.commission_base_mode !== undefined) {
                const commissionBaseMode = String(body.commission_base_mode || '').trim();
                if (commissionBaseMode !== 'discounted_subtotal' && commissionBaseMode !== 'base_price_subtotal') {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'commission_base_mode must be one of: discounted_subtotal, base_price_subtotal.', { statusCode: 422 });
                }
                updates.commission_base_mode = commissionBaseMode;
            }

            // #448 (Phase 209) - gates the per-category commission rate lookup entirely. A merchant
            // may configure category rate rows first and flip this after (validation on the rows
            // themselves does not require it) - that is the natural order.
            if (body.category_rates_enabled !== undefined) updates.category_rates_enabled = body.category_rates_enabled === true;

            // #449 (Phase 208), §2.3 - only fetch/check when this PATCH actually touches either
            // cap field; every other settings PATCH pays no extra read.
            if (updates.max_lifetime_earnings_centavos !== undefined || updates.earnings_cap_active_until !== undefined) {
                const current = await repository.getSettings(tenant);
                const resultingCap = updates.max_lifetime_earnings_centavos !== undefined
                    ? updates.max_lifetime_earnings_centavos
                    : (current?.max_lifetime_earnings_centavos ?? null);
                const resultingActiveUntil = updates.earnings_cap_active_until !== undefined
                    ? updates.earnings_cap_active_until
                    : (current?.earnings_cap_active_until ?? null);
                assertCapDateHasCap(resultingCap, resultingActiveUntil);
            }

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
            const [enrollments, slotsMax, slotsUsed, settings] = await Promise.all([
                repository.listEnrollmentsForTenant(tenant),
                repository.getMaxAffiliateSlots(tenant),
                repository.countConsumedSlots(tenant),
                // #449 (Phase 208) - fetched once here, not per row, and passed into
                // resolveEarningsCap per enrollment below.
                repository.getSettings(tenant)
            ]);
            const withEarnings = await Promise.all(enrollments.map(async (enrollment) => {
                // #449 (Phase 208), §6 - read-only cap surface, mirroring Phase 198's
                // slots_used/slots_max: raising the cap is never a field this response writes.
                const cap = resolveEarningsCap(enrollment, settings);
                const lifetimeEarnedCentavos = cap
                    ? await repository.sumLifetimeCommissionCentavos(tenant, enrollment.enrollment_id)
                    : null;
                const earningsCap = {
                    cap_centavos: cap ? cap.capCentavos : null,
                    cap_source: cap ? cap.source : null,
                    active_until: cap ? cap.activeUntil : null,
                    expired: cap ? cap.expired : false,
                    lifetime_earned_centavos: lifetimeEarnedCentavos,
                    remaining_before_cap: (cap && !cap.expired)
                        ? Math.max(0, cap.capCentavos - lifetimeEarnedCentavos)
                        : null
                };
                return {
                    ...enrollment,
                    earnings: await repository.getEarningsSummary(enrollment.dgfy_account_id, tenant),
                    earnings_cap: earningsCap
                };
            }));
            // Read-only (#1177, #447 D5) - raising the cap is a manual/out-of-band admin action,
            // never a field this response accepts a write for.
            return ok({ affiliates: withEarnings, slots_used: slotsUsed, slots_max: slotsMax });
        } catch (error) {
            return fail(mapError(error, 'Failed to list affiliates'));
        }
    }
);

export const buildProvisionAffiliateUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, body = {}, actorUserId = null, actorUsername = null }) => {
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
                activatedAt: new Date(),
                actorUserId,
                actorUsername
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
    async ({ tenantId, enrollmentId, body = {}, revokedBy = null, revokedByUsername = null }) => {
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
                // #1191 (Phase 207) - the generic PATCH loses the `suspended|revoked -> active`
                // transition entirely (Pat's call, 2026-08-30). Reactivation is the only status
                // change that CONSUMES a slot, and #1177/Phase 198's cap enforcement needs a
                // lock-first transaction this bare-update path does not have. One enforcement
                // path, no drift risk between two.
                if (status === 'active') {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        "status: 'active' is no longer accepted here. Use POST /api/v1/affiliates/affiliates/:enrollment_id/reactivate to reactivate a suspended or revoked affiliate.",
                        { statusCode: 422, details: { reason_code: 'AFFILIATE_REACTIVATION_MOVED', endpoint: 'POST /api/v1/affiliates/affiliates/:enrollment_id/reactivate' } }
                    );
                }
                updates.status = status;
            }
            if (body.commission_type !== undefined) {
                if (body.commission_type === null || body.commission_type === '') {
                    updates.commission_type = null; // inherit the tenant's commission_type
                } else {
                    const commissionType = String(body.commission_type || '').trim();
                    if (!COMMISSION_TYPE_VALUES.has(commissionType)) {
                        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `commission_type must be one of: ${[...COMMISSION_TYPE_VALUES].join(', ')}.`, { statusCode: 422 });
                    }
                    updates.commission_type = commissionType;
                }
            }
            // #449 (Phase 208) - per-enrollment cap override. NULL means "inherit the tenant
            // default", not "clear" - there is no separate clear semantic here (§2.4).
            if (body.max_lifetime_earnings_centavos !== undefined) {
                updates.max_lifetime_earnings_centavos = parseCapCentavosField(body.max_lifetime_earnings_centavos, 'max_lifetime_earnings_centavos');
            }
            if (body.earnings_cap_active_until !== undefined) {
                updates.earnings_cap_active_until = parseCapActiveUntilField(body.earnings_cap_active_until);
            }
            // #450 (Phase 199) - parsed into a local, not into `updates` directly, so a
            // reason-only body still hits the emptiness guard below (D8).
            const revocationReason = body.revocation_reason ? String(body.revocation_reason).trim().slice(0, 500) : null;

            if (Object.keys(updates).length === 0) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'No updatable fields were provided.', { statusCode: 422 });
            }

            // #449 (Phase 208), §2.3 - fetched once, reused by both the revocation-stamp branch
            // below and the cap-date guard, rather than issuing a second read for the same row.
            let previous = null;
            const needsPreviousForCapCheck = updates.max_lifetime_earnings_centavos !== undefined
                || updates.earnings_cap_active_until !== undefined;
            if ((updates.status !== undefined && REVOCATION_STAMP_STATUSES.has(updates.status)) || needsPreviousForCapCheck) {
                previous = await repository.findEnrollmentById(tenant, enrollmentId);
                if (!previous) {
                    throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
                }
            }

            if (needsPreviousForCapCheck) {
                const resultingCap = updates.max_lifetime_earnings_centavos !== undefined
                    ? updates.max_lifetime_earnings_centavos
                    : (previous.max_lifetime_earnings_centavos ?? null);
                const resultingActiveUntil = updates.earnings_cap_active_until !== undefined
                    ? updates.earnings_cap_active_until
                    : (previous.earnings_cap_active_until ?? null);
                assertCapDateHasCap(resultingCap, resultingActiveUntil);
            }

            // #450 (Phase 199, D1/D2) - only fires when the PATCH is actually moving `status`
            // into 'revoked'/'suspended' from a different prior status; an idempotent re-PATCH
            // of the same status does not re-stamp (preserves the original revoked_at).
            let stamped = false;
            if (updates.status !== undefined && REVOCATION_STAMP_STATUSES.has(updates.status)) {
                if (previous.status !== updates.status) {
                    updates.revoked_at = new Date();
                    updates.revoked_by = revokedBy ?? null;
                    updates.revocation_reason = revocationReason; // D6 - always all three together
                    stamped = true;
                }
            }

            // #450 (Phase 199, D7) - reject rather than silently drop a reason that can't attach
            // to a stamp (status: 'active', no status at all, or an idempotent re-PATCH).
            if (body.revocation_reason !== undefined && !stamped) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "revocation_reason is only accepted on a transition into 'revoked' or 'suspended'.", { statusCode: 422 });
            }

            // #1202 (Phase 214) - actorUsername threaded to the repository so the status-events
            // row it may write carries a renderable name (F4), independent of whether this PATCH
            // actually triggers a stamp (the repository itself decides whether to write an event).
            const enrollment = await repository.updateEnrollment(tenant, enrollmentId, updates, {
                actorUserId: revokedBy,
                actorUsername: revokedByUsername
            });
            if (!enrollment) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
            }
            return ok({ enrollment });
        } catch (error) {
            return fail(mapError(error, 'Failed to update affiliate enrollment'));
        }
    }
);

// #1191 (Phase 207) - the ONLY path that may perform a `suspended|revoked -> active` transition.
// The generic PATCH (buildUpdateAffiliateEnrollmentUseCase above) explicitly rejects
// `status: 'active'` so there is exactly one enforcement path and no drift risk between two.
//
// Why this needs its own endpoint at all: reactivation is the only enrollment status change that
// CONSUMES a slot (countConsumedSlots counts `active` enrollments only), so it is the only one that
// needs the #1177/Phase 198 cap check. Demotions to `suspended`/`revoked` only ever FREE a slot and
// stay on the generic PATCH, unchanged.
export const buildReactivateAffiliateEnrollmentUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, enrollmentId, reactivatedBy = null, reactivatedByUsername = null }) => {
        try {
            const tenant = ensureTenantId(tenantId);

            const existing = await repository.findEnrollmentById(tenant, enrollmentId);
            if (!existing) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
            }
            if (existing.status === 'active') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This affiliate is already active.',
                    { statusCode: 409, details: { reason_code: 'AFFILIATE_ALREADY_ACTIVE', status: existing.status } }
                );
            }
            if (!REACTIVATABLE_STATUSES.has(existing.status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    `Only a suspended or revoked affiliate can be reactivated (this one is ${existing.status}).`,
                    { statusCode: 409, details: { reason_code: 'AFFILIATE_NOT_REACTIVATABLE', status: existing.status } }
                );
            }

            // #450 Phase 199, restated here so it doesn't read as an oversight: reactivation does
            // NOT clear revoked_at/revoked_by/revocation_reason. They are an audit trail of the most
            // recent revocation, not a live-status mirror - `status` is the sole authority on
            // whether this affiliate is currently active. It also does NOT touch `activated_at`,
            // which is the ORIGINAL enrollment date and is rendered to the affiliate as
            // "Enrolled <date>" (dgfy-storefront customer-dashboard AffiliateSection.jsx).
            //
            // #1202 (Phase 214) - `reactivatedBy` finally gets used. Phase 207 threaded it through
            // the controller and use case and deliberately left it unpersisted (there was no
            // `reactivated_by` column and adding one is explicitly rejected - see PHASE_214_PLAN.md
            // §3, "Do not add reactivated_at/reactivated_by columns"). Phase 214 is that follow-up:
            // it is now passed to the repository, which records it on the new status-events row
            // instead of a dedicated column.
            const enrollment = await repository.reactivateEnrollment(tenant, enrollmentId, {
                actorUserId: reactivatedBy,
                actorUsername: reactivatedByUsername
            });
            if (!enrollment) {
                // Deleted between the read above and the transactional re-read inside the
                // repository - vanishingly rare, but do not return a null enrollment as success.
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
            }
            return ok({ enrollment });
        } catch (error) {
            return fail(mapError(error, 'Failed to reactivate affiliate enrollment'));
        }
    }
);

// #1202 (Phase 214, J7) - dedicated read endpoint, mirroring Phase 213's own
// GET /:id/affiliate-slots/audit-logs sibling rather than inlining an unbounded history array into
// GET /affiliates. No affiliate-facing surface (J2) - merchant-only visibility, see
// PHASE_214_PLAN.md §4.5.
export const buildListAffiliateEnrollmentStatusEventsUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, enrollmentId, limit = 25 }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            // findEnrollmentById first - the tenant-isolation boundary. Do NOT query events by
            // enrollment_id alone; a 404 here is what stops one tenant reading another's history
            // (test #12, PHASE_214_PLAN.md §6).
            const enrollment = await repository.findEnrollmentById(tenant, enrollmentId);
            if (!enrollment) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
            }
            const statusEvents = await repository.listStatusEventsForEnrollment(tenant, enrollmentId, { limit });
            return ok({
                status_events: statusEvents.map((event) => ({
                    status_event_id: event.status_event_id,
                    enrollment_id: event.enrollment_id,
                    from_status: event.from_status,
                    to_status: event.to_status,
                    event_type: event.event_type,
                    actor_type: event.actor_type,
                    actor_user_id: event.actor_user_id,
                    actor_username: event.actor_username,
                    actor_dgfy_account_id: event.actor_dgfy_account_id,
                    reason: event.reason,
                    source: event.source,
                    created_at: event.created_at
                })),
                enrollment_id: Number(enrollmentId)
            });
        } catch (error) {
            return fail(mapError(error, 'Failed to load affiliate enrollment status events'));
        }
    }
);

// --- Affiliate price rules (Phase 1 affiliate pricing rule engine - selling-price rule only; see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md). Phase 1 only ever writes/reads
// item_id = PRICE_RULE_SCOPE_ALL (0) - the item_id parameter exists so the API contract doesn't need
// to change when Phase 2 activates per-product rules. ---

const RATE_BASED_RULE_TYPES = new Set(['PERCENTAGE_MARKUP', 'PERCENTAGE_DISCOUNT']);
const AMOUNT_BASED_RULE_TYPES = new Set(['FIXED_MARKUP', 'FIXED_DISCOUNT', 'EXACT_AFFILIATE_PRICE']);

const parsePriceRuleBody = (body = {}) => {
    const ruleType = String(body.rule_type || '').trim();
    if (!PRICE_RULE_TYPE_VALUES.has(ruleType)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `rule_type must be one of: ${[...PRICE_RULE_TYPE_VALUES].join(', ')}.`, { statusCode: 422 });
    }

    let rateBps = null;
    let amountCentavos = null;
    if (RATE_BASED_RULE_TYPES.has(ruleType)) {
        rateBps = parseRequiredRateBps(body.rate_bps, { field: 'rate_bps' });
    } else if (AMOUNT_BASED_RULE_TYPES.has(ruleType)) {
        amountCentavos = parseOptionalPositiveInt(body.amount_centavos, { field: 'amount_centavos', min: 0 });
        if (amountCentavos === undefined || amountCentavos === null) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'amount_centavos is required for this rule_type.', { statusCode: 422 });
        }
    }
    // BASE_PRICE needs neither - rateBps and amountCentavos both stay null.

    const rule = { type: ruleType, rateBps, amountCentavos };
    const validation = validateAffiliatePriceRule({ rule, basePriceCentavos: body.sample_base_price_centavos ?? null });
    if (!validation.valid) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Invalid price rule: ${validation.error_code}.`, {
            statusCode: 422,
            details: { reason_code: validation.error_code }
        });
    }

    return { ruleType, rateBps, amountCentavos };
};

export const buildListAffiliatePriceRulesUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const priceRules = await repository.listPriceRulesForTenant(tenant);
            return ok({ price_rules: priceRules });
        } catch (error) {
            return fail(mapError(error, 'Failed to list affiliate price rules'));
        }
    }
);

// Creates or updates the single price rule at a given scope (tenant template when enrollmentId is
// omitted/0, or a specific affiliate's override). No below-cost floor check here (decision A9) -
// a Phase 1 rule applies to every product a tenant sells, which may have widely varying costs, so
// there is no single representative cost to validate against at save time. The floor is instead
// enforced per-item at the point the rule is actually resolved against a real product (checkout and
// catalog display), where the item's own cost_per_unit is known.
export const buildUpsertAffiliatePriceRuleUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const enrollmentId = parseOptionalPositiveInt(body.enrollment_id, { field: 'enrollment_id', min: 0 }) ?? PRICE_RULE_SCOPE_ALL;
            const itemId = parseOptionalPositiveInt(body.item_id, { field: 'item_id', min: 0 }) ?? PRICE_RULE_SCOPE_ALL;
            const active = body.active !== undefined ? body.active === true : true;

            if (enrollmentId !== PRICE_RULE_SCOPE_ALL) {
                const enrollment = await repository.findEnrollmentById(tenant, enrollmentId);
                if (!enrollment) {
                    throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
                }
            }

            const { ruleType, rateBps, amountCentavos } = parsePriceRuleBody(body);

            const priceRule = await repository.upsertPriceRule({
                tenantId: tenant,
                enrollmentId,
                itemId,
                ruleType,
                rateBps,
                amountCentavos,
                active
            });
            return ok({ price_rule: priceRule });
        } catch (error) {
            return fail(mapError(error, 'Failed to save affiliate price rule'));
        }
    }
);

export const buildDeactivateAffiliatePriceRuleUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, priceRuleId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const priceRule = await repository.deactivatePriceRule(tenant, priceRuleId);
            if (!priceRule) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate price rule not found.', { statusCode: 404 });
            }
            return ok({ price_rule: priceRule });
        } catch (error) {
            return fail(mapError(error, 'Failed to deactivate affiliate price rule'));
        }
    }
);

// --- Affiliate category rates (#448, Phase 209) - the category tier of the commission rate
// ladder. Mirrors the price-rule endpoints above one-for-one; see affiliateCommissionAccrual.js
// for how these rows are actually resolved at accrual time. ---

export const buildListAffiliateCategoryRatesUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const categoryRates = await repository.listCategoryRatesForTenant(tenant);
            return ok({ category_rates: categoryRates });
        } catch (error) {
            return fail(mapError(error, 'Failed to list affiliate category rates'));
        }
    }
);

// Creates or updates the single category rate at a given scope (tenant template when
// enrollment_id is omitted/0, or a specific affiliate's override). See A6 below for the
// shadowed-by-override guard, and A4 for why folder_id = 0 is rejected rather than treated as an
// "all categories" sentinel.
export const buildUpsertAffiliateCategoryRateUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const enrollmentId = parseOptionalPositiveInt(body.enrollment_id, { field: 'enrollment_id', min: 0 }) ?? CATEGORY_RATE_SCOPE_ALL;

            // A4: folder_id is required and must be a real item_folders.folder_id - there is no
            // "all categories" sentinel (that concept already exists as default_rate_bps).
            const folderId = parseOptionalPositiveInt(body.folder_id, { field: 'folder_id', min: 1 });
            if (folderId === undefined || folderId === null) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    "folder_id must be a real item_folders.folder_id; there is no 'all categories' sentinel — set default_rate_bps instead.",
                    { statusCode: 422, details: { reason_code: 'AFFILIATE_CATEGORY_RATE_FOLDER_ID_REQUIRED' } }
                );
            }

            const rateBps = parseRequiredRateBps(body.rate_bps, { field: 'rate_bps' });
            const active = body.active !== undefined ? body.active === true : true;

            if (enrollmentId !== CATEGORY_RATE_SCOPE_ALL) {
                const enrollment = await repository.findEnrollmentById(tenant, enrollmentId);
                if (!enrollment) {
                    throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate enrollment not found.', { statusCode: 404 });
                }
                // A6: an enrollment-scoped category rate on an affiliate who ALSO has
                // commission_rate_bps set is dead config - the enrollment override wins outright
                // and this row would never fire. Reject rather than let a merchant configure
                // something that silently never applies (fail-closed, matching this repo's
                // existing habit - see ADR 0066's [binding] fail-closed clause).
                if (Number.isInteger(enrollment.commission_rate_bps)) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'This affiliate has a commission_rate_bps override set, which always wins over a category rate. Clear this affiliate\'s commission_rate_bps first.',
                        { statusCode: 422, details: { reason_code: 'AFFILIATE_CATEGORY_RATE_SHADOWED_BY_OVERRIDE' } }
                    );
                }
            }

            const categoryRate = await repository.upsertCategoryRate({
                tenantId: tenant,
                enrollmentId,
                folderId,
                rateBps,
                active
            });
            return ok({ category_rate: categoryRate });
        } catch (error) {
            return fail(mapError(error, 'Failed to save affiliate category rate'));
        }
    }
);

export const buildDeactivateAffiliateCategoryRateUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ tenantId, categoryRateId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const categoryRate = await repository.deactivateCategoryRate(tenant, categoryRateId);
            if (!categoryRate) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Affiliate category rate not found.', { statusCode: 404 });
            }
            return ok({ category_rate: categoryRate });
        } catch (error) {
            return fail(mapError(error, 'Failed to deactivate affiliate category rate'));
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
            const { path, url } = buildAffiliateShareUrl({ shortCode: enrollment.short_code });
            return ok({
                short_code: enrollment.short_code,
                // #452 (Phase 212): "param: 'p'" is retired -- the short code is now the path
                // segment itself, not a query param. Replaced with share_kind so a consumer can
                // still tell what shape the link is without re-parsing the URL. Verified by grep
                // (AffiliatesWorkspacePanel.jsx) that no current consumer reads the old "param" key.
                share_kind: 'path',
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
                const { path, url } = buildAffiliateShareUrl({ shortCode: enrollment.short_code });
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
            if (enrollment.status !== 'active') {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Your affiliate enrollment is not active, so you cannot request a cashout.', { statusCode: 409 });
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
            if (reason === 'enrollment_inactive') throw new DomainError(DomainErrorCode.CONFLICT, 'This affiliate\'s enrollment is not active, so their cashout cannot be approved.', { statusCode: 409 });
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
            if (reason === 'enrollment_inactive') throw new DomainError(DomainErrorCode.CONFLICT, 'This affiliate\'s enrollment is not active, so their cashout cannot be marked as paid.', { statusCode: 409 });
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

// Public, unauthenticated resolver for /s/{short_code} share links (#452, Phase 212). Given a
// short code with no tenant/slug context (the whole point of the new URL shape -- the store slug
// is no longer carried in the link), returns the store slug the storefront should boot, and
// nothing else. Every miss returns the SAME shape (resolved: false), never a 4xx -- this endpoint
// is a page-load dependency for an anonymous visitor and must not be usable to distinguish "code
// doesn't exist" from "code exists but store/program is unavailable" via status code alone (ADR
// 0036 Decision 7's anti-enumeration posture, qualified per the ADR amendment landed alongside
// this use case -- see the dated Amendments block).
export const buildResolveAffiliateShareCodeUseCase = ({ repository = dgfyAffiliateRepository } = {}) => (
    async ({ shortCode }) => {
        try {
            const code = String(shortCode || '').trim();
            if (!code) {
                return ok({ resolved: false });
            }

            const enrollment = await repository.findActiveEnrollmentByShortCode(code);
            if (!enrollment) {
                return ok({ resolved: false });
            }

            const settings = await repository.getSettings(enrollment.tenant_id);
            if (!settings?.program_enabled) {
                return ok({ resolved: false });
            }

            const slug = await repository.getStorefrontAffiliateSlug(enrollment.tenant_id);
            if (!slug) {
                return ok({ resolved: false });
            }

            return ok({ resolved: true, store_slug: slug, short_code: enrollment.short_code });
        } catch (error) {
            return fail(mapError(error, 'Failed to resolve affiliate share code'));
        }
    }
);

export default {
    buildGetAffiliateSettingsUseCase,
    buildUpdateAffiliateSettingsUseCase,
    buildListAffiliatesUseCase,
    buildProvisionAffiliateUseCase,
    buildUpdateAffiliateEnrollmentUseCase,
    buildReactivateAffiliateEnrollmentUseCase,
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
    buildCaptureAffiliateAttributionUseCase,
    buildResolveAffiliateShareCodeUseCase
};
