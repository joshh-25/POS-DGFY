import {
    RegistrationIndustryVisibility,
    RegistrationIndustryVisibilityAuditLog
} from '../../../models/index.js';

const toPlainVisibility = (row) => (row ? row.get({ plain: true }) : null);

// The registration module's write path (issue #178 Phase 39): whether a
// registration Industry is offered on merchant-facing signup surfaces. Row
// absence means visible - findAll() only ever returns rows an admin has
// deliberately touched, so callers must treat "no row" as hidden: false.
export const registrationIndustryVisibilityRepository = {
    async findAll() {
        const rows = await RegistrationIndustryVisibility.findAll({ order: [['industry_key', 'ASC']] });
        return rows.map(toPlainVisibility);
    },

    async findHiddenKeys() {
        const rows = await RegistrationIndustryVisibility.findAll({
            where: { hidden: true },
            attributes: ['industry_key']
        });
        return rows.map((row) => row.industry_key);
    },

    async findByKey(industryKey) {
        const row = await RegistrationIndustryVisibility.findByPk(industryKey);
        return toPlainVisibility(row);
    },

    async isHidden(industryKey) {
        const row = await RegistrationIndustryVisibility.findByPk(industryKey, { attributes: ['hidden'] });
        return row ? row.hidden === true : false;
    },

    async upsertVisibility({ industryKey, hidden, reason, actorUsername }) {
        const [row] = await RegistrationIndustryVisibility.upsert({
            industry_key: industryKey,
            hidden,
            reason,
            updated_by: actorUsername
        }, { returning: true });
        // MySQL doesn't support RETURNING - `returning: true` is best-effort
        // there (same fallback shape as posRepository.upsertESalesReport).
        if (row && typeof row.get === 'function') return toPlainVisibility(row);
        return this.findByKey(industryKey);
    },

    async createAuditLog({ industryKey, action, actorUsername, reason = null, beforeSnapshot = null, afterSnapshot = null }) {
        return RegistrationIndustryVisibilityAuditLog.create({
            industry_key: industryKey,
            action,
            actor_username: actorUsername,
            reason,
            before_snapshot: beforeSnapshot,
            after_snapshot: afterSnapshot
        });
    },

    async listAuditLogs(industryKey, { limit = 50 } = {}) {
        const rows = await RegistrationIndustryVisibilityAuditLog.findAll({
            where: { industry_key: industryKey },
            order: [['created_at', 'DESC']],
            limit: Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200)
        });
        return rows.map((row) => row.get({ plain: true }));
    }
};
