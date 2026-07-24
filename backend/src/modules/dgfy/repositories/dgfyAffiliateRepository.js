import crypto from 'crypto';
import {
    DgfyAccount,
    DgfyAffiliateAttribution,
    DgfyAffiliateEnrollment,
    DgfyAffiliateCommission,
    DgfyAffiliatePayoutMethod,
    DgfyAffiliateCashout,
    StorefrontDiscoveryIndex,
    Tenant,
    TenantAffiliateSettings
} from '../../../models/index.js';

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
    auto_approve_enrollment: false
});

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
        });
        return toPlain(row);
    },

    async updateEnrollment(tenantId, enrollmentId, updates = {}) {
        const row = await DgfyAffiliateEnrollment.findOne({
            where: { tenant_id: tenantId, enrollment_id: enrollmentId }
        });
        if (!row) return null;
        await row.update(updates);
        return toPlain(await row.reload({ include: [ENROLLMENT_ACCOUNT_INCLUDE] }));
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
        reason = 'in_store_sale'
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
                earned_at: new Date()
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
        reason = 'online_order'
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
                reason
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
        const cashout = await DgfyAffiliateCashout.findOne({ where: { cashout_id: cashoutId, tenant_id: tenantId } });
        if (!cashout) return { cashout: null, reason: 'not_found' };
        if (cashout.status !== 'requested') return { cashout: toPlain(cashout), reason: 'invalid_status' };

        await cashout.update({ status: 'approved', approved_at: new Date(), approved_by_user_id: approvedByUserId });
        return { cashout: toPlain(await cashout.reload()), reason: null };
    },

    // approved -> paid (owner has paid externally); bulk-flips the reserved rows earned -> paid.
    async markCashoutPaid(cashoutId, { tenantId, externalPaymentRef }) {
        return DgfyAffiliateEnrollment.sequelize.transaction(async (transaction) => {
            const cashout = await DgfyAffiliateCashout.findOne({
                where: { cashout_id: cashoutId, tenant_id: tenantId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (cashout.status !== 'approved') return { cashout: toPlain(cashout), reason: 'invalid_status' };

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
    }
};

export default dgfyAffiliateRepository;
