import { Op, fn, col, literal } from 'sequelize';
import { PushDeliveryLog, PushDeviceToken, PushDispatchEvent } from '../../../models/index.js';
import { toPushCorrelationRef, toPushRegistrationRef } from '../../pushDelivery/utils/pushTokenSecurity.js';

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);

const ownerTypeOf = (row) => {
    if (row.dgfy_account_id) return 'account';
    if (row.guest_tenant_id) return 'guest';
    if (row.staff_tenant_id) return 'staff';
    return 'unknown';
};

const iso = (value) => (value ? new Date(value).toISOString() : null);

export const pushDiagnosticsReadRepository = {
    async registrationSummary() {
        const rows = await PushDeviceToken.findAll({
            attributes: [
                'app', 'brand', 'platform',
                [fn('COUNT', col('id')), 'total'],
                [fn('SUM', literal('CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END')), 'active'],
                [fn('SUM', literal('CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END')), 'revoked'],
                [fn('MAX', col('last_seen_at')), 'last_seen_at']
            ],
            group: ['app', 'brand', 'platform'],
            order: [['app', 'ASC'], ['brand', 'ASC'], ['platform', 'ASC']],
            raw: true
        });
        return rows.map((row) => ({
            app: row.app,
            brand: row.brand,
            platform: row.platform,
            total: Number(row.total || 0),
            active: Number(row.active || 0),
            revoked: Number(row.revoked || 0),
            last_seen_at: iso(row.last_seen_at)
        }));
    },

    // The raw token is read only to derive the pseudonymous ref and is dropped before returning.
    async listRegistrations({ app, brand, platform, state = 'all', limit = 50 } = {}) {
        const where = {};
        if (app) where.app = app;
        if (brand) where.brand = brand;
        if (platform) where.platform = platform;
        if (state === 'active') where.revoked_at = null;
        if (state === 'revoked') where.revoked_at = { [Op.ne]: null };
        const rows = await PushDeviceToken.findAll({
            where,
            attributes: [
                'token', 'platform', 'app', 'brand', 'dgfy_account_id', 'guest_tenant_id', 'staff_tenant_id',
                'last_seen_at', 'revoked_at', 'revoke_reason', 'created_at'
            ],
            order: [['last_seen_at', 'DESC']],
            limit
        });
        return rows.map(toPlain).map((row) => ({
            ref: toPushRegistrationRef(row.token),
            owner_type: ownerTypeOf(row),
            app: row.app,
            brand: row.brand,
            platform: row.platform,
            state: row.revoked_at ? 'revoked' : 'active',
            revoke_reason: row.revoke_reason || null,
            last_seen_at: iso(row.last_seen_at),
            created_at: iso(row.created_at)
        }));
    },

    async deliveryStatusCounts(since) {
        const rows = await PushDeliveryLog.findAll({
            attributes: ['purpose', 'status', 'simulated', [fn('COUNT', col('id')), 'count']],
            where: { sent_at: { [Op.gte]: since } },
            group: ['purpose', 'status', 'simulated'],
            raw: true
        });
        return rows.map((row) => ({
            purpose: row.purpose,
            status: row.status,
            simulated: Boolean(row.simulated),
            count: Number(row.count || 0)
        }));
    },

    async dispatchOutcomeCounts(since) {
        const rows = await PushDispatchEvent.findAll({
            attributes: ['purpose', 'outcome', 'reason_code', [fn('COUNT', col('id')), 'count']],
            where: { created_at: { [Op.gte]: since } },
            group: ['purpose', 'outcome', 'reason_code'],
            raw: true
        });
        return rows.map((row) => ({
            purpose: row.purpose,
            outcome: row.outcome,
            reason_code: row.reason_code,
            count: Number(row.count || 0)
        }));
    },

    async listDeliveries({ purpose, status, since, limit = 50 } = {}) {
        const where = { sent_at: { [Op.gte]: since } };
        if (purpose) where.purpose = purpose;
        if (status) where.status = status;
        const rows = await PushDeliveryLog.findAll({
            where,
            attributes: [
                'purpose', 'status', 'simulated', 'ticket_id', 'receipt_status', 'receipt_checked_at',
                'error_code', 'tenant_id', 'reference', 'token_hash', 'sent_at'
            ],
            order: [['sent_at', 'DESC']],
            limit
        });
        return rows.map(toPlain).map((row) => ({
            purpose: row.purpose,
            status: row.status,
            simulated: Boolean(row.simulated),
            ticket_issued: Boolean(row.ticket_id),
            receipt_status: row.receipt_status || null,
            receipt_checked_at: iso(row.receipt_checked_at),
            error_code: row.error_code || null,
            registration_ref: row.token_hash ? String(row.token_hash).slice(0, 12) : null,
            correlation_ref: toPushCorrelationRef(row.tenant_id, row.reference),
            sent_at: iso(row.sent_at)
        }));
    },

    async listDispatchEvents({ purpose, outcome, since, limit = 50 } = {}) {
        const where = { created_at: { [Op.gte]: since } };
        if (purpose) where.purpose = purpose;
        if (outcome) where.outcome = outcome;
        const rows = await PushDispatchEvent.findAll({ where, order: [['created_at', 'DESC']], limit });
        return rows.map(toPlain).map((row) => ({
            purpose: row.purpose,
            outcome: row.outcome,
            reason_code: row.reason_code,
            eligible_token_count: Number(row.eligible_token_count || 0),
            correlation_ref: toPushCorrelationRef(row.tenant_id, row.reference),
            created_at: iso(row.created_at)
        }));
    }
};

export default pushDiagnosticsReadRepository;
