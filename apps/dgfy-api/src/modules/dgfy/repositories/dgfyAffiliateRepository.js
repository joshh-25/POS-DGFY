import crypto from 'crypto';
import { Op } from 'sequelize';
import {
    DgfyAccount,
    DgfyAffiliateAttribution,
    DgfyAffiliateEnrollment,
    DgfyAffiliateCommission,
    DgfyAffiliatePayoutMethod,
    DgfyAffiliateCashout,
    DgfyAffiliateInvite,
    DgfyAffiliatePriceRule,
    StorefrontDiscoveryIndex,
    Tenant,
    TenantAffiliateSettings
} from '../../../models/index.js';
import { resolveTenantByStoreSlug } from '../../../services/storefrontTenantResolver.js';
import {
    resolvePriceRuleFromCandidates,
    hasDuplicatePriceRuleScope
} from '../utils/affiliatePriceRuleResolution.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

// Sentinel meaning "applies to all" for enrollment_id/item_id - see
// backend/migrations/20260729000003-add-affiliate-price-rules.cjs.
const PRICE_RULE_SCOPE_ALL = 0;

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

// Crockford-like alphabet (no 0/O/1/I) so a cashier or affiliate reading the code aloud/typing it
// can't confuse similar-looking characters.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateCodeSuffix = (length = 6) => {
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
};

// The short_code is a public, shareable identifier (embedded in the QR / typed at POS checkout) -
// unlike DgfyReviewInvite's single-use capability token, it is not meant to be secret. share_code_hash
// is stored alongside it purely so lookups go through a hash index uniformly with the rest of the
// codebase's token-lookup convention; it is not a secrecy boundary here.
export const hashAffiliateShareCode = (code) => (
    crypto
        .createHash('sha256')
        .update(`${String(code || '').trim().toUpperCase()}:${process.env.EMAIL_OTP_SECRET || process.env.JWT_SECRET || 'dgfy_affiliate_local_fallback'}`)
        .digest('hex')
);

const DEFAULT_SETTINGS = Object.freeze({
    program_enabled: false,
    default_rate_bps: 500,
    attribution_window_days: 60,
    min_cashout_centavos: 20000,
    auto_approve_enrollment: false,
    // #1177 (Phase 198, per #447 D1-D6): a tenant with no settings row yet still enforces the
    // default cap of 1 - see countConsumedSlots/assertAffiliateSlotAvailable below. Mirrors the
    // model-level default in TenantAffiliateSettings.js.
    max_affiliate_slots: 1,
    // Phase 1 affiliate pricing rule engine defaults - see
    // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md. Mirrors the model-level
    // defaults in TenantAffiliateSettings.js so a tenant with no settings row yet resolves
    // identically to one with a freshly-created row.
    commission_type: 'PERCENTAGE_OF_BASE',
    settlement_policy: null,
    commission_base_mode: 'discounted_subtotal'
});

// The reason_code an over-cap rejection carries in DomainError.details - distinct from the
// existing "already enrolled" 409 CONFLICT so a caller (and a human reading the response) can
// tell the two 409s apart without parsing prose.
const AFFILIATE_SLOT_CAP_REASON_CODE = 'AFFILIATE_SLOT_CAP_REACHED';

const ENROLLMENT_ACCOUNT_INCLUDE = {
    model: DgfyAccount,
    as: 'dgfyAccount',
    attributes: ['id', 'first_name', 'last_name', 'username', 'email', 'phone']
};

export const dgfyAffiliateRepository = {
    async getSettings(tenantId) {
        const row = await TenantAffiliateSettings.findByPk(tenantId);
        if (row) return toPlain(row);
        return { tenant_id: tenantId, ...DEFAULT_SETTINGS };
    },

    // --- max_affiliate_slots enforcement (#1177, Phase 198, per #447 D1-D6) ---
    //
    // Deliberately lives here, not in the use-case layer: the registration flow
    // (dgfyAuthUseCases.js -> repository.mirrorPendingAffiliateInvitesForAccount ->
    // materializeInviteEnrollment) creates enrollments without ever going through a use case, so a
    // use-case-only check would leak past it. Every write that can consume a new slot calls
    // assertAffiliateSlotAvailable immediately beforehand, in the same transaction as the write.

    async getMaxAffiliateSlots(tenantId, { transaction = null } = {}) {
        const row = await TenantAffiliateSettings.findByPk(tenantId, { transaction });
        if (row && Number.isInteger(row.max_affiliate_slots)) return row.max_affiliate_slots;
        return DEFAULT_SETTINGS.max_affiliate_slots;
    },

    // Consumed slots = active enrollments + pending, non-expired invites (#447 D3 - counting
    // enrollments alone lets a merchant mint invites under the cap and blow past it when they all
    // accept). Revoked/suspended enrollments and expired/cancelled invites do not consume (#447 D4).
    //
    // excludeInviteId: a pending->active conversion (accepting/materializing invite N) is
    // slot-NEUTRAL - it converts an existing consumer into a different kind of consumer, it never
    // adds one. Without excluding the invite being materialized from its own "am I still under
    // cap" check, a tenant at cap 1 with zero active enrollments and exactly the one pending
    // invite being accepted would see itself counted as consuming its own not-yet-freed slot and
    // incorrectly reject its own acceptance.
    async countConsumedSlots(tenantId, { transaction = null, excludeInviteId = null } = {}) {
        const pendingInviteWhere = { tenant_id: tenantId, status: 'pending', expires_at: { [Op.gt]: new Date() } };
        if (excludeInviteId !== null && excludeInviteId !== undefined) {
            pendingInviteWhere.invite_id = { [Op.ne]: excludeInviteId };
        }
        const [activeEnrollments, pendingInvites] = await Promise.all([
            DgfyAffiliateEnrollment.count({
                where: { tenant_id: tenantId, status: 'active' },
                transaction
            }),
            DgfyAffiliateInvite.count({
                where: pendingInviteWhere,
                transaction
            })
        ]);
        return activeEnrollments + pendingInvites;
    },

    // Throws a distinct 409 (reason_code AFFILIATE_SLOT_CAP_REACHED - never the existing "already
    // enrolled" CONFLICT) when the tenant is already at or over its cap. Call this immediately
    // before any write that would consume a new slot, inside that same write's transaction.
    //
    // excludeInviteId: passed straight through to countConsumedSlots - see its own comment. Pass
    // the invite's own ID when this check is guarding the materialization of that same invite, so
    // it isn't double-counted against itself.
    //
    // Concurrency note: when a transaction is supplied, this also takes a row lock on the tenant's
    // settings row (if one exists) so two concurrent slot-consuming writes for the same tenant
    // serialize on this check rather than both reading a stale count. A tenant with no settings row
    // yet has nothing to lock; the count-based check still applies there, just without that extra
    // guard for that rarer, never-configured-settings case.
    async assertAffiliateSlotAvailable(tenantId, { transaction = null, excludeInviteId = null } = {}) {
        if (transaction) {
            await TenantAffiliateSettings.findByPk(tenantId, { transaction, lock: transaction.LOCK.UPDATE });
        }
        const [maxSlots, consumedSlots] = await Promise.all([
            this.getMaxAffiliateSlots(tenantId, { transaction }),
            this.countConsumedSlots(tenantId, { transaction, excludeInviteId })
        ]);
        if (consumedSlots >= maxSlots) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                `This store has reached its affiliate slot limit (${maxSlots}). Raise max_affiliate_slots or free up a slot before adding another affiliate.`,
                {
                    statusCode: 409,
                    details: {
                        reason_code: AFFILIATE_SLOT_CAP_REASON_CODE,
                        max_affiliate_slots: maxSlots,
                        consumed_slots: consumedSlots
                    }
                }
            );
        }
    },

    async upsertSettings(tenantId, payload = {}) {
        const [row] = await TenantAffiliateSettings.findOrCreate({
            where: { tenant_id: tenantId },
            defaults: { tenant_id: tenantId, ...DEFAULT_SETTINGS }
        });
        await row.update(payload);
        return toPlain(await row.reload());
    },

    findAccountByEmail(email) {
        return DgfyAccount.findOne({ where: { email: normalizeEmail(email) } });
    },

    findAccountById(dgfyAccountId) {
        return DgfyAccount.findByPk(dgfyAccountId);
    },

    async getStorefrontSlug(tenantId) {
        const row = await StorefrontDiscoveryIndex.findOne({ where: { tenant_id: tenantId } });
        return row?.slug || null;
    },

    // Compact, consistently-sized slug used for affiliate share links/QR codes.
    // Falls back to the canonical slug if the affiliate slug hasn't been synced yet.
    async getStorefrontAffiliateSlug(tenantId) {
        const row = await StorefrontDiscoveryIndex.findOne({ where: { tenant_id: tenantId } });
        return row?.affiliate_slug || row?.slug || null;
    },

    async resolveTenantIdByStoreSlug(storeSlug) {
        const tenant = await resolveTenantByStoreSlug(storeSlug);
        return tenant?.id ? String(tenant.id) : null;
    },

    async findEnrollmentByAccountAndTenant(dgfyAccountId, tenantId) {
        const row = await DgfyAffiliateEnrollment.findOne({
            where: { dgfy_account_id: dgfyAccountId, tenant_id: tenantId }
        });
        return toPlain(row);
    },

    async findEnrollmentById(tenantId, enrollmentId) {
        const row = await DgfyAffiliateEnrollment.findOne({
            where: { tenant_id: tenantId, enrollment_id: enrollmentId },
            include: [ENROLLMENT_ACCOUNT_INCLUDE]
        });
        return toPlain(row);
    },

    async listEnrollmentsForTenant(tenantId) {
        const rows = await DgfyAffiliateEnrollment.findAll({
            where: { tenant_id: tenantId },
            include: [ENROLLMENT_ACCOUNT_INCLUDE],
            order: [['created_at', 'DESC']]
        });
        return rows.map(toPlain);
    },

    async listEnrollmentsForAccount(dgfyAccountId) {
        const rows = await DgfyAffiliateEnrollment.findAll({
            where: { dgfy_account_id: dgfyAccountId },
            include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name'] }],
            order: [['created_at', 'DESC']]
        });
        return rows.map(toPlain);
    },

    // Retries on collision - astronomically unlikely at this alphabet/length, but the table's
    // unique index is the real guarantee; this just avoids surfacing that as a user-facing error.
    async generateUniqueShareCode() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const shortCode = `AF-${generateCodeSuffix(6)}`;
            // eslint-disable-next-line no-await-in-loop
            const existing = await DgfyAffiliateEnrollment.findOne({ where: { short_code: shortCode } });
            if (!existing) {
                return { shortCode, shareCodeHash: hashAffiliateShareCode(shortCode) };
            }
        }
        throw new Error('Failed to generate a unique affiliate share code after multiple attempts');
    },

    async createEnrollment({
        dgfyAccountId,
        tenantId,
        shortCode,
        shareCodeHash,
        commissionRateBps = null,
        status = 'active',
        source = 'admin_provisioned',
        invitedEmail = null,
        activatedAt = null
    }) {
        return DgfyAffiliateEnrollment.sequelize.transaction(async (transaction) => {
            // A non-active status (unused today - every current call site passes 'active') never
            // consumes a slot, matching countConsumedSlots' own definition of "consumed".
            if (status === 'active') {
                await this.assertAffiliateSlotAvailable(tenantId, { transaction });
            }
            const row = await DgfyAffiliateEnrollment.create({
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId,
                short_code: shortCode,
                share_code_hash: shareCodeHash,
                commission_rate_bps: commissionRateBps,
                status,
                source,
                invited_email: invitedEmail,
                activated_at: activatedAt
            }, { transaction });
            return toPlain(row);
        });
    },

    async updateEnrollment(tenantId, enrollmentId, updates = {}) {
        const row = await DgfyAffiliateEnrollment.findOne({
            where: { tenant_id: tenantId, enrollment_id: enrollmentId }
        });
        if (!row) return null;
        await row.update(updates);
        return toPlain(await row.reload({ include: [ENROLLMENT_ACCOUNT_INCLUDE] }));
    },

    // --- Affiliate invites (email invitations that predate an enrollment / DGFY account) ---

    async createInvite({ tenantId, email, tokenHash, commissionRateBps = null, invitedBy = null, expiresAt }) {
        return DgfyAffiliateInvite.sequelize.transaction(async (transaction) => {
            // A brand-new pending invite consumes a slot the moment it's minted (#1177) - reject
            // here so the cap is hit at invite time, not surprise-rejected at acceptance.
            // refreshInvite (re-invite/resend of an already-pending invite) does not go through
            // this path and must not re-consume.
            await this.assertAffiliateSlotAvailable(tenantId, { transaction });
            const row = await DgfyAffiliateInvite.create({
                tenant_id: tenantId,
                email: normalizeEmail(email),
                token_hash: tokenHash,
                commission_rate_bps: commissionRateBps,
                invited_by: invitedBy,
                status: 'pending',
                expires_at: expiresAt,
                last_sent_at: new Date()
            }, { transaction });
            return toPlain(row);
        });
    },

    // Reuses an existing pending invite row (re-invite / resend) rather than piling up duplicates:
    // rotates the token, refreshes the expiry, and re-arms it to `pending`.
    async refreshInvite(inviteId, { tokenHash, commissionRateBps = null, expiresAt }) {
        const row = await DgfyAffiliateInvite.findByPk(inviteId);
        if (!row) return null;
        await row.update({
            token_hash: tokenHash,
            commission_rate_bps: commissionRateBps,
            status: 'pending',
            expires_at: expiresAt,
            last_sent_at: new Date(),
            accepted_at: null,
            dgfy_account_id: null
        });
        return toPlain(await row.reload());
    },

    async findPendingInviteByTenantAndEmail(tenantId, email) {
        const row = await DgfyAffiliateInvite.findOne({
            where: { tenant_id: tenantId, email: normalizeEmail(email), status: 'pending' }
        });
        return toPlain(row);
    },

    async findInviteByIdForTenant(tenantId, inviteId) {
        const row = await DgfyAffiliateInvite.findOne({
            where: { tenant_id: tenantId, invite_id: inviteId }
        });
        return toPlain(row);
    },

    async findInviteByTokenHash(tokenHash) {
        const row = await DgfyAffiliateInvite.findOne({
            where: { token_hash: tokenHash },
            include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name'] }]
        });
        return toPlain(row);
    },

    async listInvitesByTenant(tenantId, { status = null } = {}) {
        const where = { tenant_id: tenantId };
        if (status) where.status = status;
        const rows = await DgfyAffiliateInvite.findAll({
            where,
            order: [['created_at', 'DESC']]
        });
        return rows.map(toPlain);
    },

    async markInviteCancelled(inviteId) {
        const row = await DgfyAffiliateInvite.findByPk(inviteId);
        if (!row) return null;
        if (row.status === 'pending') await row.update({ status: 'cancelled' });
        return toPlain(await row.reload());
    },

    async markInviteExpired(inviteId) {
        const row = await DgfyAffiliateInvite.findByPk(inviteId);
        if (!row) return null;
        if (row.status === 'pending') await row.update({ status: 'expired' });
        return toPlain(await row.reload());
    },

    // Turns a pending invite into a real enrollment bound to `account`, then flips the invite to
    // `accepted`. Idempotent: if the account is already enrolled for this tenant (unique
    // (dgfy_account_id, tenant_id) index), it reuses that enrollment instead of creating a second.
    // Accepts an optional transaction so the on-register auto-enroll hook can run atomically inside
    // the account-creation transaction.
    async materializeInviteEnrollment(invite, account, { transaction = null } = {}) {
        const existing = await DgfyAffiliateEnrollment.findOne({
            where: { dgfy_account_id: account.id, tenant_id: invite.tenant_id },
            transaction
        });

        let enrollment = existing;
        let created = false;
        if (!existing) {
            // #1177: this is the seam a use-case-only cap check would miss - the register flow
            // (dgfyAuthUseCases.js -> mirrorPendingAffiliateInvitesForAccount) reaches this
            // directly, never through a use case. Runs inside `transaction` when supplied (the
            // register path always supplies one) so the check and the create commit atomically.
            // The idempotent "already accepted" branch above never reaches here (existing is set),
            // so re-accepting an already-materialized invite never re-consumes.
            //
            // excludeInviteId: this invite is being converted, not added - it's already counted
            // as one of the tenant's consumed slots (it's `pending`, non-expired) right up until
            // the update below flips it to `accepted`. Without excluding it here, a tenant at cap
            // with zero active enrollments and only this one pending invite would incorrectly be
            // rejected from accepting its own invite.
            await this.assertAffiliateSlotAvailable(invite.tenant_id, { transaction, excludeInviteId: invite.invite_id });

            // generateUniqueShareCode reads without the transaction, but the unique short_code/
            // share_code_hash indexes are the real guarantee against collisions.
            const { shortCode, shareCodeHash } = await this.generateUniqueShareCode();
            enrollment = await DgfyAffiliateEnrollment.create({
                dgfy_account_id: account.id,
                tenant_id: invite.tenant_id,
                short_code: shortCode,
                share_code_hash: shareCodeHash,
                commission_rate_bps: invite.commission_rate_bps ?? null,
                status: 'active',
                source: 'invite',
                invited_email: normalizeEmail(invite.email),
                activated_at: new Date()
            }, { transaction });
            created = true;
        }

        const inviteRow = await DgfyAffiliateInvite.findByPk(invite.invite_id, { transaction });
        if (inviteRow && inviteRow.status === 'pending') {
            await inviteRow.update({
                status: 'accepted',
                accepted_at: new Date(),
                dgfy_account_id: account.id
            }, { transaction });
        }

        return { enrollment: toPlain(enrollment), created };
    },

    // Auto-enroll hook: called right after a brand-new DGFY account is created (register), matching
    // any pending, unexpired invites addressed to that account's email and materializing each into
    // an enrollment. This is the "once the account exists, they're automatically affiliated" path.
    //
    // Runs inside dgfyAuthUseCases.js's account-creation transaction (#1177) - a brand-new user
    // must always be able to create their DGFY account, even when some unrelated merchant who
    // invited them happens to be at their affiliate cap right now. So a slot-cap rejection here is
    // caught and turned into a skip (the invite is simply left pending - it expires on its own TTL,
    // or the merchant can free a slot and the invitee can accept it manually later) rather than
    // aborting registration. Any other error still propagates - only the specific, expected
    // AFFILIATE_SLOT_CAP_REACHED rejection is swallowed.
    async mirrorPendingAffiliateInvitesForAccount(account, { transaction = null } = {}) {
        if (!account?.id || !account?.email) return [];
        const invites = await DgfyAffiliateInvite.findAll({
            where: {
                email: normalizeEmail(account.email),
                status: 'pending',
                expires_at: { [Op.gt]: new Date() }
            },
            transaction
        });

        const results = [];
        for (const invite of invites) {
            const plainInvite = toPlain(invite);
            try {
                // eslint-disable-next-line no-await-in-loop
                const result = await this.materializeInviteEnrollment(plainInvite, account, { transaction });
                results.push(result);
            } catch (error) {
                if (error?.details?.reason_code !== AFFILIATE_SLOT_CAP_REASON_CODE) throw error;
                results.push({
                    enrollment: null,
                    created: false,
                    skipped: 'slot_limit_reached',
                    invite_id: plainInvite.invite_id
                });
            }
        }
        return results;
    },

    async findActiveEnrollmentByShareCode(tenantId, code) {
        const row = await DgfyAffiliateEnrollment.findOne({
            where: {
                tenant_id: tenantId,
                share_code_hash: hashAffiliateShareCode(code),
                status: 'active'
            }
        });
        return toPlain(row);
    },

    async recordAttribution({
        tenantId,
        enrollmentId,
        channel = 'in_store',
        posTransactionId = null,
        dgfyAccountId = null,
        storeSlug = null,
        visitorFingerprint = null
    }) {
        const row = await DgfyAffiliateAttribution.create({
            tenant_id: tenantId,
            enrollment_id: enrollmentId,
            channel,
            pos_transaction_id: posTransactionId,
            dgfy_account_id: dgfyAccountId,
            store_slug: storeSlug,
            visitor_fingerprint: visitorFingerprint
        });
        return toPlain(row);
    },

    // Idempotent by construction via the unique (tenant_id, order_reference) index - a duplicate
    // call (checkout retry, duplicate webhook, etc.) is a silent no-op, never a second commission.
    async createEarnedCommissionIfMissing({
        enrollmentId,
        tenantId,
        dgfyAccountId,
        posTransactionId = null,
        orderReference,
        commissionableBaseCentavos,
        rateBpsSnapshot,
        amountCentavos,
        reason = 'in_store_sale',
        // Phase 1 affiliate pricing rule engine snapshot fields - all null unless an affiliate
        // price rule was actually applied to this order.
        baseSubtotalCentavos = null,
        buyerSubtotalCentavos = null,
        resellerMarginCentavos = null,
        priceRuleTypeSnapshot = null,
        settlementPolicySnapshot = null
    }) {
        const [row, created] = await DgfyAffiliateCommission.findOrCreate({
            where: { tenant_id: tenantId, order_reference: orderReference },
            defaults: {
                enrollment_id: enrollmentId,
                tenant_id: tenantId,
                dgfy_account_id: dgfyAccountId,
                pos_transaction_id: posTransactionId,
                order_reference: orderReference,
                commissionable_base_centavos: commissionableBaseCentavos,
                rate_bps_snapshot: rateBpsSnapshot,
                amount_centavos: amountCentavos,
                status: 'earned',
                reason,
                earned_at: new Date(),
                base_subtotal_centavos: baseSubtotalCentavos,
                buyer_subtotal_centavos: buyerSubtotalCentavos,
                reseller_margin_centavos: resellerMarginCentavos,
                price_rule_type_snapshot: priceRuleTypeSnapshot,
                settlement_policy_snapshot: settlementPolicySnapshot
            }
        });
        return { commission: toPlain(row), created };
    },

    // Online-order twin of createEarnedCommissionIfMissing: online orders are born pending (unlike
    // in-store sales, which are completed at checkout) and settle to earned/reversed later via the
    // order lifecycle hook. Same idempotency guarantee via the (tenant_id, order_reference) index.
    async createPendingCommissionIfMissing({
        enrollmentId,
        tenantId,
        dgfyAccountId,
        posTransactionId = null,
        orderReference,
        commissionableBaseCentavos,
        rateBpsSnapshot,
        amountCentavos,
        reason = 'online_order',
        // Phase 1 affiliate pricing rule engine snapshot fields - all null unless an affiliate
        // price rule was actually applied to this order.
        baseSubtotalCentavos = null,
        buyerSubtotalCentavos = null,
        resellerMarginCentavos = null,
        priceRuleTypeSnapshot = null,
        settlementPolicySnapshot = null
    }) {
        const [row, created] = await DgfyAffiliateCommission.findOrCreate({
            where: { tenant_id: tenantId, order_reference: orderReference },
            defaults: {
                enrollment_id: enrollmentId,
                tenant_id: tenantId,
                dgfy_account_id: dgfyAccountId,
                pos_transaction_id: posTransactionId,
                order_reference: orderReference,
                commissionable_base_centavos: commissionableBaseCentavos,
                rate_bps_snapshot: rateBpsSnapshot,
                amount_centavos: amountCentavos,
                status: 'pending',
                reason,
                base_subtotal_centavos: baseSubtotalCentavos,
                buyer_subtotal_centavos: buyerSubtotalCentavos,
                reseller_margin_centavos: resellerMarginCentavos,
                price_rule_type_snapshot: priceRuleTypeSnapshot,
                settlement_policy_snapshot: settlementPolicySnapshot
            }
        });
        return { commission: toPlain(row), created };
    },

    // Settles a pending online-order commission to earned once the order actually completes. Only
    // a `pending` row can be settled this way - anything else (already earned/paid/reversed, or
    // reserved by a cashout) is reported back so the caller can decide whether that's expected.
    async markCommissionEarnedByOrderReference(tenantId, orderReference) {
        const row = await DgfyAffiliateCommission.findOne({
            where: { tenant_id: tenantId, order_reference: orderReference }
        });
        if (!row) return { updated: false, reason: 'not_found' };
        if (row.cashout_id) return { updated: false, reason: 'already_in_cashout' };
        if (row.status === 'earned') return { updated: true, reason: 'already_earned', commission: toPlain(row) };
        if (row.status === 'paid') return { updated: false, reason: 'already_paid' };
        if (row.status === 'reversed') return { updated: false, reason: 'already_reversed' };
        if (row.status !== 'pending') return { updated: false, reason: 'invalid_status' };

        await row.update({ status: 'earned', earned_at: new Date() });
        return { updated: true, commission: toPlain(await row.reload()) };
    },

    // Reverses a commission by its order_reference (the tracking_pin/pos_transaction_id join key).
    // Skips (and reports so the caller can flag it) rows already reserved by a cashout (cashout_id
    // set) - those follow the compensating-row clawback policy (a later slice), not a hard reversal.
    async reverseCommissionByOrderReference(tenantId, orderReference) {
        const row = await DgfyAffiliateCommission.findOne({
            where: { tenant_id: tenantId, order_reference: orderReference }
        });
        if (!row) return { reversed: false, reason: 'not_found' };
        if (row.cashout_id) return { reversed: false, reason: 'already_in_cashout' };
        if (row.status === 'reversed') return { reversed: true, reason: 'already_reversed', commission: toPlain(row) };
        if (row.status === 'paid') return { reversed: false, reason: 'already_paid' };

        await row.update({ status: 'reversed', reversed_at: new Date() });
        return { reversed: true, commission: toPlain(await row.reload()) };
    },

    async getEarningsSummary(dgfyAccountId, tenantId = null) {
        const baseWhere = { dgfy_account_id: dgfyAccountId };
        if (tenantId) baseWhere.tenant_id = tenantId;

        const sumWhere = async (extraWhere) => {
            const total = await DgfyAffiliateCommission.sum('amount_centavos', {
                where: { ...baseWhere, ...extraWhere }
            });
            return Number(total) || 0;
        };

        const [pendingCentavos, availableCentavos, paidCentavos, reversedCentavos] = await Promise.all([
            sumWhere({ status: 'pending' }),
            sumWhere({ status: 'earned', cashout_id: null }),
            sumWhere({ status: 'paid' }),
            sumWhere({ status: 'reversed' })
        ]);

        return {
            pending_centavos: pendingCentavos,
            available_centavos: availableCentavos,
            paid_centavos: paidCentavos,
            reversed_centavos: reversedCentavos
        };
    },

    // --- Payout methods (account-level, not tenant-scoped - one set of methods per DGFY account,
    // reused across every store they affiliate for) ---

    async listPayoutMethods(dgfyAccountId) {
        const rows = await DgfyAffiliatePayoutMethod.findAll({
            where: { dgfy_account_id: dgfyAccountId },
            order: [['is_default', 'DESC'], ['payout_method_id', 'ASC']]
        });
        return rows.map(toPlain);
    },

    async getPayoutMethod(dgfyAccountId, payoutMethodId) {
        const row = await DgfyAffiliatePayoutMethod.findOne({
            where: { dgfy_account_id: dgfyAccountId, payout_method_id: payoutMethodId }
        });
        return toPlain(row);
    },

    async createPayoutMethod(dgfyAccountId, payload = {}) {
        if (payload.is_default === true) {
            await DgfyAffiliatePayoutMethod.update({ is_default: false }, { where: { dgfy_account_id: dgfyAccountId } });
        }
        const existingCount = await DgfyAffiliatePayoutMethod.count({ where: { dgfy_account_id: dgfyAccountId } });
        const row = await DgfyAffiliatePayoutMethod.create({
            dgfy_account_id: dgfyAccountId,
            method_type: payload.method_type,
            label: payload.label ?? null,
            bank_name: payload.bank_name ?? null,
            account_name: payload.account_name ?? null,
            account_number: payload.account_number ?? null,
            mobile_number: payload.mobile_number ?? null,
            is_default: payload.is_default === true || existingCount === 0
        });
        return toPlain(row);
    },

    async updatePayoutMethod(dgfyAccountId, payoutMethodId, payload = {}) {
        const row = await DgfyAffiliatePayoutMethod.findOne({
            where: { dgfy_account_id: dgfyAccountId, payout_method_id: payoutMethodId }
        });
        if (!row) return null;
        if (payload.is_default === true) {
            await DgfyAffiliatePayoutMethod.update({ is_default: false }, { where: { dgfy_account_id: dgfyAccountId } });
        }
        await row.update(payload);
        return toPlain(await row.reload());
    },

    async deletePayoutMethod(dgfyAccountId, payoutMethodId) {
        const row = await DgfyAffiliatePayoutMethod.findOne({
            where: { dgfy_account_id: dgfyAccountId, payout_method_id: payoutMethodId }
        });
        if (!row) return false;
        const wasDefault = row.is_default === true;
        await row.destroy();
        if (wasDefault) {
            const next = await DgfyAffiliatePayoutMethod.findOne({
                where: { dgfy_account_id: dgfyAccountId },
                order: [['payout_method_id', 'ASC']]
            });
            if (next) await next.update({ is_default: true });
        }
        return true;
    },

    // --- Cashouts (full-balance requests that settle a batch of earned commission rows) ---

    async getEnrollmentForCashout(tenantId, enrollmentId, dgfyAccountId) {
        const row = await DgfyAffiliateEnrollment.findOne({
            where: { tenant_id: tenantId, enrollment_id: enrollmentId, dgfy_account_id: dgfyAccountId }
        });
        return toPlain(row);
    },

    async listCashoutsForTenant(tenantId, { status = null } = {}) {
        const where = { tenant_id: tenantId };
        if (status) where.status = status;
        const rows = await DgfyAffiliateCashout.findAll({
            where,
            include: [{ model: DgfyAffiliateEnrollment, as: 'enrollment', include: [ENROLLMENT_ACCOUNT_INCLUDE] }],
            order: [['requested_at', 'DESC']]
        });
        return rows.map(toPlain);
    },

    async listCashoutsForAccount(dgfyAccountId, { tenantId = null } = {}) {
        const where = { dgfy_account_id: dgfyAccountId };
        if (tenantId) where.tenant_id = tenantId;
        const rows = await DgfyAffiliateCashout.findAll({
            where,
            order: [['requested_at', 'DESC']]
        });
        return rows.map(toPlain);
    },

    async findCashoutById(cashoutId, { tenantId = null, dgfyAccountId = null } = {}) {
        const where = { cashout_id: cashoutId };
        if (tenantId) where.tenant_id = tenantId;
        if (dgfyAccountId) where.dgfy_account_id = dgfyAccountId;
        const row = await DgfyAffiliateCashout.findOne({ where });
        return toPlain(row);
    },

    // Reserves every currently-available (earned, cashout_id IS NULL) commission row for this
    // enrollment into a brand-new cashout, inside one transaction, so two concurrent requests can
    // never consume the same commission row. Rejects (returns null) if there's nothing available.
    async requestCashout({ enrollmentId, tenantId, dgfyAccountId, payoutMethodId, payoutSnapshot }) {
        return DgfyAffiliateEnrollment.sequelize.transaction(async (transaction) => {
            const eligibleRows = await DgfyAffiliateCommission.findAll({
                where: {
                    enrollment_id: enrollmentId,
                    tenant_id: tenantId,
                    dgfy_account_id: dgfyAccountId,
                    status: 'earned',
                    cashout_id: null
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            const amountCentavos = eligibleRows.reduce((sum, row) => sum + Number(row.amount_centavos || 0), 0);
            if (!eligibleRows.length || amountCentavos <= 0) return null;

            const cashout = await DgfyAffiliateCashout.create({
                enrollment_id: enrollmentId,
                tenant_id: tenantId,
                dgfy_account_id: dgfyAccountId,
                payout_method_id: payoutMethodId,
                payout_snapshot: payoutSnapshot,
                amount_centavos: amountCentavos,
                status: 'requested',
                requested_at: new Date()
            }, { transaction });

            await DgfyAffiliateCommission.update(
                { cashout_id: cashout.cashout_id },
                {
                    where: { commission_id: eligibleRows.map((row) => row.commission_id) },
                    transaction
                }
            );

            return toPlain(await cashout.reload({ transaction }));
        });
    },

    // requested -> cancelled (affiliate withdraws their own request); releases reserved rows.
    async cancelCashout(cashoutId, { dgfyAccountId }) {
        return DgfyAffiliateEnrollment.sequelize.transaction(async (transaction) => {
            const cashout = await DgfyAffiliateCashout.findOne({
                where: { cashout_id: cashoutId, dgfy_account_id: dgfyAccountId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (cashout.status !== 'requested') return { cashout: toPlain(cashout), reason: 'invalid_status' };

            await DgfyAffiliateCommission.update(
                { cashout_id: null },
                { where: { cashout_id: cashoutId }, transaction }
            );
            await cashout.update({ status: 'cancelled' }, { transaction });
            return { cashout: toPlain(await cashout.reload({ transaction })), reason: null };
        });
    },

    // requested/approved -> rejected (owner declines); releases reserved rows back to available.
    async rejectCashout(cashoutId, { tenantId, rejectionReason = null }) {
        return DgfyAffiliateEnrollment.sequelize.transaction(async (transaction) => {
            const cashout = await DgfyAffiliateCashout.findOne({
                where: { cashout_id: cashoutId, tenant_id: tenantId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (!['requested', 'approved'].includes(cashout.status)) return { cashout: toPlain(cashout), reason: 'invalid_status' };

            await DgfyAffiliateCommission.update(
                { cashout_id: null },
                { where: { cashout_id: cashoutId }, transaction }
            );
            await cashout.update({
                status: 'rejected',
                rejected_at: new Date(),
                rejection_reason: rejectionReason
            }, { transaction });
            return { cashout: toPlain(await cashout.reload({ transaction })), reason: null };
        });
    },

    // requested -> approved (owner accepts the request, hasn't paid yet).
    async approveCashout(cashoutId, { tenantId, approvedByUserId = null }) {
        return DgfyAffiliateEnrollment.sequelize.transaction(async (transaction) => {
            const cashout = await DgfyAffiliateCashout.findOne({
                where: { cashout_id: cashoutId, tenant_id: tenantId },
                include: [{ model: DgfyAffiliateEnrollment, as: 'enrollment', required: true }],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (cashout.status !== 'requested') return { cashout: toPlain(cashout), reason: 'invalid_status' };
            if (cashout.enrollment?.status !== 'active') return { cashout: toPlain(cashout), reason: 'enrollment_inactive' };

            await cashout.update({ status: 'approved', approved_at: new Date(), approved_by_user_id: approvedByUserId }, { transaction });
            return { cashout: toPlain(await cashout.reload({ transaction })), reason: null };
        });
    },

    // approved -> paid (owner has paid externally); bulk-flips the reserved rows earned -> paid.
    async markCashoutPaid(cashoutId, { tenantId, externalPaymentRef }) {
        return DgfyAffiliateEnrollment.sequelize.transaction(async (transaction) => {
            const cashout = await DgfyAffiliateCashout.findOne({
                where: { cashout_id: cashoutId, tenant_id: tenantId },
                include: [{ model: DgfyAffiliateEnrollment, as: 'enrollment', required: true }],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (cashout.status !== 'approved') return { cashout: toPlain(cashout), reason: 'invalid_status' };
            if (cashout.enrollment?.status !== 'active') return { cashout: toPlain(cashout), reason: 'enrollment_inactive' };

            await DgfyAffiliateCommission.update(
                { status: 'paid', paid_at: new Date() },
                { where: { cashout_id: cashoutId, status: 'earned' }, transaction }
            );
            await cashout.update({
                status: 'paid',
                paid_at: new Date(),
                external_payment_ref: externalPaymentRef
            }, { transaction });
            return { cashout: toPlain(await cashout.reload({ transaction })), reason: null };
        });
    },

    // --- Affiliate price rules (Phase 1 of the affiliate pricing rule engine - see
    // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md). Selling-price rule only;
    // commission configuration lives on TenantAffiliateSettings / DgfyAffiliateEnrollment as
    // commission_type, alongside the existing commission_rate_bps override. ---

    async listPriceRulesForTenant(tenantId) {
        const rows = await DgfyAffiliatePriceRule.findAll({
            where: { tenant_id: tenantId },
            order: [['enrollment_id', 'ASC'], ['item_id', 'ASC']]
        });
        return rows.map(toPlain);
    },

    // Resolves the single active price rule that applies to a sale, per the priority order in
    // affiliatePriceRuleResolution.js. itemId defaults to the "applies to all products" sentinel -
    // Phase 1 never populates a real item scope, but the query and resolver both already handle one
    // correctly for when Phase 2 starts writing them. Returns null (never throws) when nothing
    // matches, meaning the caller should fall back to the plain catalog price.
    async resolveActivePriceRule({ tenantId, enrollmentId, itemId = PRICE_RULE_SCOPE_ALL }) {
        if (!tenantId || !enrollmentId) return null;

        const candidateRows = await DgfyAffiliatePriceRule.findAll({
            where: {
                tenant_id: tenantId,
                active: true,
                enrollment_id: { [Op.in]: [Number(enrollmentId), PRICE_RULE_SCOPE_ALL] },
                item_id: { [Op.in]: [Number(itemId) || PRICE_RULE_SCOPE_ALL, PRICE_RULE_SCOPE_ALL] }
            }
        });

        return resolvePriceRuleFromCandidates({
            candidateRows: candidateRows.map(toPlain),
            enrollmentId,
            itemId
        });
    },

    // Pre-flight duplicate-scope check ahead of a write, so a conflicting rule surfaces as a clean
    // validation error rather than a raw unique-constraint violation. Advisory only - the table's
    // UNIQUE (tenant_id, enrollment_id, item_id) index remains the real guarantee under concurrent
    // writes.
    async priceRuleScopeIsTaken({ tenantId, enrollmentId = PRICE_RULE_SCOPE_ALL, itemId = PRICE_RULE_SCOPE_ALL, excludePriceRuleId = null }) {
        const existingRows = await this.listPriceRulesForTenant(tenantId);
        return hasDuplicatePriceRuleScope(existingRows, { enrollmentId, itemId, excludePriceRuleId });
    },

    // Creates or updates the single price rule at a given (tenant_id, enrollment_id, item_id) scope.
    // findOrCreate on the unique scope index is the real concurrency guard; the update afterward
    // covers the "already exists, change its rule" case (an owner editing their tenant template or a
    // per-affiliate override).
    async upsertPriceRule({
        tenantId,
        enrollmentId = PRICE_RULE_SCOPE_ALL,
        itemId = PRICE_RULE_SCOPE_ALL,
        ruleType,
        rateBps = null,
        amountCentavos = null,
        active = true
    }) {
        const [row] = await DgfyAffiliatePriceRule.findOrCreate({
            where: { tenant_id: tenantId, enrollment_id: enrollmentId, item_id: itemId },
            defaults: {
                tenant_id: tenantId,
                enrollment_id: enrollmentId,
                item_id: itemId,
                rule_type: ruleType,
                rate_bps: rateBps,
                amount_centavos: amountCentavos,
                active
            }
        });
        await row.update({ rule_type: ruleType, rate_bps: rateBps, amount_centavos: amountCentavos, active });
        return toPlain(await row.reload());
    },

    async deactivatePriceRule(tenantId, priceRuleId) {
        const row = await DgfyAffiliatePriceRule.findOne({
            where: { tenant_id: tenantId, price_rule_id: priceRuleId }
        });
        if (!row) return null;
        await row.update({ active: false });
        return toPlain(await row.reload());
    }
};

export default dgfyAffiliateRepository;
