import crypto from 'crypto';
import { Op } from 'sequelize';
import {
    DgfyAccount,
    DgfyCustomerActivity,
    DgfyCustomerAddress,
    DgfyCustomerBackfillRun,
    DgfyCustomerReview,
    DgfyLoyaltyTransaction,
    DgfyTrackingRecoveryCode,
    Tenant
} from '../../../models/index.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').trim();
const phoneDigits = (value) => String(value || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

export const buildPhoneLookupVariants = (value) => {
    const raw = normalizePhone(value);
    const digitsOnly = raw.replace(/\D/g, '');
    const variants = new Set([raw].filter(Boolean));
    if (!digitsOnly) return [...variants];

    variants.add(digitsOnly);
    if (digitsOnly.startsWith('63') && digitsOnly.length >= 12) {
        variants.add(`+${digitsOnly}`);
        variants.add(`0${digitsOnly.slice(2)}`);
    } else if (digitsOnly.startsWith('0') && digitsOnly.length >= 11) {
        variants.add(`63${digitsOnly.slice(1)}`);
        variants.add(`+63${digitsOnly.slice(1)}`);
    } else if (digitsOnly.length === 10 && digitsOnly.startsWith('9')) {
        variants.add(`0${digitsOnly}`);
        variants.add(`63${digitsOnly}`);
        variants.add(`+63${digitsOnly}`);
    }
    const compactRaw = phoneDigits(raw);
    if (compactRaw) variants.add(compactRaw);
    return [...variants].filter(Boolean);
};

export const hashTrackingRecoveryLookup = (value) => (
    crypto
        .createHash('sha256')
        .update(`${String(value || '').trim().toLowerCase()}:${process.env.EMAIL_OTP_SECRET || process.env.JWT_SECRET || 'dgfy_recovery_local_fallback'}`)
        .digest('hex')
);

export const dgfyCustomerRepository = {
    findDgfyAccountByEmail(email) {
        return DgfyAccount.findOne({ where: { email: normalizeEmail(email) } });
    },

    findTenantById(tenantId) {
        return Tenant.findByPk(tenantId);
    },

    listActiveTenants(limit = 50) {
        return Tenant.findAll({
            where: { status: 'active' },
            order: [['created_at', 'DESC']],
            limit: Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 100))
        });
    },

    listTenantsForBackfill({ limit = 100, offset = 0, includeInactive = false } = {}) {
        const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 500));
        const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
        return Tenant.findAll({
            where: includeInactive ? {} : { status: 'active' },
            order: [['created_at', 'ASC'], ['id', 'ASC']],
            limit: safeLimit,
            offset: safeOffset
        });
    },

    listDgfyAccountsForBackfill({ limit = 500, offset = 0 } = {}) {
        const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 500, 1000));
        const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
        return DgfyAccount.findAll({
            where: { is_active: true },
            attributes: ['id', 'email', 'phone'],
            order: [['created_at', 'ASC'], ['id', 'ASC']],
            limit: safeLimit,
            offset: safeOffset
        }).then((rows) => rows.map(toPlain));
    },

    createBackfillRun(payload = {}) {
        return DgfyCustomerBackfillRun.create(payload).then(toPlain);
    },

    async updateBackfillRun(runId, payload = {}) {
        if (!runId) return null;
        const row = await DgfyCustomerBackfillRun.findByPk(runId);
        if (!row) return null;
        await row.update(payload);
        return toPlain(await row.reload());
    },

    async upsertActivity(payload = {}) {
        const reference = String(payload.reference || '').trim().toUpperCase();
        const tenantId = String(payload.tenant_id || '').trim();
        const activityType = String(payload.activity_type || 'order').trim() || 'order';
        if (!reference || !tenantId) return null;

        const [activity] = await DgfyCustomerActivity.findOrCreate({
            where: {
                tenant_id: tenantId,
                activity_type: activityType,
                reference
            },
            defaults: {
                ...payload,
                tenant_id: tenantId,
                activity_type: activityType,
                reference
            }
        });

        const existingSnapshot = activity.display_snapshot && typeof activity.display_snapshot === 'object'
            ? activity.display_snapshot
            : {};
        const incomingSnapshot = payload.display_snapshot && typeof payload.display_snapshot === 'object'
            ? payload.display_snapshot
            : null;
        const displaySnapshot = incomingSnapshot
            ? {
                ...existingSnapshot,
                ...incomingSnapshot,
                ...(!incomingSnapshot.lines && existingSnapshot.lines ? { lines: existingSnapshot.lines } : {})
            }
            : (activity.display_snapshot ?? null);

        await activity.update({
            dgfy_account_id: payload.dgfy_account_id ?? activity.dgfy_account_id ?? null,
            store_customer_id: payload.store_customer_id ?? activity.store_customer_id ?? null,
            store_slug: payload.store_slug ?? activity.store_slug ?? null,
            store_name: payload.store_name ?? activity.store_name ?? null,
            status: payload.status ?? activity.status ?? null,
            status_label: payload.status_label ?? activity.status_label ?? null,
            payment_status: payload.payment_status ?? activity.payment_status ?? null,
            total_amount: payload.total_amount ?? activity.total_amount ?? null,
            currency: payload.currency || activity.currency || 'PHP',
            customer_email: normalizeEmail(payload.customer_email) || activity.customer_email || null,
            customer_phone: normalizePhone(payload.customer_phone) || activity.customer_phone || null,
            display_snapshot: displaySnapshot,
            occurred_at: payload.occurred_at || activity.occurred_at || new Date()
        });

        return toPlain(await activity.reload());
    },

    async listActivitiesForAccount(dgfyAccountId, {
        type = null,
        tenantId = null,
        storeSlug = null,
        status = null,
        paymentStatus = null,
        dateFrom = null,
        dateTo = null,
        limit = 25,
        page = 1
    } = {}) {
        const where = { dgfy_account_id: dgfyAccountId };
        if (type) {
            const rawTypes = Array.isArray(type) ? type : String(type).split(',');
            const types = rawTypes.map((entry) => String(entry || '').trim()).filter(Boolean);
            const mappedTypes = types.flatMap((entry) => {
                if (entry === 'booking') return ['service_booking', 'hospitality_booking'];
                if (entry === 'order') return ['order'];
                if (entry === 'all') return [];
                return [entry];
            });
            if (mappedTypes.length === 1) where.activity_type = mappedTypes[0];
            if (mappedTypes.length > 1) where.activity_type = { [Op.in]: mappedTypes };
        }
        if (tenantId) where.tenant_id = String(tenantId).trim();
        if (storeSlug) where.store_slug = String(storeSlug).trim();
        if (status) where.status = String(status).trim();
        if (paymentStatus) where.payment_status = String(paymentStatus).trim();
        if (dateFrom || dateTo) {
            where.occurred_at = {};
            const from = dateFrom ? new Date(dateFrom) : null;
            const to = dateTo ? new Date(dateTo) : null;
            if (from && !Number.isNaN(from.getTime())) where.occurred_at[Op.gte] = from;
            if (to && !Number.isNaN(to.getTime())) where.occurred_at[Op.lte] = to;
            if (!Object.keys(where.occurred_at).length) delete where.occurred_at;
        }
        const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 25, 100));
        const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
        const result = await DgfyCustomerActivity.findAndCountAll({
            where,
            order: [['occurred_at', 'DESC'], ['activity_id', 'DESC']],
            limit: safeLimit,
            offset: (safePage - 1) * safeLimit
        });
        return {
            rows: result.rows.map(toPlain),
            pagination: {
                page: safePage,
                limit: safeLimit,
                total: Number(result.count || 0),
                totalPages: Math.ceil(Number(result.count || 0) / safeLimit)
            }
        };
    },

    findActivityForAccount({ dgfyAccountId, reference }) {
        return DgfyCustomerActivity.findOne({
            where: {
                dgfy_account_id: dgfyAccountId,
                reference: String(reference || '').trim().toUpperCase()
            }
        }).then(toPlain);
    },

    findActivityByReference(reference) {
        return DgfyCustomerActivity.findOne({
            where: { reference: String(reference || '').trim().toUpperCase() }
        }).then(toPlain);
    },

    async listActivitiesByLookup(lookup, limit = 10) {
        const raw = String(lookup || '').trim();
        const email = normalizeEmail(raw);
        const or = [];
        if (email.includes('@')) or.push({ customer_email: email });
        for (const phone of buildPhoneLookupVariants(raw)) {
            or.push({ customer_phone: phone });
        }
        if (!or.length) return [];
        const rows = await DgfyCustomerActivity.findAll({
            where: { [Op.or]: or },
            order: [['occurred_at', 'DESC'], ['activity_id', 'DESC']],
            limit: Math.max(1, Math.min(Number.parseInt(limit, 10) || 10, 10))
        });
        return rows.map(toPlain);
    },

    async listAddresses(dgfyAccountId) {
        const rows = await DgfyCustomerAddress.findAll({
            where: { dgfy_account_id: dgfyAccountId },
            order: [['is_default', 'DESC'], ['address_id', 'ASC']]
        });
        return rows.map(toPlain);
    },

    async createAddress(dgfyAccountId, payload = {}) {
        if (payload.is_default === true) {
            await DgfyCustomerAddress.update({ is_default: false }, { where: { dgfy_account_id: dgfyAccountId } });
        }
        const existingCount = await DgfyCustomerAddress.count({ where: { dgfy_account_id: dgfyAccountId } });
        const row = await DgfyCustomerAddress.create({
            dgfy_account_id: dgfyAccountId,
            label: payload.label || 'Address',
            address_line: payload.address_line,
            latitude: payload.latitude ?? null,
            longitude: payload.longitude ?? null,
            is_default: payload.is_default === true || existingCount === 0
        });
        return toPlain(row);
    },

    async updateAddress(dgfyAccountId, addressId, payload = {}) {
        const row = await DgfyCustomerAddress.findOne({
            where: { dgfy_account_id: dgfyAccountId, address_id: addressId }
        });
        if (!row) return null;
        if (payload.is_default === true) {
            await DgfyCustomerAddress.update({ is_default: false }, { where: { dgfy_account_id: dgfyAccountId } });
        }
        await row.update(payload);
        return toPlain(await row.reload());
    },

    async deleteAddress(dgfyAccountId, addressId) {
        const row = await DgfyCustomerAddress.findOne({
            where: { dgfy_account_id: dgfyAccountId, address_id: addressId }
        });
        if (!row) return false;
        const wasDefault = row.is_default === true;
        await row.destroy();
        if (wasDefault) {
            const next = await DgfyCustomerAddress.findOne({
                where: { dgfy_account_id: dgfyAccountId },
                order: [['address_id', 'ASC']]
            });
            if (next) await next.update({ is_default: true });
        }
        return true;
    },

    async listLoyalty(dgfyAccountId, limit = 50) {
        const where = { dgfy_account_id: dgfyAccountId };
        const [rows, balance] = await Promise.all([
            DgfyLoyaltyTransaction.findAll({
                where,
                order: [['created_at', 'DESC']],
                limit: Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 100))
            }),
            DgfyLoyaltyTransaction.sum('points_delta', { where })
        ]);
        const transactions = rows.map(toPlain);
        return { balance: Number(balance || 0), transactions };
    },

    async findRecentRecoveryCode({ lookupHash, cooldownSeconds = 60 }) {
        const since = new Date(Date.now() - Math.max(1, Number(cooldownSeconds || 60)) * 1000);
        const row = await DgfyTrackingRecoveryCode.findOne({
            where: {
                lookup_hash: lookupHash,
                consumed_at: null,
                created_at: { [Op.gt]: since }
            },
            order: [['created_at', 'DESC']],
        });
        return toPlain(row);
    },

    async createLoyaltyIfMissing({ dgfyAccountId, tenantId, activityId, reference, pointsDelta, reason }) {
        if (!dgfyAccountId || !activityId || !Number.isInteger(pointsDelta) || pointsDelta === 0) return null;
        const [row] = await DgfyLoyaltyTransaction.findOrCreate({
            where: {
                dgfy_account_id: dgfyAccountId,
                activity_id: activityId,
                reason: reason || 'completed_order'
            },
            defaults: {
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenantId || null,
                activity_id: activityId,
                reference,
                points_delta: pointsDelta,
                reason: reason || 'completed_order'
            }
        });
        return toPlain(row);
    },

    async createReview(payload = {}) {
        const row = await DgfyCustomerReview.create(payload);
        return toPlain(row);
    },

    async listPublicReviews({ tenantId, itemId = null, targetType = null, targetId = null, limit = 20 } = {}) {
        const where = { status: 'approved' };
        if (tenantId) where.tenant_id = tenantId;
        if (itemId) where.item_id = Number.parseInt(itemId, 10);
        if (targetType) where.target_type = targetType;
        if (targetId) where.target_id = Number.parseInt(targetId, 10);
        if (!where.tenant_id && !where.item_id && !where.target_type) return { rows: [], summary: { average_rating: null, total_count: 0 } };

        const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 20, 50));
        const [rows, allRows] = await Promise.all([
            DgfyCustomerReview.findAll({
                where,
                order: [['submitted_at', 'DESC'], ['review_id', 'DESC']],
                limit: safeLimit
            }),
            DgfyCustomerReview.findAll({
                where,
                attributes: ['rating']
            })
        ]);
        const ratings = allRows.map((row) => Number(row.rating || 0)).filter((rating) => rating > 0);
        const average = ratings.length
            ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 100) / 100
            : null;
        return {
            rows: rows.map(toPlain),
            summary: {
                average_rating: average,
                total_count: ratings.length
            }
        };
    },

    async listReviewsForModeration({ status = 'pending', tenantId = null, targetType = null, limit = 50, page = 1 } = {}) {
        const where = {};
        if (status && status !== 'all') where.status = status;
        if (tenantId) where.tenant_id = tenantId;
        if (targetType) where.target_type = targetType;
        const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 100));
        const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
        const result = await DgfyCustomerReview.findAndCountAll({
            where,
            order: [['submitted_at', 'DESC'], ['review_id', 'DESC']],
            limit: safeLimit,
            offset: (safePage - 1) * safeLimit
        });
        return {
            rows: result.rows.map(toPlain),
            pagination: {
                page: safePage,
                limit: safeLimit,
                total: Number(result.count || 0),
                totalPages: Math.ceil(Number(result.count || 0) / safeLimit)
            }
        };
    },

    async moderateReview({ reviewId, status, reviewedByAdminId = null, note = null } = {}) {
        const row = await DgfyCustomerReview.findByPk(reviewId);
        if (!row) return null;
        await row.update({
            status,
            reviewed_at: new Date(),
            reviewed_by_admin_id: reviewedByAdminId || null,
            review_note: note || null
        });
        return toPlain(await row.reload());
    },

    async findReviewByAccountActivityItem({ dgfyAccountId, activityId, itemId }) {
        const row = await DgfyCustomerReview.findOne({
            where: {
                dgfy_account_id: dgfyAccountId,
                activity_id: activityId,
                item_id: itemId
            }
        });
        return toPlain(row);
    },

    async findReviewByAccountActivityTarget({ dgfyAccountId, activityId, targetType, targetId }) {
        const row = await DgfyCustomerReview.findOne({
            where: {
                dgfy_account_id: dgfyAccountId,
                activity_id: activityId,
                target_type: targetType,
                target_id: targetId
            }
        });
        return toPlain(row);
    },

    async createRecoveryCode(payload = {}) {
        const row = await DgfyTrackingRecoveryCode.create(payload);
        return toPlain(row);
    },

    async consumePendingRecoveryCode({ lookupHash, codeHash }) {
        const row = await DgfyTrackingRecoveryCode.findOne({
            where: {
                lookup_hash: lookupHash,
                consumed_at: null,
                expires_at: { [Op.gt]: new Date() }
            },
            order: [['created_at', 'DESC']]
        });
        if (!row) return { status: 'missing' };
        if (row.attempts >= row.max_attempts) {
            await row.update({ consumed_at: new Date() });
            return { status: 'attempts_exceeded' };
        }
        if (row.code_hash !== codeHash) {
            await row.increment('attempts');
            return { status: 'invalid' };
        }
        const [updatedCount] = await DgfyTrackingRecoveryCode.update(
            { consumed_at: new Date() },
            { where: { recovery_id: row.recovery_id, consumed_at: null } }
        );
        return updatedCount === 1 ? { status: 'verified', recovery: toPlain(row) } : { status: 'missing' };
    }
};

export default dgfyCustomerRepository;
