import crypto from 'crypto';
import {
    DgfyAccount,
    DgfyAffiliateEnrollment,
    DgfyAffiliateCommission,
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
    }
};

export default dgfyAffiliateRepository;
