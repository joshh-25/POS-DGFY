import {
    RegistrationIndustry,
    RegistrationIndustryAuditLog,
    sequelize
} from '../../../models/index.js';
import { normalizeRegistrationIndustryNiches } from '../registrationIndustryNiches.js';

const toPlainIndustry = (row) => {
    if (!row) return null;

    const plain = row.get({ plain: true });
    return {
        ...plain,
        niches: normalizeRegistrationIndustryNiches(plain.niches)
    };
};

// The registration module's DB-driven catalog (issue #316): the successor
// to the hardcoded REGISTRATION_INDUSTRIES constant, which is now the seed
// baseline + fail-open fallback (see registrationIndustries.js and ADR
// 0058). Unlike the Phase 39 visibility store this table absorbed (row
// absence there meant "visible"), every offered industry has a row here -
// `hidden` is a column, not a row's mere existence.
export const registrationIndustryRepository = {
    async findAll() {
        const rows = await RegistrationIndustry.findAll({
            order: [['display_order', 'ASC'], ['industry_key', 'ASC']]
        });
        return rows.map(toPlainIndustry);
    },

    async findByKey(industryKey) {
        const row = await RegistrationIndustry.findByPk(industryKey);
        return toPlainIndustry(row);
    },

    async findHiddenKeys() {
        const rows = await RegistrationIndustry.findAll({
            where: { hidden: true },
            attributes: ['industry_key']
        });
        return rows.map((row) => row.industry_key);
    },

    async getMaxDisplayOrder() {
        const max = await RegistrationIndustry.max('display_order');
        return typeof max === 'number' ? max : 0;
    },

    async create({
        industryKey,
        label,
        summary,
        niches,
        workflowMode,
        templateKey,
        displayOrder,
        actorUsername,
        reason
    }) {
        return sequelize.transaction(async (transaction) => {
            const row = await RegistrationIndustry.create({
                industry_key: industryKey,
                label,
                summary,
                niches,
                workflow_mode: workflowMode,
                template_key: templateKey,
                display_order: displayOrder,
                hidden: true,
                hidden_reason: reason,
                is_system: false,
                created_by: actorUsername,
                updated_by: actorUsername
            }, { transaction });

            await RegistrationIndustryAuditLog.create({
                industry_key: industryKey,
                action: 'created',
                actor_username: actorUsername,
                reason,
                before_snapshot: null,
                after_snapshot: JSON.stringify(row.get({ plain: true }))
            }, { transaction });

            return row;
        }).then(toPlainIndustry);
    },

    async updateByKey(industryKey, fields) {
        await RegistrationIndustry.update(fields, { where: { industry_key: industryKey } });
        return this.findByKey(industryKey);
    },

    async createAuditLog({ industryKey, action, actorUsername, reason = null, beforeSnapshot = null, afterSnapshot = null }) {
        return RegistrationIndustryAuditLog.create({
            industry_key: industryKey,
            action,
            actor_username: actorUsername,
            reason,
            before_snapshot: beforeSnapshot,
            after_snapshot: afterSnapshot
        });
    },

    async listAuditLogs(industryKey, { limit = 50 } = {}) {
        const rows = await RegistrationIndustryAuditLog.findAll({
            where: { industry_key: industryKey },
            order: [['created_at', 'DESC']],
            limit: Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200)
        });
        return rows.map((row) => row.get({ plain: true }));
    }
};
